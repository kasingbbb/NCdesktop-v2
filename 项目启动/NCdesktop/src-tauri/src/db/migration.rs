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

    if current_version < 4 {
        v4_knowledge_understanding(conn)?;
    }

    if current_version < 5 {
        v5_asset_derivative_columns(conn)?;
    }

    if current_version < 6 {
        v6_conversion_meta(conn)?;
    }

    if current_version < 7 {
        v7_pipeline_tasks(conn)?;
    }

    if current_version < 8 {
        v8_extracted_content(conn)?;
    }

    if current_version < 11 {
        v11_conversion_meta_repair(conn)?;
    }

    if current_version < 12 {
        v12_conversion_meta_failure_code(conn)?;
    }

    if current_version < 13 {
        v13_concepts_base_tables(conn)?;
    }

    if current_version < 14 {
        v14_legacy_unverified_backfill(conn)?;
    }

    Ok(())
}

/// V14（task_014）：对 V12 之前留下的"成功但内容空"的 `conversion_meta` 旧记录
/// 回填 `failure_code = 'legacy_unverified'`，与 `failed`/8 错误码并列。
///
/// 设计依据（Conductor 裁决 2026-05-13）：
/// - `conversion_meta` schema（V6/V11/V12）并无 `status` / `content` 列；
///   "成功 + 空内容"的实际锚点在 `extracted_content`（V8 建）：
///   `status = 'extracted'` 且 `raw_text` 与 `structured_md` 均为空字符串/NULL。
/// - `conversion_meta` 是 append-only 多行日志，仅回填**每个 source_asset_id 的最新一行**
///   （与 task_008 `update_failure_code` "按 asset 最新一行"锚定策略一致），
///   避免污染历史诊断行。
/// - 已经写过 `failure_code`（无论是 8 错误码之一还是其他）的行不覆盖
///   （`failure_code IS NULL` 守卫）。
///
/// 幂等：再次运行时所有可回填行已携带 `failure_code`，UPDATE 影响 0 行。
fn v14_legacy_unverified_backfill(conn: &Connection) -> Result<(), String> {
    // 双重防御：若 conversion_meta 或 extracted_content 尚未在当前 DB 上建表
    // （历史 V9/V10 残留路径，且单测 mock 直接跳到 user_version=10 时也可能命中），
    // 直接跳过 UPDATE，只推进 user_version。这保证 V14 在任何残缺 schema 路径
    // 都是幂等 no-op，不阻塞应用启动。
    let tables_ready: bool = conn
        .query_row(
            "SELECT
                (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='conversion_meta')
              + (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='extracted_content')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n == 2)
        .unwrap_or(false);

    let affected = if !tables_ready {
        log::warn!("V14 跳过 backfill：conversion_meta / extracted_content 未就绪");
        0
    } else {
        conn
        .execute(
            "UPDATE conversion_meta
             SET failure_code = 'legacy_unverified'
             WHERE failure_code IS NULL
               AND id IN (
                 SELECT cm.id
                 FROM conversion_meta cm
                 JOIN extracted_content ec
                   ON ec.asset_id = cm.source_asset_id
                 WHERE ec.status = 'extracted'
                   AND (ec.raw_text       IS NULL OR length(trim(ec.raw_text))      = 0)
                   AND (ec.structured_md  IS NULL OR length(trim(ec.structured_md)) = 0)
                   AND cm.id = (
                     SELECT id FROM conversion_meta
                     WHERE source_asset_id = cm.source_asset_id
                     ORDER BY converted_at DESC LIMIT 1
                   )
               )",
            [],
        )
        .map_err(|e| format!("V14 迁移失败（legacy_unverified 回填）: {e}"))?
    };

    // 可选索引（加速消费侧"过滤掉 legacy_unverified"的查询；幂等）。
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_conversion_meta_failure_code_legacy
            ON conversion_meta(failure_code) WHERE failure_code = 'legacy_unverified';
        PRAGMA user_version = 14;
        ",
    )
    .map_err(|e| format!("V14 迁移失败（建索引/置版本）: {e}"))?;

    log::info!(
        "数据库迁移 V14 完成：legacy_unverified 回填 {} 行（旧版本『成功 + 空内容』记录）",
        affected
    );
    Ok(())
}

/// V13（HOTFIX）：补建 `concepts` 及其三张子表（`concept_viewpoints` /
/// `concept_cases` / `concept_extensions`）。
///
/// 历史遗留：`db/knowledge.rs` 与 `db/co_occurrence.rs` 已落地完整 CRUD，
/// 且 V4 `v4_knowledge_understanding` 的注释明示 `concepts` 应由更早的 V3
/// 建表，但 V3 源码丢失。结果是单测在内存库跑 migration 后访问 `concepts`
/// 报 `no such table: concepts`，掩盖了知识理解链路的真实可用性。
///
/// schema 由 `knowledge.rs::insert_concept` 字段顺序 + `Concept` struct 字面
/// 反推（library_id+name 唯一 = `INSERT OR IGNORE` 的幂等基底）。子表
/// schema 由相应 `INSERT OR IGNORE INTO concept_viewpoints/cases/extensions`
/// SQL 字面反推。FK 在 V4 已声明 `REFERENCES concepts(id)`，V13 之后这些
/// FK 才真正可解析。
///
/// 幂等：`CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`；
/// 对已手动建过 `concepts` 的生产 DB 安全 no-op。
fn v13_concepts_base_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS concepts (
            id                  TEXT PRIMARY KEY,
            library_id          TEXT NOT NULL,
            name                TEXT NOT NULL,
            aliases             TEXT NOT NULL DEFAULT '[]',
            definition          TEXT,
            source_asset_ids    TEXT NOT NULL DEFAULT '[]',
            source_project_ids  TEXT NOT NULL DEFAULT '[]',
            user_edited         INTEGER NOT NULL DEFAULT 0,
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL,
            UNIQUE(library_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_concepts_library_id ON concepts(library_id);

        CREATE TABLE IF NOT EXISTS concept_viewpoints (
            id                TEXT PRIMARY KEY,
            concept_id        TEXT NOT NULL,
            perspective       TEXT NOT NULL,
            summary           TEXT NOT NULL,
            source_context    TEXT,
            source_asset_id   TEXT,
            generated_at      TEXT NOT NULL,
            FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_viewpoints_concept_id
            ON concept_viewpoints(concept_id);

        CREATE TABLE IF NOT EXISTS concept_cases (
            id                TEXT PRIMARY KEY,
            concept_id        TEXT NOT NULL,
            title             TEXT NOT NULL,
            excerpt           TEXT NOT NULL,
            source_asset_id   TEXT,
            source_location   TEXT,
            relevance_note    TEXT,
            FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_cases_concept_id
            ON concept_cases(concept_id);

        CREATE TABLE IF NOT EXISTS concept_extensions (
            id            TEXT PRIMARY KEY,
            concept_id    TEXT NOT NULL,
            direction     TEXT NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            relationship  TEXT,
            FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_extensions_concept_id
            ON concept_extensions(concept_id);

        PRAGMA user_version = 13;
        ",
    )
    .map_err(|e| format!("V13 迁移失败（concepts 基表补建）: {e}"))?;

    log::info!("数据库迁移 V13 完成：concepts/concept_viewpoints/concept_cases/concept_extensions 基表补建");
    Ok(())
}

/// V12（task_008）：`conversion_meta` 追加 `failure_code TEXT NULL` + 索引。
///
/// - 列：8 类 FailureCode + 未来 `legacy_unverified`（task_014 回填）的字符串落地点；
/// - 旧记录初值 NULL（"未判定"），由 task_014 单独 migration 回填 `legacy_unverified`；
/// - 幂等：用 `PRAGMA table_info(conversion_meta)` 守卫（与 V5 同一模式）。
///   `CREATE INDEX IF NOT EXISTS` 天然幂等。
fn v12_conversion_meta_failure_code(conn: &Connection) -> Result<(), String> {
    let existing_cols = list_table_columns(conn, "conversion_meta")?;

    if !existing_cols.iter().any(|c| c == "failure_code") {
        conn.execute_batch(
            "ALTER TABLE conversion_meta ADD COLUMN failure_code TEXT NULL;",
        )
        .map_err(|e| format!("V12 迁移失败（添加 failure_code 列）: {e}"))?;
    }

    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_conversion_meta_failure_code
            ON conversion_meta(failure_code);
        PRAGMA user_version = 12;
        ",
    )
    .map_err(|e| format!("V12 迁移失败（建索引/置版本）: {e}"))?;

    log::info!("数据库迁移 V12 完成：conversion_meta.failure_code + 索引");
    Ok(())
}

/// V11（HOTFIX）：修复历史 V9/V10 残留 —— 旧版本曾存在 V9/V10 迁移，
/// 将 `user_version` 推到 10 后又被删除；导致那一批用户的 DB 上 `user_version = 10`
/// 但 V6 建表的 `conversion_meta` 在他们升级路径中可能因故缺失（线上生产现象：
/// `list_root_assets` 报 `no such table: conversion_meta`）。
///
/// 本迁移采用 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`，
/// 对所有用户都幂等安全：
/// - 当前 user_version ≤ 8 的正常用户：V6 已建过表，V11 仅 no-op 推版本号。
/// - 当前 user_version = 9 / 10 的生产残留用户：本迁移在此真正补建 conversion_meta。
/// - 全新用户：V1..V8 跑完后 V11 no-op 推到 11。
///
/// SQL 与 V6 保持一致（同表结构 / 同三个 `idx_cm_*` 索引）。
fn v11_conversion_meta_repair(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversion_meta (
            id                 TEXT PRIMARY KEY,
            source_asset_id    TEXT NOT NULL,
            derived_asset_id   TEXT,
            converter_name     TEXT NOT NULL,
            converter_version  TEXT NOT NULL DEFAULT 'builtin',
            source_mime        TEXT NOT NULL,
            source_hash        TEXT NOT NULL,
            quality_level      INTEGER NOT NULL DEFAULT 0,
            fallback_used      INTEGER NOT NULL DEFAULT 0,
            error_class        TEXT,
            conversion_ms      INTEGER,
            converted_at       TEXT NOT NULL,
            FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
            FOREIGN KEY (derived_asset_id) REFERENCES assets(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cm_source       ON conversion_meta(source_asset_id);
        CREATE INDEX IF NOT EXISTS idx_cm_derived      ON conversion_meta(derived_asset_id);
        CREATE INDEX IF NOT EXISTS idx_cm_converted_at ON conversion_meta(converted_at);

        PRAGMA user_version = 11;
        ",
    )
    .map_err(|e| format!("V11 迁移失败（conversion_meta 表/索引修复）: {e}"))?;

    log::info!("数据库迁移 V11 完成：conversion_meta 表幂等修复（hotfix V9/V10 残留）");
    Ok(())
}

/// V8：抽取结果表（task_W2-1）。
///
/// `extracted_content` 在生产 schema 中曾被 `db/extraction.rs` 与
/// `extraction/scheduler.rs` 引用，但此前仅存在于单测内存库 DDL（见
/// `commands/extraction.rs::tests::setup_db`），从未在 migration 中建过。
/// 结果是：scheduler 一旦在生产 DB 上写入抽取结果即触发
/// `no such table: extracted_content`。本迁移补齐 DDL，列与
/// `db::extraction::ExtractedContentRow` 及 `insert_extracted_content`
/// 的 SQL 列序保持一致。
fn v8_extracted_content(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS extracted_content (
            id             TEXT PRIMARY KEY,
            asset_id       TEXT NOT NULL,
            status         TEXT NOT NULL,
            error_message  TEXT,
            retry_count    INTEGER NOT NULL DEFAULT 0,
            raw_text       TEXT,
            structured_md  TEXT,
            quality_level  INTEGER NOT NULL DEFAULT 0,
            extractor_type TEXT,
            segments_json  TEXT,
            content_hash   TEXT,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL,
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_extracted_content_asset
            ON extracted_content(asset_id);
        CREATE INDEX IF NOT EXISTS idx_extracted_content_status
            ON extracted_content(status);

        PRAGMA user_version = 8;
        ",
    )
    .map_err(|e| format!("V8 迁移失败（extracted_content 表/索引）: {e}"))?;

    log::info!("数据库迁移 V8 完成：extracted_content 表");
    Ok(())
}

/// V7：抽取管线任务表（task_011 FIX MAJOR）。
///
/// `pipeline_tasks` 在生产 schema 中早已被 `db/extraction.rs` 与 `scheduler.rs`
/// 引用，但此前从未在 migration 中建表 —— 仅单测内存库手工创建。结果 task_011
/// `retrigger_extraction` 的 `UPDATE pipeline_tasks ...` 在生产 DB 上会触发
/// `no such table: pipeline_tasks`。本迁移补齐 DDL。
///
/// 列与 `db::extraction::PipelineTaskRow` 完全对齐（id / asset_id / task_type /
/// status / retry_count / max_retries / error_message / priority / batch_id /
/// created_at / started_at / completed_at）。
///
/// 部分唯一索引 `idx_pipeline_tasks_active_unique` 实现第二道幂等护栏：
/// 同一 asset_id + task_type 在"活动态"（queued / running）下只允许一行，
/// `PipelineScheduler::enqueue` 据此捕获 `UNIQUE constraint` 静默返回
/// `already_queued`。
fn v7_pipeline_tasks(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS pipeline_tasks (
            id             TEXT PRIMARY KEY,
            asset_id       TEXT NOT NULL,
            task_type      TEXT NOT NULL,
            status         TEXT NOT NULL,
            retry_count    INTEGER NOT NULL DEFAULT 0,
            max_retries    INTEGER NOT NULL DEFAULT 3,
            error_message  TEXT,
            priority       INTEGER NOT NULL DEFAULT 100,
            batch_id       TEXT,
            created_at     TEXT NOT NULL,
            started_at     TEXT,
            completed_at   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pipeline_tasks_asset  ON pipeline_tasks(asset_id);
        CREATE INDEX IF NOT EXISTS idx_pipeline_tasks_status ON pipeline_tasks(status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_tasks_active_unique
            ON pipeline_tasks(asset_id, task_type)
            WHERE status IN ('queued', 'running');

        PRAGMA user_version = 7;
        ",
    )
    .map_err(|e| format!("V7 迁移失败（pipeline_tasks 表/索引）: {e}"))?;

    log::info!("数据库迁移 V7 完成：pipeline_tasks 表 + 活动态唯一约束");
    Ok(())
}

/// V6：转换元数据 append-only 日志表（ADR-004）。
///
/// 为同一 source_asset_id × converter_name 显式**不**加唯一约束 ——
/// 每次转换尝试（成功/失败/fallback）都追加一行，用于失败率统计与诊断。
/// 由 task_001_architect §三 ADR-004 / §五.2 确立。
fn v6_conversion_meta(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversion_meta (
            id                 TEXT PRIMARY KEY,
            source_asset_id    TEXT NOT NULL,
            derived_asset_id   TEXT,
            converter_name     TEXT NOT NULL,
            converter_version  TEXT NOT NULL DEFAULT 'builtin',
            source_mime        TEXT NOT NULL,
            source_hash        TEXT NOT NULL,
            quality_level      INTEGER NOT NULL DEFAULT 0,
            fallback_used      INTEGER NOT NULL DEFAULT 0,
            error_class        TEXT,
            conversion_ms      INTEGER,
            converted_at       TEXT NOT NULL,
            FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
            FOREIGN KEY (derived_asset_id) REFERENCES assets(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cm_source       ON conversion_meta(source_asset_id);
        CREATE INDEX IF NOT EXISTS idx_cm_derived      ON conversion_meta(derived_asset_id);
        CREATE INDEX IF NOT EXISTS idx_cm_converted_at ON conversion_meta(converted_at);

        PRAGMA user_version = 6;
        ",
    )
    .map_err(|e| format!("V6 迁移失败（conversion_meta 表/索引）: {e}"))?;

    log::info!("数据库迁移 V6 完成：conversion_meta append-only 日志表");
    Ok(())
}

/// V5：为 `assets` 表追加 markdown 衍生件家族关系列与版本计数列。
///
/// - `source_asset_id`：衍生件指向原件；原件本身为 NULL。
/// - `derivative_version`：source 与 derivative 双写的"成功转换轮次"。
///
/// 由 task_001_architect §五.1 / ADR-001 确立。迁移使用 `PRAGMA table_info(assets)`
/// 守卫，避免在已升级过的库上重跑时报 `duplicate column`（风险登记表 R5）。
fn v5_asset_derivative_columns(conn: &Connection) -> Result<(), String> {
    let existing_cols = list_table_columns(conn, "assets")?;

    if !existing_cols.iter().any(|c| c == "source_asset_id") {
        conn.execute_batch(
            "ALTER TABLE assets ADD COLUMN source_asset_id TEXT DEFAULT NULL;",
        )
        .map_err(|e| format!("V5 迁移失败（添加 source_asset_id 列）: {e}"))?;
    }

    if !existing_cols.iter().any(|c| c == "derivative_version") {
        conn.execute_batch(
            "ALTER TABLE assets ADD COLUMN derivative_version INTEGER NOT NULL DEFAULT 0;",
        )
        .map_err(|e| format!("V5 迁移失败（添加 derivative_version 列）: {e}"))?;
    }

    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_assets_source_asset_id
            ON assets(source_asset_id);
        PRAGMA user_version = 5;
        ",
    )
    .map_err(|e| format!("V5 迁移失败（建索引/置版本）: {e}"))?;

    log::info!("数据库迁移 V5 完成：assets.source_asset_id + derivative_version");
    Ok(())
}

/// 通过 `PRAGMA table_info(<table>)` 取列名集合，用于 ALTER TABLE 守卫。
fn list_table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("读取 {table} 表结构失败: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("读取 {table} 表结构失败: {e}"))?;
    let mut cols = Vec::new();
    for r in rows {
        cols.push(r.map_err(|e| format!("读取 {table} 表列失败: {e}"))?);
    }
    Ok(cols)
}

/// V4：知识理解辅助层（concept_summaries / concept_explanations /
///                     concept_user_notes / concept_relations）
/// V3（concepts 等基表）未在当前源码中存在；V4 仅创建表结构，运行时插入需先建 concepts。
fn v4_knowledge_understanding(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS concept_summaries (
            id TEXT PRIMARY KEY,
            concept_id TEXT NOT NULL,
            summary TEXT NOT NULL,
            source_asset_ids TEXT NOT NULL,
            model TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_summaries_concept_id
            ON concept_summaries(concept_id);

        CREATE TABLE IF NOT EXISTS concept_explanations (
            id TEXT PRIMARY KEY,
            concept_id TEXT NOT NULL,
            mechanism TEXT NOT NULL,
            typical_scenarios TEXT NOT NULL,
            common_misconceptions TEXT,
            essence_sentence TEXT NOT NULL,
            source_asset_ids TEXT NOT NULL,
            model TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_explanations_concept_id
            ON concept_explanations(concept_id);

        CREATE TABLE IF NOT EXISTS concept_user_notes (
            id TEXT PRIMARY KEY,
            concept_id TEXT NOT NULL UNIQUE,
            user_explanation TEXT NOT NULL DEFAULT '',
            mirror_feedback TEXT,
            last_validated_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (concept_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_user_notes_concept_id
            ON concept_user_notes(concept_id);

        CREATE TABLE IF NOT EXISTS concept_relations (
            id TEXT PRIMARY KEY,
            concept_a_id TEXT NOT NULL,
            concept_b_id TEXT NOT NULL,
            relation_type TEXT NOT NULL,
            source_asset_ids TEXT NOT NULL,
            co_occurrence_count INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (concept_a_id) REFERENCES concepts(id) ON DELETE CASCADE,
            FOREIGN KEY (concept_b_id) REFERENCES concepts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_concept_relations_a
            ON concept_relations(concept_a_id);
        CREATE INDEX IF NOT EXISTS idx_concept_relations_b
            ON concept_relations(concept_b_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_relations_pair
            ON concept_relations(concept_a_id, concept_b_id, relation_type);

        PRAGMA user_version = 4;
        ",
    )
    .map_err(|e| format!("V4 迁移失败: {e}"))?;
    log::info!("数据库迁移 V4 完成：知识理解辅助层");
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn user_version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        let mut stmt = conn
            .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1")
            .unwrap();
        stmt.exists([name]).unwrap()
    }

    fn index_exists(conn: &Connection, name: &str) -> bool {
        let mut stmt = conn
            .prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?1")
            .unwrap();
        stmt.exists([name]).unwrap()
    }

    /// 模拟生产残留：user_version=10 但 conversion_meta 缺失。
    /// V11 必须真正补建表 + 三索引并推到 11。
    #[test]
    fn v11_repairs_user_version_10_missing_conversion_meta() {
        let conn = Connection::open_in_memory().unwrap();
        // 仅建一个最小 assets 表满足 FK 引用语义（不强制）；然后人为标到 10。
        conn.execute_batch(
            "
            CREATE TABLE assets (id TEXT PRIMARY KEY);
            PRAGMA user_version = 10;
            ",
        )
        .unwrap();
        assert!(!table_exists(&conn, "conversion_meta"));

        run_migrations(&conn).expect("run_migrations should succeed");

        assert!(table_exists(&conn, "conversion_meta"));
        assert!(index_exists(&conn, "idx_cm_source"));
        assert!(index_exists(&conn, "idx_cm_derived"));
        assert!(index_exists(&conn, "idx_cm_converted_at"));
        // V12+V13+V14 紧随 V11 跑完，把 user_version 推到 14。
        assert_eq!(user_version(&conn), 14);
    }

    /// 全新库：V1..V8 + V11..V14 全跑完。conversion_meta 存在、failure_code 列存在；版本=14。
    #[test]
    fn fresh_db_runs_all_migrations_to_v12() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("fresh migrations succeed");

        assert!(table_exists(&conn, "assets"));
        assert!(table_exists(&conn, "conversion_meta"));
        assert!(table_exists(&conn, "pipeline_tasks"));
        assert!(table_exists(&conn, "extracted_content"));
        let cols = list_table_columns(&conn, "conversion_meta").unwrap();
        assert!(
            cols.iter().any(|c| c == "failure_code"),
            "V12 应已添加 failure_code 列"
        );
        assert!(index_exists(&conn, "idx_conversion_meta_failure_code"));
        assert!(index_exists(&conn, "idx_conversion_meta_failure_code_legacy"));
        assert!(table_exists(&conn, "concepts"));
        assert_eq!(user_version(&conn), 14);
    }

    /// 幂等：连续两次调用 run_migrations 不报错，版本仍为 14。
    /// 关键覆盖：V12 的 ALTER TABLE 路径在第二次跑时被 PRAGMA table_info 守卫跳过，
    /// 不会触发 SQLite "duplicate column" 错误。
    #[test]
    fn run_migrations_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first run succeed");
        run_migrations(&conn).expect("second run should be idempotent");
        assert_eq!(user_version(&conn), 14);
        assert!(table_exists(&conn, "conversion_meta"));
        let cols = list_table_columns(&conn, "conversion_meta").unwrap();
        assert!(cols.iter().any(|c| c == "failure_code"));
    }

    /// V12 专项幂等：在已升到 11 的 DB 上额外手动跑一次 V12 函数仍幂等。
    #[test]
    fn v12_alter_is_idempotent_against_existing_column() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).expect("first run");
        // 二次调用 V12 直接（不经 run_migrations 版本守卫）也必须无错
        super::v12_conversion_meta_failure_code(&conn).expect("v12 second direct call idempotent");
        // 全 migration 跑完后 v14 已把版本推到 14；这里只断言 V12 调用本身不会回退版本。
        assert!(user_version(&conn) >= 12);
    }

    // ============== V14 legacy_unverified backfill 测试 ==============

    /// 测试辅助：在跑完整 migration 的内存库里建一个最小 asset + 一行
    /// conversion_meta + 可选的 extracted_content。返回 conversion_meta.id。
    fn seed_asset_and_meta(
        conn: &Connection,
        asset_id: &str,
        cm_id: &str,
        cm_converted_at: &str,
        cm_failure_code: Option<&str>,
        ec: Option<(&str, Option<&str>, Option<&str>)>, // (ec_status, raw_text, structured_md)
    ) {
        // library / project / asset
        conn.execute_batch(&format!(
            "INSERT OR IGNORE INTO libraries (id, name, root_path) VALUES ('lib1', 'lib', '/tmp/lib');
             INSERT OR IGNORE INTO projects (id, library_id, name) VALUES ('proj1', 'lib1', 'p');
             INSERT INTO assets (id, project_id, asset_type, name, file_path)
                 VALUES ('{aid}', 'proj1', 'document', 'a.pdf', '/tmp/{aid}.pdf');",
            aid = asset_id
        ))
        .unwrap();

        conn.execute(
            "INSERT INTO conversion_meta
                (id, source_asset_id, derived_asset_id, converter_name, converter_version,
                 source_mime, source_hash, quality_level, fallback_used,
                 error_class, conversion_ms, converted_at, failure_code)
             VALUES (?1, ?2, NULL, 'markitdown', '0.0.1', 'application/pdf', 'h',
                     0, 0, NULL, 100, ?3, ?4)",
            rusqlite::params![cm_id, asset_id, cm_converted_at, cm_failure_code],
        )
        .unwrap();

        if let Some((status, raw, md)) = ec {
            let now = "2026-05-01T00:00:00Z";
            conn.execute(
                "INSERT INTO extracted_content
                    (id, asset_id, status, error_message, retry_count, raw_text, structured_md,
                     quality_level, extractor_type, segments_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, NULL, 0, ?4, ?5, 0, NULL, NULL, ?6, ?6)",
                rusqlite::params![
                    format!("ec_{}", asset_id),
                    asset_id,
                    status,
                    raw,
                    md,
                    now
                ],
            )
            .unwrap();
        }
    }

    fn fc_for(conn: &Connection, cm_id: &str) -> Option<String> {
        conn.query_row(
            "SELECT failure_code FROM conversion_meta WHERE id = ?1",
            rusqlite::params![cm_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .unwrap()
    }

    /// V14-A：status='extracted' 且 raw_text/structured_md 均空 → 回填 legacy_unverified。
    #[test]
    fn v14_backfills_extracted_with_empty_content() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).expect("migrations");

        seed_asset_and_meta(
            &conn,
            "a1",
            "m1",
            "2026-05-12T10:00:00Z",
            None,
            Some(("extracted", Some(""), Some(""))),
        );

        // 再手动跑一次 V14（migrations 已跑过；幂等下应仍能回填如果数据是后建的）。
        // 注意：因为 seed 是在 run_migrations 之后，V14 已不会被 dispatcher 重跑。
        // 直接调用底层函数验证 backfill 行为。
        super::v14_legacy_unverified_backfill(&conn).expect("v14 direct call");

        assert_eq!(fc_for(&conn, "m1").as_deref(), Some("legacy_unverified"));
    }

    /// V14-B：raw_text 非空 → 不动 failure_code（真成功）。
    #[test]
    fn v14_keeps_null_when_content_present() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).expect("migrations");

        seed_asset_and_meta(
            &conn,
            "a1",
            "m1",
            "2026-05-12T10:00:00Z",
            None,
            Some(("extracted", Some("正常内容"), Some(""))),
        );
        super::v14_legacy_unverified_backfill(&conn).expect("v14");

        assert!(fc_for(&conn, "m1").is_none(), "raw_text 非空不应回填");
    }

    /// V14-C：已写过 8 错误码之一 → 不覆盖。
    #[test]
    fn v14_does_not_overwrite_existing_failure_code() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).expect("migrations");

        seed_asset_and_meta(
            &conn,
            "a1",
            "m1",
            "2026-05-12T10:00:00Z",
            Some("E_OUTPUT_EMPTY"),
            Some(("extracted", Some(""), Some(""))),
        );
        super::v14_legacy_unverified_backfill(&conn).expect("v14");

        assert_eq!(
            fc_for(&conn, "m1").as_deref(),
            Some("E_OUTPUT_EMPTY"),
            "已有 failure_code 必须保留"
        );
    }

    /// V14-D：幂等 —— 同一数据连跑两次 V14，第二次 conn.changes() == 0。
    #[test]
    fn v14_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).expect("migrations");

        seed_asset_and_meta(
            &conn,
            "a1",
            "m1",
            "2026-05-12T10:00:00Z",
            None,
            Some(("extracted", None, None)),
        );

        super::v14_legacy_unverified_backfill(&conn).expect("v14 first");
        let first_changes = conn.changes();
        assert!(first_changes >= 1, "首跑应回填至少 1 行（含可选索引建立后实际 UPDATE 影响行数）");
        assert_eq!(fc_for(&conn, "m1").as_deref(), Some("legacy_unverified"));

        super::v14_legacy_unverified_backfill(&conn).expect("v14 second");
        let second_changes = conn.changes();
        // 第二次 UPDATE 应影响 0 行。conn.changes() 只反映最近一条 DML，
        // 末尾的 CREATE INDEX 不算 DML，因此读到的应是 UPDATE 的 changes。
        // 但 PRAGMA user_version=14 是非 DML，也不影响 changes 计数。
        assert_eq!(second_changes, 0, "幂等：第二次 V14 影响行数应为 0");
    }

    /// V14-E：多次尝试同一 asset → 仅最新一行 conversion_meta 被回填。
    #[test]
    fn v14_only_touches_latest_row_per_asset() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).expect("migrations");

        // 同一 asset 两行 conversion_meta，m1 早 / m2 晚
        seed_asset_and_meta(
            &conn,
            "a1",
            "m1",
            "2026-05-12T10:00:00Z",
            None,
            Some(("extracted", Some(""), Some(""))),
        );
        // 复用同一 asset 插第二行 cm（不再插 ec / asset，否则 PK 冲突）。
        conn.execute(
            "INSERT INTO conversion_meta
                (id, source_asset_id, derived_asset_id, converter_name, converter_version,
                 source_mime, source_hash, quality_level, fallback_used,
                 error_class, conversion_ms, converted_at, failure_code)
             VALUES ('m2', 'a1', NULL, 'markitdown', '0.0.1', 'application/pdf', 'h',
                     0, 0, NULL, 100, '2026-05-12T11:00:00Z', NULL)",
            [],
        )
        .unwrap();

        super::v14_legacy_unverified_backfill(&conn).expect("v14");

        assert!(fc_for(&conn, "m1").is_none(), "旧行 m1 不应被回填");
        assert_eq!(
            fc_for(&conn, "m2").as_deref(),
            Some("legacy_unverified"),
            "最新行 m2 应被回填"
        );
    }
}
