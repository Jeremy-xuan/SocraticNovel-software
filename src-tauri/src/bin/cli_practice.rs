//! Interactive CLI Practice Mode — full AI loop without GUI.
//!
//! Usage:
//!   API_KEY=sk-... cargo run --bin cli_practice
//!   API_KEY=sk-... PROVIDER=deepseek cargo run --bin cli_practice
//!
//! Commands during conversation:
//!   /notes    — generate review notes from the conversation
//!   /anki     — generate Anki cards from the conversation
//!   /quit     — exit
//!   /debug    — show raw message history
//!   anything else — send as a student message

use socratic_novel_lib::ai::{
    claude::ClaudeClient,
    openai::OpenAiClient,
    runtime::{self, build_practice_prompt},
    tools,
    types::*,
};
use std::io::{self, Write};

const MAX_LOOPS: usize = 10;
const GRACE_AFTER_RESPOND: usize = 1;
const WORKSPACE: &str = "/Users/wujunjie/SocraticNovel/workspaces/ap-physics-em";

#[tokio::main]
async fn main() {
    let api_key = std::env::var("API_KEY").unwrap_or_else(|_| {
        eprintln!("❌ Set API_KEY: API_KEY=sk-... cargo run --bin cli_practice");
        std::process::exit(1);
    });
    let provider = std::env::var("PROVIDER").unwrap_or("deepseek".into());

    println!("╔═══════════════════════════════════════════════════╗");
    println!("║   SocraticNovel CLI Practice Mode                 ║");
    println!("║   Provider: {:<38}║", provider);
    println!("║   /notes /anki /quit /debug                      ║");
    println!("╚═══════════════════════════════════════════════════╝");
    println!();

    // Build system prompt (using a default character base)
    let base_prompt = "你是凛——一个性格冷淡但内心温柔的物理老师。你用苏格拉底式提问引导学生思考。";
    let system_prompt = build_practice_prompt(base_prompt);

    let mut messages: Vec<Message> = Vec::new();

    loop {
        // Prompt for input
        print!("\n📝 学生 > ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        if io::stdin().read_line(&mut input).is_err() || input.is_empty() {
            break;
        }
        let input = input.trim().to_string();
        if input.is_empty() {
            continue;
        }

        // Handle commands
        match input.as_str() {
            "/quit" => {
                println!("👋 再见！");
                break;
            }
            "/notes" => {
                print_notes(&api_key, &provider, &messages).await;
                continue;
            }
            "/anki" => {
                print_anki(&api_key, &provider, &messages).await;
                continue;
            }
            "/debug" => {
                print_debug(&messages);
                continue;
            }
            _ => {}
        }

        // Add user message
        messages.push(Message {
            role: "user".to_string(),
            content: vec![ContentBlock::Text { text: input }],
        });

        // Run AI turn (multi-iteration tool loop)
        match run_practice_loop(&api_key, &provider, &system_prompt, &mut messages).await {
            Ok(student_text) => {
                println!("\n🎓 凛 >\n{}", student_text);
            }
            Err(e) => {
                eprintln!("\n❌ Error: {}", e);
            }
        }
    }
}

/// Run one practice turn: AI thinks, calls tools, responds.
/// Returns the text shown to student (from respond_to_student).
async fn run_practice_loop(
    api_key: &str,
    provider: &str,
    system_prompt: &str,
    messages: &mut Vec<Message>,
) -> Result<String, String> {
    let tool_defs = tools::get_practice_tools();
    let mut active_tools = tool_defs.clone();
    let mut student_text = String::new();
    let mut respond_called_at: Option<usize> = None;

    for iteration in 0..MAX_LOOPS {
        println!("  ⚙ iteration {}/{}", iteration + 1, MAX_LOOPS);

        // Call AI (non-streaming for CLI simplicity)
        let (content_blocks, stop_reason) = call_ai(
            api_key, provider, system_prompt,
            messages.clone(), &active_tools,
        ).await?;

        // Extract tool uses
        let tool_uses: Vec<(String, String, serde_json::Value)> = content_blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolUse { id, name, input } => {
                    Some((id.clone(), name.clone(), input.clone()))
                }
                _ => None,
            })
            .collect();

        // Print any text content (internal thinking)
        for block in &content_blocks {
            if let ContentBlock::Text { text } = block {
                if !text.is_empty() {
                    println!("  💭 [thinking] {}", truncate(text, 120));
                }
            }
        }

        // Add assistant message to history
        messages.push(Message {
            role: "assistant".to_string(),
            content: content_blocks,
        });

        // No tool calls → done
        if tool_uses.is_empty() || stop_reason.as_deref() == Some("end_turn") {
            println!("  ✓ end_turn (no tools)");
            break;
        }

        // Execute tools
        let mut tool_results: Vec<ContentBlock> = Vec::new();
        let _should_stop = false;

        for (tool_id, tool_name, input) in &tool_uses {
            println!("  🔧 {} {}", tool_name, format_tool_input(input));

            // Track respond_to_student
            if tool_name == "respond_to_student" && respond_called_at.is_none() {
                respond_called_at = Some(iteration);
                if let Some(content) = input["content"].as_str() {
                    student_text = content.to_string();
                }
                active_tools.retain(|t| t.name != "respond_to_student");
            }

            if tool_name == "think" {
                // think tool just returns "ok"
                tool_results.push(ContentBlock::ToolResult {
                    tool_use_id: tool_id.clone(),
                    content: "Thought recorded.".to_string(),
                    is_error: None,
                });
            } else {
                let (result, is_error) = tools::execute_tool(WORKSPACE, tool_name, input);
                println!("    → {}", truncate(&result, 100));
                tool_results.push(ContentBlock::ToolResult {
                    tool_use_id: tool_id.clone(),
                    content: result,
                    is_error: if is_error { Some(true) } else { None },
                });
            }
        }

        messages.push(Message {
            role: "user".to_string(),
            content: tool_results,
        });

        // Grace period
        if let Some(called_at) = respond_called_at {
            if iteration >= called_at + GRACE_AFTER_RESPOND {
                println!("  ✓ grace period done");
                break;
            }
        }
    }

    // Fallback: if respond_to_student wasn't called, show raw text
    if student_text.is_empty() {
        let raw: String = messages.iter()
            .rev()
            .take(3)
            .flat_map(|m| m.content.iter())
            .filter_map(|b| if let ContentBlock::Text { text } = b { Some(text.as_str()) } else { None })
            .collect::<Vec<_>>()
            .join("\n");
        if !raw.is_empty() {
            student_text = format!("[⚠ raw text — AI didn't use respond_to_student]\n{}", raw);
        }
    }

    Ok(student_text)
}

/// Call the AI provider (non-streaming).
async fn call_ai(
    api_key: &str,
    provider: &str,
    system: &str,
    messages: Vec<Message>,
    tools: &[ToolDefinition],
) -> Result<(Vec<ContentBlock>, Option<String>), String> {
    let tool_opt = if tools.is_empty() { None } else { Some(tools.to_vec()) };
    match provider {
        "anthropic" => {
            let client = ClaudeClient::new(api_key.to_string());
            client.send_message(system, messages, tool_opt).await
        }
        "openai" | "deepseek" | "google" => {
            let client = OpenAiClient::new(api_key.to_string(), provider);
            client.send_message(system, messages, tool_opt).await
        }
        _ => Err(format!("Unknown provider: {}", provider)),
    }
}

/// Generate and print notes.
async fn print_notes(api_key: &str, provider: &str, messages: &[Message]) {
    if messages.is_empty() {
        println!("⚠ 还没有对话记录，先发送一些题目吧。");
        return;
    }
    println!("\n📓 生成笔记中...");
    match runtime::generate_notes(api_key, provider, messages).await {
        Ok(notes) => {
            println!("═══════════════ 笔记 ═══════════════");
            println!("{}", notes);
            println!("═══════════════════════════════════");
        }
        Err(e) => eprintln!("❌ 笔记生成失败: {}", e),
    }
}

/// Generate and print Anki cards.
async fn print_anki(api_key: &str, provider: &str, messages: &[Message]) {
    if messages.is_empty() {
        println!("⚠ 还没有对话记录，先发送一些题目吧。");
        return;
    }
    println!("\n🃏 生成 Anki 卡片中...");
    match runtime::generate_anki_cards(api_key, provider, messages).await {
        Ok(tsv) => {
            let count = tsv.lines().filter(|l| l.contains('\t')).count();
            println!("═══════════ Anki Cards ({}) ═══════════", count);
            println!("{}", tsv);
            println!("═══════════════════════════════════");
        }
        Err(e) => eprintln!("❌ Anki 生成失败: {}", e),
    }
}

/// Print raw message history for debugging.
fn print_debug(messages: &[Message]) {
    println!("\n═══════════ Messages ({}) ═══════════", messages.len());
    for (i, msg) in messages.iter().enumerate() {
        println!("  [{}] role={}", i, msg.role);
        for block in &msg.content {
            match block {
                ContentBlock::Text { text } => {
                    println!("      Text: {}", truncate(text, 80));
                }
                ContentBlock::ToolUse { id, name, input } => {
                    println!("      ToolUse: {} ({})", name, id);
                    println!("        input: {}", truncate(&input.to_string(), 100));
                }
                ContentBlock::ToolResult { tool_use_id, content, is_error } => {
                    println!("      ToolResult: {} err={:?}", tool_use_id, is_error);
                    println!("        {}", truncate(content, 80));
                }
            }
        }
    }
    println!("═══════════════════════════════════");
}

fn truncate(s: &str, max: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max {
        s.to_string()
    } else {
        format!("{}...", chars[..max].iter().collect::<String>())
    }
}

fn format_tool_input(input: &serde_json::Value) -> String {
    if let Some(content) = input["content"].as_str() {
        return truncate(content, 60);
    }
    if let Some(thought) = input["thought"].as_str() {
        return truncate(thought, 60);
    }
    if let Some(path) = input["path"].as_str() {
        return path.to_string();
    }
    truncate(&input.to_string(), 60)
}
