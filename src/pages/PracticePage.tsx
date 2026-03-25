import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import { useAiAgent } from '../hooks/useAiAgent';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import ChatInput from '../components/chat/ChatInput';
import CanvasPanel from '../components/canvas/CanvasPanel';
import AgentLogPanel from '../components/debug/AgentLogPanel';
import type { ChatMessage } from '../types';

type Phase = 'select' | 'yuuki-setup' | 'animatutor-wizard' | 'animatutor-generating' | 'active';

function getWorkspacePath(): string {
  const path = useAppStore.getState().settings.currentWorkspacePath;
  if (!path) throw new Error('Workspace path not initialized');
  return path;
}

// ---------- Protocol Loading Helpers ----------

const YUUKI_FILES = [
  '00_系统规则.md', '02_角色设定.md', '01_世界观与序章.md', '03_学科场景机制.md',
  '04a_故事线·第一章.md', '04b_故事线·第二章.md', '04c_故事线·第三章.md', '04d_故事线·第四章.md',
  '05_终章.md', '06_状态追踪模板.md', '07_角色记忆.md',
];

async function loadYuukiProtocol(progression: string): Promise<string> {
  const contents = await Promise.all(
    YUUKI_FILES.map(f => fetch(`/protocols/yuuki-alpha/${f}`).then(r => r.text()))
  );

  let fullPrompt = contents.join('\n\n---\n\n');

  fullPrompt += `\n\n[用户当前进度: ${progression}]\n`;
  fullPrompt += '请根据用户的进度，从对应的章节开始。如果用户是"刚开始"，请从序章开始。';

  return fullPrompt;
}

async function loadAnimaTutorTemplate(
  character: { name: string; source: string; intro: string },
  subject: string,
  extra: string,
): Promise<string> {
  const template = await fetch('/protocols/animatutor/meta_prompt_v2.3.md').then(r => r.text());

  const userInput = `\`\`\`yaml
角色名: ${character.name}
角色来源: ${character.source}
角色简介: |
  ${character.intro}

学科列表:
  - ${subject}

补充要求: |
  ${extra || '无'}
\`\`\``;

  return template + '\n\n# 用户输入\n\n' + userInput;
}

// ---------- Yuuki Progression Options ----------

const YUUKI_PROGRESSIONS = [
  { value: '刚开始', labelKey: 'practice.progressStart' },
  { value: '第一章', labelKey: 'practice.progressCh1' },
  { value: '第二章', labelKey: 'practice.progressCh2' },
  { value: '第三章', labelKey: 'practice.progressCh3' },
  { value: '第四章', labelKey: 'practice.progressCh4' },
] as const;

// ---------- AnimaTutor Preset Characters ----------

const PRESET_CHARACTERS = [
  { name: '折木奉太郎', source: '冰菓', intro: '节能主义的高中生侦探，口头禅是「我很好奇」。看似冷淡懒散，实则观察力惊人，擅长用最少的线索推导出真相。辅导时会用反问和最小提示引导你自己发现答案。' },
  { name: '牧濑红莉栖', source: '命运石之门', intro: '十八岁的天才神经科学家，维克多·孔多莉亚大学脑科学研究所研究员。理性严谨但偶尔傲娇，擅长将复杂概念拆解为直观类比。会在你犯错时叹气，但从不放弃教你。' },
  { name: '五条悟', source: '咒术回战', intro: '最强的咒术师，同时也是东京都立咒术高等专门学校的教师。外表轻浮实则认真对待教育，相信年轻一代的可能性。教学风格不走寻常路，喜欢用出人意料的方式让学生顿悟。' },
] as const;

// ---------- Sub-Components ----------

function ProtocolSelectScreen({ onSelect }: { onSelect: (protocol: 'yuuki' | 'animatutor') => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <h1 className="mb-2 text-2xl font-bold text-text-main dark:text-text-main-dark">{t('practice.selectMode')}</h1>
      <p className="mb-10 text-sm text-text-sub dark:text-text-placeholder">{t('practice.selectModeDesc')}</p>
      <div className="flex gap-6">
        {/* AnimaTutor Card */}
        <button
          onClick={() => onSelect('animatutor')}
          className="group flex w-72 flex-col rounded-xl border border-border-light bg-surface-light p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-lg dark:border-border-dark dark:bg-surface-dark"
        >
          <span className="mb-3 text-4xl">🎭</span>
          <h2 className="mb-1 text-left text-base font-semibold text-text-main dark:text-text-main-dark">
            {t('practice.animaTutorTitle')}
          </h2>
          <p className="mb-4 text-left text-sm leading-relaxed text-text-sub dark:text-text-placeholder">
            {t('practice.animaTutorDesc')}
          </p>
          <span className="mt-auto inline-block self-start rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t('practice.animaTutorInit')}
          </span>
        </button>
        {/* 幽鬼α Card */}
        <button
          onClick={() => onSelect('yuuki')}
          className="group flex w-72 flex-col rounded-xl border border-border-light bg-surface-light p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-lg dark:border-border-dark dark:bg-surface-dark"
        >
          <span className="mb-3 text-4xl">👻</span>
          <h2 className="mb-1 text-left text-base font-semibold text-text-main dark:text-text-main-dark">
            {t('practice.yuukiTitle')}
          </h2>
          <p className="mb-4 text-left text-sm leading-relaxed text-text-sub dark:text-text-placeholder">
            {t('practice.yuukiDesc')}
          </p>
          <span className="mt-auto inline-block self-start rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            {t('practice.yuukiReady')}
          </span>
        </button>
      </div>
    </div>
  );
}

function YuukiSetupScreen({ onStart, onBack }: { onStart: (progression: string) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const [progression, setProgression] = useState('刚开始');
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-border-light bg-surface-light p-8 shadow-card dark:border-border-dark dark:bg-surface-dark">
        <button onClick={onBack} className="mb-4 text-sm text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark">{t('common.backToSelect')}</button>
        <h2 className="mb-1 text-lg font-semibold text-text-main dark:text-text-main-dark">{t('practice.yuukiHeading')}</h2>
        <p className="mb-6 text-sm text-text-sub dark:text-text-placeholder">{t('practice.yuukiProgress')}</p>
        <div className="mb-6 space-y-2">
          {YUUKI_PROGRESSIONS.map(opt => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                progression === opt.value
                  ? 'border-primary bg-primary/5 dark:border-primary dark:bg-primary/10'
                  : 'border-border-light hover:border-text-sub dark:border-border-dark dark:hover:border-text-placeholder'
              }`}
            >
              <input
                type="radio"
                name="progression"
                value={opt.value}
                checked={progression === opt.value}
                onChange={() => setProgression(opt.value)}
                className="accent-primary"
              />
              <span className="text-sm text-text-main dark:text-text-main-dark">{t(opt.labelKey)}</span>
            </label>
          ))}
        </div>
        <button
          onClick={() => onStart(progression)}
          className="w-full rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-[#BF6A4E] transition-colors"
        >
          {t('practice.start')}
        </button>
      </div>
    </div>
  );
}

function AnimaTutorWizard({ onGenerate, onBack }: {
  onGenerate: (character: { name: string; source: string; intro: string }, subject: string, extra: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [charName, setCharName] = useState('');
  const [charSource, setCharSource] = useState('');
  const [charIntro, setCharIntro] = useState('');
  const [subject, setSubject] = useState('');
  const [extra, setExtra] = useState('');

  const applyPreset = (preset: typeof PRESET_CHARACTERS[number]) => {
    setCharName(preset.name);
    setCharSource(preset.source);
    setCharIntro(preset.intro);
  };

  const canProceedStep1 = charName.trim() && charSource.trim() && charIntro.trim();
  const canGenerate = subject.trim();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-xl border border-border-light bg-surface-light p-8 shadow-card dark:border-border-dark dark:bg-surface-dark">
        <button onClick={step === 1 ? onBack : () => setStep(1)} className="mb-4 text-sm text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark">
          {step === 1 ? t('common.backToSelect') : t('common.prev')}
        </button>
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === 1 ? 'bg-primary text-white' : 'bg-green-500 text-white'}`}>1</span>
          <div className="h-px flex-1 bg-border-light dark:bg-border-dark" />
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === 2 ? 'bg-primary text-white' : 'bg-border-light text-text-placeholder dark:bg-border-dark'}`}>2</span>
        </div>

        {step === 1 && (
          <>
            <h2 className="mb-1 text-lg font-semibold text-text-main dark:text-text-main-dark">{t('practice.whoTutors')}</h2>
            <p className="mb-4 text-sm text-text-sub dark:text-text-placeholder">{t('practice.fillCharInfo')}</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESET_CHARACTERS.map(p => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    charName === p.name
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border-light text-text-sub hover:border-text-sub dark:border-border-dark dark:text-text-placeholder dark:hover:border-text-placeholder'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="mb-3 flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-text-sub dark:text-text-placeholder">{t('practice.charName')}</label>
                <input
                  value={charName}
                  onChange={e => setCharName(e.target.value)}
                  placeholder={t('practice.charNamePlaceholder')}
                  className="w-full rounded-btn border border-border-light bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary dark:border-border-dark dark:bg-bg-dark dark:text-text-main-dark"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-text-sub dark:text-text-placeholder">{t('practice.sourceWork')}</label>
                <input
                  value={charSource}
                  onChange={e => setCharSource(e.target.value)}
                  placeholder={t('practice.sourceWorkPlaceholder')}
                  className="w-full rounded-btn border border-border-light bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary dark:border-border-dark dark:bg-bg-dark dark:text-text-main-dark"
                />
              </div>
            </div>
            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-text-sub dark:text-text-placeholder">{t('practice.introLabel')}</label>
              <textarea
                value={charIntro}
                onChange={e => setCharIntro(e.target.value)}
                rows={4}
                placeholder={t('practice.introPlaceholder')}
                className="w-full resize-none rounded-btn border border-border-light bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary dark:border-border-dark dark:bg-bg-dark dark:text-text-main-dark"
              />
            </div>
            <button
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
              className="w-full rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#BF6A4E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('common.next')}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="mb-1 text-lg font-semibold text-text-main dark:text-text-main-dark">{t('practice.whatToLearn')}</h2>
            <p className="mb-4 text-sm text-text-sub dark:text-text-placeholder">{t('practice.enterSubject')}</p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-text-sub dark:text-text-placeholder">{t('practice.subjectName')}</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder={t('practice.subjectPlaceholder')}
                className="w-full rounded-btn border border-border-light bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary dark:border-border-dark dark:bg-bg-dark dark:text-text-main-dark"
              />
            </div>
            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-text-sub dark:text-text-placeholder">{t('practice.extraRequirements')}</label>
              <textarea
                value={extra}
                onChange={e => setExtra(e.target.value)}
                rows={3}
                placeholder={t('practice.extraPlaceholder')}
                className="w-full resize-none rounded-btn border border-border-light bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary dark:border-border-dark dark:bg-bg-dark dark:text-text-main-dark"
              />
            </div>
            <button
              disabled={!canGenerate}
              onClick={() => onGenerate({ name: charName, source: charSource, intro: charIntro }, subject, extra)}
              className="w-full rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#BF6A4E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('practice.generateProtocol')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GeneratingScreen() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4">
        <span className="text-5xl">🎭</span>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border-light border-t-primary dark:border-border-dark dark:border-t-primary" />
        <p className="text-base font-medium text-text-main dark:text-text-main-dark">
          {t('practice.generatingProtocol')}
        </p>
        <p className="text-sm text-text-sub dark:text-text-placeholder">
          {t('practice.generatingWait')}
        </p>
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function PracticePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { messages, addMessage, isStreaming, canvasItems, hasError, agentLogs } = useAppStore();
  const { sendPractice, initPractice } = useAiAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rightPanel, setRightPanel] = useState<'canvas' | 'log'>('canvas');
  const [phase, setPhase] = useState<Phase>('select');
  const [protocolLabel, setProtocolLabel] = useState(t('practice.practiceMode'));

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
          text: t('common.timeoutRetry'),
          timestamp: Date.now(),
        });
      }
    }, 300_000);
    return () => clearTimeout(timer);
  }, [isStreaming]);

  // ---------- Launch Handlers ----------

  const startYuuki = useCallback(async (progression: string) => {
    setPhase('active');
    setProtocolLabel(t('practice.yuukiLabel'));
    try {
      const prompt = await loadYuukiProtocol(progression);
      await initPractice(getWorkspacePath(), prompt);
      setSessionReady(true);
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: t('practice.yuukiLoaded'),
        timestamp: Date.now(),
      });
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: t('common.startFailed', { error: err }),
        timestamp: Date.now(),
      });
    }
  }, [initPractice, addMessage, t]);

  const startAnimaTutor = useCallback(async (
    character: { name: string; source: string; intro: string },
    subject: string,
    extra: string,
  ) => {
    setPhase('animatutor-generating');
    setProtocolLabel(`AnimaTutor · ${character.name}`);
    try {
      const prompt = await loadAnimaTutorTemplate(character, subject, extra);
      await initPractice(getWorkspacePath(), prompt);
      setSessionReady(true);

      // Send the initial trigger message to generate the protocol
      const triggerMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: '请根据上面的模板和用户输入，生成完整的辅导协议。',
        timestamp: Date.now(),
      };
      addMessage(triggerMsg);
      await sendPractice(triggerMsg.text);
      setPhase('active');
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: t('common.startFailed', { error: err }),
        timestamp: Date.now(),
      });
      setPhase('select');
    }
  }, [initPractice, addMessage, sendPractice]);

  // ---------- Chat Handlers ----------

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
    navigate('/');
  };

  // ---------- Render ----------

  // Selection & setup phases: full-screen overlay (no sidebar / chat chrome)
  if (phase !== 'active' && phase !== 'animatutor-generating') {
    return (
      <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
        <header className="flex h-12 shrink-0 items-center border-b border-border-light px-4 dark:border-border-dark">
          <button
            onClick={() => navigate('/')}
            className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
          >
            {t('common.back')}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {phase === 'select' && (
            <ProtocolSelectScreen
              onSelect={(protocol) => setPhase(protocol === 'yuuki' ? 'yuuki-setup' : 'animatutor-wizard')}
            />
          )}
          {phase === 'yuuki-setup' && (
            <YuukiSetupScreen onStart={startYuuki} onBack={() => setPhase('select')} />
          )}
          {phase === 'animatutor-wizard' && (
            <AnimaTutorWizard onGenerate={startAnimaTutor} onBack={() => setPhase('select')} />
          )}
        </div>
      </div>
    );
  }

  // Generating phase: full-screen loading spinner
  if (phase === 'animatutor-generating') {
    return (
      <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
        <header className="flex h-12 shrink-0 items-center border-b border-border-light px-4 dark:border-border-dark">
          <span className="text-aux text-text-sub dark:text-text-placeholder">🎭 AnimaTutor</span>
        </header>
        <GeneratingScreen />
      </div>
    );
  }

  // Active phase: 3-column chat layout (original)
  return (
    <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-light px-4 dark:border-border-dark">
        <button
          onClick={() => navigate('/')}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          {t('common.back')}
        </button>
        <span className="text-aux font-medium text-text-main dark:text-text-main-dark">
          {t('practice.protocolLabelPractice', { label: protocolLabel })}
        </span>
        <div className="flex gap-2">
          {messages.length > 2 && (
            <button
              onClick={() => navigate('/notes')}
              className="rounded-btn border border-border-light px-3 py-1.5 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark dark:hover:bg-slate-700"
            >
              {t('practice.notes')}
            </button>
          )}
          <button
            onClick={handleEnd}
            className="rounded-btn bg-danger px-4 py-1.5 text-aux font-medium text-white hover:bg-red-600"
          >
            {t('practice.endPractice')}
          </button>
        </div>
      </header>

      {/* Two-column layout: chat + canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — practice info */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-border-light bg-bg-light p-4 dark:border-border-dark dark:bg-slate-850">
          <h3 className="mb-3 text-tag tracking-[0.04em] font-medium uppercase tracking-wider text-text-placeholder">
            {t('practice.practiceInfo')}
          </h3>
          <div className="space-y-2 text-aux text-text-sub dark:text-text-main-dark">
            <div className="rounded-btn bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <p className="font-medium">{t('practice.protocol')}</p>
              <p className="text-text-placeholder">{protocolLabel}</p>
            </div>
            <div className="rounded-btn bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <p className="font-medium">{t('practice.guidanceMethod')}</p>
              <p className="text-text-placeholder">{t('practice.socraticMethod')}</p>
            </div>
            <div className="rounded-btn bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <p className="font-medium">{t('practice.status')}</p>
              <p className={sessionReady ? 'text-green-500' : 'text-warning'}>
                {sessionReady ? t('practice.statusReady') : t('practice.statusInitializing')}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-tag tracking-[0.04em] font-medium uppercase tracking-wider text-text-placeholder">
              {t('practice.usageTitle')}
            </h3>
            <div className="space-y-1 text-tag tracking-[0.04em] text-text-placeholder">
              <p>{t('practice.usage1')}</p>
              <p>{t('practice.usage2')}</p>
              <p>{t('practice.usage3')}</p>
              <p>{t('practice.usage4')}</p>
            </div>
          </div>
        </aside>

        {/* Center — chat */}
        <main className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-text-placeholder dark:text-text-sub">
                  {t('practice.initializingPractice')}
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

        {/* Right panel — canvas + log tabs */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-border-light dark:border-border-dark">
          <div className="flex h-10 shrink-0 border-b border-border-light dark:border-border-dark">
            <button
              onClick={() => setRightPanel('canvas')}
              className={`flex-1 text-tag tracking-[0.04em] font-medium ${
                rightPanel === 'canvas'
                  ? 'border-b-2 border-blue-500 text-primary'
                  : 'text-text-placeholder hover:text-text-sub'
              }`}
            >
              {t('practice.canvasTab')}
            </button>
            <button
              onClick={() => setRightPanel('log')}
              className={`flex-1 text-tag tracking-[0.04em] font-medium ${
                rightPanel === 'log'
                  ? 'border-b-2 border-blue-500 text-primary'
                  : 'text-text-placeholder hover:text-text-sub'
              }`}
            >
              {t('practice.logTab')}
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
