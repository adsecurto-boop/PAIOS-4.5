/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskModal } from '../../src/components/TaskModal';

describe('Unit Test: TaskModal Accessibility (Palette UX)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders close button with explicit aria-label', () => {
    const onDismiss = vi.fn();
    const onSave = vi.fn();

    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={onDismiss} onSave={onSave} />);
    });

    const closeBtn = container.querySelector('button[aria-label="Close task modal"]');
    expect(closeBtn).not.toBeNull();

    act(() => {
      (closeBtn as HTMLButtonElement).click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it('associates task title and description labels with inputs via htmlFor and id', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={vi.fn()} onSave={vi.fn()} />);
    });

    const titleLabel = container.querySelector('label[for="task-title"]');
    const titleInput = container.querySelector('input#task-title');
    expect(titleLabel).not.toBeNull();
    expect(titleInput).not.toBeNull();

    const descLabel = container.querySelector('label[for="task-description"]');
    const descInput = container.querySelector('textarea#task-description');
    expect(descLabel).not.toBeNull();
    expect(descInput).not.toBeNull();

    root.unmount();
  });

  it('sets aria-pressed on category buttons and priority toggle button', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={vi.fn()} onSave={vi.fn()} />);
    });

    // Check category buttons initial state
    const workCatBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Work'
    );
    const studyCatBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Study'
    );

    expect(workCatBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(studyCatBtn?.getAttribute('aria-pressed')).toBe('false');

    // Click 'Study' category button
    act(() => {
      studyCatBtn?.click();
    });

    expect(workCatBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(studyCatBtn?.getAttribute('aria-pressed')).toBe('true');

    // Check priority toggle button
    const priorityBtn = container.querySelector('button[aria-label*="priority"]');
    expect(priorityBtn).not.toBeNull();
    expect(priorityBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(priorityBtn?.getAttribute('aria-label')).toBe('Pin task as priority today');

    act(() => {
      (priorityBtn as HTMLButtonElement).click();
    });

    expect(priorityBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(priorityBtn?.getAttribute('aria-label')).toBe('Unpin priority task');

    root.unmount();
  });
});
