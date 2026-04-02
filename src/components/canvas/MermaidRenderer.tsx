import { useEffect, useRef, useState, useCallback } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import mermaid from 'mermaid';
import { initMermaid } from '../../lib/mermaidInit';
import { animateSvgDrawIn } from '../../lib/mermaidAnimation';
import type { CanvasItemStatus } from '../../types';

interface MermaidRendererProps {
  content: string;
  id: string;
  /** Per-item lifecycle status */
  status: CanvasItemStatus;
}

export default function MermaidRenderer({ content, id, status }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef<string>(content);
  const statusRef = useRef<CanvasItemStatus>(status);
  const lastValidSvgRef = useRef<string>('');
  const isAnimatingRef = useRef(false);
  const [displaySvg, setDisplaySvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Keep latest content and status refs in sync
  latestContentRef.current = content;
  statusRef.current = status;

  const isStreaming = status === 'streaming';

  const renderDiagram = useCallback(async () => {
    if (!containerRef.current) return;
    initMermaid();

    const currentContent = latestContentRef.current;
    const uniqueId = `mermaid-${id}`;

    // Skip empty content — not a valid mermaid diagram
    if (!currentContent.trim()) return;

    // Large diagram degradation: count real node definitions (lines with [, (, {)
    // to avoid false positives from Mermaid keywords like graph/subgraph/style/class
    const nodePattern = /^[^;\n\[\]]+(?:\[|\(|\{)/m;
    const nodeCount = (currentContent.match(nodePattern) || []).length;
    if (nodeCount > 150) {
      // Defer heavy render for very large diagrams (no animation)
      setTimeout(async () => {
        if (!containerRef.current) return;
        try {
          const { svg } = await mermaid.render(uniqueId, currentContent);
          if (containerRef.current) {
            lastValidSvgRef.current = svg;
            setDisplaySvg(svg);
          }
        } catch {
          // Silently ignore degradation render errors
        }
      }, 500);
      return;
    }

    // Validate syntax first (fast, synchronous) to avoid hammering mermaid.render
    try {
      mermaid.parse(currentContent, { suppressErrors: true });
    } catch {
      // Syntax not yet valid — during streaming this is expected; skip render
      // Keep displaying last valid SVG via displaySvg state
      if (lastValidSvgRef.current) {
        setDisplaySvg(lastValidSvgRef.current);
      }
      return;
    }

    try {
      const { svg } = await mermaid.render(uniqueId, currentContent);
      if (containerRef.current) {
        lastValidSvgRef.current = svg;
        setDisplaySvg(svg);
        setError(null);
      }
    } catch (err) {
      // Only show error after streaming completes — mid-stream parse errors are transient
      if (statusRef.current !== 'streaming') {
        setError(err instanceof Error ? err.message : 'Failed to render Mermaid diagram');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uses stable refs (latestContentRef, statusRef)
  }, [id]);

  // Adaptive debounce: longer delay for longer content to avoid over-rendering
  const getDebounceDelay = (contentLength: number): number => {
    if (contentLength < 500) return 100;
    if (contentLength < 2000) return 150;
    return 300;
  };

  // Effect: Apply displaySvg to DOM (must run after renderDiagram updates displaySvg state)
  useEffect(() => {
    if (!displaySvg || !containerRef.current) return;
    // DOMPurify sanitization is already applied by mermaid.render; double-sanitize for safety
    containerRef.current.innerHTML = DOMPurify.sanitize(displaySvg, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
  }, [displaySvg]);

  // Effect: Trigger SVG draw-in animation when displaySvg changes (after non-streaming render)
  useEffect(() => {
    if (!containerRef.current || !displaySvg || isStreaming || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    requestAnimationFrame(() => {
      const svg = containerRef.current?.querySelector('svg');
      if (svg) {
        animateSvgDrawIn(svg);
      }
      // 动画结束后解锁（1000ms 为最大动画时长）
      setTimeout(() => {
        isAnimatingRef.current = false;
      }, 1000);
    });
  }, [displaySvg, isStreaming]);

  // Combined debounce + streaming-end effect: avoids double-trigger when streaming ends
  useEffect(() => {
    // When streaming ends: cancel any pending debounce and render immediately
    if (!isStreaming && latestContentRef.current === content) {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }
      renderDiagram();
      return;
    }

    // Adaptive debounce: wait after the last content change
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }
    renderTimerRef.current = setTimeout(() => {
      renderDiagram();
    }, getDebounceDelay(content.length));

    return () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderDiagram is stable (no volatile deps)
  }, [content, status]);

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

  // During streaming: show incremental code view — the diagram "grows" as mermaid code is written
  // Plus partial SVG if the accumulated code is already valid
  if (isStreaming) {
    return (
      <div className="flex flex-col gap-2">
        {/* Streaming code view — code appears as AI generates it */}
        <div className="rounded border border-border-light bg-[#1e1e1e] p-3 font-mono text-xs text-green-400 dark:border-border-dark">
          <div className="mb-1 text-tag text-text-placeholder">// 生成中...</div>
          <pre className="whitespace-pre-wrap break-all leading-relaxed">{content}</pre>
          <span className="animate-pulse">▋</span>
        </div>
        {/* Partial SVG attempt — updates as code becomes valid */}
        <div ref={containerRef} className="canvas-svg-container opacity-60" />
      </div>
    );
  }

  return <div ref={containerRef} className="canvas-svg-container" />;
}
