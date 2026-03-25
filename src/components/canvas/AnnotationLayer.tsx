import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation } from '../../types';
import type { ToolType } from './CanvasToolbar';

interface Props {
  annotations: Annotation[];
  activeTool: ToolType;
  activeColor: string;
  editing: boolean;
  onAddAnnotation: (annotation: Annotation) => void;
  onRemoveAnnotation: (id: string) => void;
}

function generateId() {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPoint(
  e: React.MouseEvent | React.TouchEvent,
  svgEl: SVGSVGElement,
): { x: number; y: number } {
  const rect = svgEl.getBoundingClientRect();
  if ('touches' in e) {
    const touch = e.touches[0] || e.changedTouches[0];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export default function AnnotationLayer({
  annotations,
  activeTool,
  activeColor,
  editing,
  onAddAnnotation,
  onRemoveAnnotation,
}: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const [arrowEnd, setArrowEnd] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!editing || !svgRef.current) return;
      const pt = getPoint(e, svgRef.current);

      if (activeTool === 'pen' || activeTool === 'highlight') {
        setDrawing(true);
        setCurrentPoints([pt]);
      } else if (activeTool === 'arrow') {
        setDrawing(true);
        setArrowStart(pt);
        setArrowEnd(pt);
      } else if (activeTool === 'text') {
        setTextInput(pt);
        setTextValue('');
      }
      // eraser handled via click on annotation element
    },
    [editing, activeTool],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing || !svgRef.current) return;
      const pt = getPoint(e, svgRef.current);

      if (activeTool === 'pen' || activeTool === 'highlight') {
        setCurrentPoints((prev) => [...prev, pt]);
      } else if (activeTool === 'arrow') {
        setArrowEnd(pt);
      }
    },
    [drawing, activeTool],
  );

  const handlePointerUp = useCallback(() => {
    if (!drawing) return;

    if ((activeTool === 'pen' || activeTool === 'highlight') && currentPoints.length > 1) {
      onAddAnnotation({
        id: generateId(),
        type: activeTool,
        color: activeTool === 'highlight' ? '#eab308' : activeColor,
        points: currentPoints,
        strokeWidth: activeTool === 'highlight' ? 20 : 2,
      });
    } else if (activeTool === 'arrow' && arrowStart && arrowEnd) {
      const dx = arrowEnd.x - arrowStart.x;
      const dy = arrowEnd.y - arrowStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        onAddAnnotation({
          id: generateId(),
          type: 'arrow',
          color: activeColor,
          startPoint: arrowStart,
          endPoint: arrowEnd,
          strokeWidth: 2,
        });
      }
    }

    setDrawing(false);
    setCurrentPoints([]);
    setArrowStart(null);
    setArrowEnd(null);
  }, [drawing, activeTool, activeColor, currentPoints, arrowStart, arrowEnd, onAddAnnotation]);

  const handleTextSubmit = useCallback(() => {
    if (textInput && textValue.trim()) {
      onAddAnnotation({
        id: generateId(),
        type: 'text',
        color: activeColor,
        text: textValue.trim(),
        position: textInput,
        fontSize: 14,
      });
    }
    setTextInput(null);
    setTextValue('');
  }, [textInput, textValue, activeColor, onAddAnnotation]);

  const handleAnnotationClick = useCallback(
    (id: string) => {
      if (editing && activeTool === 'eraser') {
        onRemoveAnnotation(id);
      }
    },
    [editing, activeTool, onRemoveAnnotation],
  );

  const pointsToStr = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ pointerEvents: editing ? 'all' : 'none' }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
          </marker>
        </defs>

        {/* Rendered annotations */}
        {annotations.map((ann) => {
          const clickProps = editing && activeTool === 'eraser'
            ? {
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); handleAnnotationClick(ann.id); },
                style: { cursor: 'pointer' } as React.CSSProperties,
              }
            : {};

          switch (ann.type) {
            case 'pen':
              return (
                <polyline
                  key={ann.id}
                  points={pointsToStr(ann.points || [])}
                  fill="none"
                  stroke={ann.color}
                  strokeWidth={ann.strokeWidth || 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  {...clickProps}
                />
              );
            case 'highlight':
              return (
                <polyline
                  key={ann.id}
                  points={pointsToStr(ann.points || [])}
                  fill="none"
                  stroke={ann.color}
                  strokeWidth={ann.strokeWidth || 20}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.3}
                  {...clickProps}
                />
              );
            case 'arrow':
              return (
                <line
                  key={ann.id}
                  x1={ann.startPoint?.x || 0}
                  y1={ann.startPoint?.y || 0}
                  x2={ann.endPoint?.x || 0}
                  y2={ann.endPoint?.y || 0}
                  stroke={ann.color}
                  strokeWidth={ann.strokeWidth || 2}
                  markerEnd="url(#arrowhead)"
                  style={{ color: ann.color, ...(clickProps.style || {}) }}
                  onClick={clickProps.onClick}
                />
              );
            case 'text':
              return (
                <text
                  key={ann.id}
                  x={ann.position?.x || 0}
                  y={ann.position?.y || 0}
                  fill={ann.color}
                  fontSize={ann.fontSize || 14}
                  fontFamily="system-ui, sans-serif"
                  {...clickProps}
                >
                  {ann.text}
                </text>
              );
            default:
              return null;
          }
        })}

        {/* Live drawing preview */}
        {drawing && (activeTool === 'pen' || activeTool === 'highlight') && currentPoints.length > 1 && (
          <polyline
            points={pointsToStr(currentPoints)}
            fill="none"
            stroke={activeTool === 'highlight' ? '#eab308' : activeColor}
            strokeWidth={activeTool === 'highlight' ? 20 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={activeTool === 'highlight' ? 0.3 : 1}
          />
        )}

        {/* Arrow preview */}
        {drawing && activeTool === 'arrow' && arrowStart && arrowEnd && (
          <line
            x1={arrowStart.x}
            y1={arrowStart.y}
            x2={arrowEnd.x}
            y2={arrowEnd.y}
            stroke={activeColor}
            strokeWidth={2}
            strokeDasharray="4 2"
            markerEnd="url(#arrowhead)"
            style={{ color: activeColor }}
          />
        )}
      </svg>

      {/* Text input overlay */}
      {editing && textInput && (
        <input
          ref={textInputRef}
          type="text"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTextSubmit();
            if (e.key === 'Escape') { setTextInput(null); setTextValue(''); }
          }}
          onBlur={handleTextSubmit}
          className="pointer-events-auto absolute rounded border border-blue-400 bg-white px-1 py-0.5 text-sm shadow outline-none dark:bg-slate-800 dark:text-white"
          style={{
            left: textInput.x,
            top: textInput.y,
            minWidth: 80,
            color: activeColor,
          }}
          placeholder={t('canvas.textPlaceholder')}
        />
      )}
    </div>
  );
}
