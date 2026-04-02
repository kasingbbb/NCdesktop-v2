use crate::db::{self, Database};
use crate::models;
use crate::workspace;
use std::collections::HashMap;
use std::path::Path;
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

/// 移动素材到另一个项目（物理文件 rename + 数据库更新 project_id）
#[tauri::command]
pub fn move_assets(
    database: State<'_, Database>,
    asset_ids: Vec<String>,
    target_project_id: String,
) -> Result<Vec<models::Asset>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;

    // 验证目标项目存在
    db::project::get_by_id(&conn, &target_project_id)
        .ok_or_else(|| format!("目标项目不存在: {target_project_id}"))?;

    let target_dir = workspace::ensure_project_workspace(&target_project_id)?;
    let mut result = Vec::new();

    for asset_id in &asset_ids {
        let asset = db::asset::get_by_id(&conn, asset_id)?
            .ok_or_else(|| format!("素材不存在: {asset_id}"))?;

        // 跳过已在目标项目的素材
        if asset.project_id == target_project_id {
            result.push(asset);
            continue;
        }

        let src = Path::new(&asset.file_path);
        let file_name = src
            .file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", asset.file_path))?;
        let dest = target_dir.join(file_name);

        // 处理文件名冲突
        let dest = unique_path(&dest);

        if src.exists() {
            std::fs::rename(src, &dest).map_err(|e| {
                format!("移动文件失败: {} → {} — {e}", src.display(), dest.display())
            })?;
        }

        let new_path = dest.to_string_lossy().to_string();
        db::asset::update_project_and_path(&conn, asset_id, &target_project_id, &new_path)?;

        let moved = db::asset::get_by_id(&conn, asset_id)?
            .ok_or_else(|| format!("移动后读取素材失败: {asset_id}"))?;
        result.push(moved);
    }

    Ok(result)
}

/// 复制素材到另一个项目（物理文件 copy + 数据库新建记录）
#[tauri::command]
pub fn copy_assets(
    database: State<'_, Database>,
    asset_ids: Vec<String>,
    target_project_id: String,
) -> Result<Vec<models::Asset>, String> {
    let conn = database.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;

    db::project::get_by_id(&conn, &target_project_id)
        .ok_or_else(|| format!("目标项目不存在: {target_project_id}"))?;

    let target_dir = workspace::ensure_project_workspace(&target_project_id)?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut result = Vec::new();

    for asset_id in &asset_ids {
        let asset = db::asset::get_by_id(&conn, asset_id)?
            .ok_or_else(|| format!("素材不存在: {asset_id}"))?;

        let src = Path::new(&asset.file_path);
        let file_name = src
            .file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", asset.file_path))?;
        let dest = target_dir.join(file_name);
        let dest = unique_path(&dest);

        if src.exists() {
            std::fs::copy(src, &dest).map_err(|e| {
                format!("复制文件失败: {} → {} — {e}", src.display(), dest.display())
            })?;
        }

        let new_asset = models::Asset {
            id: uuid::Uuid::new_v4().to_string(),
            project_id: target_project_id.clone(),
            asset_type: asset.asset_type.clone(),
            name: asset.name.clone(),
            original_name: asset.original_name.clone(),
            file_path: dest.to_string_lossy().to_string(),
            file_size: asset.file_size,
            mime_type: asset.mime_type.clone(),
            captured_at: asset.captured_at.clone(),
            imported_at: now.clone(),
            source_type: asset.source_type.clone(),
            source_data: asset.source_data.clone(),
            is_starred: false,
        };

        db::asset::insert(&conn, &new_asset)?;
        result.push(new_asset);
    }

    Ok(result)
}

/// 读取文本文件内容（Markdown / txt）
#[tauri::command]
pub fn get_file_content(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("读取文件失败: {file_path} — {e}"))
}

/// 生成不重复的文件路径：若 dest 已存在则添加 (1), (2)… 后缀
fn unique_path(dest: &Path) -> std::path::PathBuf {
    if !dest.exists() {
        return dest.to_path_buf();
    }
    let stem = dest
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = dest
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let parent = dest.parent().unwrap_or(dest);
    for i in 1..1000 {
        let candidate = parent.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dest.to_path_buf()
}
