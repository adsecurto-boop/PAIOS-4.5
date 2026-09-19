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

  const sampleActivity: ActivityLog = {
    id: 101,
    activityName: 'Deep Work Session',
    category: 'Work',
    startTime: '10:00 AM',
    durationMinutes: 45,
    isPaused: false,
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders with accessible ARIA attributes and button roles', () => {
    const root = createRoot(container);
    act(() => {
      root.render(
        <MiniTimerPlayer
          activity={sampleActivity}
          elapsedSeconds={120}
          onPause={vi.fn()}
          onResume={vi.fn()}
          onFinish={vi.fn()}
          onTap={vi.fn()}
        />
      );
    });

    const timerButton = container.querySelector('[role="button"]');
    expect(timerButton).not.toBeNull();
    expect(timerButton?.getAttribute('tabindex')).toBe('0');
    expect(timerButton?.getAttribute('aria-label')).toBe('View timer details for Deep Work Session');

    const pauseBtn = container.querySelector('button[aria-label="Pause Activity"]');
    expect(pauseBtn).not.toBeNull();

    const finishBtn = container.querySelector('button[aria-label="Finish Activity"]');
    expect(finishBtn).not.toBeNull();

    root.unmount();
  });

  it('triggers onTap callback on Enter or Space key press', () => {
    const onTapMock = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(
        <MiniTimerPlayer
          activity={sampleActivity}
          elapsedSeconds={120}
          onPause={vi.fn()}
          onResume={vi.fn()}
          onFinish={vi.fn()}
          onTap={onTapMock}
        />
      );
    });

    const timerButton = container.querySelector('[role="button"]') as HTMLElement;

    act(() => {
      timerButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onTapMock).toHaveBeenCalledTimes(1);

    act(() => {
      timerButton.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onTapMock).toHaveBeenCalledTimes(2);

    root.unmount();
  });

  it('renders Resume button with aria-label when activity is paused', () => {
    const pausedActivity = { ...sampleActivity, isPaused: true };
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

    const resumeBtn = container.querySelector('button[aria-label="Resume Activity"]');
    expect(resumeBtn).not.toBeNull();

    root.unmount();
  });
});
