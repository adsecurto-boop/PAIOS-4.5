import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkForAppUpdates,
  onVersionUpdateAvailable,
  CLIENT_VERSION,
} from '../../src/utils/versionCheck';
import * as UpdateServiceModule from '../../src/services/UpdateService';
import { UpdateService, VersionManifest } from '../../src/services/UpdateService';

describe('VersionCheck Unit Tests (Downgrade Prevention & SemVer Enforcement)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports current client version as 4.8.2', () => {
    expect(CLIENT_VERSION.version).toBe('4.8.2');
  });

  it('suppresses update notification when remote version is older (4.5.7)', async () => {
    const olderManifest: VersionManifest = {
      version: '4.5.7',
      buildNumber: '8',
      buildTimestamp: Date.now(),
      gitCommit: 'older_commit',
      releaseNotes: 'Old release',
    };

    vi.spyOn(UpdateService, 'checkForUpdates').mockResolvedValueOnce({
      updateAvailable: false,
      manifest: olderManifest,
      currentVersion: CLIENT_VERSION,
    });

    const listener = vi.fn();
    const unsubscribe = onVersionUpdateAvailable(listener);

    const result = await checkForAppUpdates();
    expect(result.updateAvailable).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('triggers an update for a newer verified CI build of the same version', async () => {
    const sameManifest: VersionManifest = {
      version: '4.8.2',
      buildNumber: '15',
      buildTimestamp: Date.now(),
      gitCommit: 'latest_hash',
      releaseNotes: 'Current release',
    };

    vi.spyOn(UpdateService, 'checkForUpdates').mockResolvedValueOnce({
      updateAvailable: true,
      manifest: sameManifest,
      currentVersion: CLIENT_VERSION,
    });

    const listener = vi.fn();
    const unsubscribe = onVersionUpdateAvailable(listener);

    const result = await checkForAppUpdates();
    expect(result.updateAvailable).toBe(true);
    expect(listener).toHaveBeenCalledWith(sameManifest);

    unsubscribe();
  });

  it('triggers update notification when remote version is strictly newer (4.8.3)', async () => {
    const newerManifest: VersionManifest = {
      version: '4.8.3',
      buildNumber: '15',
      buildTimestamp: Date.now() + 10000,
      gitCommit: 'newer_hash',
      releaseNotes: 'Newer release',
    };

    vi.spyOn(UpdateService, 'checkForUpdates').mockResolvedValueOnce({
      updateAvailable: true,
      manifest: newerManifest,
      currentVersion: CLIENT_VERSION,
    });

    const listener = vi.fn();
    const unsubscribe = onVersionUpdateAvailable(listener);

    const result = await checkForAppUpdates();
    expect(result.updateAvailable).toBe(true);
    expect(listener).toHaveBeenCalledWith(newerManifest);

    unsubscribe();
  });

  it('bypasses update checks completely when running in development mode', async () => {
    vi.spyOn(UpdateServiceModule, 'isDevelopmentEnvironment').mockReturnValue(true);
    const checkForUpdatesSpy = vi.spyOn(UpdateService, 'checkForUpdates');

    const result = await checkForAppUpdates();
    expect(result.updateAvailable).toBe(false);
    expect(result.serverManifest).toBeNull();
    expect(checkForUpdatesSpy).not.toHaveBeenCalled();
  });
});
