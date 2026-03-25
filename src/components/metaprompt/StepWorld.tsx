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
    { value: 'enclosed', label: t('stepWorld.enclosed'), icon: '🏔️', examples: t('stepWorld.enclosedExamples') },
    { value: 'semi-open', label: t('stepWorld.semiOpen'), icon: '🏡', examples: t('stepWorld.semiOpenExamples') },
    { value: 'everyday', label: t('stepWorld.everyday'), icon: '🏙️', examples: t('stepWorld.everydayExamples') },
    { value: 'custom', label: t('stepWorld.custom'), icon: '✨', examples: t('stepWorld.customExamples') },
  ] as const;

  const arrivalTypes = [
    { value: 'arranged', label: t('stepWorld.arranged'), desc: t('stepWorld.arrangedDesc'), icon: '📋' },
    { value: 'self-sought', label: t('stepWorld.selfSought'), desc: t('stepWorld.selfSoughtDesc'), icon: '🔍' },
    { value: 'accidental', label: t('stepWorld.accidental'), desc: t('stepWorld.accidentalDesc'), icon: '🎲' },
  ] as const;

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
