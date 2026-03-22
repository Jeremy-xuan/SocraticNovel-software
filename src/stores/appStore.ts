import { create } from 'zustand';
import type { ChatMessage, CanvasItem, SessionType, AppSettings, GroupChatMessage } from '../types';

interface AppState {
  // Session
  currentSession: SessionType | null;
  isInClass: boolean;

  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;

  // Canvas
  canvasItems: CanvasItem[];

  // Group chat
  groupChatMessages: GroupChatMessage[];

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
  clearMessages: () => void;

  // Actions — Canvas
  addCanvasItem: (item: CanvasItem) => void;
  clearCanvas: () => void;

  // Actions — Group Chat
  addGroupChatMessages: (msgs: GroupChatMessage[]) => void;
  clearGroupChat: () => void;

  // Actions — Settings
  updateSettings: (partial: Partial<AppSettings>) => void;
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
  canvasItems: [],
  groupChatMessages: [],
  settings: {
    theme: 'light',
    currentWorkspaceId: null,
    aiProvider: 'anthropic',
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
  clearMessages: () => set({ messages: [] }),

  // Canvas
  addCanvasItem: (item) => set((state) => ({ canvasItems: [...state.canvasItems, item] })),
  clearCanvas: () => set({ canvasItems: [] }),

  // Group Chat
  addGroupChatMessages: (msgs) =>
    set((state) => ({ groupChatMessages: [...state.groupChatMessages, ...msgs] })),
  clearGroupChat: () => set({ groupChatMessages: [] }),

  // Settings
  updateSettings: (partial) =>
    set((state) => {
      const newSettings = { ...state.settings, ...partial };
      // Persist to localStorage (exclude transient fields)
      const { apiKeyConfigured, ...toPersist } = newSettings;
      localStorage.setItem('socratic-novel-settings', JSON.stringify(toPersist));
      return { settings: newSettings };
    }),
}));
