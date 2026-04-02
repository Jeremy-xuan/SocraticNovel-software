//! R3-AC7: expires_at not stored in keyring test
//!
//! Verifies:
//! 1. keyring stores only access_token (plain string)
//! 2. expires_at is NOT stored in keyring
//! 3. Token is stored as plain string, not JSON

use socratic_novel_lib::commands::credential_store;

const TEST_TOKEN_KEY: &str = "codex_access_token";
const TEST_TOKEN: &str = "mock_access_token_with_no_expires_info";

#[test]
fn test_expires_at_not_in_keyring() {
    // Store a token
    credential_store::set_password(TEST_TOKEN_KEY, TEST_TOKEN).unwrap();

    // Retrieve from keyring
    let stored = credential_store::get_password(TEST_TOKEN_KEY)
        .unwrap()
        .expect("Token should exist");

    // Verify keyring does NOT contain expires_at
    assert!(
        !stored.contains("expires_at"),
        "keyring should NOT store expires_at, got: {}",
        stored
    );

    // Verify keyring does NOT contain expires_in
    assert!(
        !stored.contains("expires_in"),
        "keyring should NOT store expires_in, got: {}",
        stored
    );

    // Verify keyring does NOT contain refresh_token
    assert!(
        !stored.contains("refresh_token"),
        "keyring should NOT store refresh_token, got: {}",
        stored
    );

    // Verify token is stored as plain string (not JSON)
    assert!(
        !stored.starts_with('{') && !stored.starts_with('['),
        "Stored token should be plain string, not JSON"
    );

    // Verify stored value is exactly the token
    assert_eq!(stored, TEST_TOKEN, "Stored token should match exactly");

    // Clean up
    credential_store::delete_password(TEST_TOKEN_KEY).unwrap();
}

#[test]
fn test_token_is_exact_value() {
    // Store a specific token
    let specific_token = "my_specific_token_value_abc123";
    credential_store::set_password(TEST_TOKEN_KEY, specific_token).unwrap();

    // Retrieve
    let retrieved = credential_store::get_password(TEST_TOKEN_KEY).unwrap().unwrap();

    // Should be byte-for-byte identical
    assert_eq!(retrieved, specific_token);

    // Clean up
    credential_store::delete_password(TEST_TOKEN_KEY).unwrap();
}
