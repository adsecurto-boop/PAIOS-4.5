import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  UpdateService,
  CURRENT_CLIENT_VERSION,
  getRunningPlatform,
  VersionManifest,
  DownloadProgress,
  compareSemVer,
  isSemVerGreater,
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

  it('correctly compares SemVer versions and detects greater versions', () => {
    expect(isSemVerGreater('4.6.2', '4.6.1')).toBe(true);
    expect(isSemVerGreater('4.7.0', '4.6.1')).toBe(true);
    expect(isSemVerGreater('5.0.0', '4.6.1')).toBe(true);
    expect(isSemVerGreater('v4.6.2-beta.1', '4.6.1')).toBe(true);

    expect(isSemVerGreater('4.6.1', '4.6.1')).toBe(false);
    expect(isSemVerGreater('v4.6.1', '4.6.1')).toBe(false);
    expect(isSemVerGreater('4.6.0', '4.6.1')).toBe(false);
    expect(isSemVerGreater('4.5.7', '4.6.1')).toBe(false);
    expect(isSemVerGreater('2.0.0', '4.6.1')).toBe(false);

    expect(compareSemVer('4.6.1', '4.6.1')).toBe(0);
    expect(compareSemVer('4.6.2', '4.6.1')).toBe(1);
    expect(compareSemVer('4.5.7', '4.6.1')).toBe(-1);
  });

  it('checks for updates and parses strictly newer version manifest', async () => {
    const mockManifest: VersionManifest = {
      version: '5.0.0',
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
    expect(res.manifest.version).toBe('5.0.0');
    expect(res.manifest.gitCommit).toBe('fe981a3');
  });

  it('strictly blocks downgrade attempts when remote version is older (4.5.7 or 4.6.0)', async () => {
    const olderManifest: VersionManifest = {
      version: '4.5.7',
      buildNumber: '8',
      buildTimestamp: Date.now() + 50000,
      gitCommit: 'older123',
      releaseNotes: 'Outdated release asset',
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => olderManifest,
    } as any);

    const res = await UpdateService.checkForUpdates('/api/version');
    expect(res.updateAvailable).toBe(false);
    expect(res.manifest.version).toBe('4.5.7');
  });

  it('does not prompt to update when remote commit differs but version is equal (4.6.1)', async () => {
    const sameVersionManifest: VersionManifest = {
      version: '4.6.1',
      buildTimestamp: Date.now() + 50000,
      gitCommit: 'different_sha_999',
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => sameVersionManifest,
    } as any);

    const res = await UpdateService.checkForUpdates('/api/version');
    expect(res.updateAvailable).toBe(false);
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

    const res = await UpdateService.checkForUpdates('/api/version');
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
        version: '4.7.0',
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
    global.fetch = vi.fn().mockRejectedValue(new Error('Network Connection Refused'));

    const progressEvents: DownloadProgress[] = [];
    await expect(
      UpdateService.downloadUpdate(
        {
          version: '4.7.0',
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
