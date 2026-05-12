use crate::db::{self, Database};
use crate::models;
use crate::workspace;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
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

fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match Path::new(file_name).extension() {
        Some(e) => (
            Path::new(file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(file_name)
                .to_string(),
            format!(".{}", e.to_string_lossy()),
        ),
        None => (file_name.to_string(), String::new()),
    };
    for i in 1..1000 {
        let candidate = dir.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}.{}{ext}", uuid::Uuid::new_v4()))
}

#[tauri::command]
pub fn move_asset_to_workspace_folder(
    database: State<'_, Database>,
    asset_ids: Vec<String>,
    target_relative_path: String,
    project_id: String,
) -> Result<(), String> {
    let workspace_root = workspace::project_workspace_dir(&project_id)?;
    let target_dir = if target_relative_path == "__ROOT__" {
        workspace_root.clone()
    } else {
        workspace_root.join(&target_relative_path)
    };
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("目标目录创建失败: {e}"))?;

    let workspace_canonical = workspace_root
        .canonicalize()
        .map_err(|e| format!("workspace 根目录规范化失败: {e}"))?;
    let target_canonical = target_dir
        .canonicalize()
        .map_err(|e| format!("目标目录规范化失败: {e}"))?;
    if !target_canonical.starts_with(&workspace_canonical) {
        return Err(format!(
            "目标路径越界：{:?} 不在 workspace {:?} 内",
            target_canonical, workspace_canonical
        ));
    }

    let conn = database
        .conn
        .lock()
        .map_err(|e| format!("数据库锁获取失败: {e}"))?;

    let mut planned: Vec<(String, PathBuf, PathBuf, String)> = Vec::new();
    for id in &asset_ids {
        let asset = db::asset::get_by_id(&conn, id)?
            .ok_or_else(|| format!("素材不存在: {id}"))?;
        let src = PathBuf::from(&asset.file_path);
        if !src.exists() {
            return Err(format!("源文件缺失: {}", asset.file_path));
        }
        let file_name = src
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or_else(|| format!("非法文件名: {}", asset.file_path))?
            .to_string();
        let dest = unique_path(&target_dir, &file_name);
        let new_name = dest
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&file_name)
            .to_string();
        planned.push((asset.id.clone(), src, dest, new_name));
    }

    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (_id, src, dest, _name) in &planned {
        if let Err(e) = fs::rename(src, dest) {
            for (orig, target) in moved.iter().rev() {
                let _ = fs::rename(target, orig);
            }
            return Err(format!("移动失败 {:?} → {:?}: {e}", src, dest, e = e));
        }
        moved.push((src.clone(), dest.clone()));
    }

    for (id, _src, dest, new_name) in &planned {
        let dest_str = dest.to_string_lossy().to_string();
        db::asset::update_name_and_path(&conn, id, new_name, &dest_str)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_drag_icon_path(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    if cfg!(debug_assertions) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("icons")
            .join("32x32.png");
        Ok(path.to_string_lossy().to_string())
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("resource_dir 失败: {e}"))?;
        let path = resource_dir.join("icons").join("32x32.png");
        Ok(path.to_string_lossy().to_string())
    }
}
