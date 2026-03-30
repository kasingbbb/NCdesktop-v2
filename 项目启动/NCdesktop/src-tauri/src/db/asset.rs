use crate::models::{AIAnalysisRow, Asset};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

pub fn insert(conn: &Connection, a: &Asset) -> Result<(), String> {
    conn.execute(
        "INSERT INTO assets (id, project_id, asset_type, name, original_name, file_path, file_size,
         mime_type, captured_at, imported_at, source_type, source_data, is_starred)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![
            a.id,
            a.project_id,
            a.asset_type,
            a.name,
            a.original_name,
            a.file_path,
            a.file_size,
            a.mime_type,
            a.captured_at,
            a.imported_at,
            a.source_type,
            a.source_data,
            a.is_starred as i32,
        ],
    )
    .map_err(|e| format!("插入素材失败: {e}"))?;
    Ok(())
}

const ASSET_SELECT: &str = "SELECT id, project_id, asset_type, name, original_name, file_path, file_size,
             mime_type, captured_at, imported_at, source_type, source_data, is_starred
             FROM assets";

pub fn get_by_project(conn: &Connection, project_id: &str) -> Result<Vec<Asset>, String> {
    let mut stmt = conn
        .prepare(
            &format!(
                "{ASSET_SELECT} WHERE project_id = ?1 ORDER BY imported_at DESC"
            ),
        )
        .map_err(|e| format!("查询素材失败: {e}"))?;

    let rows = stmt
        .query_map(params![project_id], |row| row_to_asset(row))
        .map_err(|e| format!("遍历素材失败: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("读取行失败: {e}"))?);
    }
    Ok(result)
}

/// 当前项目中打了指定标签的素材
pub fn get_by_project_and_tag(
    conn: &Connection,
    project_id: &str,
    tag_id: &str,
) -> Result<Vec<Asset>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.project_id, a.asset_type, a.name, a.original_name, a.file_path, a.file_size,
             a.mime_type, a.captured_at, a.imported_at, a.source_type, a.source_data, a.is_starred
             FROM assets a
             INNER JOIN asset_tags at ON a.id = at.asset_id
             WHERE a.project_id = ?1 AND at.tag_id = ?2
             ORDER BY a.imported_at DESC",
        )
        .map_err(|e| format!("按标签查询素材失败: {e}"))?;

    let rows = stmt
        .query_map(params![project_id, tag_id], |row| row_to_asset(row))
        .map_err(|e| format!("遍历素材失败: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("读取行失败: {e}"))?);
    }
    Ok(result)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Asset>, String> {
    conn.query_row(
        &format!("{ASSET_SELECT} WHERE id = ?1"),
        params![id],
        |row| row_to_asset(row),
    )
    .optional()
    .map_err(|e| format!("查询素材失败: {e}"))
}

pub fn update(conn: &Connection, a: &Asset) -> Result<(), String> {
    conn.execute(
        "UPDATE assets SET name=?2, is_starred=?3 WHERE id=?1",
        params![a.id, a.name, a.is_starred as i32],
    )
    .map_err(|e| format!("更新素材失败: {e}"))?;
    Ok(())
}

/// 更新展示名与磁盘路径（如 AI 分类后整理到子目录）
pub fn update_name_and_path(
    conn: &Connection,
    id: &str,
    name: &str,
    file_path: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE assets SET name = ?2, file_path = ?3 WHERE id = ?1",
        params![id, name, file_path],
    )
    .map_err(|e| format!("更新素材路径失败: {e}"))?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM assets WHERE id = ?1", params![id])
        .map_err(|e| format!("删除素材失败: {e}"))?;
    Ok(())
}

pub fn toggle_star(conn: &Connection, id: &str) -> Result<bool, String> {
    let current: i32 = conn
        .query_row(
            "SELECT is_starred FROM assets WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("查询素材星标失败: {e}"))?;

    let new_val = if current == 0 { 1 } else { 0 };
    conn.execute(
        "UPDATE assets SET is_starred = ?2 WHERE id = ?1",
        params![id, new_val],
    )
    .map_err(|e| format!("切换星标失败: {e}"))?;

    Ok(new_val != 0)
}

/// 项目内各素材的标签名列表（用于工作区视图）
pub fn get_tag_names_by_project(
    conn: &Connection,
    project_id: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT at.asset_id, t.name
             FROM asset_tags at
             INNER JOIN tags t ON t.id = at.tag_id
             INNER JOIN assets a ON a.id = at.asset_id AND a.project_id = ?1
             ORDER BY at.asset_id, t.name",
        )
        .map_err(|e| format!("查询素材标签失败: {e}"))?;

    let rows = stmt
        .query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("查询素材标签失败: {e}"))?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (asset_id, tag_name) = row.map_err(|e| format!("读取行失败: {e}"))?;
        map.entry(asset_id).or_default().push(tag_name);
    }
    Ok(map)
}

// AI 分析
pub fn upsert_analysis(conn: &Connection, a: &AIAnalysisRow) -> Result<(), String> {
    conn.execute(
        "INSERT INTO ai_analyses (id, asset_id, summary, topics, ocr_text, language, suggested_tags, suggested_name)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(asset_id) DO UPDATE SET
           summary=excluded.summary, topics=excluded.topics, ocr_text=excluded.ocr_text,
           language=excluded.language, suggested_tags=excluded.suggested_tags, suggested_name=excluded.suggested_name",
        params![a.id, a.asset_id, a.summary, a.topics, a.ocr_text, a.language, a.suggested_tags, a.suggested_name],
    )
    .map_err(|e| format!("写入 AI 分析失败: {e}"))?;
    Ok(())
}

pub fn get_analysis(conn: &Connection, asset_id: &str) -> Result<Option<AIAnalysisRow>, String> {
    conn.query_row(
        "SELECT id, asset_id, summary, topics, ocr_text, language, suggested_tags, suggested_name
         FROM ai_analyses WHERE asset_id = ?1",
        params![asset_id],
        |row| {
            Ok(AIAnalysisRow {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                summary: row.get(2)?,
                topics: row.get(3)?,
                ocr_text: row.get(4)?,
                language: row.get(5)?,
                suggested_tags: row.get(6)?,
                suggested_name: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("查询 AI 分析失败: {e}"))
}

fn row_to_asset(row: &rusqlite::Row) -> rusqlite::Result<Asset> {
    let starred: i32 = row.get(12)?;
    Ok(Asset {
        id: row.get(0)?,
        project_id: row.get(1)?,
        asset_type: row.get(2)?,
        name: row.get(3)?,
        original_name: row.get(4)?,
        file_path: row.get(5)?,
        file_size: row.get(6)?,
        mime_type: row.get(7)?,
        captured_at: row.get(8)?,
        imported_at: row.get(9)?,
        source_type: row.get(10)?,
        source_data: row.get(11)?,
        is_starred: starred != 0,
    })
}
