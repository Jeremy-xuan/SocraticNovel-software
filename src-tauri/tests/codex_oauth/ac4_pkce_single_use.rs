//! R3-AC4: PKCE verifier single use test
//!
//! Verifies:
//! 1. verifier is cleared after successful use (guard.take() pattern)
//! 2. Second poll returns error

use socratic_novel_lib::commands::codex_oauth_commands::{poll_codex_auth, start_codex_oauth};
use socratic_novel_lib::commands::codex_oauth_commands::test_utils as pkce_test_utils;

#[tokio::test]
async fn test_pkce_state_cleared_after_poll() {
    // Clean up any existing state
    pkce_test_utils::reset_pkce_state().await;

    // Set up PKCE state with a channel
    let verifier = "test_verifier_123456789012345678901234567890123456789012345678901234";
    let code_tx = pkce_test_utils::set_pkce_state_with_channel(verifier.to_string()).await;

    // Send a code through the channel
    let _ = code_tx.send("test_auth_code".to_string());

    // First poll should work (or timeout waiting for real token exchange)
    // The key is that PKCE_STATE should be cleared
    let result = poll_codex_auth().await;

    // After poll, PKCE_STATE should be None (taken)
    let verifier_after = pkce_test_utils::get_pkce_verifier().await;
    assert!(
        verifier_after.is_none(),
        "PKCE verifier should be cleared after poll_codex_auth"
    );

    // Clean up
    pkce_test_utils::reset_pkce_state().await;
}

#[tokio::test]
async fn test_second_poll_fails() {
    // Clean up any existing state
    pkce_test_utils::reset_pkce_state().await;

    // Set up PKCE state with a channel
    let verifier = "test_verifier_123456789012345678901234567890123456789012345678901234";
    let code_tx = pkce_test_utils::set_pkce_state_with_channel(verifier.to_string()).await;

    // Send a code through the channel
    let _ = code_tx.send("test_auth_code".to_string());

    // First poll
    let _ = poll_codex_auth().await;

    // Second poll should fail with "No active OAuth flow"
    let second_result = poll_codex_auth().await;
    assert!(
        second_result.is_err(),
        "Second poll should fail - verifier already consumed"
    );

    let error = second_result.unwrap_err();
    assert!(
        error.contains("No active OAuth flow") || error.contains("PKCE verifier expired"),
        "Error should indicate no active flow, got: {}",
        error
    );

    // Clean up
    pkce_test_utils::reset_pkce_state().await;
}

#[tokio::test]
async fn test_poll_without_start_fails() {
    // Ensure no PKCE state exists
    pkce_test_utils::reset_pkce_state().await;

    // Poll without starting OAuth should fail
    let result = poll_codex_auth().await;
    assert!(result.is_err(), "Poll without start should fail");

    let error = result.unwrap_err();
    assert!(
        error.contains("No active OAuth flow"),
        "Error should indicate no active OAuth flow, got: {}",
        error
    );
}
