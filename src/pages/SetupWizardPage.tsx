import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { setApiKey, initBuiltinWorkspace } from '../lib/tauri';

type Step = 'welcome' | 'provider' | 'apikey' | 'workspace' | 'done';

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const { updateSettings } = useAppStore();
  const [step, setStep] = useState<Step>('welcome');
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'google' | 'deepseek'>('anthropic');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await setApiKey(provider, apiKeyInput.trim());
      updateSettings({ aiProvider: provider, apiKeyConfigured: true });
      setStep('workspace');
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectWorkspace = async (choice: 'builtin' | 'create' | 'import') => {
    setError(null);
    if (choice === 'builtin') {
      try {
        const ws = await initBuiltinWorkspace();
        updateSettings({ currentWorkspaceId: ws.id });
      } catch (err) {
        setError(String(err));
        return;
      }
    }
    // Mark setup complete
    localStorage.setItem('socratic-novel-setup-done', 'true');
    setStep('done');
  };

  const handleFinish = () => {
    navigate('/');
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-700 dark:bg-slate-800">
        {/* Progress indicator */}
        <div className="mb-8 flex justify-center gap-2">
          {(['welcome', 'provider', 'apikey', 'workspace', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                i <= ['welcome', 'provider', 'apikey', 'workspace', 'done'].indexOf(step)
                  ? 'bg-blue-500'
                  : 'bg-slate-200 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="text-center">
            <div className="mb-4 text-5xl">📖</div>
            <h1 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
              欢迎使用 SocraticNovel
            </h1>
            <p className="mb-8 text-slate-500 dark:text-slate-400">
              沉浸式 AI 苏格拉底教学——让三位轻小说角色成为你的物理家教。
            </p>
            <p className="mb-8 text-sm text-slate-400 dark:text-slate-500">
              接下来只需要几步简单设置，就可以开始上课了。
            </p>
            <button
              onClick={() => setStep('provider')}
              className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              开始设置 →
            </button>
          </div>
        )}

        {/* Step: Provider */}
        {step === 'provider' && (
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              选择 AI 提供商
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              SocraticNovel 需要一个 AI API Key 来驱动教学。推荐使用 Anthropic (Claude)。
            </p>
            <div className="mb-6 grid grid-cols-2 gap-3">
              {([
                { id: 'anthropic' as const, label: '🟣 Anthropic', sub: 'Claude (推荐)' },
                { id: 'openai' as const, label: '🟢 OpenAI', sub: 'GPT-4o' },
                { id: 'google' as const, label: '🔵 Google', sub: 'Gemini' },
                { id: 'deepseek' as const, label: '🔷 DeepSeek', sub: 'DeepSeek' },
              ]).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    provider === p.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="font-medium text-slate-800 dark:text-slate-100">{p.label}</div>
                  <div className="text-xs text-slate-400">{p.sub}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('welcome')}
                className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ← 返回
              </button>
              <button
                onClick={() => setStep('apikey')}
                className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {/* Step: API Key */}
        {step === 'apikey' && (
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              输入 API Key
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              你的 API Key 将安全存储在 macOS Keychain 中，不会发送到任何第三方服务器。
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={`输入 ${provider} API Key (sk-...)...`}
              className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              autoFocus
            />
            {error && <p className="mb-4 text-sm text-red-500">❌ {error}</p>}
            <div className="flex justify-between">
              <button
                onClick={() => setStep('provider')}
                className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ← 返回
              </button>
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim() || saving}
                className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存并继续 →'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Workspace */}
        {step === 'workspace' && (
          <div>
            <h2 className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              选择教学内容
            </h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              选择你要体验的教学系统。
            </p>
            <div className="mb-6 space-y-3">
              <button
                onClick={() => handleSelectWorkspace('builtin')}
                className="w-full rounded-lg border border-slate-200 p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm dark:border-slate-600 dark:hover:border-blue-600"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      体验 AP Physics C: E&M
                    </div>
                    <div className="text-xs text-slate-400">
                      内置完整教学系统——三位老师、苏格拉底教学、轻小说叙事
                    </div>
                  </div>
                </div>
              </button>
              <button
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-slate-200 p-4 text-left opacity-50 dark:border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔨</span>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      从零创建教学系统
                    </div>
                    <div className="text-xs text-slate-400">
                      使用 Meta Prompt 创建自定义教学系统（即将推出）
                    </div>
                  </div>
                </div>
              </button>
              <button
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-slate-200 p-4 text-left opacity-50 dark:border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📁</span>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      导入已有 Workspace
                    </div>
                    <div className="text-xs text-slate-400">
                      从文件夹导入已有的 SocraticNovel workspace（即将推出）
                    </div>
                  </div>
                </div>
              </button>
            </div>
            {error && <p className="mb-4 text-sm text-red-500">❌ {error}</p>}
            <button
              onClick={() => setStep('apikey')}
              className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              ← 返回
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="mb-4 text-5xl">🎉</div>
            <h2 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
              设置完成！
            </h2>
            <p className="mb-8 text-slate-500 dark:text-slate-400">
              一切就绪。点击下方按钮，开始你的苏格拉底教学之旅。
            </p>
            <button
              onClick={handleFinish}
              className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              进入 SocraticNovel →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
