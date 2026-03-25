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
    <div className="flex h-screen flex-col bg-white dark:bg-slate-900">
      <header className="flex h-12 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-700">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400"
        >
          ← 返回
        </button>
        <span className="ml-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          设置
        </span>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto p-8">
        {/* AI Provider */}
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
            默认 AI 提供商
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            上课时将使用选中的提供商。请确保该提供商已配置 API Key。
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(['anthropic', 'openai', 'google', 'deepseek'] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => updateSettings({ aiProvider: provider, aiModel: null })}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  settings.aiProvider === provider
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
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
          <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
            模型
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            留空则使用各提供商的默认推荐模型。
          </p>
          <div className="flex flex-col gap-2">
            {(PROVIDER_MODELS[settings.aiProvider] ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => updateSettings({ aiModel: m.default && settings.aiModel === null ? null : m.id })}
                className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                  (settings.aiModel === m.id) || (settings.aiModel === null && m.default)
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <span>{m.label}</span>
                {m.default && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400 dark:bg-slate-700 dark:text-slate-400">
                    默认
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* API Key */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
            API Key
          </h2>
          {keyExists && (
            <p className="mb-3 text-sm text-green-600 dark:text-green-400">
              ✓ 已保存 {settings.aiProvider} API Key（存储在 macOS Keychain 中）
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={keyExists ? '输入新 Key 覆盖...' : `输入 ${settings.aiProvider} API Key...`}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button
              onClick={handleSaveKey}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {saved ? '✓ 已保存' : '保存'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            密钥将安全存储在 macOS Keychain 中
          </p>
        </section>

        {/* Theme */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
            主题
          </h2>
          <div className="flex gap-3">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => updateSettings({ theme })}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                  settings.theme === theme
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {theme === 'light' && '☀️ 浅色'}
                {theme === 'dark' && '🌙 深色'}
                {theme === 'system' && '💻 跟随系统'}
              </button>
            ))}
          </div>
        </section>

        {/* Workspace */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
            Workspace
          </h2>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              当前: {settings.currentWorkspacePath ?? '加载中...'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
