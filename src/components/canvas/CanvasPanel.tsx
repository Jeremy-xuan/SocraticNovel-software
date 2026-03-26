import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import mermaid from 'mermaid';
import type { CanvasItem } from '../../types';
import { useAppStore } from '../../stores/appStore';
import CanvasToolbar from './CanvasToolbar';
import type { ToolType } from './CanvasToolbar';
import AnnotationLayer from './AnnotationLayer';

let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;
  const isDark = document.documentElement.classList.contains('dark');
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'neutral',
    securityLevel: 'loose',
  });
  mermaidInitialized = true;
}

function MermaidRenderer({ content, id }: { content: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const renderDiagram = useCallback(async () => {
    if (!containerRef.current) return;
    initMermaid();
    try {
      const uniqueId = `mermaid-${id}`;
      const { svg } = await mermaid.render(uniqueId, content);
      if (containerRef.current) {
        containerRef.current.innerHTML = svg;
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render Mermaid diagram');
    }
  }, [content, id]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <div>
        <p className="mb-1 text-tag text-red-500">Mermaid rendering error: {error}</p>
        <pre className="overflow-auto rounded bg-gray-100 p-2 text-tag tracking-[0.04em] text-text-sub dark:bg-gray-800 dark:text-text-main-dark">
          {content}
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className="canvas-svg-container" />;
}

interface Props {
  items: CanvasItem[];
  readOnly?: boolean;
}

export default function CanvasPanel({ items, readOnly }: Props) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [activeColor, setActiveColor] = useState('#ef4444');

  const annotations = useAppStore((s) => s.annotations);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const removeAnnotation = useAppStore((s) => s.removeAnnotation);
  const undoAnnotation = useAppStore((s) => s.undoAnnotation);
  const clearAnnotations = useAppStore((s) => s.clearAnnotations);
  const loadAnnotationsFromStorage = useAppStore((s) => s.loadAnnotationsFromStorage);

  useEffect(() => {
    loadAnnotationsFromStorage();
  }, [loadAnnotationsFromStorage]);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <span className="text-title leading-tight tracking-[0.04em]">🎨</span>
          <p className="mt-2 text-aux text-text-placeholder dark:text-text-sub">
            {t('canvas.emptyTitle')}
          </p>
          <p className="mt-1 text-tag tracking-[0.04em] text-text-main-dark dark:text-text-sub">
            (render_canvas)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const isEditing = editingId === item.id;
        const itemAnnotations = annotations[item.id] || [];

        return (
          <div
            key={item.id}
            className="rounded-btn border border-border-light bg-surface-light p-3 dark:border-border-dark dark:bg-surface-dark"
          >
            {/* Header row: title + annotation toggle */}
            <div className="mb-2 flex items-center justify-between">
              {item.title ? (
                <p className="text-tag tracking-[0.04em] font-medium text-text-sub dark:text-text-placeholder">
                  {item.title}
                </p>
              ) : (
                <span />
              )}
              {!readOnly && (
                <button
                  onClick={() => setEditingId(isEditing ? null : item.id)}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                    isEditing
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {t('canvas.annotate')}
                </button>
              )}
            </div>

            {/* Toolbar */}
            {isEditing && (
              <div className="mb-2 flex justify-center">
                <CanvasToolbar
                  activeTool={activeTool}
                  activeColor={activeColor}
                  onToolChange={setActiveTool}
                  onColorChange={setActiveColor}
                  onUndo={() => undoAnnotation(item.id)}
                  onClearAll={() => clearAnnotations(item.id)}
                />
              </div>
            )}

            {/* Canvas content + annotation overlay */}
            <div className="relative">
              {item.type === 'svg' && (
                <div
                  className="canvas-svg-container"
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
              )}
              {item.type === 'mermaid' && (
                <MermaidRenderer content={item.content} id={item.id} />
              )}
              <AnnotationLayer
                annotations={itemAnnotations}
                activeTool={activeTool}
                activeColor={activeColor}
                editing={isEditing}
                onAddAnnotation={(ann) => addAnnotation(item.id, ann)}
                onRemoveAnnotation={(annId) => removeAnnotation(item.id, annId)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
