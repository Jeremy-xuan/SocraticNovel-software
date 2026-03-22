import { create } from 'zustand';
import type { ChatMessage, CanvasItem, SessionType, AppSettings } from '../types';

interface AppState {
  // Session
  currentSession: SessionType | null;
  isInClass: boolean;

  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;

  // Canvas
  canvasItems: CanvasItem[];

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

  // Actions — Settings
  updateSettings: (partial: Partial<AppSettings>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentSession: null,
  isInClass: false,
  messages: [],
  isStreaming: false,
  canvasItems: [],
  settings: {
    theme: 'light',
    currentWorkspaceId: null,
    aiProvider: 'anthropic',
    apiKeyConfigured: false,
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

  // Settings
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
}));
