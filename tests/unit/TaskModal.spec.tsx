/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskModal } from '../../src/components/TaskModal';

describe('TaskModal Accessibility and UX', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders close button with correct aria-label and triggers onDismiss', () => {
    const handleDismiss = vi.fn();
    const handleSave = vi.fn();

    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={handleDismiss} onSave={handleSave} />);
    });

    const closeBtn = container.querySelector('button[aria-label="Close modal"]') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();

    act(() => {
      closeBtn.click();
    });

    expect(handleDismiss).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it('sets aria-pressed on category selection buttons correctly', () => {
    const handleDismiss = vi.fn();
    const handleSave = vi.fn();

    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={handleDismiss} onSave={handleSave} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const workBtn = buttons.find((b) => b.textContent?.trim() === 'Work');
    const studyBtn = buttons.find((b) => b.textContent?.trim() === 'Study');

    expect(workBtn).not.toBeUndefined();
    expect(studyBtn).not.toBeUndefined();

    expect(workBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(studyBtn?.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      studyBtn?.click();
    });

    expect(workBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(studyBtn?.getAttribute('aria-pressed')).toBe('true');

    root.unmount();
  });

  it('sets aria-label and aria-pressed on priority toggle button', () => {
    const handleDismiss = vi.fn();
    const handleSave = vi.fn();

    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={handleDismiss} onSave={handleSave} />);
    });

    const priorityBtn = container.querySelector('button[aria-label="Pin to Priority Today"]') as HTMLButtonElement;
    expect(priorityBtn).not.toBeNull();
    expect(priorityBtn.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      priorityBtn.click();
    });

    expect(priorityBtn.getAttribute('aria-pressed')).toBe('true');

    root.unmount();
  });
});
