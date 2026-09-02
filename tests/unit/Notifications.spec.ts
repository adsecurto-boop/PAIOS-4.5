/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dispatchNotification, requestNotificationPermission } from '../../src/utils/notifications';

describe('Unit Test: Desktop OS Native Notifications & Fallbacks (BUG-02)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).electronAPI;
    delete (window as any).require;
    vi.restoreAllMocks();
  });

  it('dispatches desktop notification via window.electronAPI when running in Electron', async () => {
    const mockSendNotification = vi.fn();
    (window as any).electronAPI = {
      sendNotification: mockSendNotification,
    };

    const notif = await dispatchNotification('Prescription Alert', 'Take Sertraline 50 mg now', 'MEDICATION');

    expect(notif.title).toBe('Prescription Alert');
    expect(mockSendNotification).toHaveBeenCalledWith({
      title: 'PAIOS: Prescription Alert',
      body: 'Take Sertraline 50 mg now',
      message: 'Take Sertraline 50 mg now',
    });
  });

  it('dispatches desktop notification via window.require("electron").ipcRenderer fallback', async () => {
    const mockIpcSend = vi.fn();
    (window as any).require = vi.fn().mockReturnValue({
      ipcRenderer: {
        send: mockIpcSend,
      },
    });

    await dispatchNotification('Focus Timer', 'Pomodoro break starting', 'FOCUS');

    expect(mockIpcSend).toHaveBeenCalledWith('show-desktop-notification', {
      title: 'PAIOS: Focus Timer',
      body: 'Pomodoro break starting',
      message: 'Pomodoro break starting',
    });
  });

  it('falls back to HTML5 Web Notification when not running in Electron and permission is granted', async () => {
    const mockNotificationConstructor = vi.fn();
    (window as any).Notification = mockNotificationConstructor;
    (window as any).Notification.permission = 'granted';

    await dispatchNotification('Daily Review', 'Complete evening check-in', 'CHECKIN');

    expect(mockNotificationConstructor).toHaveBeenCalledWith('PAIOS: Daily Review', {
      body: 'Complete evening check-in',
      icon: '/favicon.ico',
    });
  });
});
