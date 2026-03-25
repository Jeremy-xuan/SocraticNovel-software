import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { readFile } from '../../lib/tauri';
import {
  parseCurriculum,
  parseProgressForChapters,
  applyProgress,
  findCurrentChapter,
} from '../../lib/curriculumParser';
import type { CurriculumOutline, CurriculumUnit, CurriculumChapter } from '../../types';

interface Props {
  isInClass: boolean;
}

export default function ChapterOutline({ isInClass }: Props) {
  const { settings } = useAppStore();
  const wsPath = settings.currentWorkspacePath;

  const [outline, setOutline] = useState<CurriculumOutline | null>(null);
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wsPath) return;
    loadOutline(wsPath);
  }, [wsPath]);

  async function loadOutline(workspacePath: string) {
    setLoading(true);
    try {
      const [curriculumMd, progressMd] = await Promise.all([
        readFile(workspacePath, 'teacher/config/curriculum.md').catch(() => ''),
        readFile(workspacePath, 'teacher/runtime/progress.md').catch(() => ''),
      ]);

      if (!curriculumMd) {
        setOutline(null);
        setLoading(false);
        return;
      }

      let parsed = parseCurriculum(curriculumMd);
      const completedChapters = parseProgressForChapters(progressMd);

      // Also try to find current chapter from progress.md
      const nextChMatch = progressMd.match(/章节：(Ch\.\d+)/);
      const currentCh = findCurrentChapter(parsed, nextChMatch?.[1] ?? null);

      parsed = applyProgress(parsed, completedChapters, currentCh);
      setOutline(parsed);

      // Auto-expand the unit containing the current chapter
      if (currentCh) {
        for (const unit of parsed.units) {
          if (unit.chapters.some(ch => ch.chapter === currentCh)) {
            setExpandedUnits(new Set([unit.unitId]));
            break;
          }
        }
      } else if (parsed.units.length > 0) {
        setExpandedUnits(new Set([parsed.units[0].unitId]));
      }
    } catch {
      setOutline(null);
    }
    setLoading(false);
  }

  function toggleUnit(unitId: string) {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (!outline || outline.units.length === 0) {
    return (
      <div className="p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          课堂信息
        </h3>
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800">
            <p className="font-medium">状态</p>
            <p className={isInClass ? 'text-green-500' : 'text-slate-400'}>
              {isInClass ? '🟢 上课中' : '⚪ 未开始'}
            </p>
          </div>
          <p className="text-xs text-slate-400">暂无课程大纲</p>
        </div>
      </div>
    );
  }

  const totalChapters = outline.units.reduce((sum, u) => sum + u.chapters.length, 0);
  const completedChapters = outline.units.reduce(
    (sum, u) => sum + u.chapters.filter(c => c.status === 'completed').length,
    0,
  );

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 p-3 dark:border-slate-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          章节大纲
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${isInClass ? 'bg-green-400' : 'bg-slate-300'}`} />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isInClass ? '上课中' : '未开始'}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            {completedChapters}/{totalChapters}
          </span>
        </div>
        {/* Global progress bar */}
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-green-400 transition-all"
            style={{ width: `${totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Scrollable outline */}
      <div className="flex-1 overflow-y-auto p-2">
        {outline.units.map(unit => (
          <UnitSection
            key={unit.unitId}
            unit={unit}
            expanded={expandedUnits.has(unit.unitId)}
            currentChapter={outline.currentChapter}
            onToggle={() => toggleUnit(unit.unitId)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Unit Section ─────────────────────────────────────────────────

function UnitSection({
  unit,
  expanded,
  currentChapter,
  onToggle,
}: {
  unit: CurriculumUnit;
  expanded: boolean;
  currentChapter: string | null;
  onToggle: () => void;
}) {
  const completedCount = unit.chapters.filter(c => c.status === 'completed').length;
  const allDone = completedCount === unit.chapters.length && unit.chapters.length > 0;

  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        <span className={allDone ? 'text-green-500' : ''}>
          U{unit.unitNumber}
        </span>
        <span className="truncate flex-1">{unit.title}</span>
        <span className="shrink-0 text-[10px] text-slate-400">
          {completedCount}/{unit.chapters.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-2 border-l border-slate-200 pl-2 dark:border-slate-700">
          {unit.chapters.map((ch, idx) => (
            <ChapterItem
              key={`${unit.unitId}-${idx}`}
              chapter={ch}
              isCurrent={ch.chapter === currentChapter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chapter Item ─────────────────────────────────────────────────

function ChapterItem({
  chapter,
  isCurrent,
}: {
  chapter: CurriculumChapter;
  isCurrent: boolean;
}) {
  const statusIcon = {
    completed: '✅',
    in_progress: '📖',
    not_started: '○',
  }[chapter.status];

  const isTest = chapter.chapter === '—' || chapter.lesson.includes('综合');

  return (
    <div
      className={`flex items-start gap-1.5 rounded-md px-2 py-1 text-xs ${
        isCurrent
          ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'text-slate-500 dark:text-slate-400'
      } ${chapter.status === 'completed' ? 'opacity-60' : ''}`}
    >
      <span className="mt-px shrink-0">{statusIcon}</span>
      <div className="min-w-0 flex-1">
        <span className={isTest ? 'italic' : ''}>
          {chapter.chapter !== '—' ? `${chapter.chapter} ` : ''}
          {chapter.title}
        </span>
      </div>
    </div>
  );
}
