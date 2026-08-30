/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getEffectiveApiKey, getEffectiveModel, sendClientGeminiChat } from '../../src/geminiClient';
import { PAIOSStorage } from '../../src/storage';

describe('Unit Tests: Client Gemini API Key & Model Resolution', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('resolves explicit customApiKey parameter with highest precedence', () => {
    PAIOSStorage.saveSettings({
      ...PAIOSStorage.getSettings(),
      customApiKey: 'stored-key-in-settings',
    });

    const resolved = getEffectiveApiKey('explicit-param-key');
    expect(resolved).toBe('explicit-param-key');
  });

  it('falls back to PAIOSStorage.getSettings().customApiKey when parameter is empty', () => {
    PAIOSStorage.saveSettings({
      ...PAIOSStorage.getSettings(),
      customApiKey: 'AIzaSyTestUserKeyFromSettings123',
    });

    const resolved = getEffectiveApiKey();
    expect(resolved).toBe('AIzaSyTestUserKeyFromSettings123');
  });

  it('falls back to localStorage paios_settings JSON when available', () => {
    PAIOSStorage.clear();
    localStorage.clear();
    localStorage.setItem(
      'paios_settings',
      JSON.stringify({ customApiKey: 'AIzaSyRawLocalStorageKey456' })
    );

    const resolved = getEffectiveApiKey();
    expect(resolved).toBe('AIzaSyRawLocalStorageKey456');
  });

  it('resolves user preferred model from settings or falls back to gemini-2.5-flash', () => {
    PAIOSStorage.saveSettings({
      ...PAIOSStorage.getSettings(),
      preferredModel: 'gemini-2.5-pro',
    });

    expect(getEffectiveModel()).toBe('gemini-2.5-pro');
    expect(getEffectiveModel('gemini-3.5-flash')).toBe('gemini-3.5-flash');
  });

  it('returns clean error prompt when no API key is available anywhere', async () => {
    PAIOSStorage.clear();
    localStorage.clear();
    const origKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const response = await sendClientGeminiChat({
        userText: 'Analyze budget',
      });

      expect(response.text).toContain('please enter your Gemini API Key in Settings');
    } finally {
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });
});
