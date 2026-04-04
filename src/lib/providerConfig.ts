import type { AppSettings } from '../types';
import { getApiKey, getGithubToken } from './tauri';

export type EffectiveProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'github'
  | 'custom-openai'
  | 'custom-anthropic';

export function getEffectiveProvider(settings: AppSettings): EffectiveProvider {
  if (settings.aiProvider !== 'custom') {
    return settings.aiProvider;
  }

  return settings.customProviderConfig?.protocol === 'anthropic-compatible'
    ? 'custom-anthropic'
    : 'custom-openai';
}

export function getEffectiveModel(settings: AppSettings): string | undefined {
  if (settings.aiProvider === 'custom') {
    return settings.customProviderConfig?.model || undefined;
  }
  return settings.aiModel ?? undefined;
}

export function getEffectiveCustomUrl(settings: AppSettings): string | undefined {
  if (settings.aiProvider !== 'custom') {
    return undefined;
  }
  return settings.customProviderConfig?.customUrl || undefined;
}

export async function getEffectiveApiKey(settings: AppSettings): Promise<string> {
  const provider = getEffectiveProvider(settings);

  if (provider === 'github') {
    const token = await getGithubToken();
    if (!token) throw new Error('GitHub not authenticated. Please login in Settings.');
    return token;
  }

  if (settings.aiProvider === 'custom') {
    const key = settings.customProviderConfig?.apiKey || await getApiKey('custom_provider_key');
    if (!key) throw new Error('No API key configured for custom provider');
    return key;
  }

  const key = await getApiKey(provider);
  if (!key) throw new Error(`No API key configured for ${provider}`);
  return key;
}

export async function hasEffectiveApiKey(settings: AppSettings): Promise<boolean> {
  try {
    const key = await getEffectiveApiKey(settings);
    return Boolean(key);
  } catch {
    return false;
  }
}
