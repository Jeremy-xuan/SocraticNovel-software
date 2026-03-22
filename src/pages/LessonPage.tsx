import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import CanvasPanel from '../components/canvas/CanvasPanel';
import type { ChatMessage } from '../types';
import { readFile } from '../lib/tauri';

function getWorkspacePath(): string {
  // TODO: resolve from settings/workspace selector
  return '/Users/wujunjie/SocraticNovel/workspaces/ap-physics-em';
}

export default function LessonPage() {
  const navigate = useNavigate();
  const { messages, addMessage, isStreaming, isInClass, setInClass, canvasItems } = useAppStore();
  const { initSession, sendMessage: aiSendMessage } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [rightPanel, setRightPanel] = useState<'canvas' | 'chat'>('canvas');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStartClass = async () => {
    setInClass(true);
    const sysMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'system',
      text: '正在启动课堂...',
      timestamp: Date.now(),
    };
    addMessage(sysMsg);

    try {
      const workspacePath = getWorkspacePath();
      // Read CLAUDE.md as system prompt
      const systemPrompt = await readFile(workspacePath, 'CLAUDE.md');
      await initSession(workspacePath, systemPrompt);
      // Send the hidden trigger message
      await aiSendMessage('请开始今天的课程。');
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

  const handleEndClass = () => {
    const sysMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'system',
      text: '正在结束课堂，AI 正在更新文件...',
      timestamp: Date.now(),
    };
    addMessage(sysMsg);
    setRightPanel('chat');
    // TODO: trigger AI end-of-class routine
  };

  const handleSend = async (text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    addMessage(msg);
    await aiSendMessage(text);
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
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {rightPanel === 'canvas' ? (
              <CanvasPanel items={canvasItems} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                课后解锁群聊
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
