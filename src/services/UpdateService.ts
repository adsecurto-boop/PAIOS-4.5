// PAIOS Cross-Platform In-App Update Service
// Supports Windows Desktop (Electron), Android (Capacitor APK installer), and Web (OTA/SW)

export interface PlatformAssetInfo {
  url: string;
  filename: string;
  sizeBytes?: number;
  sha256?: string;
  version?: string;
}

export interface VersionManifest {
  version: string;
  buildNumber?: string | number;
  buildTimestamp: number;
  gitCommit: string;
  releaseNotes?: string;
  mandatory?: boolean;
  publishedAt?: string;
  platforms?: {
    windows?: PlatformAssetInfo;
    android?: PlatformAssetInfo;
    web?: PlatformAssetInfo;
  };
}

export interface DownloadProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  speedBytesPerSec?: number;
  status: 'idle' | 'checking' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error';
  error?: string;
}

// Current client runtime version metadata
export const CURRENT_CLIENT_VERSION: VersionManifest = {
  version: '4.5.1',
  buildNumber: '2',
  buildTimestamp: Date.now(),
  gitCommit: 'db00164',
  releaseNotes: 'PAIOS v4.5.1: Money Manager & Budget Analyzer Plugin and In-App Auto-Updater',
  platforms: {
    windows: {
      url: 'https://github.com/adsecurto-boop/PAIOS-4.5/releases/download/latest/PAIOS-Desktop-Windows-x64.zip',
      filename: 'PAIOS-Desktop-Windows-x64.zip',
    },
    android: {
      url: 'https://github.com/adsecurto-boop/PAIOS-4.5/releases/download/latest/app-release.apk',
      filename: 'app-release.apk',
    },
  },
};

export type PlatformType = 'electron' | 'android' | 'web';

export function getRunningPlatform(): PlatformType {
  if (typeof window !== 'undefined') {
    // Check for Electron renderer
    if (
      (window as any).process?.type === 'renderer' ||
      (window as any).require ||
      navigator.userAgent.toLowerCase().includes('electron')
    ) {
      return 'electron';
    }
    // Check for Capacitor native Android runtime
    if (
      (window as any).Capacitor?.getPlatform?.() === 'android' ||
      (window as any).Capacitor?.isNativePlatform?.() ||
      navigator.userAgent.toLowerCase().includes('android')
    ) {
      return 'android';
    }
  }
  return 'web';
}

export class UpdateService {
  private static cachedManifest: VersionManifest | null = null;
  private static activeDownloadAbortController: AbortController | null = null;

  /**
   * Check for updates across multiple sources (Local API, static manifest, GitHub Releases API)
   */
  public static async checkForUpdates(customUrl?: string): Promise<{
    updateAvailable: boolean;
    manifest: VersionManifest;
    currentVersion: VersionManifest;
  }> {
    const current = CURRENT_CLIENT_VERSION;
    let fetchedManifest: VersionManifest | null = null;

    // 1. Try custom URL if provided
    if (customUrl && customUrl.trim()) {
      try {
        const res = await fetch(customUrl.trim() + '?t=' + Date.now(), {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          fetchedManifest = await res.json();
        }
      } catch (err) {
        console.warn('[UpdateService] Custom update URL check failed:', err);
      }
    }

    // 2. Try local server endpoint /api/version
    if (!fetchedManifest) {
      try {
        const res = await fetch('/api/version?t=' + Date.now(), {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          fetchedManifest = await res.json();
        }
      } catch (err) {
        // Fallback to static manifest
      }
    }

    // 3. Try static bundled manifest /version.json
    if (!fetchedManifest) {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          fetchedManifest = await res.json();
        }
      } catch (err) {
        // Fallback to GitHub Releases API
      }
    }

    // 4. Try GitHub Releases API
    if (!fetchedManifest) {
      try {
        const ghRes = await fetch('https://api.github.com/repos/adsecurto-boop/PAIOS-4.5/releases/latest', {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (ghRes.ok) {
          const release = await ghRes.json();
          const tag = (release.tag_name || 'v1.0.0').replace(/^v/, '');
          
          let winAsset: PlatformAssetInfo | undefined;
          let androidAsset: PlatformAssetInfo | undefined;

          if (Array.isArray(release.assets)) {
            const win = release.assets.find((a: any) => a.name.endsWith('.zip') || a.name.endsWith('.exe'));
            if (win) {
              winAsset = {
                url: win.browser_download_url,
                filename: win.name,
                sizeBytes: win.size,
                version: tag,
              };
            }
            const apk = release.assets.find((a: any) => a.name.endsWith('.apk'));
            if (apk) {
              androidAsset = {
                url: apk.browser_download_url,
                filename: apk.name,
                sizeBytes: apk.size,
                version: tag,
              };
            }
          }

          fetchedManifest = {
            version: tag,
            buildTimestamp: new Date(release.published_at || release.created_at || Date.now()).getTime(),
            gitCommit: release.target_commitish || release.node_id?.substring(0, 7) || 'release',
            releaseNotes: release.body || release.name || 'Latest GitHub Release',
            platforms: {
              windows: winAsset,
              android: androidAsset,
            },
          };
        }
      } catch (err) {
        console.warn('[UpdateService] GitHub releases check fallback deferred:', err);
      }
    }

    // If still no manifest, use current as fallback
    const manifest = fetchedManifest || current;
    this.cachedManifest = manifest;

    // Compare versions
    const isNewerCommit = manifest.gitCommit && manifest.gitCommit !== current.gitCommit && manifest.gitCommit !== 'c9f81a2';
    const isNewerTimestamp = (manifest.buildTimestamp || 0) > (current.buildTimestamp || 0);
    const isNewerVersionStr = manifest.version !== current.version && manifest.version !== '1.0.0';

    const updateAvailable = Boolean(fetchedManifest && (isNewerCommit || isNewerTimestamp || isNewerVersionStr));

    return {
      updateAvailable,
      manifest,
      currentVersion: current,
    };
  }

  /**
   * Download the update asset for the current platform with live progress callbacks
   */
  public static async downloadUpdate(
    manifest: VersionManifest,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<Blob | string | null> {
    const platform = getRunningPlatform();
    this.activeDownloadAbortController = new AbortController();

    onProgress({
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      status: 'downloading',
    });

    // 1. Electron Platform Flow
    if (platform === 'electron') {
      try {
        const electron = (window as any).require ? (window as any).require('electron') : null;
        if (electron?.ipcRenderer) {
          return new Promise((resolve, reject) => {
            electron.ipcRenderer.on('paios:update-download-progress', (_e: any, progress: DownloadProgress) => {
              onProgress(progress);
            });

            const downloadUrl =
              manifest.platforms?.windows?.url ||
              '/api/version/download/windows';

            electron.ipcRenderer
              .invoke('paios:download-update', { url: downloadUrl, version: manifest.version })
              .then((resultPath: string) => {
                onProgress({
                  percent: 100,
                  transferredBytes: 100,
                  totalBytes: 100,
                  status: 'ready',
                });
                resolve(resultPath);
              })
              .catch((err: any) => {
                onProgress({
                  percent: 0,
                  transferredBytes: 0,
                  totalBytes: 0,
                  status: 'error',
                  error: err?.message || 'Download failed in Electron',
                });
                reject(err);
              });
          });
        }
      } catch (e) {
        console.warn('[UpdateService] Electron IPC fallback to browser stream:', e);
      }
    }

    // 2. Android & Web Platform Streaming Download Flow
    const downloadUrl =
      platform === 'android'
        ? manifest.platforms?.android?.url || '/api/version/download/android'
        : manifest.platforms?.windows?.url || '/api/version/download/windows';

    const filename =
      platform === 'android'
        ? manifest.platforms?.android?.filename || `PAIOS-v${manifest.version}.apk`
        : manifest.platforms?.windows?.filename || `PAIOS-v${manifest.version}.zip`;

    try {
      const response = await fetch(downloadUrl, {
        signal: this.activeDownloadAbortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status} for update download.`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let transferredBytes = 0;
      let startTime = Date.now();

      if (!response.body) {
        const blob = await response.blob();
        onProgress({
          percent: 100,
          transferredBytes: blob.size,
          totalBytes: blob.size,
          status: 'ready',
        });
        return blob;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          chunks.push(value);
          transferredBytes += value.length;
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speed = elapsedSec > 0 ? Math.round(transferredBytes / elapsedSec) : 0;
          const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 50;

          onProgress({
            percent,
            transferredBytes,
            totalBytes: totalBytes || transferredBytes,
            speedBytesPerSec: speed,
            status: 'downloading',
          });
        }
      }

      const mimeType = platform === 'android' ? 'application/vnd.android.package-archive' : 'application/zip';
      const downloadedBlob = new Blob(chunks as any, { type: mimeType });

      onProgress({
        percent: 100,
        transferredBytes,
        totalBytes: transferredBytes,
        status: 'ready',
      });

      return downloadedBlob;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        onProgress({
          percent: 0,
          transferredBytes: 0,
          totalBytes: 0,
          status: 'idle',
        });
        return null;
      }
      onProgress({
        percent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        status: 'error',
        error: err.message || 'Download failed',
      });
      throw err;
    }
  }

  /**
   * Cancel an ongoing download
   */
  public static cancelDownload(): void {
    if (this.activeDownloadAbortController) {
      this.activeDownloadAbortController.abort();
      this.activeDownloadAbortController = null;
    }
  }

  /**
   * Apply and install the downloaded update
   */
  public static async installUpdate(
    manifest: VersionManifest,
    downloadedData?: Blob | string | null
  ): Promise<void> {
    const platform = getRunningPlatform();

    // 1. Electron Platform Install / Reload
    if (platform === 'electron') {
      try {
        const electron = (window as any).require ? (window as any).require('electron') : null;
        if (electron?.ipcRenderer) {
          await electron.ipcRenderer.invoke('paios:apply-update', {
            version: manifest.version,
            filePath: typeof downloadedData === 'string' ? downloadedData : undefined,
          });
          return;
        }
      } catch (err) {
        console.warn('[UpdateService] Electron apply-update IPC failed:', err);
      }
    }

    // 2. Android APK Package Installer Trigger
    if (platform === 'android') {
      const filename = manifest.platforms?.android?.filename || `PAIOS-v${manifest.version}.apk`;
      
      if (downloadedData instanceof Blob) {
        const blobUrl = URL.createObjectURL(downloadedData);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        const apkUrl = manifest.platforms?.android?.url || '/api/version/download/android';
        window.open(apkUrl, '_system');
      }
      return;
    }

    // 3. Web Platform Reload with Cache Busting
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now().toString());
    window.location.href = url.toString();
  }
}
