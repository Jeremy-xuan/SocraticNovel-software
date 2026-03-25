use super::types::*;
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

    pub fn with_model(api_key: String, model: &str) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: if model.is_empty() { DEFAULT_MODEL.to_string() } else { model.to_string() },
        }
    }

    /// Send a non-streaming request to Claude Messages API (fallback).
    #[allow(dead_code)]
    pub async fn send_message(
        &self,
        system: &str,
        messages: Vec<Message>,
        tools: Option<Vec<ToolDefinition>>,
    ) -> Result<(Vec<ContentBlock>, Option<String>), String> {
        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 4096,
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

    /// Start a streaming request and return the HTTP response for incremental processing.
    pub async fn start_streaming(
        &self,
        system: &str,
        messages: Vec<Message>,
        tools: Option<Vec<ToolDefinition>>,
    ) -> Result<reqwest::Response, String> {
        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 4096,
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

        Ok(response)
    }
}
