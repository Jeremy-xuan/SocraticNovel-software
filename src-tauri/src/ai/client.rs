// src-tauri/src/ai/client.rs
//
// ApiBackend: unified factory that resolves a provider string into the
// appropriate typed client (ClaudeClient or OpenAiClient).

use super::claude::ClaudeClient;
use super::openai::OpenAiClient;

pub enum ApiBackend {
    Claude(ClaudeClient),
    OpenAI(OpenAiClient),
}

impl ApiBackend {
    /// Construct the correct API client for the given provider string.
    /// Returns `Err` for unknown providers or when a required `custom_url` is missing.
    pub fn from_provider(
        provider: &str,
        api_key: &str,
        model: &str,
        custom_url: Option<&str>,
    ) -> Result<Self, String> {
        match provider {
            "anthropic" => Ok(ApiBackend::Claude(
                ClaudeClient::with_model(api_key.to_string(), model),
            )),
            "custom-anthropic" => {
                let url = custom_url
                    .ok_or_else(|| "custom_url required for custom-anthropic".to_string())?;
                Ok(ApiBackend::Claude(ClaudeClient::with_custom_url(
                    api_key.to_string(),
                    url.to_string(),
                    model.to_string(),
                )))
            }
            "openai" | "deepseek" | "google" | "github" => Ok(ApiBackend::OpenAI(
                OpenAiClient::with_model(api_key.to_string(), provider, model),
            )),
            "custom-openai" | "custom" => {
                let url = custom_url
                    .ok_or_else(|| "custom_url required for custom provider".to_string())?;
                Ok(ApiBackend::OpenAI(OpenAiClient::with_custom_url(
                    api_key.to_string(),
                    url.to_string(),
                    model.to_string(),
                )))
            }
            _ => Err(format!("Unsupported provider: {}", provider)),
        }
    }
}
