import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'isomorphic-dompurify';
import type { InteractiveParameter, CanvasItemStatus } from '../../types';
import { sendCanvasInteraction } from '../../lib/ai';

interface InteractiveCanvasProps {
  content: string;
  parameters?: InteractiveParameter[];
  itemId: string;
  status: CanvasItemStatus;
  /** Optional callback for demo/testing to intercept interaction events without AI backend */
  onInteraction?: (msg: string) => void;
}

export default function InteractiveCanvas({
  content,
  parameters = [],
  itemId,
  status,
  onInteraction,
}: InteractiveCanvasProps) {
  const { t } = useTranslation();
  const svgRef = useRef<HTMLDivElement>(null);
  const [paramValues, setParamValues] = useState<Record<string, number | string>>(() => {
    const initial: Record<string, number | string> = {};
    parameters.forEach((p) => {
      initial[p.name] = p.default ?? (p.type === 'range' ? (p.min ?? 0) : '');
    });
    return initial;
  });
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Guard against setState on unmounted component
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Re-initialize defaults when parameters change
  useEffect(() => {
    setParamValues(() => {
      const initial: Record<string, number | string> = {};
      parameters.forEach((p) => {
        initial[p.name] = p.default ?? (p.type === 'range' ? (p.min ?? 0) : '');
      });
      return initial;
    });
  }, [parameters]);

  // Apply CSS custom properties AND update text content for parameter-driven SVG updates
  useEffect(() => {
    if (!svgRef.current) return;
    parameters.forEach((p) => {
      const value = paramValues[p.name];
      if (value === undefined) return;
      const elements = svgRef.current!.querySelectorAll(`[data-parameter-name="${p.name}"]`);
      elements.forEach((el) => {
        if (el instanceof SVGElement) {
          el.style.setProperty(`--param-${p.name}`, String(value));
          // Update text content to match the current parameter value
          el.textContent = formatParamValue(p, value);
        }
      });
    });
  }, [parameters, paramValues]);

  // Register click handlers on interactive SVG regions
  useEffect(() => {
    if (!svgRef.current || status === 'streaming') return;

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      let el: HTMLElement | null = target;
      while (el && el !== svgRef.current) {
        const regionId = el.getAttribute('data-interactive-id');
        if (regionId) {
          setActiveRegion(regionId);
          setIsLoading(true);
          const logMsg = `[Click] region: ${regionId}`;
          onInteraction?.(logMsg);
          try {
            await sendCanvasInteraction({
              itemId,
              type: 'click',
              regionId,
            });
          } catch {
            // No-op in demo mode (no AI backend)
          } finally {
            if (mountedRef.current) setIsLoading(false);
          }
          return;
        }
        el = el.parentElement;
      }
    };

    svgRef.current.addEventListener('click', handleClick);
    return () => svgRef.current?.removeEventListener('click', handleClick);
  }, [itemId, status]);

  const handleParamChange = useCallback(
    async (param: InteractiveParameter, value: number | string) => {
      setParamValues((prev) => ({ ...prev, [param.name]: value }));
      setIsLoading(true);
      const logMsg = `[Param] ${param.label} = ${value}`;
      onInteraction?.(logMsg);
      try {
        await sendCanvasInteraction({
          itemId,
          type: 'parameter_change',
          parameterName: param.name,
          parameterValue: value,
        });
      } catch {
        // No-op in demo mode (no AI backend)
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [itemId, onInteraction]
  );

  // Format parameter value with appropriate unit suffix for SVG display
  const formatParamValue = (param: InteractiveParameter, value: number | string): string => {
    const v = String(value);
    switch (param.type) {
      case 'range':
      case 'number':
        if (param.name === 'resistance') return `${v}Ω`;
        if (param.name === 'capacitance') return `${v}μF`;
        return v;
      case 'select':
        return param.options?.find((o) => o.value === v)?.label ?? v;
      default:
        return v;
    }
  };

  const renderParamControl = (param: InteractiveParameter) => {
    const value = paramValues[param.name] ?? param.default ?? (param.min ?? 0);

    if (param.type === 'range') {
      return (
        <div key={param.name} className="flex items-center gap-2">
          <label className="text-xs text-text-sub dark:text-text-placeholder min-w-0 flex-shrink-0">
            {param.label}
          </label>
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={Number(value)}
            onChange={(e) => handleParamChange(param, Number(e.target.value))}
            className="flex-1 h-1.5 rounded-full appearance-none bg-gray-200 dark:bg-slate-600 cursor-pointer"
          />
          <span className="text-xs text-text-sub dark:text-text-placeholder min-w-[2rem] text-right">
            {Number(value).toFixed(param.step && param.step < 1 ? 1 : 0)}
          </span>
        </div>
      );
    }

    if (param.type === 'number') {
      return (
        <div key={param.name} className="flex items-center gap-2">
          <label className="text-xs text-text-sub dark:text-text-placeholder min-w-0 flex-shrink-0">
            {param.label}
          </label>
          <input
            type="number"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={Number(value)}
            onChange={(e) => handleParamChange(param, Number(e.target.value))}
            className="flex-1 rounded border border-border-light bg-white px-1.5 py-0.5 text-xs dark:border-border-dark dark:bg-slate-800 dark:text-text-main-dark"
          />
        </div>
      );
    }

    if (param.type === 'select' && param.options) {
      return (
        <div key={param.name} className="flex items-center gap-2">
          <label className="text-xs text-text-sub dark:text-text-placeholder min-w-0 flex-shrink-0">
            {param.label}
          </label>
          <select
            value={String(value)}
            onChange={(e) => handleParamChange(param, e.target.value)}
            className="flex-1 rounded border border-border-light bg-white px-1.5 py-0.5 text-xs dark:border-border-dark dark:bg-slate-800 dark:text-text-main-dark"
          >
            {param.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return null;
  };

  const sanitized = DOMPurify.sanitize(content, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Allow data-* attributes for interactivity
    ALLOWED_ATTR: [
      'data-interactive-id',
      'data-parameter-name',
      'data-hover-tip',
      'data-param-value',
      'style',
      'class',
    ],
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Parameter controls bar — above SVG, compact horizontal layout */}
      {parameters.length > 0 && status !== 'streaming' && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded border border-border-light bg-surface-light px-3 py-2 dark:border-border-dark dark:bg-surface-dark">
          {parameters.map(renderParamControl)}
        </div>
      )}

      {/* Interactive SVG */}
      <div
        ref={svgRef}
        className="canvas-svg-container rounded border border-border-light bg-white dark:border-border-dark dark:bg-slate-900 overflow-auto"
        style={{ maxHeight: '300px' }}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />

      {/* Interaction feedback */}
      {activeRegion && !isLoading && (
        <div className="text-xs text-text-sub dark:text-text-placeholder">
          {t('canvas.interactiveClicked', { region: activeRegion })}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-1 text-xs text-text-sub dark:text-text-placeholder">
          <span className="animate-pulse">{t('common.loading')}</span>
        </div>
      )}
    </div>
  );
}
