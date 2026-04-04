import { describe, it, expect } from 'vitest';
import { PROVIDER_MODELS } from '../lib/providerModels';
import type { ProviderModel } from '../lib/providerModels';

describe('PROVIDER_MODELS', () => {
  const providers = ['anthropic', 'openai', 'deepseek', 'google', 'github', 'custom'];

  it('should contain all expected providers', () => {
    for (const p of providers) {
      expect(PROVIDER_MODELS).toHaveProperty(p);
    }
  });

  it.each(providers)('provider "%s" should have at least one model', (provider) => {
    expect(PROVIDER_MODELS[provider].length).toBeGreaterThan(0);
  });

  it.each(providers)('provider "%s" should have exactly one default model', (provider) => {
    const defaults = PROVIDER_MODELS[provider].filter((m: ProviderModel) => m.default);
    expect(defaults).toHaveLength(1);
  });

  it('should have unique model IDs within each provider', () => {
    for (const [, models] of Object.entries(PROVIDER_MODELS)) {
      const ids = models.map((m: ProviderModel) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  it('all models should have non-empty id and label', () => {
    for (const models of Object.values(PROVIDER_MODELS)) {
      for (const model of models) {
        expect(model.id).toBeTruthy();
        expect(model.label).toBeTruthy();
      }
    }
  });

  it('github provider should include free models', () => {
    const freeModels = PROVIDER_MODELS.github.filter((m: ProviderModel) => m.free);
    expect(freeModels.length).toBeGreaterThan(0);
  });
});
