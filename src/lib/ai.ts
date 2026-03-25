import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface StartSessionParams {
  workspacePath: string;
  systemPrompt: string;
  provider: string;
  model?: string;
}

export interface SendMessageParams {
  text: string;
  apiKey: string;
}

// Agent events emitted from Rust backend
export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_result'; id: string; result: string; is_error: boolean }
  | { type: 'message_done'; full_text: string }
  | { type: 'error'; message: string }
  | { type: 'turn_complete' };

export interface CanvasEvent {
  title: string;
  content: string;
  type?: 'svg' | 'mermaid';
}

export interface GroupChatMessage {
  sender: string;
  time?: string;
  text: string;
}

export interface GroupChatEvent {
  messages: GroupChatMessage[];
}

export async function startAiSession(params: StartSessionParams): Promise<void> {
  return invoke('start_ai_session', { payload: params });
}

export async function sendChatMessage(params: SendMessageParams): Promise<void> {
  return invoke('send_chat_message', { payload: params });
}

// ─── Multi-Agent Phase Commands ───────────────────────────────────

export interface PrepPhaseParams {
  apiKey: string;
  systemPrompt?: string;
}

export interface TeachingParams {
  text: string;
  apiKey: string;
  teachingPrompt?: string;
}

export interface PostLessonParams {
  apiKey: string;
  conversationSummary?: string;
  systemPrompt?: string;
}

/// Phase 1: Run prep agent to generate lesson brief
export async function runPrepPhase(params: PrepPhaseParams): Promise<string> {
  return invoke('run_prep_phase', { payload: params });
}

/// Phase 2: Send a teaching message (uses lesson_brief from prep)
export async function sendTeachingMessage(params: TeachingParams): Promise<void> {
  return invoke('send_teaching_message', { payload: params });
}

/// Phase 3: Run post-lesson file updates
export async function runPostLesson(params: PostLessonParams): Promise<void> {
  return invoke('run_post_lesson', { payload: params });
}

/// Set teaching-specific system prompt
export async function setTeachingPrompt(prompt: string): Promise<void> {
  return invoke('set_teaching_prompt', { prompt });
}

// ─── Practice Mode Commands ──────────────────────────────────────

export interface PracticeParams {
  text: string;
  apiKey: string;
}

/// Send a practice message (student question/problem → AI Socratic guidance)
export async function sendPracticeMessage(params: PracticeParams): Promise<void> {
  return invoke('send_practice_message', { payload: params });
}

/// Set practice-specific system prompt
export async function setPracticePrompt(prompt: string): Promise<void> {
  return invoke('set_practice_prompt', { prompt });
}

// ─── Meta Prompt Commands ────────────────────────────────────────

export interface MetaPromptParams {
  text: string;
  apiKey: string;
}

/// Send a message during Meta Prompt workspace generation flow
export async function sendMetaPromptMessage(params: MetaPromptParams): Promise<void> {
  return invoke('send_meta_prompt_message', { payload: params });
}

/// Set meta prompt system prompt
export async function setMetaPromptPrompt(prompt: string): Promise<void> {
  return invoke('set_meta_prompt_prompt', { prompt });
}

/// Get the embedded META_PROMPT.md content
export async function getMetaPromptContent(): Promise<string> {
  return invoke('get_meta_prompt_content');
}

// ─── Note Generation Commands ────────────────────────────────────

export interface GenerateNotesParams {
  apiKey: string;
}

/// Generate structured review notes from the current conversation
export async function generateLessonNotes(params: GenerateNotesParams): Promise<string> {
  return invoke('generate_lesson_notes', { payload: params });
}

/// Generate Anki flashcards from the current conversation (returns TSV)
export async function generateAnkiCards(params: GenerateNotesParams): Promise<string> {
  return invoke('generate_anki_cards', { payload: params });
}

export function onAgentEvent(callback: (event: AgentEvent) => void): Promise<UnlistenFn> {
  return listen<AgentEvent>('agent-event', (e) => callback(e.payload));
}

export function onCanvasEvent(callback: (event: CanvasEvent) => void): Promise<UnlistenFn> {
  return listen<CanvasEvent>('canvas-event', (e) => callback(e.payload));
}

export function onGroupChatEvent(callback: (event: GroupChatEvent) => void): Promise<UnlistenFn> {
  return listen<GroupChatEvent>('group-chat-event', (e) => callback(e.payload));
}
