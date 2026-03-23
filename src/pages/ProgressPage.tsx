import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { readFile } from '../lib/tauri';

const WORKSPACE = '/Users/wujunjie/SocraticNovel/workspaces/ap-physics-em';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [chapters, setChapters] = useState<ChapterKP[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [tab, setTab] = useState<'overview' | 'knowledge' | 'log'>('overview');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [progressMd, kpMd, sessionMd, diaryMd] = await Promise.all([
        readFile(WORKSPACE, 'teacher/runtime/progress.md').catch(() => ''),
        readFile(WORKSPACE, 'teacher/config/knowledge_points.md').catch(() => ''),
        readFile(WORKSPACE, 'teacher/runtime/session_log.md').catch(() => ''),
        readFile(WORKSPACE, 'teacher/runtime/diary.md').catch(() => ''),
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
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Stats ────────────────────────────────────────────
  const totalKP = chapters.reduce((s, c) => s + c.points.length, 0);
  const doneKP = chapters.reduce((s, c) => s + c.points.filter(p => p.status === 'done').length, 0);
  const partialKP = chapters.reduce((s, c) => s + c.points.filter(p => p.status === 'partial').length, 0);
  const overallPct = totalKP > 0 ? Math.round((doneKP + partialKP * 0.5) / totalKP * 100) : 0;
  const completedChapters = chapters.filter(c => c.points.length > 0 && c.points.every(p => p.status === 'done')).length;

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            📊 学习进度
          </h1>
        </div>
        <button
          onClick={loadData}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
        >
          🔄 刷新
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">加载中...</div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-red-400">{error}</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Stats Cards */}
          <div className="mx-auto max-w-5xl px-6 pt-6">
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="总体进度" value={`${overallPct}%`} sub={`${doneKP}/${totalKP} 知识点`} color="blue" />
              <StatCard label="已完成章节" value={`${completedChapters}`} sub={`共 ${chapters.length} 章`} color="green" />
              <StatCard label="已上课次" value={`${sessions.length}`} sub="节" color="purple" />
              <StatCard label="日记" value={`${diary.length}`} sub="篇" color="amber" />
            </div>
          </div>

          {/* Tab bar */}
          <div className="mx-auto max-w-5xl px-6 pt-6">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {([['overview', '📋 总览'], ['knowledge', '🧠 知识点'], ['log', '📖 课堂记录']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === key
                      ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
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
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    purple: 'text-purple-600 dark:text-purple-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function OverviewTab({ chapters, lessons, diary }: { chapters: ChapterKP[]; lessons: LessonRecord[]; diary: DiaryEntry[] }) {
  return (
    <div className="space-y-6">
      {/* Chapter Progress Bars */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">章节覆盖率</h2>
        <div className="space-y-2">
          {chapters.map(ch => {
            const total = ch.points.length;
            if (total === 0) return null;
            const done = ch.points.filter(p => p.status === 'done').length;
            const partial = ch.points.filter(p => p.status === 'partial').length;
            const pct = Math.round((done + partial * 0.5) / total * 100);
            return (
              <div key={ch.chapter} className="flex items-center gap-3">
                <span className="w-16 text-xs font-mono text-slate-500 dark:text-slate-400">{ch.chapter}</span>
                <div className="flex-1">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
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
                <span className="w-12 text-right text-xs text-slate-400">{pct}%</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> 已掌握</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> 部分掌握</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700" /> 未覆盖</span>
        </div>
      </section>

      {/* Lesson History */}
      {lessons.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">课程记录</h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['日期', '章节', '主题', '老师', '概念', '计算'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {lessons.map((l, i) => (
                  <tr key={i} className="bg-white dark:bg-slate-800/50">
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{l.date}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{l.chapter}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{l.topic}</td>
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
          <h2 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">最近日记</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-1 text-[10px] text-slate-400">{diary[0].date}</p>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 italic">
              {diary[0].content}
            </p>
          </div>
        </section>
      )}

      {/* Empty state */}
      {lessons.length === 0 && diary.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-600">
          还没有课堂记录。上完第一节课后，Post-Lesson Agent 会自动更新进度数据。
        </div>
      )}
    </div>
  );
}

function KnowledgeTab({ chapters }: { chapters: ChapterKP[] }) {
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
          <div key={ch.chapter} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <button
              onClick={() => setExpanded(isOpen ? null : ch.chapter)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-base">{statusIcon}</span>
              <div className="flex-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {ch.chapter} — {ch.title}
                </span>
                <span className="ml-2 text-xs text-slate-400">
                  {done}/{total} 已掌握{partial > 0 ? `，${partial} 部分` : ''}
                </span>
              </div>
              <span className="text-slate-400">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                <div className="grid gap-1">
                  {ch.points.map(kp => (
                    <div key={kp.id} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 ${
                        kp.status === 'done' ? 'text-emerald-500' :
                        kp.status === 'partial' ? 'text-amber-500' : 'text-slate-300'
                      }`}>
                        {kp.status === 'done' ? '✓' : kp.status === 'partial' ? '◐' : '○'}
                      </span>
                      <span className="font-mono text-slate-400">{kp.id}</span>
                      <span className={`${
                        kp.status === 'done' ? 'text-slate-500' :
                        kp.status === 'partial' ? 'text-amber-700 dark:text-amber-300' :
                        'text-slate-600 dark:text-slate-300'
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
  return (
    <div className="space-y-4">
      {sessions.length === 0 && diary.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-600">
          还没有课堂记录
        </div>
      )}

      {/* Interleave sessions and diary entries by date */}
      {sessions.map((s, i) => {
        const matchingDiary = diary.find(d => d.date === s.date);
        return (
          <div key={i} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {s.chapter} — {s.teacher}
                </h3>
                <span className="text-xs text-slate-400">{s.date}</span>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.summary}</p>
              {matchingDiary && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/80">
                  <p className="mb-1 text-[10px] font-medium text-slate-400">📓 日记</p>
                  <p className="text-xs italic leading-relaxed text-slate-500 dark:text-slate-400">
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
        <div key={`diary-${i}`} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-slate-400">📓 日记</p>
              <span className="text-xs text-slate-400">{d.date}</span>
            </div>
            <p className="text-xs italic leading-relaxed text-slate-500 dark:text-slate-400">
              {d.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
