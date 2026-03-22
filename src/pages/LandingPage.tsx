import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

export default function LandingPage() {
  const navigate = useNavigate();
  const settings = useAppStore((s) => s.settings);

  const handleStartLesson = () => {
    navigate('/lesson');
  };

  const handleStartReview = () => {
    // TODO: Phase 2 — review mode
    navigate('/review');
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-2 text-4xl font-bold text-slate-800 dark:text-slate-100">
          SocraticNovel
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400">
          沉浸式 AI 苏格拉底教学
        </p>
        {settings.currentWorkspaceId && (
          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
            AP Physics C: E&M
          </p>
        )}
      </div>

      {/* Main cards */}
      <div className="flex gap-6">
        {/* Lesson card */}
        <button
          onClick={handleStartLesson}
          className="group flex w-64 flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-600"
        >
          <span className="mb-3 text-3xl">📖</span>
          <span className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
            上课
          </span>
          <span className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            继续苏格拉底教学课堂
          </span>
          <span className="mt-auto text-sm font-medium text-blue-600 group-hover:text-blue-700 dark:text-blue-400">
            ▶ 开始上课
          </span>
        </button>

        {/* Review card */}
        <button
          onClick={handleStartReview}
          className="group flex w-64 flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-600"
        >
          <span className="mb-3 text-3xl">🔄</span>
          <span className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
            复习 / 刷题
          </span>
          <span className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            间隔复习 + 场景化练习
          </span>
          <span className="mt-auto text-sm font-medium text-emerald-600 group-hover:text-emerald-700 dark:text-emerald-400">
            ▶ 开始复习
          </span>
        </button>
      </div>

      {/* Bottom navigation */}
      <div className="mt-10 flex gap-4">
        {['📝 课后笔记', '💬 查看群聊', '📊 学习进度'].map((label) => (
          <button
            key={label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Settings */}
      <button
        onClick={() => navigate('/settings')}
        className="mt-8 text-sm text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        ⚙️ 设置
      </button>
    </div>
  );
}
