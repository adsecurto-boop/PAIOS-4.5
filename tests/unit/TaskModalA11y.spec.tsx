/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskModal } from '../../src/components/TaskModal';

describe('Unit Test: TaskModal Accessibility Attributes', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders close button with aria-label', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
    });

    const closeBtn = container.querySelector('button[aria-label="Close task modal"]');
    expect(closeBtn).not.toBeNull();

    root.unmount();
  });

  it('binds label htmlFor to input and textarea id attributes', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
    });

    const titleInput = container.querySelector('#task-title-input') as HTMLInputElement;
    const titleLabel = container.querySelector('label[for="task-title-input"]');
    expect(titleInput).not.toBeNull();
    expect(titleLabel).not.toBeNull();

    const descTextarea = container.querySelector('#task-description-input') as HTMLTextAreaElement;
    const descLabel = container.querySelector('label[for="task-description-input"]');
    expect(descTextarea).not.toBeNull();
    expect(descLabel).not.toBeNull();

    root.unmount();
  });

  it('sets aria-pressed on category and priority buttons', () => {
    const root = createRoot(container);
    act(() => {
      root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
    });

    const workCategoryBtn = Array.from(container.querySelectorAll('button[aria-pressed]')).find(
      (btn) => btn.textContent === 'Work'
    ) as HTMLButtonElement;
    expect(workCategoryBtn).not.toBeNull();
    expect(workCategoryBtn.getAttribute('aria-pressed')).toBe('true');

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
