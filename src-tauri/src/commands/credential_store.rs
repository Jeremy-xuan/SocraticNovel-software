//! Credential storage abstraction.
//!
//! - **Release builds**: uses the OS keyring (macOS Keychain, Windows Credential Manager, etc.)
//! - **Debug builds**: uses a local JSON file to avoid macOS Keychain password prompts
//!   caused by ad-hoc code signatures changing on every recompile.

use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Release: OS keyring
// ---------------------------------------------------------------------------
#[cfg(not(debug_assertions))]
mod inner {
    use keyring::Entry;

    const SERVICE_NAME: &str = "SocraticNovel";

    pub fn set_password(key: &str, password: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("Keyring error: {}", e))?;
        entry
            .set_password(password)
            .map_err(|e| format!("Failed to store credential: {}", e))
    }

    pub fn get_password(key: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("Keyring error: {}", e))?;
        match entry.get_password() {
            Ok(val) => Ok(Some(val)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to retrieve credential: {}", e)),
        }
    }

    pub fn delete_password(key: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("Keyring error: {}", e))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to delete credential: {}", e)),
        }
    }
}

// ---------------------------------------------------------------------------
// Debug: file-based JSON storage
// ---------------------------------------------------------------------------
#[cfg(debug_assertions)]
mod inner {
    use super::HashMap;
    use std::fs;
    use std::path::PathBuf;

    fn store_path() -> Result<PathBuf, String> {
        let config = dirs::config_dir()
            .ok_or("Cannot determine config directory")?;
        let dir = config.join("SocraticNovel");
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
        Ok(dir.join("dev_credentials.json"))
    }

    fn read_store() -> Result<HashMap<String, String>, String> {
        let path = store_path()?;
        if !path.exists() {
            return Ok(HashMap::new());
        }
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read credential store: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse credential store: {}", e))
    }

    fn write_store(store: &HashMap<String, String>) -> Result<(), String> {
        let path = store_path()?;
        let data = serde_json::to_string_pretty(store)
            .map_err(|e| format!("Failed to serialize credential store: {}", e))?;
        fs::write(&path, data)
            .map_err(|e| format!("Failed to write credential store: {}", e))
    }

    pub fn set_password(key: &str, password: &str) -> Result<(), String> {
        let mut store = read_store()?;
        store.insert(key.to_string(), password.to_string());
        write_store(&store)
    }

    pub fn get_password(key: &str) -> Result<Option<String>, String> {
        let store = read_store()?;
        Ok(store.get(key).cloned())
    }

    pub fn delete_password(key: &str) -> Result<(), String> {
        let mut store = read_store()?;
        store.remove(key);
        write_store(&store)
    }
}

// Re-export the active implementation
pub use inner::*;
