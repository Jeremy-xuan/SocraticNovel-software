import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { startAiSession, sendChatMessage, sendTeachingMessage, sendPracticeMessage, sendMetaPromptMessage, setPracticePrompt, setMetaPromptPrompt, runPrepPhase, runPostLesson, setTeachingPrompt, onAgentEvent, onCanvasEvent, onGroupChatEvent, getMetaPromptContent } from '../lib/ai';
import { getApiKey, readFile } from '../lib/tauri';
import type { ChatMessage, CanvasItem } from '../types';

// Shared workspace path — read from store (set by LandingPage via initBuiltinWorkspace)
function getWorkspacePath(): string {
  const path = useAppStore.getState().settings.currentWorkspacePath;
  if (!path) throw new Error('Workspace path not initialized');
  return path;
}

export function useAiAgent() {
  const { addMessage, updateLastAssistantMessage, setStreaming, setThinkingStatus, setHasError, addCanvasItem, addGroupChatMessages, addAgentLog } = useAppStore();
  const unlistenRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    // Listen for agent events from Rust backend
    const setup = async () => {
      const unlisten1 = await onAgentEvent((event) => {
        switch (event.type) {
          case 'text_delta':
            setThinkingStatus('');
            updateLastAssistantMessage(
              (useAppStore.getState().messages.findLast((m) => m.role === 'assistant')?.text || '') +
                event.text
            );
            break;

          case 'tool_call_start': {
            const toolLabels: Record<string, string> = {
              read_file: '📖 正在读取文件…',
              list_files: '📂 正在浏览目录…',
              think: '🧠 正在思考…',
              search_file: '🔍 正在搜索文件…',
              write_file: '📝 正在写入文件…',
              append_file: '📝 正在更新文件…',
              respond_to_student: '✍️ 正在组织回复…',
              render_canvas: '🎨 正在绘制白板…',
              show_group_chat: '💬 正在准备群聊…',
              submit_lesson_brief: '📋 正在生成课程大纲…',
            };
            setThinkingStatus(toolLabels[event.name] || `⏳ 正在处理 ${event.name}…`);
            addAgentLog({
              id: event.id,
              timestamp: Date.now(),
              type: 'tool_start',
              toolName: event.name,
              toolId: event.id,
            });
            break;
          }

          case 'tool_call_result':
            addAgentLog({
              id: `${event.id}-result`,
              timestamp: Date.now(),
              type: 'tool_result',
              toolId: event.id,
              text: event.result,
              isError: event.is_error,
            });
            break;

          case 'message_done':
            updateLastAssistantMessage(event.full_text);
            setStreaming(false);
            addAgentLog({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: 'response',
              text: event.full_text.slice(0, 200),
            });
            break;

          case 'error':
            addMessage({
              id: crypto.randomUUID(),
              role: 'system',
              text: `❌ 错误: ${event.message}`,
              timestamp: Date.now(),
            });
            setStreaming(false);
            setHasError(true);
            // Clear isStreaming on any pending assistant message
            useAppStore.setState((state) => {
              const msgs = [...state.messages];
              const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant');
              if (lastIdx >= 0 && msgs[lastIdx].isStreaming) {
                msgs[lastIdx] = { ...msgs[lastIdx], isStreaming: false };
                return { messages: msgs };
              }
              return {};
            });
            addAgentLog({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: 'error',
              text: event.message,
              isError: true,
            });
            break;

          case 'turn_complete':
            setStreaming(false);
            setThinkingStatus('');
            // Clear isStreaming flag on the last assistant message (stops the cursor)
            useAppStore.setState((state) => {
              const msgs = [...state.messages];
              const lastIdx = msgs.findLastIndex((m) => m.role === 'assistant');
              if (lastIdx >= 0 && msgs[lastIdx].isStreaming) {
                msgs[lastIdx] = { ...msgs[lastIdx], isStreaming: false };
                return { messages: msgs };
              }
              return {};
            });
            useAppStore.getState().saveSessionToStorage();
            addAgentLog({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: 'turn_complete',
            });
            break;
        }
      });

      const unlisten2 = await onCanvasEvent((event) => {
        const item: CanvasItem = {
          id: crypto.randomUUID(),
          type: event.type || 'svg',
          content: event.content,
          title: event.title,
          timestamp: Date.now(),
        };
        addCanvasItem(item);
      });

      const unlisten3 = await onGroupChatEvent((event) => {
        addGroupChatMessages(event.messages);
      });

      unlistenRef.current = [unlisten1, unlisten2, unlisten3];
    };

    setup();

    return () => {
      unlistenRef.current.forEach((fn) => fn());
    };
  }, []);

  const initSession = useCallback(async (workspacePath: string, systemPrompt: string) => {
    const settings = useAppStore.getState().settings;
    await startAiSession({
      workspacePath,
      systemPrompt,
      provider: settings.aiProvider,
      model: settings.aiModel ?? undefined,
    });
  }, []);

  /// Run prep phase: reads workspace files and generates a lesson brief
  const runPrep = useCallback(async (workspacePath: string): Promise<string | null> => {
    const settings = useAppStore.getState().settings;
    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) return null;

    try {
      // Load prep-specific system prompt if it exists
      let prepPrompt = '';
      try {
        prepPrompt = await readFile(workspacePath, 'teacher/config/system_prep.md');
      } catch {
        // Fall back to empty — runtime will use default prep instructions
      }

      // Load teaching prompt for later use
      let teachingPrompt = '';
      try {
        const core = await readFile(workspacePath, 'teacher/config/system_core.md');
        const narrative = await readFile(workspacePath, 'teacher/config/system_narrative.md');
        const example = await readFile(workspacePath, 'teacher/config/teaching_example.md');
        teachingPrompt = `${core}\n\n${narrative}\n\n${example}`;
        await setTeachingPrompt(teachingPrompt);
      } catch {
        // Fall back — split files may not exist yet
      }

      const brief = await runPrepPhase({ apiKey, systemPrompt: prepPrompt || undefined });
      return brief;
    } catch (err) {
      console.error('Prep phase failed:', err);
      return null;
    }
  }, []);

  /// Send a message using the multi-agent teaching turn
  const sendTeaching = useCallback(async (text: string) => {
    const settings = useAppStore.getState().settings;
    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '⚠️ 请先在设置中配置 API Key',
        timestamp: Date.now(),
      });
      return;
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(assistantMsg);
    setStreaming(true);
    setHasError(false);

    try {
      await sendTeachingMessage({ text, apiKey });
    } catch (err) {
      const errMsg = String(err);
      if (!errMsg.includes('HTTP request failed') && !errMsg.includes('API error')) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: `❌ 发送失败: ${err}`,
          timestamp: Date.now(),
        });
      }
      setStreaming(false);
      setHasError(true);
    }
  }, []);

  /// Legacy send (backward compatible, no prep phase)
  const sendMessage = useCallback(async (text: string) => {
    const settings = useAppStore.getState().settings;
    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '⚠️ 请先在设置中配置 API Key',
        timestamp: Date.now(),
      });
      return;
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(assistantMsg);
    setStreaming(true);
    setHasError(false);

    try {
      await sendChatMessage({ text, apiKey });
    } catch (err) {
      const errMsg = String(err);
      if (!errMsg.includes('HTTP request failed') && !errMsg.includes('API error')) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: `❌ 发送失败: ${err}`,
          timestamp: Date.now(),
        });
      }
      setStreaming(false);
      setHasError(true);
    }
  }, []);

  /// Run post-lesson phase
  const runPostLesson_ = useCallback(async () => {
    const settings = useAppStore.getState().settings;
    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) return;

    const workspacePath = getWorkspacePath();

    try {
      let postPrompt = '';
      try {
        const post = await readFile(workspacePath, 'teacher/config/system_post.md');
        const chat = await readFile(workspacePath, 'teacher/config/system_chat.md');
        postPrompt = `${post}\n\n${chat}`;
      } catch {
        // Fall back to default
      }

      await runPostLesson({
        apiKey,
        systemPrompt: postPrompt || undefined,
      });
    } catch (err) {
      console.error('Post-lesson phase failed:', err);
    }
  }, []);

  /// Initialize practice session: load practice prompt and set up backend.
  /// If customPrompt is provided, use it directly instead of loading from workspace config files.
  const initPractice = useCallback(async (workspacePath: string, customPrompt?: string) => {
    const settings = useAppStore.getState().settings;
    await startAiSession({
      workspacePath,
      systemPrompt: '',
      provider: settings.aiProvider,
      model: settings.aiModel ?? undefined,
    });

    if (customPrompt !== undefined) {
      await setPracticePrompt(customPrompt);
    } else {
      // Load practice-specific prompt from workspace config files
      try {
        const core = await readFile(workspacePath, 'teacher/config/system_core.md');
        const narrative = await readFile(workspacePath, 'teacher/config/system_narrative.md');
        const practicePrompt = `${core}\n\n${narrative}`;
        await setPracticePrompt(practicePrompt);
      } catch {
        // Fall back — config files may not exist. The Rust backend has a
        // comprehensive built-in practice prompt that will be prepended.
        await setPracticePrompt('');
      }
    }
  }, []);

  /// Send a practice message (student question → AI Socratic guidance)
  const sendPractice = useCallback(async (text: string) => {
    const settings = useAppStore.getState().settings;
    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '⚠️ 请先在设置中配置 API Key',
        timestamp: Date.now(),
      });
      return;
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(assistantMsg);
    setStreaming(true);
    setHasError(false);

    try {
      await sendPracticeMessage({ text, apiKey });
    } catch (err) {
      const errMsg = String(err);
      if (!errMsg.includes('HTTP request failed') && !errMsg.includes('API error')) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: `❌ 发送失败: ${err}`,
          timestamp: Date.now(),
        });
      }
      setStreaming(false);
      setHasError(true);
    }
  }, []);

  /// Initialize meta prompt session: load META_PROMPT.md content and set up backend
  const initMetaPrompt = useCallback(async (workspacePath: string) => {
    const settings = useAppStore.getState().settings;
    await startAiSession({
      workspacePath,
      systemPrompt: '',
      provider: settings.aiProvider,
      model: settings.aiModel ?? undefined,
    });

    // Load embedded META_PROMPT.md content from backend
    const metaPromptContent = await getMetaPromptContent();
    await setMetaPromptPrompt(metaPromptContent);
  }, []);

  /// Send a message during Meta Prompt guided workspace creation
  const sendMetaPrompt = useCallback(async (text: string) => {
    const settings = useAppStore.getState().settings;
    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '⚠️ 请先在设置中配置 API Key',
        timestamp: Date.now(),
      });
      return;
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(assistantMsg);
    setStreaming(true);
    setHasError(false);

    try {
      await sendMetaPromptMessage({ text, apiKey });
    } catch (err) {
      const errMsg = String(err);
      if (!errMsg.includes('HTTP request failed') && !errMsg.includes('API error')) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: `❌ 发送失败: ${err}`,
          timestamp: Date.now(),
        });
      }
      setStreaming(false);
      setHasError(true);
    }
  }, []);

  return { initSession, sendMessage, sendTeaching, sendPractice, initPractice, sendMetaPrompt, initMetaPrompt, runPrep, runPostLesson: runPostLesson_ };
}
