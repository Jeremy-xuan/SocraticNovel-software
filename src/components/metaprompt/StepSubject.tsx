import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaPromptQuestionnaire, UploadedMaterial } from '../../types';
import { extractPdfText, aiVisionEnhancePage } from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { open } from '@tauri-apps/plugin-dialog';

const IconFile = () => (
  <svg className="inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);
const IconSpinner = () => (
  <svg className="inline h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const IconPaperclip = () => (
  <svg className="inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
  </svg>
);
const IconWarning = () => (
  <svg className="inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

// Providers that support Vision API
const VISION_PROVIDERS = new Set(['github', 'openai', 'google', 'anthropic']);

interface Props {
  data: MetaPromptQuestionnaire;
  onChange: (partial: Partial<MetaPromptQuestionnaire>) => void;
}

export default function StepSubject({ data, onChange }: Props) {
  const { subject, course, characterCount } = data;
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [garbledFiles, setGarbledFiles] = useState<string[]>([]);
  const [ocrProcessing, setOcrProcessing] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number } | null>(null);

  const visionAvailable = VISION_PROVIDERS.has(settings.aiProvider);

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

  const handleUploadPdf = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];
      setUploading(true);
      setUploadError(null);

      const newMaterials: UploadedMaterial[] = [];
      const newGarbled: string[] = [];
      for (const filePath of files) {
        const extracted = await extractPdfText(filePath);
        newMaterials.push({
          originalName: extracted.filename,
          sourcePath: filePath,
          savedPath: '',
          pageCount: extracted.total_pages,
        });
        if (extracted.isGarbled) {
          newGarbled.push(extracted.filename);
        }
      }
      setCourse({ uploadedMaterials: [...course.uploadedMaterials, ...newMaterials] });
      if (newGarbled.length > 0) {
        setGarbledFiles(prev => [...prev, ...newGarbled]);
      }
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveMaterial = (index: number) => {
    const updated = course.uploadedMaterials.filter((_, i) => i !== index);
    setCourse({ uploadedMaterials: updated });
  };

  // Best vision model per provider (cheapest with vision capability)
  const VISION_MODEL: Record<string, string> = {
    github: 'gpt-4.1',
    openai: 'gpt-4o',
    google: 'gemini-3-flash-preview',
    anthropic: 'claude-haiku-4-5-20251001',
  };

  const handleAiVisionOcr = async (filename: string) => {
    const material = course.uploadedMaterials.find(m => m.originalName === filename);
    if (!material) return;

    const provider = settings.aiProvider;
    if (!VISION_PROVIDERS.has(provider)) {
      setUploadError(t('stepSubject.aiVisionNoProvider'));
      return;
    }

    try {
      setOcrProcessing(filename);
      const { getApiKey } = await import('../../lib/tauri');
      const apiKey = await getApiKey(provider);
      if (!apiKey) {
        setUploadError(t('stepSubject.aiVisionNoApiKey'));
        return;
      }

      const model = VISION_MODEL[provider] ?? 'gpt-4o';
      const totalPages = material.pageCount;
      const pageTexts: string[] = [];

      for (let page = 1; page <= totalPages; page++) {
        setOcrProgress({ current: page, total: totalPages });
        const text = await aiVisionEnhancePage(material.sourcePath, page, apiKey, provider, model);
        pageTexts.push(text);
      }

      const fullText = pageTexts.join('\n\n---\n\n');
      // Store enhanced text in material — will be written to workspace after creation
      const updated = course.uploadedMaterials.map(m =>
        m.originalName === filename ? { ...m, enhancedText: fullText } : m
      );
      setCourse({ uploadedMaterials: updated });
      setGarbledFiles(prev => prev.filter(f => f !== filename));
    } catch (err) {
      setUploadError(`AI Vision OCR failed: ${String(err)}`);
    } finally {
      setOcrProcessing(null);
      setOcrProgress(null);
    }
  };

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

      {/* Upload materials */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-text-main dark:text-text-main-dark">{t('stepSubject.uploadMaterials')}</h3>
        <p className="text-tag tracking-[0.04em] text-text-placeholder">{t('stepSubject.uploadMaterialsDesc')}</p>

        {course.uploadedMaterials.length > 0 && (
          <div className="space-y-2">
            {course.uploadedMaterials.map((mat, i) => (
              <div key={i} className="flex items-center justify-between rounded-btn border border-border-light bg-bg-light px-4 py-2.5 dark:border-slate-600 dark:bg-slate-700">
                <div className="flex items-center gap-2">
                  <IconFile />
                  <span className="text-aux text-text-main dark:text-text-main-dark">{mat.originalName}</span>
                  <span className="text-tag tracking-[0.04em] text-text-placeholder">
                    {t('stepSubject.pageCount', { count: mat.pageCount })}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveMaterial(i)}
                  className="text-tag text-red-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleUploadPdf}
          disabled={uploading}
          className="flex items-center gap-2 rounded-btn border-2 border-dashed border-border-light px-5 py-3 text-aux text-text-sub transition-colors hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-50 dark:border-slate-600 dark:text-text-placeholder dark:hover:border-blue-500 dark:hover:bg-blue-900/10"
        >
          {uploading ? (
            <><IconSpinner /> {t('stepSubject.uploadingPdf')}</>
          ) : (
            <><IconPaperclip /> {t('stepSubject.selectPdfFiles')}</>
          )}
        </button>

        {uploadError && (
          <p className="text-tag text-red-500 dark:text-red-400">{uploadError}</p>
        )}

        {garbledFiles.length > 0 && (
          <div className="rounded-btn border border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/20">
            <div className="mb-2 flex items-center gap-2 text-aux font-medium text-amber-700 dark:text-amber-300">
              <IconWarning /> {t('stepSubject.garbledWarningTitle')}
            </div>
            <p className="mb-2 text-tag tracking-[0.04em] text-amber-600 dark:text-amber-400">
              {visionAvailable
                ? t('stepSubject.aiVisionSuggestion')
                : t('stepSubject.aiVisionNoProvider')}
            </p>
            <ul className="mb-2 space-y-1 text-tag text-amber-600 dark:text-amber-400">
              {garbledFiles.map((name, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="flex items-center gap-1 truncate"><IconFile /> {name}</span>
                  {visionAvailable && (
                    <button
                      onClick={() => handleAiVisionOcr(name)}
                      disabled={ocrProcessing !== null}
                      className="ml-2 shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {ocrProcessing === name
                        ? (ocrProgress
                            ? `${ocrProgress.current}/${ocrProgress.total}`
                            : t('stepSubject.aiVisionProcessing', { current: '…', total: '…' }))
                        : t('stepSubject.aiVisionConfirm')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {ocrProcessing && ocrProgress && (
              <div className="mb-2">
                <div className="mb-1 flex justify-between text-[11px] text-amber-600 dark:text-amber-400">
                  <span>{t('stepSubject.aiVisionProcessing', { current: ocrProgress.current, total: ocrProgress.total })}</span>
                  <span>{Math.round(ocrProgress.current / ocrProgress.total * 100)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {!visionAvailable && (
              <p className="text-tag tracking-[0.04em] text-amber-600 dark:text-amber-400">
                {t('stepSubject.garbledWarningHint')}
              </p>
            )}
          </div>
        )}
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
