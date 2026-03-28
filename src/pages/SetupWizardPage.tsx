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
    <div className="flex h-screen items-center justify-center bg-bg-light pt-8 dark:bg-bg-dark">
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
            <div className="mb-4 flex justify-center"><svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg></div>
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
                { id: 'anthropic' as const, label: <><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-purple-500" />Anthropic</>, sub: t('setup.providerRecommended') },
                { id: 'openai' as const, label: <><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-green-500" />OpenAI</>, sub: 'GPT-4o' },
                { id: 'google' as const, label: <><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-blue-500" />Google</>, sub: 'Gemini' },
                { id: 'deepseek' as const, label: <><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-sky-500" />DeepSeek</>, sub: 'DeepSeek' },
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
            {error && <p className="mb-4 flex items-center gap-1.5 text-aux text-danger"><svg className="inline-block h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</p>}
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
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
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
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.84-5.84a2.121 2.121 0 113-3l5.84 5.84m-1.42 1.42l5.84 5.84a2.121 2.121 0 01-3 3l-5.84-5.84" /></svg>
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
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
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
            {error && <p className="mb-4 flex items-center gap-1.5 text-aux text-danger"><svg className="inline-block h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</p>}
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
            <div className="mb-4 flex justify-center"><svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg></div>
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
