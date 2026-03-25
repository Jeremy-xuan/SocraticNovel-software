import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import CanvasPanel from '../components/canvas/CanvasPanel';
import AgentLogPanel from '../components/debug/AgentLogPanel';
import type { ChatMessage } from '../types';

function getWorkspacePath(): string {
  const path = useAppStore.getState().settings.currentWorkspacePath;
  if (!path) throw new Error('Workspace path not initialized');
  return path;
}

export default function PracticePage() {
  const navigate = useNavigate();
  const { messages, addMessage, isStreaming, canvasItems, hasError, agentLogs } = useAppStore();
  const { sendPractice, initPractice } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rightPanel, setRightPanel] = useState<'canvas' | 'log'>('canvas');

  // Initialize practice session on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initPractice(getWorkspacePath());
        setSessionReady(true);
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: '📝 练习模式已启动 — 把你不会的题目发过来吧！',
          timestamp: Date.now(),
        });
      } catch (err) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          text: `❌ 启动失败: ${err}`,
          timestamp: Date.now(),
        });
      }
    };
    init();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Streaming timeout safety net (5 min)
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

  const handleSend = async (text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    addMessage(msg);
    await sendPractice(text);
  };

  const handleRetry = async () => {
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    if (lastUserMsg) {
      await sendPractice(lastUserMsg.text);
    }
  };

  const handleEnd = () => {
    // Don't clear immediately — preserve state so notes page can still generate from this session.
    // State will be cleared on next session start (startAiSession / initPractice).
    navigate('/');
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
          AP Physics C: E&M — 练习模式
        </span>
        <div className="flex gap-2">
          {messages.length > 2 && (
            <button
              onClick={() => navigate('/notes')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              📝 笔记
            </button>
          )}
          <button
            onClick={handleEnd}
            className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          >
            结束练习
          </button>
        </div>
      </header>

      {/* Two-column layout: chat + canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — practice info */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-850">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            练习信息
          </h3>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="font-medium">模式</p>
              <p className="text-slate-400">🎯 刷题 / 练习</p>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="font-medium">引导方式</p>
              <p className="text-slate-400">苏格拉底法</p>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="font-medium">状态</p>
              <p className={sessionReady ? 'text-green-500' : 'text-amber-500'}>
                {sessionReady ? '🟢 准备就绪' : '⏳ 初始化中…'}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              使用方法
            </h3>
            <div className="space-y-1 text-xs text-slate-400">
              <p>• 发送题目或问题</p>
              <p>• AI 用引导式提问帮你思考</p>
              <p>• 可以追问或发新题</p>
              <p>• 白板展示解题步骤</p>
            </div>
          </div>
        </aside>

        {/* Center — chat */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-slate-400 dark:text-slate-500">
                  正在初始化练习模式…
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {/* Retry button on error */}
            {sessionReady && !isStreaming && hasError && (
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
          <ChatInput onSend={handleSend} disabled={!sessionReady || isStreaming} />
        </main>

        {/* Right panel — canvas + log tabs */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 dark:border-slate-700">
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
            ) : (
              <AgentLogPanel logs={agentLogs} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
