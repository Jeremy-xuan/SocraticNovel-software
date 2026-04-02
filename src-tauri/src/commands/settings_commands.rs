use super::credential_store;
use serde::{Deserialize};

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

/// Custom provider configuration
#[derive(Debug, Deserialize, serde::Serialize)]
pub struct CustomProviderConfig {
    pub custom_url: String,
    pub api_key: String,
    pub model: String,
    pub protocol: String,
}

/// Update custom provider configuration
#[tauri::command]
pub fn update_custom_provider(config: CustomProviderConfig) -> Result<(), String> {
    eprintln!("[DEBUG] update_custom_provider called with: {:?}", config);
    // Store custom provider settings as separate credentials
    credential_store::set_password("custom_provider_url", &config.custom_url)?;
    credential_store::set_password("custom_provider_key", &config.api_key)?;
    credential_store::set_password("custom_provider_model", &config.model)?;
    credential_store::set_password("custom_provider_protocol", &config.protocol)?;
    eprintln!("[DEBUG] update_custom_provider completed successfully");
    Ok(())
}

/// Get custom provider configuration
#[tauri::command]
pub fn get_custom_provider() -> Result<Option<CustomProviderConfig>, String> {
    let url = match credential_store::get_password("custom_provider_url")? {
        Some(u) => u,
        None => return Ok(None),
    };
    let api_key = credential_store::get_password("custom_provider_key")?.unwrap_or_default();
    let model = credential_store::get_password("custom_provider_model")?.unwrap_or_default();
    let protocol = credential_store::get_password("custom_provider_protocol")?.unwrap_or_default();

    Ok(Some(CustomProviderConfig {
        custom_url: url,
        api_key,
        model,
        protocol,
    }))
}
