//! Codex OAuth commands - Authorization Code + PKCE flow
//!
//! Implements OpenAI's Authorization Code + PKCE flow for Codex authentication.
//! PKCE verifier and auth code are stored in memory using Mutex + oneshot channel.
//! No temp files are written - follows system design requirement for memory storage.

use crate::commands::credential_store;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{Mutex as AsyncMutex, oneshot};
use rand::Rng;

// =============================================================================
// Constants
// =============================================================================

/// OpenAI OAuth Client ID - from official Codex CLI implementations
const OPENAI_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

/// OpenAI OAuth Authorization Endpoint
const OPENAI_AUTH_URL: &str = "https://auth.openai.com/oauth/authorize";

/// OpenAI OAuth Token Endpoint
const OPENAI_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";

/// Local callback URL with path
const CALLBACK_URL: &str = "http://localhost:18901/auth/callback";

/// Callback port - must match registered redirect URI
const CALLBACK_PORT: u16 = 18901;

/// Token storage key
const CODEX_TOKEN_KEY: &str = "codex_access_token";

// =============================================================================
// In-Memory PKCE State (follows system design: Memory Storage, no disk writes)
// =============================================================================

/// PKCE state stored in memory - single use with guard.take() pattern
pub(crate) struct PkceState {
    verifier: String,
    /// Channel receiver to receive the auth code when callback arrives
    code_rx: Option<oneshot::Receiver<String>>,
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
async fn wait_for_callback(port: u16) -> Result<String, String> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await
        .map_err(|e| format!("Failed to bind callback server on port {}: {}", port, e))?;

    let (mut stream, _) = listener.accept().await
        .map_err(|e| format!("Failed to accept connection: {}", e))?;

    let mut buffer = [0u8; 4096];
    let bytes_read = stream.read(&mut buffer).await
        .map_err(|e| format!("Failed to read request: {}", e))?;

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);

    // Parse the callback URL from the request
    // Format: GET /callback?code=XXX&state=XXX HTTP/1.1...
    let code = extract_query_param(&request, "code")
        .ok_or_else(|| "No authorization code in callback".to_string())?;

    // Send 200 OK response
    let response = "HTTP/1.1 200 OK\r\n\
                    Content-Type: text/html\r\n\
                    Connection: close\r\n\
                    \r\n\
                    <html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>";
    stream.write_all(response.as_bytes()).await
        .map_err(|e| format!("Failed to send response: {}", e))?;

    Ok(code)
}

/// Extract a query parameter from an HTTP request string
pub(crate) fn extract_query_param(request: &str, param: &str) -> Option<String> {
    // Find the query line (first line)
    let query_line = request.lines().next()?;
    // Extract URL from GET line
    let url_part = query_line.strip_prefix("GET ")?.split(' ').nth(1)?;
    // Parse query string
    let query = url_part.split('?').nth(1)?;

    for pair in query.split('&') {
        let mut parts = pair.split('=');
        let key = parts.next()?;
        if key == param {
            return Some(parts.next()?.to_string());
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
            ("redirect_uri", &redirect_uri),
            ("scope", "openid profile email offline_access"),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
            ("state", &state),
            ("id_token_add_organizations", "true"),
            ("codex_cli_simplified_flow", "true"),
            ("originator", "opencode"),
        ]
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&")
    );

    // Open browser
    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Create oneshot channel for code delivery
    let (code_tx, code_rx) = oneshot::channel::<String>();

    // Store PKCE state in memory (as per system design: Mutex<Option<PkceState>>)
    // Store verifier + receiver (not sender) for poll_codex_auth to use
    {
        let mut pkce_guard = PKCE_STATE.lock().await;
        *pkce_guard = Some(PkceState {
            verifier: verifier.clone(),
            code_rx: Some(code_rx),
            created_at: std::time::Instant::now(),
        });
    }

    // Spawn background callback server that waits for the auth code
    // When callback arrives, we send it via the oneshot channel (in-memory).
    // code_tx is owned by this task; code_rx is stored in PKCE_STATE for poll_codex_auth.
    tauri::async_runtime::spawn(async move {
        match wait_for_callback(CALLBACK_PORT).await {
            Ok(code) => {
                // Send code through channel - poll_codex_auth is waiting on code_rx
                let _ = code_tx.send(code); // Ignore send error if receiver was already dropped
            }
            Err(e) => {
                eprintln!("Callback server error: {}", e);
            }
        }
    });

    // Store verifier separately for poll_codex_auth to retrieve (oneshot channel for code only)
    // Note: verifier is stored in PKCE_STATE, code is delivered via channel

    Ok(format!("Browser opened. Waiting for callback on port {}...", CALLBACK_PORT))
}

/// Step 2: Poll for completed authorization
/// Waits for callback, exchanges code with verifier for token
#[tauri::command]
pub async fn poll_codex_auth() -> Result<String, String> {
    // Retrieve PKCE state from memory (as per system design: Mutex<Option<PkceState>>)
    let (verifier, code_rx) = {
        let mut pkce_guard = PKCE_STATE.lock().await;
        match pkce_guard.take() { // guard.take() - one-time use as per system design
            Some(state) => {
                // Check timeout (10 minutes as per system design)
                if is_pkce_expired(&state) {
                    return Err("PKCE verifier expired - OAuth timeout".to_string());
                }
                // Take the receiver (one-time use pattern)
                let rx = state.code_rx.ok_or_else(|| "No callback channel available".to_string())?;
                (state.verifier, rx)
            }
            None => {
                return Err("No active OAuth flow - call start_codex_oauth first".to_string());
            }
        }
    };

    // Wait for callback with 5-minute timeout
    // code_rx is a oneshot::Receiver which implements Future
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        code_rx
    )
    .await
    .map_err(|_| "OAuth timeout - no callback received")?
    .map_err(|e| format!("Failed to receive code: {}", e))?;

    // Exchange code for token
    let redirect_uri = CALLBACK_URL;
    let client = Client::new();
    let resp = client
        .post(OPENAI_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", OPENAI_CLIENT_ID),
            ("code", &code),
            ("redirect_uri", &redirect_uri),
            ("code_verifier", &verifier),
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

    if let Some(access_token) = token_resp.access_token {
        credential_store::set_password(CODEX_TOKEN_KEY, &access_token)?;
        Ok(access_token)
    } else {
        let err = token_resp.error.unwrap_or_else(|| "Unknown error".to_string());
        let desc = token_resp.error_description.unwrap_or_default();
        Err(format!("{}: {}", err, desc))
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
            code_rx: None,
            created_at: std::time::Instant::now(),
        });
    }

    /// Set up PKCE_STATE with a channel for testing (only for testing)
    pub async fn set_pkce_state_with_channel(verifier: String) -> oneshot::Sender<String> {
        let (code_tx, code_rx) = oneshot::channel::<String>();
        let mut guard = PKCE_STATE.lock().await;
        *guard = Some(PkceState {
            verifier,
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
