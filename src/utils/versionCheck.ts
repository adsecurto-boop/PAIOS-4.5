// PAIOS Version Manifest & Background Update Checker
import { UpdateService, VersionManifest, CURRENT_CLIENT_VERSION } from '../services/UpdateService';

export type { VersionManifest, PlatformAssetInfo, DownloadProgress } from '../services/UpdateService';
export { CURRENT_CLIENT_VERSION } from '../services/UpdateService';

// Re-export CLIENT_VERSION for backward compatibility
export const CLIENT_VERSION: VersionManifest = CURRENT_CLIENT_VERSION;

export type UpdateCallback = (manifest: VersionManifest) => void;
const updateListeners: Set<UpdateCallback> = new Set();

let latestAvailableManifest: VersionManifest | null = null;
let checkIntervalTimer: any = null;

/**
 * Register a listener to be notified when a new app version is available
 */
export function onVersionUpdateAvailable(callback: UpdateCallback): () => void {
  updateListeners.add(callback);
  if (latestAvailableManifest) {
    callback(latestAvailableManifest);
  }
  return () => {
    updateListeners.delete(callback);
  };
}

/**
 * Register the Service Worker in supported browser environments
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test')
  ) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.onstatechange = () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              checkForAppUpdates();
            }
          };
        }
      };

      return registration;
    } catch (err) {
      console.warn('[PAIOS SW] Service worker registration deferred:', err);
    }
  }
  return null;
}

/**
 * Fetches version manifest and checks if a newer version exists
 */
export async function checkForAppUpdates(): Promise<{ updateAvailable: boolean; serverManifest: VersionManifest | null }> {
  try {
    const result = await UpdateService.checkForUpdates();
    if (result.updateAvailable) {
      latestAvailableManifest = result.manifest;
      updateListeners.forEach((cb) => cb(result.manifest));

      window.dispatchEvent(
        new CustomEvent('paios_version_update_available', {
          detail: result.manifest,
        })
      );
    }
    return { updateAvailable: result.updateAvailable, serverManifest: result.manifest };
  } catch (err) {
    console.warn('[PAIOS AutoUpdate] Check for updates failed:', err);
    return { updateAvailable: false, serverManifest: null };
  }
}

/**
 * Initializes the background update checker at app launch
 */
export function initBackgroundVersionChecker(): void {
  registerServiceWorker();
  checkForAppUpdates();

  window.addEventListener('focus', () => {
    checkForAppUpdates();
  });

  if (!checkIntervalTimer) {
    checkIntervalTimer = setInterval(() => {
      checkForAppUpdates();
    }, 4 * 60 * 1000);
  }
}

/**
 * Prompts Service Worker to skip waiting and reloads the application to apply the latest build
 */
export function applyUpdateAndReload(): void {
  UpdateService.installUpdate(latestAvailableManifest || CURRENT_CLIENT_VERSION);
}
