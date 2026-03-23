import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { initBuiltinWorkspace, hasApiKey } from '../lib/tauri';

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  deepseek: 'DeepSeek',
};

function providerLabel(id: string) {
  return PROVIDER_LABELS[id] || id;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useAppStore();
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount: ensure workspace exists + check API key
    const init = async () => {
      try {
        const ws = await initBuiltinWorkspace();
        updateSettings({ currentWorkspaceId: ws.id });
        setWorkspaceReady(true);

        const keyOk = await hasApiKey(settings.aiProvider);
        updateSettings({ apiKeyConfigured: keyOk });
      } catch (err) {
        setInitError(String(err));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleStartLesson = () => {
    if (!settings.apiKeyConfigured) {
      navigate('/settings');
      return;
    }
    navigate('/lesson');
  };

  const handleStartReview = () => {
    if (!settings.apiKeyConfigured) {
      navigate('/settings');
      return;
    }
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
        {workspaceReady && (
          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
            📚 AP Physics C: E&M
          </p>
        )}
      </div>

      {/* Loading / Error */}
      {loading && (
        <p className="mb-6 text-sm text-slate-500 animate-pulse">正在初始化 workspace...</p>
      )}
      {initError && (
        <p className="mb-6 max-w-md text-center text-sm text-red-500">
          ⚠️ {initError}
        </p>
      )}

      {/* API key warning */}
      {!loading && !settings.apiKeyConfigured && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
          ⚠️ 当前提供商 <strong>{providerLabel(settings.aiProvider)}</strong> 尚未配置 API Key —{' '}
          <button
            onClick={() => navigate('/settings')}
            className="font-medium underline hover:no-underline"
          >
            前往设置
          </button>
        </div>
      )}

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
            甩题即练，AI 引导解题
          </span>
          <span className="mt-auto text-sm font-medium text-emerald-600 group-hover:text-emerald-700 dark:text-emerald-400">
            ▶ 开始刷题
          </span>
        </button>
      </div>

      {/* Bottom navigation */}
      <div className="mt-10 flex gap-4">
        <button
          onClick={() => navigate('/notes')}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          📝 课后笔记
        </button>
        <button
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          💬 查看群聊
        </button>
        <button
          onClick={() => navigate('/progress')}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          📊 学习进度
        </button>
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
