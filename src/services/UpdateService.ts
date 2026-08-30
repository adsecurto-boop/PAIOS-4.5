// PAIOS Cross-Platform In-App Update Service
// Supports Windows Desktop (Electron), Android (Capacitor APK installer), and Web (OTA/SW)

declare const __APP_VERSION__: string | undefined;
declare const __GIT_COMMIT__: string | undefined;
declare const __BUILD_TIMESTAMP__: number | undefined;

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
  commitTitle?: string;
  commitAuthor?: string;
  commitDate?: string;
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

const getStoredActiveCommit = (): string | null => {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('paios_active_git_commit');
    } catch (e) {}
  }
  return null;
};

const getStoredActiveVersion = (): string | null => {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('paios_active_version');
    } catch (e) {}
  }
  return null;
};

// Current client runtime version metadata
export const CURRENT_CLIENT_VERSION: VersionManifest = {
  version: getStoredActiveVersion() || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '4.5.4'),
  buildNumber: '5',
  buildTimestamp: typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : Date.now(),
  gitCommit: getStoredActiveCommit() || (typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : '8bd340f'),
  releaseNotes: 'PAIOS v4.5.4: Money Manager Balance Sheet, Family Contribution & Interactive Debt/Invested Timelines',
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
   * Helper: Parses GitHub Atom feed to get the absolute latest commit details
   */
  private static async fetchLatestGitHubCommit(): Promise<{
    sha: string;
    shortSha: string;
    title: string;
    author: string;
    date: string;
  } | null> {
    try {
      const res = await fetch('https://github.com/adsecurto-boop/PAIOS-4.5/commits/main.atom', {
        headers: { Accept: 'application/atom+xml, text/xml, */*' },
      });
      if (!res.ok) return null;

      const xmlText = await res.text();
      // Match first entry in Atom feed
      const entryMatch = xmlText.match(/<entry>([\s\S]*?)<\/entry>/);
      if (!entryMatch) return null;

      const entryXml = entryMatch[1];
      const idMatch = entryXml.match(/<id>tag:github\.com,2008:Grit::Commit\/([a-f0-9]+)<\/id>/i);
      const titleMatch = entryXml.match(/<title>\s*([\s\S]*?)\s*<\/title>/i);
      const updatedMatch = entryXml.match(/<updated>\s*([\s\S]*?)\s*<\/updated>/i);
      const authorMatch = entryXml.match(/<author>[\s\S]*?<name>\s*([\s\S]*?)\s*<\/name>/i);

      const fullSha = idMatch ? idMatch[1] : '';
      const shortSha = fullSha ? fullSha.substring(0, 7) : '';
      const title = titleMatch ? titleMatch[1].trim() : 'Updated build on main branch';
      const date = updatedMatch ? updatedMatch[1].trim() : new Date().toISOString();
      const author = authorMatch ? authorMatch[1].trim() : 'adsecurto-boop';

      if (fullSha) {
        return { sha: fullSha, shortSha, title, author, date };
      }
    } catch (err) {
      console.warn('[UpdateService] Atom feed query deferred:', err);
    }
    return null;
  }

  /**
   * Check for updates across multiple sources (GitHub Raw, Atom Feed, Jenkins, Local API)
   */
  public static async checkForUpdates(customUrl?: string): Promise<{
    updateAvailable: boolean;
    manifest: VersionManifest;
    currentVersion: VersionManifest;
  }> {
    const current = CURRENT_CLIENT_VERSION;
    let fetchedManifest: Partial<VersionManifest> | null = null;
    let latestCommitInfo: {
      sha: string;
      shortSha: string;
      title: string;
      author: string;
      date: string;
    } | null = null;

    // 1. Try Custom URL if provided
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

    // 2. Fetch latest GitHub Raw Version Manifest
    if (!fetchedManifest) {
      try {
        const res = await fetch(
          'https://raw.githubusercontent.com/adsecurto-boop/PAIOS-4.5/main/public/version.json?t=' + Date.now(),
          { headers: { 'Cache-Control': 'no-cache' } }
        );
        if (res.ok) {
          fetchedManifest = await res.json();
        }
      } catch (err) {
        console.warn('[UpdateService] GitHub Raw version.json check deferred:', err);
      }
    }

    // 3. Fetch latest GitHub Commits Atom Feed for real-time commit metadata
    latestCommitInfo = await this.fetchLatestGitHubCommit();

    // 4. Try local Jenkins Server if available
    if (!fetchedManifest) {
      try {
        const jenkinsRes = await fetch(
          'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist/version.json?t=' +
            Date.now()
        );
        if (jenkinsRes.ok) {
          fetchedManifest = await jenkinsRes.json();
        }
      } catch (err) {}
    }

    // 5. Try local Express API /api/version
    if (!fetchedManifest) {
      try {
        const res = await fetch('/api/version?t=' + Date.now(), {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          fetchedManifest = await res.json();
        }
      } catch (err) {}
    }

    // Compose final remote manifest
    const targetVersion = fetchedManifest?.version || current.version || '4.5.4';
    const targetCommit =
      latestCommitInfo?.shortSha ||
      fetchedManifest?.gitCommit ||
      current.gitCommit;

    const manifest: VersionManifest = {
      version: targetVersion,
      buildNumber: fetchedManifest?.buildNumber || 5,
      buildTimestamp:
        latestCommitInfo?.date
          ? new Date(latestCommitInfo.date).getTime()
          : fetchedManifest?.buildTimestamp || Date.now(),
      gitCommit: targetCommit,
      commitTitle: latestCommitInfo?.title || fetchedManifest?.releaseNotes || 'PAIOS Updates & Optimizations',
      commitAuthor: latestCommitInfo?.author || 'PAIOS Team',
      commitDate: latestCommitInfo?.date || new Date().toISOString(),
      releaseNotes:
        latestCommitInfo?.title ||
        fetchedManifest?.releaseNotes ||
        'PAIOS v4.5.4: Money Manager Balance Sheet, Family Contribution & Interactive Debt/Invested Timelines',
      platforms: {
        windows: {
          url:
            fetchedManifest?.platforms?.windows?.url ||
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/PAIOS-Desktop-Windows-x64.zip',
          filename: 'PAIOS-Desktop-Windows-x64.zip',
          version: targetVersion,
        },
        android: {
          url:
            fetchedManifest?.platforms?.android?.url ||
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/android/app/build/outputs/apk/release/app-release.apk',
          filename: 'app-release.apk',
          version: targetVersion,
        },
      },
    };

    this.cachedManifest = manifest;

    const runningCommit = (getStoredActiveCommit() || current.gitCommit || '').trim();
    const runningVersion = (getStoredActiveVersion() || current.version || '').trim();

    // Detect if update is available
    const isNewerCommit =
      Boolean(targetCommit) &&
      Boolean(runningCommit) &&
      targetCommit.toLowerCase().substring(0, 7) !== runningCommit.toLowerCase().substring(0, 7);

    const isNewerVersionStr = Boolean(targetVersion) && targetVersion !== runningVersion;
    const isNewerTimestamp = (manifest.buildTimestamp || 0) > (current.buildTimestamp || 0);

    const updateAvailable = Boolean(isNewerCommit || isNewerVersionStr);

    const activeCurrent: VersionManifest = {
      ...current,
      version: runningVersion || current.version,
      gitCommit: runningCommit || current.gitCommit,
    };

    return {
      updateAvailable,
      manifest,
      currentVersion: activeCurrent,
    };
  }

  /**
   * Download the update asset for the current platform with multi-tier fallback & progress callbacks
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

            // Candidate URLs for Electron download
            const candidateUrls = [
              manifest.platforms?.windows?.url,
              'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist/PAIOS-Web-Dist.zip',
              'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist-electron/PAIOS-Desktop-Windows-x64.zip',
              'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/PAIOS-Desktop-Windows-x64.zip',
              '/api/version/download/windows',
            ].filter(Boolean);

            electron.ipcRenderer
              .invoke('paios:download-update', {
                url: candidateUrls[0],
                fallbackUrls: candidateUrls.slice(1),
                version: manifest.version,
              })
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

    // 2. Android & Web Candidate URLs
    const candidateUrls =
      platform === 'android'
        ? [
            manifest.platforms?.android?.url,
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/android/app/build/outputs/apk/release/app-release.apk',
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/android/app/build/outputs/apk/debug/app-debug.apk',
            '/api/version/download/android',
          ].filter(Boolean)
        : [
            manifest.platforms?.windows?.url,
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist/PAIOS-Web-Dist.zip',
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist-electron/PAIOS-Desktop-Windows-x64.zip',
            'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/PAIOS-Desktop-Windows-x64.zip',
            '/api/version/download/windows',
          ].filter(Boolean);

    let lastError: any = null;

    for (const url of candidateUrls) {
      if (!url) continue;
      try {
        const response = await fetch(url, {
          signal: this.activeDownloadAbortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${url}`);
        }

        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        let transferredBytes = 0;
        const startTime = Date.now();

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
        lastError = err;
        console.warn(`[UpdateService] Download failed from ${url}, trying next fallback...`, err);
      }
    }

    onProgress({
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      status: 'error',
      error: lastError?.message || 'Download failed across all candidate endpoints',
    });
    throw lastError || new Error('Download failed');
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

    if (typeof window !== 'undefined' && manifest) {
      try {
        if (manifest.gitCommit) {
          localStorage.setItem('paios_active_git_commit', manifest.gitCommit);
        }
        if (manifest.version) {
          localStorage.setItem('paios_active_version', manifest.version);
        }
      } catch (e) {}
    }

    // 1. Electron Platform Install / Reveal
    if (platform === 'electron') {
      try {
        const electron = (window as any).require ? (window as any).require('electron') : null;
        if (electron?.ipcRenderer) {
          let bufferArray: number[] | undefined = undefined;
          if (downloadedData instanceof Blob) {
            const ab = await downloadedData.arrayBuffer();
            bufferArray = Array.from(new Uint8Array(ab));
          }

          await electron.ipcRenderer.invoke('paios:apply-update', {
            version: manifest.version,
            gitCommit: manifest.gitCommit,
            filePath: typeof downloadedData === 'string' ? downloadedData : undefined,
            fileBuffer: bufferArray,
          });
          return;
        }
      } catch (err) {
        console.warn('[UpdateService] Electron apply-update IPC failed:', err);
      }
    }

    // 2. Android APK Installation Trigger
    if (platform === 'android') {
      const filename = manifest.platforms?.android?.filename || `PAIOS-v${manifest.version}.apk`;
      const apkDownloadUrl =
        manifest.platforms?.android?.url ||
        'http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/android/app/build/outputs/apk/release/app-release.apk';

      if (downloadedData instanceof Blob) {
        const blobUrl = URL.createObjectURL(downloadedData);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      } else {
        // Direct browser link to download APK
        window.open(apkDownloadUrl, '_system');
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
