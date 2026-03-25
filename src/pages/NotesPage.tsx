import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useAppStore } from '../stores/appStore';
import { generateLessonNotes, generateAnkiCards } from '../lib/ai';
import { getApiKey } from '../lib/tauri';
import { exportNotesPdf, type NoteStyle } from '../lib/notesTemplates';

interface AnkiCard {
  front: string;
  back: string;
  tags: string;
}

function parseTsvCards(tsv: string): AnkiCard[] {
  return tsv
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.includes('\t'))
    .map((line) => {
      const parts = line.split('\t');
      return {
        front: parts[0] || '',
        back: parts[1] || '',
        tags: parts[2] || '',
      };
    });
}

async function pushToAnkiConnect(cards: AnkiCard[], deckName: string): Promise<{ success: number; failed: number }> {
  const notes = cards.map((card) => ({
    deckName,
    modelName: 'Basic',
    fields: { Front: card.front, Back: card.back },
    tags: card.tags.split(/\s+/).filter(Boolean),
  }));

  try {
    const response = await fetch('http://127.0.0.1:8765', {
      method: 'POST',
      body: JSON.stringify({
        action: 'addNotes',
        version: 6,
        params: { notes },
      }),
    });
    const data = await response.json();
    const results = data.result || [];
    const success = results.filter((r: unknown) => r !== null).length;
    return { success, failed: results.length - success };
  } catch {
    throw new Error('ANKI_CONNECT_ERROR');
  }
}

export default function NotesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { canvasItems } = useAppStore();
  const [notes, setNotes] = useState<string | null>(null);
  const [ankiCards, setAnkiCards] = useState<AnkiCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [ankiLoading, setAnkiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ankiStatus, setAnkiStatus] = useState<string | null>(null);
  const [pdfStyle, setPdfStyle] = useState<NoteStyle>('journal');
  const [showStylePicker, setShowStylePicker] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = useAppStore.getState().settings;
      const apiKey = await getApiKey(settings.aiProvider);
      if (!apiKey) {
        setError(t('notes.configApiKeyFirst'));
        setLoading(false);
        return;
      }
      const markdown = await generateLessonNotes({ apiKey });
      setNotes(markdown);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = (style?: NoteStyle) => {
    if (!notesRef.current) return;
    const contentHtml = notesRef.current.querySelector('article')?.innerHTML || '';
    exportNotesPdf(contentHtml, style || pdfStyle);
    setShowStylePicker(false);
  };

  const handleCopyMarkdown = () => {
    if (notes) {
      navigator.clipboard.writeText(notes);
    }
  };

  const handleGenerateAnki = async () => {
    setAnkiLoading(true);
    setAnkiStatus(null);
    try {
      const settings = useAppStore.getState().settings;
      const apiKey = await getApiKey(settings.aiProvider);
      if (!apiKey) {
        setAnkiStatus(t('notes.ankiConfigApiKey'));
        setAnkiLoading(false);
        return;
      }
      const tsv = await generateAnkiCards({ apiKey });
      const cards = parseTsvCards(tsv);
      setAnkiCards(cards);
      setAnkiStatus(t('notes.ankiGenerated', { count: cards.length }));
    } catch (err) {
      setAnkiStatus(`❌ ${err}`);
    } finally {
      setAnkiLoading(false);
    }
  };

  const handleDownloadTsv = () => {
    if (ankiCards.length === 0) return;
    const tsv = ankiCards.map((c) => `${c.front}\t${c.back}\t${c.tags}`).join('\n');
    const blob = new Blob([tsv], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki-cards-${new Date().toISOString().slice(0, 10)}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePushAnkiConnect = async () => {
    if (ankiCards.length === 0) return;
    setAnkiStatus(t('notes.ankiPushing'));
    try {
      const result = await pushToAnkiConnect(ankiCards, 'SocraticNovel::AP_Physics_EM');
      setAnkiStatus(t('notes.ankiPushResult', { success: result.success, failed: result.failed }));
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('ANKI_CONNECT_ERROR')) {
        setAnkiStatus(`❌ ${t('notes.ankiConnectError')}`);
      } else {
        setAnkiStatus(`❌ ${err}`);
      }
    }
  };

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
      {/* Header — hidden when printing */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-light px-4 dark:border-border-dark print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          {t('notes.back')}
        </button>
        <span className="text-aux font-medium text-text-main dark:text-text-main-dark">
          {t('notes.title')}
        </span>
        <div className="flex gap-2">
          {notes && (
            <>
              <button
                onClick={handleCopyMarkdown}
                className="rounded-btn border border-border-light px-3 py-1.5 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark dark:hover:bg-slate-700"
              >
                {t('notes.copyMarkdown')}
              </button>
              <button
                onClick={() => handleExportPdf()}
                className="rounded-btn bg-primary px-3 py-1.5 text-tag tracking-[0.04em] font-medium text-white hover:bg-[#BF6A4E] h-[38px]"
                title={t('notes.exportPdfTitle')}
              >
                {t('notes.exportPdf')}
              </button>
              {/* Style picker dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStylePicker(!showStylePicker)}
                  className="rounded-btn border border-border-light px-2 py-1.5 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-placeholder"
                  title={t('notes.selectPdfStyle')}
                >
                  🎨
                </button>
                {showStylePicker && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-btn border border-border-light bg-surface-light shadow-lg dark:border-slate-600 dark:bg-surface-dark z-50">
                    <button
                      onClick={() => { setPdfStyle('journal'); setShowStylePicker(false); handleExportPdf('journal'); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-tag tracking-[0.04em] hover:bg-bg-light dark:hover:bg-slate-700 ${pdfStyle === 'journal' ? 'text-primary font-medium' : 'text-text-sub dark:text-text-main-dark'}`}
                    >
                      {t('notes.styleHandwritten')}
                      <span className="ml-auto text-[10px] text-text-placeholder">{t('notes.styleHandwrittenDesc')}</span>
                    </button>
                    <button
                      onClick={() => { setPdfStyle('minimal'); setShowStylePicker(false); handleExportPdf('minimal'); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-tag tracking-[0.04em] hover:bg-bg-light dark:hover:bg-slate-700 border-t border-slate-100 dark:border-border-dark ${pdfStyle === 'minimal' ? 'text-primary font-medium' : 'text-text-sub dark:text-text-main-dark'}`}
                    >
                      {t('notes.styleMinimal')}
                      <span className="ml-auto text-[10px] text-text-placeholder">{t('notes.styleMinimalDesc')}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!notes && !loading && !error && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-center">
              <p className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
                {t('notes.generateDesc')}
              </p>
              <p className="mb-6 text-aux text-text-placeholder">
                {t('notes.generateHint')}
              </p>
            </div>
            <button
              onClick={handleGenerate}
              className="rounded-btn bg-primary px-6 py-3 text-aux font-medium text-white shadow-card hover:bg-[#BF6A4E] transition-colors h-[38px]"
            >
              {t('notes.generateNotes')}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-aux text-text-sub animate-pulse">
              {t('notes.generatingNotes')}
            </p>
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-aux text-danger">❌ {error}</p>
            <button
              onClick={handleGenerate}
              className="rounded-btn bg-primary px-4 py-2 text-aux text-white hover:bg-[#BF6A4E] h-[38px]"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {notes && (
          <div ref={notesRef} className="mx-auto max-w-3xl px-8 py-8 print:max-w-none print:px-12 print:py-0">
            {/* Title — visible in both screen and print */}
            <div className="mb-8 border-b border-border-light pb-6 dark:border-border-dark print:border-black">
              <h1 className="text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark print:text-black">
                {t('notes.notesTitle')}
              </h1>
              <p className="mt-1 text-aux text-text-placeholder print:text-text-sub">{today}</p>
            </div>

            {/* Rendered Markdown */}
            <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-medium prose-h2:mt-8 prose-h2:border-b prose-h2:border-border-light prose-h2:pb-2 prose-h3:mt-6 prose-code:before:content-none prose-code:after:content-none print:prose-print">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {notes}
              </ReactMarkdown>
            </article>

            {/* Canvas diagrams if any */}
            {canvasItems.length > 0 && (
              <div className="mt-10 border-t border-border-light pt-6 dark:border-border-dark">
                <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
                  {t('notes.canvasDiagrams')}
                </h2>
                <div className="grid gap-4">
                  {canvasItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-btn border border-border-light bg-surface-light p-4 dark:border-border-dark dark:bg-surface-dark"
                    >
                      {item.title && (
                        <p className="mb-2 text-aux font-medium text-text-sub dark:text-text-main-dark">
                          {item.title}
                        </p>
                      )}
                      <div
                        className="svg-container"
                        dangerouslySetInnerHTML={{ __html: item.content }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anki Cards Section */}
            <div className="mt-10 border-t border-border-light pt-6 dark:border-border-dark print:hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-subtitle font-medium text-text-main dark:text-text-main-dark">
                  {t('notes.ankiFlashcards')}
                </h2>
                <div className="flex gap-2">
                  {ankiCards.length > 0 && (
                    <>
                      <button
                        onClick={handleDownloadTsv}
                        className="rounded-btn border border-border-light px-3 py-1.5 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark"
                      >
                        {t('notes.downloadTsv')}
                      </button>
                      <button
                        onClick={handlePushAnkiConnect}
                        className="rounded-btn border border-emerald-200 px-3 py-1.5 text-tag tracking-[0.04em] text-success hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400"
                      >
                        {t('notes.pushToAnki')}
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleGenerateAnki}
                    disabled={ankiLoading}
                    className="rounded-btn bg-emerald-600 px-3 py-1.5 text-tag tracking-[0.04em] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {ankiLoading ? t('notes.generatingAnki') : t('notes.generateAnki')}
                  </button>
                </div>
              </div>

              {ankiStatus && (
                <p className="mb-3 text-tag tracking-[0.04em] text-text-sub">{ankiStatus}</p>
              )}

              {ankiCards.length > 0 && (
                <div className="grid gap-3">
                  {ankiCards.map((card, i) => (
                    <div
                      key={i}
                      className="rounded-btn border border-border-light bg-surface-light p-4 dark:border-border-dark dark:bg-surface-dark"
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-tag tracking-[0.04em] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          Q
                        </span>
                        <p className="text-aux text-text-main dark:text-text-main-dark">{card.front}</p>
                      </div>
                      <div className="mt-2 flex items-start gap-3">
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-tag tracking-[0.04em] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          A
                        </span>
                        <p className="text-aux text-text-sub dark:text-text-placeholder">{card.back}</p>
                      </div>
                      {card.tags && (
                        <div className="mt-2 ml-7">
                          {card.tags.split(/\s+/).filter(Boolean).map((tag, j) => (
                            <span
                              key={j}
                              className="mr-1 inline-block rounded bg-bg-light px-1.5 py-0.5 text-[10px] text-text-sub dark:bg-slate-700 dark:text-text-placeholder"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {ankiCards.length === 0 && !ankiLoading && (
                <p className="text-aux text-text-placeholder">
                  {t('notes.ankiHint')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
