use super::types::*;
use futures_util::StreamExt;
use reqwest::Client;

const CLAUDE_API_URL: &str = "https://api.anthropic.com/v1/messages";
const CLAUDE_API_VERSION: &str = "2023-06-01";
const DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";

pub struct ClaudeClient {
    client: Client,
    api_key: String,
    model: String,
}

impl ClaudeClient {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: DEFAULT_MODEL.to_string(),
        }
    }

    /// Send a non-streaming request to Claude Messages API.
    /// Returns the full response with all content blocks.
    pub async fn send_message(
        &self,
        system: &str,
        messages: Vec<Message>,
        tools: Option<Vec<ToolDefinition>>,
    ) -> Result<(Vec<ContentBlock>, Option<String>), String> {
        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 8192,
            system: system.to_string(),
            messages,
            tools,
            stream: false,
        };

        let response = self
            .client
            .post(CLAUDE_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", CLAUDE_API_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            return Err(format!("Claude API error ({}): {}", status, body));
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {}", e))?;

        let stop_reason = parsed["stop_reason"].as_str().map(|s| s.to_string());

        let content_blocks = parsed["content"]
            .as_array()
            .ok_or("Missing content array")?
            .iter()
            .filter_map(|block| {
                let block_type = block["type"].as_str()?;
                match block_type {
                    "text" => Some(ContentBlock::Text {
                        text: block["text"].as_str()?.to_string(),
                    }),
                    "tool_use" => Some(ContentBlock::ToolUse {
                        id: block["id"].as_str()?.to_string(),
                        name: block["name"].as_str()?.to_string(),
                        input: block["input"].clone(),
                    }),
                    _ => None,
                }
            })
            .collect();

        Ok((content_blocks, stop_reason))
    }

    /// Send a streaming request to Claude. Returns a stream of SSE events.
    /// We parse these into our StreamEvent type.
    pub async fn send_message_streaming(
        &self,
        system: &str,
        messages: Vec<Message>,
        tools: Option<Vec<ToolDefinition>>,
    ) -> Result<Vec<StreamEvent>, String> {
        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 8192,
            system: system.to_string(),
            messages,
            tools,
            stream: true,
        };

        let response = self
            .client
            .post(CLAUDE_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", CLAUDE_API_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .map_err(|e| format!("Failed to read error: {}", e))?;
            return Err(format!("Claude API error ({}): {}", status, body));
        }

        let mut events = Vec::new();
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Parse SSE events from buffer
            while let Some(event_end) = buffer.find("\n\n") {
                let event_str = buffer[..event_end].to_string();
                buffer = buffer[event_end + 2..].to_string();

                // Parse SSE format: "event: type\ndata: json"
                let mut data_line = None;
                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        data_line = Some(data.to_string());
                    }
                }

                if let Some(data) = data_line {
                    if data == "[DONE]" {
                        continue;
                    }
                    match serde_json::from_str::<StreamEvent>(&data) {
                        Ok(event) => events.push(event),
                        Err(_e) => {
                            // Skip unparseable events (like [DONE])
                        }
                    }
                }
            }
        }

        Ok(events)
    }
}
