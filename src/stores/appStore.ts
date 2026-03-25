import { create } from 'zustand';
import type { ChatMessage, CanvasItem, SessionType, AppSettings, GroupChatMessage, AgentLogEntry, ReviewCard, ReviewStats } from '../types';

interface AppState {
  // Session
  currentSession: SessionType | null;
  isInClass: boolean;

  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;
  thinkingStatus: string;
  hasError: boolean;

  // Canvas
  canvasItems: CanvasItem[];

  // Group chat
  groupChatMessages: GroupChatMessage[];

  // Agent activity log
  agentLogs: AgentLogEntry[];

  // Spaced repetition
  reviewCards: ReviewCard[];
  reviewStats: ReviewStats;

  // Settings
  settings: AppSettings;

  // Actions — Session
  startSession: (type: SessionType) => void;
  endSession: () => void;
  setInClass: (inClass: boolean) => void;

  // Actions — Messages
  addMessage: (msg: ChatMessage) => void;
  updateLastAssistantMessage: (text: string) => void;
  setStreaming: (streaming: boolean) => void;
  setThinkingStatus: (status: string) => void;
  setHasError: (hasError: boolean) => void;
  clearMessages: () => void;

  // Actions — Canvas
  addCanvasItem: (item: CanvasItem) => void;
  clearCanvas: () => void;

  // Actions — Group Chat
  addGroupChatMessages: (msgs: GroupChatMessage[]) => void;
  clearGroupChat: () => void;

  // Actions — Agent Log
  addAgentLog: (entry: AgentLogEntry) => void;
  clearAgentLogs: () => void;

  // Actions — Review
  setReviewCards: (cards: ReviewCard[]) => void;
  setReviewStats: (stats: ReviewStats) => void;
  updateReviewCard: (id: string, updates: Partial<ReviewCard>) => void;

  // Actions — Settings
  updateSettings: (partial: Partial<AppSettings>) => void;

  // Actions — Session Persistence
  saveSessionToStorage: () => void;
  loadSessionFromStorage: () => boolean;
  clearSession: () => void;
}

// Load persisted settings from localStorage
function loadPersistedSettings(): Partial<AppSettings> {
  try {
    const saved = localStorage.getItem('socratic-novel-settings');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentSession: null,
  isInClass: false,
  messages: [],
  isStreaming: false,
  thinkingStatus: '',
  hasError: false,
  canvasItems: [],
  groupChatMessages: [],
  agentLogs: [],
  reviewCards: [],
  reviewStats: { totalCards: 0, dueToday: 0, mastered: 0, reviewedToday: 0 },
  settings: {
    theme: 'light',
    currentWorkspaceId: null,
    currentWorkspacePath: null,
    aiProvider: 'anthropic',
    aiModel: null,
    apiKeyConfigured: false,
    ...loadPersistedSettings(),
  },

  // Session
  startSession: (type) => set({ currentSession: type, messages: [], canvasItems: [] }),
  endSession: () => set({ currentSession: null, isInClass: false }),
  setInClass: (inClass) => set({ isInClass: inClass }),

  // Messages
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  updateLastAssistantMessage: (text) =>
    set((state) => {
      const msgs = [...state.messages];
      const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant');
      if (lastIdx >= 0) {
        msgs[lastIdx] = { ...msgs[lastIdx], text };
      }
      return { messages: msgs };
    }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setThinkingStatus: (status) => set({ thinkingStatus: status }),
  setHasError: (hasError) => set({ hasError }),
  clearMessages: () => set({ messages: [] }),

  // Canvas
  addCanvasItem: (item) => set((state) => ({ canvasItems: [...state.canvasItems, item] })),
  clearCanvas: () => set({ canvasItems: [] }),

  // Group Chat
  addGroupChatMessages: (msgs) =>
    set((state) => ({ groupChatMessages: [...state.groupChatMessages, ...msgs] })),
  clearGroupChat: () => set({ groupChatMessages: [] }),

  // Agent Log
  addAgentLog: (entry) =>
    set((state) => ({ agentLogs: [...state.agentLogs, entry] })),
  clearAgentLogs: () => set({ agentLogs: [] }),

  // Review
  setReviewCards: (cards) => set({ reviewCards: cards }),
  setReviewStats: (stats) => set({ reviewStats: stats }),
  updateReviewCard: (id, updates) =>
    set((state) => ({
      reviewCards: state.reviewCards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  // Settings
  updateSettings: (partial) =>
    set((state) => {
      const newSettings = { ...state.settings, ...partial };
      // Persist to localStorage (exclude transient fields)
      const { apiKeyConfigured, ...toPersist } = newSettings;
      localStorage.setItem('socratic-novel-settings', JSON.stringify(toPersist));
      return { settings: newSettings };
    }),

  // Session Persistence
  saveSessionToStorage: () => {
    const { messages, canvasItems, groupChatMessages } = useAppStore.getState();
    try {
      localStorage.setItem(
        'socratic-novel-session',
        JSON.stringify({
          messages: messages.map((m) => ({ ...m, isStreaming: false })),
          canvasItems,
          groupChatMessages,
          timestamp: Date.now(),
        }),
      );
    } catch {
      // localStorage might be full — silently ignore
    }
  },

  loadSessionFromStorage: () => {
    try {
      const saved = localStorage.getItem('socratic-novel-session');
      if (!saved) return false;
      const data = JSON.parse(saved);
      if (!data.messages?.length) return false;
      set({
        messages: data.messages || [],
        canvasItems: data.canvasItems || [],
        groupChatMessages: data.groupChatMessages || [],
      });
      return true;
    } catch {
      return false;
    }
  },

  clearSession: () => {
    localStorage.removeItem('socratic-novel-session');
    set({
      messages: [],
      canvasItems: [],
      groupChatMessages: [],
      agentLogs: [],
      isInClass: false,
      isStreaming: false,
      hasError: false,
    });
  },
}));
