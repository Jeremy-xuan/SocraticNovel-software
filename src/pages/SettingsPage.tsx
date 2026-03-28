import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { setApiKey, hasApiKey, startGithubOauth, checkGithubAuth, logoutGithub } from '../lib/tauri';
import i18n from '../i18n';

const PROVIDER_MODELS: Record<string, Array<{ id: string; label: string; default?: boolean }>> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (2025-05-14)', default: true },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', default: false },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', default: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', default: false },
    { id: 'o3-mini', label: 'o3-mini', default: false },
    { id: 'o1', label: 'o1', default: false },
  ],
  deepseek: [
    { id: 'deepseek-reasoner', label: 'DeepSeek-R1', default: true },
    { id: 'deepseek-chat', label: 'DeepSeek-V3', default: false },
  ],
  google: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', default: true },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', default: false },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
  github: [
    { id: 'gpt-4o', label: 'GPT-4o', default: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'o3-mini', label: 'o3-mini' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'Mistral-Large-2', label: 'Mistral Large 2' },
  ],
};

const MODEL_LABEL_SUFFIX: Record<string, string> = {
  'claude-haiku-4-5': 'settings.modelLabels.claudeHaikuFast',
  'gpt-4o-mini': 'settings.modelLabels.gpt4oMiniFast',
  'o3-mini': 'settings.modelLabels.o3MiniReasoning',
  'o1': 'settings.modelLabels.o1Reasoning',
  'deepseek-reasoner': 'settings.modelLabels.deepseekR1',
  'deepseek-chat': 'settings.modelLabels.deepseekV3',
  'gemini-2.0-flash': 'settings.modelLabels.geminiFast',
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, updateSettings } = useAppStore();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [keyExists, setKeyExists] = useState(false);
  const [githubAuthed, setGithubAuthed] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  useEffect(() => {
    // Check if key exists for current provider
    if (settings.aiProvider === 'github') {
      checkGithubAuth().then((authed) => {
        setGithubAuthed(authed);
        setKeyExists(authed);
        updateSettings({ apiKeyConfigured: authed });
      });
    } else {
      hasApiKey(settings.aiProvider).then((exists) => {
        setKeyExists(exists);
        updateSettings({ apiKeyConfigured: exists });
      });
    }
  }, [settings.aiProvider]);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await setApiKey(settings.aiProvider, apiKeyInput.trim());
      updateSettings({ apiKeyConfigured: true });
      setKeyExists(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setApiKeyInput('');
    } catch (err) {
      console.error('Failed to save API key:', err);
    }
  };

  const handleGithubLogin = async () => {
    const clientId = settings.githubClientId?.trim();
    if (!clientId) {
      setGithubError(t('settings.githubClientIdRequired'));
      return;
    }
    setGithubLoading(true);
    setGithubError(null);
    try {
      await startGithubOauth(clientId);
      setGithubAuthed(true);
      updateSettings({ apiKeyConfigured: true });
    } catch (err: unknown) {
      setGithubError(String(err));
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGithubLogout = async () => {
    try {
      await logoutGithub();
      setGithubAuthed(false);
      updateSettings({ apiKeyConfigured: false });
    } catch (err) {
      console.error('Failed to logout GitHub:', err);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
      <header className="flex h-12 shrink-0 items-center border-b border-border-light px-4 dark:border-border-dark">
        <button
          onClick={() => navigate('/')}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder"
        >
          {t('common.back')}
        </button>
        <span className="ml-4 text-aux font-medium text-text-main dark:text-text-main-dark">
          {t('settings.title')}
        </span>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto p-8">
        {/* AI Provider */}
        <section className="mb-8">
          <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('settings.defaultProvider')}
          </h2>
          <p className="mb-4 text-tag tracking-[0.04em] text-text-placeholder">
            {t('settings.providerDesc')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(['anthropic', 'openai', 'google', 'deepseek', 'github'] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => updateSettings({ aiProvider: provider, aiModel: null })}
                className={`rounded-btn border p-3 text-left text-aux transition-colors ${settings.aiProvider === provider
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-border-light text-text-sub hover:bg-bg-light dark:border-border-dark dark:text-text-main-dark'
                  }`}
              >
                {provider === 'anthropic' && '🟣 Anthropic (Claude)'}
                {provider === 'openai' && '🟢 OpenAI'}
                {provider === 'google' && '🔵 Google (Gemini)'}
                {provider === 'deepseek' && '🔷 DeepSeek'}
                {provider === 'github' && '🐙 GitHub Models'}
              </button>
            ))}
          </div>
        </section>

        {/* Model */}
        <section className="mb-8">
          <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('settings.model')}
          </h2>
          <p className="mb-3 text-tag tracking-[0.04em] text-text-placeholder">
            {t('settings.modelDesc')}
          </p>
          <div className="flex flex-col gap-2">
            {(PROVIDER_MODELS[settings.aiProvider] ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => updateSettings({ aiModel: m.default && settings.aiModel === null ? null : m.id })}
                className={`flex items-center justify-between rounded-btn border px-4 py-2.5 text-left text-aux transition-colors ${(settings.aiModel === m.id) || (settings.aiModel === null && m.default)
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-border-light text-text-sub hover:bg-bg-light dark:border-border-dark dark:text-text-main-dark'
                  }`}
              >
                <span>{MODEL_LABEL_SUFFIX[m.id] ? t(MODEL_LABEL_SUFFIX[m.id]) : m.label}</span>
                {m.default && (
                  <span className="ml-2 rounded bg-bg-light px-1.5 py-0.5 text-tag tracking-[0.04em] text-text-placeholder dark:bg-slate-700 dark:text-text-placeholder">
                    {t('settings.modelDefault')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* API Key / GitHub OAuth */}
        <section className="mb-8">
          {settings.aiProvider === 'github' ? (
            <>
              <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
                GitHub {t('settings.githubAuth')}
              </h2>

              {/* Client ID input */}
              <div className="mb-4">
                <label className="mb-1 block text-tag tracking-[0.04em] text-text-placeholder">
                  GitHub OAuth Client ID
                </label>
                <input
                  type="text"
                  value={settings.githubClientId ?? ''}
                  onChange={(e) => updateSettings({ githubClientId: e.target.value })}
                  placeholder={t('settings.githubClientIdPlaceholder')}
                  className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2 text-aux text-text-main placeholder-text-placeholder focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                />
                <p className="mt-1 text-tag tracking-[0.04em] text-text-placeholder">
                  {t('settings.githubClientIdHint')}
                </p>
              </div>

              {githubAuthed ? (
                <div className="flex items-center gap-3">
                  <span className="text-aux text-green-600 dark:text-green-400">
                    ✅ {t('settings.githubConnected')}
                  </span>
                  <button
                    onClick={handleGithubLogout}
                    className="rounded-btn border border-red-300 px-3 py-1.5 text-tag text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    {t('settings.githubLogout')}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={handleGithubLogin}
                    disabled={githubLoading}
                    className="flex items-center gap-2 rounded-btn bg-[#24292f] px-5 py-2.5 text-aux font-medium text-white hover:bg-[#32383f] disabled:opacity-60 dark:bg-[#f0f6fc] dark:text-[#24292f] dark:hover:bg-[#d0d7de]"
                  >
                    🐙 {githubLoading ? t('settings.githubLoggingIn') : t('settings.githubLogin')}
                  </button>
                  {githubLoading && (
                    <p className="mt-2 text-tag text-text-placeholder">
                      {t('settings.githubWaitingBrowser')}
                    </p>
                  )}
                  {githubError && (
                    <p className="mt-2 text-tag text-red-500 dark:text-red-400">{githubError}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
                API Key
              </h2>
              {keyExists && (
                <p className="mb-3 text-aux text-green-600 dark:text-green-400">
                  {t('settings.apiKeySaved', { provider: settings.aiProvider })}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={keyExists ? t('settings.apiKeyPlaceholderReplace') : t('settings.apiKeyPlaceholderNew', { provider: settings.aiProvider })}
                  className="flex-1 rounded-btn border border-border-light bg-surface-light px-4 py-2 text-aux text-text-main placeholder-text-placeholder focus:bg-surface-light focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                />
                <button
                  onClick={handleSaveKey}
                  className="rounded-btn bg-primary px-4 py-2 text-aux font-medium text-white hover:bg-[#BF6A4E] h-[38px]"
                >
                  {saved ? t('common.saved') : t('common.save')}
                </button>
              </div>
              <p className="mt-2 text-tag tracking-[0.04em] text-text-placeholder">
                {t('settings.apiKeyStorage')}
              </p>
            </>
          )}
        </section>

        {/* Theme */}
        <section className="mb-8">
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('settings.theme')}
          </h2>
          <div className="flex gap-3">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => updateSettings({ theme })}
                className={`rounded-btn border px-4 py-2 text-aux transition-colors ${settings.theme === theme
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-border-light text-text-sub hover:bg-bg-light dark:border-border-dark dark:text-text-main-dark'
                  }`}
              >
                {theme === 'light' && t('settings.themeLight')}
                {theme === 'dark' && t('settings.themeDark')}
                {theme === 'system' && t('settings.themeSystem')}
              </button>
            ))}
          </div>
        </section>

        {/* Language */}
        <section className="mb-8">
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('settings.language')}
          </h2>
          <div className="flex gap-3">
            {(['zh', 'en', 'auto'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  updateSettings({ language: lang });
                  if (lang === 'auto') {
                    i18n.changeLanguage(navigator.language.startsWith('zh') ? 'zh' : 'en');
                  } else {
                    i18n.changeLanguage(lang);
                  }
                }}
                className={`rounded-btn border px-4 py-2 text-aux transition-colors ${settings.language === lang
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-border-light text-text-sub hover:bg-bg-light dark:border-border-dark dark:text-text-main-dark'
                  }`}
              >
                {lang === 'zh' && t('settings.langZh')}
                {lang === 'en' && t('settings.langEn')}
                {lang === 'auto' && t('settings.langAuto')}
              </button>
            ))}
          </div>
        </section>

        {/* Layout Theme */}
        <section className="mb-8">
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('settings.homeLayout')}
          </h2>
          <div className="flex gap-4">
            {(['cards', 'input'] as const).map((layout) => (
              <button
                key={layout}
                onClick={() => updateSettings({ homeLayout: layout })}
                className={`flex-1 flex flex-col items-center justify-center rounded-btn border p-5 transition-all outline-none ${(settings.homeLayout || 'cards') === layout
                    ? 'border-primary bg-primary/5 text-primary dark:bg-primary/10 shadow-sm ring-1 ring-primary/20'
                    : 'border-border-light text-text-sub hover:bg-black/5 dark:border-border-dark dark:text-text-placeholder dark:hover:bg-white/5'
                  }`}
              >
                <div className="font-medium text-[15px] mb-1.5">{layout === 'cards' ? t('settings.layoutCards') : t('settings.layoutInput')}</div>
                <div className="text-[12px] opacity-70 tracking-wide">
                  {layout === 'cards' ? t('settings.layoutCardsDesc') : t('settings.layoutInputDesc')}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Workspace */}
        <section>
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            Workspace
          </h2>
          <div className="rounded-btn border border-border-light p-4 dark:border-border-dark">
            <p className="text-aux text-text-sub dark:text-text-placeholder">
              {t('settings.workspaceCurrent', { path: settings.currentWorkspacePath ?? t('settings.workspaceLoading') })}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
