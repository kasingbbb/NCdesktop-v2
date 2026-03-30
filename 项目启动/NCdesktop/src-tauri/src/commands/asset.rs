use crate::db::{self, Database};
use crate::models;
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn get_assets(
    database: State<'_, Database>,
    project_id: String,
) -> Result<Vec<models::Asset>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::get_by_project(&conn, &project_id)
}

/// 项目内素材 id → 标签名列表（工作区主题展示）
#[tauri::command]
pub fn get_project_asset_tag_map(
    database: State<'_, Database>,
    project_id: String,
) -> Result<HashMap<String, Vec<String>>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::get_tag_names_by_project(&conn, &project_id)
}

#[tauri::command]
pub fn get_assets_by_tag(
    database: State<'_, Database>,
    project_id: String,
    tag_id: String,
) -> Result<Vec<models::Asset>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::get_by_project_and_tag(&conn, &project_id, &tag_id)
}

#[tauri::command]
pub fn get_asset(
    database: State<'_, Database>,
    id: String,
) -> Result<Option<models::Asset>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::get_by_id(&conn, &id)
}

#[tauri::command]
pub fn create_asset(
    database: State<'_, Database>,
    project_id: String,
    asset_type: String,
    name: String,
    file_path: String,
    file_size: i64,
    mime_type: String,
) -> Result<models::Asset, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    let now = chrono::Utc::now().to_rfc3339();
    let asset = models::Asset {
        id: uuid::Uuid::new_v4().to_string(),
        project_id,
        asset_type,
        name: name.clone(),
        original_name: name,
        file_path,
        file_size,
        mime_type,
        captured_at: now.clone(),
        imported_at: now,
        source_type: "manual_import".to_string(),
        source_data: None,
        is_starred: false,
    };
    db::asset::insert(&conn, &asset)?;
    Ok(asset)
}

#[tauri::command]
pub fn update_asset(
    database: State<'_, Database>,
    asset: models::Asset,
) -> Result<(), String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::update(&conn, &asset)
}

#[tauri::command]
pub fn delete_asset(database: State<'_, Database>, id: String) -> Result<(), String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::delete(&conn, &id)
}

#[tauri::command]
pub fn toggle_asset_star(database: State<'_, Database>, id: String) -> Result<bool, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::toggle_star(&conn, &id)
}

#[tauri::command]
pub fn get_asset_analysis(
    database: State<'_, Database>,
    asset_id: String,
) -> Result<Option<models::AIAnalysisRow>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db::asset::get_analysis(&conn, &asset_id)
}
