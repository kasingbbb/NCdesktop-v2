use crate::db::knowledge::{
    delete_concept as db_delete_concept, delete_extensions_for_concept, delete_viewpoints_for_concept,
    get_concept_detail as db_get_concept_detail, get_concepts_with_stats,
    insert_case, insert_concept, insert_extension, insert_viewpoint,
    update_concept as db_update_concept,
    Concept, ConceptCase, ConceptDetail, ConceptExtension, ConceptViewpoint, ConceptWithStats,
};
use crate::db::Database;
use crate::llm::chat::{chat_completion, ChatMessage};
use crate::llm::client::LLMClient;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

// ─────────────────────────────────────────────────────────────────────────────
// 进度结构体
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionProgress {
    pub total_assets: usize,
    pub processed: usize,
    pub concepts_found: usize,
    pub status: String, // "running" | "completed" | "error"
}

// ─────────────────────────────────────────────────────────────────────────────
// 同步 CRUD commands
// ─────────────────────────────────────────────────────────────────────────────

/// 获取知识库概念列表（含统计）
#[tauri::command]
pub fn get_concepts(
    db: State<'_, Database>,
    library_id: String,
) -> Result<Vec<ConceptWithStats>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    get_concepts_with_stats(&conn, &library_id)
}

/// 获取单个概念完整详情（观点 + 案例 + 拓展）
#[tauri::command]
pub fn get_concept_detail(
    db: State<'_, Database>,
    concept_id: String,
) -> Result<Option<ConceptDetail>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db_get_concept_detail(&conn, &concept_id)
}

/// 更新概念名称或定义（标记 user_edited）
#[tauri::command]
pub fn update_concept(
    db: State<'_, Database>,
    concept_id: String,
    name: Option<String>,
    definition: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db_update_concept(&conn, &concept_id, name.as_deref(), definition.as_deref())
}

/// 删除概念（级联删除观点/案例/拓展）
#[tauri::command]
pub fn delete_concept(
    db: State<'_, Database>,
    concept_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    db_delete_concept(&conn, &concept_id)
}

// ─────────────────────────────────────────────────────────────────────────────
// 异步：概念提取（后台任务，通过 Tauri event 推进度）
// ─────────────────────────────────────────────────────────────────────────────

/// 扫描知识库所有素材，对每个素材调用 LLM 提取概念
///
/// - force=true：重新处理所有素材；false：仅处理未提取过的（基于 concept 去重）
/// - 进度通过 `notecapt/concept-extraction-progress` 事件推送
/// - 完成后发送 `notecapt/concept-extraction-done`
#[tauri::command]
pub async fn extract_concepts_for_library(
    db: State<'_, Database>,
    app: tauri::AppHandle,
    library_id: String,
    force: bool,
) -> Result<ExtractionProgress, String> {
    // 1. 读取 LLM 配置
    let client = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        LLMClient::from_db_or_env(&conn)?
    };

    // 2. 查询需要处理的素材（通过 library_id → projects → assets）
    let assets = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        fetch_library_assets(&conn, &library_id)?
    };

    let total = assets.len();
    let mut processed = 0usize;
    let mut concepts_found = 0usize;
    let mut skipped_incremental = 0usize;

    emit_progress(&app, &library_id, total, processed, concepts_found, "running");

    // 预加载所有已存在的概念（含 user_edited 标记，用于 F-9）
    let existing_concepts = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        get_concepts_with_stats(&conn, &library_id)?
            .into_iter()
            .map(|c| (c.name.clone(), (c.id.clone(), c.user_edited)))
            .collect::<std::collections::HashMap<_, _>>()
    };

    // F-8 增量抽取：预加载已处理过的 (asset_id, content_hash) 集合
    let logged_pairs = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        crate::db::concepts_extraction_log::fetch_logged_pairs(&conn, &library_id)?
    };

    for (asset_id, project_name, asset_name, content_snippet, content_hash) in &assets {
        // 跳过内容为空的素材
        if content_snippet.trim().is_empty() {
            processed += 1;
            continue;
        }

        // F-8: 若 force=false 且此 (asset_id, hash) 已在日志中，则跳过
        if !force {
            if let Some(hash) = content_hash.as_ref() {
                if logged_pairs.contains(&(asset_id.clone(), hash.clone())) {
                    skipped_incremental += 1;
                    processed += 1;
                    emit_progress(&app, &library_id, total, processed, concepts_found, "running");
                    continue;
                }
            }
        }

        let prompt = build_extraction_prompt(asset_name, project_name, content_snippet);
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: "You are a knowledge extraction engine. Given a student's academic document, extract key concepts with precision. Return only valid JSON array.".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ];

        // 调用 LLM，解析 JSON
        if let Ok(response) = chat_completion(&client, messages).await {
            if let Ok(extracted) = parse_extracted_concepts(&response) {
                let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
                let now = chrono::Utc::now().to_rfc3339();

                for ec in extracted {
                    let concept_id: String =
                        if let Some((existing_id, _user_edited)) = existing_concepts.get(&ec.name) {
                            // F-9: user_edited 概念仅追加 source_asset_id + cases，
                            // 绝不覆写 name/definition（当前分支本就不改 name/definition，保留行为）
                            append_source_asset(&conn, existing_id, asset_id)?;
                            existing_id.clone()
                        } else {
                            let new_id = uuid::Uuid::new_v4().to_string();
                            let c = Concept {
                                id: new_id.clone(),
                                library_id: library_id.clone(),
                                name: ec.name.clone(),
                                aliases: ec.aliases.clone(),
                                definition: Some(ec.definition.clone()),
                                source_asset_ids: vec![asset_id.clone()],
                                source_project_ids: vec![],
                                user_edited: false,
                                created_at: now.clone(),
                                updated_at: now.clone(),
                            };
                            insert_concept(&conn, &c)?;
                            new_id
                        };

                    // 插入案例摘录
                    for excerpt in &ec.excerpts {
                        let case = ConceptCase {
                            id: uuid::Uuid::new_v4().to_string(),
                            concept_id: concept_id.clone(),
                            title: format!("{} — {}", project_name, asset_name),
                            excerpt: excerpt.clone(),
                            source_asset_id: Some(asset_id.clone()),
                            source_location: None,
                            relevance_note: None,
                        };
                        let _ = insert_case(&conn, &case); // 忽略重复
                    }

                    concepts_found += 1;
                }

                // F-8: 记录该 (library, asset, hash) 已处理，供下次增量跳过
                if let Some(hash) = content_hash.as_ref() {
                    let _ = crate::db::concepts_extraction_log::insert(
                        &conn, &library_id, asset_id, hash,
                    );
                }
            }
        }

        processed += 1;
        emit_progress(&app, &library_id, total, processed, concepts_found, "running");
    }

    if skipped_incremental > 0 {
        log::info!(
            "F-8 增量抽取：库 {} 跳过 {} 个已处理素材（force=false）",
            library_id, skipped_incremental
        );
    }

    // 概念提取完成后，先同步触发共现关系计算（纯 SQLite，无 LLM，耗时可接受）
    // 必须在发送 concept-extraction-done 事件之前完成并释放连接锁，
    // 确保前端收到事件时 concept_relations 数据已就绪。
    {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        match crate::db::co_occurrence::compute_co_occurrence(&conn, &library_id) {
            Ok(n) => log::info!("共现关系计算完成，新增/更新 {n} 条关系"),
            Err(e) => log::warn!("共现关系计算失败（不影响提取结果）: {e}"),
        }
    }

    // 共现计算完成并释放连接锁后，再发送完成事件
    let _ = app.emit(
        "notecapt/concept-extraction-done",
        serde_json::json!({ "libraryId": library_id, "conceptCount": concepts_found }),
    );

    let final_progress = ExtractionProgress {
        total_assets: total,
        processed,
        concepts_found,
        status: "completed".to_string(),
    };
    Ok(final_progress)
}

// ─────────────────────────────────────────────────────────────────────────────
// 异步：观点聚合
// ─────────────────────────────────────────────────────────────────────────────

/// 对指定概念，收集所有来源素材的相关段落，调用 LLM 生成多视角观点
#[tauri::command]
pub async fn synthesize_viewpoints(
    db: State<'_, Database>,
    concept_id: String,
) -> Result<Vec<ConceptViewpoint>, String> {
    let (client, concept, cases) = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        let client = LLMClient::from_db_or_env(&conn)?;
        let detail = db_get_concept_detail(&conn, &concept_id)?
            .ok_or_else(|| format!("概念不存在: {concept_id}"))?;
        let cases = detail.cases.clone();
        (client, detail.concept.clone(), cases)
    };

    if cases.is_empty() {
        return Ok(vec![]);
    }

    let prompt = build_synthesis_prompt(&concept.name, concept.definition.as_deref(), &cases);
    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: "You are a knowledge synthesis engine. Help students see how the same concept appears across different courses and contexts. Return only valid JSON array.".to_string(),
        },
        ChatMessage { role: "user".to_string(), content: prompt },
    ];

    let response = chat_completion(&client, messages).await?;
    let viewpoints = parse_synthesized_viewpoints(&response, &concept_id)?;

    // 先清空旧观点，再写入新的
    {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        delete_viewpoints_for_concept(&conn, &concept_id)?;
        for vp in &viewpoints {
            insert_viewpoint(&conn, vp)?;
        }
    }

    Ok(viewpoints)
}

// ─────────────────────────────────────────────────────────────────────────────
// 异步：知识拓展生成
// ─────────────────────────────────────────────────────────────────────────────

/// 对指定概念，调用 LLM 生成上下游知识拓展
#[tauri::command]
pub async fn generate_extensions(
    db: State<'_, Database>,
    concept_id: String,
) -> Result<Vec<ConceptExtension>, String> {
    let (client, concept) = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        let client = LLMClient::from_db_or_env(&conn)?;
        let detail = db_get_concept_detail(&conn, &concept_id)?
            .ok_or_else(|| format!("概念不存在: {concept_id}"))?;
        (client, detail.concept.clone())
    };

    let prompt = format!(
        "# Knowledge Extension Request\n\n\
        Concept: {}\nDefinition: {}\n\n\
        Generate upstream prerequisites (3 concepts) and downstream applications (3 concepts) \
        for this academic concept.\n\n\
        Return JSON array:\n\
        [{{\"direction\":\"upstream\"|\"downstream\",\"name\":\"...\",\"description\":\"...\",\"relationship\":\"...\"}}]\n\n\
        Only return the JSON array, no other text.",
        concept.name,
        concept.definition.as_deref().unwrap_or("N/A")
    );

    let messages = vec![
        ChatMessage { role: "system".to_string(), content: "You are a knowledge graph engine. Return only valid JSON.".to_string() },
        ChatMessage { role: "user".to_string(), content: prompt },
    ];

    let response = chat_completion(&client, messages).await?;
    let extensions = parse_extensions(&response, &concept_id)?;

    {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
        delete_extensions_for_concept(&conn, &concept_id)?;
        for ext in &extensions {
            insert_extension(&conn, ext)?;
        }
    }

    Ok(extensions)
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────────────────────

fn emit_progress(
    app: &tauri::AppHandle,
    library_id: &str,
    total: usize,
    processed: usize,
    found: usize,
    status: &str,
) {
    let _ = app.emit(
        "notecapt/concept-extraction-progress",
        serde_json::json!({
            "libraryId": library_id,
            "totalAssets": total,
            "processed": processed,
            "conceptsFound": found,
            "status": status,
        }),
    );
}

/// 从 library → projects → assets 取得需要处理的素材列表
/// 返回 (asset_id, project_name, asset_name, content_snippet, content_hash_opt)
fn fetch_library_assets(
    conn: &rusqlite::Connection,
    library_id: &str,
) -> Result<Vec<(String, String, String, String, Option<String>)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, p.name, a.name,
                    COALESCE(md_ec.structured_md, md_ec.raw_text, ec.structured_md, ec.raw_text, ai.summary, a.name) as content,
                    COALESCE(md_ec.content_hash, ec.content_hash) as content_hash
             FROM assets a
             INNER JOIN projects p ON p.id = a.project_id AND p.library_id = ?1
             LEFT JOIN assets md ON md.id = (
                 SELECT id FROM assets
                 WHERE source_asset_id = a.id AND asset_type = 'markdown'
                 ORDER BY imported_at DESC
                 LIMIT 1
             )
             LEFT JOIN extracted_content md_ec ON md_ec.asset_id = md.id AND md_ec.status = 'extracted'
             LEFT JOIN extracted_content ec ON ec.asset_id = a.id AND ec.status = 'extracted'
             LEFT JOIN ai_analyses ai ON ai.asset_id = a.id
             WHERE a.source_asset_id IS NULL OR a.asset_type != 'markdown'
             ORDER BY a.imported_at DESC",
        )
        .map_err(|e| format!("查询素材失败: {e}"))?;

    let rows: Result<Vec<_>, _> = stmt
        .query_map(params![library_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| format!("遍历素材失败: {e}"))?
        .collect();

    rows.map_err(|e| format!("读取素材行失败: {e}"))
}



fn append_source_asset(
    conn: &rusqlite::Connection,
    concept_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    let current: Option<String> = conn
        .query_row(
            "SELECT source_asset_ids FROM concepts WHERE id = ?1",
            params![concept_id],
            |r| r.get(0),
        )
        .ok();

    let mut ids: Vec<String> = current
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    if !ids.contains(&asset_id.to_string()) {
        ids.push(asset_id.to_string());
        let json = serde_json::to_string(&ids).unwrap_or_default();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE concepts SET source_asset_ids = ?2, updated_at = ?3 WHERE id = ?1",
            params![concept_id, json, now],
        )
        .map_err(|e| format!("追加素材 ID 失败: {e}"))?;
    }
    Ok(())
}

// ─── Prompt 构建 ─────────────────────────────────────────────────────────────

fn build_extraction_prompt(asset_name: &str, project_name: &str, content: &str) -> String {
    format!(
        "# Document Analysis Request\n\n\
        ## Document\n\
        Title: {asset_name}\n\
        Project/Course: {project_name}\n\
        Content:\n---\n{content}\n---\n\n\
        ## Task\n\
        Extract all significant academic concepts from this document. For each concept:\n\
        1. name: The canonical English term\n\
        2. aliases: Alternative names (including translations if bilingual)\n\
        3. definition: A one-sentence definition as used in this context\n\
        4. excerpts: 1-2 direct quotes from the document that discuss this concept\n\n\
        Return as JSON array:\n\
        [{{\"name\":\"...\",\"aliases\":[\"...\"],\"definition\":\"...\",\"excerpts\":[\"...\"]}}]\n\n\
        Rules:\n\
        - Only extract substantive concepts (not generic terms like \"example\" or \"chapter\")\n\
        - Prefer established academic terminology\n\
        - Include 3-10 concepts per document\n\
        - Return only the JSON array, no other text."
    )
}

fn build_synthesis_prompt(name: &str, definition: Option<&str>, cases: &[ConceptCase]) -> String {
    let mut s = format!(
        "# Viewpoint Synthesis Request\n\n\
        ## Concept: {name}\nDefinition: {}\n\n\
        ## Appearances across student's documents:\n\n",
        definition.unwrap_or("N/A")
    );
    for (i, case) in cases.iter().enumerate() {
        s.push_str(&format!(
            "### Context {}: {}\n{}\n\n",
            i + 1,
            case.title,
            case.excerpt
        ));
    }
    s.push_str(
        "## Task\n\
        For each context, synthesize a viewpoint:\n\
        1. perspective: e.g. \"Economic perspective\" or \"Psychological lens\"\n\
        2. summary: 2-3 sentences explaining how this concept is understood in this context\n\
        3. sourceContext: Which course/document this perspective comes from\n\n\
        Return as JSON array:\n\
        [{{\"perspective\":\"...\",\"summary\":\"...\",\"sourceContext\":\"...\"}}]\n\n\
        Return only the JSON array, no other text.",
    );
    s
}

// ─── JSON 解析 ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ExtractedConcept {
    name: String,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    definition: String,
    #[serde(default)]
    excerpts: Vec<String>,
}

fn parse_extracted_concepts(json: &str) -> Result<Vec<ExtractedConcept>, String> {
    // 提取 JSON 数组（LLM 有时会包裹额外文本）
    let start = json.find('[').unwrap_or(0);
    let end = json.rfind(']').map(|i| i + 1).unwrap_or(json.len());
    serde_json::from_str::<Vec<ExtractedConcept>>(&json[start..end])
        .map_err(|e| format!("解析概念 JSON 失败: {e}"))
}

#[derive(Deserialize)]
struct SynthesizedViewpoint {
    perspective: String,
    summary: String,
    #[serde(rename = "sourceContext", default)]
    source_context: String,
}

fn parse_synthesized_viewpoints(
    json: &str,
    concept_id: &str,
) -> Result<Vec<ConceptViewpoint>, String> {
    let start = json.find('[').unwrap_or(0);
    let end = json.rfind(']').map(|i| i + 1).unwrap_or(json.len());
    let raw: Vec<SynthesizedViewpoint> =
        serde_json::from_str(&json[start..end]).map_err(|e| format!("解析观点 JSON 失败: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();
    Ok(raw
        .into_iter()
        .map(|v| ConceptViewpoint {
            id: uuid::Uuid::new_v4().to_string(),
            concept_id: concept_id.to_string(),
            perspective: v.perspective,
            summary: v.summary,
            source_context: Some(v.source_context).filter(|s| !s.is_empty()),
            source_asset_id: None,
            generated_at: now.clone(),
        })
        .collect())
}

#[derive(Deserialize)]
struct ExtensionItem {
    direction: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    relationship: String,
}

fn parse_extensions(json: &str, concept_id: &str) -> Result<Vec<ConceptExtension>, String> {
    let start = json.find('[').unwrap_or(0);
    let end = json.rfind(']').map(|i| i + 1).unwrap_or(json.len());
    let raw: Vec<ExtensionItem> =
        serde_json::from_str(&json[start..end]).map_err(|e| format!("解析拓展 JSON 失败: {e}"))?;

    Ok(raw
        .into_iter()
        .map(|e| ConceptExtension {
            id: uuid::Uuid::new_v4().to_string(),
            concept_id: concept_id.to_string(),
            direction: e.direction,
            name: e.name,
            description: Some(e.description).filter(|s| !s.is_empty()),
            relationship: Some(e.relationship).filter(|s| !s.is_empty()),
        })
        .collect())
}

// ─────────────────────────────────────────────────────────────────────────────
// 共现关系计算 Command
// ─────────────────────────────────────────────────────────────────────────────

/// 计算知识库内所有概念的共现关系（无 LLM 调用，纯 SQLite 计算）
///
/// 两两配对检查 source_asset_ids 交集，有交集则写入 concept_relations 表
/// （relation_type = "co_occurrence"，概念对方向：concept_a_id < concept_b_id 字典序）。
/// 返回新增/更新的关系记录数。
#[tauri::command]
pub fn knowledge_compute_co_occurrence(
    db: State<'_, Database>,
    library_id: String,
) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {e}"))?;
    crate::db::co_occurrence::compute_co_occurrence(&conn, &library_id)
}
