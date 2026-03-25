import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import { createWorkspace, listWorkspaces } from '../lib/tauri';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import AgentLogPanel from '../components/debug/AgentLogPanel';
import type { ChatMessage } from '../types';

const META_PHASES = [
  { id: 1, label: '基础信息', icon: '📋' },
  { id: 2, label: '角色创建', icon: '🎭' },
  { id: 3, label: '世界观设定', icon: '🌍' },
  { id: 4, label: '故事设计', icon: '📖' },
  { id: 5, label: '文件生成', icon: '⚙️' },
  { id: 6, label: '验证测试', icon: '✅' },
];

export default function MetaPromptPage() {
  const navigate = useNavigate();
  const { messages, addMessage, clearMessages, isStreaming, hasError, agentLogs } = useAppStore();
  const { sendMetaPrompt, initMetaPrompt } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [sessionReady, setSessionReady] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [askingName, setAskingName] = useState(true);
  const [nameError, setNameError] = useState('');

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Detect current phase from AI messages
  useEffect(() => {
    const lastMsg = messages.findLast((m) => m.role === 'assistant');
    if (!lastMsg) return;
    const text = lastMsg.text.toLowerCase();
    if (text.includes('phase 6') || text.includes('验证') || text.includes('冷启动测试')) setCurrentPhase(6);
    else if (text.includes('phase 5') || text.includes('文件生成') || text.includes('开始生成')) setCurrentPhase(5);
    else if (text.includes('phase 4') || text.includes('故事设计') || text.includes('情感阶段')) setCurrentPhase(4);
    else if (text.includes('phase 3') || text.includes('世界观') || text.includes('物理空间')) setCurrentPhase(3);
    else if (text.includes('phase 2') || text.includes('角色') || text.includes('教师')) setCurrentPhase(2);
  }, [messages]);

  // Streaming timeout safety net (10 min for meta prompt — file generation takes time)
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
    }, 600_000);
    return () => clearTimeout(timer);
  }, [isStreaming]);

  // Initialize workspace and meta prompt session
  const handleStartSession = useCallback(async (name: string) => {
    try {
      clearMessages();
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: `🔨 正在创建工作区「${name}」...`,
        timestamp: Date.now(),
      });

      const ws = await createWorkspace(name);
      setWorkspacePath(ws.path);

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: `✅ 工作区已创建，正在初始化 AI 引导...`,
        timestamp: Date.now(),
      });

      await initMetaPrompt(ws.path);
      setSessionReady(true);

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '🤖 Meta Prompt 引导已就绪 — AI 将一步步引导你创建自定义教学系统。',
        timestamp: Date.now(),
      });

      // Auto-send initial message to trigger AI Phase 1
      const initialMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: '你好！我想创建一个自定义的苏格拉底式教学系统。请开始引导我。',
        timestamp: Date.now(),
      };
      addMessage(initialMsg);
      await sendMetaPrompt(initialMsg.text);
    } catch (err) {
      const errStr = String(err);
      const friendly = errStr.includes('already exists')
        ? `工作区名称冲突，请返回修改名称后重试`
        : `初始化失败: ${errStr}`;
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: `❌ ${friendly}`,
        timestamp: Date.now(),
      });
      if (errStr.includes('already exists')) {
        setAskingName(true);
        setNameError(`工作区「${workspaceName.trim()}」已存在，请换一个名称`);
      }
    }
  }, [clearMessages, addMessage, initMetaPrompt, sendMetaPrompt]);

  const handleNameSubmit = async () => {
    const name = workspaceName.trim();
    if (!name) return;
    setNameError('');
    try {
      const existing = await listWorkspaces();
      if (existing.some((ws) => ws.name === name || ws.id === name)) {
        setNameError(`工作区「${name}」已存在，请换一个名称`);
        return;
      }
    } catch {
      // listWorkspaces failed — proceed anyway, createWorkspace will catch real errors
    }
    setAskingName(false);
    handleStartSession(name);
  };

  const handleSend = async (text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    addMessage(msg);
    await sendMetaPrompt(text);
  };

  const handleRetry = async () => {
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    if (lastUserMsg) {
      await sendMetaPrompt(lastUserMsg.text);
    }
  };

  const handleFinish = () => {
    if (workspacePath) {
      const { updateSettings } = useAppStore.getState();
      updateSettings({ currentWorkspacePath: workspacePath });
    }
    navigate('/');
  };

  // Workspace name input screen
  if (askingName) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-6 text-center">
            <span className="mb-3 block text-4xl">🔨</span>
            <h1 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
              创建教学系统
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              AI 将引导你一步步完成自定义教学系统的创建
            </p>
          </div>
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              项目名称
            </label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => { setWorkspaceName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder="例如: AP-Chemistry, 高中数学, ..."
              className={`w-full rounded-lg border bg-white px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none dark:bg-slate-700 dark:text-slate-200 ${
                nameError
                  ? 'border-amber-400 focus:border-amber-500 dark:border-amber-500'
                  : 'border-slate-200 focus:border-blue-500 dark:border-slate-600'
              }`}
              autoFocus
            />
            {nameError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <span>⚠️</span> {nameError}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              ← 返回
            </button>
            <button
              onClick={handleNameSubmit}
              disabled={!workspaceName.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              开始创建 →
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          🔨 创建教学系统 — {workspaceName}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLog(!showLog)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {showLog ? '隐藏日志' : '🔧 日志'}
          </button>
          {currentPhase >= 5 && (
            <button
              onClick={handleFinish}
              className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              ✅ 完成创建
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — phase progress */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-850">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            创建进度
          </h3>
          <div className="space-y-2">
            {META_PHASES.map((phase) => {
              const isActive = phase.id === currentPhase;
              const isDone = phase.id < currentPhase;
              return (
                <div
                  key={phase.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : isDone
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span className="text-base">
                    {isDone ? '✅' : isActive ? '▶' : phase.icon}
                  </span>
                  <div>
                    <span className="font-medium">Phase {phase.id}</span>
                    <p className="text-xs opacity-75">{phase.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">工作区</p>
              <p className="truncate text-xs text-slate-400">{workspaceName}</p>
            </div>
          </div>
        </aside>

        {/* Center — chat */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-slate-400 dark:text-slate-500">
                  正在初始化…
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
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

        {/* Right panel — log (togglable) */}
        {showLog && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 dark:border-slate-700">
            <div className="flex h-10 shrink-0 items-center border-b border-slate-200 px-3 dark:border-slate-700">
              <span className="text-xs font-medium text-slate-500">🔧 Agent 日志</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <AgentLogPanel logs={agentLogs} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
