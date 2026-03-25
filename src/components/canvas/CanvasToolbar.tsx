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

const TOOLS: { type: ToolType; icon: string; label: string }[] = [
  { type: 'pen', icon: '🖊️', label: '画笔' },
  { type: 'text', icon: '📝', label: '文字' },
  { type: 'arrow', icon: '↗️', label: '箭头' },
  { type: 'highlight', icon: '🟡', label: '高亮' },
  { type: 'eraser', icon: '🗑️', label: '橡皮擦' },
];

const COLORS = [
  { value: '#ef4444', label: '红' },
  { value: '#3b82f6', label: '蓝' },
  { value: '#22c55e', label: '绿' },
  { value: '#eab308', label: '黄' },
  { value: '#1e293b', label: '黑' },
];

export default function CanvasToolbar({
  activeTool,
  activeColor,
  onToolChange,
  onColorChange,
  onUndo,
  onClearAll,
}: Props) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-md dark:bg-slate-800">
      {/* Tool buttons */}
      {TOOLS.map((tool) => (
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
      {COLORS.map((c) => (
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
        title="撤销"
        onClick={onUndo}
        className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
      >
        ↩️
      </button>
      <button
        title="清除全部"
        onClick={onClearAll}
        className="flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-gray-100 dark:hover:bg-slate-700"
      >
        🧹
      </button>
    </div>
  );
}
