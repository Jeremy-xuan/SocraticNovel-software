use super::credential_store;

/// Store an API key in the system credential store (cross-platform).
#[tauri::command]
pub fn set_api_key(provider: &str, key: &str) -> Result<(), String> {
    credential_store::set_password(provider, key)
}

/// Retrieve an API key from the system credential store.
#[tauri::command]
pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    credential_store::get_password(provider)
}

/// Check if an API key exists for the given provider.
#[tauri::command]
pub fn has_api_key(provider: &str) -> Result<bool, String> {
    Ok(credential_store::get_password(provider)?.is_some())
}

/// Delete an API key from the system credential store.
#[tauri::command]
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    credential_store::delete_password(provider)
}
