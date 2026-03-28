import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

export default function StepWorld({ data, onChange }: Props) {
  const { world } = data;
  const { t } = useTranslation();

  const locationStyles = [
    { value: 'enclosed' as const, label: t('stepWorld.enclosed'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2 20l7.5-12L14 15l4-6 4 11H2z" /></svg>, examples: t('stepWorld.enclosedExamples') },
    { value: 'semi-open' as const, label: t('stepWorld.semiOpen'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>, examples: t('stepWorld.semiOpenExamples') },
    { value: 'everyday' as const, label: t('stepWorld.everyday'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18h6V3h-6zM14.25 3v18h6V3h-6zM6.75 6.75h.008v.008H6.75V6.75zm0 3h.008v.008H6.75v-.008zm0 3h.008v.008H6.75v-.008zm10.5-6h.008v.008h-.008V6.75zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>, examples: t('stepWorld.everydayExamples') },
    { value: 'custom' as const, label: t('stepWorld.custom'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>, examples: t('stepWorld.customExamples') },
  ];

  // arrivalTypes removed — AI will auto-generate based on characters + scene

  const setWorld = (partial: Partial<typeof world>) =>
    onChange({ world: { ...world, ...partial } });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepWorld.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepWorld.desc')}</p>
      </div>

      {/* Location style */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepWorld.locationQuestion')}</h3>
        <p className="text-tag tracking-[0.04em] text-text-sub">
          {t('stepWorld.locationHint')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {locationStyles.map(ls => (
            <button
              key={ls.value}
              onClick={() => setWorld({ locationStyle: ls.value })}
              className={`rounded-card border p-4 text-left transition-colors ${
                world.locationStyle === ls.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-border-light hover:border-border-light dark:border-slate-600'
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-subtitle">{ls.icon}</span>
                <span className="font-medium text-text-main dark:text-text-main-dark">{ls.label}</span>
              </div>
              <div className="text-tag tracking-[0.04em] text-text-sub">{ls.examples}</div>
            </button>
          ))}
        </div>
        <p className="text-tag tracking-[0.04em] text-text-sub">
          {t('stepWorld.locationAutoHint')}
        </p>
      </section>

      {/* Supernatural element */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepWorld.specialSettings')}</h3>
          <label className="flex items-center gap-2 text-aux text-text-sub">
            <input
              type="checkbox"
              checked={world.hasSupernatural}
              onChange={e => setWorld({ hasSupernatural: e.target.checked })}
              className="rounded"
            />
            {t('stepWorld.enableSupernatural')}
          </label>
        </div>
        {world.hasSupernatural && (
          <>
            <p className="text-tag tracking-[0.04em] text-text-sub">
              {t('stepWorld.supernaturalHint')}
            </p>
            <textarea
              value={world.supernaturalElement}
              onChange={e => setWorld({ supernaturalElement: e.target.value })}
              placeholder={t('stepWorld.supernaturalPlaceholder')}
              rows={3}
              className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
            />
          </>
        )}
      </section>
    </div>
  );
}
