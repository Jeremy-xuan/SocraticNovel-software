import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { setApiKey, hasApiKey } from '../lib/tauri';

const PROVIDER_MODELS: Record<string, Array<{ id: string; label: string; default?: boolean }>> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (2025-05-14)', default: true },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（快速/省钱）' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', default: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini（快速/省钱）' },
    { id: 'o3-mini', label: 'o3-mini（推理）' },
    { id: 'o1', label: 'o1（推理，慢）' },
  ],
  deepseek: [
    { id: 'deepseek-reasoner', label: 'DeepSeek-R1（推理）', default: true },
    { id: 'deepseek-chat', label: 'DeepSeek-V3（对话）' },
  ],
  google: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', default: true },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash（快速）' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useAppStore();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [keyExists, setKeyExists] = useState(false);

  useEffect(() => {
    // Check if key exists for current provider
    hasApiKey(settings.aiProvider).then((exists) => {
      setKeyExists(exists);
      updateSettings({ apiKeyConfigured: exists });
    });
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

  return (
    <div className="flex h-screen flex-col bg-surface-light dark:bg-bg-dark">
      <header className="flex h-12 shrink-0 items-center border-b border-border-light px-4 dark:border-border-dark">
        <button
          onClick={() => navigate('/')}
          className="text-aux text-text-sub hover:text-text-main dark:text-text-placeholder"
        >
          ← 返回
        </button>
        <span className="ml-4 text-aux font-medium text-text-main dark:text-text-main-dark">
          设置
        </span>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto p-8">
        {/* AI Provider */}
        <section className="mb-8">
          <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            默认 AI 提供商
          </h2>
          <p className="mb-4 text-tag tracking-[0.04em] text-text-placeholder">
            上课时将使用选中的提供商。请确保该提供商已配置 API Key。
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(['anthropic', 'openai', 'google', 'deepseek'] as const).map((provider) => (
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
              </button>
            ))}
          </div>
        </section>

        {/* Model */}
        <section className="mb-8">
          <h2 className="mb-2 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            模型
          </h2>
          <p className="mb-3 text-tag tracking-[0.04em] text-text-placeholder">
            留空则使用各提供商的默认推荐模型。
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
                <span>{m.label}</span>
                {m.default && (
                  <span className="ml-2 rounded bg-bg-light px-1.5 py-0.5 text-tag tracking-[0.04em] text-text-placeholder dark:bg-slate-700 dark:text-text-placeholder">
                    默认
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        <section className="mb-8">
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            API Key
          </h2>
          {keyExists && (
            <p className="mb-3 text-aux text-green-600 dark:text-green-400">
              ✓ 已保存 {settings.aiProvider} API Key（存储在 macOS Keychain 中）
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={keyExists ? '输入新 Key 覆盖...' : `输入 ${settings.aiProvider} API Key...`}
              className="flex-1 rounded-btn border border-border-light bg-surface-light px-4 py-2 text-aux text-text-main placeholder-text-placeholder focus:bg-surface-light focus:border-blue-500 focus:outline-none dark:border-border-dark dark:bg-surface-dark dark:text-text-main-dark"
            />
            <button
              onClick={handleSaveKey}
              className="rounded-btn bg-primary px-4 py-2 text-aux font-medium text-white hover:bg-[#BF6A4E] h-[38px]"
            >
              {saved ? '✓ 已保存' : '保存'}
            </button>
          </div>
          <p className="mt-2 text-tag tracking-[0.04em] text-text-placeholder">
            密钥将安全存储在 macOS Keychain 中
          </p>
        </section>

        {/* Theme */}
        <section className="mb-8">
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            主题配色
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
                {theme === 'light' && '☀️ 浅色'}
                {theme === 'dark' && '🌙 深色'}
                {theme === 'system' && '💻 跟随系统'}
              </button>
            ))}
          </div>
        </section>

        {/* Layout Theme */}
        <section className="mb-8">
          <h2 className="mb-4 text-subtitle font-medium text-text-main dark:text-text-main-dark">
            首页布局风格
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
                <div className="font-medium text-[15px] mb-1.5">{layout === 'cards' ? '手绘卡片版' : '极简长条版'}</div>
                <div className="text-[12px] opacity-70 tracking-wide">
                  {layout === 'cards' ? '插画风格与古典衬线排版' : 'Claude 纯净原生交互范式'}
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
              当前: {settings.currentWorkspacePath ?? '加载中...'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
