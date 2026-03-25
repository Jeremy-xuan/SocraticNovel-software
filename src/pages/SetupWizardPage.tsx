import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { setApiKey, initBuiltinWorkspace } from '../lib/tauri';

type Step = 'welcome' | 'provider' | 'apikey' | 'workspace' | 'done';

export default function SetupWizardPage() {
  const { t } = useTranslation();
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
              {t('setup.welcomeTitle')}
            </h1>
            <p className="mb-8 text-text-sub dark:text-text-placeholder">
              {t('setup.welcomeDesc')}
            </p>
            <p className="mb-8 text-aux text-text-placeholder dark:text-text-sub">
              {t('setup.welcomeHint')}
            </p>
            <button
              onClick={() => setStep('provider')}
              className="rounded-btn bg-primary px-8 py-3 font-medium text-white transition-colors hover:bg-[#BF6A4E] h-[38px]"
            >
              {t('setup.startSetup')}
            </button>
          </div>
        )}

        {/* Step: Provider */}
        {step === 'provider' && (
          <div>
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              {t('setup.selectProvider')}
            </h2>
            <p className="mb-6 text-aux text-text-sub dark:text-text-placeholder">
              {t('setup.selectProviderDesc')}
            </p>
            <div className="mb-6 grid grid-cols-2 gap-3">
              {([
                { id: 'anthropic' as const, label: '🟣 Anthropic', sub: t('setup.providerRecommended') },
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
                {t('common.back')}
              </button>
              <button
                onClick={() => setStep('apikey')}
                className="rounded-btn bg-primary px-6 py-2 font-medium text-white hover:bg-[#BF6A4E] h-[38px]"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}

        {/* Step: API Key */}
        {step === 'apikey' && (
          <div>
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              {t('setup.enterApiKey')}
            </h2>
            <p className="mb-6 text-aux text-text-sub dark:text-text-placeholder">
              {t('setup.apiKeySecure')}
            </p>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={t('setup.apiKeyPlaceholder', { provider })}
              className="mb-4 w-full rounded-btn border border-border-light bg-surface-light px-4 py-3 text-aux text-text-main placeholder-text-placeholder focus:bg-surface-light focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-text-main-dark"
              autoFocus
            />
            {error && <p className="mb-4 text-aux text-danger">❌ {error}</p>}
            <div className="flex justify-between">
              <button
                onClick={() => setStep('provider')}
                className="text-aux text-text-placeholder hover:text-text-sub dark:hover:text-text-main-dark"
              >
                {t('common.back')}
              </button>
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim() || saving}
                className="rounded-btn bg-primary px-6 py-2 font-medium text-white hover:bg-[#BF6A4E] disabled:opacity-50 h-[38px]"
              >
                {saving ? t('setup.saving') : t('setup.saveAndContinue')}
              </button>
            </div>
          </div>
        )}

        {/* Step: Workspace */}
        {step === 'workspace' && (
          <div>
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              {t('setup.selectContent')}
            </h2>
            <p className="mb-6 text-aux text-text-sub dark:text-text-placeholder">
              {t('setup.selectContentDesc')}
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
                      {t('setup.builtinTitle')}
                    </div>
                    <div className="text-tag tracking-[0.04em] text-text-placeholder">
                      {t('setup.builtinDesc')}
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
                      {t('setup.createFromScratch')}
                    </div>
                    <div className="text-tag tracking-[0.04em] text-text-placeholder">
                      {t('setup.createFromScratchDesc')}
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
                      {t('setup.importWorkspace')}
                    </div>
                    <div className="text-tag tracking-[0.04em] text-text-placeholder">
                      {t('setup.importWorkspaceDesc')}
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
              {t('common.back')}
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="mb-4 text-5xl">🎉</div>
            <h2 className="mb-2 text-title leading-tight tracking-[0.04em] font-medium text-text-main dark:text-text-main-dark">
              {t('setup.setupComplete')}
            </h2>
            <p className="mb-8 text-text-sub dark:text-text-placeholder">
              {t('setup.setupCompleteDesc')}
            </p>
            <button
              onClick={handleFinish}
              className="rounded-btn bg-primary px-8 py-3 font-medium text-white transition-colors hover:bg-[#BF6A4E] h-[38px]"
            >
              {t('setup.enterApp')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
