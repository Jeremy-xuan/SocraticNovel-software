import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import CanvasPanel from '../components/canvas/CanvasPanel';
import AgentLogPanel from '../components/debug/AgentLogPanel';
import type { ChatMessage } from '../types';
import { readFile, hasSavedSession, restoreAiSession, clearSavedSession } from '../lib/tauri';

function getWorkspacePath(): string {
  // TODO: resolve from settings/workspace selector
  const path = useAppStore.getState().settings.currentWorkspacePath;
  if (!path) throw new Error('Workspace path not initialized');
  return path;
}

export default function LessonPage() {
  const navigate = useNavigate();
  const { messages, addMessage, isStreaming, isInClass, setInClass, canvasItems, groupChatMessages, hasError, agentLogs } = useAppStore();
  const { initSession, sendMessage: aiSendMessage, sendTeaching, runPrep, runPostLesson } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [rightPanel, setRightPanel] = useState<'canvas' | 'chat' | 'log'>('canvas');
  const [useMultiAgent] = useState(true); // Multi-agent mode (future: add UI toggle)
  const [prepComplete, setPrepComplete] = useState(false);

  // Restore saved session on mount
  useEffect(() => {
    const tryRestore = async () => {
      const workspacePath = getWorkspacePath();
      try {
        const hasSaved = await hasSavedSession(workspacePath);
        if (hasSaved) {
          const restored = useAppStore.getState().loadSessionFromStorage();
          if (restored) {
            await restoreAiSession(workspacePath);
            setInClass(true);
            setPrepComplete(true); // Restored sessions skip prep
          }
        }
      } catch {
        // Restore failed — start fresh
      }
    };
    if (!isInClass && messages.length === 0) {
      tryRestore();
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-switch to group chat tab when new messages arrive
  useEffect(() => {
    if (groupChatMessages.length > 0) {
      setRightPanel('chat');
    }
  }, [groupChatMessages.length]);

  // Safety net: auto-reset streaming state after 5 min timeout
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setTimeout(() => {
      const { setStreaming, addMessage } = useAppStore.getState();
      if (useAppStore.getState().isStreaming) {
        setStreaming(false);
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: '⚠️ 响应超时，请重试',
          timestamp: Date.now(),
        });
      }
    }, 300_000);
    return () => clearTimeout(timer);
  }, [isStreaming]);

  const handleStartClass = async () => {
    setInClass(true);
    const workspacePath = getWorkspacePath();

    try {
      // Check if first launch
      const wechatGroup = await readFile(workspacePath, 'teacher/runtime/wechat_group.md');
      const isFirstLaunch = !wechatGroup.trim() || wechatGroup.includes('（暂无记录）');

      if (isFirstLaunch) {
        // Pre-render prologue from story.md
        try {
          const storyContent = await readFile(workspacePath, 'teacher/story.md');
          const prologueMatch = storyContent.match(/## 序章\n\n([\s\S]*?群聊。)/);
          if (prologueMatch) {
            const sections = prologueMatch[1].split(/\n---\n/).map(s => s.trim()).filter(Boolean);
            for (const section of sections) {
              addMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                text: section,
                timestamp: Date.now(),
              });
            }
          }
        } catch {
          // story.md missing — not fatal
        }
      }

      // Read CLAUDE.md as base system prompt
      const systemPrompt = await readFile(workspacePath, 'CLAUDE.md');
      await initSession(workspacePath, systemPrompt);

      if (useMultiAgent) {
        // ─── Multi-Agent Flow ─────────────────────────────────
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: '📋 正在准备课程…（Prep Agent 读取文件中）',
          timestamp: Date.now(),
        });

        // Phase 1: Prep Agent generates lesson brief
        const brief = await runPrep(workspacePath);

        if (brief) {
          setPrepComplete(true);
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            text: '✅ 课程准备完成，开始教学',
            timestamp: Date.now(),
          });

          // Phase 2: First teaching message
          if (isFirstLaunch) {
            await sendTeaching('[系统：序章已由应用展示给学习者。请直接生成群聊消息（使用 show_group_chat），然后开始第一节课。]');
          } else {
            await sendTeaching('请开始今天的课程。');
          }
        } else {
          // Prep failed — fall back to legacy
          console.warn('Prep phase returned empty brief, falling back to legacy');
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            text: '⚠️ 课程准备失败，使用传统模式启动…',
            timestamp: Date.now(),
          });
          setPrepComplete(true);
          if (isFirstLaunch) {
            await aiSendMessage('[系统：序章已由应用展示给学习者，学习者已读完序章。请直接生成群聊消息（使用 show_group_chat 工具），然后开始第一节课。]');
          } else {
            await aiSendMessage('请开始今天的课程。');
          }
        }
      } else {
        // ─── Legacy Flow ──────────────────────────────────────
        if (!isFirstLaunch) {
          addMessage({
            id: crypto.randomUUID(),
            role: 'system',
            text: '正在启动课堂...',
            timestamp: Date.now(),
          });
        }
        setPrepComplete(true);
        if (isFirstLaunch) {
          await aiSendMessage('[系统：序章已由应用展示给学习者，学习者已读完序章。请直接生成群聊消息（使用 show_group_chat 工具），然后开始第一节课。]');
        } else {
          await aiSendMessage('请开始今天的课程。');
        }
      }
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: `❌ 启动失败: ${err}`,
        timestamp: Date.now(),
      });
      setInClass(false);
    }
  };

  const handleEndClass = async () => {
    const sysMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'system',
      text: '正在结束课堂…',
      timestamp: Date.now(),
    };
    addMessage(sysMsg);
    setRightPanel('chat');

    if (useMultiAgent) {
      // Phase 3: Post-Lesson Agent updates files
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '📝 Post-Lesson Agent 正在更新文件…',
        timestamp: Date.now(),
      });
      try {
        await runPostLesson();
      } catch (err) {
        console.warn('Post-lesson phase failed:', err);
      }
    } else {
      // Legacy: tell AI to end class
      try {
        await aiSendMessage('今天到这里吧，下课。');
      } catch (err) {
        console.warn('End-of-class AI routine failed:', err);
      }
    }

    // Clear saved session
    try {
      await clearSavedSession(getWorkspacePath());
    } catch {}
    useAppStore.getState().clearSession();
    setPrepComplete(false);
  };

  const handleRetry = async () => {
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    if (lastUserMsg) {
      if (useMultiAgent && prepComplete) {
        await sendTeaching(lastUserMsg.text);
      } else {
        await aiSendMessage(lastUserMsg.text);
      }
    } else {
      await handleStartClass();
    }
  };

  const handleSend = async (text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    addMessage(msg);

    // Use multi-agent teaching if prep is complete, otherwise legacy
    if (useMultiAgent && prepComplete) {
      await sendTeaching(text);
    } else {
      await aiSendMessage(text);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-900">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-700">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← 返回
        </button>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          AP Physics C: E&M — 课堂
        </span>
        <div className="flex gap-2">
          {isInClass && messages.length > 0 && (
            <button
              onClick={() => navigate('/notes')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              📝 笔记
            </button>
          )}
          {!isInClass ? (
            <button
              onClick={handleStartClass}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              开始上课
            </button>
          ) : (
            <button
              onClick={handleEndClass}
              className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600"
            >
              下课
            </button>
          )}
        </div>
      </header>

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — lesson navigation */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-850">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            课堂信息
          </h3>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="font-medium">当前章节</p>
              <p className="text-slate-400">Ch.23 — 电场</p>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="font-medium">今日老师</p>
              <p className="text-slate-400">朔</p>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="font-medium">状态</p>
              <p className={isInClass ? 'text-green-500' : 'text-slate-400'}>
                {isInClass ? '🟢 上课中' : '⚪ 未开始'}
              </p>
            </div>
          </div>
        </aside>

        {/* Center — chat */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !isInClass && (
              <div className="flex h-full items-center justify-center">
                <p className="text-slate-400 dark:text-slate-500">
                  点击「开始上课」进入课堂
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {/* Retry button — shown when an error occurred */}
            {isInClass && !isStreaming && hasError && (
              <div className="my-3 flex justify-center">
                <button
                  onClick={handleRetry}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  🔄 重试
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <ChatInput onSend={handleSend} disabled={!isInClass || isStreaming} />
        </main>

        {/* Right panel — canvas or group chat */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 dark:border-slate-700">
          {/* Panel tabs */}
          <div className="flex h-10 shrink-0 border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setRightPanel('canvas')}
              className={`flex-1 text-xs font-medium ${
                rightPanel === 'canvas'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              🎨 白板
            </button>
            <button
              onClick={() => setRightPanel('chat')}
              className={`flex-1 text-xs font-medium ${
                rightPanel === 'chat'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              💬 群聊
            </button>
            <button
              onClick={() => setRightPanel('log')}
              className={`flex-1 text-xs font-medium ${
                rightPanel === 'log'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              🔧 日志
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {rightPanel === 'canvas' ? (
              <CanvasPanel items={canvasItems} />
            ) : rightPanel === 'log' ? (
              <AgentLogPanel logs={agentLogs} />
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-2">
                  {groupChatMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      群聊消息将在此显示
                    </div>
                  ) : (
                    groupChatMessages.map((msg, i) => {
                      const isStudent = msg.sender === '宇轩';
                      return (
                        <div key={i} className={`flex flex-col ${isStudent ? 'items-end' : 'items-start'}`}>
                          <span className="mb-0.5 text-[10px] text-slate-400">
                            {msg.sender} {msg.time || ''}
                          </span>
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                              isStudent
                                ? 'bg-green-500 text-white'
                                : 'bg-white text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
