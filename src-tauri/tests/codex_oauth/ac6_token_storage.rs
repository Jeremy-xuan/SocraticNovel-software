//! R3-AC6: Token storage via credential_store test
//!
//! Verifies:
//! 1. Token can be stored via credential_store::set_password
//! 2. Token can be retrieved via credential_store::get_password
//! 3. Token can be deleted via credential_store::delete_password

use socratic_novel_lib::commands::credential_store;

const TEST_TOKEN_KEY: &str = "codex_access_token";
const TEST_TOKEN: &str = "test_codex_access_token_12345";

#[test]
fn test_credential_store_set_and_get() {
    // Clean up first
    let _ = credential_store::delete_password(TEST_TOKEN_KEY);

    // Set token
    let set_result = credential_store::set_password(TEST_TOKEN_KEY, TEST_TOKEN);
    assert!(set_result.is_ok(), "set_password should succeed, got: {:?}", set_result);

    // Get token
    let get_result = credential_store::get_password(TEST_TOKEN_KEY);
    assert!(get_result.is_ok(), "get_password should succeed");
    let retrieved = get_result.unwrap();
    assert!(retrieved.is_some(), "Should retrieve Some token");
    assert_eq!(retrieved.unwrap(), TEST_TOKEN, "Retrieved token should match");

    // Clean up
    let delete_result = credential_store::delete_password(TEST_TOKEN_KEY);
    assert!(delete_result.is_ok(), "delete_password should succeed");
}

#[test]
fn test_credential_store_get_non_existent() {
    let result = credential_store::get_password("non_existent_key_12345");
    assert!(result.is_ok(), "get_password should succeed");
    assert!(result.unwrap().is_none(), "Non-existent key should return None");
}

#[test]
fn test_credential_store_delete_non_existent() {
    // Delete non-existent key should not error
    let result = credential_store::delete_password("non_existent_key_12345");
    assert!(result.is_ok(), "delete_password for non-existent key should succeed");
}

#[test]
fn test_credential_store_overwrite() {
    // Clean up first
    let _ = credential_store::delete_password(TEST_TOKEN_KEY);

    // Set first token
    credential_store::set_password(TEST_TOKEN_KEY, "first_token").unwrap();

    // Overwrite with second token
    credential_store::set_password(TEST_TOKEN_KEY, "second_token").unwrap();

    // Verify second token is returned
    let retrieved = credential_store::get_password(TEST_TOKEN_KEY).unwrap().unwrap();
    assert_eq!(retrieved, "second_token");

    // Clean up
    credential_store::delete_password(TEST_TOKEN_KEY).unwrap();
}
