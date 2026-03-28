import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import CanvasPanel from '../components/canvas/CanvasPanel';
import AgentLogPanel from '../components/debug/AgentLogPanel';
import ChapterOutline from '../components/layout/ChapterOutline';
import type { ChatMessage, SessionHistoryEntry } from '../types';
import { readFile, hasSavedSession, restoreAiSession, clearSavedSession, saveSessionHistory } from '../lib/tauri';

function getWorkspacePath(): string {
  const path = useAppStore.getState().settings.currentWorkspacePath;
  if (!path) throw new Error('Workspace path not initialized');
  return path;
}

export default function LessonPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { messages, addMessage, isStreaming, isInClass, setInClass, canvasItems, groupChatMessages, hasError, agentLogs } = useAppStore();
  const { initSession, sendMessage: aiSendMessage, sendTeaching, runPrep, runPostLesson } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [rightPanel, setRightPanel] = useState<'canvas' | 'chat' | 'log'>('canvas');
  const [useMultiAgent] = useState(true);
  const [prepComplete, setPrepComplete] = useState(false);
  const [sessionStartTime] = useState(() => new Date().toISOString());

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
            setPrepComplete(true);
          }
        }
      } catch { }
    };
    if (!isInClass && messages.length === 0) {
      tryRestore();
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (groupChatMessages.length > 0) {
      setRightPanel('chat');
    }
  }, [groupChatMessages.length]);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setTimeout(() => {
      const { setStreaming, addMessage } = useAppStore.getState();
      if (useAppStore.getState().isStreaming) {
        setStreaming(false);
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: t('common.timeoutRetry'),
          timestamp: Date.now(),
        });
      }
    }, 300_000);
    return () => clearTimeout(timer);
  }, [isStreaming]);

  useEffect(() => {
    const unlisten = listen<{ count: number }>('review-cards-generated', (event) => {
      const { count } = event.payload;
      if (count > 0) {
        useAppStore.getState().addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: t('lesson.reviewCardsGenerated', { count }),
          timestamp: Date.now(),
        });
      }
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, [t]);

  const handleStartClass = async () => {
    setInClass(true);
    const workspacePath = getWorkspacePath();

    try {
      const wechatGroup = await readFile(workspacePath, 'teacher/runtime/wechat_group.md');
      const isFirstLaunch = !wechatGroup.trim() || wechatGroup.includes('（暂无记录）');

      if (isFirstLaunch) {
        try {
          const storyContent = await readFile(workspacePath, 'teacher/story.md');
          const prologueMatch = storyContent.match(/## 序章\n\n([\s\S]*?群聊。)/);
          if (prologueMatch) {
            const sections = prologueMatch[1].split(/\n---\n/).map(s => s.trim()).filter(Boolean);
            for (const section of sections) {
              addMessage({ id: crypto.randomUUID(), role: 'assistant', text: section, timestamp: Date.now() });
            }
          }
        } catch { }
      }

      const systemPrompt = await readFile(workspacePath, 'CLAUDE.md');
      await initSession(workspacePath, systemPrompt);

      if (useMultiAgent) {
        addMessage({ id: crypto.randomUUID(), role: 'system', text: t('lesson.preparingLesson'), timestamp: Date.now() });
        const brief = await runPrep(workspacePath);
        if (brief) {
          setPrepComplete(true);
          addMessage({ id: crypto.randomUUID(), role: 'system', text: t('lesson.prepComplete'), timestamp: Date.now() });
          if (isFirstLaunch) {
            await sendTeaching('[系统：序章已由应用展示给学习者。请直接生成群聊消息（使用 show_group_chat），然后开始第一节课。]');
          } else {
            await sendTeaching('请开始今天的课程。');
          }
        } else {
          setPrepComplete(true);
          if (isFirstLaunch) {
            await aiSendMessage('[系统：序章已由应用展示给学习者。请直接生成群聊消息（使用 show_group_chat 工具），然后开始第一节课。]');
          } else {
            await aiSendMessage('请开始今天的课程。');
          }
        }
      } else {
        setPrepComplete(true);
        if (isFirstLaunch) {
          await aiSendMessage('[系统：序章已由应用展示给学习者。请直接生成群聊消息（使用 show_group_chat 工具），然后开始第一节课。]');
        } else {
          await aiSendMessage('请开始今天的课程。');
        }
      }
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), role: 'system', text: t('common.startFailed', { error: err }), timestamp: Date.now() });
      setInClass(false);
    }
  };

  const handleEndClass = async () => {
    addMessage({ id: crypto.randomUUID(), role: 'system', text: t('lesson.endingClass'), timestamp: Date.now() });
    setRightPanel('chat');

    if (useMultiAgent) {
      addMessage({ id: crypto.randomUUID(), role: 'system', text: t('lesson.postLessonAgent'), timestamp: Date.now() });
      try { await runPostLesson(); } catch (err) { }
    } else {
      try { await aiSendMessage('今天到这里吧，下课。'); } catch (err) { }
    }

    // Save session history before clearing
    try {
      const state = useAppStore.getState();
      const now = new Date().toISOString();
      const userMsgs = state.messages.filter(m => m.role !== 'system');
      // Build a brief summary from the first assistant message
      const firstAssistant = state.messages.find(m => m.role === 'assistant');
      const summary = firstAssistant
        ? firstAssistant.text.slice(0, 60).replace(/\n/g, ' ')
        : t('history.untitled');

      const entry: SessionHistoryEntry = {
        id: now.replace(/[:.]/g, '-'),
        startedAt: sessionStartTime,
        endedAt: now,
        messageCount: userMsgs.length,
        canvasCount: state.canvasItems.length,
        summary,
        messages: state.messages.map(m => ({ ...m, isStreaming: false })),
        canvasItems: state.canvasItems,
        groupChatMessages: state.groupChatMessages,
        annotations: state.annotations,
      };
      await saveSessionHistory(getWorkspacePath(), entry);
    } catch { /* silently ignore save failures */ }

    try { await clearSavedSession(getWorkspacePath()); } catch { }
    useAppStore.getState().clearSession();
    setPrepComplete(false);
  };

  const handleRetry = async () => {
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    if (lastUserMsg) {
      if (useMultiAgent && prepComplete) { await sendTeaching(lastUserMsg.text); }
      else { await aiSendMessage(lastUserMsg.text); }
    } else {
      await handleStartClass();
    }
  };

  const handleSend = async (text: string) => {
    const msg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, timestamp: Date.now() };
    addMessage(msg);
    if (useMultiAgent && prepComplete) { await sendTeaching(text); }
    else { await aiSendMessage(text); }
  };

  return (
    <div className="flex h-screen flex-col bg-bg-light pt-8 dark:bg-bg-dark font-sans text-text-main dark:text-text-main-dark selection:bg-primary/20">
      <header className="flex h-16 shrink-0 items-center justify-between px-6 lg:px-8">
        <button
          onClick={() => navigate('/')}
          className="group flex items-center gap-2 text-sm font-medium text-text-sub transition-colors hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('lesson.backLabel')}
        </button>

        <div className="text-[14px] font-medium tracking-wide flex items-center gap-2">
          <span className="text-text-main dark:text-text-main-dark">AP Physics C: E&M</span>
          <span className="text-border-border-light/80 dark:text-border-dark">/</span>
          <span className="text-text-sub dark:text-text-placeholder">{t('lesson.classroom')}</span>
        </div>

        <div className="flex items-center gap-3">
          {isInClass && messages.length > 0 && (
            <button
              onClick={() => navigate('/notes')}
              className="flex h-[32px] items-center justify-center rounded-btn border border-border-light bg-surface-light px-4 text-[13px] font-medium text-text-sub transition-all hover:border-primary hover:text-primary hover:shadow-sm dark:border-border-dark dark:bg-surface-dark dark:text-text-placeholder dark:hover:border-primary"
            >
              {t('lesson.notes')}
            </button>
          )}
          {!isInClass ? (
            <button onClick={handleStartClass} className="h-[32px] rounded-btn bg-primary px-5 text-[13px] font-medium tracking-wide text-white transition-all hover:scale-105 hover:bg-[#BF6A4E] shadow-sm">
              {t('lesson.startClass')}
            </button>
          ) : (
            <button onClick={handleEndClass} className="h-[32px] rounded-btn border border-danger/30 bg-danger/10 px-5 text-[13px] font-medium tracking-wide text-danger transition-all hover:bg-danger hover:text-white">
              {t('lesson.endClass')}
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Area (3 Columns inside a seamless container) */}
      <div className="flex flex-1 overflow-hidden px-4 pb-4 lg:px-6 lg:pb-6 gap-4">

        {/* Left sidebar — chapter outline */}
        <aside className="hidden md:flex w-64 shrink-0 flex-col overflow-y-auto rounded-[24px] bg-surface-light border border-border-light/60 shadow-sm dark:border-border-dark/60 dark:bg-surface-dark">
          <ChapterOutline isInClass={isInClass} />
        </aside>

        {/* Center — sophisticated chat container */}
        <main className="flex flex-1 flex-col overflow-hidden rounded-[24px] bg-surface-light border border-border-light/60 shadow-card dark:border-border-dark/60 dark:bg-surface-dark">
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
            <div className="mx-auto max-w-3xl h-full relative">
              {messages.length === 0 && !isInClass && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-border-light/30 dark:bg-border-dark/30 text-3xl">📖</div>
                    <h3 className="text-lg font-medium text-text-main dark:text-text-main-dark mb-2">{t('lesson.waitingForClass')}</h3>
                    <p className="text-sm text-text-placeholder tracking-wide">{t('lesson.clickToStart')}</p>
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}

              {isInClass && !isStreaming && hasError && (
                <div className="my-8 flex justify-center">
                  <button onClick={handleRetry} className="flex h-[38px] items-center gap-2 rounded-btn bg-primary px-6 text-sm font-medium text-white transition-all hover:scale-105 hover:bg-[#BF6A4E] shadow-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    {t('common.retry')}
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
          {/* Floating Chat Input injected at bottom */}
          <ChatInput onSend={handleSend} disabled={!isInClass || isStreaming} />
        </main>

        {/* Right panel — Segmented Canvas/Log/Chat */}
        <aside className="hidden lg:flex w-[340px] shrink-0 flex-col overflow-hidden rounded-[24px] bg-surface-light border border-border-light/60 shadow-sm dark:border-border-dark/60 dark:bg-surface-dark">

          {/* Segmented Control Header */}
          <div className="p-3 border-b border-border-light/60 dark:border-border-dark/60">
            <div className="flex h-[40px] items-center rounded-btn bg-bg-light p-1 dark:bg-[#1E1D1A]">
              {(['canvas', 'chat', 'log'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setRightPanel(tab)}
                  className={`flex-1 h-full rounded-[6px] text-[13px] font-medium tracking-wide transition-all ${rightPanel === tab
                      ? 'bg-surface-light text-primary shadow-sm dark:bg-surface-dark'
                      : 'text-text-placeholder hover:text-text-main dark:hover:text-text-main-dark'
                    }`}
                >
                  {tab === 'canvas' ? t('lesson.canvasTab') : tab === 'chat' ? t('lesson.groupChatTab') : t('lesson.logTab')}
                </button>
              ))}
            </div>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto bg-surface-light dark:bg-surface-dark p-4">
            {rightPanel === 'canvas' ? (
              <CanvasPanel items={canvasItems} />
            ) : rightPanel === 'log' ? (
              <AgentLogPanel logs={agentLogs} />
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex-1 space-y-5 overflow-y-auto px-1 py-2">
                  {groupChatMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-text-placeholder opacity-80">
                      <div className="mb-3 text-3xl">💬</div>
                      <p className="text-[13px] tracking-wide">{t('lesson.noGroupChat')}</p>
                    </div>
                  ) : (
                    groupChatMessages.map((msg, i) => {
                      const isStudent = msg.sender === '宇轩';
                      return (
                        <div key={i} className={`flex flex-col ${isStudent ? 'items-end' : 'items-start'}`}>
                          <span className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-text-placeholder">
                            {msg.sender} <span className="opacity-60 font-normal ml-1">{msg.time || ''}</span>
                          </span>
                          <div
                            className={`max-w-[85%] rounded-[16px] px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${isStudent
                                ? 'bg-[#55B37D] text-white rounded-br-[4px]'
                                : 'bg-[#F9F7F4] text-text-main rounded-bl-[4px] border border-border-light/50 dark:bg-[#2A2825] dark:text-text-main-dark dark:border-border-dark/50'
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
