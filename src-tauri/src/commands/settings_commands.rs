use std::process::Command;

const SERVICE_NAME: &str = "SocraticNovel";

/// Store an API key in macOS Keychain using the `security` CLI.
#[tauri::command]
pub fn set_api_key(provider: &str, key: &str) -> Result<(), String> {
    // Delete existing entry first (ignore errors if it doesn't exist)
    let _ = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE_NAME, "-a", provider])
        .output();

    let output = Command::new("security")
        .args([
            "add-generic-password",
            "-s",
            SERVICE_NAME,
            "-a",
            provider,
            "-w",
            key,
            "-U", // Update if exists
        ])
        .output()
        .map_err(|e| format!("Failed to execute security command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to store API key: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// Retrieve an API key from macOS Keychain.
#[tauri::command]
pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            SERVICE_NAME,
            "-a",
            provider,
            "-w", // Output just the password
        ])
        .output()
        .map_err(|e| format!("Failed to execute security command: {}", e))?;

    if output.status.success() {
        let key = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if key.is_empty() {
            Ok(None)
        } else {
            Ok(Some(key))
        }
    } else {
        // Not found is not an error
        Ok(None)
    }
}

/// Check if an API key exists in Keychain for the given provider.
#[tauri::command]
pub fn has_api_key(provider: &str) -> Result<bool, String> {
    match get_api_key(provider)? {
        Some(_) => Ok(true),
        None => Ok(false),
    }
}

/// Delete an API key from Keychain.
#[tauri::command]
pub fn delete_api_key(provider: &str) -> Result<(), String> {
    let output = Command::new("security")
        .args(["delete-generic-password", "-s", SERVICE_NAME, "-a", provider])
        .output()
        .map_err(|e| format!("Failed to execute security command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        // Not found is not an error
        Ok(())
    }
}
