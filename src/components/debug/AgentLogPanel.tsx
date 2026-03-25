import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentLogEntry } from '../../types';

const TOOL_ICONS: Record<string, string> = {
  read_file: '📖',
  list_files: '📂',
  think: '🧠',
  search_file: '🔍',
  write_file: '📝',
  append_file: '📝',
  respond_to_student: '✍️',
  render_canvas: '🎨',
  show_group_chat: '💬',
  submit_lesson_brief: '📋',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function LogEntry({ entry, onToggle, isExpanded }: {
  entry: AgentLogEntry;
  onToggle: () => void;
  isExpanded: boolean;
}) {
  const { t } = useTranslation();
  const time = formatTime(entry.timestamp);

  if (entry.type === 'tool_start') {
    const icon = TOOL_ICONS[entry.toolName || ''] || '⚙️';
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="shrink-0 text-[10px] text-text-placeholder font-mono">{time}</span>
        <span className="shrink-0">{icon}</span>
        <span className="text-tag tracking-[0.04em] text-primary dark:text-blue-400 font-mono">
          {entry.toolName}
        </span>
      </div>
    );
  }

  if (entry.type === 'tool_result') {
    const hasContent = entry.text && entry.text.length > 0;
    const preview = entry.text
      ? entry.text.length > 120 ? entry.text.slice(0, 120) + '…' : entry.text
      : '(empty)';

    return (
      <div className="ml-6 py-0.5">
        <button
          onClick={onToggle}
          className="flex items-start gap-1 text-left w-full group"
        >
          <span className={`shrink-0 text-[10px] ${entry.isError ? 'text-red-400' : 'text-green-500'}`}>
            {entry.isError ? '✗' : '✓'}
          </span>
          <span className={`text-[11px] leading-relaxed break-all ${
            entry.isError
              ? 'text-red-400'
              : 'text-text-sub dark:text-text-placeholder'
          } ${hasContent ? 'group-hover:text-[#BF6A4E] dark:group-hover:text-[#BF6A4E] cursor-pointer' : ''}`}>
            {isExpanded ? entry.text : preview}
          </span>
        </button>
      </div>
    );
  }

  if (entry.type === 'response') {
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="shrink-0 text-[10px] text-text-placeholder font-mono">{time}</span>
        <span className="shrink-0">💬</span>
        <span className="text-tag tracking-[0.04em] text-text-sub dark:text-text-main-dark truncate">
          {t('agentLog.responseComplete')}
        </span>
      </div>
    );
  }

  if (entry.type === 'error') {
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="shrink-0 text-[10px] text-text-placeholder font-mono">{time}</span>
        <span className="shrink-0">❌</span>
        <span className="text-tag tracking-[0.04em] text-danger break-all">{entry.text}</span>
      </div>
    );
  }

  if (entry.type === 'turn_complete') {
    return (
      <div className="flex items-center gap-2 py-1 border-b border-slate-100 dark:border-border-dark/50 mb-1">
        <span className="shrink-0 text-[10px] text-text-placeholder font-mono">{time}</span>
        <span className="text-[10px] text-text-placeholder">── turn complete ──</span>
      </div>
    );
  }

  if (entry.type === 'info') {
    return (
      <div className="flex items-start gap-2 py-1">
        <span className="shrink-0 text-[10px] text-text-placeholder font-mono">{time}</span>
        <span className="shrink-0">ℹ️</span>
        <span className="text-tag tracking-[0.04em] text-text-sub">{entry.text}</span>
      </div>
    );
  }

  return null;
}

export default function AgentLogPanel({ logs }: { logs: AgentLogEntry[] }) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-aux text-text-placeholder">
        {t('agentLog.empty')}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-1 py-2 font-mono text-tag tracking-[0.04em]">
      {logs.map((entry) => (
        <LogEntry
          key={entry.id}
          entry={entry}
          isExpanded={expandedIds.has(entry.id)}
          onToggle={() => toggleExpand(entry.id)}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
