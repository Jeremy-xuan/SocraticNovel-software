import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import {
  extractPdfText,
  importPdfToWorkspace,
  checkPdfRenderer,
  renderPdfPage,
  aiEnhanceText,
  aiVisionEnhancePage,
  getApiKey,
} from '../lib/tauri';
import { PROVIDER_MODELS } from '../lib/providerModels';
import { open } from '@tauri-apps/plugin-dialog';
import type { PdfExtractResult } from '../types';

type Phase = 'select' | 'extracting' | 'preview' | 'enhancing' | 'saving' | 'done';
type EnhanceMode = 'none' | 'text' | 'vision';

// Inline SVG icons to replace emoji
const IconDocument = ({ className = "w-12 h-12" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);
const IconSpinner = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const IconWarning = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);
const IconEye = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconSparkles = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
  </svg>
);
const IconSave = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={`animate-pulse ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);
const IconCheck = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export default function PdfImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useAppStore();
  const wsPath = settings.currentWorkspacePath;

  const [phase, setPhase] = useState<Phase>('select');
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [result, setResult] = useState<PdfExtractResult | null>(null);
  const [targetName, setTargetName] = useState('');
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);

  // AI enhancement
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>('none');
  const [enhanceModel, setEnhanceModel] = useState(settings.aiModel || '');
  const [rendererAvailable, setRendererAvailable] = useState(false);
  const [rendererName, setRendererName] = useState('none');
  const [enhancedPages, setEnhancedPages] = useState<Map<number, string>>(new Map());
  const [enhanceProgress, setEnhanceProgress] = useState({ current: 0, total: 0 });
  const [pagePreviewImage, setPagePreviewImage] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const availableModels = PROVIDER_MODELS[settings.aiProvider] ?? [];
  const currentModelLabel = availableModels.find(m => m.id === enhanceModel)?.label
    ?? availableModels.find(m => m.default)?.label
    ?? enhanceModel;

  useEffect(() => {
    checkPdfRenderer().then((info) => {
      setRendererAvailable(info.available);
      setRendererName(info.renderer);
    }).catch(() => {
      setRendererAvailable(false);
      setRendererName('none');
    });
  }, []);

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!selected) return;

      const filePath = typeof selected === 'string' ? selected : selected;
      setPdfPath(filePath);
      setPhase('extracting');
      setError(null);
      setEnhancedPages(new Map());

      const extracted = await extractPdfText(filePath);
      setResult(extracted);
      setTargetName(extracted.filename.replace(/\.pdf$/i, ''));
      setPreviewPage(0);
      setPhase('preview');

      // Auto-detect garbled text and suggest Vision OCR
      if (extracted.isGarbled && rendererAvailable) {
        setEnhanceMode('vision');
      }
    } catch (err) {
      setError(String(err));
      setPhase('select');
    }
  };

  const handlePreviewPageImage = async () => {
    if (!pdfPath || !rendererAvailable) return;
    try {
      const pageNum = (result?.pages[previewPage]?.page_number) ?? previewPage + 1;
      const b64 = await renderPdfPage(pdfPath, pageNum);
      setPagePreviewImage(b64);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleAiEnhance = async () => {
    if (!pdfPath || !result) return;

    const apiKey = await getApiKey(settings.aiProvider);
    if (!apiKey) {
      setError(t('pdfImport.noApiKeyGuide', { provider: settings.aiProvider }));
      return;
    }

    const model = enhanceModel || settings.aiModel || '';
    setPhase('enhancing');
    setEnhanceProgress({ current: 0, total: result.pages.length });
    const newEnhanced = new Map<number, string>();

    for (let i = 0; i < result.pages.length; i++) {
      setEnhanceProgress({ current: i + 1, total: result.pages.length });
      try {
        let enhanced: string;
        if (enhanceMode === 'vision' && rendererAvailable) {
          enhanced = await aiVisionEnhancePage(
            pdfPath,
            result.pages[i].page_number,
            apiKey,
            settings.aiProvider,
            model,
          );
        } else {
          enhanced = await aiEnhanceText(
            result.pages[i].text,
            apiKey,
            settings.aiProvider,
            model,
          );
        }
        newEnhanced.set(i, enhanced);
      } catch (err) {
        newEnhanced.set(i, `<!-- ${t('pdfImport.aiFailed', { error: err })} -->\n\n${result.pages[i].text}`);
      }
    }

    setEnhancedPages(newEnhanced);
    setPhase('preview');
  };

  const handleImport = async () => {
    if (!wsPath || !pdfPath || !targetName.trim() || !result) return;
    try {
      setPhase('saving');

      if (enhancedPages.size > 0) {
        // Save enhanced version
        const targetDir = 'materials/imported_md';
        const safeName = targetName.replace(/[\/\\:*?"<>|]/g, '_');
        const filename = safeName.endsWith('.md') ? safeName : `${safeName}.md`;

        let markdown = `# ${result.filename.replace(/\.pdf$/i, '')}\n\n`;
        markdown += `> ${t('pdfImport.aiConvertNote', { mode: enhanceMode === 'vision' ? t('pdfImport.modeVisionApi') : t('pdfImport.modeTextOptimize'), pages: result.pages.length })}\n\n`;

        for (let i = 0; i < result.pages.length; i++) {
          const content = enhancedPages.get(i) || result.pages[i].text;
          markdown += `---\n\n## ${t('pdfImport.pageHeader', { page: result.pages[i].page_number })}\n\n${content}\n\n`;
        }

        // Write via importPdfToWorkspace won't work for enhanced content,
        // so we use the basic text import approach
        const { writeFile } = await import('../lib/tauri');
        await writeFile(wsPath, `${targetDir}/${filename}`, markdown);
        setSavedPath(`${wsPath}/${targetDir}/${filename}`);
      } else {
        const path = await importPdfToWorkspace(pdfPath, wsPath, targetName);
        setSavedPath(path);
      }
      setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('preview');
    }
  };

  const currentPage = result?.pages[previewPage];
  const enhancedContent = enhancedPages.get(previewPage);

  return (
    <div className="flex h-screen flex-col bg-bg-light dark:bg-bg-dark">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border-light px-6 py-3 dark:border-border-dark">
        <button
          onClick={() => navigate('/')}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          {t('pdfImport.back')}
        </button>
        <h1 className="text-subtitle font-medium text-text-main dark:text-text-main-dark">
          {t('pdfImport.title')}
        </h1>
        <div className="w-16" />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 rounded-btn bg-red-50 px-4 py-2 text-aux text-danger dark:bg-red-900/30 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t('common.close')}
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-hidden">
        {/* Select phase */}
        {phase === 'select' && (
          <div className="text-center">
            <div className="mb-6 text-text-placeholder dark:text-text-main-dark"><IconDocument className="mx-auto h-16 w-16" /></div>
            <h2 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              {t('pdfImport.importTitle')}
            </h2>
            <p className="mb-8 text-aux text-text-sub dark:text-text-placeholder">
              {t('pdfImport.importDesc')}
            </p>
            <button
              onClick={handleSelectFile}
              className="rounded-full bg-primary px-8 py-3.5 text-[16px] font-medium tracking-wide text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:opacity-90"
            >
              {t('pdfImport.selectFile')}
            </button>
          </div>
        )}

        {/* Extracting */}
        {phase === 'extracting' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center text-primary"><IconSpinner className="h-8 w-8" /></div>
            <p className="text-subtitle text-text-sub dark:text-text-main-dark">{t('pdfImport.extracting')}</p>
            <p className="mt-1 text-aux text-text-placeholder">{pdfPath}</p>
          </div>
        )}

        {/* Preview */}
        {phase === 'preview' && result && (
          <div className="flex w-full max-w-5xl flex-1 flex-col overflow-hidden px-6 pb-6">
            {/* Info bar */}
            <div className="mb-4 flex items-center justify-between rounded-card bg-surface-light p-4 shadow-card dark:bg-surface-dark">
              <div>
                <p className="text-aux font-medium text-text-main dark:text-text-main-dark">
                  {result.filename}
                </p>
                <p className="text-tag tracking-[0.04em] text-text-placeholder">
                  {t('pdfImport.pageInfo', { pages: result.total_pages, chars: (result.fullText.length / 1000).toFixed(1) })}
                  {enhancedPages.size > 0 && (
                    <span className="ml-2 text-green-500">{t('pdfImport.aiEnhanced')}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-tag tracking-[0.04em] text-text-sub">{t('pdfImport.saveAs')}</label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-48 rounded-btn border border-border-light bg-bg-light px-3 py-1.5 text-aux caret-text-main outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark dark:caret-white"
                />
                <span className="text-tag tracking-[0.04em] text-text-placeholder">.md</span>
              </div>
            </div>

            {/* Garbled text warning */}
            {result.isGarbled && (
              <div className="mb-3 flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-900/20">
                <IconWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div className="flex-1">
                  <p className="text-aux font-medium text-amber-700 dark:text-amber-300">
                    {t('pdfImport.garbledDetected')}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                    {t('pdfImport.garbledSuggestion')}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-800 dark:text-amber-200">
                  {t('pdfImport.qualityScore', { score: Math.round(result.qualityScore * 100) })}
                </span>
              </div>
            )}

            {/* AI Enhancement controls */}
            <div className="mb-3 rounded-card bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <div className="flex items-center gap-2">
                <span className="text-tag tracking-[0.04em] font-medium text-text-sub">{t('pdfImport.aiEnhance')}</span>
                <button
                  onClick={() => setEnhanceMode('none')}
                  className={`rounded-btn px-3 py-1 text-tag tracking-[0.04em] ${enhanceMode === 'none' ? 'bg-slate-600 text-white' : 'bg-bg-light text-text-sub dark:bg-slate-700 dark:text-text-main-dark'}`}
                >
                  {t('pdfImport.noEnhance')}
                </button>
                <button
                  onClick={() => setEnhanceMode('text')}
                  className={`rounded-btn px-3 py-1 text-tag tracking-[0.04em] ${enhanceMode === 'text' ? 'bg-primary text-white' : 'bg-bg-light text-text-sub dark:bg-slate-700 dark:text-text-main-dark'}`}
                >
                  {t('pdfImport.textOptimize')}
                </button>
                <button
                  onClick={() => setEnhanceMode('vision')}
                  disabled={!rendererAvailable}
                  className={`rounded-btn px-3 py-1 text-tag tracking-[0.04em] ${enhanceMode === 'vision' ? 'bg-purple-500 text-white' : 'bg-bg-light text-text-sub dark:bg-slate-700 dark:text-text-main-dark'} disabled:opacity-40`}
                  title={rendererAvailable ? t('pdfImport.visionApiTitle', { name: rendererName }) : t('pdfImport.visionUnavailable')}
                >
                  <IconEye className="inline h-3.5 w-3.5" /> Vision OCR
                </button>
                {enhanceMode !== 'none' && (
                  <button
                    onClick={handleAiEnhance}
                    className="ml-3 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium tracking-wide text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:opacity-90"
                  >
                    <IconSparkles className="h-3.5 w-3.5" /> {t('pdfImport.enhanceAll', { count: result.total_pages })}
                  </button>
                )}
                {rendererAvailable && (
                  <button
                    onClick={handlePreviewPageImage}
                    className="ml-auto rounded-btn border border-border-light px-3 py-1 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-placeholder"
                  >
                    {t('pdfImport.previewImages')}
                  </button>
                )}
              </div>
              {enhanceMode !== 'none' && (
                <div className="mt-2 flex items-center gap-3">
                  <p className="flex-1 text-[11px] leading-relaxed text-text-placeholder dark:text-text-placeholder">
                    {enhanceMode === 'text'
                      ? t('pdfImport.textOptimizeDesc')
                      : t('pdfImport.visionOcrDesc')}
                  </p>
                  <div className="relative shrink-0" ref={modelDropdownRef}>
                    <button
                      onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                      className="flex items-center gap-1.5 rounded-full border border-border-light bg-bg-light px-3 py-1 text-[11px] text-text-main transition-colors hover:border-primary/40 dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark dark:hover:border-primary/40"
                    >
                      <span className="max-w-[140px] truncate">{currentModelLabel}</span>
                      <svg className={`h-3 w-3 text-text-placeholder transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {modelDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setModelDropdownOpen(false)} />
                        <div className="absolute right-0 top-full z-20 mt-1 max-h-52 w-56 overflow-auto rounded-card border border-border-light bg-surface-light py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
                          {availableModels.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => { setEnhanceModel(m.id); setModelDropdownOpen(false); }}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-primary/5 dark:hover:bg-primary/10 ${m.id === enhanceModel ? 'text-primary font-medium' : 'text-text-main dark:text-text-main-dark'}`}
                            >
                              {m.id === enhanceModel && <span className="text-[10px]">✓</span>}
                              <span className={m.id === enhanceModel ? '' : 'ml-4'}>{m.label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Page navigation */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => { setPreviewPage(Math.max(0, previewPage - 1)); setPagePreviewImage(null); }}
                  disabled={previewPage === 0}
                  className="rounded-btn border border-border-light px-3 py-1 text-aux text-text-sub hover:bg-bg-light disabled:opacity-40 dark:border-slate-600 dark:text-text-main-dark"
                >
                  {t('pdfImport.prevPage')}
                </button>
                <span className="flex items-center text-aux text-text-sub">
                  {t('pdfImport.pageOf', { current: previewPage + 1, total: result.total_pages })}
                </span>
                <button
                  onClick={() => { setPreviewPage(Math.min(result.total_pages - 1, previewPage + 1)); setPagePreviewImage(null); }}
                  disabled={previewPage >= result.total_pages - 1}
                  className="rounded-btn border border-border-light px-3 py-1 text-aux text-text-sub hover:bg-bg-light disabled:opacity-40 dark:border-slate-600 dark:text-text-main-dark"
                >
                  {t('pdfImport.nextPage')}
                </button>
              </div>
              <button
                onClick={handleImport}
                disabled={!targetName.trim()}
                className="rounded-card bg-green-500 px-6 py-2 text-aux font-medium text-white shadow transition-all hover:bg-green-600 disabled:opacity-50"
              >
                {t('pdfImport.importToWorkspace')}
              </button>
            </div>

            {/* Content area */}
            <div className="flex flex-1 gap-4 overflow-hidden">
              {/* Text preview */}
              <div className={`flex-1 overflow-auto rounded-card border border-border-light bg-surface-light p-6 font-mono text-aux leading-relaxed text-text-main dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark ${enhancedContent ? 'w-1/2' : ''}`}>
                <div className="mb-2 text-tag tracking-[0.04em] font-medium text-text-placeholder">
                  {enhancedContent ? t('pdfImport.rawExtracted') : t('pdfImport.extractedText')}
                </div>
                {currentPage ? (
                  <pre className="whitespace-pre-wrap">{currentPage.text}</pre>
                ) : (
                  <p className="text-text-placeholder">{t('pdfImport.noTextContent')}</p>
                )}
              </div>

              {/* Enhanced content (side by side) */}
              {enhancedContent && (
                <div className="flex-1 overflow-auto rounded-card border border-green-200 bg-surface-light p-6 text-aux leading-relaxed text-text-main dark:border-green-800 dark:bg-surface-dark dark:text-text-main-dark">
                  <div className="mb-2 text-tag tracking-[0.04em] font-medium text-green-500">{t('pdfImport.aiEnhancedLabel')}</div>
                  <pre className="whitespace-pre-wrap font-sans">{enhancedContent}</pre>
                </div>
              )}

              {/* Page image preview */}
              {pagePreviewImage && (
                <div className="w-80 overflow-auto rounded-card border border-border-light bg-surface-light p-2 dark:border-border-dark dark:bg-surface-dark">
                  <div className="mb-1 text-tag tracking-[0.04em] font-medium text-text-placeholder">{t('pdfImport.pageRender')}</div>
                  <img
                    src={`data:image/jpeg;base64,${pagePreviewImage}`}
                    alt={`Page ${previewPage + 1}`}
                    className="w-full rounded"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Enhancing */}
        {phase === 'enhancing' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center text-primary"><IconSparkles className="h-8 w-8 animate-pulse" /></div>
            <p className="text-subtitle text-text-sub dark:text-text-main-dark">
              {t('pdfImport.enhancing', { mode: enhanceMode === 'vision' ? t('pdfImport.enhanceModeVision') : t('pdfImport.enhanceModeText') })}
            </p>
            <p className="mt-2 text-aux text-text-sub">
              {t('pdfImport.enhanceProgress', { current: enhanceProgress.current, total: enhanceProgress.total })}
            </p>
            <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-bg-light dark:bg-bg-dark"
                style={{ width: `${enhanceProgress.total > 0 ? (enhanceProgress.current / enhanceProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Saving */}
        {phase === 'saving' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center text-primary"><IconSave className="h-8 w-8" /></div>
            <p className="text-subtitle text-text-sub dark:text-text-main-dark">{t('pdfImport.saving')}</p>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center text-green-500"><IconCheck className="h-10 w-10" /></div>
            <h2 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              {t('pdfImport.importSuccess')}
            </h2>
            <p className="mb-1 text-aux text-text-sub dark:text-text-placeholder">
              {t('pdfImport.savedAsMarkdown')}
              {enhancedPages.size > 0 && t('pdfImport.savedWithAi')}
            </p>
            {savedPath && (
              <p className="mb-6 max-w-md break-all text-tag tracking-[0.04em] text-text-placeholder">{savedPath}</p>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  setPhase('select');
                  setResult(null);
                  setPdfPath(null);
                  setSavedPath(null);
                  setTargetName('');
                  setEnhancedPages(new Map());
                  setPagePreviewImage(null);
                }}
                className="rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium tracking-wide text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:opacity-90"
              >
                {t('pdfImport.continueImport')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="rounded-card border border-border-light px-6 py-3 text-aux text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark"
              >
                {t('pdfImport.returnHome')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
