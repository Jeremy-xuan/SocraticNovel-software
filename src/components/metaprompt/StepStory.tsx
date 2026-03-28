import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire, StoryMode } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

export default function StepStory({ data, onChange }: Props) {
  const { story, storyMode } = data;
  const { t } = useTranslation();

  const setStory = (partial: Partial<typeof story>) =>
    onChange({ story: { ...story, ...partial } });

  const setMode = (mode: StoryMode) => onChange({ storyMode: mode });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepStory.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepStory.desc')}</p>
      </div>

      {/* Mode selector */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepStory.modeLabel')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('standard')}
            className={`rounded-card border p-4 text-left transition-colors ${
              storyMode === 'standard'
                ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                : 'border-border-light dark:border-slate-600'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" /></svg>
              <span className="font-medium text-text-main dark:text-text-main-dark">{t('stepStory.modeStandard')}</span>
            </div>
            <div className="text-tag tracking-[0.04em] text-text-sub">{t('stepStory.modeStandardDesc')}</div>
          </button>
          <button
            onClick={() => setMode('novel')}
            className={`rounded-card border p-4 text-left transition-colors ${
              storyMode === 'novel'
                ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                : 'border-border-light dark:border-slate-600'
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
              <span className="font-medium text-text-main dark:text-text-main-dark">{t('stepStory.modeNovel')}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Beta</span>
            </div>
            <div className="text-tag tracking-[0.04em] text-text-sub">{t('stepStory.modeNovelDesc')}</div>
          </button>
        </div>
      </section>

      {/* Novel mode: story reference */}
      {storyMode === 'novel' && (
        <section className="space-y-4">
          <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepStory.storyReference')}</h3>
          <p className="text-tag tracking-[0.04em] text-text-sub">{t('stepStory.storyReferenceHint')}</p>
          <textarea
            value={story.storyReference}
            onChange={e => setStory({ storyReference: e.target.value })}
            placeholder={t('stepStory.storyReferencePlaceholder')}
            rows={4}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </section>
      )}

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

      {/* Key events — novel mode only */}
      {storyMode === 'novel' && (
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
      )}
    </div>
  );
}
