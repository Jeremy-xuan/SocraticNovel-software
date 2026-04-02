import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'isomorphic-dompurify';
import mermaid from 'mermaid';
import { initMermaid } from '../../lib/mermaidInit';

interface MermaidEditorProps {
  /** The current content (AI-generated or last saved) */
  content: string;
  /** User-modified content (overrides content when set) */
  editableContent?: string;
  itemId: string;
  isStreaming?: boolean;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export default function MermaidEditor({
  content,
  editableContent,
  itemId,
  isStreaming,
  onSave,
  onCancel,
}: MermaidEditorProps) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCodeRef = useRef<string>(editableContent ?? content);
  const [code, setCode] = useState(editableContent ?? content);
  const [error, setError] = useState<string | null>(null);

  // Keep latest code ref in sync
  latestCodeRef.current = code;

  const renderDiagram = useCallback(async () => {
    if (!previewRef.current) return;
    initMermaid();

    const currentCode = latestCodeRef.current;

    // Validate syntax first
    try {
      mermaid.parse(currentCode, { suppressErrors: true });
    } catch {
      setError(t('canvas.syntaxError'));
      return;
    }

    try {
      const { svg } = await mermaid.render(`editor-${itemId}`, currentCode);
      if (previewRef.current) {
        previewRef.current.innerHTML = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('canvas.renderError'));
    }
  }, [itemId, t]);

  // Debounced preview render (300ms)
  useEffect(() => {
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }
    renderTimerRef.current = setTimeout(() => {
      renderDiagram();
    }, 300);

    return () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }
    };
  }, [code, renderDiagram]);

  const handleReset = () => {
    setCode(content);
    setError(null);
  };

  const handleSave = () => {
    onSave(code);
  };

  return (
    <div className="flex flex-col gap-2 rounded-btn border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark p-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-tag text-text-sub dark:text-text-placeholder">{t('canvas.editCode')}</span>
          {error ? (
            <span className="text-tag text-red-500">{t('canvas.syntaxError')}</span>
          ) : (
            <span className="text-tag text-green-500">{t('canvas.validMermaid')}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 transition-colors"
          >
            {t('canvas.reset')}
          </button>
          <button
            onClick={onCancel}
            className="rounded-full px-2 py-0.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="rounded-full px-2 py-0.5 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>

      {/* Split pane: editor + preview */}
      <div className="flex gap-2" style={{ height: '240px' }}>
        {/* Code editor */}
        <div className="flex-1 flex flex-col">
          <label className="text-tag text-text-sub dark:text-text-placeholder mb-1">
            {t('canvas.code')}
          </label>
          <textarea
            ref={editorRef}
            value={code}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCode(e.target.value)}
            className="flex-1 rounded border border-border-light bg-gray-50 p-2 font-mono text-xs text-text-main dark:border-border-dark dark:bg-slate-800 dark:text-text-main-dark resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="graph TD;&#10;  A[Start] --> B[End]"
            spellCheck={false}
            disabled={isStreaming}
          />
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col">
          <label className="text-tag text-text-sub dark:text-text-placeholder mb-1">
            {t('canvas.preview')}
          </label>
          <div className="flex-1 rounded border border-border-light bg-white dark:border-border-dark dark:bg-slate-900 overflow-auto">
            {isStreaming ? (
              <div className="flex h-full items-center justify-center text-tag text-text-placeholder">
                {t('canvas.rendering')}
              </div>
            ) : (
              <div ref={previewRef} className="canvas-svg-container p-2" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
