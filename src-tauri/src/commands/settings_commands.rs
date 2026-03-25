use keyring::Entry;

const SERVICE_NAME: &str = "SocraticNovel";

/// Store an API key in the system credential store (cross-platform).
#[tauri::command]
pub fn set_api_key(provider: &str, key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| format!("Keyring error: {}", e))?;
    entry.set_password(key)
        .map_err(|e| format!("Failed to store key: {}", e))?;
    Ok(())
}

/// Retrieve an API key from the system credential store.
#[tauri::command]
pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| format!("Keyring error: {}", e))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve key: {}", e)),
    }
}

/// Check if an API key exists for the given provider.
#[tauri::command]
pub fn has_api_key(provider: &str) -> Result<bool, String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| format!("Keyring error: {}", e))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("Failed to check key: {}", e)),
    }
}

/// Delete an API key from the system credential store.
#[tauri::command]
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, provider)
        .map_err(|e| format!("Keyring error: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete key: {}", e)),
    }
}
