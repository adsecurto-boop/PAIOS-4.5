export interface RuntimeDiagnostic {
  id: string;
  kind: 'error' | 'unhandledrejection' | 'recovery';
  message: string;
  timestamp: number;
  platform: 'web' | 'windows' | 'android';
}

const STORAGE_KEY = 'paios_runtime_diagnostics_v1';
const MAX_ENTRIES = 20;

function platform(): RuntimeDiagnostic['platform'] {
  if (typeof window !== 'undefined' && (window as any).electronAPI) return 'windows';
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) return 'android';
  return 'web';
}

function sanitize(value: unknown): string {
  const raw = value instanceof Error ? `${value.name}: ${value.message}` : String(value || 'Unknown runtime error');
  return raw
    .replace(/(api[_-]?key|token|password|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

export function recordRuntimeDiagnostic(kind: RuntimeDiagnostic['kind'], value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const list: RuntimeDiagnostic[] = Array.isArray(existing) ? existing : [];
    list.unshift({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `runtime_${Date.now()}`,
      kind,
      message: sanitize(value),
      timestamp: Date.now(),
      platform: platform(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // Diagnostics must never become a second crash source.
  }
}

export function installRuntimeDiagnostics(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onError = (event: ErrorEvent) => recordRuntimeDiagnostic('error', event.error || event.message);
  const onRejection = (event: PromiseRejectionEvent) => recordRuntimeDiagnostic('unhandledrejection', event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

