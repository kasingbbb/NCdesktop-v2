use crate::models::Tag;
use rusqlite::{params, Connection, OptionalExtension};

pub fn insert(conn: &Connection, tag: &Tag) -> Result<(), String> {
    conn.execute(
        "INSERT INTO tags (id, name, color, source, usage_count) VALUES (?1,?2,?3,?4,?5)",
        params![tag.id, tag.name, tag.color, tag.source, tag.usage_count],
    )
    .map_err(|e| format!("插入标签失败: {e}"))?;
    Ok(())
}

pub fn get_all(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color, source, usage_count FROM tags ORDER BY usage_count DESC")
        .map_err(|e| format!("查询标签失败: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                source: row.get(3)?,
                usage_count: row.get(4)?,
            })
        })
        .map_err(|e| format!("遍历标签失败: {e}"))?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| format!("读取行失败: {e}"))?);
    }
    Ok(result)
}

pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Tag>, String> {
    conn.query_row(
        "SELECT id, name, color, source, usage_count FROM tags WHERE id = ?1",
        params![id],
        |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                source: row.get(3)?,
                usage_count: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("查询标签失败: {e}"))
}

pub fn get_or_create_by_name(conn: &Connection, name: &str, source: &str) -> Result<Tag, String> {
    if let Some(existing) = conn
        .query_row(
            "SELECT id, name, color, source, usage_count FROM tags WHERE name = ?1",
            params![name],
            |row| {
                Ok(Tag {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    source: row.get(3)?,
                    usage_count: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("查询标签失败: {e}"))?
    {
        return Ok(existing);
    }

    let tag = Tag {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        color: "#808080".to_string(),
        source: source.to_string(),
        usage_count: 0,
    };
    insert(conn, &tag)?;
    Ok(tag)
}

fn refresh_tag_usage_count(conn: &Connection, tag_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE tags SET usage_count = (SELECT COUNT(*) FROM asset_tags WHERE tag_id = ?1) + (SELECT COUNT(*) FROM project_tags WHERE tag_id = ?1) WHERE id = ?1",
        params![tag_id],
    )
    .map_err(|e| format!("更新标签计数失败: {e}"))?;
    Ok(())
}

pub fn unlink_from_asset(conn: &Connection, asset_id: &str, tag_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM asset_tags WHERE asset_id = ?1 AND tag_id = ?2",
        params![asset_id, tag_id],
    )
    .map_err(|e| format!("解除素材标签失败: {e}"))?;
    refresh_tag_usage_count(conn, tag_id)?;
    Ok(())
}

pub fn link_to_asset(conn: &Connection, asset_id: &str, tag_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?1, ?2)",
        params![asset_id, tag_id],
    )
    .map_err(|e| format!("关联素材标签失败: {e}"))?;

    refresh_tag_usage_count(conn, tag_id)?;

    Ok(())
}

pub fn link_to_project(conn: &Connection, project_id: &str, tag_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?1, ?2)",
        params![project_id, tag_id],
    )
    .map_err(|e| format!("关联项目标签失败: {e}"))?;

    refresh_tag_usage_count(conn, tag_id)?;

    Ok(())
}

pub fn get_tags_for_asset(conn: &Connection, asset_id: &str) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, t.color, t.source, t.usage_count
             FROM tags t INNER JOIN asset_tags at ON t.id = at.tag_id
             WHERE at.asset_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| format!("查询素材标签失败: {e}"))?;

    let rows = stmt
        .query_map(params![asset_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                source: row.get(3)?,
                usage_count: row.get(4)?,
            })
        })
        .map_err(|e| format!("遍历标签失败: {e}"))?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r.map_err(|e| format!("读取行失败: {e}"))?);
    }
    Ok(result)
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| format!("删除标签失败: {e}"))?;
    Ok(())
}
