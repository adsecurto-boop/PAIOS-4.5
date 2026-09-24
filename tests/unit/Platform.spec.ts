// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyPlatformClass, isAndroidNative } from '../../src/utils/platform';

describe('Android platform detection', () => {
  afterEach(() => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    document.documentElement.className = '';
    delete document.documentElement.dataset.platform;
  });

  it('detects the native Android Capacitor runtime', () => {
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    };
    expect(isAndroidNative()).toBe(true);
  });

  it('keeps browser rendering separate from Android-only styling', () => {
    const cleanup = applyPlatformClass();
    expect(document.documentElement.classList.contains('native-android')).toBe(false);
    expect(document.documentElement.dataset.platform).toBe('web');
    cleanup();
    expect(document.documentElement.dataset.platform).toBeUndefined();
  });
});
