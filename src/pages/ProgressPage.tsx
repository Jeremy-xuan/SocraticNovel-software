import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { readFile } from '../lib/tauri';
import { useAppStore } from '../stores/appStore';

// ─── Types ──────────────────────────────────────────────────
interface LessonRecord {
  date: string;
  chapter: string;
  topic: string;
  teacher: string;
  conceptMastery: string;
  computeMastery: string;
  notes: string;
}

interface KnowledgePoint {
  id: string;
  text: string;
  status: 'done' | 'partial' | 'todo';
}

interface ChapterKP {
  chapter: string;
  title: string;
  points: KnowledgePoint[];
}

interface SessionEntry {
  date: string;
  chapter: string;
  teacher: string;
  summary: string;
}

interface DiaryEntry {
  date: string;
  content: string;
}

// ─── Parsers ────────────────────────────────────────────────
function parseProgress(md: string): LessonRecord[] {
  const lines = md.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
  if (lines.length <= 1) return []; // header only
  return lines.slice(1).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 6 || cells[0] === '（暂无）') return null;
    return {
      date: cells[0], chapter: cells[1], topic: cells[2],
      teacher: cells[3], conceptMastery: cells[4], computeMastery: cells[5],
      notes: cells[6] || '',
    };
  }).filter(Boolean) as LessonRecord[];
}

function parseKnowledgePoints(md: string): ChapterKP[] {
  const chapters: ChapterKP[] = [];
  let current: ChapterKP | null = null;

  for (const line of md.split('\n')) {
    const chapterMatch = line.match(/^###\s+(Ch\.\d+)\s+(.+?)(?:\s*[✅🔄])?$/);
    if (chapterMatch) {
      current = { chapter: chapterMatch[1], title: chapterMatch[2].trim(), points: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue;
    const kpMatch = line.match(/^-\s+\[([ x~])\]\s+(\d+\.\d+)\s+(.+)$/);
    if (kpMatch) {
      const status = kpMatch[1] === 'x' ? 'done' : kpMatch[1] === '~' ? 'partial' : 'todo';
      current.points.push({ id: kpMatch[2], text: kpMatch[3], status });
    }
  }
  return chapters;
}

function parseSessionLog(md: string): SessionEntry[] {
  const entries: SessionEntry[] = [];
  const blocks = md.split(/^## /m).slice(1);
  for (const block of blocks) {
    const headerMatch = block.match(/^(\d{4}-\d{2}-\d{2})\s+(Ch\.\d+)\s*—\s*(.+?)(?:・(.+?))?$/m);
    if (headerMatch) {
      entries.push({
        date: headerMatch[1],
        chapter: headerMatch[2],
        teacher: headerMatch[4] || '',
        summary: block.split('\n').slice(1).join(' ').trim().slice(0, 300),
      });
    }
  }
  return entries;
}

function parseDiary(md: string): DiaryEntry[] {
  const entries: DiaryEntry[] = [];
  const blocks = md.split(/^## /m).slice(1);
  for (const block of blocks) {
    const dateMatch = block.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const content = block.split('\n').slice(1).join('\n').trim();
      if (content) entries.push({ date: dateMatch[1], content });
    }
  }
  return entries;
}

// ─── Component ──────────────────────────────────────────────
export default function ProgressPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const workspacePath = useAppStore((s) => s.settings.currentWorkspacePath);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [chapters, setChapters] = useState<ChapterKP[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [tab, setTab] = useState<'overview' | 'knowledge' | 'log'>('overview');

  const loadData = useCallback(async () => {
    if (!workspacePath) { setError('Workspace not initialized'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [progressMd, kpMd, sessionMd, diaryMd] = await Promise.all([
        readFile(workspacePath, 'teacher/runtime/progress.md').catch(() => ''),
        readFile(workspacePath, 'teacher/config/knowledge_points.md').catch(() => ''),
        readFile(workspacePath, 'teacher/runtime/session_log.md').catch(() => ''),
        readFile(workspacePath, 'teacher/runtime/diary.md').catch(() => ''),
      ]);
      setLessons(parseProgress(progressMd));
      setChapters(parseKnowledgePoints(kpMd));
      setSessions(parseSessionLog(sessionMd));
      setDiary(parseDiary(diaryMd));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Stats ────────────────────────────────────────────
  const totalKP = chapters.reduce((s, c) => s + c.points.length, 0);
  const doneKP = chapters.reduce((s, c) => s + c.points.filter(p => p.status === 'done').length, 0);
  const partialKP = chapters.reduce((s, c) => s + c.points.filter(p => p.status === 'partial').length, 0);
  const overallPct = totalKP > 0 ? Math.round((doneKP + partialKP * 0.5) / totalKP * 100) : 0;
  const completedChapters = chapters.filter(c => c.points.length > 0 && c.points.every(p => p.status === 'done')).length;

  return (
    <div className="flex h-screen flex-col bg-bg-light pt-8 dark:bg-bg-dark">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border-light bg-surface-light px-6 py-3 dark:border-border-dark dark:bg-surface-dark">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
          >
            {t('progress.back')}
          </button>
          <h1 className="text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('progress.title')}
          </h1>
        </div>
        <button
          onClick={loadData}
          className="rounded-btn border border-border-light px-3 py-1 text-tag tracking-[0.04em] text-text-sub hover:bg-bg-light dark:border-slate-600 dark:text-text-placeholder"
        >
          {t('progress.refresh')}
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-text-placeholder">{t('common.loading')}</div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-red-400">{error}</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Stats Cards */}
          <div className="mx-auto max-w-5xl px-6 pt-6">
            <div className="grid grid-cols-4 gap-4">
              <StatCard label={t('progress.overallProgress')} value={`${overallPct}%`} sub={t('progress.knowledgePoints', { done: doneKP, total: totalKP })} color="blue" />
              <StatCard label={t('progress.completedChapters')} value={`${completedChapters}`} sub={t('progress.totalChapters', { count: chapters.length })} color="green" />
              <StatCard label={t('progress.lessonsCompleted')} value={`${sessions.length}`} sub={t('progress.lessonsUnit')} color="purple" />
              <StatCard label={t('progress.diary')} value={`${diary.length}`} sub={t('progress.diaryUnit')} color="amber" />
            </div>
          </div>

          {/* Tab bar */}
          <div className="mx-auto max-w-5xl px-6 pt-6">
            <div className="flex gap-1 rounded-btn bg-bg-light p-1 dark:bg-surface-dark">
              {([
                { key: 'overview' as const, label: t('progress.tabOverview') },
                { key: 'knowledge' as const, label: t('progress.tabKnowledge') },
                { key: 'log' as const, label: t('progress.tabLog') },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-btn px-3 py-1.5 text-tag tracking-[0.04em] font-medium transition-colors ${
                    tab === key
                      ? 'bg-surface-light text-text-main shadow-card dark:bg-slate-700 dark:text-text-main-dark'
                      : 'text-text-sub hover:text-text-main dark:text-text-placeholder'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="mx-auto max-w-5xl px-6 py-6">
            {tab === 'overview' && <OverviewTab chapters={chapters} lessons={lessons} diary={diary} />}
            {tab === 'knowledge' && <KnowledgeTab chapters={chapters} />}
            {tab === 'log' && <LogTab sessions={sessions} diary={diary} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub Components ─────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-primary dark:text-blue-400',
    green: 'text-success dark:text-emerald-400',
    purple: 'text-primary dark:text-purple-400',
    amber: 'text-warning dark:text-amber-400',
  };
  return (
    <div className="rounded-card border border-border-light bg-surface-light p-4 dark:border-border-dark dark:bg-surface-dark">
      <p className="text-tag tracking-[0.04em] text-text-placeholder">{label}</p>
      <p className={`mt-1 text-title leading-tight tracking-[0.04em] font-medium ${colorMap[color]}`}>{value}</p>
      <p className="text-tag tracking-[0.04em] text-text-placeholder">{sub}</p>
    </div>
  );
}

function OverviewTab({ chapters, lessons, diary }: { chapters: ChapterKP[]; lessons: LessonRecord[]; diary: DiaryEntry[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {/* Chapter Progress Bars */}
      <section>
        <h2 className="mb-3 text-aux font-medium text-text-sub dark:text-text-main-dark">{t('progress.chapterCoverage')}</h2>
        <div className="space-y-2">
          {chapters.map(ch => {
            const total = ch.points.length;
            if (total === 0) return null;
            const done = ch.points.filter(p => p.status === 'done').length;
            const partial = ch.points.filter(p => p.status === 'partial').length;
            const pct = Math.round((done + partial * 0.5) / total * 100);
            return (
              <div key={ch.chapter} className="flex items-center gap-3">
                <span className="w-16 text-tag tracking-[0.04em] font-mono text-text-sub dark:text-text-placeholder">{ch.chapter}</span>
                <div className="flex-1">
                  <div className="h-3 overflow-hidden rounded-full bg-bg-light dark:bg-slate-700">
                    <div
                      className="flex h-full transition-all"
                      style={{ width: `${pct}%` }}
                    >
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
                      />
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: total > 0 ? `${(partial / total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                </div>
                <span className="w-12 text-right text-tag tracking-[0.04em] text-text-placeholder">{pct}%</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-4 text-[10px] text-text-placeholder">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> {t('progress.masteredLabel')}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> {t('progress.partialLabel')}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700" /> {t('progress.uncoveredLabel')}</span>
        </div>
      </section>

      {/* Lesson History */}
      {lessons.length > 0 && (
        <section>
          <h2 className="mb-3 text-aux font-medium text-text-sub dark:text-text-main-dark">{t('progress.sessionLog')}</h2>
          <div className="overflow-hidden rounded-btn border border-border-light dark:border-border-dark">
            <table className="w-full text-tag tracking-[0.04em]">
              <thead className="bg-bg-light dark:bg-surface-dark">
                <tr>
                  {[t('progress.dateHeader'), t('progress.chapterHeader'), t('progress.topicHeader'), t('progress.teacherHeader'), t('progress.conceptHeader'), t('progress.computeHeader')].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-text-sub">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {lessons.map((l, i) => (
                  <tr key={i} className="bg-surface-light dark:bg-surface-dark/50">
                    <td className="px-3 py-2 text-text-sub dark:text-text-main-dark">{l.date}</td>
                    <td className="px-3 py-2 font-mono text-text-sub">{l.chapter}</td>
                    <td className="px-3 py-2 text-text-sub dark:text-text-main-dark">{l.topic}</td>
                    <td className="px-3 py-2">{l.teacher}</td>
                    <td className="px-3 py-2">{l.conceptMastery}</td>
                    <td className="px-3 py-2">{l.computeMastery}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Latest Diary */}
      {diary.length > 0 && (
        <section>
          <h2 className="mb-3 text-aux font-medium text-text-sub dark:text-text-main-dark">{t('progress.recentDiary')}</h2>
          <div className="rounded-btn border border-border-light bg-surface-light p-4 dark:border-border-dark dark:bg-surface-dark">
            <p className="mb-1 text-[10px] text-text-placeholder">{diary[0].date}</p>
            <p className="text-aux leading-relaxed text-text-sub dark:text-text-main-dark italic">
              {diary[0].content}
            </p>
          </div>
        </section>
      )}

      {/* Empty state */}
      {lessons.length === 0 && diary.length === 0 && (
        <div className="rounded-btn border border-dashed border-border-light p-8 text-center text-aux text-text-placeholder dark:border-slate-600">
          {t('progress.noRecords')}
        </div>
      )}
    </div>
  );
}

function KnowledgeTab({ chapters }: { chapters: ChapterKP[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {chapters.map(ch => {
        const total = ch.points.length;
        if (total === 0) return null;
        const done = ch.points.filter(p => p.status === 'done').length;
        const partial = ch.points.filter(p => p.status === 'partial').length;
        const isOpen = expanded === ch.chapter;
        const statusIcon = done === total ? '✅' : done + partial > 0 ? '🔄' : '⬜';

        return (
          <div key={ch.chapter} className="rounded-btn border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark">
            <button
              onClick={() => setExpanded(isOpen ? null : ch.chapter)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-base">{statusIcon}</span>
              <div className="flex-1">
                <span className="text-aux font-medium text-text-main dark:text-text-main-dark">
                  {ch.chapter} — {ch.title}
                </span>
                <span className="ml-2 text-tag tracking-[0.04em] text-text-placeholder">
                  {t('progress.knowledgeMastered', { done, total })}{partial > 0 ? t('progress.knowledgePartial', { count: partial }) : ''}
                </span>
              </div>
              <span className="text-text-placeholder">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3 dark:border-border-dark">
                <div className="grid gap-1">
                  {ch.points.map(kp => (
                    <div key={kp.id} className="flex items-start gap-2 text-tag tracking-[0.04em]">
                      <span className={`mt-0.5 ${
                        kp.status === 'done' ? 'text-success' :
                        kp.status === 'partial' ? 'text-warning' : 'text-text-main-dark'
                      }`}>
                        {kp.status === 'done' ? '✓' : kp.status === 'partial' ? '◐' : '○'}
                      </span>
                      <span className="font-mono text-text-placeholder">{kp.id}</span>
                      <span className={`${
                        kp.status === 'done' ? 'text-text-sub' :
                        kp.status === 'partial' ? 'text-amber-700 dark:text-amber-300' :
                        'text-text-sub dark:text-text-main-dark'
                      }`}>
                        {kp.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LogTab({ sessions, diary }: { sessions: SessionEntry[]; diary: DiaryEntry[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {sessions.length === 0 && diary.length === 0 && (
        <div className="rounded-btn border border-dashed border-border-light p-8 text-center text-aux text-text-placeholder dark:border-slate-600">
          {t('progress.noRecordsShort')}
        </div>
      )}

      {/* Interleave sessions and diary entries by date */}
      {sessions.map((s, i) => {
        const matchingDiary = diary.find(d => d.date === s.date);
        return (
          <div key={i} className="rounded-btn border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-border-dark">
              <div className="flex items-center justify-between">
                <h3 className="text-aux font-medium text-text-main dark:text-text-main-dark">
                  {s.chapter} — {s.teacher}
                </h3>
                <span className="text-tag tracking-[0.04em] text-text-placeholder">{s.date}</span>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-tag tracking-[0.04em] leading-relaxed text-text-sub dark:text-text-placeholder">{s.summary}</p>
              {matchingDiary && (
                <div className="mt-3 rounded-btn bg-bg-light p-3 dark:bg-surface-dark/80">
                  <p className="mb-1 text-[10px] font-medium text-text-placeholder">{t('progress.diaryLabel')}</p>
                  <p className="text-tag tracking-[0.04em] italic leading-relaxed text-text-sub dark:text-text-placeholder">
                    {matchingDiary.content}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Diary entries without matching sessions */}
      {diary.filter(d => !sessions.some(s => s.date === d.date)).map((d, i) => (
        <div key={`diary-${i}`} className="rounded-btn border border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-text-placeholder">{t('progress.diaryLabel')}</p>
              <span className="text-tag tracking-[0.04em] text-text-placeholder">{d.date}</span>
            </div>
            <p className="text-tag tracking-[0.04em] italic leading-relaxed text-text-sub dark:text-text-placeholder">
              {d.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
