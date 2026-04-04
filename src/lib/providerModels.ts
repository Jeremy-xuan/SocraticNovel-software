import type { CustomProviderConfig } from '../types';
import { getCustomProviderModels } from './customProvider';

export interface ProviderModel {
  id: string;
  label: string;
  default?: boolean;
  free?: boolean;
}

export const PROVIDER_MODELS: Record<string, ProviderModel[]> = {
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
    { id: 'claude-opus-4.6', label: 'Claude Opus 4.6 (3×)' },
    { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (1×)' },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 (0.33×)' },
    { id: 'gpt-5.4', label: 'GPT-5.4 (1×)' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini (0.33×)' },
    { id: 'gpt-5.2', label: 'GPT-5.2 (1×)' },
    { id: 'gpt-5.1', label: 'GPT-5.1 (1×)' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini (0× 免费)', free: true },
    { id: 'gpt-4.1', label: 'GPT-4.1 (0× 免费)', free: true },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (1×)' },
    { id: 'gemini-3-flash', label: 'Gemini 3 Flash (0.33×)' },
    { id: 'grok-code-fast-1', label: 'Grok Code Fast 1 (0.33×)' },
  ],
  custom: [
    { id: '__custom_model__', label: 'Custom Model', default: true },
  ],
};

export function getProviderModels(provider: string, customProviderConfig?: CustomProviderConfig): ProviderModel[] {
  if (provider !== 'custom') {
    return PROVIDER_MODELS[provider] ?? [];
  }

  const customModels = getCustomProviderModels(customProviderConfig);
  if (customModels.length === 0) {
    return PROVIDER_MODELS.custom;
  }

  return customModels.map((model, index) => ({
    id: model,
    label: model,
    default: index === 0,
  }));
}
