mod ai;
mod commands;

use commands::ai_commands;
use commands::fs_commands;
use commands::settings_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ai_commands::ConversationState::default())
        .invoke_handler(tauri::generate_handler![
            // File system
            fs_commands::read_file,
            fs_commands::write_file,
            fs_commands::append_file,
            fs_commands::list_files,
            fs_commands::search_file,
            fs_commands::list_workspaces,
            fs_commands::create_workspace,
            fs_commands::init_builtin_workspace,
            // AI
            ai_commands::start_ai_session,
            ai_commands::send_chat_message,
            ai_commands::get_conversation_history,
            // Settings
            settings_commands::set_api_key,
            settings_commands::get_api_key,
            settings_commands::has_api_key,
            settings_commands::delete_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
