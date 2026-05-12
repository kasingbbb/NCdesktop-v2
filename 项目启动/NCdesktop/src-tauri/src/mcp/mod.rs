/// MCP（Model Context Protocol）本地服务器模块（Step 11）
///
/// 将已验证的技能（Skill）暴露为 MCP Tool，让 Claude Desktop / Cursor 等
/// AI 助手可通过 localhost HTTP 直接查询用户自己的知识库。
///
/// 协议：JSON-RPC 2.0 over HTTP/1.1（Streamable HTTP transport）
/// 端口：默认 3737（可在启动时自动选择空闲端口）
pub mod server;
