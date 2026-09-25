/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskModal } from '../../src/components/TaskModal';
import { MiniTimerPlayer } from '../../src/components/MiniTimerPlayer';
import { ActivityLog } from '../../src/types';

describe('Unit Test: TaskModal & MiniTimerPlayer Accessibility (A11y)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders TaskModal with accessible close button, input labels, category aria-pressed, and priority pin aria-label/pressed', () => {
    const root = createRoot(container);
    act(() => {
      root.render(
        <TaskModal
          onDismiss={() => {}}
          onSave={() => {}}
        />
      );
    });

    // 1. Close button aria-label
    const closeBtn = container.querySelector('button[aria-label="Close task modal"]');
    expect(closeBtn).not.toBeNull();

    // 2. Input htmlFor & id associations
    const titleInput = container.querySelector('#task-title-input') as HTMLInputElement;
    expect(titleInput).not.toBeNull();
    const titleLabel = container.querySelector('label[for="task-title-input"]');
    expect(titleLabel).not.toBeNull();

    // 3. Category button aria-pressed
    const workCatBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Work'
    );
    expect(workCatBtn?.getAttribute('aria-pressed')).toBe('true');

    const studyCatBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Study'
    );
    expect(studyCatBtn?.getAttribute('aria-pressed')).toBe('false');

    // 4. Pin to priority aria-label & aria-pressed
    const pinBtn = container.querySelector('button[aria-label="Pin task to priority list"]');
    expect(pinBtn).not.toBeNull();
    expect(pinBtn?.getAttribute('aria-pressed')).toBe('false');

    // Toggle pin button
    act(() => {
      (pinBtn as HTMLButtonElement).click();
    });
    expect(pinBtn?.getAttribute('aria-pressed')).toBe('true');

    root.unmount();
  });

  it('renders MiniTimerPlayer controls with accessible aria-label attributes', () => {
    const mockActivity: ActivityLog = {
      id: 1,
      activityName: 'Deep Focus Session',
      category: 'Coding',
      startTimeMillis: Date.now() - 60000,
      isPaused: false,
    };

    const root = createRoot(container);
    act(() => {
      root.render(
        <MiniTimerPlayer
          activity={mockActivity}
          elapsedSeconds={60}
          onPause={() => {}}
          onResume={() => {}}
          onFinish={() => {}}
          onTap={() => {}}
        />
      );
    });

    // Pause button aria-label
    const pauseBtn = container.querySelector('button[aria-label="Pause Activity"]');
    expect(pauseBtn).not.toBeNull();

    // Finish button aria-label
    const finishBtn = container.querySelector('button[aria-label="Finish Activity"]');
    expect(finishBtn).not.toBeNull();

    root.unmount();
  });
});
