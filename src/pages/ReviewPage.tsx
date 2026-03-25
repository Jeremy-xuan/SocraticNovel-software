import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { getDueCards, updateReviewCard, getReviewStats, addReviewCards } from '../lib/tauri';
import type { ReviewCard, ReviewRating, ReviewStats } from '../types';

type Phase = 'loading' | 'idle' | 'reviewing' | 'flipped' | 'complete';

const RATING_OPTIONS: { value: ReviewRating; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😣', label: '忘了', color: 'bg-red-500 hover:bg-red-600' },
  { value: 2, emoji: '😰', label: '模糊', color: 'bg-orange-500 hover:bg-orange-600' },
  { value: 3, emoji: '🤔', label: '想起来了', color: 'bg-blue-500 hover:bg-blue-600' },
  { value: 4, emoji: '😊', label: '容易', color: 'bg-green-500 hover:bg-green-600' },
];

export default function ReviewPage() {
  const navigate = useNavigate();
  const { settings } = useAppStore();
  const wsPath = settings.currentWorkspacePath;

  const [phase, setPhase] = useState<Phase>('loading');
  const [dueCards, setDueCards] = useState<ReviewCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Add card form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newType, setNewType] = useState<'concept' | 'compute'>('concept');

  const loadData = useCallback(async () => {
    if (!wsPath) return;
    try {
      const [cards, st] = await Promise.all([getDueCards(wsPath), getReviewStats(wsPath)]);
      setDueCards(cards);
      setStats(st);
      if (cards.length > 0) {
        setPhase('idle');
      } else {
        setPhase('idle');
      }
    } catch (err) {
      setError(String(err));
      setPhase('idle');
    }
  }, [wsPath]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentCard = dueCards[currentIdx] ?? null;

  const handleStartReview = () => {
    if (dueCards.length === 0) return;
    setCurrentIdx(0);
    setReviewedCount(0);
    setPhase('reviewing');
  };

  const handleFlip = () => setPhase('flipped');

  const handleRate = async (rating: ReviewRating) => {
    if (!wsPath || !currentCard) return;
    try {
      await updateReviewCard(wsPath, currentCard.id, rating);
      const nextIdx = currentIdx + 1;
      setReviewedCount((c) => c + 1);

      if (nextIdx >= dueCards.length) {
        // All done
        const newStats = await getReviewStats(wsPath);
        setStats(newStats);
        setPhase('complete');
      } else {
        setCurrentIdx(nextIdx);
        setPhase('reviewing');
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleAddCard = async () => {
    if (!wsPath || !newFront.trim() || !newBack.trim()) return;
    try {
      await addReviewCards(wsPath, [
        {
          knowledgePoint: newFront.split('\n')[0].slice(0, 50),
          sourceChapter: '手动添加',
          cardType: newType,
          front: newFront,
          back: newBack,
        },
      ]);
      setNewFront('');
      setNewBack('');
      setShowAddForm(false);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showAddForm) return;
      if (phase === 'reviewing' && e.key === ' ') {
        e.preventDefault();
        handleFlip();
      }
      if (phase === 'flipped') {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 4) {
          e.preventDefault();
          handleRate(num as ReviewRating);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, currentCard, showAddForm]);

  if (!wsPath) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-500">请先选择工作区</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 dark:border-slate-700">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← 返回主页
        </button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">🧠 间隔复习</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          + 添加卡片
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">关闭</button>
        </div>
      )}

      {/* Add card form */}
      {showAddForm && (
        <div className="mx-auto mt-6 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">添加复习卡片</h3>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setNewType('concept')}
              className={`rounded-lg px-3 py-1 text-sm ${newType === 'concept' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              概念
            </button>
            <button
              onClick={() => setNewType('compute')}
              className={`rounded-lg px-3 py-1 text-sm ${newType === 'compute' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              计算
            </button>
          </div>
          <textarea
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            placeholder="正面（问题）"
            className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            rows={3}
          />
          <textarea
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            placeholder="背面（答案）"
            className="mb-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddCard}
              disabled={!newFront.trim() || !newBack.trim()}
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              添加
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {phase === 'loading' && (
          <p className="animate-pulse text-slate-500">加载复习队列...</p>
        )}

        {/* Idle: show stats + start button */}
        {phase === 'idle' && stats && (
          <div className="text-center">
            <div className="mb-8 grid grid-cols-4 gap-4">
              <StatBox label="总卡片" value={stats.totalCards} color="text-slate-700 dark:text-slate-200" />
              <StatBox label="今日待复习" value={stats.dueToday} color="text-amber-600 dark:text-amber-400" />
              <StatBox label="已掌握" value={stats.mastered} color="text-green-600 dark:text-green-400" />
              <StatBox label="今日已复习" value={reviewedCount} color="text-blue-600 dark:text-blue-400" />
            </div>

            {dueCards.length > 0 ? (
              <button
                onClick={handleStartReview}
                className="rounded-2xl bg-blue-500 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-blue-600 hover:shadow-xl"
              >
                开始复习 ({dueCards.length} 张卡片)
              </button>
            ) : (
              <div className="text-center">
                <p className="mb-2 text-2xl">🎉</p>
                <p className="text-lg text-slate-600 dark:text-slate-300">今日复习已完成！</p>
                <p className="mt-1 text-sm text-slate-400">添加新卡片或等待下次复习时间</p>
              </div>
            )}
          </div>
        )}

        {/* Reviewing: show front */}
        {phase === 'reviewing' && currentCard && (
          <div className="w-full max-w-xl text-center">
            <ProgressBar current={currentIdx + 1} total={dueCards.length} />
            <div
              onClick={handleFlip}
              className="mx-auto mt-6 cursor-pointer rounded-2xl border border-slate-200 bg-white p-10 shadow-lg transition-all hover:shadow-xl dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="mb-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {currentCard.cardType === 'concept' ? '概念' : '计算'}
              </span>
              <p className="mt-4 whitespace-pre-wrap text-lg text-slate-800 dark:text-slate-100">
                {currentCard.front}
              </p>
              <p className="mt-6 text-sm text-slate-400">点击翻转 (Space)</p>
            </div>
          </div>
        )}

        {/* Flipped: show answer + rating */}
        {phase === 'flipped' && currentCard && (
          <div className="w-full max-w-xl text-center">
            <ProgressBar current={currentIdx + 1} total={dueCards.length} />
            <div className="mx-auto mt-6 rounded-2xl border border-emerald-200 bg-white p-10 shadow-lg dark:border-emerald-700 dark:bg-slate-800">
              <span className="mb-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                答案
              </span>
              <p className="mt-4 whitespace-pre-wrap text-lg text-slate-800 dark:text-slate-100">
                {currentCard.back}
              </p>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleRate(opt.value)}
                  className={`flex flex-col items-center rounded-xl px-5 py-3 text-white shadow transition-all hover:shadow-md ${opt.color}`}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="mt-1 text-xs font-medium">{opt.label}</span>
                  <span className="mt-0.5 text-[10px] opacity-70">({opt.value})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Complete */}
        {phase === 'complete' && (
          <div className="text-center">
            <p className="mb-4 text-4xl">🎉</p>
            <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
              复习完成！
            </h2>
            <p className="mb-6 text-slate-500 dark:text-slate-400">
              本次复习了 {reviewedCount} 张卡片
            </p>
            {stats && (
              <div className="mb-8 grid grid-cols-3 gap-4">
                <StatBox label="总卡片" value={stats.totalCards} color="text-slate-700 dark:text-slate-200" />
                <StatBox label="已掌握" value={stats.mastered} color="text-green-600 dark:text-green-400" />
                <StatBox label="剩余待学" value={stats.totalCards - stats.mastered} color="text-amber-600 dark:text-amber-400" />
              </div>
            )}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => { loadData(); setPhase('loading'); }}
                className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600"
              >
                继续复习
              </button>
              <button
                onClick={() => navigate('/')}
                className="rounded-xl border border-slate-200 px-6 py-3 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
              >
                返回主页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-white px-5 py-3 shadow-sm dark:bg-slate-800">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{current} / {total}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
