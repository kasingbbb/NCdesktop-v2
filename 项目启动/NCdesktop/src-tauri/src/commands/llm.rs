use serde::{Deserialize, Serialize};

use crate::db::Database;
use crate::llm::classify_parse::parse_classify_response;
use crate::llm::client::{self, LLMClient, LLMConfig};
use crate::llm::chat::{ChatMessage, chat_completion};
use crate::llm::prompts;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct LLMSummaryResult {
    pub summary: String,
    pub model: String,
    pub token_count: u32,
}

pub use crate::llm::classify_parse::ClassifyResult;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmConfigPayload {
    pub base_url: String,
    pub model: String,
    /// `keep`：不改 Key；`clear`：清除应用内保存；`set`：使用 `api_key_value`
    pub api_key_action: String,
    #[serde(default)]
    pub api_key_value: String,
}

/// 获取 LLM 配置状态（不泄露完整 API Key）
#[tauri::command]
pub async fn get_llm_config(database: State<'_, Database>) -> Result<LLMConfig, String> {
    let conn = database
        .conn
        .lock()
        .map_err(|e| format!("数据库锁获取失败: {e}"))?;

    let (base_url, model) = LLMClient::display_defaults(&conn);

    if !LLMClient::is_available_in_conn(&conn) {
        return Ok(LLMConfig {
            api_key_masked: "未配置".to_string(),
            base_url,
            model,
            is_configured: false,
        });
    }

    let client = LLMClient::from_db_or_env(&conn)?;
    Ok(client.get_config())
}

/// 保存 LLM 配置（API Key 仅存本地数据库，不以明文回传前端）
#[tauri::command]
pub fn save_llm_config(
    database: State<'_, Database>,
    payload: SaveLlmConfigPayload,
) -> Result<(), String> {
    let conn = database
        .conn
        .lock()
        .map_err(|e| format!("数据库锁获取失败: {e}"))?;

    let base = payload.base_url.trim().to_string();
    let model = payload.model.trim().to_string();
    if base.is_empty() {
        return Err("Base URL 不能为空".to_string());
    }
    if model.is_empty() {
        return Err("Model 不能为空".to_string());
    }

    crate::db::settings::set(&conn, client::SETTING_LLM_BASE_URL, &base)?;
    crate::db::settings::set(&conn, client::SETTING_LLM_MODEL, &model)?;

    match payload.api_key_action.as_str() {
        "clear" => {
            crate::db::settings::set(&conn, client::SETTING_LLM_API_KEY, "")?;
        }
        "set" => {
            let v = payload.api_key_value.trim();
            if v.is_empty() {
                return Err("请填写 API Key，或改用「保留当前 Key」".to_string());
            }
            crate::db::settings::set(&conn, client::SETTING_LLM_API_KEY, v)?;
        }
        "keep" => {}
        _ => return Err("无效的 api_key_action（应为 keep / clear / set）".to_string()),
    }

    Ok(())
}

/// 供拖放导入等内部调用（不经过 IPC）
pub async fn llm_classify_with_db(
    database: &Database,
    content: String,
) -> Result<ClassifyResult, String> {
    let client = {
        let conn = database
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {e}"))?;
        LLMClient::from_db_or_env(&conn)?
    };

    let system = format!(
        "{}\n{}",
        prompts::system_message(),
        prompts::classify_system_addon()
    );

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: system,
        },
        ChatMessage {
            role: "user".to_string(),
            content: prompts::classify_prompt(&content),
        },
    ];

    let response = chat_completion(&client, messages).await?;
    parse_classify_response(&response)
}

/// 智能摘要
#[tauri::command]
pub async fn llm_summarize(
    database: State<'_, Database>,
    content: String,
    language: String,
) -> Result<LLMSummaryResult, String> {
    let client = {
        let conn = database
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {e}"))?;
        LLMClient::from_db_or_env(&conn)?
    };

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: prompts::system_message(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: prompts::summarize_prompt(&content, &language),
        },
    ];

    let summary = chat_completion(&client, messages).await?;

    Ok(LLMSummaryResult {
        summary,
        model: client.model,
        token_count: 0,
    })
}

/// AI 分类
#[tauri::command]
pub async fn llm_classify(
    database: State<'_, Database>,
    content: String,
) -> Result<ClassifyResult, String> {
    llm_classify_with_db(&database, content).await
}

/// 连通性探测：发送一条固定样本文本，验证 Base URL / Key / Model 与分类 JSON 解析是否正常
#[tauri::command]
pub async fn llm_probe(database: State<'_, Database>) -> Result<ClassifyResult, String> {
    let sample = "文件名：probe.txt\nMIME：text/plain\n资产类型：markdown\n\n内容片段（截断）：\n这是一条 API 连通性测试，请返回合法 JSON。";
    llm_classify_with_db(&database, sample.to_string()).await
}

/// LLM 增强导出（对 Markdown 进行二次整理）
#[tauri::command]
pub async fn llm_enhance_export(
    database: State<'_, Database>,
    markdown: String,
) -> Result<String, String> {
    let client = {
        let conn = database
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {e}"))?;
        LLMClient::from_db_or_env(&conn)?
    };

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: prompts::system_message(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: prompts::enhance_export_prompt(&markdown),
        },
    ];

    chat_completion(&client, messages).await
}
