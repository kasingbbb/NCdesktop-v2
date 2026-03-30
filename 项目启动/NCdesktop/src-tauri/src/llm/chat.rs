use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::client::LLMClient;
use super::retry::with_retry;

/// LLM HTTP：带连接/整体超时，避免错误 Base URL 或网络挂起时无限等待
fn llm_http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            // 单次请求上限；超时后 with_retry 不再重复长时间等待
            .timeout(Duration::from_secs(75))
            .build()
            .expect("reqwest LLM client")
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
    temperature: f32,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    pub content: Vec<AnthropicContent>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: Option<String>,
    pub thinking: Option<String>,
}


/// 同步 Chat Completion（非流式）
pub async fn chat_completion(
    client: &LLMClient,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let mut system_text = None;
    let mut filtered_messages = Vec::new();
    for msg in messages {
        if msg.role == "system" {
            system_text = Some(msg.content);
        } else {
            filtered_messages.push(msg);
        }
    }

    let url = format!("{}/v1/messages", client.base_url.trim_end_matches('/'));

    if filtered_messages.is_empty() {
        return Err("Anthropic 协议要求至少包含一条用户消息（messages 不能为空）".to_string());
    }

    let request = AnthropicRequest {
        model: client.model.clone(),
        system: system_text,
        messages: filtered_messages,
        max_tokens: client.max_tokens,
        temperature: client.temperature,
        stream: false,
    };

    let response: AnthropicResponse = with_retry(|| async {
        let mut req = llm_http_client().post(&url).json(&request);
        for (k, v) in client.build_headers() {
            req = req.header(k, v);
        }

        let res = req.send().await.map_err(|e| format!("网络请求失败: {e}"))?;
        let status = res.status();
        let text = res.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
        if !status.is_success() {
            return Err(format!("LLM API 错误 ({status}): {text}"));
        }
        serde_json::from_str::<AnthropicResponse>(&text)
            .map_err(|e| format!("解析 API 响应失败: {e}"))
    })
    .await?;

    response
        .content
        .into_iter()
        .find_map(|c| c.text)
        .ok_or_else(|| "API 返回响应中未包含文本内容 (text block missing)".to_string())
}

/// 流式 Chat Completion — 通过 Tauri Event 推送
pub async fn chat_completion_stream<F>(
    client: &LLMClient,
    messages: Vec<ChatMessage>,
    on_chunk: F,
) -> Result<String, String>
where
    F: Fn(&str),
{
    // 目前前端未接入流式，暂时留空返回，后续需适配 Anthropic Stream
    Err("Stream is currently unsupported in Anthropic mode".to_string())
}
