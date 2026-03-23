import { invoke } from '@tauri-apps/api/core';
import type { Workspace } from '../types';

// File system operations (sandboxed to workspace)
export async function readFile(workspacePath: string, filePath: string): Promise<string> {
  return invoke('read_file', { workspacePath, filePath });
}

export async function writeFile(workspacePath: string, filePath: string, content: string): Promise<void> {
  return invoke('write_file', { workspacePath, filePath, content });
}

export async function appendFile(workspacePath: string, filePath: string, content: string): Promise<void> {
  return invoke('append_file', { workspacePath, filePath, content });
}

export async function listFiles(workspacePath: string, dirPath: string): Promise<string[]> {
  return invoke('list_files', { workspacePath, dirPath });
}

export async function searchFile(workspacePath: string, filePath: string, query: string): Promise<string> {
  return invoke('search_file', { workspacePath, filePath, query });
}

// Workspace management
export async function listWorkspaces(): Promise<Workspace[]> {
  return invoke('list_workspaces');
}

export async function createWorkspace(name: string): Promise<Workspace> {
  return invoke('create_workspace', { name });
}

export async function initBuiltinWorkspace(): Promise<Workspace> {
  return invoke('init_builtin_workspace');
}

// Settings
export async function getApiKey(provider: string): Promise<string | null> {
  return invoke('get_api_key', { provider });
}

export async function setApiKey(provider: string, key: string): Promise<void> {
  return invoke('set_api_key', { provider, key });
}

export async function hasApiKey(provider: string): Promise<boolean> {
  return invoke('has_api_key', { provider });
}

// AI Chat — send message and get streaming response
export async function sendMessage(
  workspacePath: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  provider: string,
): Promise<string> {
  return invoke('send_message', { workspacePath, systemPrompt, messages, provider });
}

// Session persistence
export async function hasSavedSession(workspacePath: string): Promise<boolean> {
  return invoke('has_saved_session', { workspacePath });
}

export async function restoreAiSession(workspacePath: string): Promise<number> {
  return invoke('restore_ai_session', { workspacePath });
}

export async function clearSavedSession(workspacePath: string): Promise<void> {
  return invoke('clear_saved_session', { workspacePath });
}
