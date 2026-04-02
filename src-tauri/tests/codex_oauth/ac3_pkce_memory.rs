//! R3-AC3: PKCE verifier memory storage test
//!
//! Verifies:
//! 1. PKCE verifier exists in memory state
//! 2. PKCE verifier is NOT written to disk

use socratic_novel_lib::commands::codex_oauth_commands::{start_codex_oauth, is_pkce_expired, PkceState};
use socratic_novel_lib::commands::codex_oauth_commands::test_utils as pkce_test_utils;
use std::path::Path;

#[tokio::test]
async fn test_pkce_verifier_exists_in_memory() {
    // Clean up any existing state
    pkce_test_utils::reset_pkce_state().await;

    // Start OAuth flow
    let result = start_codex_oauth().await;
    assert!(result.is_ok(), "start_codex_oauth should succeed, got: {:?}", result);

    // Verify PKCE_STATE contains verifier
    let verifier = pkce_test_utils::get_pkce_verifier().await;
    assert!(verifier.is_some(), "PKCE verifier should exist after start_codex_oauth");

    let verifier = verifier.unwrap();
    // PKCE verifier should be 64 characters
    assert_eq!(verifier.len(), 64, "PKCE verifier should be 64 characters");

    // Verify format: only URL-safe characters
    assert!(
        verifier.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_' || c == '~'),
        "PKCE verifier should only contain URL-safe characters"
    );

    // Clean up
    pkce_test_utils::reset_pkce_state().await;
}

#[tokio::test]
async fn test_pkce_verifier_not_written_to_disk() {
    // Clean up any existing state
    pkce_test_utils::reset_pkce_state().await;

    // Start OAuth flow
    let result = start_codex_oauth().await.unwrap();

    // Get verifier from memory
    let verifier = pkce_test_utils::get_pkce_verifier().await.unwrap();

    // Check common temp file locations
    let possible_paths = vec![
        "/tmp/codex_pkce",
        "/tmp/codex_verifier",
        ".codex_pkce",
        "/var/tmp/codex_pkce",
    ];

    for path in possible_paths {
        if Path::new(&path).exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            assert!(
                !content.contains(&verifier),
                "PKCE verifier should NOT be written to disk at {:?}",
                path
            );
        }
    }

    // Check debug build credential store path
    #[cfg(debug_assertions)]
    {
        if let Some(config_path) = dirs::config_dir()
            .map(|p| p.join("SocraticNovel").join("dev_credentials.json"))
        {
            if config_path.exists() {
                let content = std::fs::read_to_string(&config_path).unwrap_or_default();
                assert!(
                    !content.contains(&verifier),
                    "PKCE verifier should NOT be in credential store"
                );
            }
        }
    }

    // Clean up
    pkce_test_utils::reset_pkce_state().await;
}

#[test]
fn test_pkce_expired_after_600_seconds() {
    let expired_state = PkceState {
        verifier: "test_verifier_123456789012345678901234567890123456789012345678901234".to_string(),
        code_rx: None,
        created_at: std::time::Instant::now() - std::time::Duration::from_secs(601),
    };

    assert!(
        is_pkce_expired(&expired_state),
        "PKCE state should be expired after 601 seconds"
    );
}

#[test]
fn test_pkce_not_expired_before_600_seconds() {
    let valid_state = PkceState {
        verifier: "test_verifier_123456789012345678901234567890123456789012345678901234".to_string(),
        code_rx: None,
        created_at: std::time::Instant::now() - std::time::Duration::from_secs(300),
    };

    assert!(
        !is_pkce_expired(&valid_state),
        "PKCE state should NOT be expired after 300 seconds"
    );
}
