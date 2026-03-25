import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import { createWorkspace, listWorkspaces } from '../lib/tauri';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import AgentLogPanel from '../components/debug/AgentLogPanel';
import QuestionnaireWizard from '../components/metaprompt/QuestionnaireWizard';
import { serializeQuestionnaire } from '../lib/questionnaireSerializer';
import type { ChatMessage, MetaPromptQuestionnaire } from '../types';

type PagePhase = 'name' | 'questionnaire' | 'generating';

const GEN_PHASES = [
  { id: 5, label: '文件生成', icon: '⚙️' },
  { id: 6, label: '验证测试', icon: '✅' },
];

export default function MetaPromptPage() {
  const navigate = useNavigate();
  const { messages, addMessage, clearMessages, isStreaming, hasError, agentLogs } = useAppStore();
  const { sendMetaPrompt, initMetaPrompt } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [pagePhase, setPagePhase] = useState<PagePhase>('name');
  const [sessionReady, setSessionReady] = useState(false);
  const [currentGenPhase, setCurrentGenPhase] = useState(5);
  const [showLog, setShowLog] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [nameError, setNameError] = useState('');

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Detect Phase 6 from AI messages
  useEffect(() => {
    const lastMsg = messages.findLast((m) => m.role === 'assistant');
    if (!lastMsg) return;
    const text = lastMsg.text.toLowerCase();
    if (text.includes('phase 6') || text.includes('验证') || text.includes('冷启动测试')) {
      setCurrentGenPhase(6);
    }
  }, [messages]);

  // Streaming timeout safety net (10 min)
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

  // Handle name submit → enter questionnaire
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
      // proceed anyway
    }
    setPagePhase('questionnaire');
  };

  // Handle questionnaire complete → create workspace + send to AI
  const handleQuestionnaireComplete = useCallback(async (questionnaire: MetaPromptQuestionnaire) => {
    setPagePhase('generating');
    const name = workspaceName.trim();

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
        text: '✅ 工作区已创建，正在初始化 AI 生成引擎...',
        timestamp: Date.now(),
      });

      await initMetaPrompt(ws.path);
      setSessionReady(true);

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: '🤖 AI 生成引擎已就绪 — 正在发送你的设计决策...',
        timestamp: Date.now(),
      });

      // Serialize questionnaire and send as the first user message
      const designDoc = serializeQuestionnaire(questionnaire);
      const initialMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: designDoc,
        timestamp: Date.now(),
      };
      addMessage(initialMsg);
      await sendMetaPrompt(initialMsg.text);
    } catch (err) {
      const errStr = String(err);
      const friendly = errStr.includes('already exists')
        ? '工作区名称冲突，请返回修改名称后重试'
        : `初始化失败: ${errStr}`;
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: `❌ ${friendly}`,
        timestamp: Date.now(),
      });
      if (errStr.includes('already exists')) {
        setPagePhase('name');
        setNameError(`工作区「${name}」已存在，请换一个名称`);
      }
    }
  }, [workspaceName, clearMessages, addMessage, initMetaPrompt, sendMetaPrompt]);

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

  // ─── Phase 1: Name input ──────────────────────────────────
  if (pagePhase === 'name') {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-light dark:bg-bg-dark">
        <div className="w-full max-w-md rounded-block border border-border-light bg-surface-light p-8 shadow-lg dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-6 text-center">
            <span className="mb-3 block text-title leading-tight tracking-[0.04em]">🔨</span>
            <h1 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              创建教学系统
            </h1>
            <p className="text-aux text-text-sub dark:text-text-placeholder">
              填写问卷设计你的沉浸式教学系统，AI 自动生成所有文件
            </p>
          </div>
          <div className="mb-6">
            <label className="mb-2 block text-aux font-medium text-text-main dark:text-text-main-dark">
              项目名称
            </label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => { setWorkspaceName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder="例如: AP-Chemistry, 高中数学, ..."
              className={`w-full rounded-btn border bg-surface-light px-4 py-3 text-aux text-text-main placeholder-text-placeholder focus:bg-surface-light focus:outline-none dark:bg-slate-700 dark:text-text-main-dark ${
                nameError
                  ? 'border-amber-400 focus:border-amber-500 dark:border-amber-500'
                  : 'border-border-light focus:border-blue-500 dark:border-slate-600'
              }`}
              autoFocus
            />
            {nameError && (
              <p className="mt-2 flex items-center gap-1.5 text-aux text-warning dark:text-amber-400">
                <span>⚠️</span> {nameError}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
            >
              ← 返回
            </button>
            <button
              onClick={handleNameSubmit}
              disabled={!workspaceName.trim()}
              className="rounded-btn bg-primary px-6 py-2.5 font-medium text-white hover:bg-[#BF6A4E] disabled:opacity-50 h-[38px]"
            >
              下一步 →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase 2: Questionnaire wizard ────────────────────────
  if (pagePhase === 'questionnaire') {
    return (
      <QuestionnaireWizard
        onComplete={handleQuestionnaireComplete}
        onBack={() => setPagePhase('name')}
      />
    );
  }

  // ─── Phase 3: AI generation chat (Phase 5/6) ─────────────
  return (
    <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-light px-4 dark:border-border-dark">
        <button
          onClick={() => navigate('/')}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          ← 返回
        </button>
        <span className="text-aux font-medium text-text-main dark:text-text-main-dark">
          ⚙️ 生成中 — {workspaceName}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLog(!showLog)}
            className="rounded-btn border border-border-light px-3 py-1.5 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark dark:hover:bg-slate-700"
          >
            {showLog ? '隐藏日志' : '🔧 日志'}
          </button>
          <button
            onClick={handleFinish}
            className="rounded-btn bg-green-600 px-4 py-1.5 text-aux font-medium text-white hover:bg-green-700"
          >
            ✅ 完成创建
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — generation phase */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-border-light bg-bg-light p-4 dark:border-border-dark dark:bg-slate-850">
          <h3 className="mb-4 text-tag tracking-[0.04em] font-medium uppercase tracking-wider text-text-placeholder">
            生成进度
          </h3>
          {/* Completed phases */}
          <div className="mb-3 space-y-1">
            {['📋 基础信息', '🎭 角色创建', '🌍 世界观', '📖 故事设计'].map((label, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-tag tracking-[0.04em] text-green-600 dark:text-green-400">
                <span>✅</span> <span>{label}</span>
              </div>
            ))}
          </div>
          {/* Active phases */}
          <div className="space-y-2">
            {GEN_PHASES.map((phase) => {
              const isActive = phase.id === currentGenPhase;
              const isDone = phase.id < currentGenPhase;
              return (
                <div
                  key={phase.id}
                  className={`flex items-center gap-3 rounded-btn px-3 py-2.5 text-aux transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : isDone
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-text-placeholder dark:text-text-sub'
                  }`}
                >
                  <span className="text-base">
                    {isDone ? '✅' : isActive ? '▶' : phase.icon}
                  </span>
                  <div>
                    <span className="font-medium">Phase {phase.id}</span>
                    <p className="text-tag tracking-[0.04em] opacity-75">{phase.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="rounded-btn bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <p className="text-tag tracking-[0.04em] font-medium text-text-sub dark:text-text-main-dark">工作区</p>
              <p className="truncate text-tag tracking-[0.04em] text-text-placeholder">{workspaceName}</p>
            </div>
          </div>
        </aside>

        {/* Center — chat */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-text-placeholder dark:text-text-sub">
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
                  className="rounded-btn bg-primary px-4 py-1.5 text-aux font-medium text-white hover:bg-[#BF6A4E] h-[38px]"
                >
                  🔄 重试
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <ChatInput onSend={handleSend} disabled={!sessionReady || isStreaming} />
        </main>

        {/* Right panel — log */}
        {showLog && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-border-light dark:border-border-dark">
            <div className="flex h-10 shrink-0 items-center border-b border-border-light px-3 dark:border-border-dark">
              <span className="text-tag tracking-[0.04em] font-medium text-text-sub">🔧 Agent 日志</span>
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
