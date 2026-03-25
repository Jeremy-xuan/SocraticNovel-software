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

// Canvas annotations
export type AnnotationType = 'pen' | 'text' | 'arrow' | 'highlight';

export interface Annotation {
  id: string;
  type: AnnotationType;
  color: string;
  points?: { x: number; y: number }[];
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  text?: string;
  position?: { x: number; y: number };
  fontSize?: number;
  strokeWidth?: number;
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
  homeLayout?: 'input' | 'cards';
  language: 'zh' | 'en' | 'auto';
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

// ─── Meta Prompt Questionnaire ───────────────────────────────────

export type TeachingStyle =
  | 'theory-precise'    // 理论精确型
  | 'intuition-analogy' // 直觉类比型
  | 'engineering'       // 工程实战型
  | 'philosophy'        // 哲学引导型
  | 'companion';        // 陪伴鼓励型

export const TEACHING_STYLE_LABELS: Record<TeachingStyle, { label: string; desc: string; icon: string }> = {
  'theory-precise': { label: '理论精确型', desc: '追问到底，不接受模糊答案', icon: '🔬' },
  'intuition-analogy': { label: '直觉类比型', desc: '用比喻建立直觉，节奏温暖', icon: '💡' },
  'engineering': { label: '工程实战型', desc: '先给全局地图，像 debug 一样排查', icon: '🔧' },
  'philosophy': { label: '哲学引导型', desc: '从根本问题出发，连接更大世界观', icon: '🌌' },
  'companion': { label: '陪伴鼓励型', desc: '重视情绪，根据状态调整节奏', icon: '🤝' },
};

export type CharacterSource = 'preset' | 'custom-name' | 'original';

export interface CharacterDesign {
  source: CharacterSource;
  presetId?: string;             // 预设角色 ID（如 'oreki-hotaro'）
  customSourceName?: string;     // 用户输入的角色名（如 '折木奉太郎'）
  name: string;                  // 在系统中使用的名字（可改）
  gender: string;
  age: string;
  appearanceKeywords: string;    // 外貌关键词
  teachingStyle: TeachingStyle;
  personalityCore: string;       // 性格核心
  backstoryHints: string;        // 暗线碎片（可选 "让 AI 设计"）
  backstoryAutoGenerate: boolean;
  initialWarmth: number;         // 初始关系温度 1-10
}

export interface SubjectInfo {
  subjectName: string;           // 学科名称
  textbook: string;              // 教材名称 + 版本
  textbookFormat: 'pdf' | 'paper' | 'ebook' | 'none';
  hasWorkbook: boolean;          // 是否有练习册
}

export interface CourseStructure {
  totalChapters: number;         // 总章节数
  completedChapters: string;     // 已完成的章节（描述）
  learningPeriod: string;        // 学习周期
  topicOverview: string;         // 主题概览
}

export interface WorldSetting {
  location: string;              // 地点描述
  locationStyle: 'enclosed' | 'semi-open' | 'everyday' | 'custom';
  arrivalReason: string;         // 学习者到来的原因
  arrivalType: 'arranged' | 'self-sought' | 'accidental';
  characterRelations: string;    // 角色之间的关系
  supernaturalElement: string;   // 超自然设定（可选）
  hasSupernatural: boolean;
}

export type EmotionalPhaseTemplate = 'four-stage' | 'custom';

export interface EmotionalPhase {
  name: string;                  // 阶段名
  coveragePercent: string;       // 覆盖范围（如 "前25%"）
  tone: string;                  // 基调
}

export interface StoryDesign {
  emotionalTemplate: EmotionalPhaseTemplate;
  emotionalPhases: EmotionalPhase[];
  rotationStyle: 'round-robin' | 'thematic';
  rotationNotes: string;         // 轮值备注
  enableGroupChat: boolean;
  groupChatName: string;
  groupChatStyle: string;
  keyEvents: string;             // 关键事件描述（自由文本）
}

export interface MetaPromptQuestionnaire {
  subject: SubjectInfo;
  course: CourseStructure;
  characterCount: 1 | 2 | 3;
  characters: CharacterDesign[];
  world: WorldSetting;
  story: StoryDesign;
}

// ─── Character Presets ───────────────────────────────────────────

export interface CharacterPreset {
  id: string;
  name: string;
  source: string;                // 出处（如 "冰菓"）
  gender: string;
  age: string;
  appearanceKeywords: string;
  teachingStyle: TeachingStyle;
  personalityCore: string;
  backstoryHints: string;
  initialWarmth: number;
  icon: string;                  // 展示用 emoji
}
