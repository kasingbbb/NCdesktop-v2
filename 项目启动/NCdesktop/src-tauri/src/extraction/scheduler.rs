use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use tauri::{AppHandle, Emitter, Manager};
use crate::db::Database;
use crate::db::extraction as db_ext;
use crate::extraction::extractors::{
    get_extractor_for, get_fallback_extractor_for, get_pdf_scan_extractor,
};
use crate::extraction::models::ExtractOptions;
use uuid::Uuid;

const SETTING_MARKITDOWN_ENABLED: &str = "markitdownEnabled";
const SETTING_MARKITDOWN_PYTHON_CMD: &str = "markitdownPythonCmd";

pub struct PipelineScheduler {
    is_running: Arc<TokioMutex<bool>>,
}

impl PipelineScheduler {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(TokioMutex::new(false)),
        }
    }

    /// 单个素材入队
    pub fn enqueue(app: &AppHandle, asset_id: &str) -> Result<String, String> {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;

        let task_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

        if db_ext::get_extracted_content(&conn, asset_id)?.is_none() {
            db_ext::insert_extracted_content(&conn, &db_ext::ExtractedContentRow {
                id: Uuid::new_v4().to_string(),
                asset_id: asset_id.to_string(),
                status: "pending".to_string(),
                error_message: None,
                retry_count: 0,
                raw_text: None,
                structured_md: None,
                quality_level: 0,
                extractor_type: String::new(),
                segments_json: None,
                created_at: now.clone(),
                updated_at: now.clone(),
            })?;
        }

        let task = db_ext::PipelineTaskRow {
            id: task_id.clone(),
            asset_id: asset_id.to_string(),
            task_type: "extract".to_string(),
            status: "queued".to_string(),
            retry_count: 0,
            max_retries: 3,
            error_message: None,
            priority: 100,
            batch_id: None,
            created_at: now,
            started_at: None,
            completed_at: None,
        };

        match db_ext::insert_pipeline_task(&conn, &task) {
            Ok(_) => {},
            Err(e) if e.contains("UNIQUE constraint") => {
                return Ok("already_queued".to_string());
            },
            Err(e) => return Err(e),
        }

        Ok(task_id)
    }

    /// 批量入队
    pub fn enqueue_batch(app: &AppHandle, asset_ids: &[String]) -> Result<String, String> {
        let batch_id = Uuid::new_v4().to_string();
        for asset_id in asset_ids {
            Self::enqueue(app, asset_id)?;
        }
        Ok(batch_id)
    }

    /// 启动后台执行循环（幂等：已在运行时直接返回）
    pub fn start(&self, app: AppHandle) {
        let is_running = self.is_running.clone();

        tokio::spawn(async move {
            // 幂等检查：已有调度循环时直接退出
            {
                let mut guard = is_running.lock().await;
                if *guard {
                    return;
                }
                *guard = true;
            }

            loop {
                // ─── 1. 取下一个待处理任务（sync 辅助函数，不跨 await 持有 MutexGuard）
                let next_task = match db_get_next_task(&app) {
                    Ok(t) => t,
                    Err(e) => {
                        log::error!("调度器：{e}，退出调度循环");
                        break;
                    }
                };

                let Some(task) = next_task else {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

                    let has_tasks = match db_has_queued_tasks(&app) {
                        Ok(v) => v,
                        Err(e) => {
                            log::error!("调度器：{e}，退出调度循环");
                            break;
                        }
                    };

                    if !has_tasks {
                        break;
                    }
                    continue;
                };

                // ─── 2. 标记任务为运行中
                db_mark_task_running(&app, &task.id, &task.asset_id);

                let _ = app.emit("extraction:progress", serde_json::json!({
                    "assetId": task.asset_id,
                    "status": "extracting",
                    "message": "正在提取..."
                }));

                // ─── 3. 取素材信息
                let asset_info = db_get_asset(&app, &task.asset_id);

                let Some(asset) = asset_info else {
                    db_mark_task_status(&app, &task.id, &task.asset_id, "failed", "素材不存在");
                    continue;
                };

                // ─── 4. 查找合适的提取器
                let options = db_get_extract_options(&app).unwrap_or_default();
                let extractor = get_extractor_for(&asset.mime_type, &options);
                let Some(extractor) = extractor else {
                    db_mark_task_status(&app, &task.id, &task.asset_id, "unsupported", "");
                    if source_asset_should_materialize(&asset) {
                        if source_asset_is_markdown(&asset) {
                            materialize_source_markdown(&app, &asset);
                        } else {
                            materialize_placeholder(
                                &app,
                                &asset,
                                "unsupported",
                                &format!("无可用提取器（mime: {}）", asset.mime_type),
                            );
                        }
                    }
                    continue;
                };

                // ─── 5. 执行提取（CPU 密集型，放入 spawn_blocking 避免阻塞 tokio）
                let file_path = asset.file_path.clone();
                let primary_name = extractor.name().to_string();
                let primary_options = options.clone();
                let result = tokio::task::spawn_blocking(move || {
                    extractor.extract(std::path::Path::new(&file_path), &primary_options)
                }).await;

                match result {
                    Ok(Ok(extraction_result)) => {
                        let final_result = if extraction_result.needs_ocr_fallback {
                            let _ = app.emit("extraction:progress", serde_json::json!({
                                "assetId": task.asset_id,
                                "status": "ocr_fallback",
                                "message": "文字提取为空，切换为扫描 OCR..."
                            }));

                            let fallback_path = asset.file_path.clone();
                            let fallback_opts = options.clone();
                            let fallback = tokio::task::spawn_blocking(move || {
                                let extractor = get_pdf_scan_extractor();
                                extractor.extract(std::path::Path::new(&fallback_path), &fallback_opts)
                            }).await;

                            match fallback {
                                Ok(Ok(scan_result)) => scan_result,
                                Ok(Err(_)) | Err(_) => extraction_result,
                            }
                        } else {
                            extraction_result
                        };

                        let segments_json = serde_json::to_string(&final_result.segments).ok();

                        db_save_extraction_result(
                            &app,
                            &task.asset_id,
                            &task.id,
                            &final_result.raw_text,
                            &final_result.structured_md,
                            final_result.quality_level,
                            &final_result.extractor_type,
                            segments_json.as_deref(),
                        );

                        let _ = app.emit("extraction:completed", serde_json::json!({
                            "assetId": task.asset_id,
                            "qualityLevel": final_result.quality_level,
                            "extractorType": final_result.extractor_type,
                        }));

                        if source_asset_should_materialize(&asset) {
                            if final_result.quality_level >= 1
                                && !final_result.structured_md.is_empty()
                            {
                                materialize_md(
                                    &app,
                                    &asset,
                                    &final_result.structured_md,
                                    final_result.quality_level,
                                    &final_result.extractor_type,
                                );
                            } else if source_asset_is_markdown(&asset) {
                                materialize_source_markdown(&app, &asset);
                            } else {
                                materialize_placeholder(
                                    &app,
                                    &asset,
                                    "empty_extract",
                                    "提取成功但结构化内容为空",
                                );
                            }
                        }
                    },
                    Ok(Err(err)) => {
                        let mut recovered = None;
                        if primary_name == "markitdown" {
                            let _ = app.emit("extraction:progress", serde_json::json!({
                                "assetId": task.asset_id,
                                "status": "extracting",
                                "message": "MarkItDown 失败，回退到内置提取器..."
                            }));
                            if let Some(fallback_extractor) = get_fallback_extractor_for(&asset.mime_type) {
                                let fallback_path = asset.file_path.clone();
                                let fallback_opts = options.clone();
                                let fallback_result = tokio::task::spawn_blocking(move || {
                                    fallback_extractor.extract(
                                        std::path::Path::new(&fallback_path),
                                        &fallback_opts,
                                    )
                                }).await;
                                recovered = match fallback_result {
                                    Ok(Ok(result)) => Some(result),
                                    Ok(Err(fallback_err)) => {
                                        log::warn!(
                                            "MarkItDown 回退内置提取器失败（{}）: {}",
                                            asset.id,
                                            fallback_err
                                        );
                                        None
                                    }
                                    Err(join_err) => {
                                        log::warn!(
                                            "MarkItDown 回退任务异常（{}）: {}",
                                            asset.id,
                                            join_err
                                        );
                                        None
                                    }
                                };
                            }
                        }

                        if let Some(final_result) = recovered {
                            let final_result = if final_result.needs_ocr_fallback {
                                let _ = app.emit("extraction:progress", serde_json::json!({
                                    "assetId": task.asset_id,
                                    "status": "ocr_fallback",
                                    "message": "回退提取为空，切换为扫描 OCR..."
                                }));
                                let fallback_path = asset.file_path.clone();
                                let fallback_opts = options.clone();
                                let fallback = tokio::task::spawn_blocking(move || {
                                    let extractor = get_pdf_scan_extractor();
                                    extractor.extract(std::path::Path::new(&fallback_path), &fallback_opts)
                                }).await;
                                match fallback {
                                    Ok(Ok(scan_result)) => scan_result,
                                    Ok(Err(_)) | Err(_) => final_result,
                                }
                            } else {
                                final_result
                            };

                            let segments_json = serde_json::to_string(&final_result.segments).ok();
                            db_save_extraction_result(
                                &app,
                                &task.asset_id,
                                &task.id,
                                &final_result.raw_text,
                                &final_result.structured_md,
                                final_result.quality_level,
                                &final_result.extractor_type,
                                segments_json.as_deref(),
                            );

                            let _ = app.emit("extraction:completed", serde_json::json!({
                                "assetId": task.asset_id,
                                "qualityLevel": final_result.quality_level,
                                "extractorType": final_result.extractor_type,
                            }));

                            if source_asset_should_materialize(&asset) {
                                if final_result.quality_level >= 1
                                    && !final_result.structured_md.is_empty()
                                {
                                    materialize_md(
                                        &app,
                                        &asset,
                                        &final_result.structured_md,
                                        final_result.quality_level,
                                        &final_result.extractor_type,
                                    );
                                } else if source_asset_is_markdown(&asset) {
                                    materialize_source_markdown(&app, &asset);
                                } else {
                                    materialize_placeholder(
                                        &app,
                                        &asset,
                                        "empty_extract",
                                        "回退提取成功但结构化内容为空",
                                    );
                                }
                            }
                        } else {
                            let error_msg = err.to_string();
                            let is_terminal = task.retry_count + 1 >= task.max_retries;
                            db_handle_task_error(
                                &app, &task.id, &task.asset_id,
                                task.retry_count, task.max_retries,
                                &error_msg,
                            );

                            let _ = app.emit("extraction:failed", serde_json::json!({
                                "assetId": task.asset_id,
                                "errorMessage": error_msg,
                                "retryCount": task.retry_count + 1,
                            }));

                            if is_terminal && source_asset_should_materialize(&asset) {
                                materialize_placeholder(
                                    &app, &asset, "extract_failed", &error_msg,
                                );
                            }
                        }
                    },
                    Err(e) => {
                        let error_msg = format!("提取任务 panic: {e}");
                        log::error!("{error_msg}");
                        let is_terminal = task.retry_count + 1 >= task.max_retries;
                        db_handle_task_error(
                            &app, &task.id, &task.asset_id,
                            task.retry_count, task.max_retries,
                            &error_msg,
                        );
                        if is_terminal && source_asset_should_materialize(&asset) {
                            materialize_placeholder(
                                &app, &asset, "extract_panic", &error_msg,
                            );
                        }
                    },
                }
            }

            // 退出循环时重置运行标志，以便下次调用 start() 能重新启动
            let mut guard = is_running.lock().await;
            *guard = false;
        });
    }

    /// 启动恢复：重置 running 状态的任务为 queued
    pub fn recover(app: &AppHandle) -> Result<u64, String> {
        let db = app.state::<Database>();
        let conn = db.conn.lock().map_err(|e| format!("DB 锁失败: {e}"))?;
        db_ext::reset_running_tasks(&conn)
    }
}

// ─── 同步 DB 辅助函数（不跨 await，MutexGuard 不需要 Send）────────────────────

fn db_get_next_task(app: &AppHandle) -> Result<Option<db_ext::PipelineTaskRow>, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| format!("DB 锁失败（取任务）: {e}"))?;
    Ok(db_ext::get_queued_tasks(&conn, 1)
        .unwrap_or_default()
        .into_iter()
        .next())
}

fn db_has_queued_tasks(app: &AppHandle) -> Result<bool, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| format!("DB 锁失败（统计）: {e}"))?;
    let stats = db_ext::get_pipeline_stats(&conn).unwrap_or_else(|_| db_ext::PipelineStats {
        queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0,
    });
    Ok(stats.queued > 0)
}

fn db_mark_task_running(app: &AppHandle, task_id: &str, asset_id: &str) {
    let db = app.state::<Database>();
    if let Ok(conn) = db.conn.lock() {
        let _ = db_ext::update_task_status(&conn, task_id, "running", None);
        let _ = db_ext::update_extraction_status(&conn, asset_id, "extracting", None);
    };
}

fn db_get_asset(app: &AppHandle, asset_id: &str) -> Option<crate::models::Asset> {
    let db = app.state::<Database>();
    // 存入变量使临时值（Result<MutexGuard, _>）在此处析构，早于 db 析构
    let result = match db.conn.lock() {
        Ok(conn) => crate::db::asset::get_by_id(&conn, asset_id).unwrap_or(None),
        Err(e) => {
            log::error!("调度器：DB 锁失败（取素材）: {e}");
            None
        }
    };
    result
}

fn db_get_extract_options(app: &AppHandle) -> Result<ExtractOptions, String> {
    let db = app.state::<Database>();
    let conn = db.conn.lock().map_err(|e| format!("DB 锁失败（读取提取配置）: {e}"))?;

    let markitdown_enabled = crate::db::settings::get(&conn, SETTING_MARKITDOWN_ENABLED)?
        .map(|v| {
            let trimmed = v.trim().trim_matches('"').to_ascii_lowercase();
            !matches!(trimmed.as_str(), "false" | "0" | "off")
        })
        .unwrap_or(true);

    let markitdown_python_cmd = crate::db::settings::get(&conn, SETTING_MARKITDOWN_PYTHON_CMD)?
        .map(|v| v.trim().trim_matches('"').to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| detect_embedded_markitdown_python(app));

    Ok(ExtractOptions {
        markitdown_enabled,
        markitdown_python_cmd,
        ..ExtractOptions::default()
    })
}

fn db_mark_task_status(app: &AppHandle, task_id: &str, asset_id: &str, status: &str, reason: &str) {
    let db = app.state::<Database>();
    if let Ok(conn) = db.conn.lock() {
        let msg = if reason.is_empty() { None } else { Some(reason) };
        if status == "unsupported" {
            let _ = db_ext::update_task_status(&conn, task_id, "completed", None);
            let _ = db_ext::update_extraction_status(&conn, asset_id, "unsupported", None);
        } else {
            let _ = db_ext::update_task_status(&conn, task_id, status, msg);
            let _ = db_ext::update_extraction_status(&conn, asset_id, status, msg);
        }
    };
}

fn db_save_extraction_result(
    app: &AppHandle,
    asset_id: &str,
    task_id: &str,
    raw_text: &str,
    structured_md: &str,
    quality_level: i32,
    extractor_type: &str,
    segments_json: Option<&str>,
) {
    let db = app.state::<Database>();
    if let Ok(conn) = db.conn.lock() {
        let _ = db_ext::update_extraction_result(
            &conn, asset_id, raw_text, structured_md,
            quality_level, extractor_type, segments_json,
        );
        let _ = db_ext::update_task_status(&conn, task_id, "completed", None);
    } else {
        log::error!("调度器：DB 锁失败（写提取结果）: 素材 {asset_id}");
    };
}

fn db_handle_task_error(
    app: &AppHandle,
    task_id: &str,
    asset_id: &str,
    retry_count: i32,
    max_retries: i32,
    error_msg: &str,
) {
    let db = app.state::<Database>();
    if let Ok(conn) = db.conn.lock() {
        let _ = db_ext::update_task_status(&conn, task_id, "failed", Some(error_msg));
        if retry_count + 1 < max_retries {
            let _ = db_ext::update_task_status(&conn, task_id, "queued", Some(error_msg));
        } else {
            let _ = db_ext::update_extraction_status(&conn, asset_id, "failed", Some(error_msg));
        }
    };
}

fn source_asset_should_materialize(asset: &crate::models::Asset) -> bool {
    // E1 F-1: 所有原件（非衍生）都应在工作区产出 .md 邻居
    asset.source_asset_id.is_none()
}

fn source_asset_is_markdown(asset: &crate::models::Asset) -> bool {
    asset.asset_type == "markdown" || asset.mime_type == "text/markdown"
}

fn build_frontmatter(
    source_id: &str,
    version: i32,
    extractor_type: &str,
    quality_level: i32,
) -> String {
    let now = chrono::Utc::now().to_rfc3339();
    format!(
        "---\nsource_asset_id: {}\nderivative_version: {}\nextracted_at: {}\nextractor_type: {}\nquality_level: {}\n---\n\n",
        source_id, version, now, extractor_type, quality_level
    )
}

fn archive_existing_version(
    workspace_dir: &Path,
    source_id: &str,
    version: i32,
    old_path: &str,
) {
    let versions_dir = workspace_dir.join("_versions").join(source_id);
    if let Err(e) = std::fs::create_dir_all(&versions_dir) {
        log::warn!(
            "物化 MD：创建版本目录失败 {}: {}",
            versions_dir.display(),
            e
        );
        return;
    }
    let archive_path = versions_dir.join(format!("v{}.md", version));
    if let Err(e) = std::fs::copy(old_path, &archive_path) {
        log::warn!(
            "物化 MD：归档旧版本失败 {} -> {}: {}",
            old_path,
            archive_path.display(),
            e
        );
    }
}

fn compute_sha256(text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn detect_embedded_markitdown_python(app: &AppHandle) -> Option<String> {
    let resource_dir = app.path().resource_dir().ok()?;
    let candidates = [
        resource_dir.join("markitdown-venv/bin/python"),
        resource_dir.join("markitdown-venv/bin/python3"),
        resource_dir.join("python/bin/python3"),
        resource_dir.join("python/bin/python"),
    ];
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string())
}

// ─────────────────────────────────────────────────────────────────────────────

/// 共享派生 MD 写盘逻辑（E1 F-1/F-2 + E2 F-3/F-4 + E3 F-6）：
/// - 注入 YAML frontmatter
/// - 若已有派生 .md，将旧版本归档到 `_versions/<source_asset_id>/v{N}.md`
/// - 写入 DB 并更新 source/derivative 的 derivative_version 与 content_hash
/// - 失败时仅 warn，不影响原件提取主流程
fn write_derivative_md(
    app: &AppHandle,
    source_asset: &crate::models::Asset,
    md_body: &str,
    quality_level: i32,
    extractor_type: &str,
) {
    let workspace_dir = match crate::workspace::ensure_project_workspace(&source_asset.project_id) {
        Ok(d) => d,
        Err(e) => {
            log::warn!("物化 MD：无法创建工作区目录: {e}");
            return;
        }
    };

    let stem_raw = Path::new(&source_asset.name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("content");
    let stem = crate::utils::safe_name::sanitize_stem(stem_raw);
    let md_display_name = format!("{stem}.md");

    let next_version = source_asset.derivative_version + 1;
    let frontmatter =
        build_frontmatter(&source_asset.id, next_version, extractor_type, quality_level);
    let final_content = format!("{frontmatter}{md_body}");
    let hash = compute_sha256(md_body);
    let now = chrono::Utc::now().to_rfc3339();
    let file_size = final_content.len() as i64;

    let db = app.state::<Database>();
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(e) => {
            log::warn!("物化 MD：DB 锁失败: {e}");
            return;
        }
    };

    let existing = crate::db::asset::find_markdown_derivative(&conn, &source_asset.id)
        .ok()
        .flatten();

    let (derived_id, target_path, is_new) = if let Some(existing) = existing.as_ref() {
        archive_existing_version(
            &workspace_dir,
            &source_asset.id,
            source_asset.derivative_version,
            &existing.file_path,
        );
        (
            existing.id.clone(),
            std::path::PathBuf::from(&existing.file_path),
            false,
        )
    } else {
        let new_id = Uuid::new_v4().to_string();
        let file_name = format!("{new_id}_{stem}.md");
        (new_id, workspace_dir.join(file_name), true)
    };

    if let Err(e) = std::fs::write(&target_path, &final_content) {
        log::warn!("物化 MD：写出文件失败 {}: {e}", target_path.display());
        return;
    }

    if is_new {
        let derived_asset = crate::models::Asset {
            id: derived_id.clone(),
            project_id: source_asset.project_id.clone(),
            asset_type: "markdown".to_string(),
            name: md_display_name.clone(),
            original_name: md_display_name.clone(),
            file_path: target_path.to_string_lossy().to_string(),
            file_size,
            mime_type: "text/markdown".to_string(),
            captured_at: now.clone(),
            imported_at: now.clone(),
            source_type: "converted_from".to_string(),
            source_data: Some(source_asset.id.clone()),
            is_starred: false,
            source_asset_id: Some(source_asset.id.clone()),
            derivative_version: next_version,
        };
        if let Err(e) = crate::db::asset::insert(&conn, &derived_asset) {
            log::warn!("物化 MD：写入衍生 Asset 失败: {e}");
            let _ = std::fs::remove_file(&target_path);
            return;
        }
    } else {
        if let Err(e) = crate::db::asset::update_markdown_derivative(
            &conn,
            &derived_id,
            &md_display_name,
            file_size,
            &now,
        ) {
            log::warn!("物化 MD：更新衍生 Asset 失败 {}: {}", derived_id, e);
            return;
        }
    }

    // 版本号推进
    let _ = crate::db::asset::set_derivative_version(&conn, &derived_id, next_version);
    let _ = crate::db::asset::set_derivative_version(&conn, &source_asset.id, next_version);

    if let Err(e) =
        crate::db::tag::propagate_tags_to_derivative(&conn, &source_asset.id, &derived_id)
    {
        log::warn!(
            "物化 MD：继承标签失败 {} -> {}: {}",
            source_asset.id,
            derived_id,
            e
        );
    }

    let segments_json =
        serde_json::to_string(&crate::extraction::models::markdown_to_segments(md_body)).ok();
    if let Err(e) = crate::db::extraction::upsert_extraction_result(
        &conn,
        &derived_id,
        md_body,
        md_body,
        quality_level,
        extractor_type,
        segments_json.as_deref(),
    ) {
        log::warn!("物化 MD：更新衍生提取内容失败 {}: {}", derived_id, e);
    }

    // content_hash：源件 + 衍生件都写，供 F-8 增量抽取判重
    let _ = crate::db::extraction::set_content_hash(&conn, &derived_id, &hash);
    let _ = crate::db::extraction::set_content_hash(&conn, &source_asset.id, &hash);

    let _ = app.emit(
        "notecapt/asset-converted",
        serde_json::json!({
            "sourceAssetId": source_asset.id,
            "derivedAssetId": derived_id,
            "projectId": source_asset.project_id,
            "derivativeVersion": next_version,
        }),
    );

    // E4 F-7: 物化成功后通知前端/后台触发 library 级增量概念抽取
    // MVP 采用事件驱动：前端监听 `notecapt/concept-extract-requested` 调用
    // `extract_concepts_for_library(force=false)`，F-8 的去重日志确保不会
    // 无限触发重复抽取。
    if let Ok(Some(project)) = crate::db::project::get_by_id(&conn, &source_asset.project_id) {
        let _ = app.emit(
            "notecapt/concept-extract-requested",
            serde_json::json!({
                "libraryId": project.library_id,
                "triggerAssetId": source_asset.id,
                "triggerDerivedAssetId": derived_id,
            }),
        );
    }

    log::info!(
        "物化 MD v{} 完成: {} -> {} ({})",
        next_version,
        source_asset.id,
        derived_id,
        target_path.display()
    );
}

/// 成功路径：抽取结果已落库，将 structured_md 物化到工作区
fn materialize_md(
    app: &AppHandle,
    source_asset: &crate::models::Asset,
    md_body: &str,
    quality_level: i32,
    extractor_type: &str,
) {
    write_derivative_md(app, source_asset, md_body, quality_level, extractor_type);
}

/// 失败/不支持/空白路径：产出占位 .md，保证"每个原件都有工作区 .md 邻居"
fn materialize_placeholder(
    app: &AppHandle,
    source_asset: &crate::models::Asset,
    failure_code: &str,
    reason: &str,
) {
    let body = format!(
        "# {name}\n\n> 此为 NoteCapt 自动生成的工作区占位 Markdown：原件暂时无法抽取为结构化 Markdown。\n\n- **失败代码**: `{code}`\n- **原因**: {reason}\n- **原始文件**: `{path}`\n- **MIME**: `{mime}`\n\n> 你可以手动编辑补充笔记。后续再次抽取成功时，当前版本将被归档到 `_versions/{sid}/v{{N}}.md`。\n",
        name = source_asset.name,
        code = failure_code,
        reason = reason,
        path = source_asset.file_path,
        mime = source_asset.mime_type,
        sid = source_asset.id,
    );
    write_derivative_md(
        app,
        source_asset,
        &body,
        0,
        &format!("placeholder_{failure_code}"),
    );
}

/// .md 原件路径：读取源文件正文 → 注入 frontmatter → 写工作区副本
fn materialize_source_markdown(app: &AppHandle, source_asset: &crate::models::Asset) {
    let body = match std::fs::read_to_string(&source_asset.file_path) {
        Ok(s) => s,
        Err(e) => {
            log::warn!(
                "物化源 MD：读取失败 {}: {e}",
                source_asset.file_path
            );
            materialize_placeholder(
                app,
                source_asset,
                "read_failed",
                &format!("读取源文件失败: {e}"),
            );
            return;
        }
    };
    let quality = crate::extraction::models::evaluate_markdown_quality(&body);
    write_derivative_md(app, source_asset, &body, quality, "source_markdown");
}

