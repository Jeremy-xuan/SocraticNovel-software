use super::types::ToolDefinition;
use serde_json::json;

/// Returns the tool definitions to send to Claude API.
pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".to_string(),
            description: "Read the contents of a file in the workspace. Use this to load configuration files, student progress, teaching materials, etc.".to_string(),
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
        },
        ToolDefinition {
            name: "write_file".to_string(),
            description: "Write content to a file in the workspace. Creates the file if it doesn't exist, overwrites if it does. Use this to update progress, save session logs, write notes, etc.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the workspace"
                    },
                    "content": {
                        "type": "string",
                        "description": "The full content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "append_file".to_string(),
            description: "Append content to the end of an existing file. Use this for logs, session records, or any file where you want to add without overwriting.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path within the workspace"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to append to the file"
                    }
                },
                "required": ["path", "content"]
            }),
        },
        ToolDefinition {
            name: "list_files".to_string(),
            description: "List files and directories in a given directory path within the workspace.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative directory path within the workspace (e.g., 'teacher/runtime/')"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "search_file".to_string(),
            description: "Search for a text query within a specific file. Returns matching lines with line numbers.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file to search in"
                    },
                    "query": {
                        "type": "string",
                        "description": "Text to search for (case-insensitive)"
                    }
                },
                "required": ["path", "query"]
            }),
        },
        ToolDefinition {
            name: "render_canvas".to_string(),
            description: "Render a visual element (SVG diagram, chart, formula visualization) on the student's whiteboard/canvas panel. Use this to show physics diagrams, electric field lines, circuit diagrams, coordinate systems, graphs, etc. The content should be valid SVG markup.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "A short title for the canvas item"
                    },
                    "content": {
                        "type": "string",
                        "description": "SVG markup string to render on the canvas"
                    }
                },
                "required": ["content"]
            }),
        },
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
        "render_canvas" => {
            // render_canvas is handled on the frontend side — we just acknowledge it
            let title = input["title"].as_str().unwrap_or("Canvas");
            let content = input["content"].as_str().unwrap_or("");
            if content.is_empty() {
                ("Error: content is required for render_canvas".to_string(), true)
            } else {
                (format!("[Canvas rendered: {}]", title), false)
            }
        }
        _ => (format!("Unknown tool: {}", tool_name), true),
    }
}
