//! Test utilities for Codex OAuth testing
//!
//! Provides helper functions for setting up and tearing down test state

use socratic_novel_lib::commands::codex_oauth_commands::test_utils as pkce_test_utils;

/// Reset PKCE state before each test
pub async fn reset_pkce_state() {
    pkce_test_utils::reset_pkce_state().await;
}

/// Get current PKCE verifier
pub async fn get_pkce_verifier() -> Option<String> {
    pkce_test_utils::get_pkce_verifier().await
}

/// Set up PKCE state with a specific verifier for testing
pub async fn set_pkce_verifier(verifier: &str) {
    pkce_test_utils::set_pkce_state_for_test(verifier.to_string()).await;
}

/// Set up PKCE state with channel for testing
pub async fn setup_pkce_with_channel(verifier: &str) -> tokio::sync::oneshot::Sender<String> {
    pkce_test_utils::set_pkce_state_with_channel(verifier.to_string()).await
}
