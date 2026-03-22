use super::claude::ClaudeClient;
use super::tools;
use super::types::*;
use tauri::{Emitter, AppHandle};

const MAX_TOOL_LOOPS: usize = 20;

/// Run the full AI agent loop:
/// 1. Send messages to Claude
/// 2. If Claude returns tool_use → execute tools → feed results back → repeat
/// 3. If Claude returns text (end_turn) → emit to frontend → done
pub async fn run_agent_turn(
    app: &AppHandle,
    api_key: &str,
    workspace_path: &str,
    system_prompt: &str,
    mut messages: Vec<Message>,
) -> Result<Vec<Message>, String> {
    let client = ClaudeClient::new(api_key.to_string());
    let tool_defs = tools::get_tool_definitions();

    for iteration in 0..MAX_TOOL_LOOPS {
        // Send to Claude (non-streaming for tool-use reliability)
        let (content_blocks, stop_reason) = client
            .send_message(system_prompt, messages.clone(), Some(tool_defs.clone()))
            .await?;

        // Collect text and tool calls from response
        let mut full_text = String::new();
        let mut tool_uses: Vec<(String, String, serde_json::Value)> = Vec::new();
        let mut canvas_events: Vec<(String, String)> = Vec::new();

        for block in &content_blocks {
            match block {
                ContentBlock::Text { text } => {
                    full_text.push_str(text);
                    // Emit text delta to frontend
                    let _ = app.emit("agent-event", AgentEvent::TextDelta {
                        text: text.clone(),
                    });
                }
                ContentBlock::ToolUse { id, name, input } => {
                    tool_uses.push((id.clone(), name.clone(), input.clone()));

                    // Check if this is a render_canvas call
                    if name == "render_canvas" {
                        let title = input["title"].as_str().unwrap_or("Canvas").to_string();
                        let content = input["content"].as_str().unwrap_or("").to_string();
                        canvas_events.push((title, content));
                    }

                    let _ = app.emit("agent-event", AgentEvent::ToolCallStart {
                        id: id.clone(),
                        name: name.clone(),
                    });
                }
                _ => {}
            }
        }

        // Emit full text if any
        if !full_text.is_empty() {
            let _ = app.emit("agent-event", AgentEvent::MessageDone {
                full_text: full_text.clone(),
            });
        }

        // Emit canvas events
        for (title, content) in canvas_events {
            let _ = app.emit("canvas-event", serde_json::json!({
                "title": title,
                "content": content,
            }));
        }

        // Add assistant message to conversation
        messages.push(Message {
            role: "assistant".to_string(),
            content: content_blocks,
        });

        // If no tool calls, we're done
        if tool_uses.is_empty() || stop_reason.as_deref() == Some("end_turn") {
            let _ = app.emit("agent-event", AgentEvent::TurnComplete);
            break;
        }

        // Execute tool calls and build tool results
        let mut tool_results: Vec<ContentBlock> = Vec::new();
        for (tool_id, tool_name, input) in &tool_uses {
            let (result, is_error) = tools::execute_tool(workspace_path, tool_name, input);

            let _ = app.emit("agent-event", AgentEvent::ToolCallResult {
                id: tool_id.clone(),
                result: result.clone(),
                is_error,
            });

            tool_results.push(ContentBlock::ToolResult {
                tool_use_id: tool_id.clone(),
                content: result,
                is_error: if is_error { Some(true) } else { None },
            });
        }

        // Add tool results as user message
        messages.push(Message {
            role: "user".to_string(),
            content: tool_results,
        });

        // Safety check
        if iteration == MAX_TOOL_LOOPS - 1 {
            let _ = app.emit("agent-event", AgentEvent::Error {
                message: "Maximum tool-use iterations reached".to_string(),
            });
        }
    }

    Ok(messages)
}
