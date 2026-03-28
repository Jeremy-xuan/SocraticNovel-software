import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { setApiKey, hasApiKey, startGithubOauth, checkGithubAuth, logoutGithub } from '../lib/tauri';
import i18n from '../i18n';

const PROVIDER_MODELS: Record<string, Array<{ id: string; label: string; default?: boolean }>> = {
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', default: true },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-5-20241022', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5-20250414', label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ],
  openai: [
    { id: 'gpt-5.4', label: 'GPT-5.4', default: true },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { id: 'gpt-5.1', label: 'GPT-5.1' },
    { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3.2', default: true },
    { id: 'deepseek-reasoner', label: 'DeepSeek V3.2 Thinking' },
  ],
  google: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', default: true },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite' },
  ],
  github: [
    { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (1×)', default: true },
    { id: 'claude-opus-4.6', label: 'Claude Opus 4.6 (2×)' },
    { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (1×)' },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 (0.33×)' },
    { id: 'gpt-5.4', label: 'GPT-5.4 (1×)' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (0.33×)' },
    { id: 'gpt-5.2', label: 'GPT-5.2 (1×)' },
    { id: 'gpt-5.1', label: 'GPT-5.1 (1×)' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini (included)' },
    { id: 'gpt-4.1', label: 'GPT-4.1 (included)' },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (1×)' },
    { id: 'gemini-3-flash', label: 'Gemini 3 Flash (0.33×)' },
    { id: 'grok-code-fast-1', label: 'Grok Code Fast 1 (0.33×)' },
  ],
};

const MODEL_LABEL_SUFFIX: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'settings.modelLabels.claudeHaikuFast',
  'gpt-5.4-mini': 'settings.modelLabels.gpt54MiniFast',
  'gpt-4o': 'settings.modelLabels.gpt4oFast',
  'deepseek-reasoner': 'settings.modelLabels.deepseekR1',
  'deepseek-chat': 'settings.modelLabels.deepseekV3',
  'gemini-3-flash-preview': 'settings.modelLabels.gemini3Flash',
  'gemini-3.1-flash-lite-preview': 'settings.modelLabels.gemini31FlashLite',
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
    setGithubLoading(true);
    setGithubError(null);
    try {
      await startGithubOauth();
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
                {provider === 'github' && (
                  <span className="inline-flex items-center gap-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="inline-block">
                      <path d="M7.998 15.035c-4.562 0-7.873-2.914-7.998-3.749V9.338c.085-.628.677-1.686 1.588-2.065.013-.07.024-.143.036-.218.029-.183.06-.384.126-.612-.201-.508-.254-1.084-.254-1.656 0-.87.128-1.769.693-2.484.579-.733 1.494-1.124 2.724-1.261 1.206-.134 2.262.034 2.944.765.05.053.096.108.139.165.044-.057.094-.112.143-.165.682-.731 1.738-.899 2.944-.765 1.23.137 2.145.528 2.724 1.261.566.715.693 1.614.693 2.484 0 .572-.053 1.148-.254 1.656.066.228.098.429.126.612.012.076.024.148.037.218.924.385 1.522 1.471 1.591 2.095v1.872c0 .766-3.351 3.795-8.002 3.795Zm0-1.485c2.28 0 4.584-1.11 5.002-1.433V7.862l-.023-.116c-.49.21-1.075.291-1.727.291-1.146 0-2.059-.327-2.71-.991A3.222 3.222 0 0 1 8 6.303a3.24 3.24 0 0 1-.544.743c-.65.664-1.563.991-2.71.991-.652 0-1.236-.081-1.727-.291l-.023.116v4.255c.419.323 2.722 1.433 5.002 1.433ZM6.762 2.83c-.193-.206-.637-.413-1.682-.297-1.019.113-1.479.404-1.713.7-.247.312-.369.789-.369 1.554 0 .793.129 1.171.308 1.371.162.181.519.379 1.442.379.853 0 1.339-.235 1.638-.54.315-.322.527-.827.617-1.553.117-.935-.037-1.395-.241-1.614Zm4.155-.297c-1.044-.116-1.488.091-1.681.297-.204.219-.359.679-.242 1.614.091.726.303 1.231.618 1.553.299.305.784.54 1.638.54.922 0 1.28-.198 1.442-.379.179-.2.308-.578.308-1.371 0-.765-.123-1.242-.37-1.554-.233-.296-.693-.587-1.713-.7Z" />
                      <path d="M6.25 9.037a.75.75 0 0 1 .75.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 .75-.75Zm4.25.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 1.5 0Z" />
                    </svg>
                    GitHub Copilot
                  </span>
                )}
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
