// Core types for SocraticNovel Desktop

export type SessionType = 'lesson' | 'group_chat' | 'review';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  lastOpened: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  workspaceId: string;
  type: SessionType;
  startedAt: string;
  endedAt: string | null;
}

// AI Message types (aligned with Claude Messages API)
export type MessageRole = 'user' | 'assistant';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface Message {
  role: MessageRole;
  content: ContentBlock[];
}

// UI-level message for display
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  toolCalls?: ToolCallDisplay[];
  isStreaming?: boolean;
}

export interface ToolCallDisplay {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

// Canvas / whiteboard
export interface CanvasItem {
  id: string;
  type: 'svg' | 'mermaid';
  content: string;
  title?: string;
  timestamp: number;
}

// Group chat message (WeChat-style)
export interface GroupChatMessage {
  sender: string;
  time?: string;
  text: string;
}

// Agent activity log entry
export interface AgentLogEntry {
  id: string;
  timestamp: number;
  type: 'tool_start' | 'tool_result' | 'text_delta' | 'response' | 'error' | 'turn_complete' | 'info';
  toolName?: string;
  toolId?: string;
  text?: string;
  isError?: boolean;
}

// Settings
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  currentWorkspaceId: string | null;
  aiProvider: 'anthropic' | 'openai' | 'google' | 'deepseek' | 'custom';
  apiKeyConfigured: boolean;
}

// Tool definitions for AI
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
