import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire, EmotionalPhase } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

const DEFAULT_FOUR_STAGES: EmotionalPhase[] = [
  { name: '初期 — 距离', coveragePercent: '前25%', tone: '各占各的空间，教学是交易。节奏慢，日常占比高' },
  { name: '中期 — 裂隙', coveragePercent: '25-60%', tone: '距离在缩短但没人承认。过往碎片渗出' },
  { name: '后期 — 重力', coveragePercent: '60-85%', tone: '在意藏不住。教学的耐心本身就是情感' },
  { name: '备考期 — 沉淀', coveragePercent: '最后15%', tone: '离别的影子。所有积累沉淀' },
];

export default function StepStory({ data, onChange }: Props) {
  const { story } = data;
  const { t } = useTranslation();

  const setStory = (partial: Partial<typeof story>) =>
    onChange({ story: { ...story, ...partial } });

  const updatePhase = (idx: number, partial: Partial<EmotionalPhase>) => {
    const phases = [...story.emotionalPhases];
    phases[idx] = { ...phases[idx], ...partial };
    setStory({ emotionalPhases: phases });
  };

  const addPhase = () => {
    setStory({
      emotionalPhases: [...story.emotionalPhases, { name: '', coveragePercent: '', tone: '' }],
    });
  };

  const removePhase = (idx: number) => {
    setStory({ emotionalPhases: story.emotionalPhases.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepStory.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepStory.desc')}</p>
      </div>

      {/* Emotional phases */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepStory.emotionalPhases')}</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setStory({ emotionalTemplate: 'four-stage', emotionalPhases: DEFAULT_FOUR_STAGES })}
              className={`rounded-full border px-3 py-1 text-tag tracking-[0.04em] font-medium ${
                story.emotionalTemplate === 'four-stage'
                  ? 'border-blue-300 bg-blue-50 text-primary dark:border-blue-600 dark:bg-blue-900/30'
                  : 'border-border-light text-text-sub dark:border-slate-600'
              }`}
            >
              {t('stepStory.fourStageTemplate')}
            </button>
            <button
              onClick={() => setStory({ emotionalTemplate: 'custom' })}
              className={`rounded-full border px-3 py-1 text-tag tracking-[0.04em] font-medium ${
                story.emotionalTemplate === 'custom'
                  ? 'border-blue-300 bg-blue-50 text-primary dark:border-blue-600 dark:bg-blue-900/30'
                  : 'border-border-light text-text-sub dark:border-slate-600'
              }`}
            >
              {t('stepStory.customTemplate')}
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {story.emotionalPhases.map((phase, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-btn border border-border-light bg-surface-light p-4 dark:border-slate-600 dark:bg-slate-700"
            >
              <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-light text-tag tracking-[0.04em] font-medium text-text-sub dark:bg-slate-600 dark:text-text-main-dark">
                {idx + 1}
              </span>
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={phase.name}
                    onChange={e => updatePhase(idx, { name: e.target.value })}
                    placeholder={t('stepStory.phaseNamePlaceholder')}
                    className="rounded border border-border-light px-3 py-1.5 text-aux dark:border-slate-500 dark:bg-slate-600 dark:text-text-main-dark"
                  />
                  <input
                    type="text"
                    value={phase.coveragePercent}
                    onChange={e => updatePhase(idx, { coveragePercent: e.target.value })}
                    placeholder={t('stepStory.coveragePlaceholder')}
                    className="rounded border border-border-light px-3 py-1.5 text-aux dark:border-slate-500 dark:bg-slate-600 dark:text-text-main-dark"
                  />
                </div>
                <input
                  type="text"
                  value={phase.tone}
                  onChange={e => updatePhase(idx, { tone: e.target.value })}
                  placeholder={t('stepStory.tonePlaceholder')}
                  className="w-full rounded border border-border-light px-3 py-1.5 text-aux dark:border-slate-500 dark:bg-slate-600 dark:text-text-main-dark"
                />
              </div>
              {story.emotionalTemplate === 'custom' && (
                <button
                  onClick={() => removePhase(idx)}
                  className="mt-1 text-aux text-red-400 hover:text-danger"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {story.emotionalTemplate === 'custom' && (
            <button
              onClick={addPhase}
              className="w-full rounded-btn border border-dashed border-border-light py-2 text-aux text-text-placeholder hover:border-slate-400 hover:text-text-sub dark:border-slate-600"
            >
              {t('stepStory.addPhase')}
            </button>
          )}
        </div>
      </section>

      {/* Rotation style */}
      {data.characterCount > 1 && (
        <section className="space-y-4">
          <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepStory.rotationStyle')}</h3>
          <p className="text-tag tracking-[0.04em] text-text-sub">{t('stepStory.rotationStyleHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStory({ rotationStyle: 'round-robin' })}
              className={`rounded-card border p-4 text-left ${
                story.rotationStyle === 'round-robin'
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-border-light dark:border-slate-600'
              }`}
            >
              <div className="text-aux font-medium text-text-main dark:text-text-main-dark">{t('stepStory.roundRobin')}</div>
              <div className="text-tag tracking-[0.04em] text-text-sub">{t('stepStory.roundRobinDesc')}</div>
            </button>
            <button
              onClick={() => setStory({ rotationStyle: 'thematic' })}
              className={`rounded-card border p-4 text-left ${
                story.rotationStyle === 'thematic'
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-border-light dark:border-slate-600'
              }`}
            >
              <div className="text-aux font-medium text-text-main dark:text-text-main-dark">{t('stepStory.thematic')}</div>
              <div className="text-tag tracking-[0.04em] text-text-sub">{t('stepStory.thematicDesc')}</div>
            </button>
          </div>
          <input
            type="text"
            value={story.rotationNotes}
            onChange={e => setStory({ rotationNotes: e.target.value })}
            placeholder={t('stepStory.rotationNotes')}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </section>
      )}

      {/* Group chat */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepStory.groupChat')}</h3>
          <label className="flex items-center gap-2 text-aux text-text-sub">
            <input
              type="checkbox"
              checked={story.enableGroupChat}
              onChange={e => setStory({ enableGroupChat: e.target.checked })}
              className="rounded"
            />
            {t('common.enable')}
          </label>
        </div>
        {story.enableGroupChat && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepStory.groupChatName')}</label>
              <input
                type="text"
                value={story.groupChatName}
                onChange={e => setStory({ groupChatName: e.target.value })}
                placeholder={t('stepStory.groupChatNamePlaceholder')}
                className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-tag tracking-[0.04em] font-medium text-text-sub">{t('stepStory.groupChatStyle')}</label>
              <input
                type="text"
                value={story.groupChatStyle}
                onChange={e => setStory({ groupChatStyle: e.target.value })}
                placeholder={t('stepStory.groupChatStylePlaceholder')}
                className="w-full rounded-btn border border-border-light bg-surface-light px-3 py-2 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              />
            </div>
          </div>
        )}
      </section>

      {/* Key events */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepStory.keyEvents')}</h3>
        <p className="text-tag tracking-[0.04em] text-text-sub">
          {t('stepStory.keyEventsHint')}
        </p>
        <textarea
          value={story.keyEvents}
          onChange={e => setStory({ keyEvents: e.target.value })}
          placeholder={t('stepStory.keyEventsPlaceholder')}
          rows={4}
          className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
        />
      </section>
    </div>
  );
}
