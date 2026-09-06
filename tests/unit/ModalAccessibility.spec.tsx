/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuickCaptureModal } from '../../src/components/QuickCaptureModal';
import { TaskModal } from '../../src/components/TaskModal';

describe('Unit Test: Modal Accessibility & Keyboard Navigation', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('QuickCaptureModal', () => {
    it('has dialog role, aria-modal, and aria-labelledby attributes', () => {
      const root = createRoot(container);
      act(() => {
        root.render(<QuickCaptureModal onDismiss={() => {}} onSave={() => {}} />);
      });

      const dialogEl = container.querySelector('[role="dialog"]');
      expect(dialogEl).not.toBeNull();
      expect(dialogEl?.getAttribute('aria-modal')).toBe('true');
      expect(dialogEl?.getAttribute('aria-labelledby')).toBe('quick-capture-title');

      const titleEl = container.querySelector('#quick-capture-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent).toBe('Quick Capture Note');

      const closeBtn = container.querySelector('button[aria-label="Close Quick Capture Modal"]');
      expect(closeBtn).not.toBeNull();

      root.unmount();
    });

    it('triggers onDismiss when Escape key is pressed', () => {
      const onDismissMock = vi.fn();
      const root = createRoot(container);
      act(() => {
        root.render(<QuickCaptureModal onDismiss={onDismissMock} onSave={() => {}} />);
      });

      act(() => {
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        window.dispatchEvent(escapeEvent);
      });

      expect(onDismissMock).toHaveBeenCalledTimes(1);
      root.unmount();
    });
  });

  describe('TaskModal', () => {
    it('has dialog role, aria-modal, aria-labelledby, and accessible icon buttons', () => {
      const root = createRoot(container);
      act(() => {
        root.render(<TaskModal onDismiss={() => {}} onSave={() => {}} />);
      });

      const dialogEl = container.querySelector('[role="dialog"]');
      expect(dialogEl).not.toBeNull();
      expect(dialogEl?.getAttribute('aria-modal')).toBe('true');
      expect(dialogEl?.getAttribute('aria-labelledby')).toBe('task-modal-title');

      const titleEl = container.querySelector('#task-modal-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl?.textContent).toBe('Add New Task');

      const closeBtn = container.querySelector('button[aria-label="Close Task Modal"]');
      expect(closeBtn).not.toBeNull();

      const priorityBtn = container.querySelector('button[aria-label="Toggle priority pin"]');
      expect(priorityBtn).not.toBeNull();

      root.unmount();
    });

    it('triggers onDismiss when Escape key is pressed', () => {
      const onDismissMock = vi.fn();
      const root = createRoot(container);
      act(() => {
        root.render(<TaskModal onDismiss={onDismissMock} onSave={() => {}} />);
      });

      act(() => {
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        window.dispatchEvent(escapeEvent);
      });

      expect(onDismissMock).toHaveBeenCalledTimes(1);
      root.unmount();
    });
  });
});
