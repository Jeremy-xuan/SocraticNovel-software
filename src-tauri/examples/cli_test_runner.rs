//! CLI Test Runner — T1-T4 Phase 4.4 Blocking Items Verification
//!
//! 覆盖所有 4 个 Phase 4.4 阻塞项的端到端 CLI 验收测试。
//! 不依赖 GUI / Tauri IPC — 直接调用 Rust 库层进行验证。
//!
//! 用法：
//!   API_KEY=sk-... cargo run --example cli_test_runner
//!   API_KEY=sk-... cargo run --example cli_test_runner -- --suite t1
//!   API_KEY=sk-... cargo run --example cli_test_runner -- --suite t2
//!   API_KEY=sk-... cargo run --example cli_test_runner -- --suite t3
//!   API_KEY=sk-... cargo run --example cli_test_runner -- --suite t4
//!   API_KEY=sk-... cargo run --example cli_test_runner -- --suite all
//!
//! 注意：T2 需要网络访问 github.com；T3 需要有效的 DeepSeek API Key。

use socratic_novel_lib::ai::{runtime, tools, types::*};
use socratic_novel_lib::commands::{credential_store, settings_commands};

const DEEPSEEK_URL: &str = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_PROVIDER: &str = "deepseek";
const MAX_LOOPS: usize = 10;
const GRACE_AFTER_RESPOND: usize = 1;

fn default_workspace() -> String {
    dirs::home_dir()
        .map(|h| h.join("socratic-novel-软件开发").join("workspaces").join("ap-physics-em"))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "./workspaces/ap-physics-em".to_string())
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

struct TestResult {
    name: &'static str,
    passed: bool,
    detail: String,
}

impl TestResult {
    fn pass(name: &'static str, detail: impl Into<String>) -> Self {
        Self { name, passed: true, detail: detail.into() }
    }
    fn fail(name: &'static str, detail: impl Into<String>) -> Self {
        Self { name, passed: false, detail: detail.into() }
    }
}

fn print_result(r: &TestResult) {
    if r.passed {
        println!("  ✅ {} — {}", r.name, r.detail);
    } else {
        println!("  ❌ {} — {}", r.name, r.detail);
    }
}

fn separator(title: &str) {
    println!("\n╔═══════════════════════════════════════════════════╗");
    println!("║  {:<49}║", title);
    println!("╚═══════════════════════════════════════════════════╝");
}

/// Run AI practice loop, return final messages (containing tool calls for inspection).
/// `force_tools`: if Some, only offer these tool names; otherwise use full practice set.
async fn run_ai_loop(
    api_key: &str,
    provider: &str,
    system_prompt: &str,
    user_message: &str,
    force_tools: Option<&[&str]>,
) -> Result<Vec<Message>, String> {
    let mut messages: Vec<Message> = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text { text: user_message.to_string() }],
    }];

    let all_tool_defs = tools::get_practice_tools();
    let tool_defs: Vec<ToolDefinition> = if let Some(names) = force_tools {
        all_tool_defs.into_iter().filter(|t| names.contains(&t.name.as_str())).collect()
    } else {
        all_tool_defs
    };

    let mut active_tools = tool_defs.clone();
    let mut respond_called_at: Option<usize> = None;

    for iteration in 0..MAX_LOOPS {
        let client = socratic_novel_lib::ai::openai::OpenAiClient::new(api_key.to_string(), provider);
        let (content_blocks, stop_reason) = client
            .send_message(system_prompt, messages.clone(), Some(active_tools.clone()))
            .await?;

        let tool_uses: Vec<(String, String, serde_json::Value)> = content_blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolUse { id, name, input } => Some((id.clone(), name.clone(), input.clone())),
                _ => None,
            })
            .collect();

        messages.push(Message {
            role: "assistant".to_string(),
            content: content_blocks,
        });

        if tool_uses.is_empty() || stop_reason.as_deref() == Some("end_turn") {
            break;
        }

        let mut tool_results: Vec<ContentBlock> = Vec::new();
        for (tool_id, tool_name, input) in &tool_uses {
            println!("    🔧 {}", tool_name);

            if tool_name == "respond_to_student" && respond_called_at.is_none() {
                respond_called_at = Some(iteration);
                active_tools.retain(|t| t.name != "respond_to_student");
            }

            let (result, is_error) = if tool_name == "think" {
                ("Thought recorded.".to_string(), false)
            } else {
                tools::execute_tool(&default_workspace(), tool_name, input, None)
            };

            tool_results.push(ContentBlock::ToolResult {
                tool_use_id: tool_id.clone(),
                content: result,
                is_error: if is_error { Some(true) } else { None },
            });
        }

        messages.push(Message {
            role: "user".to_string(),
            content: tool_results,
        });

        if let Some(called_at) = respond_called_at {
            if iteration >= called_at + GRACE_AFTER_RESPOND {
                break;
            }
        }
    }

    Ok(messages)
}

/// Extract all ToolUse blocks from message history.
fn find_tool_calls(messages: &[Message], tool_name: &str) -> Vec<serde_json::Value> {
    messages.iter()
        .flat_map(|m| m.content.iter())
        .filter_map(|b| match b {
            ContentBlock::ToolUse { name, input, .. } if name == tool_name => Some(input.clone()),
            _ => None,
        })
        .collect()
}

// ═══════════════════════════════════════════════════════════════
//  T1 — Canvas AI 渲染
// ═══════════════════════════════════════════════════════════════

async fn run_t1(api_key: &str) -> Vec<TestResult> {
    separator("T1 — Canvas AI 渲染 (render_canvas)");
    let mut results = Vec::new();

    // 1-1: Direct execute_tool validation (already covered in Phase 3/4)
    println!("  [1-1] execute_tool render_canvas (svg, mermaid, fallbacks)");
    for (canvas_type, content, label) in [
        ("svg", "<svg><rect width='100' height='100' fill='blue'/></svg>", "SVG"),
        ("mermaid", "graph LR\n  A[点电荷] --> B[电场线] --> C[高斯面]", "Mermaid"),
    ] {
        let input = serde_json::json!({ "title": label, "content": content, "type": canvas_type });
        let (msg, is_error) = tools::execute_tool(&default_workspace(), "render_canvas", &input, None);
        if !is_error && msg.contains("Canvas rendered") && msg.contains(canvas_type) {
            results.push(TestResult::pass("execute_tool render_canvas", format!("{}: {}", label, msg)));
        } else {
            results.push(TestResult::fail("execute_tool render_canvas", format!("{}: is_error={} msg={}", label, is_error, msg)));
        }
    }

    // 1-2: Full AI session — force render_canvas via system prompt
    println!("  [1-2] AI session → render_canvas 被调用");
    let system = concat!(
        "你是物理老师凛。你只有三个可用工具：think、respond_to_student、render_canvas。",
        "接到学生问题后必须按顺序完成：",
        "第一步：调用 respond_to_student（content 字段填写回答）；",
        "第二步：必须调用 render_canvas，参数 type=\"mermaid\"，content 必须是 graph LR 格式的 Mermaid 语法，title 填写图表标题。",
        "禁止调用其他任何工具。render_canvas 是强制步骤，不可跳过。"
    );
    match run_ai_loop(
        api_key,
        DEEPSEEK_PROVIDER,
        system,
        "请解释一下点电荷周围的电场是什么？",
        Some(&["think", "respond_to_student", "render_canvas"]),
    ).await {
        Ok(messages) => {
            let canvas_calls = find_tool_calls(&messages, "render_canvas");
            if canvas_calls.is_empty() {
                results.push(TestResult::fail("AI calls render_canvas", "AI 没有调用 render_canvas — 需要检查系统提示约束"));
            } else {
                let call = &canvas_calls[0];
                let content = call["content"].as_str().unwrap_or("");
                let c_type = call["type"].as_str().unwrap_or("");
                let title = call["title"].as_str().unwrap_or("");
                println!("    → type={}, title={:?}, content_len={}", c_type, title, content.len());
                println!("    → content preview: {}", &content[..content.len().min(100)]);

                if content.is_empty() {
                    results.push(TestResult::fail("AI render_canvas content", "content 为空"));
                } else if c_type == "mermaid" && !content.contains("graph") && !content.contains("sequenceDiagram") && !content.contains("flowchart") {
                    results.push(TestResult::fail("AI render_canvas mermaid", format!("内容不像合法 Mermaid: {}", &content[..50.min(content.len())])));
                } else {
                    results.push(TestResult::pass("AI calls render_canvas", format!("type={}, title={:?}, {} bytes", c_type, title, content.len())));
                }
            }
        }
        Err(e) => {
            results.push(TestResult::fail("AI session for render_canvas", e));
        }
    }

    results
}

// ═══════════════════════════════════════════════════════════════
//  T2 — GitHub OAuth Device Flow
// ═══════════════════════════════════════════════════════════════

async fn run_t2() -> Vec<TestResult> {
    separator("T2 — GitHub OAuth Device Flow");
    let mut results = Vec::new();

    // 2-1: Start Device Flow (real HTTP to GitHub)
    println!("  [2-1] start_github_device_flow() — 真实 HTTP");
    use socratic_novel_lib::commands::oauth_commands;
    match oauth_commands::start_github_device_flow().await {
        Ok(resp) => {
            println!("    → device_code: {}...", &resp.device_code[..resp.device_code.len().min(10)]);
            println!("    → user_code: {}", resp.user_code);
            println!("    → verification_uri: {}", resp.verification_uri);
            println!("    → expires_in: {}s, interval: {}s", resp.expires_in, resp.interval);

            // Validate user_code format: XXXX-XXXX
            let code_valid = resp.user_code.len() == 9
                && resp.user_code.chars().nth(4) == Some('-')
                && resp.user_code[..4].chars().all(|c| c.is_ascii_alphanumeric())
                && resp.user_code[5..].chars().all(|c| c.is_ascii_alphanumeric());

            if resp.device_code.is_empty() {
                results.push(TestResult::fail("Device Flow device_code", "为空"));
            } else {
                results.push(TestResult::pass("Device Flow device_code", format!("{}...（{}字符）", &resp.device_code[..8], resp.device_code.len())));
            }

            if code_valid {
                results.push(TestResult::pass("Device Flow user_code", format!("格式正确: {}", resp.user_code)));
            } else {
                results.push(TestResult::fail("Device Flow user_code", format!("格式异常（期望 XXXX-XXXX）: {}", resp.user_code)));
            }

            if resp.verification_uri.contains("github.com") {
                results.push(TestResult::pass("Device Flow verification_uri", resp.verification_uri.clone()));
            } else {
                results.push(TestResult::fail("Device Flow verification_uri", format!("不含 github.com: {}", resp.verification_uri)));
            }

            if resp.expires_in > 0 && resp.interval > 0 {
                results.push(TestResult::pass("Device Flow expires_in/interval", format!("expires_in={}s, interval={}s", resp.expires_in, resp.interval)));
            } else {
                results.push(TestResult::fail("Device Flow expires_in/interval", format!("expires_in={}, interval={}", resp.expires_in, resp.interval)));
            }
        }
        Err(e) => {
            results.push(TestResult::fail("start_github_device_flow", e));
            println!("    ⚠ 跳过 Device Flow 验证 (网络错误)");
        }
    }

    // 2-2: Credential store round-trip for github_token
    println!("  [2-2] github_token 凭证存储读写");
    let fake_token = "gho_fake_test_token_for_cli_testing_123456789";
    let set_ok = credential_store::set_password("github_token", fake_token).is_ok();
    if !set_ok {
        results.push(TestResult::fail("credential_store set github_token", "set_password 失败"));
    } else {
        match credential_store::get_password("github_token") {
            Ok(Some(v)) if v == fake_token => {
                results.push(TestResult::pass("credential_store github_token round-trip", "写入=读取 ✓"));
            }
            Ok(Some(v)) => {
                results.push(TestResult::fail("credential_store github_token round-trip", format!("读取值不匹配: {:?}", v)));
            }
            Ok(None) => {
                results.push(TestResult::fail("credential_store github_token round-trip", "读取为 None"));
            }
            Err(e) => {
                results.push(TestResult::fail("credential_store github_token round-trip", e));
            }
        }

        // 2-3: check_github_auth should now return true
        match oauth_commands::check_github_auth() {
            Ok(true) => results.push(TestResult::pass("check_github_auth (after store)", "true ✓")),
            Ok(false) => results.push(TestResult::fail("check_github_auth (after store)", "应为 true")),
            Err(e) => results.push(TestResult::fail("check_github_auth (after store)", e)),
        }

        // Cleanup
        let _ = credential_store::delete_password("github_token");
        match oauth_commands::check_github_auth() {
            Ok(false) => results.push(TestResult::pass("check_github_auth (after delete)", "false ✓")),
            Ok(true) => results.push(TestResult::fail("check_github_auth (after delete)", "删除后应为 false")),
            Err(e) => results.push(TestResult::fail("check_github_auth (after delete)", e)),
        }
    }

    results
}

// ═══════════════════════════════════════════════════════════════
//  T3 — Custom API Provider
// ═══════════════════════════════════════════════════════════════

async fn run_t3(api_key: &str) -> Vec<TestResult> {
    separator("T3 — Custom API Provider 接入");
    let mut results = Vec::new();

    // 3-1: validate_custom_url unit tests
    println!("  [3-1] validate_custom_url 安全校验");
    let cases = [
        ("http://api.deepseek.com/v1", false, "http:// 应被拒绝"),
        ("ftp://example.com", false, "非 https 应被拒绝"),
        ("https://api.deepseek.com/v1", true, "https:// 应通过"),
        ("https://api.openai.com/v1", true, "https:// 应通过"),
    ];
    for (url, expect_ok, label) in cases {
        use socratic_novel_lib::ai::runtime::validate_custom_url_pub;
        let ok = validate_custom_url_pub(url).is_ok();
        if ok == expect_ok {
            results.push(TestResult::pass("validate_custom_url", format!("{}: {} → {}", url, if ok { "Ok" } else { "Err" }, label)));
        } else {
            results.push(TestResult::fail("validate_custom_url", format!("{}: 期望 {} 实际 {} — {}", url, expect_ok, ok, label)));
        }
    }

    // 3-2: update_custom_provider + round-trip
    println!("  [3-2] update_custom_provider + get_custom_provider 读写");
    let config = settings_commands::CustomProviderConfig {
        custom_url: DEEPSEEK_URL.to_string(),
        api_key: api_key.to_string(),
        model: "deepseek-chat".to_string(),
        protocol: "openai-compatible".to_string(),
    };

    match settings_commands::update_custom_provider(config) {
        Ok(()) => {
            match settings_commands::get_custom_provider() {
                Ok(Some(read_back)) => {
                    let url_ok = read_back.custom_url == DEEPSEEK_URL;
                    let key_ok = read_back.api_key == api_key;
                    let model_ok = read_back.model == "deepseek-chat";
                    let proto_ok = read_back.protocol == "openai-compatible";
                    if url_ok && key_ok && model_ok && proto_ok {
                        results.push(TestResult::pass("update_custom_provider round-trip", "所有字段一致 ✓"));
                    } else {
                        let detail = format!("url={} key={} model={} proto={}", url_ok, key_ok, model_ok, proto_ok);
                        results.push(TestResult::fail("update_custom_provider round-trip", detail));
                    }
                }
                Ok(None) => results.push(TestResult::fail("get_custom_provider", "返回 None")),
                Err(e) => results.push(TestResult::fail("get_custom_provider", e)),
            }
        }
        Err(e) => results.push(TestResult::fail("update_custom_provider", e)),
    }

    // 3-3: Real API call via custom-openai provider
    println!("  [3-3] call_ai_simple via custom-openai → 真实 API 调用");
    // with_custom_url uses the URL directly as the POST endpoint (full URL required)
    let messages = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text { text: "Reply with exactly: PONG".to_string() }],
    }];
    match runtime::call_ai_simple(
        api_key,
        "custom-openai",
        "deepseek-chat",
        "You are a test bot. Reply exactly as instructed.",
        messages,
        Some(DEEPSEEK_URL),
    ).await {
        Ok(response) => {
            let trimmed = response.trim().to_uppercase();
            if trimmed.contains("PONG") {
                results.push(TestResult::pass("custom-openai API call", format!("响应: {:?}", response.trim())));
            } else {
                results.push(TestResult::fail("custom-openai API call", format!("未收到 PONG，响应: {:?}", &response[..response.len().min(100)])));
            }
        }
        Err(e) => results.push(TestResult::fail("custom-openai API call", e)),
    }

    // Cleanup custom provider credentials
    let _ = credential_store::delete_password("custom_provider_url");
    let _ = credential_store::delete_password("custom_provider_key");
    let _ = credential_store::delete_password("custom_provider_model");
    let _ = credential_store::delete_password("custom_provider_protocol");
    println!("  🧹 custom_provider 凭证已清理");

    results
}

// ═══════════════════════════════════════════════════════════════
//  T4 — AI Skills 可靠性
// ═══════════════════════════════════════════════════════════════

async fn run_t4(api_key: &str) -> Vec<TestResult> {
    separator("T4 — AI Skills 可靠性 (canvas/sandbox/group_chat)");
    let mut results = Vec::new();

    let ws = default_workspace();

    // 4-1: Direct execute_tool for all three skills
    println!("  [4-1] execute_tool 直接调用三个 Skill");

    // render_canvas
    let canvas_input = serde_json::json!({
        "title": "T4 Canvas Test",
        "content": "graph LR\n  A[T4] --> B[PASS]",
        "type": "mermaid"
    });
    let (msg, is_error) = tools::execute_tool(&ws, "render_canvas", &canvas_input, None);
    if !is_error && msg.contains("Canvas rendered") {
        results.push(TestResult::pass("execute_tool render_canvas", msg.clone()));
    } else {
        results.push(TestResult::fail("execute_tool render_canvas", format!("is_error={} msg={}", is_error, msg)));
    }

    // render_interactive_sandbox
    let sandbox_input = serde_json::json!({
        "title": "T4 Sandbox Test",
        "html": "<html><body><h1>Sandbox OK</h1><script>document.body.style.background='green'</script></body></html>"
    });
    let (msg, is_error) = tools::execute_tool(&ws, "render_interactive_sandbox", &sandbox_input, None);
    if !is_error && msg.contains("Sandbox rendered") {
        results.push(TestResult::pass("execute_tool render_interactive_sandbox", msg.clone()));
    } else {
        results.push(TestResult::fail("execute_tool render_interactive_sandbox", format!("is_error={} msg={}", is_error, msg)));
    }

    // show_group_chat
    let group_input = serde_json::json!({
        "messages": [
            {"sender": "TestUser", "content": "T4 group chat test", "avatar": "🤖"},
            {"sender": "TestBot", "content": "All skills verified!", "avatar": "✅"}
        ]
    });
    let (msg, is_error) = tools::execute_tool(&ws, "show_group_chat", &group_input, None);
    if !is_error && msg.contains("Group chat displayed") && msg.contains("2") {
        results.push(TestResult::pass("execute_tool show_group_chat", msg.clone()));
    } else {
        results.push(TestResult::fail("execute_tool show_group_chat", format!("is_error={} msg={}", is_error, msg)));
    }

    // 4-2a: AI session — force render_canvas only (no sandbox to confuse the AI)
    println!("  [4-2] AI session → render_canvas (force_tools 限制)");
    let sys_canvas = concat!(
        "你是物理老师凛。你只有三个可用工具：think、respond_to_student、render_canvas。",
        "回答问题后，必须调用 render_canvas，参数 type=\"mermaid\"，",
        "content 必须是合法的 Mermaid graph LR 语法，title 填写图表标题。",
        "render_canvas 是强制步骤，不可跳过。禁止调用任何其他工具。"
    );
    println!("  ⚙ 运行 AI session — render_canvas（约 30-60s）...");
    match run_ai_loop(
        api_key,
        DEEPSEEK_PROVIDER,
        sys_canvas,
        "高斯定律的核心思想是什么？请用 Mermaid 图展示。",
        Some(&["think", "respond_to_student", "render_canvas"]),
    ).await {
        Ok(messages) => {
            let canvas_calls = find_tool_calls(&messages, "render_canvas");
            println!("    → render_canvas: {} 次", canvas_calls.len());
            if !canvas_calls.is_empty() {
                let c = &canvas_calls[0];
                let content = c["content"].as_str().unwrap_or("");
                results.push(TestResult::pass("AI calls render_canvas (T4 session)", format!("type={}, {} bytes", c["type"].as_str().unwrap_or("?"), content.len())));
            } else {
                results.push(TestResult::fail("AI calls render_canvas (T4 session)", "AI 没有调用 render_canvas"));
            }
        }
        Err(e) => {
            results.push(TestResult::fail("AI calls render_canvas (T4 session)", e));
        }
    }

    // 4-2b: AI session — force show_group_chat only
    println!("  [4-3] AI session → show_group_chat (force_tools 限制)");
    let sys_group = concat!(
        "你是物理老师凛。你只有三个可用工具：think、respond_to_student、show_group_chat。",
        "回答完问题后，必须调用 show_group_chat，",
        "messages 参数为 2-3 条同学讨论消息的数组，每条含 sender（字符串）和 content（字符串）字段。",
        "show_group_chat 是强制步骤，不可跳过。禁止调用任何其他工具。"
    );
    println!("  ⚙ 运行 AI session — show_group_chat（约 30-60s）...");
    match run_ai_loop(
        api_key,
        DEEPSEEK_PROVIDER,
        sys_group,
        "高斯定律中同学们有什么常见疑问？请展示群聊讨论。",
        Some(&["think", "respond_to_student", "show_group_chat"]),
    ).await {
        Ok(messages) => {
            let group_calls = find_tool_calls(&messages, "show_group_chat");
            println!("    → show_group_chat: {} 次", group_calls.len());
            if !group_calls.is_empty() {
                let msgs = group_calls[0]["messages"].as_array().map(|a| a.len()).unwrap_or(0);
                results.push(TestResult::pass("AI calls show_group_chat (T4 session)", format!("{} 条群聊消息", msgs)));
            } else {
                results.push(TestResult::fail("AI calls show_group_chat (T4 session)", "AI 没有调用 show_group_chat"));
            }
        }
        Err(e) => {
            results.push(TestResult::fail("AI calls show_group_chat (T4 session)", e));
        }
    }

    results
}

// ═══════════════════════════════════════════════════════════════
//  main
// ═══════════════════════════════════════════════════════════════

#[tokio::main]
async fn main() {
    let api_key = std::env::var("API_KEY").unwrap_or_else(|_| {
        eprintln!("❌ 请设置 API_KEY: API_KEY=sk-... cargo run --example cli_test_runner");
        std::process::exit(1);
    });

    let args: Vec<String> = std::env::args().collect();
    let suite = args.windows(2)
        .find(|w| w[0] == "--suite")
        .map(|w| w[1].as_str())
        .unwrap_or("all");

    println!("\n╔═══════════════════════════════════════════════════╗");
    println!("║   SocraticNovel CLI Test Runner — T1-T4 Verify   ║");
    println!("║   Suite: {:<41}║", suite);
    println!("╚═══════════════════════════════════════════════════╝");

    let mut all_results: Vec<TestResult> = Vec::new();

    if suite == "t1" || suite == "all" {
        let r = run_t1(&api_key).await;
        for rr in &r { print_result(rr); }
        all_results.extend(r);
    }
    if suite == "t2" || suite == "all" {
        let r = run_t2().await;
        for rr in &r { print_result(rr); }
        all_results.extend(r);
    }
    if suite == "t3" || suite == "all" {
        let r = run_t3(&api_key).await;
        for rr in &r { print_result(rr); }
        all_results.extend(r);
    }
    if suite == "t4" || suite == "all" {
        let r = run_t4(&api_key).await;
        for rr in &r { print_result(rr); }
        all_results.extend(r);
    }

    // ─── Final Summary ─────────────────────────────────────────
    let passed = all_results.iter().filter(|r| r.passed).count();
    let failed = all_results.iter().filter(|r| !r.passed).count();
    let total = passed + failed;

    println!("\n╔═══════════════════════════════════════════════════╗");
    println!("║  SUMMARY                                          ║");
    println!("╠═══════════════════════════════════════════════════╣");
    for r in &all_results {
        let icon = if r.passed { "✅" } else { "❌" };
        println!("║  {} {:<46}║", icon, r.name);
    }
    println!("╠═══════════════════════════════════════════════════╣");
    if failed == 0 {
        println!("║  🎉 ALL {}/{} PASSED                               ║", passed, total);
    } else {
        println!("║  ⚠️  {}/{} passed, {} FAILED                       ║", passed, total, failed);
    }
    println!("╚═══════════════════════════════════════════════════╝");

    if failed > 0 {
        std::process::exit(1);
    }
}
