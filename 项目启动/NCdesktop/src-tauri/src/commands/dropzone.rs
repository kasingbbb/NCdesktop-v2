use crate::db::{self, Database};
use crate::llm::client::LLMClient;
use crate::models;
use crate::workspace;
use serde::Serialize;
use std::fs;
use std::io::{self, Read};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

const SETTING_ACTIVE_PROJECT: &str = "ui.active_project_id";

/// 单条拖入导入结果（扁平序列化：与 `Asset` 字段同层，便于前端沿用 `Asset` 类型）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDropCreated {
    #[serde(flatten)]
    pub asset: models::Asset,
    /// LLM 分类与写入 `ai_analyses` 是否成功
    pub ai_classified: bool,
    /// 失败或未配置时的说明；成功一般为 `None`
    pub ai_note: Option<String>,
    /// `true` 表示已提交后台任务，前端可显示「分析中」
    #[serde(default)]
    pub ai_pending: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDropSummary {
    pub created: Vec<ImportDropCreated>,
    pub failures: Vec<String>,
    /// 本次导入落库的项目名称（便于悬浮窗提示用户去主页哪里找）
    pub import_project_name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportDropFinishedPayload {
    project_id: String,
    import_project_name: String,
}

fn resolve_import_project_id(conn: &rusqlite::Connection) -> Result<String, String> {
    match db::settings::get(conn, SETTING_ACTIVE_PROJECT)? {
        Some(pid) if !pid.is_empty() => {
            if db::project::get_by_id(conn, &pid)?.is_some() {
                return Ok(pid);
            }
        }
        _ => {}
    }

    let libraries = db::library::get_all(conn)?;
    for lib in libraries {
        let projects = db::project::get_by_library(conn, &lib.id)?;
        if let Some(p) = projects.first() {
            return Ok(p.id.clone());
        }
    }

    Err("没有可用的项目：请先在主窗口创建或选中一个项目".to_string())
}

/// 保证存在可导入目标：优先当前选中/首个项目；否则自动建「默认知识库 + 悬浮窗导入」项目。
fn ensure_import_project_id(conn: &rusqlite::Connection) -> Result<String, String> {
    if let Ok(id) = resolve_import_project_id(conn) {
        return Ok(id);
    }

    let library_id = match db::library::get_all(conn)?.first() {
        Some(lib) => lib.id.clone(),
        None => {
            let lib = models::Library {
                id: uuid::Uuid::new_v4().to_string(),
                name: "默认知识库".to_string(),
                root_path: String::new(),
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            db::library::insert(conn, &lib)?;
            lib.id
        }
    };

    let project = if let Some(p) = db::project::get_by_library(conn, &library_id)?.first() {
        p.clone()
    } else {
        let now = chrono::Utc::now().to_rfc3339();
        let p = models::Project {
            id: uuid::Uuid::new_v4().to_string(),
            library_id: library_id.clone(),
            name: "悬浮窗导入".to_string(),
            description: String::new(),
            cover_asset_id: None,
            source_type: "dropzone_auto".to_string(),
            source_data: None,
            is_pinned: false,
            is_archived: false,
            created_at: now.clone(),
            updated_at: now,
            total_duration: None,
            asset_count: 0,
            word_count: 0,
            imported_at: None,
        };
        db::project::insert(conn, &p)?;
        p
    };

    db::settings::set(conn, SETTING_ACTIVE_PROJECT, &project.id)?;
    Ok(project.id)
}

fn sanitize_path_segment(s: &str) -> String {
    let t: String = s
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_'))
        .take(48)
        .collect();
    if t.is_empty() {
        "other".to_string()
    } else {
        t
    }
}

fn sanitize_file_stem(s: &str) -> String {
    let t: String = s
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '"' | '*' | '?' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(120)
        .collect();
    let t = t.trim().trim_matches('.').to_string();
    if t.is_empty() {
        "file".to_string()
    } else {
        t
    }
}

fn try_rename_or_copy_remove(from: &Path, to: &Path) -> io::Result<()> {
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::CrossesDevices => {
            fs::copy(from, to)?;
            fs::remove_file(from)?;
            Ok(())
        }
        Err(e) => Err(e),
    }
}

/// 将素材移入 `~/Downloads/NoteCaptWorkPlace/<projectId>/organized/<category>/`，并按模型建议重命名（保留 `assetId` 前缀防冲突）
fn organize_asset_file_after_classify(
    asset: &models::Asset,
    r: &crate::llm::classify_parse::ClassifyResult,
) -> Option<(String, String)> {
    let old = Path::new(&asset.file_path);
    if !old.is_file() {
        return None;
    }

    let project_root = match workspace::project_workspace_dir(&asset.project_id) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("AI 整理：无法解析工作区目录: {e}");
            return None;
        }
    };
    if !old.starts_with(&project_root) {
        log::debug!(
            "AI 整理：跳过（路径不在本项目工作区目录内） {}",
            old.display()
        );
        return None;
    }

    let category_slug = sanitize_path_segment(&r.category);
    if category_slug.is_empty() || category_slug == "other" || category_slug == "none" {
        log::debug!("AI 整理：分类名称无效或为 other，跳过物理整理");
        return None;
    }

    let stem = if !r.suggested_file_name.is_empty() {
        sanitize_file_stem(&r.suggested_file_name)
    } else {
        Path::new(&asset.name)
            .file_stem()
            .and_then(|s| s.to_str())
            .map(sanitize_file_stem)
            .unwrap_or_else(|| "file".to_string())
    };

    let ext = old
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty());

    let organized_dir = project_root.join("organized");
    let new_dir = organized_dir.join(&category_slug);

    if let Err(e) = fs::create_dir_all(&new_dir) {
        log::warn!("AI 整理：创建目录失败 {}: {e}", new_dir.display());
        return None;
    }

    let base_name = match ext {
        Some(e) => format!("{}_{}.{}", asset.id, stem, e),
        None => format!("{}_{}", asset.id, stem),
    };
    let new_path = new_dir.join(&base_name);

    // 检查是否已经是这个路径了
    if new_path == old {
        log::debug!("AI 整理：路径未变化，跳过");
        return None;
    }

    if let Err(e) = try_rename_or_copy_remove(old, &new_path) {
        log::warn!(
            "AI 整理：移动文件失败 {} -> {}: {e}",
            old.display(),
            new_path.display()
        );
        return None;
    }

    let display_name = match ext {
        Some(e) => format!("{stem}.{e}"),
        None => stem,
    };

    Some((new_path.to_string_lossy().to_string(), display_name))
}

/// 当分类为 `other` 等导致未进入 `organized/` 时，仍在项目工作区内将磁盘文件改为 `{assetId}_{建议主名}.ext`，避免仅改库名、磁盘仍为 `uuid_原名`。
fn rename_in_place_when_no_organize(
    asset: &models::Asset,
    r: &crate::llm::classify_parse::ClassifyResult,
) -> Option<(String, String)> {
    if r.suggested_file_name.trim().is_empty() {
        return None;
    }
    let project_root = match workspace::project_workspace_dir(&asset.project_id) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("原地重命名：{}", e);
            return None;
        }
    };
    let old = Path::new(&asset.file_path);
    if !old.is_file() {
        return None;
    }
    if !old.starts_with(&project_root) {
        log::debug!(
            "原地重命名：跳过（不在工作区内） {}",
            old.display()
        );
        return None;
    }

    let stem = sanitize_file_stem(&r.suggested_file_name);
    let ext = old
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty());

    let base_name = match ext {
        Some(e) => format!("{}_{}.{}", asset.id, stem, e),
        None => format!("{}_{}", asset.id, stem),
    };

    let parent = old.parent()?;
    let new_path = parent.join(&base_name);
    if new_path == old {
        return None;
    }
    if new_path.exists() {
        log::warn!(
            "原地重命名：目标已存在，跳过 {}",
            new_path.display()
        );
        return None;
    }

    if let Err(e) = fs::rename(old, &new_path) {
        log::warn!(
            "原地重命名失败 {} -> {}: {e}",
            old.display(),
            new_path.display()
        );
        return None;
    }

    let display_name = match ext {
        Some(e) => format!("{stem}.{e}"),
        None => stem,
    };

    Some((new_path.to_string_lossy().to_string(), display_name))
}

/// 后台任务：对已通过拖放入库的素材执行 LLM 分类并写回 `ai_analyses` / 标签（单独 DB 连接）
async fn apply_llm_classify_to_asset(
    database: &Database,
    asset: &models::Asset,
    classify_input: String,
) -> Result<(), String> {
    let r = crate::commands::llm::llm_classify_with_db(database, classify_input).await?;

    let organized = organize_asset_file_after_classify(asset, &r);
    let had_organize = organized.is_some();
    let in_place = if !had_organize {
        rename_in_place_when_no_organize(asset, &r)
    } else {
        None
    };
    let had_in_place = in_place.is_some();

    let (final_path, final_name) = organized
        .or(in_place)
        .unwrap_or_else(|| (asset.file_path.clone(), asset.name.clone()));

    let suggested_name_row = if !r.suggested_file_name.is_empty() {
        let ext = Path::new(&final_path)
            .extension()
            .and_then(|e| e.to_str())
            .filter(|e| !e.is_empty());
        match ext {
            Some(e) => format!("{}.{}", r.suggested_file_name.trim(), e),
            None => r.suggested_file_name.trim().to_string(),
        }
    } else {
        final_name.clone()
    };

    let ai_row = models::AIAnalysisRow {
        id: uuid::Uuid::new_v4().to_string(),
        asset_id: asset.id.clone(),
        summary: "".to_string(),
        topics: r.category.clone(),
        ocr_text: None,
        language: r.language.clone(),
        suggested_tags: serde_json::to_string(&r.tags).unwrap_or_else(|_| "[]".to_string()),
        suggested_name: suggested_name_row.clone(),
    };

    let conn = database
        .conn
        .lock()
        .map_err(|e| format!("数据库锁获取失败: {e}"))?;

    db::asset::upsert_analysis(&conn, &ai_row)
        .map_err(|e| format!("写入 AI 分析失败: {e}"))?;

    // 无论文件是否移动，都要更新 asset 表中的名称
    // organized：final_name/final_path 为 organized 目标；仅 in_place：磁盘已改名，名称用 suggested_name_row，路径用 final_path
    let (target_name, target_path) = if had_organize {
        (final_name, final_path)
    } else if had_in_place {
        (suggested_name_row, final_path)
    } else {
        (suggested_name_row, asset.file_path.clone())
    };

    db::asset::update_name_and_path(&conn, &asset.id, &target_name, &target_path)
        .map_err(|e| format!("更新素材元数据失败: {e}"))?;

    for tag_name in r.tags {
        let tag_name = tag_name.trim();
        if tag_name.is_empty() {
            continue;
        }
        match db::tag::get_or_create_by_name(&conn, tag_name, "ai") {
            Ok(tag) => {
                if let Err(e) = db::tag::link_to_asset(&conn, &asset.id, &tag.id) {
                    log::warn!(
                        "拖放 AI 标签关联失败（{} -> {}）: {}",
                        asset.name,
                        tag_name,
                        e
                    );
                }
            }
            Err(e) => log::warn!("拖放 AI 标签「{tag_name}」: {e}"),
        }
    }

    Ok(())
}

fn spawn_dropzone_ai_job(app: &AppHandle, asset: models::Asset, classify_input: String) {
    let db_path = match app.path().app_data_dir() {
        Ok(p) => p.join("notecapt.db"),
        Err(e) => {
            log::error!("拖放 AI 后台：无法解析数据目录: {e}");
            return;
        }
    };

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let db = match Database::open(&db_path) {
            Ok(d) => d,
            Err(e) => {
                log::error!("拖放 AI 后台：打开数据库失败: {e}");
                return;
            }
        };
        let id = asset.id.clone();
        let project_id = asset.project_id.clone();
        match apply_llm_classify_to_asset(&db, &asset, classify_input).await {
            Ok(()) => {
                log::info!("拖放 AI 后台分类完成 ({id})");
                // 发送事件通知前端：AI 处理完成
                let _ = app_handle.emit(
                    "notecapt/dropzone-ai-finished",
                    serde_json::json!({
                        "assetId": id,
                        "projectId": project_id,
                    }),
                );
            }
            Err(e) => log::warn!("拖放 AI 后台分类失败 ({id}): {e}"),
        }
    });
}

fn path_asset_meta(path: &Path) -> (String, String, String) {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("未命名")
        .to_string();
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(str::to_lowercase)
        .unwrap_or_default();

    let (asset_type, mime) = match ext.as_str() {
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "png" => ("image", "image/png"),
        "gif" => ("image", "image/gif"),
        "webp" => ("image", "image/webp"),
        "heic" | "heif" => ("image", "image/heic"),
        "pdf" => ("pdf", "application/pdf"),
        "mp3" => ("audio_clip", "audio/mpeg"),
        "wav" => ("audio_clip", "audio/wav"),
        "m4a" | "aac" => ("audio_clip", "audio/mp4"),
        "flac" => ("audio_clip", "audio/flac"),
        "md" | "markdown" => ("markdown", "text/markdown"),
        "txt" => ("markdown", "text/plain"),
        _ => ("other", "application/octet-stream"),
    };

    (asset_type.to_string(), mime.to_string(), name)
}

#[tauri::command]
pub async fn import_drop_paths(
    app: AppHandle,
    database: State<'_, Database>,
    paths: Vec<String>,
) -> Result<ImportDropSummary, String> {
    if paths.is_empty() {
        return Ok(ImportDropSummary {
            created: vec![],
            failures: vec![],
            import_project_name: String::new(),
        });
    }

    // 注意：该命令是 async，不能在 await 期间持有 SQLite 的 MutexGuard
    let (project_id, import_project_name) = {
        let conn = database
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {e}"))?;
        let pid = ensure_import_project_id(&conn)?;
        let pname = db::project::get_by_id(&conn, &pid)?
            .map(|p| p.name)
            .unwrap_or_else(|| "当前项目".to_string());
        (pid, pname)
    };

    let mut created = Vec::new();
    let mut failures = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    let project_asset_dir = workspace::ensure_project_workspace(&project_id)?;
    log::info!(
        "拖入工作区目录: {}",
        project_asset_dir.display()
    );

    for path_str in paths {
        let path = Path::new(&path_str);
        if !path.exists() {
            failures.push(format!("路径不存在: {path_str}"));
            continue;
        }
        if path.is_dir() {
            failures.push(format!("暂不支持导入文件夹: {path_str}"));
            continue;
        }

        let meta = match fs::metadata(path) {
            Ok(m) => m,
            Err(e) => {
                failures.push(format!("无法读取文件: {path_str} — {e}"));
                continue;
            }
        };

        let (asset_type, mime_type, name) = path_asset_meta(path);
        let file_size = meta.len() as i64;

        let asset_id = uuid::Uuid::new_v4().to_string();

        let safe_name = name
            .chars()
            .map(|c| if c == '/' || c == ':' { '_' } else { c })
            .collect::<String>();
        let dest_path = project_asset_dir.join(format!("{}_{}", &asset_id, safe_name));
        if let Err(e) = fs::copy(path, &dest_path) {
            failures.push(format!(
                "复制失败: {} -> {} — {}",
                path_str,
                dest_path.display(),
                e
            ));
            continue;
        }

        let asset = models::Asset {
            id: asset_id.clone(),
            project_id: project_id.clone(),
            asset_type,
            name: name.clone(),
            original_name: name,
            file_path: dest_path.to_string_lossy().to_string(),
            file_size,
            mime_type,
            captured_at: now.clone(),
            imported_at: now.clone(),
            source_type: "dropzone_drag".to_string(),
            source_data: Some(path_str.clone()),
            is_starred: false,
        };

        {
            let conn = database
                .conn
                .lock()
                .map_err(|e| format!("数据库锁获取失败: {e}"))?;
            if let Err(e) = db::asset::insert(&conn, &asset) {
                failures.push(format!("{path_str}: {e}"));
                continue;
            }
        }

        // 轻量 AI 识别：优先读取文本内容（限制大小），否则仅用文件名 + 类型做分类
        let mut classify_input = format!(
            "文件名：{}\nMIME：{}\n资产类型：{}\n",
            asset.name, asset.mime_type, asset.asset_type
        );
        if asset.mime_type.starts_with("text/") || asset.asset_type == "markdown" {
            let mut buf = String::new();
            if let Ok(mut f) = fs::File::open(&dest_path) {
                // 最多读取 32KB，避免大文件拖慢与超 token
                let mut raw = vec![0u8; 32 * 1024];
                if let Ok(n) = f.read(&mut raw) {
                    raw.truncate(n);
                    buf = String::from_utf8_lossy(&raw).to_string();
                }
            }
            if !buf.trim().is_empty() {
                classify_input.push_str("\n内容片段（截断）：\n");
                classify_input.push_str(&buf);
            }
        }

        // AI 分类改为后台异步：此处立即返回，避免阻塞悬浮窗 IPC
        let ai_pending = {
            let conn = database
                .conn
                .lock()
                .map_err(|e| format!("数据库锁获取失败: {e}"))?;
            LLMClient::is_available_in_conn(&conn)
        };

        if ai_pending {
            spawn_dropzone_ai_job(&app, asset.clone(), classify_input);
        }

        created.push(ImportDropCreated {
            asset,
            ai_classified: false,
            ai_note: if ai_pending {
                None
            } else {
                Some("未配置 AI，已跳过自动分类".to_string())
            },
            ai_pending,
        });
    }

    let summary = ImportDropSummary {
        created,
        failures,
        import_project_name: import_project_name.clone(),
    };

    if let Err(e) = app.emit(
        "notecapt/import-drop-finished",
        ImportDropFinishedPayload {
            project_id: project_id.clone(),
            import_project_name,
        },
    ) {
        log::warn!("广播 import-drop-finished 失败: {e}");
    }

    Ok(summary)
}

/// 创建悬浮窗（系统浮动面板级别）
#[tauri::command]
pub async fn create_dropzone_window(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("dropzone").is_some() {
        log::info!("悬浮窗已存在");
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "dropzone", WebviewUrl::App("/dropzone".into()))
        .title("")
        // 默认略大于卡片；用户可拖动标题条移动、拖边角缩放（见前端）
        .inner_size(220.0, 248.0)
        .min_inner_size(140.0, 168.0)
        .max_inner_size(960.0, 1280.0)
        .resizable(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("创建悬浮窗失败: {e}"))?;

    Ok(())
}

/// 关闭悬浮窗
#[tauri::command]
pub async fn close_dropzone_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("dropzone") {
        win.close().map_err(|e| format!("关闭悬浮窗失败: {e}"))?;
    }
    Ok(())
}

/// 显示/隐藏悬浮窗
#[tauri::command]
pub async fn toggle_dropzone_window(app: AppHandle) -> Result<bool, String> {
    if let Some(win) = app.get_webview_window("dropzone") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            win.hide().map_err(|e| format!("隐藏悬浮窗失败: {e}"))?;
        } else {
            win.show().map_err(|e| format!("显示悬浮窗失败: {e}"))?;
        }
        Ok(!visible)
    } else {
        create_dropzone_window(app).await?;
        Ok(true)
    }
}
