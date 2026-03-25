import { useTranslation } from 'react-i18next';
import type { AnnotationType } from '../../types';

export type ToolType = AnnotationType | 'eraser';

interface Props {
  activeTool: ToolType;
  activeColor: string;
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClearAll: () => void;
}

export default function CanvasToolbar({
  activeTool,
  activeColor,
  onToolChange,
  onColorChange,
  onUndo,
  onClearAll,
}: Props) {
  const { t } = useTranslation();

  const tools: { type: ToolType; icon: string; label: string }[] = [
    { type: 'pen', icon: '🖊️', label: t('canvas.toolPen') },
    { type: 'text', icon: '📝', label: t('canvas.toolText') },
    { type: 'arrow', icon: '↗️', label: t('canvas.toolArrow') },
    { type: 'highlight', icon: '🟡', label: t('canvas.toolHighlight') },
    { type: 'eraser', icon: '🗑️', label: t('canvas.toolEraser') },
  ];

  const colors = [
    { value: '#ef4444', label: t('canvas.colorRed') },
    { value: '#3b82f6', label: t('canvas.colorBlue') },
    { value: '#22c55e', label: t('canvas.colorGreen') },
    { value: '#eab308', label: t('canvas.colorYellow') },
    { value: '#1e293b', label: t('canvas.colorBlack') },
  ];

  return (
    <div className="flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-md dark:bg-slate-800">
      {/* Tool buttons */}
      {tools.map((tool) => (
        <button
          key={tool.type}
          title={tool.label}
          onClick={() => onToolChange(tool.type)}
          className={`flex h-7 w-7 items-center justify-center rounded text-sm transition-colors ${
            activeTool === tool.type
              ? 'border border-blue-400 bg-blue-100 dark:border-blue-500 dark:bg-blue-900'
              : 'hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      {/* Separator */}
      <div className="mx-1 h-4 w-px bg-gray-300 dark:bg-slate-600" />

      {/* Color picker */}
      {colors.map((c) => (
        <button
          key={c.value}
          title={c.label}
          onClick={() => onColorChange(c.value)}
          className={`h-4 w-4 rounded-full border-2 transition-transform ${
            activeColor === c.value
              ? 'scale-110 border-blue-500 dark:border-blue-400'
              : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}

      {/* Separator */}
      <div className="mx-1 h-4 w-px bg-gray-300 dark:bg-slate-600" />

      {/* Undo / Clear */}
      <button
        title={t('canvas.undo')}
        onClick={onUndo}
        className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
      >
        ↩️
      </button>
      <button
        title={t('canvas.clearAll')}
        onClick={onClearAll}
        className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
      >
        🧹
      </button>
    </div>
  );
}
