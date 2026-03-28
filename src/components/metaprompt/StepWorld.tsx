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

  const arrivalTypes = [
    { value: 'arranged' as const, label: t('stepWorld.arranged'), desc: t('stepWorld.arrangedDesc'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg> },
    { value: 'self-sought' as const, label: t('stepWorld.selfSought'), desc: t('stepWorld.selfSoughtDesc'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg> },
    { value: 'accidental' as const, label: t('stepWorld.accidental'), desc: t('stepWorld.accidentalDesc'), icon: <svg className="inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg> },
  ];

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
        <div>
          <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">
            {t('stepWorld.locationDesc')} <span className="text-red-400">*</span>
          </label>
          <textarea
            value={world.location}
            onChange={e => setWorld({ location: e.target.value })}
            placeholder={t('stepWorld.locationPlaceholder')}
            rows={4}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </div>
      </section>

      {/* Arrival reason */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepWorld.arrivalQuestion')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {arrivalTypes.map(at => (
            <button
              key={at.value}
              onClick={() => setWorld({ arrivalType: at.value })}
              className={`rounded-card border p-4 text-left transition-colors ${
                world.arrivalType === at.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-border-light hover:border-border-light dark:border-slate-600'
              }`}
            >
              <div className="mb-1 text-subtitle">{at.icon}</div>
              <div className="text-aux font-medium text-text-main dark:text-text-main-dark">{at.label}</div>
              <div className="text-tag tracking-[0.04em] text-text-sub">{at.desc}</div>
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">{t('stepWorld.arrivalReason')}</label>
          <input
            type="text"
            value={world.arrivalReason}
            onChange={e => setWorld({ arrivalReason: e.target.value })}
            placeholder={t('stepWorld.arrivalReasonPlaceholder')}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </div>
      </section>

      {/* Character relations */}
      {data.characterCount > 1 && (
        <section className="space-y-4">
          <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepWorld.characterRelations')}</h3>
          <p className="text-tag tracking-[0.04em] text-text-sub">
            {t('stepWorld.characterRelationsHint')}
          </p>
          <textarea
            value={world.characterRelations}
            onChange={e => setWorld({ characterRelations: e.target.value })}
            placeholder={t('stepWorld.characterRelationsPlaceholder')}
            rows={3}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </section>
      )}

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
