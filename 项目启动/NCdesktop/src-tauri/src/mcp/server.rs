/// MCP HTTP 服务器实现
///
/// 实现 MCP Streamable HTTP transport（2024-11-05）
/// 每个经验证的技能（status = "verified"）对应一个 MCP Tool。
/// Tool 调用时：加载该技能的知识单元，用 LLM 回答用户查询。

use rusqlite::Connection;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

// ─── 服务器状态 ───────────────────────────────────────────────────────────────

struct McpActiveServer {
    port: u16,
    library_id: String,
    abort_tx: tokio::sync::oneshot::Sender<()>,
}

pub struct McpServerManager {
    /// 打开独立连接所需的 DB 路径
    pub db_path: PathBuf,
    state: Mutex<Option<McpActiveServer>>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub library_id: Option<String>,
}

impl McpServerManager {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            state: Mutex::new(None),
        }
    }

    pub fn status(&self) -> McpServerStatus {
        let guard = self.state.lock().unwrap();
        match guard.as_ref() {
            None => McpServerStatus {
                running: false,
                port: None,
                url: None,
                library_id: None,
            },
            Some(s) => McpServerStatus {
                running: true,
                port: Some(s.port),
                url: Some(format!("http://127.0.0.1:{}", s.port)),
                library_id: Some(s.library_id.clone()),
            },
        }
    }

    /// 启动 MCP 服务器（若已启动则先停止旧的）
    pub fn start(
        &self,
        library_id: String,
        db_path: PathBuf,
    ) -> Result<McpServerStatus, String> {
        // 停止旧服务器
        self.stop_inner();

        // 绑定端口（先尝试 3737，之后依次 +1）
        let port = find_free_port(3737).ok_or("无可用端口（3737-3837）")?;

        let (abort_tx, abort_rx) = tokio::sync::oneshot::channel::<()>();

        let lib_id_clone = library_id.clone();
        let db_path_clone = db_path.clone();

        tauri::async_runtime::spawn(async move {
            if let Err(e) = run_server(port, lib_id_clone, db_path_clone, abort_rx).await {
                log::error!("[MCP] 服务器异常退出: {e}");
            }
        });

        let status = McpServerStatus {
            running: true,
            port: Some(port),
            url: Some(format!("http://127.0.0.1:{port}")),
            library_id: Some(library_id.clone()),
        };

        *self.state.lock().unwrap() = Some(McpActiveServer {
            port,
            library_id,
            abort_tx,
        });

        Ok(status)
    }

    /// 停止服务器
    pub fn stop(&self) -> bool {
        self.stop_inner()
    }

    fn stop_inner(&self) -> bool {
        let old = self.state.lock().unwrap().take();
        if let Some(server) = old {
            let _ = server.abort_tx.send(());
            true
        } else {
            false
        }
    }
}

// ─── 端口查找 ─────────────────────────────────────────────────────────────────

fn find_free_port(start: u16) -> Option<u16> {
    for port in start..start.saturating_add(100) {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Some(port);
        }
    }
    None
}

// ─── 主循环 ───────────────────────────────────────────────────────────────────

async fn run_server(
    port: u16,
    library_id: String,
    db_path: PathBuf,
    mut abort_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("bind port {port}: {e}"))?;

    log::info!("[MCP] 服务器已启动 → http://127.0.0.1:{port}");

    loop {
        tokio::select! {
            _ = &mut abort_rx => {
                log::info!("[MCP] 服务器已停止");
                return Ok(());
            }
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, _)) => {
                        let lib = library_id.clone();
                        let db = db_path.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = handle_connection(stream, &lib, &db).await {
                                log::debug!("[MCP] 连接处理错误: {e}");
                            }
                        });
                    }
                    Err(e) => log::warn!("[MCP] accept 错误: {e}"),
                }
            }
        }
    }
}

// ─── HTTP 请求处理 ────────────────────────────────────────────────────────────

async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    library_id: &str,
    db_path: &Path,
) -> Result<(), String> {
    // 读取原始请求
    let mut buf = vec![0u8; 16384];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("read: {e}"))?;
    if n == 0 {
        return Ok(());
    }
    let raw = String::from_utf8_lossy(&buf[..n]);

    // 解析请求行
    let mut lines = raw.lines();
    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("").to_uppercase();
    let path = parts.get(1).copied().unwrap_or("/");

    // CORS 预检
    if method == "OPTIONS" {
        let resp = cors_response("", 204);
        stream.write_all(resp.as_bytes()).await.ok();
        return Ok(());
    }

    // 健康检查
    if method == "GET" && path == "/health" {
        let body = r#"{"status":"ok","server":"NoteCapt Skills MCP","version":"1.0"}"#;
        let resp = cors_response(body, 200);
        stream.write_all(resp.as_bytes()).await.ok();
        return Ok(());
    }

    // 提取 body（找 \r\n\r\n 分割点）
    let body_start = raw.find("\r\n\r\n").map(|i| i + 4).unwrap_or(raw.len());
    let body_str = raw[body_start..].trim();

    if body_str.is_empty() {
        let resp = cors_response(r#"{"error":"empty body"}"#, 400);
        stream.write_all(resp.as_bytes()).await.ok();
        return Ok(());
    }

    // 解析 JSON-RPC
    let rpc: Value = match serde_json::from_str(body_str) {
        Ok(v) => v,
        Err(e) => {
            let err_body = format!(r#"{{"error":"invalid json: {e}"}}"#);
            let resp = cors_response(&err_body, 400);
            stream.write_all(resp.as_bytes()).await.ok();
            return Ok(());
        }
    };

    let id = rpc.get("id").cloned().unwrap_or(Value::Null);
    let rpc_method = rpc.get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    let params = rpc.get("params").cloned().unwrap_or(serde_json::json!({}));

    let result = dispatch_method(&rpc_method, params, library_id, db_path).await;

    let response_body = match result {
        Ok(r) => serde_json::to_string(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": r,
        }))
        .unwrap_or_default(),
        Err(e) => serde_json::to_string(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {"code": -32603, "message": e},
        }))
        .unwrap_or_default(),
    };

    let resp = cors_response(&response_body, 200);
    stream.write_all(resp.as_bytes()).await.ok();
    Ok(())
}

/// 构建带 CORS 头的 HTTP 响应
fn cors_response(body: &str, status: u16) -> String {
    let status_text = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        _ => "OK",
    };
    let content_type = if body.is_empty() {
        "text/plain".to_string()
    } else {
        "application/json".to_string()
    };
    format!(
        "HTTP/1.1 {status} {status_text}\r\n\
         Content-Type: {content_type}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {body}",
        body.len()
    )
}

// ─── MCP 方法调度 ─────────────────────────────────────────────────────────────

async fn dispatch_method(
    method: &str,
    params: Value,
    library_id: &str,
    db_path: &Path,
) -> Result<Value, String> {
    match method {
        // 握手
        "initialize" => Ok(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": {
                "name": "NoteCapt Skills MCP",
                "version": "1.0.0",
            },
        })),
        "notifications/initialized" | "ping" => Ok(Value::Null),

        // 工具列表
        "tools/list" => {
            let tools = list_tools(library_id, db_path)?;
            Ok(serde_json::json!({ "tools": tools }))
        }

        // 工具调用
        "tools/call" => {
            let tool_name = params
                .get("name")
                .and_then(|n| n.as_str())
                .ok_or("缺少 tool name")?
                .to_string();
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or(serde_json::json!({}));
            let text = call_tool(&tool_name, args, library_id, db_path).await?;
            Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }],
            }))
        }

        other => Err(format!("未知方法: {other}")),
    }
}

// ─── 工具：列表 ───────────────────────────────────────────────────────────────

fn list_tools(library_id: &str, db_path: &Path) -> Result<Vec<Value>, String> {
    let conn = open_conn(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description FROM skills
             WHERE library_id = ?1 AND status = 'verified'
             ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("list_tools query: {e}"))?;

    let rows: Vec<(String, String, Option<String>)> = stmt
        .query_map(rusqlite::params![library_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| format!("list_tools rows: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let tools: Vec<Value> = rows
        .into_iter()
        .map(|(id, name, desc)| {
            let tool_name = skill_tool_name(&id);
            let description = format!(
                "Query the '{}' skill knowledge base from NoteCapt.{}",
                name,
                desc.map(|d| format!(" {d}")).unwrap_or_default()
            );
            serde_json::json!({
                "name": tool_name,
                "description": description,
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Your question about this skill",
                        }
                    },
                    "required": ["query"],
                }
            })
        })
        .collect();

    Ok(tools)
}

// ─── 工具：调用 ───────────────────────────────────────────────────────────────

async fn call_tool(
    tool_name: &str,
    args: Value,
    library_id: &str,
    db_path: &Path,
) -> Result<String, String> {
    let query = args
        .get("query")
        .and_then(|q| q.as_str())
        .ok_or("缺少 query 参数")?
        .to_string();

    // 找到对应的 skill（工具名 = query_<id前8位>）
    let skill_id_prefix = tool_name
        .strip_prefix("query_skill_")
        .ok_or_else(|| format!("无效的 tool name: {tool_name}"))?;

    let conn = open_conn(db_path)?;

    // 找 skill
    let (skill_name, skill_desc, ku_ids_json): (String, Option<String>, String) = conn
        .query_row(
            "SELECT name, description, ku_ids FROM skills
             WHERE library_id = ?1 AND id LIKE ?2 || '%' AND status = 'verified'
             LIMIT 1",
            rusqlite::params![library_id, skill_id_prefix],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("skill 未找到: {e}"))?;

    let ku_ids: Vec<String> =
        serde_json::from_str(&ku_ids_json).unwrap_or_default();

    if ku_ids.is_empty() {
        return Ok("该技能暂无关联的知识单元。".to_string());
    }

    // 加载 KU 内容
    let mut context_parts: Vec<String> = Vec::new();
    for kid in ku_ids.iter().take(12) {
        let ku_result: rusqlite::Result<(String, String, Option<String>)> = conn.query_row(
            "SELECT title, core_insight, summary FROM knowledge_units WHERE id = ?1",
            rusqlite::params![kid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        if let Ok((title, core_insight, summary)) = ku_result {
            let mut part = format!("## {title}\n核心见解：{core_insight}");
            if let Some(s) = summary {
                if !s.is_empty() {
                    part.push_str(&format!("\n摘要：{s}"));
                }
            }
            context_parts.push(part);
        }
    }

    let context = context_parts.join("\n\n");

    // 使用 from_db_or_env 读取 LLM 配置（api_key/base_url/model 均从 DB 或内置默认值读取）
    let client = crate::llm::client::LLMClient::from_db_or_env(&conn)
        .map_err(|e| format!("LLM 配置读取失败: {e}"))?;

    let system_content = format!(
        "你是用户的个人知识助手，专注于「{skill_name}」这个技能领域。\
         以下是用户通过亲身学习积累的知识单元内容：\n\n{context}\n\n\
         请仅基于以上知识内容回答用户的问题。\
         如果知识内容中没有相关信息，请如实说明。"
    );

    let messages = vec![
        crate::llm::chat::ChatMessage {
            role: "system".to_string(),
            content: system_content,
        },
        crate::llm::chat::ChatMessage {
            role: "user".to_string(),
            content: query,
        },
    ];

    let answer = crate::llm::chat::chat_completion(&client, messages)
        .await
        .map_err(|e| format!("LLM 调用失败: {e}"))?;

    let skill_desc_note = skill_desc
        .map(|d| format!("\n\n*（技能：{} — {}）*", skill_name, d))
        .unwrap_or_else(|| format!("\n\n*（技能：{}）*", skill_name));

    Ok(format!("{answer}{skill_desc_note}"))
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/// skill id → MCP tool name
/// 格式：query_skill_<id前8位>（保证全局唯一且简短）
pub fn skill_tool_name(skill_id: &str) -> String {
    let prefix = &skill_id[..skill_id.len().min(8)];
    format!("query_skill_{prefix}")
}

fn open_conn(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("open db: {e}"))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .ok();
    Ok(conn)
}
