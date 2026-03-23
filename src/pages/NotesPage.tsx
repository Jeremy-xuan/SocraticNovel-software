import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
    throw new Error('无法连接 AnkiConnect。请确保 Anki 已打开并安装了 AnkiConnect 插件。');
  }
}

export default function NotesPage() {
  const navigate = useNavigate();
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
        setError('请先在设置中配置 API Key');
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
        setAnkiStatus('❌ 请先配置 API Key');
        setAnkiLoading(false);
        return;
      }
      const tsv = await generateAnkiCards({ apiKey });
      const cards = parseTsvCards(tsv);
      setAnkiCards(cards);
      setAnkiStatus(`✅ 生成了 ${cards.length} 张卡片`);
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
    setAnkiStatus('⏳ 正在推送到 Anki…');
    try {
      const result = await pushToAnkiConnect(ankiCards, 'SocraticNovel::AP_Physics_EM');
      setAnkiStatus(`✅ 推送完成: ${result.success} 成功, ${result.failed} 失败`);
    } catch (err) {
      setAnkiStatus(`❌ ${err}`);
    }
  };

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-slate-900">
      {/* Header — hidden when printing */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-700 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← 返回
        </button>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          📝 学习笔记
        </span>
        <div className="flex gap-2">
          {notes && (
            <>
              <button
                onClick={handleCopyMarkdown}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                📋 复制 Markdown
              </button>
              <button
                onClick={() => handleExportPdf()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                title="使用当前风格导出 PDF"
              >
                📄 导出 PDF
              </button>
              {/* Style picker dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStylePicker(!showStylePicker)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
                  title="选择 PDF 风格"
                >
                  🎨
                </button>
                {showStylePicker && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 z-50">
                    <button
                      onClick={() => { setPdfStyle('journal'); setShowStylePicker(false); handleExportPdf('journal'); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 ${pdfStyle === 'journal' ? 'text-blue-600 font-medium' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                      ✒️ 手记风
                      <span className="ml-auto text-[10px] text-slate-400">手写字体 · 笔记本纸</span>
                    </button>
                    <button
                      onClick={() => { setPdfStyle('minimal'); setShowStylePicker(false); handleExportPdf('minimal'); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-700 border-t border-slate-100 dark:border-slate-700 ${pdfStyle === 'minimal' ? 'text-blue-600 font-medium' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                      📐 极简风
                      <span className="ml-auto text-[10px] text-slate-400">衬线标题 · 大留白</span>
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
              <p className="mb-2 text-lg font-medium text-slate-700 dark:text-slate-200">
                生成本次课堂的复习笔记
              </p>
              <p className="mb-6 text-sm text-slate-400">
                AI 将分析对话内容，提取核心概念、公式、解题方法和易错点
              </p>
            </div>
            <button
              onClick={handleGenerate}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-md hover:bg-blue-700 transition-colors"
            >
              📝 生成笔记
            </button>
          </div>
        )}

        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-500 animate-pulse">
              正在分析对话并生成笔记…（约 15-30 秒）
            </p>
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-sm text-red-500">❌ {error}</p>
            <button
              onClick={handleGenerate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              🔄 重试
            </button>
          </div>
        )}

        {notes && (
          <div ref={notesRef} className="mx-auto max-w-3xl px-8 py-8 print:max-w-none print:px-12 print:py-0">
            {/* Title — visible in both screen and print */}
            <div className="mb-8 border-b border-slate-200 pb-6 dark:border-slate-700 print:border-black">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 print:text-black">
                AP Physics C: E&M — 学习笔记
              </h1>
              <p className="mt-1 text-sm text-slate-400 print:text-gray-500">{today}</p>
            </div>

            {/* Rendered Markdown */}
            <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-semibold prose-h2:mt-8 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2 prose-h3:mt-6 prose-code:before:content-none prose-code:after:content-none print:prose-print">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {notes}
              </ReactMarkdown>
            </article>

            {/* Canvas diagrams if any */}
            {canvasItems.length > 0 && (
              <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-700">
                <h2 className="mb-4 text-lg font-semibold text-slate-700 dark:text-slate-200">
                  📐 白板图示
                </h2>
                <div className="grid gap-4">
                  {canvasItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                    >
                      {item.title && (
                        <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
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
            <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-700 print:hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                  🃏 Anki 闪卡
                </h2>
                <div className="flex gap-2">
                  {ankiCards.length > 0 && (
                    <>
                      <button
                        onClick={handleDownloadTsv}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                      >
                        📥 下载 TSV
                      </button>
                      <button
                        onClick={handlePushAnkiConnect}
                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-600 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400"
                      >
                        🔗 推送到 Anki
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleGenerateAnki}
                    disabled={ankiLoading}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {ankiLoading ? '⏳ 生成中…' : '🃏 生成 Anki 卡片'}
                  </button>
                </div>
              </div>

              {ankiStatus && (
                <p className="mb-3 text-xs text-slate-500">{ankiStatus}</p>
              )}

              {ankiCards.length > 0 && (
                <div className="grid gap-3">
                  {ankiCards.map((card, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          Q
                        </span>
                        <p className="text-sm text-slate-700 dark:text-slate-200">{card.front}</p>
                      </div>
                      <div className="mt-2 flex items-start gap-3">
                        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          A
                        </span>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{card.back}</p>
                      </div>
                      {card.tags && (
                        <div className="mt-2 ml-7">
                          {card.tags.split(/\s+/).filter(Boolean).map((tag, j) => (
                            <span
                              key={j}
                              className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400"
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
                <p className="text-sm text-slate-400">
                  点击「生成 Anki 卡片」从本次课堂内容创建闪卡
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
