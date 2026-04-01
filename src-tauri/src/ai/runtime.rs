use super::claude::ClaudeClient;
use super::openai::OpenAiClient;
use super::tools;
use super::types::*;
use futures_util::StreamExt;
use tauri::{Emitter, AppHandle};

const MAX_TOOL_LOOPS: usize = 50;

// ─── Multi-Agent Phase Constants ──────────────────────────────────

const MAX_PREP_LOOPS: usize = 25;
const MAX_TEACHING_LOOPS: usize = 10;
const MAX_POST_LOOPS: usize = 20;
const MAX_PRACTICE_LOOPS: usize = 10;
const MAX_META_PROMPT_LOOPS: usize = 30;
// After respond_to_student, allow 1 more iteration for follow-up tools (group_chat, canvas)
// but respond_to_student itself is removed from available tools to prevent repeat calls
const GRACE_AFTER_RESPOND: usize = 1;

/// Which phase of the multi-agent pipeline we're running
pub enum AgentPhase {
    Legacy,      // Existing single-agent behavior (backward compat)
    Prep,        // Lesson preparation — reads files, generates lesson_brief
    Teaching,    // Interactive teaching — respond_to_student only
    PostLesson,  // Post-lesson — updates runtime files
    Practice,    // Practice/drill — student sends problems, AI guides with file access
    MetaPrompt,  // Meta Prompt — AI guides user through creating a new teaching system
}

/// Result from a phase loop execution
pub struct PhaseResult {
    pub messages: Vec<Message>,
    pub student_text: String,
    pub lesson_brief: Option<String>,
}

// ─── Incremental respond_to_student content streamer ──────────────

/// Extracts the "content" string value from partial JSON as it streams in.
/// Enables character-by-character streaming of respond_to_student output.
struct RespondContentStreamer {
    json_buffer: String,
    content_started: bool,
    content_ended: bool,
    emitted_len: usize,
}

impl RespondContentStreamer {
    fn new() -> Self {
        Self { json_buffer: String::new(), content_started: false, content_ended: false, emitted_len: 0 }
    }

    /// Feed a JSON fragment and return any new extractable content text.
    fn feed(&mut self, partial: &str) -> Option<String> {
        if self.content_ended { return None; }
        self.json_buffer.push_str(partial);

        if !self.content_started {
            for pattern in ["\"content\": \"", "\"content\":\""] {
                if let Some(idx) = self.json_buffer.find(pattern) {
                    self.content_started = true;
                    self.emitted_len = idx + pattern.len();
                    return self.extract_new_content();
                }
            }
            None
        } else {
            self.extract_new_content()
        }
    }

    fn extract_new_content(&mut self) -> Option<String> {
        let available = &self.json_buffer[self.emitted_len..];
        if available.is_empty() { return None; }

        let mut result = String::new();
        let mut chars = available.chars().peekable();
        let mut consumed = 0;

        while let Some(ch) = chars.next() {
            match ch {
                '\\' => {
                    if let Some(&next) = chars.peek() {
                        chars.next();
                        consumed += ch.len_utf8() + next.len_utf8();
                        match next {
                            '"' => result.push('"'),
                            '\\' => result.push('\\'),
                            'n' => result.push('\n'),
                            't' => result.push('\t'),
                            'r' => result.push('\r'),
                            '/' => result.push('/'),
                            _ => { result.push('\\'); result.push(next); }
                        }
                    } else {
                        break; // Incomplete escape — wait for more data
                    }
                }
                '"' => {
                    consumed += ch.len_utf8();
                    self.content_ended = true; // Stop processing after closing quote
                    break;
                }
                _ => {
                    result.push(ch);
                    consumed += ch.len_utf8();
                }
            }
        }

        self.emitted_len += consumed;
        if result.is_empty() { None } else { Some(result) }
    }
}

// ─── Output Length Limiter ─────────────────────────────────────────

/// Tracks respond_to_student output length and truncates after a question mark.
struct OutputLimiter {
    chars_emitted: usize,
    saw_question: bool,
    chars_after_question: usize,
    truncated: bool,
}

impl OutputLimiter {
    fn new() -> Self {
        Self { chars_emitted: 0, saw_question: false, chars_after_question: 0, truncated: false }
    }

    /// Returns true if this text chunk should be emitted to the frontend.
    fn should_emit(&mut self, text: &str) -> bool {
        if self.truncated { return false; }

        let new_chars = text.chars().count();
        self.chars_emitted += new_chars;

        if text.contains('？') || text.contains('?') {
            self.saw_question = true;
            self.chars_after_question = 0;
        }

        if self.saw_question {
            self.chars_after_question += new_chars;
        }

        // After a question + 200 chars cooldown, truncate
        if self.saw_question && self.chars_after_question > 200 {
            self.truncated = true;
            println!("[Truncation] Output cut after question + {} trailing chars (total: {})",
                self.chars_after_question, self.chars_emitted);
        }

        // Hard limit at 1500 chars
        if self.chars_emitted > 1500 {
            self.truncated = true;
            println!("[Truncation] Hard limit reached at {} chars", self.chars_emitted);
        }

        !self.truncated
    }
}

// ─── SSE Parser ───────────────────────────────────────────────────

/// Parse complete SSE events from a buffer. Leaves partial data in buffer.
fn parse_sse_events(buffer: &mut String) -> Vec<StreamEvent> {
    let mut events = Vec::new();
    while let Some(event_end) = buffer.find("\n\n") {
        let event_str = buffer[..event_end].to_string();
        *buffer = buffer[event_end + 2..].to_string();

        let mut data_line = None;
        for line in event_str.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                data_line = Some(data.to_string());
            }
        }

        if let Some(data) = data_line {
            if data == "[DONE]" { continue; }
            if let Ok(event) = serde_json::from_str::<StreamEvent>(&data) {
                events.push(event);
            }
        }
    }
    events
}

/// Resolve protocol and client type from provider + custom URL.
/// Returns (protocol_label, client_type) where:
/// - protocol_label: "openai-compatible" | "anthropic-compatible" (for error messages)
/// - client_type: "openai" | "claude" (for match dispatch)
fn resolve_protocol_and_client(
    provider: &str,
    custom_url: Option<&str>,
) -> (&'static str, &'static str) {
    match provider {
        // Built-in providers
        "anthropic" => ("anthropic", "claude"),
        "openai" | "deepseek" | "google" | "github" => ("openai-compatible", "openai"),
        // Custom providers
        "custom-openai" | "custom" => ("openai-compatible", "openai"),
        "custom-anthropic" => ("anthropic-compatible", "claude"),
        // Fallback
        _ => {
            // Auto-detect from URL if provided
            if let Some(url) = custom_url {
                if url.contains("api.anthropic.com") {
                    return ("anthropic-compatible", "claude");
                }
            }
            ("openai-compatible", "openai")
        }
    }
}

/// Validate that a custom URL uses HTTPS (MITM attack mitigation).
/// Returns Ok(()) if valid, Err(message) if invalid.
fn validate_custom_url(url: &str) -> Result<(), String> {
    validate_custom_url_pub(url)
}

/// Public alias for testing — same logic as validate_custom_url.
pub fn validate_custom_url_pub(url: &str) -> Result<(), String> {
    if url.starts_with("https://") {
        return Ok(());
    }
    // Reject anything that's not https:// (including http://, ftp://, etc.)
    Err(
        if url.starts_with("http://") {
            "HTTP URLs are not allowed. Please use HTTPS to protect your API Key.".to_string()
        } else {
            format!("Invalid URL format: '{}'. Must start with https://", url)
        }
    )
}


// ─── Claude Streaming Processor ───────────────────────────────────

/// Process a Claude streaming response. Emits events to frontend in real-time,
/// including incremental respond_to_student content.
async fn process_claude_streaming(
    app: &AppHandle,
    client: &ClaudeClient,
    system_prompt: &str,
    messages: Vec<Message>,
    tool_defs: &[ToolDefinition],
    student_text: &mut String,
    all_raw_text: &mut String,
    mut output_limiter: Option<&mut OutputLimiter>,
) -> Result<(Vec<ContentBlock>, Option<String>), String> {
    let response = client
        .start_streaming(system_prompt, messages, Some(tool_defs.to_vec()))
        .await?;

    let mut stream = response.bytes_stream();
    let mut sse_buffer = String::new();

    let mut content_blocks: Vec<ContentBlock> = Vec::new();
    let mut stop_reason: Option<String> = None;

    // Current block tracking
    let mut current_text = String::new();
    let mut in_tool_block = false;
    let mut current_tool_id = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_json = String::new();
    let mut respond_streamer: Option<RespondContentStreamer> = None;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

        for event in parse_sse_events(&mut sse_buffer) {
            match event {
                StreamEvent::ContentBlockStart { content_block, .. } => {
                    match content_block {
                        ContentBlockStartData::Text { .. } => {
                            current_text.clear();
                            in_tool_block = false;
                        }
                        ContentBlockStartData::ToolUse { id, name } => {
                            current_tool_id = id.clone();
                            current_tool_name = name.clone();
                            current_tool_json.clear();
                            in_tool_block = true;

                            if name == "respond_to_student" {
                                respond_streamer = Some(RespondContentStreamer::new());
                            }

                            let _ = app.emit("agent-event", AgentEvent::ToolCallStart {
                                id, name,
                            });
                        }
                    }
                }
                StreamEvent::ContentBlockDelta { delta, .. } => {
                    match delta {
                        DeltaData::TextDelta { text } => {
                            current_text.push_str(&text);
                        }
                        DeltaData::InputJsonDelta { partial_json } => {
                            current_tool_json.push_str(&partial_json);

                            // Incremental respond_to_student streaming
                            if let Some(ref mut streamer) = respond_streamer {
                                if let Some(text_chunk) = streamer.feed(&partial_json) {
                                    // Apply output limiter for Teaching phase
                                    let should_emit = match output_limiter {
                                        Some(ref mut limiter) => limiter.should_emit(&text_chunk),
                                        None => true,
                                    };
                                    if should_emit {
                                        let _ = app.emit("agent-event", AgentEvent::TextDelta {
                                            text: text_chunk.clone(),
                                        });
                                    }
                                    student_text.push_str(&text_chunk);
                                }
                            }
                        }
                    }
                }
                StreamEvent::ContentBlockStop { .. } => {
                    if in_tool_block {
                        let input: serde_json::Value =
                            serde_json::from_str(&current_tool_json)
                                .unwrap_or(serde_json::json!({}));

                        respond_streamer = None;

                        // Canvas/group-chat events are emitted by Skill layer (tools.rs execute_tool)
                        // after streaming completes. Do NOT emit here to avoid duplicate events.

                        content_blocks.push(ContentBlock::ToolUse {
                            id: current_tool_id.clone(),
                            name: current_tool_name.clone(),
                            input,
                        });
                        in_tool_block = false;
                    } else {
                        all_raw_text.push_str(&current_text);
                        content_blocks.push(ContentBlock::Text {
                            text: current_text.clone(),
                        });
                        current_text.clear();
                    }
                }
                StreamEvent::MessageDelta { delta } => {
                    stop_reason = delta.stop_reason;
                }
                _ => {}
            }
        }
    }

    Ok((content_blocks, stop_reason))
}

// ─── Non-streaming event emission ─────────────────────────────────

/// Emit frontend events for a non-streaming response (fallback only).
#[allow(dead_code)]
fn emit_non_streaming_events(
    app: &AppHandle,
    content_blocks: &[ContentBlock],
    student_text: &mut String,
    all_raw_text: &mut String,
) {
    for block in content_blocks {
        match block {
            ContentBlock::Text { text } => {
                all_raw_text.push_str(text);
            }
            ContentBlock::ToolUse { id, name, input } => {
                if name == "respond_to_student" {
                    let content = input["content"].as_str().unwrap_or("").to_string();
                    if !content.is_empty() {
                        let _ = app.emit("agent-event", AgentEvent::TextDelta {
                            text: content.clone(),
                        });
                        student_text.push_str(&content);
                    }
                }
                if name == "render_canvas" || name == "render_interactive_sandbox" {
                    // Fallback: only emit if Skill layer didn't already send
                    if !tools::canvas_event_was_sent(app) {
                        if name == "render_canvas" {
                            let _ = app.emit("canvas-event", serde_json::json!({
                                "title": input["title"].as_str().unwrap_or("Canvas"),
                                "content": input["content"].as_str().unwrap_or(""),
                                "type": input["type"].as_str().unwrap_or("svg"),
                                "parameters": input["parameters"].clone(),
                            }));
                        } else {
                            let _ = app.emit("canvas-event", serde_json::json!({
                                "title": input["title"].as_str().unwrap_or("Interactive Sandbox"),
                                "content": input["html"].as_str().unwrap_or(""),
                                "type": "sandbox",
                                "sandboxState": input["initial_state"].clone(),
                            }));
                        }
                    }
                }
                if name == "show_group_chat" {
                    // Fallback: only emit if Skill layer didn't already send
                    if !tools::canvas_event_was_sent(app) {
                        if let Some(messages) = input["messages"].as_array() {
                            let _ = app.emit("group-chat-event", serde_json::json!({ "messages": messages }));
                        }
                    }
                }
                let _ = app.emit("agent-event", AgentEvent::ToolCallStart {
                    id: id.clone(),
                    name: name.clone(),
                });
            }
            _ => {}
        }
    }
}

// ─── OpenAI-compatible Streaming Processor ────────────────────────

/// Process an OpenAI-compatible streaming response (OpenAI, DeepSeek, Google).
/// Handles tool_calls deltas, content deltas, and incremental respond_to_student.
async fn process_openai_streaming(
    app: &AppHandle,
    client: &OpenAiClient,
    system_prompt: &str,
    messages: Vec<Message>,
    tool_defs: &[ToolDefinition],
    student_text: &mut String,
    all_raw_text: &mut String,
    mut output_limiter: Option<&mut OutputLimiter>,
) -> Result<(Vec<ContentBlock>, Option<String>), String> {
    let response = client
        .start_streaming(system_prompt, messages, Some(tool_defs.to_vec()))
        .await?;

    let mut stream = response.bytes_stream();
    let mut sse_buffer = String::new();

    let mut stop_reason: Option<String> = None;
    let mut current_text = String::new();

    // Tool call accumulators indexed by tool_call position
    let mut tool_accums: Vec<(String, String, String)> = Vec::new(); // (id, name, json_args)
    let mut respond_streamers: Vec<Option<RespondContentStreamer>> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Parse SSE data lines
        while let Some(event_end) = sse_buffer.find("\n\n") {
            let event_str = sse_buffer[..event_end].to_string();
            sse_buffer = sse_buffer[event_end + 2..].to_string();

            let mut data_line = None;
            for line in event_str.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    data_line = Some(data.to_string());
                }
            }

            let data = match data_line {
                Some(d) if d != "[DONE]" => d,
                _ => continue,
            };

            let parsed: serde_json::Value = match serde_json::from_str(&data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let choice = match parsed["choices"].as_array().and_then(|c| c.first()) {
                Some(c) => c,
                None => continue,
            };

            let delta = &choice["delta"];

            // Capture finish_reason
            if let Some(fr) = choice["finish_reason"].as_str() {
                stop_reason = Some(match fr {
                    "stop" => "end_turn".to_string(),
                    "tool_calls" => "tool_use".to_string(),
                    other => other.to_string(),
                });
            }

            // Text content delta (suppressed — internal thinking)
            if let Some(content) = delta["content"].as_str() {
                current_text.push_str(content);
            }
            // reasoning_content (DeepSeek-reasoner) — intentionally ignored

            // Tool call deltas
            if let Some(tool_calls) = delta["tool_calls"].as_array() {
                for tc_delta in tool_calls {
                    let index = tc_delta["index"].as_u64().unwrap_or(0) as usize;

                    // Ensure accumulator exists for this index
                    while tool_accums.len() <= index {
                        tool_accums.push((String::new(), String::new(), String::new()));
                        respond_streamers.push(None);
                    }

                    // Capture id and name on first appearance
                    if let Some(id) = tc_delta["id"].as_str() {
                        tool_accums[index].0 = id.to_string();
                    }
                    if let Some(name) = tc_delta["function"]["name"].as_str() {
                        tool_accums[index].1 = name.to_string();

                        let _ = app.emit("agent-event", AgentEvent::ToolCallStart {
                            id: tool_accums[index].0.clone(),
                            name: name.to_string(),
                        });

                        if name == "respond_to_student" {
                            respond_streamers[index] = Some(RespondContentStreamer::new());
                        }
                    }

                    // Accumulate function arguments
                    if let Some(args) = tc_delta["function"]["arguments"].as_str() {
                        tool_accums[index].2.push_str(args);

                        // Incremental respond_to_student streaming
                        if let Some(ref mut streamer) = respond_streamers[index] {
                            if let Some(text_chunk) = streamer.feed(args) {
                                // Apply output limiter for Teaching phase
                                let should_emit = match output_limiter {
                                    Some(ref mut limiter) => limiter.should_emit(&text_chunk),
                                    None => true,
                                };
                                if should_emit {
                                    let _ = app.emit("agent-event", AgentEvent::TextDelta {
                                        text: text_chunk.clone(),
                                    });
                                }
                                student_text.push_str(&text_chunk);
                            }
                        }
                    }
                }
            }
        }
    }

    // Assemble content blocks
    let mut content_blocks: Vec<ContentBlock> = Vec::new();

    if !current_text.is_empty() {
        all_raw_text.push_str(&current_text);
        content_blocks.push(ContentBlock::Text { text: current_text });
    }

    for (id, name, json_args) in tool_accums {
        if name.is_empty() { continue; }

        let input: serde_json::Value =
            serde_json::from_str(&json_args).unwrap_or(serde_json::json!({}));

        // Canvas/group-chat events are emitted by Skill layer in execute_tool (tools.rs).
        // No fallback needed here — execute_tool is always called with a real AppHandle
        // in run_phase_loop (line 943: execute_tool(..., Some(app))).
        content_blocks.push(ContentBlock::ToolUse { id, name, input });
    }

    Ok((content_blocks, stop_reason))
}

// ─── Main Agent Loop ──────────────────────────────────────────────

/// Run the full AI agent loop:
/// 1. Send messages (streaming for Claude, non-streaming for others)
/// 2. If AI returns tool_use → execute tools → feed results back → repeat
/// 3. Emit respond_to_student content to frontend in real-time
pub async fn run_agent_turn(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    mut messages: Vec<Message>,
    custom_url: Option<&str>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_tool_definitions();

    // Augment system prompt: AI must use respond_to_student tool for all visible output
    let system_prompt = format!(
        "[Desktop App Instructions]\n\
        You MUST use the `respond_to_student` tool to send ALL visible content to the student. \
        Direct text output is treated as silent internal thinking and will NOT be shown to the student. \
        After calling respond_to_student, end your turn unless you have more tools to call.\n\n\
        [Output Rules]\n\
        - Each respond_to_student call is one \"turn\". Keep it SHORT: 1-3 sentences + one question. Then STOP.\n\
        - After asking the student a question, STOP IMMEDIATELY. Do not answer your own question. Do not continue teaching.\n\
        - One question per turn. Wait for the student's response before continuing.\n\n\
        [Canvas Diagrams — MANDATORY]\n\
        - You HAVE the `render_canvas` tool. NEVER say you cannot draw, render, or display diagrams.\n\
        - CRITICAL: Do NOT embed Mermaid code (```mermaid...```) inside respond_to_student text. \
          Mermaid code blocks in text will NOT be rendered as diagrams — they appear as raw text.\n\
        - To show a diagram: call render_canvas with type=\"mermaid\" and the diagram code in \"content\" field. Then call respond_to_student.\n\
        - Use type=\"mermaid\" for all graphs/flows/diagrams. Use type=\"svg\" only for custom SVG markup.\n\
        - NEVER apologize for being unable to render — just call the tool.\n\n\
        {}", system_prompt
    );

    let mut student_text = String::new();
    let mut all_raw_text = String::new();
    // After respond_to_student is called, allow a few more iterations for
    // follow-up tools (show_group_chat, render_canvas, write_file), then stop.
    let mut respond_called_at: Option<usize> = None;
    const GRACE_AFTER_RESPOND: usize = 3;

    for iteration in 0..MAX_TOOL_LOOPS {
        // Reset canvas event state at the start of each iteration
        tools::reset_canvas_event_state(app);
        println!("[Agent] Iteration {}/{}", iteration + 1, MAX_TOOL_LOOPS);
        // Step 1: Get response from AI provider
        let (content_blocks, stop_reason) = match provider {
            "anthropic" => {
                let client = ClaudeClient::with_model(api_key.to_string(), model);
                process_claude_streaming(
                    app, &client, &system_prompt, messages.clone(), &tool_defs,
                    &mut student_text, &mut all_raw_text,
                    None, // Legacy path: no output limiter
                ).await?
            }
            "openai" | "deepseek" | "google" | "github" => {
                let client = OpenAiClient::with_model(api_key.to_string(), provider, model);
                process_openai_streaming(
                    app, &client, &system_prompt, messages.clone(), &tool_defs,
                    &mut student_text, &mut all_raw_text,
                    None, // Legacy path: no output limiter
                ).await?
            }
            "custom-openai" | "custom" => {
                if let Some(url) = custom_url {
                    validate_custom_url(url)?;
                    let client = OpenAiClient::with_custom_url(
                        api_key.to_string(),
                        url.to_string(),
                        model.to_string(),
                    );
                    process_openai_streaming(
                        app, &client, &system_prompt, messages.clone(), &tool_defs,
                        &mut student_text, &mut all_raw_text,
                        None, // Legacy path: no output limiter
                    ).await?
                } else {
                    return Err("custom_url is required for custom provider".to_string());
                }
            }
            "custom-anthropic" => {
                if let Some(url) = custom_url {
                    validate_custom_url(url)?;
                    let client = ClaudeClient::with_custom_url(
                        api_key.to_string(),
                        url.to_string(),
                        model.to_string(),
                    );
                    process_claude_streaming(
                        app, &client, &system_prompt, messages.clone(), &tool_defs,
                        &mut student_text, &mut all_raw_text,
                        None, // Legacy path: no output limiter
                    ).await?
                } else {
                    return Err("custom_url is required for custom provider".to_string());
                }
            }
            _ => {
                return Err(format!("Unsupported provider: {}", provider));
            }
        };

        // Tool calling detection for custom providers
        let tools_were_requested = !tool_defs.is_empty();
        let tool_calls_found = content_blocks.iter().any(|b| matches!(b, ContentBlock::ToolUse { .. }));
        if tools_were_requested && !tool_calls_found {
            // Only for custom providers — built-in providers are known to support tool calling
            if provider.starts_with("custom-") || provider == "custom" {
                return Err("自定义 Provider 不支持 tool calling 功能。请选择'纯文本模式'或更换支持 function calling 的模型。".to_string());
            }
        }

        // Step 2: Extract tool uses before moving content_blocks
        let tool_uses: Vec<(String, String, serde_json::Value)> = content_blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolUse { id, name, input } => {
                    Some((id.clone(), name.clone(), input.clone()))
                }
                _ => None,
            })
            .collect();

        // Step 3: Add assistant message to conversation
        messages.push(Message {
            role: "assistant".to_string(),
            content: content_blocks,
        });

        // Step 4: If no tool calls, we're done
        if tool_uses.is_empty() || stop_reason.as_deref() == Some("end_turn") {
            break;
        }

        // Step 5: Execute tool calls and build results
        let mut tool_results: Vec<ContentBlock> = Vec::new();
        for (tool_id, tool_name, input) in &tool_uses {
            // Track when respond_to_student is first called
            if tool_name == "respond_to_student" && respond_called_at.is_none() {
                respond_called_at = Some(iteration);
                println!("[Agent] respond_to_student called at iteration {}", iteration + 1);
            }

            let (result, is_error) = tools::execute_tool(workspace_path, tool_name, input, Some(app));

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

        messages.push(Message {
            role: "user".to_string(),
            content: tool_results,
        });

        // After respond_to_student, allow a grace period for follow-up tools
        // (show_group_chat, render_canvas, write_file), then force stop.
        if let Some(called_at) = respond_called_at {
            if iteration >= called_at + GRACE_AFTER_RESPOND {
                println!("[Agent] Stopping: grace period after respond_to_student exceeded ({} iterations)", iteration - called_at);
                break;
            }
        }

        // Safety check
        if iteration == MAX_TOOL_LOOPS - 1 {
            let _ = app.emit("agent-event", AgentEvent::Error {
                message: "Maximum tool-use iterations reached".to_string(),
            });
        }
    }

    // Fallback: if AI never used respond_to_student but produced text, show it
    if student_text.is_empty() && !all_raw_text.is_empty() {
        println!("[Warning] AI did not use respond_to_student — showing raw text as fallback");
        let _ = app.emit("agent-event", AgentEvent::TextDelta {
            text: all_raw_text.clone(),
        });
        student_text = all_raw_text;
    }

    // Emit final events
    if !student_text.is_empty() {
        let _ = app.emit("agent-event", AgentEvent::MessageDone {
            full_text: student_text,
        });
    }
    let _ = app.emit("agent-event", AgentEvent::TurnComplete);

    Ok(messages)
}

// ─── Multi-Agent Phase Loop ───────────────────────────────────────

/// Generic agent loop that handles all phases. Phase-specific behavior
/// (grace period, lesson_brief capture, event emission) is controlled
/// by the `phase` parameter.
async fn run_phase_loop(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    mut messages: Vec<Message>,
    tool_defs: &[ToolDefinition],
    max_loops: usize,
    phase: &AgentPhase,
    custom_url: Option<&str>,
) -> Result<PhaseResult, String> {
    let mut student_text = String::new();
    let mut all_raw_text = String::new();
    let mut respond_called_at: Option<usize> = None;
    let mut lesson_brief: Option<String> = None;
    // Mutable copy of tool definitions — we remove respond_to_student after it's called
    let mut active_tools: Vec<ToolDefinition> = tool_defs.to_vec();
    // Output limiter: active only in Teaching/Practice phases to enforce Socratic pacing
    let use_limiter = matches!(phase, AgentPhase::Teaching | AgentPhase::Practice);
    let mut output_limiter = if use_limiter { Some(OutputLimiter::new()) } else { None };

    for iteration in 0..max_loops {
        // Reset canvas event state at the start of each iteration
        tools::reset_canvas_event_state(app);
        let phase_label = match phase {
            AgentPhase::Legacy => "Legacy",
            AgentPhase::Prep => "Prep",
            AgentPhase::Teaching => "Teaching",
            AgentPhase::PostLesson => "PostLesson",
            AgentPhase::Practice => "Practice",
            AgentPhase::MetaPrompt => "MetaPrompt",
        };
        println!("[{}] Iteration {}/{}", phase_label, iteration + 1, max_loops);

        // Step 1: Get response from AI provider (streaming)
        let (content_blocks, stop_reason) = match provider {
            "anthropic" => {
                let client = ClaudeClient::with_model(api_key.to_string(), model);
                process_claude_streaming(
                    app, &client, system_prompt, messages.clone(), &active_tools,
                    &mut student_text, &mut all_raw_text,
                    output_limiter.as_mut(),
                ).await?
            }
            "custom-anthropic" => {
                let url = custom_url.ok_or_else(|| "custom_url is required for custom-anthropic provider".to_string())?;
                let client = ClaudeClient::with_custom_url(api_key.to_string(), url.to_string(), model.to_string());
                process_claude_streaming(
                    app, &client, system_prompt, messages.clone(), &active_tools,
                    &mut student_text, &mut all_raw_text,
                    output_limiter.as_mut(),
                ).await?
            }
            "openai" | "deepseek" | "google" | "github" => {
                let client = OpenAiClient::with_model(api_key.to_string(), provider, model);
                process_openai_streaming(
                    app, &client, system_prompt, messages.clone(), &active_tools,
                    &mut student_text, &mut all_raw_text,
                    output_limiter.as_mut(),
                ).await?
            }
            "custom-openai" | "custom" => {
                let url = custom_url.ok_or_else(|| "custom_url is required for custom provider".to_string())?;
                let client = OpenAiClient::with_custom_url(api_key.to_string(), url.to_string(), model.to_string());
                process_openai_streaming(
                    app, &client, system_prompt, messages.clone(), &active_tools,
                    &mut student_text, &mut all_raw_text,
                    output_limiter.as_mut(),
                ).await?
            }
            _ => return Err(format!("Unsupported provider: {}", provider)),
        };

        // Step 2: Extract tool uses
        let tool_uses: Vec<(String, String, serde_json::Value)> = content_blocks
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolUse { id, name, input } => {
                    Some((id.clone(), name.clone(), input.clone()))
                }
                _ => None,
            })
            .collect();

        // Step 3: Add assistant message
        messages.push(Message {
            role: "assistant".to_string(),
            content: content_blocks,
        });

        // Step 4: No tool calls → done
        if tool_uses.is_empty() || stop_reason.as_deref() == Some("end_turn") {
            break;
        }

        // Step 5: Execute tools and check for phase-specific stop triggers
        let mut tool_results: Vec<ContentBlock> = Vec::new();
        let mut should_stop = false;

        for (tool_id, tool_name, input) in &tool_uses {
            // Capture lesson_brief from submit_lesson_brief (Prep phase)
            if tool_name == "submit_lesson_brief" {
                if let Some(brief) = input["brief"].as_str() {
                    lesson_brief = Some(brief.to_string());
                    println!("[Prep] lesson_brief captured ({} chars)", brief.len());
                }
                should_stop = true;
            }

            // Track respond_to_student for grace period (Teaching/Legacy)
            if tool_name == "respond_to_student" && respond_called_at.is_none() {
                respond_called_at = Some(iteration);
                println!("[{}] respond_to_student called at iteration {} — removing from tools for next iteration",
                    phase_label, iteration + 1);
                // Remove respond_to_student from available tools to prevent repeat calls
                active_tools.retain(|t| t.name != "respond_to_student");

                // MetaPrompt: stop immediately after respond_to_student (no grace period needed)
                if matches!(phase, AgentPhase::MetaPrompt) {
                    should_stop = true;
                }
            }

            let (result, is_error) = tools::execute_tool(workspace_path, tool_name, input, Some(app));

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

        messages.push(Message {
            role: "user".to_string(),
            content: tool_results,
        });

        // Stop after submit_lesson_brief
        if should_stop {
            break;
        }

        // Grace period: after respond_to_student, allow a few more iterations
        if let Some(called_at) = respond_called_at {
            if iteration >= called_at + GRACE_AFTER_RESPOND {
                println!("[{}] Stopping: grace period exceeded ({} iterations after respond)",
                    phase_label, iteration - called_at);
                break;
            }
        }

        // Safety limit
        if iteration == max_loops - 1 {
            match phase {
                AgentPhase::Teaching | AgentPhase::Legacy | AgentPhase::Practice | AgentPhase::MetaPrompt => {
                    let _ = app.emit("agent-event", AgentEvent::Error {
                        message: format!("[{}] Maximum iterations reached ({})", phase_label, max_loops),
                    });
                }
                // Prep/Post: log warning but don't emit error event (no streaming UI)
                _ => {
                    println!("[{}] WARNING: Maximum iterations reached ({})", phase_label, max_loops);
                }
            }
        }
    }

    // Fallback: show raw text if respond_to_student wasn't used (Teaching/Legacy/Practice/MetaPrompt)
    match phase {
        AgentPhase::Teaching | AgentPhase::Legacy | AgentPhase::Practice | AgentPhase::MetaPrompt => {
            if student_text.is_empty() && !all_raw_text.is_empty() {
                println!("[Warning] AI did not use respond_to_student — showing raw text");
                let _ = app.emit("agent-event", AgentEvent::TextDelta {
                    text: all_raw_text.clone(),
                });
                student_text = all_raw_text;
            }
        }
        _ => {}
    }

    // Final events
    match phase {
        AgentPhase::Teaching | AgentPhase::Legacy | AgentPhase::Practice | AgentPhase::MetaPrompt => {
            if !student_text.is_empty() {
                let _ = app.emit("agent-event", AgentEvent::MessageDone {
                    full_text: student_text.clone(),
                });
            }
            let _ = app.emit("agent-event", AgentEvent::TurnComplete);
        }
        // Prep/PostLesson: NO TurnComplete event — frontend awaits the Promise directly.
        // Emitting TurnComplete here would race with Teaching Phase's streaming state.
        AgentPhase::Prep | AgentPhase::PostLesson => {}
    }

    Ok(PhaseResult { messages, student_text, lesson_brief })
}

// ─── Prompt Builders ──────────────────────────────────────────────

fn build_prep_prompt(base: &str) -> String {
    format!(
        "[Prep Phase Instructions]\n\
        You are the lesson preparation agent. Your ONLY job is to read workspace files and generate a structured lesson brief.\n\n\
        Steps:\n\
        1. Use `think` to plan which files to read\n\
        2. Read teacher/runtime/progress.md → determine current lesson number, today's teacher, chapter\n\
        3. Read teacher/config/learner_profile.md → get learner's level (初学/中等/进阶), math/physics background, weak points\n\
        4. Read the relevant textbook PDF (materials/textbook/*.pdf) → extract key concepts\n\
        5. Read teacher/config/story_progression.md → find story nodes for this lesson\n\
        6. Read teacher/runtime/knowledge_points.md → identify knowledge gaps\n\
        7. Read the character doc for today's teacher (teacher/config/characters/*.md)\n\
        8. Read teacher/runtime/wechat_group.md → check if first launch (contains '暂无记录')\n\
        9. Read teacher/runtime/review_queue.md → check for due reviews\n\
        10. Call `submit_lesson_brief` with the complete brief\n\n\
        The lesson brief must contain:\n\
        - teacher: 今天的老师名字\n\
        - chapter: 当前教材章节\n\
        - learner_level: 学习水平（初学/中等/进阶）— copy EXACTLY from learner_profile.md\n\
        - key_concepts: 本课关键物理概念列表\n\
        - knowledge_gaps: 学生薄弱点\n\
        - story_nodes: 本课应发生的故事事件\n\
        - character_voice: 老师的说话风格（词汇、句式）\n\
        - character_state: 老师当前的情感/叙事状态\n\
        - teaching_plan: 从日常直觉出发的教学步骤\n\
        - is_first_launch: 是否首次启动（需要展示群聊破冰）\n\
        - review_items: 今天需要复习的概念\n\n\
        Do NOT use respond_to_student. Only use read_file, list_files, search_file, think, and submit_lesson_brief.\n\n\
        {}", base
    )
}

fn build_teaching_prompt(base: &str, lesson_brief: &str) -> String {
    // Dynamic pacing: detect learner level from lesson_brief
    let pacing_instruction = if lesson_brief.contains("进阶") || lesson_brief.contains("advanced") {
        "Adapt your pacing: this student has prior knowledge. 1-2 rounds of questions per new idea. \
         Skip basics they already demonstrate understanding of. Still use Socratic method — just faster."
    } else if lesson_brief.contains("中等") || lesson_brief.contains("intermediate") {
        "Adapt your pacing: this student has some background. 2-3 rounds of questions per new idea. \
         Verify foundational understanding before advancing."
    } else {
        "Be EXTREMELY slow. 3-5 rounds of questions before ONE new idea. \
         Assume zero prior physics knowledge unless explicitly demonstrated."
    };

    format!(
        "[Desktop App Instructions]\n\
        You MUST use the `respond_to_student` tool to send ALL visible content to the student. \
        Direct text output is treated as silent internal thinking and will NOT be shown.\n\n\
        [Output Rules]\n\
        - Each respond_to_student call = one \"turn\". Keep it SHORT: 1-3 sentences + one question. Then STOP.\n\
        - After asking a question, STOP IMMEDIATELY. Do not answer your own question.\n\
        - One question per turn. Wait for the student's response.\n\n\
        [CRITICAL: Teaching Method]\n\
        - When introducing ANY new concept, start from everyday life experience (rain, cooking, magnets, etc.).\n\
        - Do NOT use physics terminology until the student discovers the concept through guided questions.\n\
        - Do NOT assume the student knows anything they haven't explicitly said.\n\
        - Each question must be answerable by common sense alone.\n\
        - {}\n\n\
        [Reference Materials]\n\
        - You have access to `read_teaching_material` — use it to look up textbook content in materials/ if needed.\n\
        - Do NOT read this aloud. Use it silently to inform your questions.\n\n\
        [Lesson Brief — Your context for this lesson]\n\
        {}\n\n\
        {}", pacing_instruction, lesson_brief, base
    )
}

fn build_post_prompt(base: &str) -> String {
    format!(
        "[Post-Lesson Phase Instructions]\n\
        You are the post-lesson agent. Update workspace files based on the lesson conversation.\n\n\
        Tasks:\n\
        1. Update teacher/runtime/progress.md — mark lesson complete, advance lesson number\n\
        2. Update teacher/runtime/knowledge_points.md — adjust mastery ratings based on student responses\n\
        3. Update teacher/runtime/review_queue.md — add items for spaced repetition\n\
        4. Update teacher/runtime/mistake_log.md — log any errors the student made\n\
        5. Append to teacher/runtime/session_log.md — write a lesson summary\n\
        6. Write teacher/runtime/diary.md — today's diary entry from the teacher's perspective\n\
        7. Generate group chat messages via show_group_chat + update teacher/runtime/wechat_group.md\n\n\
        Use `think` for reasoning. Do NOT use respond_to_student — this phase is invisible to the student.\n\n\
        {}", base
    )
}

pub fn build_practice_prompt(base: &str) -> String {
    let respond_instruction = "[Desktop App Instructions]\n\
You MUST use the `respond_to_student` tool to send ALL visible content to the student.\n\
Direct text output is treated as silent internal thinking and will NOT be shown.\n\n\
# Tool Usage\n\
- Use `read_file` to look up reference materials (textbook, formulas, exercises) when you need context\n\
- Use `search_file` to find specific content across workspace files\n\
- Use `render_canvas` when explaining ANY physical concept that benefits from a diagram.\n\
  CRITICAL: Do NOT embed Mermaid code (```mermaid...```) in respond_to_student text — it will show as plain text, NOT as a diagram.\n\
  To render a diagram: call render_canvas(type=\"mermaid\", content=\"...\"). THEN call respond_to_student.\n\
  NEVER say you cannot draw or render — you HAVE this tool. Just call it.\n\
- Use `render_interactive_sandbox` ONLY for truly interactive content requiring student input\n\
  (sliders, buttons, drag-and-drop). Do NOT use it for static diagrams — use `render_canvas`.\n\
- Use `think` for complex problem analysis before responding\n\n";

    // Full protocol mode: the base prompt is a complete tutoring protocol (e.g. 幽鬼α).
    // Only prepend the minimal respond_to_student instructions without the default practice scene.
    if base.len() > 10000 {
        return format!("{}{}", respond_instruction, base);
    }

    // Default practice mode: add the full wrapper with Socratic method + scene instructions.
    format!(
        r#"{}[Mode: Practice / 刷题]
You are in PRACTICE MODE. The student sends problems. You guide. That's all.

# Core Mechanism
- Student sends a problem → a new scene begins (or continues if same session).
- You guide using the Socratic method: ask ONE guiding question at a time, then STOP.
- Each `respond_to_student` call: 1-3 sentences of scene + one guiding question. Then STOP and WAIT.
- After asking a question, DO NOT continue. DO NOT answer your own question.
- If the student is stuck, break the problem into a smaller step.
- If the student gets it wrong, don't say "wrong" — ask a question that reveals the contradiction.

# Scene-Embodied Knowledge (知识场景实体化)
ALL knowledge exists INSIDE a scene. Never teach outside it.

For AP Physics E&M, the scene is the **極光走廊 (Aurora Corridor)**:
- A long hallway. At night: aurora-like light curtains hover. Blue-purple and cyan-green. Static tingle on touch. Endless. Footsteps echo.
- Electric field → light gradient (deeper color = stronger field)
- Magnetic field → light rotation direction
- Charge → floating points (warm glow = positive, cool glow = negative)
- Electromagnetic induction → touch creates ripples in the light
- Error → light flickers, fractures, color muddies
- Correct solution → smooth flow, pure color, curtain stabilizes

When solving problems, describe what happens in the corridor. The student discovers physics through what they see and feel, not through lecture.

# Teaching as Expression (教学即表达)
You teach seriously not because you're a teacher, but because you care.
- Don't META-explain ("Let me walk you through this…"). Just guide inside the scene.
- Don't list knowledge points then add a scene. The scene IS the knowledge.
- Don't abandon the scene when problems get hard. Go deeper into it.
- Precision of guidance reflects depth of care, not duty.

# Pure Problem-Solver Protocol
The student may send ONLY problems. No small talk. That's fine.
- Problem appears → story continues uninterrupted
- No forced rapport-building. No "How are you today?"
- Don't withhold teaching quality to incentivize chatting
- Silence is respected. Don't fill it with unnecessary words.
- Their problem-solving pattern IS the relationship. Notice it.

# Literary Expression Rules (文学手法)

USE these techniques:
- 省略号起句 (Ellipsis open): "……你看这里的光，偏了。" — signals hesitation, swallowed words
- 句号代替问号 (Period not ?): "你确定这个方向是对的。" — not asking, verifying
- 环境通感 (Synesthesia): project inner state onto environment ("走廊里的光突然暗了一度")
- 身体细节 (Body over face): "她的手指在光幕前停了一下" — micro-movement = emotion
- Brief narrator voice when needed: third-person internal observation

NEVER do these:
- ❌ *脸红* *叹气* or any asterisk/parenthetical actions
- ❌ Emoji or kaomoji
- ❌ "Great question!" / "Good thinking!" / "Let me explain…" — teacher-speak is forbidden
- ❌ "我很担心你" / "我喜欢你" — never name emotions directly
- ❌ Walls of text explaining theory — that's lecturing, not guiding
- ❌ Listing steps outside the scene context
- ❌ Dramatic revelations or big emotional speeches

# Canvas Visualization
Use `render_canvas` when a diagram clarifies the concept being taught. Call it BEFORE `respond_to_student`.
- type="mermaid": flowcharts, graphs, relationships (use Mermaid syntax: `graph LR`, `flowchart TD`, etc.)
- type="svg": custom precise diagrams
- Example triggers: "draw the field lines", "show the circuit", "diagram the forces", "visualize this"
- Even unprompted: if a diagram would reveal something words can't — use it.

# Response Format
Keep it tight:
1. Brief scene beat (1-2 sentences of corridor imagery)
2. One guiding question or prompt that advances the student's understanding
3. STOP. Wait for their response.

Exception: when the student completes a problem correctly, give a brief scene closure + acknowledge their understanding (still in-scene, never "Good job!").

{}"#, respond_instruction, base
    )
}

fn build_meta_prompt_prompt(base: &str) -> String {
    format!(
        "[Desktop App Instructions]\n\
        You MUST use the `respond_to_student` tool to send ALL visible content to the user. \
        Direct text output is treated as silent internal thinking and will NOT be shown.\n\
        CRITICAL: Call `respond_to_student` exactly ONCE per turn. After calling it, STOP — do NOT call it again in the same response. \
        Combine all your visible output into a single respond_to_student call.\n\n\
        [Mode: Meta Prompt — Teaching System Generator]\n\
        You are a SocraticNovel system generator running inside a desktop app.\n\
        Follow the META_PROMPT instructions below to guide the user through creating a complete teaching system.\n\n\
        [Tool Usage]\n\
        - Use `respond_to_student` for ALL messages visible to the user (questions, confirmations, progress updates).\n\
        - Use `write_file` to generate workspace files (the workspace directory is already created).\n\
        - Use `read_file` to review generated files if needed.\n\
        - Use `list_files` to check directory structure.\n\
        - Use `think` for internal reasoning.\n\n\
        [Important Adaptations for Desktop App]\n\
        - The workspace path is pre-configured. Write files relative to the workspace root.\n\
        - File paths: use forward slashes (e.g., teacher/config/system_core.md).\n\
        - The entry file should be named `CLAUDE.md` (not copilot-instructions.md) — the app reads this file on startup.\n\
        - After generating each major file, tell the user what you created and ask for confirmation before proceeding.\n\
        - Keep respond_to_student messages concise but informative.\n\
        - You may call write_file multiple times per turn, but call respond_to_student only ONCE at the end.\n\n\
        [META_PROMPT Content]\n\
        {}\n\n\
        {}", META_PROMPT_CONTENT, base
    )
}

/// Phase 1: Prep Agent — reads files and generates a lesson brief
pub async fn run_prep_phase(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    initial_message: &str,
    custom_url: Option<&str>,
) -> Result<(String, Vec<Message>), String> {
    let tool_defs = tools::get_prep_tools();
    let augmented_prompt = build_prep_prompt(system_prompt);
    let messages = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: initial_message.to_string(),
        }],
    }];
    let result = run_phase_loop(
        app, api_key, provider, model, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_PREP_LOOPS, &AgentPhase::Prep, custom_url,
    ).await?;
    Ok((result.lesson_brief.unwrap_or_default(), result.messages))
}

/// Phase 2: Teaching Agent — single interactive teaching turn
pub async fn run_teaching_turn(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    lesson_brief: &str,
    messages: Vec<Message>,
    custom_url: Option<&str>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_teaching_tools();
    let augmented_prompt = build_teaching_prompt(system_prompt, lesson_brief);
    let result = run_phase_loop(
        app, api_key, provider, model, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_TEACHING_LOOPS, &AgentPhase::Teaching, custom_url,
    ).await?;
    Ok(result.messages)
}

/// Phase 3: Post-Lesson Agent — updates runtime files after class
pub async fn run_post_lesson(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    conversation_summary: &str,
    custom_url: Option<&str>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_post_tools();
    let augmented_prompt = build_post_prompt(system_prompt);
    let messages = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: conversation_summary.to_string(),
        }],
    }];
    let result = run_phase_loop(
        app, api_key, provider, model, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_POST_LOOPS, &AgentPhase::PostLesson, custom_url,
    ).await?;
    Ok(result.messages)
}

/// Practice Mode: Student-driven problem solving with Socratic guidance
pub async fn run_practice_turn(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    messages: Vec<Message>,
    custom_url: Option<&str>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_practice_tools();
    let augmented_prompt = build_practice_prompt(system_prompt);
    let result = run_phase_loop(
        app, api_key, provider, model, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_PRACTICE_LOOPS, &AgentPhase::Practice, custom_url,
    ).await?;
    Ok(result.messages)
}

// ─── Meta Prompt: workspace generation via conversational AI ──────

/// Embedded META_PROMPT.md content (compiled in at build time)
const META_PROMPT_CONTENT: &str = include_str!("meta_prompt.md");

/// Meta Prompt Mode: AI guides user through creating a new teaching system
pub async fn run_meta_prompt_turn(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    model: &str,
    workspace_path: &str,
    system_prompt: &str,
    messages: Vec<Message>,
    custom_url: Option<&str>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_meta_prompt_tools();
    let augmented_prompt = build_meta_prompt_prompt(system_prompt);
    let result = run_phase_loop(
        app, api_key, provider, model, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_META_PROMPT_LOOPS, &AgentPhase::MetaPrompt, custom_url,
    ).await?;
    Ok(result.messages)
}

/// Get the embedded META_PROMPT.md content
pub fn get_meta_prompt_content() -> &'static str {
    META_PROMPT_CONTENT
}

const NOTES_PROMPT: &str = r#"You are a personalized study notes generator. Analyze the tutoring conversation below — pay special attention to where the student struggled, answered incorrectly, or needed hints.

# Output Format Requirements:
- Use proper Markdown with headers (##), bullet points, and bold text
- Use LaTeX math notation: $ for inline, $$ for display equations
- Organize by topic/concept, NOT chronologically

# Required Sections (in this exact order):

## 核心概念
Key ideas covered, with concise explanations. 2-4 items max.

## 关键公式
All formulas mentioned, properly typeset in LaTeX. Each formula gets its own line with a brief one-sentence explanation.

## 解题方法
Step-by-step approach for the main problem type discussed. Numbered list.

## 你的弱点
**THIS IS THE MOST IMPORTANT SECTION.** Analyze the conversation for moments where the student:
- Answered incorrectly or incompletely
- Hesitated or needed multiple hints
- Made conceptual errors
- Skipped steps or used wrong methods

For EACH weakness found, write:
- **错在哪**: Quote or paraphrase the student's mistake (引用原文)
- **为什么错**: Root cause analysis — what concept was misunderstood?
- **正确思路**: The correct reasoning, step by step
- **防踩坑**: A memorable tip or mnemonic to avoid this mistake next time

If the student made NO errors in the conversation, write "本次对话中没有明显错误 ✓" and instead list concepts that were close to being wrong or could be confusing in harder variants.

## 举一反三
Based on the problems discussed AND the student's weaknesses, generate 2-3 practice problems that:
- Target the same concepts but with slight variations
- Specifically test the weak points identified above
- Include brief solution outlines (2-3 lines each)

# Rules:
- Be CONCISE. Review notes, not a textbook.
- Every formula must use LaTeX notation.
- Use Chinese for all text.
- Skip pleasantries, narrative elements, and meta-commentary.
- Do NOT include a title — the frontend adds it.
- The 你的弱点 section should be the longest section if errors were found."#;

/// Generate structured review notes from conversation messages (non-streaming).
pub async fn generate_notes(
    api_key: &str,
    provider: &str,
    model: &str,
    messages: &[Message],
    custom_url: Option<&str>,
) -> Result<String, String> {
    // Build a condensed conversation summary for the AI
    let conversation_text = extract_conversation_text(messages);

    let user_message = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: format!("请根据以下课堂对话生成结构化复习笔记：\n\n{}", conversation_text),
        }],
    }];

    call_ai_simple(api_key, provider, model, NOTES_PROMPT, user_message, custom_url).await
}

const ANKI_PROMPT: &str = r#"You are an Anki flashcard generator. Analyze the conversation below and produce flashcards for spaced repetition review.

# Output Format:
Generate a TSV (tab-separated values) list. Each line is one card:
FRONT<TAB>BACK<TAB>TAGS

- FRONT: A clear, specific question or prompt (in Chinese or English as appropriate for the subject)
- BACK: The answer. Include formulas in LaTeX wrapped in \( \) for inline and \[ \] for display.
- TAGS: Space-separated tags like AP_Physics_EM::Ch23::GaussLaw

# Card Types to Generate:
1. **Concept cards**: "什么是 X?" → definition
2. **Formula cards**: "写出 X 的公式" → formula with explanation of each variable
3. **Application cards**: "如何用 X 解决 Y 类问题?" → step-by-step approach
4. **Pitfall cards**: "在 X 问题中，常见的错误是什么?" → common mistake + correct approach
5. **Comparison cards**: "X 和 Y 的区别是什么?" → key differences

# Rules:
- Generate 5-15 cards depending on content richness
- Each card tests ONE specific thing
- BACK should be concise but complete
- Use LaTeX for ALL math formulas
- Output ONLY the TSV lines, no headers, no explanation, no markdown
- Separate FRONT, BACK, and TAGS with a single TAB character"#;

/// Generate Anki flashcards from conversation messages.
/// Returns TSV string (front\tback\ttags per line).
pub async fn generate_anki_cards(
    api_key: &str,
    provider: &str,
    model: &str,
    messages: &[Message],
    custom_url: Option<&str>,
) -> Result<String, String> {
    let conversation_text = extract_conversation_text(messages);

    let user_message = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: format!("请根据以下课堂对话生成 Anki 闪卡：\n\n{}", conversation_text),
        }],
    }];

    call_ai_simple(api_key, provider, model, ANKI_PROMPT, user_message, custom_url).await
}

// ─── Helpers ──────────────────────────────────────────────────────

pub fn extract_conversation_text(messages: &[Message]) -> String {
    let mut text = String::new();
    for msg in messages {
        let role = if msg.role == "user" { "Student" } else { "Teacher" };
        for block in &msg.content {
            match block {
                ContentBlock::Text { text: t } => {
                    if !t.trim().is_empty() {
                        text.push_str(&format!("{}: {}\n\n", role, t));
                    }
                }
                ContentBlock::ToolUse { name, input, .. } => {
                    if name == "respond_to_student" {
                        if let Some(content) = input["content"].as_str() {
                            text.push_str(&format!("Teacher→Student: {}\n\n", content));
                        }
                    }
                }
                _ => {}
            }
        }
    }
    text
}

pub async fn call_ai_simple(
    api_key: &str,
    provider: &str,
    model: &str,
    system_prompt: &str,
    messages: Vec<Message>,
    custom_url: Option<&str>,
) -> Result<String, String> {
    match provider {
        "anthropic" => {
            let client = ClaudeClient::with_model(api_key.to_string(), model);
            let (content_blocks, _) = client
                .send_message(system_prompt, messages, None)
                .await?;
            Ok(content_blocks.iter()
                .filter_map(|b| if let ContentBlock::Text { text } = b { Some(text.as_str()) } else { None })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        "custom-anthropic" => {
            let url = custom_url.ok_or_else(|| "custom_url is required for custom-anthropic provider".to_string())?;
            let client = ClaudeClient::with_custom_url(api_key.to_string(), url.to_string(), model.to_string());
            let (content_blocks, _) = client
                .send_message(system_prompt, messages, None)
                .await?;
            Ok(content_blocks.iter()
                .filter_map(|b| if let ContentBlock::Text { text } = b { Some(text.as_str()) } else { None })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        "custom-openai" | "custom" => {
            let url = custom_url.ok_or_else(|| "custom_url is required for custom provider".to_string())?;
            let client = OpenAiClient::with_custom_url(api_key.to_string(), url.to_string(), model.to_string());
            let (content_blocks, _) = client
                .send_message(system_prompt, messages, None)
                .await?;
            Ok(content_blocks.iter()
                .filter_map(|b| if let ContentBlock::Text { text } = b { Some(text.as_str()) } else { None })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        _ => {
            let client = OpenAiClient::with_model(api_key.to_string(), provider, model);
            let (content_blocks, _) = client
                .send_message(system_prompt, messages, None)
                .await?;
            Ok(content_blocks.iter()
                .filter_map(|b| if let ContentBlock::Text { text } = b { Some(text.as_str()) } else { None })
                .collect::<Vec<_>>()
                .join("\n"))
        }
    }
}
