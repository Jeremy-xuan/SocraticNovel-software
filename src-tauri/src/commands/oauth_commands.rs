use super::credential_store;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const GITHUB_TOKEN_KEY: &str = "github_token";
const GITHUB_CLIENT_ID: &str = "Iv23liEvzYZQZuplLGWI";
const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceFlowResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

/// Step 1: Start GitHub Device Flow — returns user_code + verification URL.
#[tauri::command]
pub async fn start_github_device_flow() -> Result<DeviceFlowResponse, String> {
    let client = Client::new();
    let resp = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID)])
        .send()
        .await
        .map_err(|e| format!("Device flow request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("GitHub returned HTTP {}: {}", status, body));
    }

    serde_json::from_str(&body).map_err(|e| format!("Parse error: {} (body: {})", e, body))
}

/// Step 2: Poll for token until user authorizes or timeout.
/// Returns: Ok(token) on success, Err with error message on failure.
#[tauri::command]
pub async fn poll_github_device_flow(device_code: String, interval: u64) -> Result<String, String> {
    let client = Client::new();
    let mut poll_interval = std::time::Duration::from_secs(interval.max(5));
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(900);

    loop {
        tokio::time::sleep(poll_interval).await;

        if tokio::time::Instant::now() > deadline {
            return Err("Device flow expired".to_string());
        }

        let resp = client
            .post(GITHUB_TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITHUB_CLIENT_ID),
                ("device_code", device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Poll request failed: {}", e))?;

        let body = resp.text().await.map_err(|e| format!("Read error: {}", e))?;
        let token_resp: TokenResponse =
            serde_json::from_str(&body).map_err(|e| format!("Parse error: {}", e))?;

        if let Some(token) = token_resp.access_token {
            credential_store::set_password(GITHUB_TOKEN_KEY, &token)?;
            return Ok(token);
        }

        match token_resp.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                poll_interval = std::time::Duration::from_secs(
                    token_resp.interval.unwrap_or(poll_interval.as_secs() + 5),
                );
                continue;
            }
            Some("expired_token") => return Err("Device code expired. Please try again.".to_string()),
            Some("access_denied") => return Err("Authorization denied by user.".to_string()),
            Some(err) => {
                let desc = token_resp.error_description.unwrap_or_default();
                return Err(format!("{}: {}", err, desc));
            }
            None => return Err(format!("Unexpected response: {}", body)),
        }
    }
}

/// Check if a GitHub OAuth token is stored.
#[tauri::command]
pub fn check_github_auth() -> Result<bool, String> {
    Ok(credential_store::get_password(GITHUB_TOKEN_KEY)?.is_some())
}

/// Get the stored GitHub OAuth token.
#[tauri::command]
pub fn get_github_token() -> Result<Option<String>, String> {
    credential_store::get_password(GITHUB_TOKEN_KEY)
}

/// Remove the stored GitHub OAuth token (logout).
#[tauri::command]
pub fn logout_github() -> Result<(), String> {
    credential_store::delete_password(GITHUB_TOKEN_KEY)
}
