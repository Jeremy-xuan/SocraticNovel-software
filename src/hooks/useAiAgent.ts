import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { startAiSession, sendChatMessage, onAgentEvent, onCanvasEvent } from '../lib/ai';
import type { ChatMessage, CanvasItem } from '../types';

// Temporary — will be replaced by Keychain storage
const TEMP_API_KEY_STORAGE = 'socratic-novel-api-key';

function getApiKey(): string {
  return localStorage.getItem(TEMP_API_KEY_STORAGE) || '';
}

export function useAiAgent() {
  const { addMessage, updateLastAssistantMessage, setStreaming, addCanvasItem } = useAppStore();
  const unlistenRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Listen for agent events from Rust backend
    const setup = async () => {
      const unlisten1 = await onAgentEvent((event) => {
        switch (event.type) {
          case 'text_delta':
            // Append text to the last assistant message
            updateLastAssistantMessage(
              (useAppStore.getState().messages.findLast((m) => m.role === 'assistant')?.text || '') +
                event.text
            );
            break;

          case 'tool_call_start':
            // Could show a tool call indicator
            break;

          case 'tool_call_result':
            // Could update tool call display
            break;

          case 'message_done':
            updateLastAssistantMessage(event.full_text);
            setStreaming(false);
            break;

          case 'error':
            addMessage({
              id: crypto.randomUUID(),
              role: 'system',
              text: `❌ 错误: ${event.message}`,
              timestamp: Date.now(),
            });
            setStreaming(false);
            break;

          case 'turn_complete':
            setStreaming(false);
            break;
        }
      });

      const unlisten2 = await onCanvasEvent((event) => {
        const item: CanvasItem = {
          id: crypto.randomUUID(),
          type: 'svg',
          content: event.content,
          title: event.title,
          timestamp: Date.now(),
        };
        addCanvasItem(item);
      });

      unlistenRef.current = [unlisten1, unlisten2];
    };

    setup();

    return () => {
      unlistenRef.current.forEach((fn) => fn());
    };
  }, []);

  const initSession = useCallback(async (workspacePath: string, systemPrompt: string) => {
    await startAiSession({ workspacePath, systemPrompt });
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '⚠️ 请先在设置中配置 API Key',
        timestamp: Date.now(),
      });
      return;
    }

    // Add placeholder assistant message for streaming
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(assistantMsg);
    setStreaming(true);

    try {
      await sendChatMessage({ text, apiKey });
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: `❌ 发送失败: ${err}`,
        timestamp: Date.now(),
      });
      setStreaming(false);
    }
  }, []);

  return { initSession, sendMessage };
}
