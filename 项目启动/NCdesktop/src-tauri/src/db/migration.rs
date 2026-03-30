use rusqlite::Connection;

/// 运行数据库迁移（幂等，用 user_version 做版本管理）
pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    let current_version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("读取 user_version 失败: {e}"))?;

    if current_version < 1 {
        v1_initial(conn)?;
    }

    if current_version < 2 {
        v2_asset_original_name(conn)?;
    }

    Ok(())
}

/// V2：拖入原件显示名（重命名仅改 name，不改 original_name）
fn v2_asset_original_name(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        ALTER TABLE assets ADD COLUMN original_name TEXT NOT NULL DEFAULT '';
        UPDATE assets SET original_name = name WHERE trim(original_name) = '';
        PRAGMA user_version = 2;
        ",
    )
    .map_err(|e| format!("V2 迁移失败: {e}"))?;
    log::info!("数据库迁移 V2 完成：assets.original_name");
    Ok(())
}

/// V1：初始表结构
fn v1_initial(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- 知识库
        CREATE TABLE IF NOT EXISTS libraries (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            root_path   TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- 项目
        CREATE TABLE IF NOT EXISTS projects (
            id              TEXT PRIMARY KEY,
            library_id      TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT '',
            cover_asset_id  TEXT,
            source_type     TEXT NOT NULL DEFAULT 'manual',
            source_data     TEXT,
            is_pinned       INTEGER NOT NULL DEFAULT 0,
            is_archived     INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            total_duration  REAL,
            asset_count     INTEGER NOT NULL DEFAULT 0,
            word_count      INTEGER NOT NULL DEFAULT 0,
            imported_at     TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_projects_library ON projects(library_id);

        -- 素材
        CREATE TABLE IF NOT EXISTS assets (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            asset_type  TEXT NOT NULL,
            name        TEXT NOT NULL,
            file_path   TEXT NOT NULL,
            file_size   INTEGER NOT NULL DEFAULT 0,
            mime_type   TEXT NOT NULL DEFAULT '',
            captured_at TEXT NOT NULL DEFAULT (datetime('now')),
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            source_type TEXT NOT NULL DEFAULT 'manual_import',
            source_data TEXT,
            is_starred  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
        CREATE INDEX IF NOT EXISTS idx_assets_type    ON assets(asset_type);

        -- AI 分析结果
        CREATE TABLE IF NOT EXISTS ai_analyses (
            id              TEXT PRIMARY KEY,
            asset_id        TEXT NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
            summary         TEXT NOT NULL DEFAULT '',
            topics          TEXT NOT NULL DEFAULT '[]',
            ocr_text        TEXT,
            language        TEXT NOT NULL DEFAULT '',
            suggested_tags  TEXT NOT NULL DEFAULT '[]',
            suggested_name  TEXT NOT NULL DEFAULT ''
        );

        -- 标签
        CREATE TABLE IF NOT EXISTS tags (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            color       TEXT NOT NULL DEFAULT '#808080',
            source      TEXT NOT NULL DEFAULT 'user',
            usage_count INTEGER NOT NULL DEFAULT 0
        );

        -- 素材—标签关联
        CREATE TABLE IF NOT EXISTS asset_tags (
            asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
            tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (asset_id, tag_id)
        );

        -- 项目—标签关联
        CREATE TABLE IF NOT EXISTS project_tags (
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (project_id, tag_id)
        );

        -- 时间轴
        CREATE TABLE IF NOT EXISTS timelines (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
            start_time  TEXT NOT NULL DEFAULT (datetime('now')),
            end_time    TEXT NOT NULL DEFAULT (datetime('now')),
            duration    REAL NOT NULL DEFAULT 0
        );

        -- 音频轨道
        CREATE TABLE IF NOT EXISTS audio_tracks (
            id                  TEXT PRIMARY KEY,
            timeline_id         TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
            file_path           TEXT NOT NULL,
            file_name           TEXT NOT NULL,
            format              TEXT NOT NULL DEFAULT 'wav',
            duration            REAL NOT NULL DEFAULT 0,
            sample_rate         INTEGER NOT NULL DEFAULT 44100,
            channels            INTEGER NOT NULL DEFAULT 1,
            waveform_data       TEXT NOT NULL DEFAULT '',
            offset_in_timeline  REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_audio_tracks_timeline ON audio_tracks(timeline_id);

        -- 转录
        CREATE TABLE IF NOT EXISTS transcriptions (
            id              TEXT PRIMARY KEY,
            audio_track_id  TEXT NOT NULL UNIQUE REFERENCES audio_tracks(id) ON DELETE CASCADE,
            language        TEXT NOT NULL DEFAULT 'zh',
            segments_json   TEXT NOT NULL DEFAULT '[]',
            status          TEXT NOT NULL DEFAULT 'pending'
        );

        -- 关键帧
        CREATE TABLE IF NOT EXISTS keyframes (
            id                  TEXT PRIMARY KEY,
            timeline_id         TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
            asset_id            TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
            anchor_time         REAL NOT NULL DEFAULT 0,
            live_audio_clip_id  TEXT,
            source              TEXT NOT NULL DEFAULT 'auto'
        );
        CREATE INDEX IF NOT EXISTS idx_keyframes_timeline ON keyframes(timeline_id);
        CREATE INDEX IF NOT EXISTS idx_keyframes_asset    ON keyframes(asset_id);

        -- 标记
        CREATE TABLE IF NOT EXISTS markers (
            id          TEXT PRIMARY KEY,
            timeline_id TEXT NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
            time        REAL NOT NULL DEFAULT 0,
            label       TEXT NOT NULL DEFAULT '',
            color       TEXT NOT NULL DEFAULT '#FFC000',
            marker_type TEXT NOT NULL DEFAULT 'bookmark'
        );
        CREATE INDEX IF NOT EXISTS idx_markers_timeline ON markers(timeline_id);

        -- 用户笔记
        CREATE TABLE IF NOT EXISTS notes (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            asset_id        TEXT REFERENCES assets(id) ON DELETE SET NULL,
            timeline_time   REAL,
            content         TEXT NOT NULL DEFAULT '',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);

        -- 应用设置 KV 表
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );

        -- FTS5 全文检索虚拟表
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_assets USING fts5(
            name, file_path,
            content='assets', content_rowid='rowid'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_transcriptions USING fts5(
            segments_text,
            content='transcriptions', content_rowid='rowid'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(
            content,
            content='notes', content_rowid='rowid'
        );

        -- FTS 触发器：assets
        CREATE TRIGGER IF NOT EXISTS fts_assets_ai AFTER INSERT ON assets BEGIN
            INSERT INTO fts_assets(rowid, name, file_path) VALUES (new.rowid, new.name, new.file_path);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_assets_ad AFTER DELETE ON assets BEGIN
            INSERT INTO fts_assets(fts_assets, rowid, name, file_path) VALUES ('delete', old.rowid, old.name, old.file_path);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_assets_au AFTER UPDATE ON assets BEGIN
            INSERT INTO fts_assets(fts_assets, rowid, name, file_path) VALUES ('delete', old.rowid, old.name, old.file_path);
            INSERT INTO fts_assets(rowid, name, file_path) VALUES (new.rowid, new.name, new.file_path);
        END;

        -- FTS 触发器：notes
        CREATE TRIGGER IF NOT EXISTS fts_notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO fts_notes(rowid, content) VALUES (new.rowid, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO fts_notes(fts_notes, rowid, content) VALUES ('delete', old.rowid, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_notes_au AFTER UPDATE ON notes BEGIN
            INSERT INTO fts_notes(fts_notes, rowid, content) VALUES ('delete', old.rowid, old.content);
            INSERT INTO fts_notes(rowid, content) VALUES (new.rowid, new.content);
        END;

        PRAGMA user_version = 1;
        ",
    )
    .map_err(|e| format!("V1 迁移失败: {e}"))?;

    log::info!("数据库迁移 V1 完成");
    Ok(())
}
