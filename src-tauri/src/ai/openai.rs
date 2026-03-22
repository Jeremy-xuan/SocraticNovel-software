use super::types::*;
use reqwest::Client;

/// OpenAI-compatible API client (works with OpenAI, DeepSeek, and other compatible providers)
pub struct OpenAiClient {
    client: Client,
    api_key: String,
    model: String,
    base_url: String,
}

impl OpenAiClient {
    pub fn new(api_key: String, provider: &str) -> Self {
        let (base_url, model) = match provider {
            "openai" => (
                "https://api.openai.com/v1/chat/completions".to_string(),
                "gpt-4o".to_string(),
            ),
            "deepseek" => (
                "https://api.deepseek.com/v1/chat/completions".to_string(),
                "deepseek-reasoner".to_string(),
            ),
            "google" => (
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
                    .to_string(),
                "gemini-2.5-flash".to_string(),
            ),
            _ => (
                "https://api.openai.com/v1/chat/completions".to_string(),
                "gpt-4o".to_string(),
            ),
        };

        Self {
            client: Client::new(),
            api_key,
            model,
            base_url,
        }
    }

    /// Send a non-streaming request using OpenAI-compatible format.
    /// Translates from/to our internal Claude-style types for compatibility.
    pub async fn send_message(
        &self,
        system: &str,
        messages: Vec<Message>,
        tools: Option<Vec<ToolDefinition>>,
    ) -> Result<(Vec<ContentBlock>, Option<String>), String> {
        // Build OpenAI-format messages
        let mut oai_messages: Vec<serde_json::Value> = Vec::new();

        // System message
        oai_messages.push(serde_json::json!({
            "role": "system",
            "content": system,
        }));

        // Convert our internal messages to OpenAI format
        for msg in &messages {
            match msg.role.as_str() {
                "user" => {
                    // Check if this is a tool_result message
                    let has_tool_results = msg
                        .content
                        .iter()
                        .any(|b| matches!(b, ContentBlock::ToolResult { .. }));

                    if has_tool_results {
                        // Each tool result becomes a separate "tool" role message
                        for block in &msg.content {
                            if let ContentBlock::ToolResult {
                                tool_use_id,
                                content,
                                ..
                            } = block
                            {
                                oai_messages.push(serde_json::json!({
                                    "role": "tool",
                                    "tool_call_id": tool_use_id,
                                    "content": content,
                                }));
                            }
                        }
                    } else {
                        // Regular user message — extract text
                        let text: String = msg
                            .content
                            .iter()
                            .filter_map(|b| {
                                if let ContentBlock::Text { text } = b {
                                    Some(text.as_str())
                                } else {
                                    None
                                }
                            })
                            .collect::<Vec<_>>()
                            .join("");
                        oai_messages.push(serde_json::json!({
                            "role": "user",
                            "content": text,
                        }));
                    }
                }
                "assistant" => {
                    let mut content_text = String::new();
                    let mut tool_calls: Vec<serde_json::Value> = Vec::new();

                    for block in &msg.content {
                        match block {
                            ContentBlock::Text { text } => content_text.push_str(text),
                            ContentBlock::ToolUse { id, name, input } => {
                                tool_calls.push(serde_json::json!({
                                    "id": id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": input.to_string(),
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }

                    let mut assistant_msg = serde_json::json!({ "role": "assistant" });
                    if !content_text.is_empty() || tool_calls.is_empty() {
                        assistant_msg["content"] = serde_json::json!(content_text);
                    }
                    if !tool_calls.is_empty() {
                        assistant_msg["tool_calls"] = serde_json::json!(tool_calls);
                    }
                    oai_messages.push(assistant_msg);
                }
                _ => {}
            }
        }

        // Convert tool definitions to OpenAI format
        let oai_tools: Option<Vec<serde_json::Value>> = tools.map(|defs| {
            defs.iter()
                .filter(|t| t.name != "render_canvas") // render_canvas is internal
                .map(|t| {
                    serde_json::json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.input_schema,
                        }
                    })
                })
                .collect()
        });

        // Build request body
        let mut request_body = serde_json::json!({
            "model": self.model,
            "messages": oai_messages,
        });

        // deepseek-reasoner uses different token limit param
        if self.model == "deepseek-reasoner" {
            // Don't set max_tokens for reasoner — it manages its own limits
        } else {
            request_body["max_tokens"] = serde_json::json!(8192);
        }

        if let Some(ref tools_val) = oai_tools {
            if !tools_val.is_empty() {
                request_body["tools"] = serde_json::json!(tools_val);
            }
        }

        // Send request
        let response = self
            .client
            .post(&self.base_url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            return Err(format!("API error ({}): {}", status, body));
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {}", e))?;

        // Parse OpenAI response into our internal types
        let choice = parsed["choices"]
            .as_array()
            .and_then(|c| c.first())
            .ok_or("No choices in response")?;

        let finish_reason = choice["finish_reason"].as_str().map(|s| {
            // Map OpenAI finish reasons to Claude-compatible ones
            match s {
                "stop" => "end_turn".to_string(),
                "tool_calls" => "tool_use".to_string(),
                other => other.to_string(),
            }
        });

        let message = &choice["message"];
        let mut content_blocks: Vec<ContentBlock> = Vec::new();

        // Note: deepseek-reasoner returns reasoning_content (chain of thought)
        // We intentionally skip it — only use the final content

        // Extract text content
        if let Some(text) = message["content"].as_str() {
            if !text.is_empty() {
                content_blocks.push(ContentBlock::Text {
                    text: text.to_string(),
                });
            }
        }

        // Extract tool calls
        if let Some(tool_calls) = message["tool_calls"].as_array() {
            for tc in tool_calls {
                let id = tc["id"].as_str().unwrap_or("").to_string();
                let name = tc["function"]["name"].as_str().unwrap_or("").to_string();
                let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                let input: serde_json::Value =
                    serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));

                content_blocks.push(ContentBlock::ToolUse { id, name, input });
            }
        }

        // If no content at all, add empty text
        if content_blocks.is_empty() {
            content_blocks.push(ContentBlock::Text {
                text: String::new(),
            });
        }

        Ok((content_blocks, finish_reason))
    }
}
