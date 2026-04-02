//! R3-AC5: PKCE verifier timeout test
//!
//! Verifies:
//! 1. PKCE verifier expires after 10 minutes (600 seconds)
//! 2. Expired verifier is rejected

use socratic_novel_lib::commands::codex_oauth_commands::is_pkce_expired;
use socratic_novel_lib::commands::codex_oauth_commands::PkceState;

#[test]
fn test_pkce_expired_after_601_seconds() {
    let expired_state = PkceState {
        verifier: "test_verifier".to_string(),
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
        verifier: "test_verifier".to_string(),
        code_rx: None,
        created_at: std::time::Instant::now() - std::time::Duration::from_secs(599),
    };

    assert!(
        !is_pkce_expired(&valid_state),
        "PKCE state should NOT be expired before 600 seconds"
    );
}

#[test]
fn test_pkce_not_expired_at_300_seconds() {
    let valid_state = PkceState {
        verifier: "test_verifier".to_string(),
        code_rx: None,
        created_at: std::time::Instant::now() - std::time::Duration::from_secs(300),
    };

    assert!(
        !is_pkce_expired(&valid_state),
        "PKCE state should NOT be expired at 300 seconds (5 minutes)"
    );
}

#[test]
fn test_pkce_boundary_condition_at_600_seconds() {
    // At exactly 600 seconds, elapsed() returns Duration of 600 seconds
    // Since the check is `elapsed() > Duration::from_secs(600)`, 600 is NOT expired
    let boundary_state = PkceState {
        verifier: "test_verifier".to_string(),
        code_rx: None,
        created_at: std::time::Instant::now() - std::time::Duration::from_secs(600),
    };

    assert!(
        !is_pkce_expired(&boundary_state),
        "PKCE state at exactly 600s should NOT be expired (strict > comparison)"
    );
}
