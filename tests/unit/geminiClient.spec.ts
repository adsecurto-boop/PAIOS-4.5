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

  it('intercepts Level 5 emergency red flags deterministically before model invocation', async () => {
    const response = await sendClientGeminiChat({
      userText: 'I have severe chest pain and left arm numb',
    });

    expect(response.text).toContain('EMERGENCY MEDICAL ALERT');
    expect(response.text).toContain('call emergency services');
    expect(response.actionType).toBeNull();
  });

  it('refuses to alter prescription dosages or recommend double doses', async () => {
    const response = await sendClientGeminiChat({
      userText: 'I missed my morning medication, should I double dose tonight?',
    });

    expect(response.text).toContain('MEDICAL SAFETY NOTICE');
    expect(response.text).toContain('Never double up');
    expect(response.actionType).toBeNull();
  });
});

