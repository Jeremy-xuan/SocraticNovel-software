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
    if (choice === 'create') {
      // Mark setup complete first, then navigate to meta prompt page
      localStorage.setItem('socratic-novel-setup-done', 'true');
      navigate('/meta-prompt');
      return;
    }
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
    <div className="flex h-screen items-center justify-center bg-bg-light dark:bg-bg-dark">
      <div className="w-full max-w-lg rounded-block border border-border-light bg-surface-light p-8 shadow-lg dark:border-border-dark dark:bg-surface-dark">
        {/* Progress indicator */}
        <div className="mb-8 flex justify-center gap-2">
          {(['welcome', 'provider', 'apikey', 'workspace', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                i <= ['welcome', 'provider', 'apikey', 'workspace', 'done'].indexOf(step)
                  ? 'bg-primary'
                  : 'bg-slate-200 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="text-center">
            <div className="mb-4 text-5xl">📖</div>
            <h1 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              欢迎使用 SocraticNovel
            </h1>
            <p className="mb-8 text-text-sub dark:text-text-placeholder">
              沉浸式 AI 苏格拉底教学——让三位轻小说角色成为你的物理家教。
            </p>
            <p className="mb-8 text-aux text-text-placeholder dark:text-text-sub">
              接下来只需要几步简单设置，就可以开始上课了。
            </p>
            <button
              onClick={() => setStep('provider')}
              className="rounded-btn bg-primary px-8 py-3 font-medium text-white transition-colors hover:bg-[#BF6A4E] h-[38px]"
            >
              开始设置 →
            </button>
          </div>
        )}

        {/* Step: Provider */}
        {step === 'provider' && (
          <div>
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              选择 AI 提供商
            </h2>
            <p className="mb-6 text-aux text-text-sub dark:text-text-placeholder">
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
                  className={`rounded-btn border p-4 text-left transition-colors ${
                    provider === p.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-border-light hover:bg-bg-light dark:border-slate-600 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="font-medium text-text-main dark:text-text-main-dark">{p.label}</div>
                  <div className="text-tag tracking-[0.04em] text-text-placeholder">{p.sub}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setStep('welcome')}
                className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
              >
                ← 返回
              </button>
              <button
                onClick={() => setStep('apikey')}
                className="rounded-btn bg-primary px-6 py-2 font-medium text-white hover:bg-[#BF6A4E] h-[38px]"
              >
                下一步 →
              </button>
            </div>
          </div>
        )}

        {/* Step: API Key */}
        {step === 'apikey' && (
          <div>
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              输入 API Key
            </h2>
            <p className="mb-6 text-aux text-text-sub dark:text-text-placeholder">
              你的 API Key 将安全存储在 macOS Keychain 中，不会发送到任何第三方服务器。
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={`输入 ${provider} API Key (sk-...)...`}
              className="mb-4 w-full rounded-btn border border-border-light bg-surface-light px-4 py-3 text-aux text-text-main placeholder-text-placeholder focus:bg-surface-light focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              autoFocus
            />
            {error && <p className="mb-4 text-aux text-danger">❌ {error}</p>}
            <div className="flex justify-between">
              <button
                onClick={() => setStep('provider')}
                className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
              >
                ← 返回
              </button>
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim() || saving}
                className="rounded-btn bg-primary px-6 py-2 font-medium text-white hover:bg-[#BF6A4E] disabled:opacity-50 h-[38px]"
              >
                {saving ? '保存中...' : '保存并继续 →'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Workspace */}
        {step === 'workspace' && (
          <div>
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              选择教学内容
            </h2>
            <p className="mb-6 text-aux text-text-sub dark:text-text-placeholder">
              选择你要体验的教学系统。
            </p>
            <div className="mb-6 space-y-3">
              <button
                onClick={() => handleSelectWorkspace('builtin')}
                className="w-full rounded-btn border border-border-light p-4 text-left transition-all hover:border-primary dark:hover:border-primary hover:shadow-float dark:border-slate-600 hover:border-primary dark:hover:border-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="text-title leading-tight tracking-[0.04em]">⚡</span>
                  <div>
                    <div className="font-medium text-text-main dark:text-text-main-dark">
                      体验 AP Physics C: E&M
                    </div>
                    <div className="text-tag tracking-[0.04em] text-text-placeholder">
                      内置完整教学系统——三位老师、苏格拉底教学、轻小说叙事
                    </div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => handleSelectWorkspace('create')}
                className="w-full rounded-btn border border-border-light p-4 text-left transition-all hover:border-primary hover:shadow-float dark:border-slate-600 hover:border-primary"
              >
                <div className="flex items-center gap-3">
                  <span className="text-title leading-tight tracking-[0.04em]">🔨</span>
                  <div>
                    <div className="font-medium text-text-main dark:text-text-main-dark">
                      从零创建教学系统
                    </div>
                    <div className="text-tag tracking-[0.04em] text-text-placeholder">
                      使用 Meta Prompt AI 引导创建自定义教学系统
                    </div>
                  </div>
                </div>
              </button>
              <button
                disabled
                className="w-full cursor-not-allowed rounded-btn border border-border-light p-4 text-left opacity-50 dark:border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <span className="text-title leading-tight tracking-[0.04em]">📁</span>
                  <div>
                    <div className="font-medium text-text-main dark:text-text-main-dark">
                      导入已有 Workspace
                    </div>
                    <div className="text-tag tracking-[0.04em] text-text-placeholder">
                      从文件夹导入已有的 SocraticNovel workspace（即将推出）
                    </div>
                  </div>
                </div>
              </button>
            </div>
            {error && <p className="mb-4 text-aux text-danger">❌ {error}</p>}
            <button
              onClick={() => setStep('apikey')}
              className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
            >
              ← 返回
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="mb-4 text-5xl">🎉</div>
            <h2 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              设置完成！
            </h2>
            <p className="mb-8 text-text-sub dark:text-text-placeholder">
              一切就绪。点击下方按钮，开始你的苏格拉底教学之旅。
            </p>
            <button
              onClick={handleFinish}
              className="rounded-btn bg-primary px-8 py-3 font-medium text-white transition-colors hover:bg-[#BF6A4E] h-[38px]"
            >
              进入 SocraticNovel →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
