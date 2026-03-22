import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface StartSessionParams {
  workspacePath: string;
  systemPrompt: string;
  provider: string;
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

export function onAgentEvent(callback: (event: AgentEvent) => void): Promise<UnlistenFn> {
  return listen<AgentEvent>('agent-event', (e) => callback(e.payload));
}

export function onCanvasEvent(callback: (event: CanvasEvent) => void): Promise<UnlistenFn> {
  return listen<CanvasEvent>('canvas-event', (e) => callback(e.payload));
}

export function onGroupChatEvent(callback: (event: GroupChatEvent) => void): Promise<UnlistenFn> {
  return listen<GroupChatEvent>('group-chat-event', (e) => callback(e.payload));
}
