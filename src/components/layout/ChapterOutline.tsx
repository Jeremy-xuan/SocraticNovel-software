import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <h3 className="mb-2 text-tag tracking-[0.04em] font-medium uppercase tracking-wider text-text-placeholder">
          {t('chapterOutline.classInfo')}
        </h3>
        <div className="space-y-2 text-aux text-text-sub dark:text-text-main-dark">
          <div className="rounded-btn bg-surface-light p-3 shadow-card dark:bg-surface-dark">
            <p className="font-medium">{t('chapterOutline.statusLabel')}</p>
            <p className={isInClass ? 'text-green-500' : 'text-text-placeholder'}>
              {isInClass ? t('chapterOutline.inClass') : t('chapterOutline.notStarted')}
            </p>
          </div>
          <p className="text-tag tracking-[0.04em] text-text-placeholder">{t('chapterOutline.noOutline')}</p>
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
      <div className="shrink-0 border-b border-border-light p-3 dark:border-border-dark">
        <h3 className="text-tag tracking-[0.04em] font-medium uppercase tracking-wider text-text-placeholder">
          {t('chapterOutline.outlineTitle')}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${isInClass ? 'bg-green-400' : 'bg-slate-300'}`} />
          <span className="text-tag tracking-[0.04em] text-text-sub dark:text-text-placeholder">
            {isInClass ? t('chapterOutline.inClassShort') : t('chapterOutline.notStartedShort')}
          </span>
          <span className="ml-auto text-tag tracking-[0.04em] text-text-placeholder">
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
        className="flex w-full items-center gap-1.5 rounded-btn px-2 py-1.5 text-left text-tag tracking-[0.04em] font-medium text-text-sub hover:bg-bg-light dark:text-text-main-dark dark:hover:bg-slate-800"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        <span className={allDone ? 'text-green-500' : ''}>
          U{unit.unitNumber}
        </span>
        <span className="truncate flex-1">{unit.title}</span>
        <span className="shrink-0 text-[10px] text-text-placeholder">
          {completedCount}/{unit.chapters.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-2 border-l border-border-light pl-2 dark:border-border-dark">
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
      className={`flex items-start gap-1.5 rounded-btn px-2 py-1 text-tag tracking-[0.04em] ${
        isCurrent
          ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'text-text-sub dark:text-text-placeholder'
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
