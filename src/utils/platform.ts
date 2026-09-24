type CapacitorRuntime = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
};

export const getCapacitorRuntime = (): CapacitorRuntime | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: CapacitorRuntime }).Capacitor;
};

export const isAndroidNative = (): boolean => {
  const capacitor = getCapacitorRuntime();
  return Boolean(capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'android');
};

export const applyPlatformClass = (): (() => void) => {
  if (typeof document === 'undefined') return () => undefined;
  const root = document.documentElement;
  const android = isAndroidNative();
  root.classList.toggle('native-android', android);
  root.dataset.platform = android ? 'android' : 'web';

  return () => {
    root.classList.remove('native-android');
    delete root.dataset.platform;
  };
};
