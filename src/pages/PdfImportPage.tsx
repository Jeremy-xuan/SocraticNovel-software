import { useState, useEffect } from 'react';
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
import { open } from '@tauri-apps/plugin-dialog';
import type { PdfExtractResult } from '../types';

type Phase = 'select' | 'extracting' | 'preview' | 'enhancing' | 'saving' | 'done';
type EnhanceMode = 'none' | 'text' | 'vision';

export default function PdfImportPage() {
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
  const [rendererAvailable, setRendererAvailable] = useState(false);
  const [rendererName, setRendererName] = useState('none');
  const [enhancedPages, setEnhancedPages] = useState<Map<number, string>>(new Map());
  const [enhanceProgress, setEnhanceProgress] = useState({ current: 0, total: 0 });
  const [pagePreviewImage, setPagePreviewImage] = useState<string | null>(null);

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
      setError('请先在设置中配置 API Key');
      return;
    }

    const model = settings.aiModel || '';
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
        newEnhanced.set(i, `<!-- AI 增强失败: ${err} -->\n\n${result.pages[i].text}`);
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
        markdown += `> AI 增强转换（${enhanceMode === 'vision' ? 'Vision API' : '文本优化'}），共 ${result.pages.length} 页\n\n`;

        for (let i = 0; i < result.pages.length; i++) {
          const content = enhancedPages.get(i) || result.pages[i].text;
          markdown += `---\n\n## 第 ${result.pages[i].page_number} 页\n\n${content}\n\n`;
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
          ← 返回主页
        </button>
        <h1 className="text-subtitle font-medium text-text-main dark:text-text-main-dark">
          📄 PDF 教材导入
        </h1>
        <div className="w-16" />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 rounded-btn bg-red-50 px-4 py-2 text-aux text-danger dark:bg-red-900/30 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            关闭
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-hidden">
        {/* Select phase */}
        {phase === 'select' && (
          <div className="text-center">
            <div className="mb-6 text-6xl">📄</div>
            <h2 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              导入 PDF 教材
            </h2>
            <p className="mb-8 text-aux text-text-sub dark:text-text-placeholder">
              选择 PDF 文件，自动提取文本并转换为 Markdown 存入 workspace
            </p>
            <button
              onClick={handleSelectFile}
              className="rounded-full bg-primary px-8 py-3.5 text-[16px] font-medium tracking-wide text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:opacity-90"
            >
              选择 PDF 文件
            </button>
          </div>
        )}

        {/* Extracting */}
        {phase === 'extracting' && (
          <div className="text-center">
            <div className="mb-4 text-title leading-tight tracking-[0.04em] animate-pulse">⏳</div>
            <p className="text-subtitle text-text-sub dark:text-text-main-dark">正在提取 PDF 文本...</p>
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
                  {result.total_pages} 页 · {(result.fullText.length / 1000).toFixed(1)}K 字符
                  {enhancedPages.size > 0 && (
                    <span className="ml-2 text-green-500">✨ AI 已增强</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-tag tracking-[0.04em] text-text-sub">保存为：</label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-48 rounded-btn border border-border-light bg-bg-light px-3 py-1.5 text-aux dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
                />
                <span className="text-tag tracking-[0.04em] text-text-placeholder">.md</span>
              </div>
            </div>

            {/* AI Enhancement controls */}
            <div className="mb-3 flex items-center gap-2 rounded-card bg-surface-light p-3 shadow-card dark:bg-surface-dark">
              <span className="text-tag tracking-[0.04em] font-medium text-text-sub">AI 增强：</span>
              <button
                onClick={() => setEnhanceMode('none')}
                className={`rounded-btn px-3 py-1 text-tag tracking-[0.04em] ${enhanceMode === 'none' ? 'bg-slate-600 text-white' : 'bg-bg-light text-text-sub dark:bg-slate-700 dark:text-text-main-dark'}`}
              >
                不使用
              </button>
              <button
                onClick={() => setEnhanceMode('text')}
                className={`rounded-btn px-3 py-1 text-tag tracking-[0.04em] ${enhanceMode === 'text' ? 'bg-primary text-white' : 'bg-bg-light text-text-sub dark:bg-slate-700 dark:text-text-main-dark'}`}
              >
                📝 文本优化
              </button>
              <button
                onClick={() => setEnhanceMode('vision')}
                disabled={!rendererAvailable}
                className={`rounded-btn px-3 py-1 text-tag tracking-[0.04em] ${enhanceMode === 'vision' ? 'bg-purple-500 text-white' : 'bg-bg-light text-text-sub dark:bg-slate-700 dark:text-text-main-dark'} disabled:opacity-40`}
                title={rendererAvailable ? `Vision API 逐页识别 (${rendererName})` : '需要安装 PDFium 或 poppler'}
              >
                👁️ Vision OCR
              </button>
              {enhanceMode !== 'none' && (
                <button
                  onClick={handleAiEnhance}
                  className="ml-3 flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium tracking-wide text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:opacity-90"
                >
                  <span className="text-[14px]">✨</span> 操作所有 {result.total_pages} 页
                </button>
              )}
              {rendererAvailable && (
                <button
                  onClick={handlePreviewPageImage}
                  className="ml-auto rounded-btn border border-border-light px-3 py-1 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-placeholder"
                >
                  🖼️ 预览页面图片
                </button>
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
                  ← 上一页
                </button>
                <span className="flex items-center text-aux text-text-sub">
                  第 {previewPage + 1} / {result.total_pages} 页
                </span>
                <button
                  onClick={() => { setPreviewPage(Math.min(result.total_pages - 1, previewPage + 1)); setPagePreviewImage(null); }}
                  disabled={previewPage >= result.total_pages - 1}
                  className="rounded-btn border border-border-light px-3 py-1 text-aux text-text-sub hover:bg-bg-light disabled:opacity-40 dark:border-slate-600 dark:text-text-main-dark"
                >
                  下一页 →
                </button>
              </div>
              <button
                onClick={handleImport}
                disabled={!targetName.trim()}
                className="rounded-card bg-green-500 px-6 py-2 text-aux font-medium text-white shadow transition-all hover:bg-green-600 disabled:opacity-50"
              >
                ✅ 导入到 Workspace
              </button>
            </div>

            {/* Content area */}
            <div className="flex flex-1 gap-4 overflow-hidden">
              {/* Text preview */}
              <div className={`flex-1 overflow-auto rounded-card border border-border-light bg-surface-light p-6 font-mono text-aux leading-relaxed text-text-main dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark ${enhancedContent ? 'w-1/2' : ''}`}>
                <div className="mb-2 text-tag tracking-[0.04em] font-medium text-text-placeholder">
                  {enhancedContent ? '原始提取' : '提取文本'}
                </div>
                {currentPage ? (
                  <pre className="whitespace-pre-wrap">{currentPage.text}</pre>
                ) : (
                  <p className="text-text-placeholder">该页无文本内容</p>
                )}
              </div>

              {/* Enhanced content (side by side) */}
              {enhancedContent && (
                <div className="flex-1 overflow-auto rounded-card border border-green-200 bg-surface-light p-6 text-aux leading-relaxed text-text-main dark:border-green-800 dark:bg-surface-dark dark:text-text-main-dark">
                  <div className="mb-2 text-tag tracking-[0.04em] font-medium text-green-500">✨ AI 增强</div>
                  <pre className="whitespace-pre-wrap font-sans">{enhancedContent}</pre>
                </div>
              )}

              {/* Page image preview */}
              {pagePreviewImage && (
                <div className="w-80 overflow-auto rounded-card border border-border-light bg-surface-light p-2 dark:border-border-dark dark:bg-surface-dark">
                  <div className="mb-1 text-tag tracking-[0.04em] font-medium text-text-placeholder">🖼️ 页面渲染</div>
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
            <div className="mb-4 text-title leading-tight tracking-[0.04em] animate-pulse">✨</div>
            <p className="text-subtitle text-text-sub dark:text-text-main-dark">
              AI {enhanceMode === 'vision' ? 'Vision' : '文本'} 增强中...
            </p>
            <p className="mt-2 text-aux text-text-sub">
              第 {enhanceProgress.current} / {enhanceProgress.total} 页
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
            <div className="mb-4 text-title leading-tight tracking-[0.04em] animate-pulse">💾</div>
            <p className="text-subtitle text-text-sub dark:text-text-main-dark">正在保存到 workspace...</p>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="text-center">
            <div className="mb-4 text-title leading-tight tracking-[0.04em]">✅</div>
            <h2 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              导入成功！
            </h2>
            <p className="mb-1 text-aux text-text-sub dark:text-text-placeholder">
              已保存为 Markdown 文件
              {enhancedPages.size > 0 && ' (AI 增强版)'}
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
                继续导入
              </button>
              <button
                onClick={() => navigate('/')}
                className="rounded-card border border-border-light px-6 py-3 text-aux text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-main-dark"
              >
                返回主页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
