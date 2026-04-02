use super::types::ToolDefinition;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

// ─── Tool Definitions ─────────────────────────────────────────────

fn tool_respond_to_student() -> ToolDefinition {
    ToolDefinition {
        name: "respond_to_student".to_string(),
        description: "Send a message to the student. This is the ONLY way to communicate with the student. Any text you want the student to see MUST go through this tool. Direct text output will NOT be shown — it is treated as internal thinking. When you have composed your response, call this tool with the full content.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The message content to display to the student. Supports Markdown and LaTeX ($...$ or $$...$$)."
                }
            },
            "required": ["content"]
        }),
    }
}

fn tool_read_file() -> ToolDefinition {
    ToolDefinition {
        name: "read_file".to_string(),
        description: "Read the contents of a file in the workspace. Use this to load configuration files, student progress, teaching materials, etc. PDF files are automatically extracted to text.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path within the workspace (e.g., 'teacher/runtime/progress.md')"
                }
            },
            "required": ["path"]
        }),
    }
}

fn tool_write_file() -> ToolDefinition {
    ToolDefinition {
        name: "write_file".to_string(),
        description: "Write content to a file in the workspace. Creates the file if it doesn't exist, overwrites if it does.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Relative path within the workspace" },
                "content": { "type": "string", "description": "The full content to write to the file" }
            },
            "required": ["path", "content"]
        }),
    }
}

fn tool_append_file() -> ToolDefinition {
    ToolDefinition {
        name: "append_file".to_string(),
        description: "Append content to the end of an existing file. Use this for logs, session records, or any file where you want to add without overwriting.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Relative path within the workspace" },
                "content": { "type": "string", "description": "Content to append to the file" }
            },
            "required": ["path", "content"]
        }),
    }
}

fn tool_list_files() -> ToolDefinition {
    ToolDefinition {
        name: "list_files".to_string(),
        description: "List files and directories in a given directory path within the workspace.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Relative directory path within the workspace" }
            },
            "required": ["path"]
        }),
    }
}

fn tool_search_file() -> ToolDefinition {
    ToolDefinition {
        name: "search_file".to_string(),
        description: "Search for a text query within a specific file. Returns matching lines with line numbers.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Relative path to the file to search in" },
                "query": { "type": "string", "description": "Text to search for (case-insensitive)" }
            },
            "required": ["path", "query"]
        }),
    }
}

fn tool_render_interactive_sandbox() -> ToolDefinition {
    ToolDefinition {
        name: "render_interactive_sandbox".to_string(),
        description: "Render a fully interactive HTML+JS sandbox diagram on the student's canvas. \
            The HTML is executed inside a secure iframe sandbox with NO network access. \
            Use this for complex interactive visualizations that require JavaScript state machines.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "title": { "type": "string" },
                "html": {
                    "type": "string",
                    "description": "Complete HTML document string. Include CSP meta: \
                        <meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';\">"
                },
                "initial_state": { "type": "object", "additionalProperties": true }
            },
            "required": ["html"]
        }),
    }
}

fn tool_render_canvas() -> ToolDefinition {
    ToolDefinition {
        name: "render_canvas".to_string(),
        description: "Draw a diagram, chart, or graph on the student's whiteboard. Call this BEFORE respond_to_student whenever the user asks to draw, visualize, or show anything. Do NOT describe diagrams in text — render them here. type='mermaid' for flowcharts/architecture/sequence/network diagrams, type='svg' for custom graphics, type='interactive' for sliders/controls.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "title": { "type": "string", "description": "A short title for the canvas item" },
                "content": { "type": "string", "description": "SVG markup string, Mermaid diagram syntax, or interactive SVG markup to render on the canvas" },
                "type": {
                    "type": "string",
                    "enum": ["svg", "mermaid", "interactive"],
                    "description": "Content type: 'svg' for raw SVG, 'mermaid' for Mermaid syntax, 'interactive' for interactive SVG with parameter controls",
                    "default": "svg"
                },
                "parameters": {
                    "type": "array",
                    "description": "Interactive parameter definitions (required when type='interactive')",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Unique identifier for the parameter" },
                            "label": { "type": "string", "description": "Human-readable label for the control" },
                            "type": { "type": "string", "enum": ["range", "number", "select"], "description": "Control type" },
                            "min": { "type": "number", "description": "Minimum value (for range/number)" },
                            "max": { "type": "number", "description": "Maximum value (for range/number)" },
                            "step": { "type": "number", "description": "Step increment (for range/number)" },
                            "default": { "type": ["number", "string"], "description": "Default value" },
                            "options": {
                                "type": "array",
                                "description": "Select options (for select type)",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "value": { "type": "string" },
                                        "label": { "type": "string" }
                                    }
                                }
                            }
                        },
                        "required": ["name", "label", "type"]
                    }
                }
            },
            "required": ["content"]
        }),
    }
}

fn tool_show_group_chat() -> ToolDefinition {
    ToolDefinition {
        name: "show_group_chat".to_string(),
        description: "Display group chat messages in the dedicated group chat panel. Each message includes sender name, timestamp, and text.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "messages": {
                    "type": "array",
                    "description": "Array of group chat messages to display",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sender": { "type": "string", "description": "Name of the sender" },
                            "time": { "type": "string", "description": "Timestamp (e.g., '17:50')" },
                            "text": { "type": "string", "description": "Message content" }
                        },
                        "required": ["sender", "text"]
                    }
                }
            },
            "required": ["messages"]
        }),
    }
}

fn tool_think() -> ToolDefinition {
    ToolDefinition {
        name: "think".to_string(),
        description: "Use this tool for internal notes, planning, and reasoning that should NOT be shown to the student.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "thought": { "type": "string", "description": "Your internal note, plan, or reasoning" }
            },
            "required": ["thought"]
        }),
    }
}

fn tool_end_student_turn() -> ToolDefinition {
    ToolDefinition {
        name: "end_student_turn".to_string(),
        description: "Call this tool when you have finished asking your question and are ready to wait for the student's response. This signals the end of your turn — do NOT call any more tools or send any more messages after this.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {},
            "required": []
        }),
    }
}

fn tool_submit_lesson_brief() -> ToolDefinition {
    ToolDefinition {
        name: "submit_lesson_brief".to_string(),
        description: "Submit the completed lesson brief. Call this ONCE after you have finished reading all files and preparing the lesson plan. This ends the prep phase.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "brief": {
                    "type": "string",
                    "description": "The complete lesson brief containing: teacher name, chapter, key concepts, knowledge gaps, story nodes, character voice rules, teaching plan, and any other context the teaching agent needs."
                }
            },
            "required": ["brief"]
        }),
    }
}

// ─── Phase-specific Tool Sets ─────────────────────────────────────

/// All tools (legacy compatibility)
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        tool_respond_to_student(),
        tool_read_file(),
        tool_write_file(),
        tool_append_file(),
        tool_list_files(),
        tool_search_file(),
        tool_render_canvas(),
        tool_show_group_chat(),
        tool_think(),
        tool_end_student_turn(),
    ]
}

/// Prep Phase tools: read files + think + submit_lesson_brief
pub fn get_prep_tools() -> Vec<ToolDefinition> {
    vec![
        tool_read_file(),
        tool_list_files(),
        tool_search_file(),
        tool_think(),
        tool_submit_lesson_brief(),
    ]
}

fn tool_read_teaching_material() -> ToolDefinition {
    ToolDefinition {
        name: "read_teaching_material".to_string(),
        description: "Read a textbook or reference material file during teaching. ONLY for files in the 'materials/' directory (textbooks, practice workbooks, etc.). Cannot read teacher config or runtime files — use your lesson_brief for those.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path within materials/ (e.g., 'materials/textbook/23_Gauss_Law.pdf')"
                }
            },
            "required": ["path"]
        }),
    }
}

/// Teaching Phase tools: respond + show + render + think + read materials (read-only, materials/ only)
pub fn get_teaching_tools() -> Vec<ToolDefinition> {
    vec![
        tool_respond_to_student(),
        tool_show_group_chat(),
        tool_render_canvas(),
        tool_render_interactive_sandbox(),
        tool_think(),
        tool_read_teaching_material(),
        tool_end_student_turn(),
    ]
}

/// Post-Lesson Phase tools: file I/O + show_group_chat + think
pub fn get_post_tools() -> Vec<ToolDefinition> {
    vec![
        tool_read_file(),
        tool_write_file(),
        tool_append_file(),
        tool_list_files(),
        tool_show_group_chat(),
        tool_think(),
    ]
}

/// Practice Phase tools: respond + render + think + file read (for reference materials)
pub fn get_practice_tools() -> Vec<ToolDefinition> {
    vec![
        tool_respond_to_student(),
        tool_render_canvas(),
        tool_render_interactive_sandbox(),
        tool_think(),
        tool_read_file(),
        tool_search_file(),
        tool_end_student_turn(),
    ]
}

/// Meta Prompt Phase tools: respond + file I/O + think (for workspace generation)
pub fn get_meta_prompt_tools() -> Vec<ToolDefinition> {
    vec![
        tool_respond_to_student(),
        tool_write_file(),
        tool_read_file(),
        tool_list_files(),
        tool_append_file(),
        tool_think(),
        tool_end_student_turn(),
    ]
}

// ─── Skill Groups ─────────────────────────────────────────────────

/// Skill: communication
/// Tools: respond_to_student, show_group_chat, end_student_turn
/// These tools coordinate with runtime.rs for frontend events.
/// - respond_to_student: content streamed via RespondContentStreamer in runtime.rs
/// - show_group_chat: group-chat-event emitted by this module via emit_group_chat_event()
///   (runtime.rs provides fallback emission if Skill layer fails)
/// - end_student_turn: loop control signal, not an event

/// Skill: file_operations
/// Tools: read_file, write_file, append_file, list_files, search_file
/// All file I/O goes through fs_commands module.

/// Skill: canvas_renderer
/// Tools: render_canvas, render_interactive_sandbox
/// These tools emit canvas-event directly from Skill layer (tools.rs).
/// Runtime.rs checks CanvasEventState to avoid duplicate emission.

/// Skill: teaching_materials
/// Tools: read_teaching_material
/// Read-only access to materials/ directory with path validation.

// ─── Skill Layer Event Emission ──────────────────────────────────

/// Emit canvas-event from Skill layer for render_canvas / render_interactive_sandbox.
/// Sets CanvasEventState::sent = true so runtime.rs skips its own emission.
pub fn emit_canvas_event(
    app: Option<&AppHandle>,
    _tool_name: &str,
    title: &str,
    content: &str,
    canvas_type: &str,
    parameters: Option<serde_json::Value>,
    sandbox_state: Option<serde_json::Value>,
) -> Result<(), String> {
    let app = match app {
        Some(a) => a,
        None => return Ok(()), // No app handle, skip event emission
    };
    use super::super::CanvasEventState;

    let state = app.state::<CanvasEventState>();
    state.sent.store(true, std::sync::atomic::Ordering::SeqCst);

    let mut payload = serde_json::json!({
        "title": title,
        "content": content,
        "type": canvas_type,
    });

    if let Some(params) = parameters {
        payload["parameters"] = params;
    }

    if let Some(state) = sandbox_state {
        payload["sandboxState"] = state;
    }

    eprintln!("[CANVAS] emit_canvas_event → type={canvas_type}, title={title:?}, content_len={}", content.len());
    match app.emit("canvas-event", payload) {
        Ok(_) => {
            eprintln!("[CANVAS] canvas-event emitted successfully");
            Ok(())
        }
        Err(e) => {
            eprintln!("[CANVAS] ERROR: failed to emit canvas-event: {e}");
            Err(format!("Failed to emit canvas-event: {}", e))
        }
    }
}

/// Emit group-chat-event from Skill layer for show_group_chat.
pub fn emit_group_chat_event(
    app: Option<&AppHandle>,
    messages: &[serde_json::Value],
) -> Result<(), String> {
    let app = match app {
        Some(a) => a,
        None => return Ok(()), // No app handle, skip event emission
    };

    app.emit("group-chat-event", serde_json::json!({ "messages": messages }))
        .map_err(|e| format!("Failed to emit group-chat-event: {}", e))
}

/// Reset the canvas event state at the start of each tool iteration.
/// Called from runtime.rs before executing tool calls.
pub fn reset_canvas_event_state(app: &AppHandle) {
    use super::super::CanvasEventState;
    let state = app.state::<CanvasEventState>();
    state.sent.store(false, std::sync::atomic::Ordering::SeqCst);
}

/// Check if canvas/event was already sent by Skill layer in this turn.
pub fn canvas_event_was_sent(app: &AppHandle) -> bool {
    use super::super::CanvasEventState;
    let state = app.state::<CanvasEventState>();
    state.sent.load(std::sync::atomic::Ordering::SeqCst)
}

// ─── Sandbox iframe blocking detection ──────────────────────────

// NOTE: iframe blocking detection is intentionally omitted.
// Tauri 2.0 runtime cannot query frontend iframe state from the backend.
// Sandbox failures are handled gracefully by the frontend (silent fallback).
// Future: frontend can主动上报 iframe状态 via事件 if needed.

/// Execute a tool call and return the result string.
pub fn execute_tool(
    workspace_path: &str,
    tool_name: &str,
    input: &serde_json::Value,
    app: Option<&AppHandle>,
) -> (String, bool) {
    match tool_name {
        "read_file" => {
            let path = input["path"].as_str().unwrap_or("");
            match crate::commands::fs_commands::read_file(workspace_path, path) {
                Ok(content) => (content, false),
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "write_file" => {
            let path = input["path"].as_str().unwrap_or("");
            let content = input["content"].as_str().unwrap_or("");
            match crate::commands::fs_commands::write_file(workspace_path, path, content) {
                Ok(()) => (format!("Successfully wrote to {}", path), false),
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "append_file" => {
            let path = input["path"].as_str().unwrap_or("");
            let content = input["content"].as_str().unwrap_or("");
            match crate::commands::fs_commands::append_file(workspace_path, path, content) {
                Ok(()) => (format!("Successfully appended to {}", path), false),
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "list_files" => {
            let path = input["path"].as_str().unwrap_or(".");
            match crate::commands::fs_commands::list_files(workspace_path, path) {
                Ok(entries) => {
                    let result: Vec<String> = entries
                        .iter()
                        .map(|e| {
                            if e.is_dir {
                                format!("📁 {}/", e.name)
                            } else {
                                format!("📄 {}", e.name)
                            }
                        })
                        .collect();
                    (result.join("\n"), false)
                }
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "search_file" => {
            let path = input["path"].as_str().unwrap_or("");
            let query = input["query"].as_str().unwrap_or("");
            match crate::commands::fs_commands::search_file(workspace_path, path, query) {
                Ok(result) => (result, false),
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "read_teaching_material" => {
            let path = input["path"].as_str().unwrap_or("");
            // Restrict to materials/ directory only — prevent reading teacher config/runtime
            if !path.starts_with("materials/") && !path.starts_with("materials\\") {
                return ("Error: read_teaching_material can only access files in the materials/ directory. Use your lesson_brief for teacher config.".to_string(), true);
            }
            // Validate resolved path is within materials/ using canonicalization
            let base = std::path::PathBuf::from(workspace_path);
            let materials_dir = base.join("materials");
            let target = materials_dir.join(path);

            let canonical_materials = match materials_dir.canonicalize() {
                Ok(p) => p,
                Err(_) => {
                    return ("Error: could not resolve materials directory".to_string(), true);
                }
            };

            let is_within_materials = if target.exists() {
                // File exists — canonicalize and check
                match target.canonicalize() {
                    Ok(canonical) => canonical.starts_with(&canonical_materials),
                    Err(_) => false,
                }
            } else {
                // File doesn't exist yet — check that parent dir is within materials/
                match target.parent().map(|p| p.canonicalize()) {
                    Some(Ok(parent)) => parent.starts_with(&canonical_materials),
                    _ => false,
                }
            };

            if !is_within_materials {
                return ("Error: read_teaching_material can only access files in the materials/ directory.".to_string(), true);
            }

            match crate::commands::fs_commands::read_file(workspace_path, path) {
                Ok(content) => (content, false),
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "render_canvas" => {
            let title = input["title"].as_str().unwrap_or("Canvas");
            let content = input["content"].as_str().unwrap_or("");
            let canvas_type = input["type"].as_str().unwrap_or("svg");
            let parameters = input["parameters"].clone();

            if content.is_empty() {
                return ("Error: content is required for render_canvas".to_string(), true);
            }

            if let Err(e) = emit_canvas_event(app, "render_canvas", title, content, canvas_type, Some(parameters), None) {
                return (format!("Error: {}", e), true);
            }

            (format!("[Canvas rendered ({}): {}]", canvas_type, title), false)
        }
        "render_interactive_sandbox" => {
            let title = input["title"].as_str().unwrap_or("Interactive Sandbox");
            let html = input["html"].as_str().unwrap_or("");
            let initial_state = input["initial_state"].clone();

            if html.is_empty() {
                return ("Error: html is required for render_interactive_sandbox".to_string(), true);
            }

            if let Err(e) = emit_canvas_event(app, "render_interactive_sandbox", title, html, "sandbox", None, Some(initial_state)) {
                return (format!("Error: {}", e), true);
            }

            (format!("[Sandbox rendered: {}]", title), false)
        }
        "show_group_chat" => {
            // Skill layer emits group-chat-event via emit_group_chat_event().
            // runtime.rs provides fallback if Skill layer fails to emit.
            // (Previously runtime.rs emitted directly here - now coordinated via CanvasEventState)
            let messages = input["messages"].as_array();
            let msgs = match messages {
                Some(m) => m,
                None => return ("Error: messages array is required".to_string(), true),
            };

            if let Err(e) = emit_group_chat_event(app, msgs) {
                return (format!("Error: {}", e), true);
            }

            (format!("[Group chat displayed: {} messages]", msgs.len()), false)
        }
        "respond_to_student" => {
            // Content emission is handled in runtime.rs — just acknowledge here
            ("OK".to_string(), false)
        }
        "think" => {
            // think is silently consumed — internal notes, never shown to user
            ("OK".to_string(), false)
        }
        "end_student_turn" => {
            // end_student_turn is handled in runtime.rs — signal loop to break
            ("OK".to_string(), false)
        }
        "submit_lesson_brief" => {
            // Lesson brief extraction handled in runtime.rs — just acknowledge
            ("OK".to_string(), false)
        }
        _ => (format!("Unknown tool: {}", tool_name), true),
    }
}
