use crate::db::{self, Database};
use crate::sync::{detector, file_copier, manifest, meta_parser, session_parser, state, timeline_builder, progress};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub cards: Vec<detector::DetectedCard>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub device_name: String,
    pub device_id: String,
    pub sessions: Vec<manifest::SessionSummary>,
    pub new_sessions: Vec<String>,
}

#[tauri::command]
pub fn scan_tf_card() -> Result<ScanResult, String> {
    let cards = detector::scan_volumes();
    Ok(ScanResult { cards })
}

#[tauri::command]
pub fn preview_import(arca_path: String) -> Result<ImportPreview, String> {
    let arca = Path::new(&arca_path);
    let manifest = manifest::parse_manifest(arca)?;

    let app_data = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let state_path = app_data.join("com.notecapt.desktop").join("sync_state.json");
    let sync_state = state::load_state(&state_path);

    let new_sessions: Vec<String> = manifest
        .sessions
        .iter()
        .filter(|s| !state::is_session_synced(&sync_state, &s.session_id, &manifest.device_id))
        .map(|s| s.session_id.clone())
        .collect();

    Ok(ImportPreview {
        device_name: manifest.device_name,
        device_id: manifest.device_id,
        sessions: manifest.sessions,
        new_sessions,
    })
}

#[tauri::command]
pub async fn import_sessions(
    app: AppHandle,
    database: State<'_, Database>,
    arca_path: String,
    session_ids: Vec<String>,
    library_id: String,
) -> Result<Vec<String>, String> {
    let arca = Path::new(&arca_path);
    let manifest = manifest::parse_manifest(arca)?;
    let sessions_dir = arca.join("sessions");

    let app_data = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let base_dir = app_data.join("com.notecapt.desktop");
    let storage_dir = base_dir.join("storage");
    let state_path = base_dir.join("sync_state.json");
    let mut sync_state = state::load_state(&state_path);

    let mut project_ids = Vec::new();
    let total = session_ids.len() as u32;

    for (idx, session_id) in session_ids.iter().enumerate() {
        if state::is_session_synced(&sync_state, session_id, &manifest.device_id) {
            log::info!("会话 {} 已同步，跳过", session_id);
            continue;
        }

        progress::emit_progress(
            &app, session_id, "scanning", idx as u32, total,
            &format!("扫描会话 {session_id}..."),
        );

        let session_dir = sessions_dir.join(session_id);
        if !session_dir.is_dir() {
            log::warn!("会话目录不存在: {}", session_dir.display());
            continue;
        }

        let session = session_parser::parse_session(&session_dir, session_id)?;

        let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;

        let now = chrono::Utc::now().to_rfc3339();
        let project = crate::models::Project {
            id: uuid::Uuid::new_v4().to_string(),
            library_id: library_id.clone(),
            name: session.title.clone(),
            description: format!("从 TF 卡 {} 导入", manifest.device_name),
            cover_asset_id: None,
            source_type: "tf_card".to_string(),
            source_data: Some(serde_json::json!({
                "deviceId": manifest.device_id,
                "sessionId": session_id,
            }).to_string()),
            is_pinned: false,
            is_archived: false,
            created_at: now.clone(),
            updated_at: now.clone(),
            total_duration: None,
            asset_count: 0,
            word_count: 0,
            imported_at: Some(now),
        };
        db::project::insert(&conn, &project)?;

        progress::emit_progress(
            &app, session_id, "copying", idx as u32, total,
            &format!("复制文件..."),
        );

        if let Some(ref audio_path) = session.audio_file_path {
            let _ = file_copier::copy_file(
                Path::new(audio_path), &storage_dir, session_id, "audio",
            );
        }

        let mut local_asset_ids: Vec<(String, String)> = Vec::new();

        let all_assets: Vec<&session_parser::SessionAssetMeta> = session.photos.iter()
            .chain(session.scans.iter())
            .collect();

        for (asset_idx, asset_meta) in all_assets.iter().enumerate() {
            let dest = file_copier::copy_file(
                Path::new(&asset_meta.file_path),
                &storage_dir,
                session_id,
                if session.photos.contains(asset_meta) { "photos" } else { "scans" },
            );

            let local_path = dest
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| asset_meta.file_path.clone());

            let asset_type = if session.photos.iter().any(|p| p.file_name == asset_meta.file_name) {
                "photo"
            } else {
                "scan_text"
            };

            let asset = crate::models::Asset {
                id: uuid::Uuid::new_v4().to_string(),
                project_id: project.id.clone(),
                asset_type: asset_type.to_string(),
                name: asset_meta.file_name.clone(),
                original_name: asset_meta.file_name.clone(),
                file_path: local_path,
                file_size: std::fs::metadata(&asset_meta.file_path).map(|m| m.len() as i64).unwrap_or(0),
                mime_type: guess_mime(&asset_meta.file_name),
                captured_at: asset_meta.captured_at.clone(),
                imported_at: chrono::Utc::now().to_rfc3339(),
                source_type: "tf_card_camera".to_string(),
                source_data: None,
                is_starred: false,
            };
            db::asset::insert(&conn, &asset)?;

            if let Some(meta) = meta_parser::try_parse_meta(&asset_meta.meta_path) {
                let analysis = crate::models::AIAnalysisRow {
                    id: uuid::Uuid::new_v4().to_string(),
                    asset_id: asset.id.clone(),
                    summary: meta.summary.unwrap_or_default(),
                    topics: serde_json::to_string(&meta.topics.unwrap_or_default()).unwrap_or_default(),
                    ocr_text: meta.ocr_text,
                    language: meta.language.unwrap_or_default(),
                    suggested_tags: serde_json::to_string(&meta.suggested_tags.unwrap_or_default()).unwrap_or_default(),
                    suggested_name: meta.suggested_name.unwrap_or_default(),
                };
                db::asset::upsert_analysis(&conn, &analysis)?;
            }

            local_asset_ids.push((asset_meta.file_name.clone(), asset.id.clone()));

            if asset_idx % 5 == 0 {
                progress::emit_progress(
                    &app, session_id, "building", asset_idx as u32, all_assets.len() as u32,
                    &format!("处理素材 {}/{}...", asset_idx + 1, all_assets.len()),
                );
            }
        }

        progress::emit_progress(
            &app, session_id, "building", total, total,
            "构建时间轴...",
        );

        let _ = timeline_builder::build_from_session(
            &conn, &project.id, &session, &local_asset_ids,
        );

        let asset_count = local_asset_ids.len() as i64;
        conn.execute(
            "UPDATE projects SET asset_count = ?2, updated_at = ?3 WHERE id = ?1",
            rusqlite::params![project.id, asset_count, chrono::Utc::now().to_rfc3339()],
        ).map_err(|e| format!("更新项目统计失败: {e}"))?;

        state::mark_synced(&mut sync_state, session_id, &manifest.device_id, &project.id);
        project_ids.push(project.id);

        progress::emit_progress(
            &app, session_id, "done", idx as u32 + 1, total,
            &format!("会话 {session_id} 导入完成"),
        );
    }

    state::save_state(&state_path, &sync_state)?;
    Ok(project_ids)
}

#[tauri::command]
pub fn get_sync_status(arca_path: String) -> Result<Vec<state::SyncedSessionRecord>, String> {
    let app_data = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let state_path = app_data.join("com.notecapt.desktop").join("sync_state.json");
    let sync_state = state::load_state(&state_path);

    let manifest = manifest::parse_manifest(Path::new(&arca_path))?;
    Ok(sync_state
        .synced_sessions
        .into_iter()
        .filter(|r| r.device_id == manifest.device_id)
        .collect())
}

fn guess_mime(file_name: &str) -> String {
    let ext = file_name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "heic" => "image/heic",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "m4a" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        _ => "application/octet-stream",
    }
    .to_string()
}
