import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { setApiKey, hasApiKey, startGithubDeviceFlow, pollGithubDeviceFlow, checkGithubAuth, logoutGithub, updateCustomProvider, startCodexOAuth, pollCodexAuth, checkCodexAuth, logoutCodex } from '../lib/tauri';
import { detectCustomProviderProtocol, parseCustomModelList, stringifyCustomModelList } from '../lib/customProvider';
import { getProviderModels } from '../lib/providerModels';
import i18n from '../i18n';

const MODEL_LABEL_SUFFIX: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'settings.modelLabels.claudeHaikuFast',
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
  const [deviceUserCode, setDeviceUserCode] = useState<string | null>(null);
  const [deviceVerifyUri, setDeviceVerifyUri] = useState<string | null>(null);
  const [showPremiumInfo, setShowPremiumInfo] = useState(false);
  const [modelListExpanded, setModelListExpanded] = useState(false);
  // Custom provider state
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [customApiKeyInput, setCustomApiKeyInput] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [customProtocol, setCustomProtocol] = useState<'openai-compatible' | 'anthropic-compatible'>('openai-compatible');
  const [customAutoDetectProtocol, setCustomAutoDetectProtocol] = useState(true);
  // Codex OAuth state
  const [codexAuthed, setCodexAuthed] = useState(false);
  const [codexLoading, setCodexLoading] = useState(false);
  const [codexError, setCodexError] = useState<string | null>(null);
  const showCodexOAuth = settings.aiProvider === 'openai';

  useEffect(() => {
    // Check if key exists for current provider
    if (settings.aiProvider === 'github') {
      checkGithubAuth().then((authed) => {
        setGithubAuthed(authed);
        setKeyExists(authed);
        updateSettings({ apiKeyConfigured: authed });
      });
    } else if (settings.aiProvider === 'custom') {
      // Custom provider - check if config exists
      const hasConfig = settings.customProviderConfig?.customUrl && settings.customProviderConfig?.apiKey;
      setKeyExists(!!hasConfig);
      updateSettings({ apiKeyConfigured: !!hasConfig });
    } else {
      hasApiKey(settings.aiProvider).then((exists) => {
        setKeyExists(exists);
        updateSettings({ apiKeyConfigured: exists });
      });
    }
    // Check Codex auth status only for OpenAI provider UI
    if (settings.aiProvider === 'openai') {
      checkCodexAuth().then(setCodexAuthed).catch(() => setCodexAuthed(false));
    } else {
      setCodexError(null);
      setCodexLoading(false);
    }
  }, [settings.aiProvider]);

  useEffect(() => {
    const config = settings.customProviderConfig;
    setCustomUrlInput(config?.customUrl ?? '');
    setCustomApiKeyInput(config?.apiKey ?? '');
    setCustomModelInput(stringifyCustomModelList(config?.models ?? (config?.model ? [config.model] : [])));
    setCustomProtocol(config?.protocol ?? 'openai-compatible');
    setCustomAutoDetectProtocol(config?.autoDetectProtocol ?? true);
  }, [settings.customProviderConfig]);

  useEffect(() => {
    if (!customAutoDetectProtocol) return;
    setCustomProtocol(detectCustomProviderProtocol(customUrlInput));
  }, [customAutoDetectProtocol, customUrlInput]);

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
    setDeviceUserCode(null);
    try {
      const flow = await startGithubDeviceFlow();
      setDeviceUserCode(flow.user_code);
      setDeviceVerifyUri(flow.verification_uri);
      window.open(flow.verification_uri, '_blank');
      await pollGithubDeviceFlow(flow.device_code, flow.interval);
      setGithubAuthed(true);
      setDeviceUserCode(null);
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
    <div className="flex h-screen flex-col bg-surface-light pt-8 dark:bg-bg-dark">
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

      <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
        {/* AI Provider */}
        <section className="mb-8">
          <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            {t('settings.defaultProvider')}
          </h2>
          <p className="mb-4 text-tag tracking-[0.04em] text-text-placeholder">
            {t('settings.providerDesc')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(['anthropic', 'openai', 'google', 'deepseek', 'github', 'custom'] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => updateSettings({ aiProvider: provider, aiModel: null })}
                className={`rounded-btn border p-3 text-left text-aux transition-colors ${settings.aiProvider === provider
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-border-light text-text-sub hover:bg-bg-light dark:border-border-dark dark:text-text-main-dark'
                  }`}
              >
                {provider === 'anthropic' && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                      <path d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.37 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.292 5.946Z" />
                    </svg>
                    Anthropic (Claude)
                  </span>
                )}
                {provider === 'openai' && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.086 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.856-5.833-3.387L15.12 7.2a.076.076 0 0 1 .07 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.666zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.41 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.307 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.5 4.5 0 0 1 7.376-3.454l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.098-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
                    </svg>
                    OpenAI
                  </span>
                )}
                {provider === 'google' && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
                    </svg>
                    Google (Gemini)
                  </span>
                )}
                {provider === 'deepseek' && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                      <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" />
                    </svg>
                    DeepSeek
                  </span>
                )}
                {provider === 'github' && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                      <path d="M7.998 15.035c-4.562 0-7.873-2.914-7.998-3.749V9.338c.085-.628.677-1.686 1.588-2.065.013-.07.024-.143.036-.218.029-.183.06-.384.126-.612-.201-.508-.254-1.084-.254-1.656 0-.87.128-1.769.693-2.484.579-.733 1.494-1.124 2.724-1.261 1.206-.134 2.262.034 2.944.765.05.053.096.108.139.165.044-.057.094-.112.143-.165.682-.731 1.738-.899 2.944-.765 1.23.137 2.145.528 2.724 1.261.566.715.693 1.614.693 2.484 0 .572-.053 1.148-.254 1.656.066.228.098.429.126.612.012.076.024.148.037.218.924.385 1.522 1.471 1.591 2.095v1.872c0 .766-3.351 3.795-8.002 3.795Zm0-1.485c2.28 0 4.584-1.11 5.002-1.433V7.862l-.023-.116c-.49.21-1.075.291-1.727.291-1.146 0-2.059-.327-2.71-.991A3.222 3.222 0 0 1 8 6.303a3.24 3.24 0 0 1-.544.743c-.65.664-1.563.991-2.71.991-.652 0-1.236-.081-1.727-.291l-.023.116v4.255c.419.323 2.722 1.433 5.002 1.433ZM6.762 2.83c-.193-.206-.637-.413-1.682-.297-1.019.113-1.479.404-1.713.7-.247.312-.369.789-.369 1.554 0 .793.129 1.171.308 1.371.162.181.519.379 1.442.379.853 0 1.339-.235 1.638-.54.315-.322.527-.827.617-1.553.117-.935-.037-1.395-.241-1.614Zm4.155-.297c-1.044-.116-1.488.091-1.681.297-.204.219-.359.679-.242 1.614.091.726.303 1.231.618 1.553.299.305.784.54 1.638.54.922 0 1.28-.198 1.442-.379.179-.2.308-.578.308-1.371 0-.765-.123-1.242-.37-1.554-.233-.296-.693-.587-1.713-.7Z" />
                      <path d="M6.25 9.037a.75.75 0 0 1 .75.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 .75-.75Zm4.25.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 1.5 0Z" />
                    </svg>
                    GitHub Copilot
                  </span>
                )}
                {provider === 'custom' && (
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                    </svg>
                    Custom API
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
            {settings.aiProvider === 'github' && (
              <>
                {' · '}
                <button
                  onClick={() => setShowPremiumInfo(!showPremiumInfo)}
                  className="inline text-text-placeholder underline decoration-dotted underline-offset-2 transition-colors hover:text-text-sub dark:hover:text-text-sub-dark"
                >
                  {showPremiumInfo ? t('settings.copilotPremiumHide') : t('settings.copilotPremiumShow')}
                </button>
              </>
            )}
          </p>
          {showPremiumInfo && settings.aiProvider === 'github' && (
            <div className="mb-3 rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 text-tag leading-relaxed text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
              <p>{t('settings.copilotPremiumDesc')}</p>
            </div>
          )}
          {(() => {
            const models = getProviderModels(settings.aiProvider, settings.customProviderConfig);
            const selected = models.find((m) => m.id === settings.aiModel) ?? models.find((m) => m.default) ?? models[0];
            const selectedLabel = selected ? (MODEL_LABEL_SUFFIX[selected.id] ? t(MODEL_LABEL_SUFFIX[selected.id]) : selected.label) : '';
            return (
              <div className="relative">
                <button
                  onClick={() => setModelListExpanded(!modelListExpanded)}
                  className="group flex w-full items-center justify-between rounded-[12px] border border-black/5 bg-surface-light px-4 py-3 text-left text-aux font-medium text-text-main transition-colors hover:bg-black/[0.02] dark:border-white/5 dark:bg-surface-dark dark:text-text-main-dark dark:hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2">
                    <span>{selectedLabel}</span>
                    {selected?.free && <span className="text-tag text-green-600 dark:text-green-400">∞</span>}
                    {selected?.default && (
                      <span className="rounded bg-bg-light px-1.5 py-0.5 text-[10px] tracking-[0.04em] text-text-placeholder dark:bg-slate-700">
                        {t('settings.modelDefault')}
                      </span>
                    )}
                  </div>
                  <svg className={`shrink-0 transition-transform duration-300 ${modelListExpanded ? 'rotate-180' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {modelListExpanded && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setModelListExpanded(false)} />
                    <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-[14px] border border-border-light bg-surface-light p-1.5 shadow-xl dark:border-border-dark dark:bg-surface-dark">
                      {models.map((m) => {
                        const isActive = m.id === selected?.id;
                        const label = MODEL_LABEL_SUFFIX[m.id] ? t(MODEL_LABEL_SUFFIX[m.id]) : m.label;
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              const nextModel = m.default && settings.aiModel === null ? null : m.id;
                              updateSettings({
                                aiModel: nextModel,
                                customProviderConfig: settings.aiProvider === 'custom'
                                  ? {
                                    customUrl: settings.customProviderConfig?.customUrl || customUrlInput,
                                    apiKey: settings.customProviderConfig?.apiKey || customApiKeyInput,
                                    model: nextModel || m.id,
                                    models: settings.customProviderConfig?.models ?? parseCustomModelList(customModelInput),
                                    protocol: settings.customProviderConfig?.protocol || customProtocol,
                                    autoDetectProtocol: settings.customProviderConfig?.autoDetectProtocol ?? customAutoDetectProtocol,
                                  }
                                  : settings.customProviderConfig,
                              });
                              setModelListExpanded(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2.5 text-left text-[13px] transition-colors ${isActive
                                ? 'bg-black/5 font-medium text-text-main dark:bg-white/10 dark:text-white'
                                : 'text-text-sub hover:bg-black/[0.03] dark:text-text-placeholder dark:hover:bg-white/5'
                              }`}
                          >
                            <span>
                              {label}
                              {m.free && <span className="ml-1.5 text-tag text-green-600 dark:text-green-400">∞</span>}
                              {m.default && (
                                <span className="ml-1.5 text-[10px] text-text-placeholder">
                                  ({t('settings.modelDefault')})
                                </span>
                              )}
                            </span>
                            {isActive && (
                              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </section>

        {/* API Key / GitHub OAuth */}
        <section className="mb-8">
          {settings.aiProvider === 'custom' ? null : settings.aiProvider === 'github' ? (
            <>
              <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
                GitHub {t('settings.githubAuth')}
              </h2>

              {githubAuthed ? (
                <div className="flex items-center gap-3">
                  <span className="text-aux text-green-600 dark:text-green-400">
                    <svg className="inline h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {t('settings.githubConnected')}
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
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                      <path d="M7.998 15.035c-4.562 0-7.873-2.914-7.998-3.749V9.338c.085-.628.677-1.686 1.588-2.065.013-.07.024-.143.036-.218.029-.183.06-.384.126-.612-.201-.508-.254-1.084-.254-1.656 0-.87.128-1.769.693-2.484.579-.733 1.494-1.124 2.724-1.261 1.206-.134 2.262.034 2.944.765.05.053.096.108.139.165.044-.057.094-.112.143-.165.682-.731 1.738-.899 2.944-.765 1.23.137 2.145.528 2.724 1.261.566.715.693 1.614.693 2.484 0 .572-.053 1.148-.254 1.656.066.228.098.429.126.612.012.076.024.148.037.218.924.385 1.522 1.471 1.591 2.095v1.872c0 .766-3.351 3.795-8.002 3.795Zm0-1.485c2.28 0 4.584-1.11 5.002-1.433V7.862l-.023-.116c-.49.21-1.075.291-1.727.291-1.146 0-2.059-.327-2.71-.991A3.222 3.222 0 0 1 8 6.303a3.24 3.24 0 0 1-.544.743c-.65.664-1.563.991-2.71.991-.652 0-1.236-.081-1.727-.291l-.023.116v4.255c.419.323 2.722 1.433 5.002 1.433ZM6.762 2.83c-.193-.206-.637-.413-1.682-.297-1.019.113-1.479.404-1.713.7-.247.312-.369.789-.369 1.554 0 .793.129 1.171.308 1.371.162.181.519.379 1.442.379.853 0 1.339-.235 1.638-.54.315-.322.527-.827.617-1.553.117-.935-.037-1.395-.241-1.614Zm4.155-.297c-1.044-.116-1.488.091-1.681.297-.204.219-.359.679-.242 1.614.091.726.303 1.231.618 1.553.299.305.784.54 1.638.54.922 0 1.28-.198 1.442-.379.179-.2.308-.578.308-1.371 0-.765-.123-1.242-.37-1.554-.233-.296-.693-.587-1.713-.7Z" />
                      <path d="M6.25 9.037a.75.75 0 0 1 .75.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 .75-.75Zm4.25.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 1.5 0Z" />
                    </svg>
                    {githubLoading ? t('settings.githubLoggingIn') : t('settings.githubLogin')}
                  </button>
                  {deviceUserCode && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <p className="mb-2 text-aux text-text-sub dark:text-text-main-dark">
                        {t('settings.githubDeviceCodePrompt')}
                      </p>
                      <p className="mb-2 select-all text-center font-mono text-2xl font-bold tracking-widest text-blue-700 dark:text-blue-300">
                        {deviceUserCode}
                      </p>
                      <p className="text-tag text-text-placeholder">
                        {t('settings.githubDeviceCodeHint')}{' '}
                        <a
                          href={deviceVerifyUri ?? 'https://github.com/login/device'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline dark:text-blue-400"
                        >
                          github.com/login/device
                        </a>
                      </p>
                    </div>
                  )}
                  {githubLoading && !deviceUserCode && (
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

        {/* Codex OAuth */}
        {showCodexOAuth && (
          <section className="mb-8">
            <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              {t('settings.codexOauthTitle')}
            </h2>
            <p className="mb-4 text-tag tracking-[0.04em] text-text-placeholder">
              {t('settings.codexOauthDesc')}
            </p>
            {codexAuthed ? (
              <div className="flex items-center gap-3">
                <span className="text-aux text-green-600 dark:text-green-400">
                  <svg className="inline h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {t('settings.codexConnected')}
                </span>
                <button
                  onClick={async () => {
                    await logoutCodex();
                    setCodexAuthed(false);
                  }}
                  className="rounded-btn border border-red-300 px-3 py-1.5 text-tag text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  {t('settings.codexLogout')}
                </button>
              </div>
            ) : (
              <div>
                <button
                  onClick={async () => {
                    setCodexLoading(true);
                    setCodexError(null);
                    try {
                      await startCodexOAuth();
                      await pollCodexAuth();
                      setCodexAuthed(true);
                    } catch (e: unknown) {
                      setCodexError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setCodexLoading(false);
                    }
                  }}
                  disabled={codexLoading}
                  className="flex items-center gap-2 rounded-btn bg-[#10A37F] px-5 py-2.5 text-aux font-medium text-white hover:bg-[#0D8A6A] disabled:opacity-60"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073z" />
                  </svg>
                  {codexLoading ? t('settings.codexConnecting') : t('settings.codexLogin')}
                </button>
                {codexError && (
                  <p className="mt-2 text-tag text-red-500 dark:text-red-400">{codexError}</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Custom Provider Config */}
        {settings.aiProvider === 'custom' && (
          <section className="mb-8">
            <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
              {t('settings.customApiConfigTitle')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-tag text-text-placeholder">{t('settings.customApiUrl')}</label>
                <input
                  type="url"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                  className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2 text-aux text-text-main placeholder-text-placeholder focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                />
              </div>
              <div>
                <label className="mb-1 block text-tag text-text-placeholder">{t('settings.customApiKey')}</label>
                <input
                  type="password"
                  value={customApiKeyInput}
                  onChange={(e) => setCustomApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2 text-aux text-text-main placeholder-text-placeholder focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                />
              </div>
              <div>
                <label className="mb-1 block text-tag text-text-placeholder">Models</label>
                <input
                  type="text"
                  value={customModelInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    const models = parseCustomModelList(value);
                    const currentModel = settings.customProviderConfig?.model;
                    const nextModel = currentModel && models.includes(currentModel)
                      ? currentModel
                      : (models[0] ?? '');

                    setCustomModelInput(value);
                    updateSettings({
                      aiModel: nextModel || null,
                      customProviderConfig: {
                        customUrl: customUrlInput,
                        apiKey: customApiKeyInput || settings.customProviderConfig?.apiKey || '',
                        model: nextModel,
                        models,
                        protocol: customProtocol,
                        autoDetectProtocol: customAutoDetectProtocol,
                      },
                    });
                  }}
                  placeholder="gpt-4o, gpt-4.1, claude-3-7-sonnet..."
                  className="w-full rounded-btn border border-border-light bg-surface-light px-4 py-2 text-aux text-text-main placeholder-text-placeholder focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
                />
                <p className="mt-2 text-tag text-text-placeholder">
                  {t('settings.customModelsHint')}
                </p>
              </div>
              {parseCustomModelList(customModelInput).length > 0 && (
                <div>
                  <label className="mb-1 block text-tag text-text-placeholder">{t('settings.customCurrentModel')}</label>
                  <div className="flex flex-wrap gap-2">
                    {parseCustomModelList(customModelInput).map((model, index) => {
                      const fallbackModel = parseCustomModelList(customModelInput)[0];
                      const activeModel = settings.customProviderConfig?.model || fallbackModel;
                      const isActive = activeModel === model;

                      return (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            updateSettings({
                              aiModel: model,
                              customProviderConfig: {
                                customUrl: customUrlInput,
                                apiKey: customApiKeyInput || settings.customProviderConfig?.apiKey || '',
                                model,
                                models: parseCustomModelList(customModelInput),
                                protocol: customProtocol,
                                autoDetectProtocol: customAutoDetectProtocol,
                              },
                            });
                          }}
                          className={`rounded-full border px-3 py-1.5 text-tag transition-colors ${isActive
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                            : 'border-border-light text-text-sub hover:bg-bg-light dark:border-border-dark dark:text-text-main-dark'
                            }`}
                        >
                          {model}
                          {index === 0 && (
                            <span className="ml-1.5 text-[10px] text-text-placeholder">{t('settings.customModelDefault')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-2 flex items-center gap-2 text-tag text-text-placeholder">
                  <input
                    type="checkbox"
                    checked={customAutoDetectProtocol}
                    onChange={(e) => setCustomAutoDetectProtocol(e.target.checked)}
                    className="text-blue-500"
                  />
                  {t('settings.customAutoDetectProtocol')}
                </label>
                <p className="text-tag text-text-placeholder">
                  {t('settings.customAutoDetectHint')}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-tag text-text-placeholder">Protocol</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={customProtocol === 'openai-compatible'}
                      onChange={() => {
                        setCustomAutoDetectProtocol(false);
                        setCustomProtocol('openai-compatible');
                      }}
                      className="text-blue-500"
                    />
                    <span className="text-aux text-text-main dark:text-text-main-dark">OpenAI Compatible</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={customProtocol === 'anthropic-compatible'}
                      onChange={() => {
                        setCustomAutoDetectProtocol(false);
                        setCustomProtocol('anthropic-compatible');
                      }}
                      className="text-blue-500"
                    />
                    <span className="text-aux text-text-main dark:text-text-main-dark">Anthropic Compatible</span>
                  </label>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const customModels = parseCustomModelList(customModelInput);
                    const selectedModel = settings.customProviderConfig?.model && customModels.includes(settings.customProviderConfig.model)
                      ? settings.customProviderConfig.model
                      : (customModels[0] ?? '');

                    await updateCustomProvider({
                      customUrl: customUrlInput,
                      apiKey: customApiKeyInput,
                      model: selectedModel,
                      protocol: customProtocol,
                    });
                    updateSettings({
                      aiModel: selectedModel || null,
                      customProviderConfig: {
                        customUrl: customUrlInput,
                        apiKey: customApiKeyInput,
                        model: selectedModel,
                        models: customModels,
                        protocol: customProtocol,
                        autoDetectProtocol: customAutoDetectProtocol,
                      },
                      apiKeyConfigured: true,
                    });
                    setKeyExists(true);
                  } catch (e: unknown) {
                    console.error('Failed to save custom provider config:', e);
                  }
                }}
                className="rounded-btn bg-primary px-4 py-2 text-aux font-medium text-white hover:bg-[#BF6A4E]"
              >
                Save Custom Config
              </button>
            </div>
          </section>
        )}

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
