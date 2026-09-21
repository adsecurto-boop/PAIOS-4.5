/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiniTimerPlayer } from '../../src/components/MiniTimerPlayer';
import { ActivityLog } from '../../src/types';

describe('Unit Test: MiniTimerPlayer Accessibility & Keyboard Interactions', () => {
  let container: HTMLDivElement;

  const mockActivity: ActivityLog = {
    id: 101,
    activityName: 'Coding Feature',
    category: 'Work',
    startTimeMillis: Date.now() - 60000,
    isPaused: false,
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders ARIA labels on control buttons and interactive timer container', () => {
    const root = createRoot(container);
    act(() => {
      root.render(
        <MiniTimerPlayer
          activity={mockActivity}
          elapsedSeconds={120}
          onPause={vi.fn()}
          onResume={vi.fn()}
          onFinish={vi.fn()}
          onTap={vi.fn()}
        />
      );
    });

    const timerBtn = container.querySelector('[role="button"]');
    expect(timerBtn).not.toBeNull();
    expect(timerBtn?.getAttribute('aria-label')).toBe('View timer details for Coding Feature');
    expect(timerBtn?.getAttribute('tabindex')).toBe('0');

    const pauseBtn = container.querySelector('button[aria-label="Pause activity"]');
    expect(pauseBtn).not.toBeNull();

    const finishBtn = container.querySelector('button[aria-label="Finish activity"]');
    expect(finishBtn).not.toBeNull();

    root.unmount();
  });

  it('renders Resume button with aria-label when activity is paused', () => {
    const pausedActivity = { ...mockActivity, isPaused: true };
    const root = createRoot(container);
    act(() => {
      root.render(
        <MiniTimerPlayer
          activity={pausedActivity}
          elapsedSeconds={120}
          onPause={vi.fn()}
          onResume={vi.fn()}
          onFinish={vi.fn()}
          onTap={vi.fn()}
        />
      );
    });

    const resumeBtn = container.querySelector('button[aria-label="Resume activity"]');
    expect(resumeBtn).not.toBeNull();

    root.unmount();
  });

  it('triggers onTap when Enter or Space key is pressed on timer container', () => {
    const onTapMock = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(
        <MiniTimerPlayer
          activity={mockActivity}
          elapsedSeconds={120}
          onPause={vi.fn()}
          onResume={vi.fn()}
          onFinish={vi.fn()}
          onTap={onTapMock}
        />
      );
    });

    const timerBtn = container.querySelector('[role="button"]') as HTMLElement;

    act(() => {
      timerBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onTapMock).toHaveBeenCalledTimes(1);

    act(() => {
      timerBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onTapMock).toHaveBeenCalledTimes(2);

    root.unmount();
  });
});
