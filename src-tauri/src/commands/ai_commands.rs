use crate::ai::runtime;
use crate::ai::types::*;
use serde::Deserialize;
use tauri::AppHandle;
use std::sync::Mutex;

/// Conversation state held in Tauri's managed state
pub struct ConversationState {
    pub messages: Mutex<Vec<Message>>,
    pub system_prompt: Mutex<String>,
    pub workspace_path: Mutex<String>,
    pub provider: Mutex<String>,
}

impl Default for ConversationState {
    fn default() -> Self {
        Self {
            messages: Mutex::new(Vec::new()),
            system_prompt: Mutex::new(String::new()),
            workspace_path: Mutex::new(String::new()),
            provider: Mutex::new("anthropic".to_string()),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionPayload {
    pub workspace_path: String,
    pub system_prompt: String,
    #[serde(default = "default_provider")]
    pub provider: String,
}

fn default_provider() -> String {
    "anthropic".to_string()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessagePayload {
    pub text: String,
    pub api_key: String,
}

/// Start a new AI session — set system prompt, workspace, and provider; clear history
#[tauri::command]
pub fn start_ai_session(
    state: tauri::State<'_, ConversationState>,
    payload: StartSessionPayload,
) -> Result<(), String> {
    let mut messages = state.messages.lock().map_err(|e| e.to_string())?;
    let mut system_prompt = state.system_prompt.lock().map_err(|e| e.to_string())?;
    let mut workspace_path = state.workspace_path.lock().map_err(|e| e.to_string())?;
    let mut provider = state.provider.lock().map_err(|e| e.to_string())?;

    messages.clear();
    *system_prompt = payload.system_prompt;
    *workspace_path = payload.workspace_path;
    *provider = payload.provider;

    Ok(())
}

/// Send a user message and run the agent loop.
/// The AI response (including tool calls) is streamed via Tauri events.
#[tauri::command]
pub async fn send_chat_message(
    app: AppHandle,
    state: tauri::State<'_, ConversationState>,
    payload: SendMessagePayload,
) -> Result<(), String> {
    let system_prompt = state
        .system_prompt
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let workspace_path = state
        .workspace_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let provider = state
        .provider
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    // Add user message
    let user_msg = Message {
        role: "user".to_string(),
        content: vec![ContentBlock::Text {
            text: payload.text.clone(),
        }],
    };

    let current_messages = {
        let mut messages = state.messages.lock().map_err(|e| e.to_string())?;
        messages.push(user_msg);
        messages.clone()
    };

    // Run agent loop (this may involve multiple API calls if tool_use)
    let updated_messages = runtime::run_agent_turn(
        &app,
        &payload.api_key,
        &provider,
        &workspace_path,
        &system_prompt,
        current_messages,
    )
    .await?;

    // Update conversation state with full history
    {
        let mut messages = state.messages.lock().map_err(|e| e.to_string())?;
        *messages = updated_messages;
    }

    Ok(())
}

/// Get current conversation history (for debugging / persistence)
#[tauri::command]
pub fn get_conversation_history(
    state: tauri::State<'_, ConversationState>,
) -> Result<Vec<Message>, String> {
    let messages = state.messages.lock().map_err(|e| e.to_string())?;
    Ok(messages.clone())
}
