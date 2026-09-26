import { LocalNotifications } from '@capacitor/local-notifications';

export interface PaiosNotification {
  id: string;
  title: string;
  message: string;
  type: 'SCHEDULE' | 'MEDICATION' | 'FOCUS' | 'TASK' | 'CHECKIN' | 'SYSTEM';
  timestampMillis: number;
  read: boolean;
  actionUrl?: string;
  route?: NotificationRoute;
}

export type NotificationRoute =
  | { screen: 'TODAY' | 'TIMELINE' | 'TASKS' | 'HEALTH' | 'INSIGHTS' }
  | { screen: 'CHECKIN' | 'REVIEW' }
  | { screen: 'TIMELINE'; blockId?: string }
  | { screen: 'HEALTH'; medicationId?: string };

const NOTIF_STORAGE_KEY = 'paios_notifications_history_v1';

export function getNotificationsHistory(): PaiosNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load notification history:', e);
    return [];
  }
}

export function saveNotificationsHistory(items: PaiosNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
    window.dispatchEvent(new CustomEvent('paios_notification_change'));
  } catch (e) {
    console.error('Failed to save notifications:', e);
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  if (electronAPI?.notificationsSupported) {
    try {
      return Boolean(await electronAPI.notificationsSupported());
    } catch (error) {
      console.warn('Electron notification capability check failed:', error);
      return false;
    }
  }

  try {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return (await LocalNotifications.checkPermissions()).display === 'granted';
    }
  } catch (error) {
    console.warn('Capacitor notification capability check failed:', error);
  }

  return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  // Electron notifications are delivered by the trusted main-process bridge and
  // do not use the browser permission prompt.
  const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  if (electronAPI?.notificationsSupported) {
    try {
      return Boolean(await electronAPI.notificationsSupported());
    } catch (error) {
      console.warn('Electron notification capability check failed:', error);
    }
  }

  // 1. Try Capacitor Local Notifications permission
  try {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display === 'granted') {
        return true;
      }
    }
  } catch (err) {
    console.warn('Capacitor notifications request skipped:', err);
  }

  // 2. Try HTML5 Web Notification API
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const status = await Notification.requestPermission();
      return status === 'granted';
    }
  }

  return false;
}

export async function dispatchNotification(
  title: string,
  message: string,
  type: PaiosNotification['type'] = 'SYSTEM',
  route?: NotificationRoute,
): Promise<PaiosNotification> {
  const notifItem: PaiosNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title,
    message,
    type,
    timestampMillis: Date.now(),
    read: false,
    route,
  };

  // 1. Save to in-app notification center history
  const history = getNotificationsHistory();
  saveNotificationsHistory([notifItem, ...history]);

  // 2. Trigger Capacitor Native Android Local Notification
  try {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      const canNotif = await LocalNotifications.checkPermissions();
      if (canNotif.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: [
            {
              title: `PAIOS: ${title}`,
              body: message,
              id: Math.floor(Math.random() * 100000),
              schedule: { at: new Date(Date.now() + 100) },
              smallIcon: 'res://icon',
              actionTypeId: 'PAIOS_OPEN',
              extra: { route, notificationId: notifItem.id },
            },
          ],
        });
      }
    }
  } catch (e) {
    console.warn('Capacitor local notification schedule failed:', e);
  }

  // 3. Trigger Desktop OS Native Notification (Electron) or HTML5 Web Notification
  if (typeof window !== 'undefined') {
    const electronAPI = (window as any).electronAPI;
    const electron = (window as any).require ? (window as any).require('electron') : null;

    let dispatchedViaElectron = false;
    if (electronAPI && typeof electronAPI.showNotification === 'function') {
      try {
        const result = await electronAPI.showNotification({
          title: `PAIOS: ${title}`,
          body: message,
          message,
        });
        dispatchedViaElectron = result?.success === true;
      } catch (e) {
        console.warn('Electron window.electronAPI notification failed:', e);
      }
    } else if (electronAPI && typeof electronAPI.sendNotification === 'function') {
      try {
        electronAPI.sendNotification({ title: `PAIOS: ${title}`, body: message, message });
        dispatchedViaElectron = true;
      } catch (e) {
        console.warn('Electron window.electronAPI notification failed:', e);
      }
    } else if (electron && electron.ipcRenderer && typeof electron.ipcRenderer.send === 'function') {
      try {
        electron.ipcRenderer.send('show-desktop-notification', {
          title: `PAIOS: ${title}`,
          body: message,
          message,
        });
        dispatchedViaElectron = true;
      } catch (e) {
        console.warn('Electron ipcRenderer notification failed:', e);
      }
    }

    if (!dispatchedViaElectron && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(`PAIOS: ${title}`, {
          body: message,
          icon: '/favicon.ico',
        });
        browserNotification.onclick = () => {
          window.focus();
          routeNotification(route, notifItem.id);
          browserNotification.close();
        };
      } catch (e) {
        console.warn('HTML5 Notification trigger error:', e);
      }
    }
  }

  return notifItem;
}

export function routeNotification(route?: NotificationRoute, notificationId?: string): void {
  if (notificationId) markNotificationAsRead(notificationId);
  if (typeof window !== 'undefined' && route) {
    window.dispatchEvent(new CustomEvent('paios_notification_route', { detail: route }));
  }
}

export async function initializeNativeNotificationActions(): Promise<() => void> {
  if (typeof window === 'undefined' || !(window as any).Capacitor) return () => undefined;
  try {
    await LocalNotifications.registerActionTypes({
      types: [{ id: 'PAIOS_OPEN', actions: [{ id: 'OPEN', title: 'Open in PAIOS', foreground: true }] }],
    });
    const listener = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      routeNotification(event.notification.extra?.route as NotificationRoute | undefined, event.notification.extra?.notificationId);
    });
    return () => { void listener.remove(); };
  } catch (error) {
    console.warn('Native notification action initialization skipped:', error);
    return () => undefined;
  }
}

export function markNotificationAsRead(id: string): void {
  const history = getNotificationsHistory();
  const updated = history.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotificationsHistory(updated);
}

export function clearAllNotifications(): void {
  saveNotificationsHistory([]);
}

export function markAllNotificationsAsRead(): void {
  const history = getNotificationsHistory();
  const updated = history.map((n) => ({ ...n, read: true }));
  saveNotificationsHistory(updated);
}
