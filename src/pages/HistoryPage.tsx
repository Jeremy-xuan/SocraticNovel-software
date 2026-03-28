import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import { listSessionHistory, loadSessionHistory, deleteSessionHistory } from '../lib/tauri';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';
import CanvasPanel from '../components/canvas/CanvasPanel';
import type { SessionHistorySummary, SessionHistoryEntry, ChatMessage, CanvasItem, GroupChatMessage } from '../types';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDuration(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  } catch {
    return '';
  }
}

// Group summaries by date
function groupByDate(entries: SessionHistorySummary[]): Map<string, SessionHistorySummary[]> {
  const map = new Map<string, SessionHistorySummary[]>();
  for (const entry of entries) {
    const dateKey = formatDate(entry.startedAt);
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey)!.push(entry);
  }
  return map;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const workspacePath = useAppStore((s) => s.settings.currentWorkspacePath);

  const [summaries, setSummaries] = useState<SessionHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review mode state
  const [reviewEntry, setReviewEntry] = useState<SessionHistoryEntry | null>(null);
  const [rightPanel, setRightPanel] = useState<'canvas' | 'chat'>('canvas');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadList();
  }, [workspacePath]);

  const loadList = async () => {
    if (!workspacePath) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listSessionHistory(workspacePath);
      setSummaries(list);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (id: string) => {
    if (!workspacePath) return;
    try {
      const entry = await loadSessionHistory(workspacePath, id);
      setReviewEntry(entry);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!workspacePath) return;
    if (!confirm(t('history.deleteConfirm'))) return;
    try {
      await deleteSessionHistory(workspacePath, id);
      setSummaries((prev) => prev.filter((s) => s.id !== id));
      if (reviewEntry?.id === id) setReviewEntry(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleBack = () => {
    if (reviewEntry) {
      setReviewEntry(null);
    } else {
      navigate('/');
    }
  };

  // ─── Review Mode (read-only replay) ───
  if (reviewEntry) {
    const messages: ChatMessage[] = reviewEntry.messages || [];
    const canvasItems: CanvasItem[] = reviewEntry.canvasItems || [];
    const groupChatMessages: GroupChatMessage[] = reviewEntry.groupChatMessages || [];

    return (
      <div className="flex h-screen flex-col bg-bg-light pt-8 dark:bg-bg-dark font-sans text-text-main dark:text-text-main-dark selection:bg-primary/20">

        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between px-6 lg:px-8">
          <button
            onClick={handleBack}
            className="group flex items-center gap-2 text-sm font-medium text-text-sub transition-colors hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
          >
            <svg className="h-4 w-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('history.backToList')}
          </button>

          <div className="text-[14px] font-medium tracking-wide flex items-center gap-2">
            <span className="text-text-main dark:text-text-main-dark">{reviewEntry.summary || t('history.untitled')}</span>
            <span className="text-border-border-light/80 dark:text-border-dark">/</span>
            <span className="text-text-sub dark:text-text-placeholder">{t('history.readOnly')}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/5 dark:bg-white/5 px-3 py-1 text-[11px] font-medium text-text-sub dark:text-text-placeholder">
              {formatTime(reviewEntry.startedAt)} — {formatTime(reviewEntry.endedAt)}
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              {messages.filter(m => m.role !== 'system').length} {t('history.messages')}
            </span>
          </div>
        </header>

        {/* Main content — 2 columns */}
        <div className="flex flex-1 overflow-hidden px-4 pb-4 lg:px-6 lg:pb-6 gap-4">

          {/* Left: Chat messages (read-only) */}
          <div className="flex flex-1 flex-col rounded-[20px] bg-surface-light dark:bg-surface-dark border border-border-light/60 dark:border-border-dark/60 shadow-card overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
            {/* No input — read-only */}
            <div className="flex items-center justify-center py-3 border-t border-border-light/40 dark:border-border-dark/40 text-[12px] text-text-placeholder">
              📖 {t('history.readOnlyHint')}
            </div>
          </div>

          {/* Right: Canvas + Group Chat tabs */}
          <div className="hidden md:flex w-[380px] lg:w-[440px] shrink-0 flex-col rounded-[20px] bg-surface-light dark:bg-surface-dark border border-border-light/60 dark:border-border-dark/60 shadow-card overflow-hidden">
            {/* Tab bar */}
            <div className="flex h-[48px] items-center gap-1 px-4 border-b border-border-light/40 dark:border-border-dark/40">
              <div className="flex h-[36px] items-center rounded-btn bg-bg-light dark:bg-bg-dark p-1">
                <button
                  onClick={() => setRightPanel('canvas')}
                  className={`h-full rounded-[6px] px-4 text-[12px] font-medium transition-all ${
                    rightPanel === 'canvas'
                      ? 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-main-dark shadow-sm'
                      : 'text-text-placeholder hover:text-text-sub'
                  }`}
                >
                  {t('history.canvasTab')} {canvasItems.length > 0 && `(${canvasItems.length})`}
                </button>
                <button
                  onClick={() => setRightPanel('chat')}
                  className={`h-full rounded-[6px] px-4 text-[12px] font-medium transition-all ${
                    rightPanel === 'chat'
                      ? 'bg-surface-light dark:bg-surface-dark text-text-main dark:text-text-main-dark shadow-sm'
                      : 'text-text-placeholder hover:text-text-sub'
                  }`}
                >
                  {t('history.groupChatTab')} {groupChatMessages.length > 0 && `(${groupChatMessages.length})`}
                </button>
              </div>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {rightPanel === 'canvas' && canvasItems.length > 0 && (
                <CanvasPanel items={canvasItems} readOnly />
              )}
              {rightPanel === 'canvas' && canvasItems.length === 0 && (
                <div className="flex h-full items-center justify-center text-[13px] text-text-placeholder">
                  {t('history.noCanvas')}
                </div>
              )}
              {rightPanel === 'chat' && groupChatMessages.length > 0 && (
                <div className="px-4 py-4 space-y-3">
                  {groupChatMessages.map((msg, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-semibold text-text-main dark:text-text-main-dark">{msg.sender}</span>
                        {msg.time && <span className="text-[10px] text-text-placeholder">{msg.time}</span>}
                      </div>
                      <p className="text-[13px] text-text-sub dark:text-text-placeholder leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  ))}
                </div>
              )}
              {rightPanel === 'chat' && groupChatMessages.length === 0 && (
                <div className="flex h-full items-center justify-center text-[13px] text-text-placeholder">
                  {t('history.noGroupChat')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── List Mode ───
  const grouped = groupByDate(summaries);

  return (
    <div className="flex h-screen flex-col bg-bg-light pt-8 dark:bg-bg-dark font-sans text-text-main dark:text-text-main-dark selection:bg-primary/20">

      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between px-6 lg:px-8">
        <button
          onClick={() => navigate('/')}
          className="group flex items-center gap-2 text-sm font-medium text-text-sub transition-colors hover:text-text-main dark:text-text-placeholder dark:hover:text-text-main-dark"
        >
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('common.back')}
        </button>

        <h1 className="text-[16px] font-semibold tracking-wide">
          {t('history.title')}
        </h1>

        <div className="w-20" /> {/* spacer for centering */}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 lg:px-12 pb-12">
        <div className="mx-auto max-w-[720px]">

          {loading && (
            <div className="flex items-center justify-center py-20 text-[14px] text-text-placeholder">
              {t('common.loading')}...
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-[12px] border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
              {error}
            </div>
          )}

          {!loading && summaries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="text-[40px] mb-4">📚</div>
              <h2 className="text-[18px] font-medium text-text-main dark:text-text-main-dark mb-2">
                {t('history.empty')}
              </h2>
              <p className="text-[14px] text-text-placeholder max-w-sm">
                {t('history.emptyHint')}
              </p>
            </div>
          )}

          {!loading && Array.from(grouped.entries()).map(([dateStr, entries]) => (
            <div key={dateStr} className="mb-8">
              <h2 className="text-[13px] font-semibold text-text-placeholder uppercase tracking-wider mb-3 pl-1">
                {dateStr}
              </h2>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex items-center gap-4 rounded-[16px] bg-surface-light dark:bg-surface-dark border border-border-light/60 dark:border-border-dark/60 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer"
                    onClick={() => handleOpen(entry.id)}
                  >
                    {/* Time column */}
                    <div className="flex flex-col items-center shrink-0 w-[60px]">
                      <span className="text-[14px] font-semibold text-text-main dark:text-text-main-dark">
                        {formatTime(entry.startedAt)}
                      </span>
                      <span className="text-[11px] text-text-placeholder">
                        {formatDuration(entry.startedAt, entry.endedAt)}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="h-10 w-[1px] bg-border-light/60 dark:bg-border-dark/60 shrink-0" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-medium text-text-main dark:text-text-main-dark truncate group-hover:text-primary transition-colors">
                        {entry.summary || t('history.untitled')}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[12px] text-text-placeholder">
                          💬 {entry.messageCount} {t('history.messages')}
                        </span>
                        {entry.canvasCount > 0 && (
                          <span className="text-[12px] text-text-placeholder">
                            🎨 {entry.canvasCount} {t('history.canvasItems')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-text-placeholder/50 opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                      title={t('history.delete')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
