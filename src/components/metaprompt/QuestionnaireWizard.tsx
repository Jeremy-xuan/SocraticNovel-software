import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire } from '../../types';
import StepSubject from './StepSubject';
import StepCharacters from './StepCharacters';
import StepWorld from './StepWorld';
import StepStory from './StepStory';
import StepReview from './StepReview';

const STEPS = [
  { id: 1, labelKey: 'wizard.stepBasicInfo', icon: '📋' },
  { id: 2, labelKey: 'wizard.stepCharacters', icon: '🎭' },
  { id: 3, labelKey: 'wizard.stepWorld', icon: '🌍' },
  { id: 4, labelKey: 'wizard.stepStory', icon: '📖' },
  { id: 5, labelKey: 'wizard.stepReview', icon: '✅' },
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
      case 3: return !!data.world.location;
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
              <span className="text-base">{s.id < step ? '✅' : s.icon}</span>
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
            <div className="mb-3 text-2xl">⚠️</div>
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
