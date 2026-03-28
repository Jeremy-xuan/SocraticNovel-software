import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  { id: 5, labelKey: 'metaPrompt.phaseFileGen', icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { id: 6, labelKey: 'metaPrompt.phaseValidation', icon: <svg className="inline-block h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
];

export default function MetaPromptPage() {
  const { t } = useTranslation();
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
          text: t('common.timeoutRetry'),
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
        setNameError(t('metaPrompt.workspaceExists', { name }));
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
        text: t('metaPrompt.creatingWorkspace', { name }),
        timestamp: Date.now(),
      });

      const ws = await createWorkspace(name);
      setWorkspacePath(ws.path);

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: t('metaPrompt.workspaceCreated'),
        timestamp: Date.now(),
      });

      await initMetaPrompt(ws.path);
      setSessionReady(true);

      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: t('metaPrompt.aiEngineReady'),
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
        ? t('metaPrompt.conflictError')
        : t('metaPrompt.initFailed', { error: errStr });
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: friendly,
        timestamp: Date.now(),
      });
      if (errStr.includes('already exists')) {
        setPagePhase('name');
        setNameError(t('metaPrompt.workspaceExists', { name }));
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
      <div className="flex h-screen items-center justify-center bg-bg-light pt-8 dark:bg-bg-dark">
        <div className="w-full max-w-md rounded-block border border-border-light bg-surface-light p-8 shadow-lg dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-6 text-center">
            <span className="mb-3 flex justify-center"><svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.84-5.84a2.121 2.121 0 113-3l5.84 5.84m-1.42 1.42l5.84 5.84a2.121 2.121 0 01-3 3l-5.84-5.84" /></svg></span>
            <h1 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              {t('metaPrompt.createTitle')}
            </h1>
            <p className="text-aux text-text-sub dark:text-text-placeholder">
              {t('metaPrompt.createDesc')}
            </p>
          </div>
          <div className="mb-6">
            <label className="mb-2 block text-aux font-medium text-text-main dark:text-text-main-dark">
              {t('metaPrompt.projectName')}
            </label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => { setWorkspaceName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder={t('metaPrompt.projectPlaceholder')}
              className={`w-full rounded-btn border bg-surface-light px-4 py-3 text-aux text-text-main placeholder-text-placeholder focus:bg-surface-light focus:outline-none dark:bg-slate-700 dark:text-text-main-dark ${
                nameError
                  ? 'border-amber-400 focus:border-amber-500 dark:border-amber-500'
                  : 'border-border-light focus:border-blue-500 dark:border-slate-600'
              }`}
              autoFocus
            />
            {nameError && (
              <p className="mt-2 flex items-center gap-1.5 text-aux text-warning dark:text-amber-400">
                <svg className="inline-block h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg> {nameError}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
            >
              {t('common.back')}
            </button>
            <button
              onClick={handleNameSubmit}
              disabled={!workspaceName.trim()}
              className="rounded-btn bg-primary px-6 py-2.5 font-medium text-white hover:bg-[#BF6A4E] disabled:opacity-50 h-[38px]"
            >
              {t('common.next')}
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
    <div className="flex h-screen flex-col bg-surface-light pt-8 dark:bg-bg-dark">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-light px-4 dark:border-border-dark">
        <button
          onClick={() => navigate('/')}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          {t('common.back')}
        </button>
        <span className="text-aux font-medium text-text-main dark:text-text-main-dark">
          {t('metaPrompt.generatingLabel', { name: workspaceName })}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLog(!showLog)}
            className="rounded-btn border border-border-light px-3 py-1.5 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark dark:hover:bg-slate-700"
          >
            {showLog ? t('metaPrompt.hideLog') : t('metaPrompt.showLog')}
          </button>
          <button
            onClick={handleFinish}
            className="rounded-btn bg-green-600 px-4 py-1.5 text-aux font-medium text-white hover:bg-green-700"
          >
            {t('metaPrompt.finishCreate')}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — generation phase */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-border-light bg-bg-light p-4 dark:border-border-dark dark:bg-slate-850">
          <h3 className="mb-4 text-tag tracking-[0.04em] font-medium uppercase tracking-wider text-text-placeholder">
            {t('metaPrompt.genProgress')}
          </h3>
          {/* Completed phases */}
          <div className="mb-3 space-y-1">
            {[
              t('metaPrompt.phaseBasicInfo'),
              t('metaPrompt.phaseCharacters'),
              t('metaPrompt.phaseWorld'),
              t('metaPrompt.phaseStory'),
            ].map((label, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-tag tracking-[0.04em] text-green-600 dark:text-green-400">
                <svg className="inline-block h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> <span>{label}</span>
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
                    {isDone ? <svg className="inline-block h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : isActive ? <svg className="inline-block h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5.14v14l11-7-11-7z" /></svg> : phase.icon}
                  </span>
                  <div>
                    <span className="font-medium">Phase {phase.id}</span>
                    <p className="text-tag tracking-[0.04em] opacity-75">{t(phase.labelKey)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto">
            <div className="rounded-btn bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <p className="text-tag tracking-[0.04em] font-medium text-text-sub dark:text-text-main-dark">{t('metaPrompt.workspaceLabel')}</p>
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
                  {t('common.initializing')}
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
                  {t('common.retry')}
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
              <span className="text-tag tracking-[0.04em] font-medium text-text-sub">{t('metaPrompt.agentLog')}</span>
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
