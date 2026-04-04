import type { CustomProviderConfig } from '../types';

export type CustomProviderProtocol = 'openai-compatible' | 'anthropic-compatible';

export function parseCustomModelList(input?: string | string[] | null): string[] {
  if (Array.isArray(input)) {
    return [...new Set(input.map((item) => item.trim()).filter(Boolean))];
  }

  if (!input) return [];

  return [...new Set(
    input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function stringifyCustomModelList(models?: string[] | null): string {
  return parseCustomModelList(models ?? []).join(', ');
}

export function detectCustomProviderProtocol(url?: string | null): CustomProviderProtocol {
  if (!url?.trim()) return 'openai-compatible';

  try {
    const normalized = url.includes('://') ? url : `https://${url}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    return hostname === 'anthropic.com' || hostname.endsWith('.anthropic.com')
      ? 'anthropic-compatible'
      : 'openai-compatible';
  } catch {
    return 'openai-compatible';
  }
}

export function getCustomProviderModels(config?: CustomProviderConfig): string[] {
  const parsedModels = parseCustomModelList(config?.models);
  const currentModel = config?.model?.trim();

  if (currentModel) {
    return parsedModels.includes(currentModel)
      ? parsedModels
      : [currentModel, ...parsedModels];
  }

  return parsedModels;
}
