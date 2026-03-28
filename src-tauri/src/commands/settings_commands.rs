use super::credential_store;

/// Store an API key in the system credential store (cross-platform).
#[tauri::command]
pub fn set_api_key(provider: &str, key: &str) -> Result<(), String> {
    credential_store::set_password(provider, key)
}

/// Retrieve an API key from the system credential store.
/// For GitHub, also checks the OAuth token stored under "github_token".
#[tauri::command]
pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    if let Some(key) = credential_store::get_password(provider)? {
        return Ok(Some(key));
    }
    // Fallback: OAuth tokens are stored as "{provider}_token"
    credential_store::get_password(&format!("{}_token", provider))
}

/// Check if an API key exists for the given provider.
#[tauri::command]
pub fn has_api_key(provider: &str) -> Result<bool, String> {
    Ok(get_api_key(provider)?.is_some())
}

/// Delete an API key from the system credential store.
#[tauri::command]
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    credential_store::delete_password(provider)
}
