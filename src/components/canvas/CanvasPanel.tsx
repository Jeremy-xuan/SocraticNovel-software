import type { CanvasItem } from '../../types';

interface Props {
  items: CanvasItem[];
}

export default function CanvasPanel({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <span className="text-3xl">🎨</span>
          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
            AI 会在这里展示图表和公式
          </p>
          <p className="mt-1 text-xs text-slate-300 dark:text-slate-600">
            (render_canvas)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
        >
          {item.title && (
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {item.title}
            </p>
          )}
          {item.type === 'svg' && (
            <div
              className="canvas-svg-container"
              dangerouslySetInnerHTML={{ __html: item.content }}
            />
          )}
          {item.type === 'mermaid' && (
            <pre className="text-xs text-slate-600 dark:text-slate-300">
              {item.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
