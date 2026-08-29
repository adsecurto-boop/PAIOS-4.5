import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UpdateService,
  CURRENT_CLIENT_VERSION,
  getRunningPlatform,
  VersionManifest,
  DownloadProgress,
} from '../../src/services/UpdateService';

describe('UpdateService Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects runtime platform accurately', () => {
    const platform = getRunningPlatform();
    expect(['electron', 'android', 'web']).toContain(platform);
  });

  it('checks for updates and parses newer version manifest', async () => {
    const mockManifest: VersionManifest = {
      version: '2.0.0',
      buildNumber: '42',
      buildTimestamp: Date.now() + 100000,
      gitCommit: 'fe981a3',
      releaseNotes: 'Major new feature updates & Jenkins automation',
      platforms: {
        windows: {
          url: 'https://example.com/win.zip',
          filename: 'win.zip',
        },
        android: {
          url: 'https://example.com/app.apk',
          filename: 'app.apk',
        },
      },
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockManifest,
    } as any);

    const res = await UpdateService.checkForUpdates('/api/version');
    expect(res.updateAvailable).toBe(true);
    expect(res.manifest.version).toBe('2.0.0');
    expect(res.manifest.gitCommit).toBe('fe981a3');
  });

  it('correctly reports no update when version and commit match current', async () => {
    const currentManifest: VersionManifest = {
      version: CURRENT_CLIENT_VERSION.version,
      buildTimestamp: CURRENT_CLIENT_VERSION.buildTimestamp - 5000,
      gitCommit: CURRENT_CLIENT_VERSION.gitCommit,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => currentManifest,
    } as any);

    const res = await UpdateService.checkForUpdates();
    expect(res.updateAvailable).toBe(false);
  });

  it('downloads update package and invokes progress callback', async () => {
    const progressEvents: DownloadProgress[] = [];
    const mockContent = 'PAIOS_BINARY_PAYLOAD_CHUNK_DATA';
    const encoder = new TextEncoder();
    const streamData = encoder.encode(mockContent);

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (h: string) => (h === 'content-length' ? streamData.length.toString() : null),
      },
      body: {
        getReader: () => {
          let readOnce = false;
          return {
            read: async () => {
              if (!readOnce) {
                readOnce = true;
                return { done: false, value: streamData };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    } as any);

    const result = await UpdateService.downloadUpdate(
      {
        version: '1.1.0',
        buildTimestamp: Date.now(),
        gitCommit: 'abc1234',
        platforms: {
          android: { url: 'https://example.com/app.apk', filename: 'app.apk' },
          windows: { url: 'https://example.com/app.zip', filename: 'app.zip' },
        },
      },
      (p) => progressEvents.push(p)
    );

    expect(result).toBeInstanceOf(Blob);
    expect(progressEvents.length).toBeGreaterThan(0);
    const lastEvent = progressEvents[progressEvents.length - 1];
    expect(lastEvent.percent).toBe(100);
    expect(lastEvent.status).toBe('ready');
  });

  it('handles and reports download network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network Connection Refused'));

    const progressEvents: DownloadProgress[] = [];
    await expect(
      UpdateService.downloadUpdate(
        {
          version: '1.2.0',
          buildTimestamp: Date.now(),
          gitCommit: 'abc999',
        },
        (p) => progressEvents.push(p)
      )
    ).rejects.toThrow('Network Connection Refused');

    const errorEvent = progressEvents.find((p) => p.status === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.error).toContain('Network Connection Refused');
  });
});
