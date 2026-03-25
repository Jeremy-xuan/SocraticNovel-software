import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import {
  extractPdfText,
  importPdfToWorkspace,
  checkPdftoppm,
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
  const [hasPdftoppm, setHasPdftoppm] = useState(false);
  const [enhancedPages, setEnhancedPages] = useState<Map<number, string>>(new Map());
  const [enhanceProgress, setEnhanceProgress] = useState({ current: 0, total: 0 });
  const [pagePreviewImage, setPagePreviewImage] = useState<string | null>(null);

  useEffect(() => {
    checkPdftoppm().then(setHasPdftoppm).catch(() => setHasPdftoppm(false));
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
    if (!pdfPath || !hasPdftoppm) return;
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
        if (enhanceMode === 'vision' && hasPdftoppm) {
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
    <div className="flex h-screen flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← 返回主页
        </button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          📄 PDF 教材导入
        </h1>
        <div className="w-16" />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
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
            <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
              导入 PDF 教材
            </h2>
            <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
              选择 PDF 文件，自动提取文本并转换为 Markdown 存入 workspace
            </p>
            <button
              onClick={handleSelectFile}
              className="rounded-2xl bg-blue-500 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-blue-600 hover:shadow-xl"
            >
              选择 PDF 文件
            </button>
          </div>
        )}

        {/* Extracting */}
        {phase === 'extracting' && (
          <div className="text-center">
            <div className="mb-4 text-4xl animate-pulse">⏳</div>
            <p className="text-lg text-slate-600 dark:text-slate-300">正在提取 PDF 文本...</p>
            <p className="mt-1 text-sm text-slate-400">{pdfPath}</p>
          </div>
        )}

        {/* Preview */}
        {phase === 'preview' && result && (
          <div className="flex w-full max-w-5xl flex-1 flex-col overflow-hidden px-6 pb-6">
            {/* Info bar */}
            <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {result.filename}
                </p>
                <p className="text-xs text-slate-400">
                  {result.total_pages} 页 · {(result.fullText.length / 1000).toFixed(1)}K 字符
                  {enhancedPages.size > 0 && (
                    <span className="ml-2 text-green-500">✨ AI 已增强</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-500">保存为：</label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">.md</span>
              </div>
            </div>

            {/* AI Enhancement controls */}
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800">
              <span className="text-xs font-medium text-slate-500">AI 增强：</span>
              <button
                onClick={() => setEnhanceMode('none')}
                className={`rounded-lg px-3 py-1 text-xs ${enhanceMode === 'none' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
              >
                不使用
              </button>
              <button
                onClick={() => setEnhanceMode('text')}
                className={`rounded-lg px-3 py-1 text-xs ${enhanceMode === 'text' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
              >
                📝 文本优化
              </button>
              <button
                onClick={() => setEnhanceMode('vision')}
                disabled={!hasPdftoppm}
                className={`rounded-lg px-3 py-1 text-xs ${enhanceMode === 'vision' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'} disabled:opacity-40`}
                title={hasPdftoppm ? 'Vision API 逐页识别' : '需要安装 poppler (brew install poppler)'}
              >
                👁️ Vision OCR
              </button>
              {enhanceMode !== 'none' && (
                <button
                  onClick={handleAiEnhance}
                  className="ml-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-1 text-xs font-medium text-white hover:from-blue-600 hover:to-purple-600"
                >
                  ✨ 开始 AI 增强 ({result.total_pages} 页)
                </button>
              )}
              {hasPdftoppm && (
                <button
                  onClick={handlePreviewPageImage}
                  className="ml-auto rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
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
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
                >
                  ← 上一页
                </button>
                <span className="flex items-center text-sm text-slate-500">
                  第 {previewPage + 1} / {result.total_pages} 页
                </span>
                <button
                  onClick={() => { setPreviewPage(Math.min(result.total_pages - 1, previewPage + 1)); setPagePreviewImage(null); }}
                  disabled={previewPage >= result.total_pages - 1}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
                >
                  下一页 →
                </button>
              </div>
              <button
                onClick={handleImport}
                disabled={!targetName.trim()}
                className="rounded-xl bg-green-500 px-6 py-2 text-sm font-semibold text-white shadow transition-all hover:bg-green-600 disabled:opacity-50"
              >
                ✅ 导入到 Workspace
              </button>
            </div>

            {/* Content area */}
            <div className="flex flex-1 gap-4 overflow-hidden">
              {/* Text preview */}
              <div className={`flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-6 font-mono text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 ${enhancedContent ? 'w-1/2' : ''}`}>
                <div className="mb-2 text-xs font-medium text-slate-400">
                  {enhancedContent ? '原始提取' : '提取文本'}
                </div>
                {currentPage ? (
                  <pre className="whitespace-pre-wrap">{currentPage.text}</pre>
                ) : (
                  <p className="text-slate-400">该页无文本内容</p>
                )}
              </div>

              {/* Enhanced content (side by side) */}
              {enhancedContent && (
                <div className="flex-1 overflow-auto rounded-xl border border-green-200 bg-white p-6 text-sm leading-relaxed text-slate-700 dark:border-green-800 dark:bg-slate-800 dark:text-slate-300">
                  <div className="mb-2 text-xs font-medium text-green-500">✨ AI 增强</div>
                  <pre className="whitespace-pre-wrap font-sans">{enhancedContent}</pre>
                </div>
              )}

              {/* Page image preview */}
              {pagePreviewImage && (
                <div className="w-80 overflow-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-1 text-xs font-medium text-slate-400">🖼️ 页面渲染</div>
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
            <div className="mb-4 text-4xl animate-pulse">✨</div>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              AI {enhanceMode === 'vision' ? 'Vision' : '文本'} 增强中...
            </p>
            <p className="mt-2 text-sm text-slate-500">
              第 {enhanceProgress.current} / {enhanceProgress.total} 页
            </p>
            <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${enhanceProgress.total > 0 ? (enhanceProgress.current / enhanceProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Saving */}
        {phase === 'saving' && (
          <div className="text-center">
            <div className="mb-4 text-4xl animate-pulse">💾</div>
            <p className="text-lg text-slate-600 dark:text-slate-300">正在保存到 workspace...</p>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="text-center">
            <div className="mb-4 text-4xl">✅</div>
            <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
              导入成功！
            </h2>
            <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
              已保存为 Markdown 文件
              {enhancedPages.size > 0 && ' (AI 增强版)'}
            </p>
            {savedPath && (
              <p className="mb-6 max-w-md break-all text-xs text-slate-400">{savedPath}</p>
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
                className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600"
              >
                继续导入
              </button>
              <button
                onClick={() => navigate('/')}
                className="rounded-xl border border-slate-200 px-6 py-3 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
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
