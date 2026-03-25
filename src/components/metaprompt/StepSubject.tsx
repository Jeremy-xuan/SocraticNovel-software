import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire } from '../../types';

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

export default function StepSubject({ data, onChange }: Props) {
  const { subject, course, characterCount } = data;
  const { t } = useTranslation();

  const formatOptions = [
    { value: 'pdf', label: t('stepSubject.formatPdf') },
    { value: 'paper', label: t('stepSubject.formatPaper') },
    { value: 'ebook', label: t('stepSubject.formatEbook') },
    { value: 'none', label: t('stepSubject.formatNone') },
  ] as const;

  const charCountOptions = [
    { value: 1, label: t('stepSubject.charCount1'), desc: t('stepSubject.charCount1Desc') },
    { value: 2, label: t('stepSubject.charCount2'), desc: t('stepSubject.charCount2Desc') },
    { value: 3, label: t('stepSubject.charCount3'), desc: t('stepSubject.charCount3Desc') },
  ] as const;

  const setSubject = (partial: Partial<typeof subject>) =>
    onChange({ subject: { ...subject, ...partial } });

  const setCourse = (partial: Partial<typeof course>) =>
    onChange({ course: { ...course, ...partial } });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">{t('stepSubject.title')}</h2>
        <p className="text-aux text-text-sub">{t('stepSubject.desc')}</p>
      </div>

      {/* Subject */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepSubject.subjectAndTextbook')}</h3>
        <div>
          <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">
            {t('stepSubject.subjectName')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={subject.subjectName}
            onChange={e => setSubject({ subjectName: e.target.value })}
            placeholder={t('stepSubject.subjectPlaceholder')}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </div>
        <div>
          <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">
            {t('stepSubject.textbookName')}
          </label>
          <input
            type="text"
            value={subject.textbook}
            onChange={e => setSubject({ textbook: e.target.value })}
            placeholder={t('stepSubject.textbookPlaceholder')}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">{t('stepSubject.textbookFormat')}</label>
            <div className="flex flex-wrap gap-2">
              {formatOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSubject({ textbookFormat: opt.value })}
                  className={`rounded-full border px-3 py-1.5 text-tag tracking-[0.04em] font-medium transition-colors ${
                    subject.textbookFormat === opt.value
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'border-border-light text-text-sub hover:border-border-light dark:border-slate-600 dark:text-text-placeholder'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-aux text-text-sub dark:text-text-main-dark">
              <input
                type="checkbox"
                checked={subject.hasWorkbook}
                onChange={e => setSubject({ hasWorkbook: e.target.checked })}
                className="rounded"
              />
              {t('stepSubject.hasWorkbook')}
            </label>
          </div>
        </div>
      </section>

      {/* Course structure */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepSubject.courseStructure')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">
              {t('stepSubject.totalChapters')} <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={course.totalChapters || ''}
              onChange={e => setCourse({ totalChapters: parseInt(e.target.value) || 0 })}
              placeholder={t('stepSubject.totalChaptersPlaceholder')}
              className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
            />
          </div>
          <div>
            <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">{t('stepSubject.learningPeriod')}</label>
            <input
              type="text"
              value={course.learningPeriod}
              onChange={e => setCourse({ learningPeriod: e.target.value })}
              placeholder={t('stepSubject.learningPeriodPlaceholder')}
              className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">
            {t('stepSubject.completedChapters')}
          </label>
          <input
            type="text"
            value={course.completedChapters}
            onChange={e => setCourse({ completedChapters: e.target.value })}
            placeholder={t('stepSubject.completedChaptersPlaceholder')}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </div>
        <div>
          <label className="mb-1 block text-aux font-medium text-text-sub dark:text-text-main-dark">{t('stepSubject.topicOverview')}</label>
          <textarea
            value={course.topicOverview}
            onChange={e => setCourse({ topicOverview: e.target.value })}
            placeholder={t('stepSubject.topicOverviewPlaceholder')}
            rows={3}
            className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
          />
        </div>
      </section>

      {/* Character count */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepSubject.characterCount')}</h3>
        <div className="grid grid-cols-3 gap-3">
          {charCountOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange({
                characterCount: opt.value as 1 | 2 | 3,
                characters: data.characters.slice(0, opt.value),
              })}
              className={`rounded-card border p-4 text-left transition-colors ${
                characterCount === opt.value
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                  : 'border-border-light hover:border-border-light dark:border-slate-600 dark:hover:border-slate-500'
              }`}
            >
              <div className="mb-1 text-subtitle font-medium text-text-main dark:text-text-main-dark">{opt.label}</div>
              <div className="text-tag tracking-[0.04em] text-text-sub dark:text-text-placeholder">{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
