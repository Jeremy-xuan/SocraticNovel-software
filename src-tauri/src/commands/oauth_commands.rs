use super::credential_store;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const GITHUB_TOKEN_KEY: &str = "github_token";
const GITHUB_AUTHORIZE_URL: &str = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

#[derive(Debug, Serialize, Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// Generate a PKCE code_verifier (random base64url string, ~43 chars).
fn generate_code_verifier() -> String {
    // Use multiple UUID v4s as entropy source (128 bits each)
    let id1 = uuid::Uuid::new_v4();
    let id2 = uuid::Uuid::new_v4();
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(id1.as_bytes());
    bytes.extend_from_slice(id2.as_bytes());
    base64_url_encode(&bytes)
}

/// Base64url encode without padding.
fn base64_url_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Generate PKCE code_challenge from code_verifier using SHA-256.
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    base64_url_encode(&hash)
}

/// Start GitHub OAuth flow: open browser and wait for callback on a local HTTP server.
/// Returns the access token on success.
#[tauri::command]
pub async fn start_github_oauth(app: AppHandle, client_id: String) -> Result<String, String> {
    // Generate PKCE pair
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);

    // Generate state parameter for CSRF protection
    let state = uuid::Uuid::new_v4().to_string();

    // Bind to a random available port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind local server: {}", e))?;

    let local_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{}/callback", local_port);

    // Build authorization URL
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        GITHUB_AUTHORIZE_URL,
        urlencod(&client_id),
        urlencod(&redirect_uri),
        urlencod("read:user"),
        urlencod(&state),
        urlencod(&code_challenge),
    );

    // Open browser using Tauri's opener plugin
    app.opener()
        .open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for the callback (with 120s timeout)
    let auth_code = wait_for_callback(listener, &state).await?;

    // Exchange code for token
    let token = exchange_code_for_token(&client_id, &auth_code, &redirect_uri, &code_verifier).await?;

    // Store token in credential store
    credential_store::set_password(GITHUB_TOKEN_KEY, &token)?;

    Ok(token)
}

/// URL-encode a string (minimal implementation for query params).
fn urlencod(s: &str) -> String {
    s.replace('&', "%26")
        .replace('=', "%3D")
        .replace(' ', "%20")
        .replace(':', "%3A")
        .replace('/', "%2F")
        .replace('?', "%3F")
        .replace('#', "%23")
        .replace('+', "%2B")
}

/// Wait for GitHub to redirect the user's browser to our local server.
async fn wait_for_callback(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    let timeout = tokio::time::Duration::from_secs(120);

    let result = tokio::time::timeout(timeout, async {
        loop {
            let (mut stream, _) = listener
                .accept()
                .await
                .map_err(|e| format!("Accept error: {}", e))?;

            let mut buf = vec![0u8; 4096];
            let n = stream
                .read(&mut buf)
                .await
                .map_err(|e| format!("Read error: {}", e))?;

            let request = String::from_utf8_lossy(&buf[..n]).to_string();

            // Parse the GET request for code and state
            if let Some(path_line) = request.lines().next() {
                if let Some(query_str) = path_line.split(' ').nth(1) {
                    if let Some(query) = query_str.strip_prefix("/callback?") {
                        let params = parse_query_params(query);
                        let code = params.get("code").cloned();
                        let state = params.get("state").cloned();
                        let error = params.get("error").cloned();

                        if let Some(err) = error {
                            let desc = params
                                .get("error_description")
                                .cloned()
                                .unwrap_or_default();
                            // Send error response to browser
                            let html = format!(
                                "<html><body><h2>Authorization Failed</h2><p>{}: {}</p><p>You can close this window.</p></body></html>",
                                err, desc
                            );
                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                html.len(), html
                            );
                            let _ = stream.write_all(response.as_bytes()).await;
                            let _ = stream.shutdown().await;
                            return Err(format!("GitHub OAuth error: {}: {}", err, desc));
                        }

                        if let (Some(code), Some(st)) = (code, state) {
                            if st != expected_state {
                                let html = "<html><body><h2>Error</h2><p>State mismatch. Please try again.</p></body></html>";
                                let response = format!(
                                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                    html.len(), html
                                );
                                let _ = stream.write_all(response.as_bytes()).await;
                                let _ = stream.shutdown().await;
                                continue;
                            }

                            // Send success response to browser
                            let html = "<html><body style='font-family:system-ui;text-align:center;padding:60px'><h2>✅ Authorization Successful</h2><p>You can close this window and return to SocraticNovel.</p></body></html>";
                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                html.len(), html
                            );
                            let _ = stream.write_all(response.as_bytes()).await;
                            let _ = stream.shutdown().await;

                            return Ok(code);
                        }
                    }
                }
            }

            // Not the callback we expect, send a simple 404
            let response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.shutdown().await;
        }
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => Err("OAuth timeout: user did not complete authorization within 120 seconds".to_string()),
    }
}

/// Parse URL query string into key-value pairs.
fn parse_query_params(query: &str) -> std::collections::HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = parts.next().unwrap_or("").to_string();
            Some((key, urldecod(&value)))
        })
        .collect()
}

/// Simple URL decode.
fn urldecod(s: &str) -> String {
    s.replace("%20", " ")
        .replace("%26", "&")
        .replace("%3D", "=")
        .replace("%2B", "+")
        .replace("%2F", "/")
        .replace("%3A", ":")
}

/// Exchange authorization code for access token.
async fn exchange_code_for_token(
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<String, String> {
    let client = Client::new();

    let response = client
        .post(GITHUB_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read token response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Token exchange HTTP error ({}): {}", status, body));
    }

    let token_response: GithubTokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(err) = token_response.error {
        let desc = token_response.error_description.unwrap_or_default();
        return Err(format!("GitHub token error: {}: {}", err, desc));
    }

    token_response
        .access_token
        .ok_or_else(|| "No access_token in response".to_string())
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
