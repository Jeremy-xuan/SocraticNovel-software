//! Codex OAuth commands - Authorization Code + PKCE flow
//!
//! Implements OpenAI's Authorization Code + PKCE flow for Codex authentication.
//! PKCE verifier and auth code are stored in memory using Mutex + oneshot channel.
//! No temp files are written - follows system design requirement for memory storage.

use crate::commands::credential_store;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::Rng;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex as AsyncMutex};

// =============================================================================
// Constants
// =============================================================================

/// OpenAI OAuth Client ID - from official Codex CLI implementations
const OPENAI_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

/// OpenAI OAuth Authorization Endpoint
const OPENAI_AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";

/// OpenAI OAuth Token Endpoint
const OPENAI_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";

/// Local callback URL with path.
///
/// OpenAI Codex OAuth expects the official localhost callback URI used by Codex CLI.
const CALLBACK_URL: &str = "http://localhost:1455/auth/callback";

/// Callback port - must match the registered redirect URI
const CALLBACK_PORT: u16 = 1455;

/// Callback path - used to validate inbound OAuth redirect requests
const CALLBACK_PATH: &str = "/auth/callback";

/// Token storage key
const CODEX_TOKEN_KEY: &str = "codex_access_token";

// =============================================================================
// In-Memory PKCE State (follows system design: Memory Storage, no disk writes)
// =============================================================================

#[derive(Debug)]
struct AuthCallback {
    code: String,
    state: String,
}

/// PKCE state stored in memory - single use with guard.take() pattern
pub(crate) struct PkceState {
    verifier: String,
    state: String,
    /// Channel receiver to receive the callback result when redirect arrives
    code_rx: Option<oneshot::Receiver<Result<AuthCallback, String>>>,
    /// Timestamp for 10-minute timeout
    created_at: std::time::Instant,
}

/// In-memory storage for PKCE state - uses Mutex as per system design
static PKCE_STATE: AsyncMutex<Option<PkceState>> = AsyncMutex::const_new(None);

/// Check if PKCE state has expired (10 minute timeout as per system design)
pub(crate) fn is_pkce_expired(state: &PkceState) -> bool {
    state.created_at.elapsed() > std::time::Duration::from_secs(600)
}

// =============================================================================
// PKCE Generation
// =============================================================================

/// Generate a cryptographically random string for PKCE code_verifier
fn generate_random_string(length: usize) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Generate PKCE code_verifier and code_challenge
fn generate_pkce_pair() -> (String, String) {
    let verifier = generate_random_string(64); // 64 chars, within 43-128 range
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hash);
    (verifier, challenge)
}

// =============================================================================
// OAuth Response Types
// =============================================================================

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

// =============================================================================
// Callback Server
// =============================================================================

/// Start a local HTTP server to receive OAuth callback
/// Returns the authorization code on success
async fn wait_for_callback(port: u16) -> Result<AuthCallback, String> {
    let ipv4_addr = format!("127.0.0.1:{}", port);
    let ipv6_addr = format!("[::1]:{}", port);

    let ipv4_listener = TcpListener::bind(&ipv4_addr).await.ok();
    let ipv6_listener = TcpListener::bind(&ipv6_addr).await.ok();

    let mut stream = match (ipv4_listener, ipv6_listener) {
        (Some(ipv4), Some(ipv6)) => {
            tokio::select! {
                incoming = ipv4.accept() => incoming.map(|(stream, _)| stream),
                incoming = ipv6.accept() => incoming.map(|(stream, _)| stream),
            }
            .map_err(|e| format!("Failed to accept callback connection: {}", e))?
        }
        (Some(listener), None) | (None, Some(listener)) => listener
            .accept()
            .await
            .map(|(stream, _)| stream)
            .map_err(|e| format!("Failed to accept callback connection: {}", e))?,
        (None, None) => {
            return Err(format!(
                "Failed to bind callback server on port {} (both 127.0.0.1 and ::1 unavailable)",
                port
            ));
        }
    };

    let mut buffer = [0u8; 4096];
    let bytes_read = stream
        .read(&mut buffer)
        .await
        .map_err(|e| format!("Failed to read request: {}", e))?;

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let path = extract_request_path(&request)
        .ok_or_else(|| "Malformed OAuth callback request".to_string())?;

    if !path.starts_with(CALLBACK_PATH) {
        return Err(format!("Unexpected callback path: {}", path));
    }

    if let Some(error) = extract_query_param(&request, "error") {
        let error_description = extract_query_param(&request, "error_description")
            .map(|value| urlencoding::decode(&value).map(|v| v.into_owned()).unwrap_or(value))
            .unwrap_or_default();

        let message = if error_description.is_empty() {
            format!("OAuth authorization failed: {}", error)
        } else {
            format!("OAuth authorization failed: {} ({})", error, error_description)
        };

        let response = "HTTP/1.1 400 Bad Request\r\n\
                        Content-Type: text/html\r\n\
                        Connection: close\r\n\
                        \r\n\
                        <html><body><h1>Authorization Failed</h1><p>You can close this window and return to the app.</p></body></html>";
        stream
            .write_all(response.as_bytes())
            .await
            .map_err(|e| format!("Failed to send error response: {}", e))?;
        return Err(message);
    }

    let code = extract_query_param(&request, "code")
        .ok_or_else(|| "No authorization code in callback".to_string())?;
    let state = extract_query_param(&request, "state")
        .ok_or_else(|| "No OAuth state in callback".to_string())?;

    let response = "HTTP/1.1 200 OK\r\n\
                    Content-Type: text/html\r\n\
                    Connection: close\r\n\
                    \r\n\
                    <html><body><h1>Authorization Successful</h1><p>You can close this window and return to the app.</p></body></html>";
    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| format!("Failed to send response: {}", e))?;

    Ok(AuthCallback {
        code: urlencoding::decode(&code)
            .map(|v| v.into_owned())
            .unwrap_or(code),
        state: urlencoding::decode(&state)
            .map(|v| v.into_owned())
            .unwrap_or(state),
    })
}

/// Extract the request path from an HTTP request string
pub(crate) fn extract_request_path(request: &str) -> Option<String> {
    let request_line = request.lines().next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?;
    if method != "GET" {
        return None;
    }
    parts.next().map(|path| path.to_string())
}

/// Extract a query parameter from an HTTP request string
pub(crate) fn extract_query_param(request: &str, param: &str) -> Option<String> {
    let path = extract_request_path(request)?;
    let query = path.split('?').nth(1)?;

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        if key == param {
            return Some(parts.next().unwrap_or_default().to_string());
        }
    }
    None
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Step 1: Start Codex OAuth flow
/// Opens browser for authorization and starts background callback server
#[tauri::command]
pub async fn start_codex_oauth() -> Result<String, String> {
    // Generate PKCE pair
    let (verifier, challenge) = generate_pkce_pair();
    let state = generate_random_string(16);

    // Build authorization URL
    let redirect_uri = CALLBACK_URL;
    let auth_url = format!(
        "{}?{}",
        OPENAI_AUTH_URL,
        [
            ("response_type", "code"),
            ("client_id", OPENAI_CLIENT_ID),
            ("redirect_uri", redirect_uri),
            ("scope", "openid profile email offline_access"),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("state", &state),
            ("id_token_add_organizations", "true"),
            ("codex_cli_simplified_flow", "true"),
            ("originator", "codex_cli_rs"),
        ]
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
    );

    // Create oneshot channel for callback delivery
    let (code_tx, code_rx) = oneshot::channel::<Result<AuthCallback, String>>();

    // Store PKCE state in memory before opening the browser so we don't race the redirect.
    {
        let mut pkce_guard = PKCE_STATE.lock().await;
        *pkce_guard = Some(PkceState {
            verifier,
            state,
            code_rx: Some(code_rx),
            created_at: std::time::Instant::now(),
        });
    }

    // Open browser
    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Spawn background callback server that waits for the auth code
    tauri::async_runtime::spawn(async move {
        match wait_for_callback(CALLBACK_PORT).await {
            Ok(callback) => {
                let _ = code_tx.send(Ok(callback));
            }
            Err(e) => {
                let _ = code_tx.send(Err(e));
            }
        }
    });

    Ok(format!("Browser opened. Waiting for callback on port {}...", CALLBACK_PORT))
}

/// Step 2: Poll for completed authorization
/// Waits for callback, exchanges code with verifier for token
#[tauri::command]
pub async fn poll_codex_auth() -> Result<String, String> {
    // Retrieve PKCE state from memory (as per system design: Mutex<Option<PkceState>>)
    let (verifier, expected_state, code_rx) = {
        let mut pkce_guard = PKCE_STATE.lock().await;
        match pkce_guard.take() {
            Some(state) => {
                if is_pkce_expired(&state) {
                    return Err("PKCE verifier expired - OAuth timeout".to_string());
                }
                let rx = state
                    .code_rx
                    .ok_or_else(|| "No callback channel available".to_string())?;
                (state.verifier, state.state, rx)
            }
            None => {
                return Err("No active OAuth flow - call start_codex_oauth first".to_string());
            }
        }
    };

    let callback = tokio::time::timeout(std::time::Duration::from_secs(300), code_rx)
        .await
        .map_err(|_| "OAuth timeout - no callback received")?
        .map_err(|e| format!("Failed to receive code: {}", e))??;

    if callback.state != expected_state {
        return Err("OAuth state mismatch - please retry login".to_string());
    }

    // Exchange code for token
    let redirect_uri = CALLBACK_URL;
    let client = Client::new();
    let resp = client
        .post(OPENAI_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", OPENAI_CLIENT_ID),
            ("code", callback.code.as_str()),
            ("redirect_uri", redirect_uri),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        return Err(format!("Token endpoint returned HTTP {}: {}", status, body));
    }

    let token_resp: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Parse error: {}", e))?;

    let _ = (
        &token_resp.token_type,
        &token_resp.expires_in,
        &token_resp.refresh_token,
        &token_resp.scope,
    );

    if let Some(access_token) = token_resp.access_token {
        credential_store::set_password(CODEX_TOKEN_KEY, &access_token)?;
        Ok(access_token)
    } else {
        let err = token_resp.error.unwrap_or_else(|| "Unknown error".to_string());
        let desc = token_resp.error_description.unwrap_or_default();
        if desc.is_empty() {
            Err(err)
        } else {
            Err(format!("{}: {}", err, desc))
        }
    }
}

/// Check if a Codex OAuth token is stored
#[tauri::command]
pub fn check_codex_auth() -> Result<bool, String> {
    Ok(credential_store::get_password(CODEX_TOKEN_KEY)?.is_some())
}

/// Get the stored Codex OAuth token
#[tauri::command]
pub fn get_codex_token() -> Result<Option<String>, String> {
    credential_store::get_password(CODEX_TOKEN_KEY)
}

/// Remove the stored Codex OAuth token (logout)
#[tauri::command]
pub fn logout_codex() -> Result<(), String> {
    credential_store::delete_password(CODEX_TOKEN_KEY)
}

// =============================================================================
// Test Utilities (only compiled in test mode)
// =============================================================================

#[cfg(test)]
mod test_utils {
    use super::*;
    use tokio::sync::oneshot;

    /// Reset PKCE_STATE to None (only for testing)
    pub async fn reset_pkce_state() {
        let mut guard = PKCE_STATE.lock().await;
        *guard = None;
    }

    /// Get current PKCE verifier if state exists (only for testing)
    pub async fn get_pkce_verifier() -> Option<String> {
        let guard = PKCE_STATE.lock().await;
        guard.as_ref().map(|s| s.verifier.clone())
    }

    /// Set up PKCE_STATE for testing with a given verifier (only for testing)
    pub async fn set_pkce_state_for_test(verifier: String) {
        let mut guard = PKCE_STATE.lock().await;
        *guard = Some(PkceState {
            verifier,
            state: "test-state".to_string(),
            code_rx: None,
            created_at: std::time::Instant::now(),
        });
    }

    /// Set up PKCE_STATE with a channel for testing (only for testing)
    pub async fn set_pkce_state_with_channel(
        verifier: String,
    ) -> oneshot::Sender<Result<AuthCallback, String>> {
        let (code_tx, code_rx) = oneshot::channel::<Result<AuthCallback, String>>();
        let mut guard = PKCE_STATE.lock().await;
        *guard = Some(PkceState {
            verifier,
            state: "test-state".to_string(),
            code_rx: Some(code_rx),
            created_at: std::time::Instant::now(),
        });
        code_tx
    }

    /// Get a mutable reference to PKCE_STATE for testing (only for testing)
    pub async fn get_pkce_state_for_test() -> Option<std::time::Instant> {
        let guard = PKCE_STATE.lock().await;
        guard.as_ref().map(|s| s.created_at)
    }
}
