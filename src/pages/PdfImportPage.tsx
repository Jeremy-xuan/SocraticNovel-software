import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { extractPdfText, importPdfToWorkspace } from '../lib/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import type { PdfExtractResult } from '../types';

type Phase = 'select' | 'extracting' | 'preview' | 'saving' | 'done';

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

  const handleImport = async () => {
    if (!wsPath || !pdfPath || !targetName.trim()) return;
    try {
      setPhase('saving');
      const path = await importPdfToWorkspace(pdfPath, wsPath, targetName);
      setSavedPath(path);
      setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('preview');
    }
  };

  const currentPage = result?.pages[previewPage];

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
          <div className="flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-6 pb-6">
            {/* Info bar */}
            <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {result.filename}
                </p>
                <p className="text-xs text-slate-400">
                  {result.total_pages} 页 · {(result.fullText.length / 1000).toFixed(1)}K 字符
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

            {/* Page navigation */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewPage(Math.max(0, previewPage - 1))}
                  disabled={previewPage === 0}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
                >
                  ← 上一页
                </button>
                <span className="flex items-center text-sm text-slate-500">
                  第 {previewPage + 1} / {result.total_pages} 页
                </span>
                <button
                  onClick={() => setPreviewPage(Math.min(result.total_pages - 1, previewPage + 1))}
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

            {/* Text preview */}
            <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-6 font-mono text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {currentPage ? (
                <pre className="whitespace-pre-wrap">{currentPage.text}</pre>
              ) : (
                <p className="text-slate-400">该页无文本内容</p>
              )}
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
