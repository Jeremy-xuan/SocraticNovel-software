//! Mock OAuth Server for testing Codex OAuth flow
//!
//! Simulates OpenAI OAuth authorization endpoint and token endpoint.
//! Binds to port 18901 to match the callback URL used in codex_oauth_commands.rs

use std::sync::{Arc, Mutex};
use std::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// Mock OAuth Server state
pub struct MockOAuthState {
    pub authorization_codes: Vec<String>,
    pub access_tokens: Vec<String>,
    pub should_error: Option<String>,
    pub callback_port: u16,
}

impl MockOAuthState {
    pub fn new(callback_port: u16) -> Self {
        Self {
            authorization_codes: Vec::new(),
            access_tokens: Vec::new(),
            should_error: None,
            callback_port,
        }
    }

    /// Generate authorization code
    pub fn generate_auth_code(&mut self) -> String {
        let code = format!("mock_auth_code_{}", uuid::Uuid::new_v4());
        self.authorization_codes.push(code.clone());
        code
    }

    /// Generate access token
    pub fn generate_access_token(&mut self) -> String {
        let token = format!("mock_access_token_{}", uuid::Uuid::new_v4());
        self.access_tokens.push(token.clone());
        token
    }
}

/// Mock OAuth Server
pub struct MockOAuthServer {
    pub port: u16,
    pub state: Arc<Mutex<MockOAuthState>>,
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl MockOAuthServer {
    /// Start Mock OAuth Server bound to port 18901
    pub async fn start() -> std::io::Result<Self> {
        let port = 18901;
        let addr = format!("127.0.0.1:{}", port);
        let listener = TcpListener::bind(&addr)?;
        let port = listener.local_addr()?.port();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let state = Arc::new(Mutex::new(MockOAuthState::new(port)));

        let state_clone = state.clone();

        // Start background task to handle requests
        tokio::spawn(async move {
            Self::run_server(listener, state_clone, shutdown_rx).await;
        });

        Ok(Self { port, state, shutdown_tx })
    }

    async fn run_server(
        listener: TcpListener,
        state: Arc<Mutex<MockOAuthState>>,
        mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    ) {
        loop {
            tokio::select! {
                result = async { Ok::<_, std::io::Error>(listener.accept()?) } => {
                    match result {
                        Ok((stream, _)) => {
                            let state_clone = state.clone();
                            tokio::spawn(async move {
                                Self::handle_connection(stream, state_clone).await;
                            });
                        }
                        Err(_) => break,
                    }
                }
                _ = &mut shutdown_rx => {
                    break;
                }
            }
        }
    }

    async fn handle_connection(mut stream: TcpStream, state: Arc<Mutex<MockOAuthState>>) {
        let mut buffer = [0u8; 4096];
        let bytes_read = match stream.read(&mut buffer).await {
            Ok(n) if n > 0 => n,
            _ => return,
        };

        let request = String::from_utf8_lossy(&buffer[..bytes_read]);
        let response = Self::build_response(&request, &state);

        let _ = stream.write_all(response.as_bytes()).await;
        let _ = stream.shutdown().await;
    }

    fn build_response(request: &str, state: &Arc<Mutex<MockOAuthState>>) -> String {
        let state_guard = state.lock().unwrap();

        // Parse request path and parameters
        let first_line = request.lines().next().unwrap_or("");
        let callback_port = state_guard.callback_port;

        if first_line.contains("GET /authorize") {
            // Authorization Endpoint
            let auth_code = state_guard.generate_auth_code();
            let redirect = format!(
                "HTTP/1.1 302 Found\r\n\
                 Location: http://localhost:{}/callback?code={}&state=test_state\r\n\
                 Content-Length: 0\r\n\r\n",
                callback_port, auth_code
            );
            redirect
        } else if first_line.contains("POST /token") {
            // Token Endpoint
            if let Some(ref error) = state_guard.should_error {
                let body = serde_json::json!({
                    "error": error,
                    "error_description": format!("Mock error: {}", error)
                });
                format!(
                    "HTTP/1.1 400 Bad Request\r\n\
                     Content-Type: application/json\r\n\
                     Content-Length: {}\r\n\r\n{}",
                    body.to_string().len(),
                    body
                )
            } else {
                let access_token = state_guard.generate_access_token();
                let body = serde_json::json!({
                    "access_token": access_token,
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "refresh_token": "mock_refresh_token",
                    "scope": "openid profile api.codex"
                });
                format!(
                    "HTTP/1.1 200 OK\r\n\
                     Content-Type: application/json\r\n\
                     Content-Length: {}\r\n\r\n{}",
                    body.to_string().len(),
                    body
                )
            }
        } else {
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".to_string()
        }
    }

    /// Stop the server
    pub async fn stop(self) {
        let _ = self.shutdown_tx.send(());
    }

    /// Get callback URL
    pub fn callback_url(&self) -> String {
        format!("http://localhost:{}", self.port)
    }

    /// Set error response
    pub fn set_error(&self, error: &str) {
        let mut state = self.state.lock().unwrap();
        state.should_error = Some(error.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_oauth_server_auth_endpoint() {
        let server = MockOAuthServer::start().await.unwrap();
        let url = server.callback_url();

        // Make authorization request
        let client = reqwest::Client::new();
        let resp = client.get(&format!("{}/authorize", url)).send().await.unwrap();

        // Verify redirect
        assert_eq!(resp.status(), 302);
        let location = resp.headers().get("location").unwrap().to_str().unwrap();
        assert!(location.contains("code="));

        server.stop().await;
    }

    #[tokio::test]
    async fn test_mock_oauth_server_token_endpoint() {
        let server = MockOAuthServer::start().await.unwrap();
        let url = server.callback_url();

        // Make token request
        let client = reqwest::Client::new();
        let resp = client
            .post(&format!("{}/token", url))
            .form(&[("grant_type", "authorization_code"), ("code", "test_code")])
            .send()
            .await
            .unwrap();

        // Verify success response
        assert_eq!(resp.status(), 200);
        let body: serde_json::Value = resp.json().await.unwrap();
        assert!(body.get("access_token").is_some());

        server.stop().await;
    }
}
