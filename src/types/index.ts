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
  currentWorkspacePath: string | null;
  aiProvider: 'anthropic' | 'openai' | 'google' | 'deepseek' | 'custom';
  aiModel: string | null;
  apiKeyConfigured: boolean;
}

// Tool definitions for AI
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ─── Spaced Repetition ───────────────────────────────────────────

export type ReviewCardType = 'concept' | 'compute';
export type ReviewCardStatus = 'active' | 'mastered';

export interface ReviewCard {
  id: string;
  knowledgePoint: string;
  sourceChapter: string;
  cardType: ReviewCardType;
  front: string;
  back: string;
  addedDate: string;       // ISO date: 2025-01-15
  nextReviewDate: string;  // ISO date
  reviewCount: number;
  easeFactor: number;      // SM-2 ease factor (default 2.5)
  status: ReviewCardStatus;
}

export interface ReviewStats {
  totalCards: number;
  dueToday: number;
  mastered: number;
  reviewedToday: number;
}

// Rating after self-assessment (1=forgot, 2=hard, 3=recalled, 4=easy)
export type ReviewRating = 1 | 2 | 3 | 4;

// ─── PDF Import ──────────────────────────────────────────────────

export interface PdfPage {
  page_number: number;
  text: string;
}

export interface PdfExtractResult {
  filename: string;
  total_pages: number;
  pages: PdfPage[];
  fullText: string;
}

// ─── Curriculum Outline ──────────────────────────────────────────

export type ChapterStatus = 'not_started' | 'in_progress' | 'completed';

export interface CurriculumChapter {
  lesson: string;       // e.g. "1", "U1综合"
  chapter: string;      // e.g. "Ch.21", "—"
  title: string;        // e.g. "库仑定律、电荷守恒"
  materialFile: string; // e.g. "materials/textbook/21_Coulomb_s_Law.pdf"
  status: ChapterStatus;
}

export interface CurriculumUnit {
  unitId: string;       // e.g. "unit-1"
  unitNumber: number;   // e.g. 1
  title: string;        // e.g. "静电场（Electrostatics）"
  chapters: CurriculumChapter[];
}

export interface CurriculumOutline {
  units: CurriculumUnit[];
  currentChapter: string | null; // e.g. "Ch.23"
}
