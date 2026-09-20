/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskModal } from '../../src/components/TaskModal';

describe('Unit Test: TaskModal Accessibility & Keyboard UX', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders close button with explicit aria-label', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
    });

    const closeBtn = container.querySelector('button[aria-label="Close task modal"]');
    expect(closeBtn).not.toBeNull();

    root.unmount();
  });

  it('renders category buttons with correct initial aria-pressed attributes', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
    });

    // Default category is 'Work'
    const workCatBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Work'
    );
    const studyCatBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Study'
    );

    expect(workCatBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(studyCatBtn?.getAttribute('aria-pressed')).toBe('false');

    root.unmount();
  });

  it('renders priority button with aria-label and updates aria-pressed on toggle', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
    });

    const priorityBtn = container.querySelector('button[aria-label="Pin to priority today"]') as HTMLButtonElement;
    expect(priorityBtn).not.toBeNull();
    expect(priorityBtn.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      priorityBtn.click();
    });

    expect(priorityBtn.getAttribute('aria-pressed')).toBe('true');

    root.unmount();
  });
});
