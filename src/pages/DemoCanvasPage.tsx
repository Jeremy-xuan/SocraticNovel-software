/**
 * DemoCanvasPage — AI 驱动的画板验收页面
 * 路径: /demo-canvas
 *
 * 接入 sendChatMessage，让 AI 调用 render_canvas 工具画 Mermaid 图。
 * 临时测试用，验证 canvas 渲染链路是否正常。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAiAgent } from '../hooks/useAiAgent';
import { useAppStore } from '../stores/appStore';
import CanvasPanel from '../components/canvas/CanvasPanel';
import { initBuiltinWorkspace, listWorkspaces } from '../lib/tauri';
import type { ChatMessage, Workspace } from '../types';

// ─── Simple chat bubble ─────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-white rounded-br-md'
            : 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-main-dark border border-border-light dark:border-border-dark rounded-bl-md'
        }`}
      >
        {msg.isStreaming && <span className="animate-pulse opacity-60">▋</span>}
        <span className={msg.isStreaming ? 'opacity-70' : ''}>{msg.text || '...'}</span>
      </div>
    </div>
  );
}

// ─── Demo page ────────────────────────────────────────────────────
export default function DemoCanvasPage() {
  const navigate = useNavigate();
  const { initSession, sendMessage } = useAiAgent();
  const messages = useAppStore((s) => s.messages);
  const canvasItems = useAppStore((s) => s.canvasItems);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const hasError = useAppStore((s) => s.hasError);
  const settings = useAppStore((s) => s.settings);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const clearCanvas = useAppStore((s) => s.clearCanvas);

  const [input, setInput] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const isInitializing = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize AI session — auto-init workspace if needed, then start AI
  useEffect(() => {
    if (initialized || isInitializing.current) return;
    isInitializing.current = true;
    setInitError(null);
    clearMessages();
    clearCanvas();
    useAppStore.getState().setStreaming(false);

    const demoPrompt = `You are a diagram drawing assistant for a physics education app.
STRICT TOOL USAGE RULES — FOLLOW EXACTLY:
1. When the user asks for ANY diagram, chart, or visualization: call render_canvas tool with type="mermaid" and the Mermaid diagram code in the "content" field.
2. CRITICAL: Do NOT write mermaid code inside respond_to_student text. Mermaid code blocks (\`\`\`mermaid...\`\`\`) in text are NOT rendered. ONLY render_canvas displays diagrams.
3. Call respond_to_student AFTER render_canvas to send your text reply. Keep it to 1-2 sentences.
4. NEVER say you cannot draw or render. Call render_canvas and it will render the diagram automatically.
5. Call order for diagram requests: render_canvas → respond_to_student. Two tool calls, in that order.`;

    const start = async () => {
      let workspacePath = useAppStore.getState().settings.currentWorkspacePath;

      if (!workspacePath) {
        let wsList = await listWorkspaces();
        if (wsList.length === 0) {
          const ws: Workspace = await initBuiltinWorkspace();
          workspacePath = ws.path;
          useAppStore.getState().updateSettings({ currentWorkspaceId: ws.id, currentWorkspacePath: ws.path });
        } else {
          workspacePath = wsList[0].path;
          useAppStore.getState().updateSettings({ currentWorkspaceId: wsList[0].id, currentWorkspacePath: wsList[0].path });
        }
      }

      await initSession(workspacePath, demoPrompt);
      isInitializing.current = false;
      setInitialized(true);
    };

    start().catch((e) => {
      isInitializing.current = false;
      setInitError(`Failed to start AI session: ${e}`);
    });
  }, [settings.currentWorkspacePath]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  }, [input, isStreaming, initialized, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-light dark:bg-bg-dark">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="mb-4 text-red-600 dark:text-red-400">{initError}</p>
          <button
            onClick={() => navigate('/settings')}
            className="rounded-lg bg-primary px-4 py-2 text-white hover:opacity-90"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-light dark:bg-bg-dark">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border-light bg-surface-light px-6 py-4 dark:border-border-dark dark:bg-surface-dark">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-text-sub hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          ← Back
        </button>
        <div className="h-4 w-px bg-border-light dark:bg-border-dark" />
        <h1 className="text-base font-semibold text-text-main dark:text-text-main-dark">
          Canvas 验收测试
        </h1>
        <span className="ml-auto rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
          AI 驱动
        </span>
        {!initialized && (
          <span className="ml-auto animate-pulse text-sm text-text-placeholder">Initializing AI...</span>
        )}
      </div>

      {/* Main content: Chat + Canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div className="flex w-1/2 min-w-0 flex-col border-r border-border-light dark:border-border-dark">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && initialized && (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-text-placeholder">
                  试试输入：画一个流程图 / 画一个神经网络
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {hasError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                AI error — check console or try again
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border-light p-4 dark:border-border-dark">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={initialized ? '描述你想画的图...' : 'Waiting for AI...'}
                disabled={isStreaming}
                rows={2}
                className="flex-1 resize-none rounded-xl border border-border-light bg-surface-light px-4 py-2.5 text-sm text-text-main placeholder-text-placeholder focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                className="shrink-0 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isStreaming ? '...' : 'Send'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-placeholder">
              按 Enter 发送，Shift+Enter 换行
            </p>
          </div>
        </div>

        {/* Canvas panel */}
        <div className="w-1/2 overflow-y-auto bg-bg-light dark:bg-bg-dark">
          {canvasItems.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-text-placeholder">Canvas 面板 — AI 画的图会出现在这里</p>
            </div>
          )}
          <CanvasPanel items={canvasItems} />
        </div>
      </div>
    </div>
  );
}
