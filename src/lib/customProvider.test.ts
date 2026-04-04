import { describe, expect, it } from 'vitest';
import { detectCustomProviderProtocol, getCustomProviderModels, parseCustomModelList, stringifyCustomModelList } from './customProvider';

describe('customProvider helpers', () => {
  it('parses comma separated models and removes duplicates', () => {
    expect(parseCustomModelList('gpt-4o, claude-3-7-sonnet, gpt-4o')).toEqual([
      'gpt-4o',
      'claude-3-7-sonnet',
    ]);
  });

  it('stringifies model lists for the settings input', () => {
    expect(stringifyCustomModelList(['gpt-4o', 'claude-3-7-sonnet'])).toBe('gpt-4o, claude-3-7-sonnet');
  });

  it('detects anthropic compatible urls', () => {
    expect(detectCustomProviderProtocol('https://api.anthropic.com/v1/messages')).toBe('anthropic-compatible');
    expect(detectCustomProviderProtocol('api.anthropic.com')).toBe('anthropic-compatible');
  });

  it('defaults non-anthropic urls to openai compatible', () => {
    expect(detectCustomProviderProtocol('https://api.openai.com/v1/chat/completions')).toBe('openai-compatible');
    expect(detectCustomProviderProtocol('https://api.deepseek.com/chat/completions')).toBe('openai-compatible');
    expect(detectCustomProviderProtocol('')).toBe('openai-compatible');
  });

  it('adds the current model when it is missing from the saved custom model list', () => {
    expect(getCustomProviderModels({
      customUrl: 'https://example.com',
      apiKey: 'test',
      model: 'claude-3-7-sonnet',
      models: ['gpt-4o'],
      protocol: 'openai-compatible',
    })).toEqual(['claude-3-7-sonnet', 'gpt-4o']);
  });
});
