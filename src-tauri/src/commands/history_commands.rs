use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Summary returned when listing session history (no full messages).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistorySummary {
    pub id: String,
    pub started_at: String,
    pub ended_at: String,
    pub message_count: usize,
    pub canvas_count: usize,
    pub summary: String,
}

/// Full session history entry (includes all data).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHistoryEntry {
    pub id: String,
    pub started_at: String,
    pub ended_at: String,
    pub message_count: usize,
    pub canvas_count: usize,
    pub summary: String,
    pub messages: serde_json::Value,
    pub canvas_items: serde_json::Value,
    pub group_chat_messages: serde_json::Value,
    pub annotations: serde_json::Value,
}

fn history_dir(workspace_path: &str) -> Result<PathBuf, String> {
    let dir = PathBuf::from(workspace_path).join("session_history");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create session_history dir: {e}"))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn save_session_history(
    workspace_path: String,
    data: SessionHistoryEntry,
) -> Result<String, String> {
    let dir = history_dir(&workspace_path)?;
    let filename = format!("{}.json", data.id);
    let filepath = dir.join(&filename);
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("JSON serialize error: {e}"))?;
    fs::write(&filepath, json)
        .map_err(|e| format!("Failed to write session history: {e}"))?;
    Ok(data.id)
}

#[tauri::command]
pub fn list_session_history(
    workspace_path: String,
) -> Result<Vec<SessionHistorySummary>, String> {
    let dir = history_dir(&workspace_path)?;
    let mut entries: Vec<SessionHistorySummary> = Vec::new();

    let read_dir = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read session_history dir: {e}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        // Parse just the summary fields (skip messages/canvas for performance)
        let full: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("JSON parse error {}: {e}", path.display()))?;
        let summary = SessionHistorySummary {
            id: full["id"].as_str().unwrap_or("").to_string(),
            started_at: full["startedAt"].as_str().unwrap_or("").to_string(),
            ended_at: full["endedAt"].as_str().unwrap_or("").to_string(),
            message_count: full["messageCount"].as_u64().unwrap_or(0) as usize,
            canvas_count: full["canvasCount"].as_u64().unwrap_or(0) as usize,
            summary: full["summary"].as_str().unwrap_or("").to_string(),
        };
        entries.push(summary);
    }

    // Sort by startedAt descending (newest first)
    entries.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(entries)
}

#[tauri::command]
pub fn load_session_history(
    workspace_path: String,
    session_id: String,
) -> Result<SessionHistoryEntry, String> {
    let dir = history_dir(&workspace_path)?;
    let filepath = dir.join(format!("{}.json", session_id));
    if !filepath.exists() {
        return Err(format!("Session history not found: {session_id}"));
    }
    let content = fs::read_to_string(&filepath)
        .map_err(|e| format!("Failed to read session history: {e}"))?;
    let entry: SessionHistoryEntry = serde_json::from_str(&content)
        .map_err(|e| format!("JSON parse error: {e}"))?;
    Ok(entry)
}

#[tauri::command]
pub fn delete_session_history(
    workspace_path: String,
    session_id: String,
) -> Result<(), String> {
    let dir = history_dir(&workspace_path)?;
    let filepath = dir.join(format!("{}.json", session_id));
    if filepath.exists() {
        fs::remove_file(&filepath)
            .map_err(|e| format!("Failed to delete session history: {e}"))?;
    }
    Ok(())
}
