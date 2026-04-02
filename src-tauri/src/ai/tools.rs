use super::types::ToolDefinition;
use serde_json::json;

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

fn tool_render_canvas() -> ToolDefinition {
    ToolDefinition {
        name: "render_canvas".to_string(),
        description: "Draw a diagram, chart, or visual on the student's canvas panel. Accepts Mermaid syntax (flowcharts, sequence diagrams, class diagrams) or raw SVG markup. Use this tool whenever explaining a concept that benefits from a visual — never describe a diagram in text when you can draw it.".to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "title": { "type": "string", "description": "A short title for the canvas item" },
                "content": { "type": "string", "description": "SVG markup string or Mermaid diagram syntax to render on the canvas" },
                "type": { "type": "string", "enum": ["svg", "mermaid"], "description": "Content type: 'svg' for SVG markup, 'mermaid' for Mermaid diagram syntax", "default": "svg" }
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
        tool_think(),
        tool_read_teaching_material(),
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
        tool_think(),
        tool_read_file(),
        tool_search_file(),
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
    ]
}

/// Execute a tool call and return the result string.
pub fn execute_tool(
    workspace_path: &str,
    tool_name: &str,
    input: &serde_json::Value,
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
            match crate::commands::fs_commands::read_file(workspace_path, path) {
                Ok(content) => (content, false),
                Err(e) => (format!("Error: {}", e), true),
            }
        }
        "render_canvas" => {
            // render_canvas is handled on the frontend side — we just acknowledge it
            let title = input["title"].as_str().unwrap_or("Canvas");
            let content = input["content"].as_str().unwrap_or("");
            let canvas_type = input["type"].as_str().unwrap_or("svg");
            if content.is_empty() {
                ("Error: content is required for render_canvas".to_string(), true)
            } else {
                (format!("[Canvas rendered ({}): {}]", canvas_type, title), false)
            }
        }
        "show_group_chat" => {
            // show_group_chat is handled on the frontend side via events
            let messages = input["messages"].as_array();
            match messages {
                Some(msgs) => (format!("[Group chat displayed: {} messages]", msgs.len()), false),
                None => ("Error: messages array is required".to_string(), true),
            }
        }
        "respond_to_student" => {
            // Content emission is handled in runtime.rs — just acknowledge here
            ("OK".to_string(), false)
        }
        "think" => {
            // think is silently consumed — internal notes, never shown to user
            ("OK".to_string(), false)
        }
        "submit_lesson_brief" => {
            // Lesson brief extraction handled in runtime.rs — just acknowledge
            ("OK".to_string(), false)
        }
        _ => (format!("Unknown tool: {}", tool_name), true),
    }
}
