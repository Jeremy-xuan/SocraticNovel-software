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
                                    let _ = app.emit("agent-event", AgentEvent::TextDelta {
                                        text: text_chunk.clone(),
                                    });
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

                        if current_tool_name == "render_canvas" {
                            let title = input["title"].as_str().unwrap_or("Canvas").to_string();
                            let svg = input["content"].as_str().unwrap_or("").to_string();
                            let _ = app.emit("canvas-event", serde_json::json!({
                                "title": title,
                                "content": svg,
                            }));
                        }

                        if current_tool_name == "show_group_chat" {
                            if let Some(msgs) = input["messages"].as_array() {
                                println!("[show_group_chat] Emitting {} messages to frontend", msgs.len());
                                let _ = app.emit("group-chat-event", serde_json::json!({
                                    "messages": msgs,
                                }));
                            } else {
                                println!("[show_group_chat] WARNING: 'messages' is not an array. Input: {}", input);
                            }
                        }

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
                if name == "render_canvas" {
                    let title = input["title"].as_str().unwrap_or("Canvas").to_string();
                    let svg = input["content"].as_str().unwrap_or("").to_string();
                    let _ = app.emit("canvas-event", serde_json::json!({
                        "title": title,
                        "content": svg,
                    }));
                }
                if name == "show_group_chat" {
                    if let Some(messages) = input["messages"].as_array() {
                        let _ = app.emit("group-chat-event", serde_json::json!({
                            "messages": messages,
                        }));
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
                                let _ = app.emit("agent-event", AgentEvent::TextDelta {
                                    text: text_chunk.clone(),
                                });
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

        if name == "render_canvas" {
            let title = input["title"].as_str().unwrap_or("Canvas").to_string();
            let svg = input["content"].as_str().unwrap_or("").to_string();
            let _ = app.emit("canvas-event", serde_json::json!({
                "title": title, "content": svg,
            }));
        }

        if name == "show_group_chat" {
            if let Some(msgs) = input["messages"].as_array() {
                println!("[show_group_chat] Emitting {} messages to frontend (OpenAI path)", msgs.len());
                let _ = app.emit("group-chat-event", serde_json::json!({
                    "messages": msgs,
                }));
            } else {
                println!("[show_group_chat] WARNING: 'messages' is not an array. Input: {}", input);
            }
        }

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
    workspace_path: &str,
    system_prompt: &str,
    mut messages: Vec<Message>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_tool_definitions();

    // Augment system prompt: AI must use respond_to_student tool for all visible output
    let system_prompt = format!(
        "[Desktop App Instructions]\n\
        You MUST use the `respond_to_student` tool to send ALL visible content to the student. \
        Direct text output is treated as silent internal thinking and will NOT be shown to the student. \
        Use `think` for structured internal notes. \
        After calling respond_to_student, end your turn unless you have more tools to call.\n\n\
        [Output Rules]\n\
        - Each respond_to_student call is one \"turn\". Keep it SHORT: 1-3 sentences + one question. Then STOP.\n\
        - After asking the student a question, STOP IMMEDIATELY. Do not answer your own question. Do not continue teaching.\n\
        - One question per turn. Wait for the student's response before continuing.\n\n\
        [CRITICAL: Teaching Method]\n\
        - When introducing ANY new concept, you MUST start from everyday life experience (rain, wind, cooking, magnets, phone charging).\n\
        - Do NOT use physics terminology until the student discovers the concept through your guided questions.\n\
        - Do NOT assume the student knows anything they haven't explicitly said in this conversation.\n\
        - Each question must be answerable by common sense alone. If it requires physics knowledge, you've jumped too far.\n\
        - Be EXTREMELY slow. 3-5 rounds of questions before introducing ONE new idea.\n\n\
        {}", system_prompt
    );

    let mut student_text = String::new();
    let mut all_raw_text = String::new();
    // After respond_to_student is called, allow a few more iterations for
    // follow-up tools (show_group_chat, render_canvas, write_file), then stop.
    let mut respond_called_at: Option<usize> = None;
    const GRACE_AFTER_RESPOND: usize = 3;

    for iteration in 0..MAX_TOOL_LOOPS {
        println!("[Agent] Iteration {}/{}", iteration + 1, MAX_TOOL_LOOPS);
        // Step 1: Get response from AI provider
        let (content_blocks, stop_reason) = match provider {
            "anthropic" => {
                // Claude: streaming with incremental respond_to_student output
                let client = ClaudeClient::new(api_key.to_string());
                process_claude_streaming(
                    app, &client, &system_prompt, messages.clone(), &tool_defs,
                    &mut student_text, &mut all_raw_text,
                ).await?
            }
            "openai" | "deepseek" | "google" => {
                // OpenAI-compatible: streaming with incremental respond_to_student
                let client = OpenAiClient::new(api_key.to_string(), provider);
                process_openai_streaming(
                    app, &client, &system_prompt, messages.clone(), &tool_defs,
                    &mut student_text, &mut all_raw_text,
                ).await?
            }
            _ => {
                return Err(format!("Unsupported provider: {}", provider));
            }
        };

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
    workspace_path: &str,
    system_prompt: &str,
    mut messages: Vec<Message>,
    tool_defs: &[ToolDefinition],
    max_loops: usize,
    phase: &AgentPhase,
) -> Result<PhaseResult, String> {
    let mut student_text = String::new();
    let mut all_raw_text = String::new();
    let mut respond_called_at: Option<usize> = None;
    let mut lesson_brief: Option<String> = None;
    // Mutable copy of tool definitions — we remove respond_to_student after it's called
    let mut active_tools: Vec<ToolDefinition> = tool_defs.to_vec();

    for iteration in 0..max_loops {
        let phase_label = match phase {
            AgentPhase::Legacy => "Legacy",
            AgentPhase::Prep => "Prep",
            AgentPhase::Teaching => "Teaching",
            AgentPhase::PostLesson => "PostLesson",
            AgentPhase::Practice => "Practice",
        };
        println!("[{}] Iteration {}/{}", phase_label, iteration + 1, max_loops);

        // Step 1: Get response from AI provider (streaming)
        let (content_blocks, stop_reason) = match provider {
            "anthropic" => {
                let client = ClaudeClient::new(api_key.to_string());
                process_claude_streaming(
                    app, &client, system_prompt, messages.clone(), &active_tools,
                    &mut student_text, &mut all_raw_text,
                ).await?
            }
            "openai" | "deepseek" | "google" => {
                let client = OpenAiClient::new(api_key.to_string(), provider);
                process_openai_streaming(
                    app, &client, system_prompt, messages.clone(), &active_tools,
                    &mut student_text, &mut all_raw_text,
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
            }

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
                AgentPhase::Teaching | AgentPhase::Legacy | AgentPhase::Practice => {
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

    // Fallback: show raw text if respond_to_student wasn't used (Teaching/Legacy/Practice)
    match phase {
        AgentPhase::Teaching | AgentPhase::Legacy | AgentPhase::Practice => {
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
        AgentPhase::Teaching | AgentPhase::Legacy | AgentPhase::Practice => {
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
        3. Read the relevant textbook PDF (materials/textbook/*.pdf) → extract key concepts\n\
        4. Read teacher/config/story_progression.md → find story nodes for this lesson\n\
        5. Read teacher/runtime/knowledge_points.md → identify knowledge gaps\n\
        6. Read the character doc for today's teacher (teacher/config/characters/*.md)\n\
        7. Read teacher/runtime/wechat_group.md → check if first launch (contains '暂无记录')\n\
        8. Read teacher/runtime/review_queue.md → check for due reviews\n\
        9. Call `submit_lesson_brief` with the complete brief\n\n\
        The lesson brief must contain:\n\
        - teacher: 今天的老师名字\n\
        - chapter: 当前教材章节\n\
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
        - Be EXTREMELY slow. 3-5 rounds of questions before ONE new idea.\n\n\
        [Lesson Brief — Your context for this lesson]\n\
        {}\n\n\
        {}", lesson_brief, base
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
    format!(
        r#"[Desktop App Instructions]
You MUST use the `respond_to_student` tool to send ALL visible content to the student.
Direct text output is treated as silent internal thinking and will NOT be shown.

[Mode: Practice / 刷题]
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

# Tool Usage
- Use `read_file` to look up reference materials (textbook, formulas, exercises) when you need context
- Use `search_file` to find specific content across workspace files
- Use `render_canvas` for diagrams — electric field lines, circuits, charge distributions
- Use `think` for complex problem analysis before responding

# Response Format
Keep it tight:
1. Brief scene beat (1-2 sentences of corridor imagery)
2. One guiding question or prompt that advances the student's understanding
3. STOP. Wait for their response.

Exception: when the student completes a problem correctly, give a brief scene closure + acknowledge their understanding (still in-scene, never "Good job!").

{}"#, base
    )
}

// ─── Public Multi-Agent API ───────────────────────────────────────

/// Phase 1: Prep Agent — reads files and generates a lesson brief
pub async fn run_prep_phase(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    workspace_path: &str,
    system_prompt: &str,
    initial_message: &str,
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
        app, api_key, provider, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_PREP_LOOPS, &AgentPhase::Prep,
    ).await?;
    Ok((result.lesson_brief.unwrap_or_default(), result.messages))
}

/// Phase 2: Teaching Agent — single interactive teaching turn
pub async fn run_teaching_turn(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    workspace_path: &str,
    system_prompt: &str,
    lesson_brief: &str,
    messages: Vec<Message>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_teaching_tools();
    let augmented_prompt = build_teaching_prompt(system_prompt, lesson_brief);
    let result = run_phase_loop(
        app, api_key, provider, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_TEACHING_LOOPS, &AgentPhase::Teaching,
    ).await?;
    Ok(result.messages)
}

/// Phase 3: Post-Lesson Agent — updates runtime files after class
pub async fn run_post_lesson(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    workspace_path: &str,
    system_prompt: &str,
    conversation_summary: &str,
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
        app, api_key, provider, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_POST_LOOPS, &AgentPhase::PostLesson,
    ).await?;
    Ok(result.messages)
}

/// Practice Mode: Student-driven problem solving with Socratic guidance
pub async fn run_practice_turn(
    app: &AppHandle,
    api_key: &str,
    provider: &str,
    workspace_path: &str,
    system_prompt: &str,
    messages: Vec<Message>,
) -> Result<Vec<Message>, String> {
    let tool_defs = tools::get_practice_tools();
    let augmented_prompt = build_practice_prompt(system_prompt);
    let result = run_phase_loop(
        app, api_key, provider, workspace_path, &augmented_prompt,
        messages, &tool_defs, MAX_PRACTICE_LOOPS, &AgentPhase::Practice,
    ).await?;
    Ok(result.messages)
}

// ─── Note Generation (non-streaming, single call) ─────────────────

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
    messages: &[Message],
) -> Result<String, String> {
    // Build a condensed conversation summary for the AI
    let conversation_text = extract_conversation_text(messages);

    let user_message = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: format!("请根据以下课堂对话生成结构化复习笔记：\n\n{}", conversation_text),
        }],
    }];

    call_ai_simple(api_key, provider, NOTES_PROMPT, user_message).await
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
    messages: &[Message],
) -> Result<String, String> {
    let conversation_text = extract_conversation_text(messages);

    let user_message = vec![Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: format!("请根据以下课堂对话生成 Anki 闪卡：\n\n{}", conversation_text),
        }],
    }];

    call_ai_simple(api_key, provider, ANKI_PROMPT, user_message).await
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
    system_prompt: &str,
    messages: Vec<Message>,
) -> Result<String, String> {
    match provider {
        "anthropic" => {
            let client = ClaudeClient::new(api_key.to_string());
            let (content_blocks, _) = client
                .send_message(system_prompt, messages, None)
                .await?;
            Ok(content_blocks.iter()
                .filter_map(|b| if let ContentBlock::Text { text } = b { Some(text.as_str()) } else { None })
                .collect::<Vec<_>>()
                .join("\n"))
        }
        _ => {
            let client = OpenAiClient::new(api_key.to_string(), provider);
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
