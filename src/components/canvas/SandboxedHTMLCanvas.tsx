import { useEffect, useRef, useState, useCallback } from 'react';
import type { SandboxMessage, IframeInteractionMessage, IframeErrorMessage } from '../../types/sandbox';

interface SandboxedHTMLCanvasProps {
  htmlContent: string;
  initialState?: Record<string, unknown>;
  onInteraction?: (event: { action: string; state: Record<string, unknown> }) => void;
  onReady?: () => void;
  onUnmount?: () => void; // 组件卸载时调用，用于 decrement sandbox 计数
  onError?: (message: string) => void;
  executionTimeoutMs?: number;
}

export default function SandboxedHTMLCanvas({
  htmlContent,
  initialState,
  onInteraction,
  onReady,
  onUnmount,
  onError,
  executionTimeoutMs = 15000,
}: SandboxedHTMLCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const hasErrorRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 重置状态当 htmlContent 变化
  useEffect(() => {
    setIsReady(false);
    setHasError(false);
    setErrorMessage('');
    hasErrorRef.current = false; // 同步重置 ref，避免新内容的超时检测被旧错误状态阻塞
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [htmlContent]);

  // 监听 iframe postMessage 消息
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // In Tauri WebView, srcdoc iframes have a null/opaque origin ("null" string or "").
      // Use source-window check instead of origin check — unambiguous and cross-environment safe.
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as SandboxMessage;
      switch (msg.type) {
        case 'SANDBOX_READY':
          if (!mountedRef.current) return;
          setIsReady(true);
          onReady?.();
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            if (mountedRef.current && !hasErrorRef.current) {
              hasErrorRef.current = true;
              setHasError(true);
              setErrorMessage('JS execution timeout: possible infinite loop detected.');
              onError?.('JS execution timeout: iframe killed after ' + executionTimeoutMs + 'ms');
              if (iframeRef.current) iframeRef.current.srcdoc = '';
            }
          }, executionTimeoutMs);
          break;
        case 'INTERACTION':
          if (!mountedRef.current) return;
          onInteraction?.((msg as IframeInteractionMessage).payload);
          break;
        case 'STATE_UPDATE':
          break;
        case 'ERROR':
          if (!mountedRef.current) return;
          hasErrorRef.current = true;
          setHasError(true);
          setErrorMessage((msg as IframeErrorMessage).payload?.message ?? 'Sandbox error');
          onError?.((msg as IframeErrorMessage).payload?.message ?? 'Sandbox error');
          break;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onReady, onInteraction, onError, executionTimeoutMs]);

  // 注入 CSP + 初始状态到 htmlContent
  const getSandboxedHtml = useCallback((html: string) => {
    // CSP meta 标签
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`;
    // 通信垫片脚本
    // Use '*' as postMessage target: Tauri srcdoc iframes have null/opaque origin so
    // the parent-origin-restricted postMessage would be silently dropped.
    // Security is maintained by the source-window check in the parent's message handler.
    const commShim = `<script>
  window.__INITIAL_STATE__ = ${JSON.stringify(initialState ?? {})};
  window.parent.postMessage({ type: 'SANDBOX_READY' }, '*');
  function notifyInteraction(action, state) {
    window.parent.postMessage({ type: 'INTERACTION', payload: { action, state } }, '*');
  }
</script>`;

    // 防御性处理：AI 生成的 HTML 可能不完整
    let modified = html;
    if (modified.includes('<head>')) {
      modified = modified.replace('<head>', '<head>' + cspMeta);
    } else if (modified.includes('<html>')) {
      modified = modified.replace('<html>', '<html><head>' + cspMeta + '</head>');
    } else {
      modified = cspMeta + modified;
    }
    if (modified.includes('<body>')) {
      modified = modified.replace('<body>', commShim + '<body>');
    } else if (modified.includes('</head>')) {
      modified = modified.replace('</head>', '</head><body>' + commShim + '</body>');
    } else {
      modified = modified + '<body>' + commShim + '</body>';
    }
    return modified;
  }, [initialState]);

  useEffect(() => {
    if (!htmlContent || !iframeRef.current) return;
    iframeRef.current.srcdoc = getSandboxedHtml(htmlContent);
  }, [htmlContent, getSandboxedHtml]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onUnmount?.(); // 组件卸载时通知父组件
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative rounded border border-border-light dark:border-border-dark overflow-hidden"
        style={{ minHeight: '200px' }}
      >
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          className="w-full h-full"
          style={{ minHeight: '200px', border: 'none' }}
          title="Interactive Sandbox"
        />
        {!isReady && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
            <span className="animate-pulse text-text-sub dark:text-text-placeholder text-sm">Loading sandbox...</span>
          </div>
        )}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 p-4">
            <span className="text-red-500 text-sm font-medium">Sandbox Error</span>
            <span className="text-red-400 text-xs text-center">{errorMessage}</span>
            <button
              className="mt-2 px-3 py-1 text-xs bg-red-100 dark:bg-red-900/40 text-red-600 rounded hover:bg-red-200 dark:hover:bg-red-900/60"
              onClick={() => {
                hasErrorRef.current = false; // 重置 ref
                setHasError(false);
                setIsReady(false);
                if (iframeRef.current) iframeRef.current.srcdoc = getSandboxedHtml(htmlContent);
              }}
            >
              重置
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
