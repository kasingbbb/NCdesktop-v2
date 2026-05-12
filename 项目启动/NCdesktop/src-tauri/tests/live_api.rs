//! Live integration test hitting Volces Ark. Not run by default.
//! Run with: `cargo test --test live_api -- --ignored --nocapture`

#[test]
#[ignore]
fn probe_volces_ark_openai_compat() {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");
    rt.block_on(probe());
}

async fn probe() {
    let client = app_lib::llm::client::LLMClient {
        api_key: "30b142ba-388c-4a64-aedc-f57a38966983".to_string(),
        base_url: "https://ark.cn-beijing.volces.com/api/coding/v3".to_string(),
        model: "ark-code-latest".to_string(),
        max_tokens: 4096,
        temperature: 0.7,
    };
    let messages = vec![
        app_lib::llm::chat::ChatMessage {
            role: "system".to_string(),
            content: "你是 NoteCapt 分类器。回复必须是纯 JSON 对象字符串。".to_string(),
        },
        app_lib::llm::chat::ChatMessage {
            role: "user".to_string(),
            content: "请返回 {\"category\":\"other\",\"tags\":[],\"confidence\":0.5,\"language\":\"zh\",\"suggestedFileName\":\"test\"}".to_string(),
        },
    ];
    let r = app_lib::llm::chat::chat_completion(&client, messages).await;
    println!("Result: {:?}", r);
    assert!(r.is_ok(), "chat_completion failed: {:?}", r);
}
