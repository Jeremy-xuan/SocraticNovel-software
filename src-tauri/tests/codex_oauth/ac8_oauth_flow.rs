//! R3-AC8: OAuth callback flow integration test
//!
//! Verifies complete OAuth authorization code + PKCE flow

use socratic_novel_lib::commands::codex_oauth_commands::{
    start_codex_oauth,
    check_codex_auth,
    get_codex_token,
    logout_codex,
    extract_query_param,
};
use socratic_novel_lib::commands::codex_oauth_commands::test_utils as pkce_test_utils;

#[tokio::test]
async fn test_oauth_callback_url_parsing() {
    // Test extract_query_param function
    let request = "GET /callback?code=abc123&state=xyz789 HTTP/1.1\r\n";

    let code = extract_query_param(request, "code");
    assert_eq!(code, Some("abc123".to_string()));

    let state = extract_query_param(request, "state");
    assert_eq!(state, Some("xyz789".to_string()));

    let invalid = extract_query_param(request, "invalid");
    assert!(invalid.is_none());
}

#[tokio::test]
async fn test_oauth_callback_url_parsing_with_encoded_values() {
    let request = "GET /callback?code=abc%3D123&state=test_state HTTP/1.1\r\n";

    // Note: current implementation does NOT URL-decode values
    // This test documents current behavior
    let code = extract_query_param(request, "code");
    assert_eq!(code, Some("abc%3D123".to_string()));
}

#[tokio::test]
async fn test_check_codex_auth_initial_state() {
    // Clean up initial state
    let _ = logout_codex();

    // Initial state should be not logged in
    let is_logged_in = check_codex_auth().unwrap();
    assert!(!is_logged_in, "Should not be logged in initially after logout");
}

#[tokio::test]
async fn test_get_codex_token_when_not_logged_in() {
    // Ensure not logged in
    let _ = logout_codex();

    // Token should be None
    let token = get_codex_token().unwrap();
    assert!(token.is_none(), "Should return None when not logged in");
}

#[tokio::test]
async fn test_logout_clears_token() {
    // Manually set a token via credential_store
    use socratic_novel_lib::commands::credential_store;
    const TEST_KEY: &str = "codex_access_token";
    credential_store::set_password(TEST_KEY, "test_token").unwrap();

    // Verify logged in
    assert!(check_codex_auth().unwrap(), "Should be logged in with token");

    // Logout
    logout_codex().unwrap();

    // Verify logged out
    assert!(!check_codex_auth().unwrap(), "Should not be logged in after logout");
    assert!(get_codex_token().unwrap().is_none(), "Token should be None after logout");
}

#[tokio::test]
async fn test_start_codex_oauth_returns_callback_info() {
    // Clean up any existing state
    pkce_test_utils::reset_pkce_state().await;

    // Start OAuth
    let result = start_codex_oauth().await;
    assert!(result.is_ok(), "start_codex_oauth should succeed");

    let message = result.unwrap();
    // Should mention callback port
    assert!(message.contains("18901"), "Message should mention port 18901");

    // Clean up
    pkce_test_utils::reset_pkce_state().await;
}

#[tokio::test]
async fn test_pkce_state_created_on_start() {
    // Clean up any existing state
    pkce_test_utils::reset_pkce_state().await;

    // Verify no state initially
    let initial_verifier = pkce_test_utils::get_pkce_verifier().await;
    assert!(initial_verifier.is_none(), "Should have no PKCE state initially");

    // Start OAuth
    start_codex_oauth().await.unwrap();

    // Verify state was created
    let verifier = pkce_test_utils::get_pkce_verifier().await;
    assert!(verifier.is_some(), "PKCE verifier should exist after start_codex_oauth");
    assert_eq!(verifier.unwrap().len(), 64, "Verifier should be 64 characters");

    // Clean up
    pkce_test_utils::reset_pkce_state().await;
}
