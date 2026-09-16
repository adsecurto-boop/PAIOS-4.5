/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationCenterModal } from '../../src/components/NotificationCenterModal';
import * as notificationsUtil from '../../src/utils/notifications';

describe('NotificationCenterModal Accessibility Tests', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.restoreAllMocks();
  });

  it('renders action buttons with proper aria-label attributes when notifications exist', () => {
    vi.spyOn(notificationsUtil, 'getNotificationsHistory').mockReturnValue([
      {
        id: '1',
        title: 'Test Notif',
        message: 'Test message',
        timestampMillis: Date.now(),
        type: 'SYSTEM',
        read: false,
      },
    ]);

    const root = createRoot(container);
    act(() => {
      root.render(<NotificationCenterModal isOpen={true} onClose={() => {}} />);
    });

    const markReadBtn = container.querySelector('button[aria-label="Mark all notifications as read"]');
    const clearHistoryBtn = container.querySelector('button[aria-label="Clear notification history"]');

    expect(markReadBtn).not.toBeNull();
    expect(clearHistoryBtn).not.toBeNull();

    root.unmount();
  });
});
