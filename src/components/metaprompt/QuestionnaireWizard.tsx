import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire } from '../../types';
import StepSubject from './StepSubject';
import StepCharacters from './StepCharacters';
import StepWorld from './StepWorld';
import StepStory from './StepStory';
import StepReview from './StepReview';

const STEPS = [
  { id: 1, labelKey: 'wizard.stepBasicInfo', icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg> },
  { id: 2, labelKey: 'wizard.stepCharacters', icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg> },
  { id: 3, labelKey: 'wizard.stepWorld', icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg> },
  { id: 4, labelKey: 'wizard.stepStory', icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg> },
  { id: 5, labelKey: 'wizard.stepReview', icon: <svg className="inline-block h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
];

const DEFAULT_QUESTIONNAIRE: MetaPromptQuestionnaire = {
  subject: { subjectName: '', textbook: '', textbookFormat: 'pdf', hasWorkbook: false },
  course: { totalChapters: 0, completedChapters: '', learningPeriod: '', topicOverview: '', uploadedMaterials: [] },
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
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<MetaPromptQuestionnaire>(DEFAULT_QUESTIONNAIRE);
  const [showNoMaterialWarning, setShowNoMaterialWarning] = useState(false);

  const updateData = useCallback((partial: Partial<MetaPromptQuestionnaire>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const canNext = (): boolean => {
    switch (step) {
      case 1: return !!data.subject.subjectName && data.course.totalChapters > 0;
      case 2: return data.characters.length === data.characterCount
              && data.characters.every(c => !!c.name && !!c.teachingStyle);
      case 3: return !!data.world.locationStyle;
      case 4: return data.story.emotionalPhases.length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step === 4 && data.course.uploadedMaterials.length === 0 && !data.course.topicOverview.trim()) {
      setShowNoMaterialWarning(true);
      return;
    }
    setShowNoMaterialWarning(false);
    if (step < 5) setStep(step + 1);
    else onComplete(data);
  };

  const handleConfirmNoMaterial = () => {
    setShowNoMaterialWarning(false);
    setStep(5);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
    else onBack();
  };

  return (
    <div className="flex h-screen bg-bg-light dark:bg-bg-dark">
      {/* Left sidebar — step indicator */}
      <div className="flex w-56 flex-col border-r border-border-light bg-surface-light/50 p-6 dark:border-border-dark dark:bg-surface-dark/50">
        <h2 className="mb-6 text-subtitle font-medium text-text-main dark:text-text-main-dark">
          {t('wizard.createSystem')}
        </h2>
        <div className="space-y-2">
          {STEPS.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-btn px-3 py-2 text-aux transition-colors ${
                s.id === step
                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : s.id < step
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-text-placeholder dark:text-text-sub'
              }`}
            >
              <span className="text-base">{s.id < step ? <svg className="inline-block h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : s.icon}</span>
              <span>{t(s.labelKey)}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto">
          <button
            onClick={onBack}
            className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
          >
            {t('wizard.backToHome')}
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
        <div className="flex items-center justify-between border-t border-border-light bg-surface-light px-8 py-4 dark:border-border-dark dark:bg-surface-dark">
          <button
            onClick={handlePrev}
            className="rounded-btn border border-border-light px-5 py-2.5 text-aux font-medium text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark dark:hover:bg-slate-700"
          >
            {step === 1 ? t('common.back') : t('common.prev')}
          </button>
          <span className="text-aux text-text-placeholder">
            {step} / {STEPS.length}
          </span>
          <button
            onClick={handleNext}
            disabled={!canNext()}
            className="rounded-btn bg-primary px-6 py-2.5 text-aux font-medium text-white hover:bg-[#BF6A4E] disabled:opacity-40 h-[38px]"
          >
            {step === 5 ? t('wizard.startGenerate') : t('common.next')}
          </button>
        </div>
      </div>

      {/* No-material warning modal */}
      {showNoMaterialWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 max-w-md rounded-card border border-border-light bg-surface-light p-6 shadow-xl dark:border-border-dark dark:bg-surface-dark">
            <div className="mb-3"><svg className="inline-block h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg></div>
            <h3 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              {t('wizard.noMaterialWarningTitle')}
            </h3>
            <p className="mb-5 text-aux text-text-sub dark:text-text-placeholder">
              {t('wizard.noMaterialWarningDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNoMaterialWarning(false); setStep(1); }}
                className="flex-1 rounded-btn bg-primary px-4 py-2.5 text-aux font-medium text-white hover:bg-[#BF6A4E]"
              >
                {t('wizard.goUploadMaterial')}
              </button>
              <button
                onClick={handleConfirmNoMaterial}
                className="rounded-btn border border-border-light px-4 py-2.5 text-aux text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark dark:hover:bg-slate-700"
              >
                {t('wizard.continueAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
