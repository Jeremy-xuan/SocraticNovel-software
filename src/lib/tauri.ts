import { invoke } from '@tauri-apps/api/core';
import type { Workspace, ReviewCard, ReviewStats, PdfExtractResult, SessionHistorySummary, SessionHistoryEntry } from '../types';

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

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invoke('delete_workspace', { workspaceId });
}

export async function updateWorkspaceMeta(workspaceId: string): Promise<void> {
  return invoke('update_workspace_meta', { workspaceId });
}

export async function exportWorkspace(workspaceId: string): Promise<string> {
  return invoke('export_workspace', { workspaceId });
}

export async function importWorkspace(zipPath: string): Promise<Workspace> {
  return invoke('import_workspace', { zipPath });
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

// ─── Spaced Repetition Review ────────────────────────────────────

export async function getReviewQueue(workspacePath: string): Promise<ReviewCard[]> {
  return invoke('get_review_queue', { workspacePath });
}

export async function getReviewStats(workspacePath: string): Promise<ReviewStats> {
  return invoke('get_review_stats', { workspacePath });
}

export async function getDueCards(workspacePath: string): Promise<ReviewCard[]> {
  return invoke('get_due_cards', { workspacePath });
}

export async function updateReviewCard(
  workspacePath: string,
  cardId: string,
  rating: number,
): Promise<ReviewCard> {
  return invoke('update_review_card', { payload: { workspacePath, cardId, rating } });
}

export async function addReviewCards(
  workspacePath: string,
  cards: Array<{ knowledgePoint: string; sourceChapter: string; cardType: string; front: string; back: string }>,
): Promise<number> {
  return invoke('add_review_cards', { payload: { workspacePath, cards } });
}

// ─── PDF Import ──────────────────────────────────────────────────

export async function extractPdfText(path: string): Promise<PdfExtractResult> {
  return invoke('extract_pdf_text', { path });
}

export async function importPdfToWorkspace(
  pdfPath: string,
  workspacePath: string,
  targetName: string,
): Promise<string> {
  return invoke('import_pdf_to_workspace', { pdfPath, workspacePath, targetName });
}

export async function checkPdfRenderer(): Promise<{ hasPdfium: boolean; hasPdftoppm: boolean; available: boolean; renderer: string }> {
  return invoke('check_pdf_renderer');
}

export async function renderPdfPage(pdfPath: string, pageNumber: number): Promise<string> {
  return invoke('render_pdf_page', { pdfPath, pageNumber });
}

export async function aiEnhanceText(
  text: string,
  apiKey: string,
  provider: string,
  model: string,
): Promise<string> {
  return invoke('ai_enhance_text', { text, apiKey, provider, model });
}

export async function aiVisionEnhancePage(
  pdfPath: string,
  pageNumber: number,
  apiKey: string,
  provider: string,
  model: string,
): Promise<string> {
  return invoke('ai_vision_enhance_page', { pdfPath, pageNumber, apiKey, provider, model });
}

// ─── Apple Vision OCR (macOS, free, local) ──────────────────────

export async function appleVisionOcrPage(pdfPath: string, pageNumber: number): Promise<string> {
  return invoke('apple_vision_ocr_page', { pdfPath, pageNumber });
}

export async function appleVisionOcrFull(pdfPath: string): Promise<PdfExtractResult> {
  return invoke('apple_vision_ocr_full', { pdfPath });
}

export async function checkAppleVisionAvailable(): Promise<boolean> {
  return invoke('check_apple_vision_available');
}

// ─── Session History ─────────────────────────────────────────────

export async function saveSessionHistory(
  workspacePath: string,
  data: SessionHistoryEntry,
): Promise<string> {
  return invoke('save_session_history', { workspacePath, data });
}

export async function listSessionHistory(
  workspacePath: string,
): Promise<SessionHistorySummary[]> {
  return invoke('list_session_history', { workspacePath });
}

export async function loadSessionHistory(
  workspacePath: string,
  sessionId: string,
): Promise<SessionHistoryEntry> {
  return invoke('load_session_history', { workspacePath, sessionId });
}

export async function deleteSessionHistory(
  workspacePath: string,
  sessionId: string,
): Promise<void> {
  return invoke('delete_session_history', { workspacePath, sessionId });
}

// ─── GitHub OAuth ────────────────────────────────────────────────

export async function startGithubOauth(clientId: string): Promise<string> {
  return invoke('start_github_oauth', { clientId });
}

export async function checkGithubAuth(): Promise<boolean> {
  return invoke('check_github_auth');
}

export async function getGithubToken(): Promise<string | null> {
  return invoke('get_github_token');
}

export async function logoutGithub(): Promise<void> {
  return invoke('logout_github');
}
