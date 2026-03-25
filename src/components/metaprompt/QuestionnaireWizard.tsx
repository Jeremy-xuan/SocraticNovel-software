import { useState, useCallback } from 'react';
import type { MetaPromptQuestionnaire } from '../../types';
import StepSubject from './StepSubject';
import StepCharacters from './StepCharacters';
import StepWorld from './StepWorld';
import StepStory from './StepStory';
import StepReview from './StepReview';

const STEPS = [
  { id: 1, label: '基础信息', icon: '📋' },
  { id: 2, label: '角色创建', icon: '🎭' },
  { id: 3, label: '世界观', icon: '🌍' },
  { id: 4, label: '故事设计', icon: '📖' },
  { id: 5, label: '确认总览', icon: '✅' },
];

const DEFAULT_QUESTIONNAIRE: MetaPromptQuestionnaire = {
  subject: { subjectName: '', textbook: '', textbookFormat: 'pdf', hasWorkbook: false },
  course: { totalChapters: 0, completedChapters: '', learningPeriod: '', topicOverview: '' },
  characterCount: 2,
  characters: [],
  world: {
    location: '', locationStyle: 'enclosed',
    arrivalReason: '', arrivalType: 'self-sought',
    characterRelations: '', supernaturalElement: '', hasSupernatural: false,
  },
  story: {
    emotionalTemplate: 'four-stage',
    emotionalPhases: [
      { name: '初期 — 距离', coveragePercent: '前25%', tone: '各占各的空间，教学是交易' },
      { name: '中期 — 裂隙', coveragePercent: '25-60%', tone: '距离在缩短但没人承认' },
      { name: '后期 — 重力', coveragePercent: '60-85%', tone: '在意藏不住' },
      { name: '备考期 — 沉淀', coveragePercent: '最后15%', tone: '离别的影子' },
    ],
    rotationStyle: 'round-robin',
    rotationNotes: '',
    enableGroupChat: true,
    groupChatName: '',
    groupChatStyle: '纯文字 + 偶尔 emoji',
    keyEvents: '',
  },
};

interface Props {
  onComplete: (data: MetaPromptQuestionnaire) => void;
  onBack: () => void;
}

export default function QuestionnaireWizard({ onComplete, onBack }: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<MetaPromptQuestionnaire>(DEFAULT_QUESTIONNAIRE);

  const updateData = useCallback((partial: Partial<MetaPromptQuestionnaire>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const canNext = (): boolean => {
    switch (step) {
      case 1: return !!data.subject.subjectName && data.course.totalChapters > 0;
      case 2: return data.characters.length === data.characterCount
              && data.characters.every(c => !!c.name && !!c.teachingStyle);
      case 3: return !!data.world.location;
      case 4: return data.story.emotionalPhases.length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
    else onComplete(data);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
    else onBack();
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      {/* Left sidebar — step indicator */}
      <div className="flex w-56 flex-col border-r border-slate-200 bg-white/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
        <h2 className="mb-6 text-lg font-bold text-slate-800 dark:text-slate-100">
          🔨 创建教学系统
        </h2>
        <div className="space-y-2">
          {STEPS.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                s.id === step
                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : s.id < step
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <span className="text-base">{s.id < step ? '✅' : s.icon}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto">
          <button
            onClick={onBack}
            className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ← 返回首页
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-2xl">
            {step === 1 && <StepSubject data={data} onChange={updateData} />}
            {step === 2 && <StepCharacters data={data} onChange={updateData} />}
            {step === 3 && <StepWorld data={data} onChange={updateData} />}
            {step === 4 && <StepStory data={data} onChange={updateData} />}
            {step === 5 && <StepReview data={data} />}
          </div>
        </div>

        {/* Bottom nav */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-8 py-4 dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={handlePrev}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            ← {step === 1 ? '返回' : '上一步'}
          </button>
          <span className="text-sm text-slate-400">
            {step} / {STEPS.length}
          </span>
          <button
            onClick={handleNext}
            disabled={!canNext()}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {step === 5 ? '🚀 开始生成' : '下一步 →'}
          </button>
        </div>
      </div>
    </div>
  );
}
