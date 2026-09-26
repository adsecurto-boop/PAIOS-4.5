/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { SearchModeService } from '../../src/core/actions/SearchModeService';
import { AskModeService } from '../../src/core/actions/AskModeService';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ActionExecutor } from '../../src/core/actions/ActionExecutor';
import { UniversalCommandBar } from '../../src/components/actions/UniversalCommandBar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('DEF-08: Command Bar Mode Separation & Nested Escape Invariants', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('SearchModeService performs zero mutations and neither executor nor transaction manager is invoked', async () => {
    const txSpy = vi.spyOn(ActionTransactionManager, 'executeTransaction');
    const execSpy = vi.spyOn(ActionExecutor, 'executeAction');

    // Seed some data
    PAIOSStorage.setItem('paios_tasks_v1', [
      { id: 1, title: 'Buy milk', completed: false, category: 'Personal' },
      { id: 2, title: 'Buy protein', completed: true, category: 'Health' },
    ]);

    // Search query
    const results = await SearchModeService.search('buy');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title.includes('Buy milk'))).toBe(true);

    // Verify neither executeTransaction nor executeAction was ever called
    expect(txSpy).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();

    // Verify 0 ledger entries
    expect(ActionStorage.getAllTransactions()).toHaveLength(0);
  });

  it('SearchModeService treats action commands as text queries with zero side effects', async () => {
    const txSpy = vi.spyOn(ActionTransactionManager, 'executeTransaction');
    const execSpy = vi.spyOn(ActionExecutor, 'executeAction');

    // User types "create task Buy apples" while in SEARCH mode
    const results = await SearchModeService.search('create task Buy apples');

    // Should only search existing records, NOT create a task
    expect(txSpy).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    expect(tasks?.some((t) => t.title === 'Buy apples')).toBe(false);
  });

  it('AskModeService is structurally read-only and advises mode switch without executing', async () => {
    const txSpy = vi.spyOn(ActionTransactionManager, 'executeTransaction');
    const execSpy = vi.spyOn(ActionExecutor, 'executeAction');

    // User asks "Can you log an expense of 500 for lunch?" in Ask mode
    const response = await AskModeService.ask('log an expense of 500 for lunch', { context: 'Daily briefing' });

    expect(response.answer).toBeDefined();
    if (response.suggestsActMode) {
      expect(response.suggestedPrompt).toBeDefined();
    }

    // Crucially: MUST NEVER execute any action or transaction!
    expect(txSpy).not.toHaveBeenCalled();
    expect(execSpy).not.toHaveBeenCalled();
    expect(ActionStorage.getAllTransactions()).toHaveLength(0);

    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.length ?? 0).toBe(0);
  });

  it('UniversalCommandBar handles nested Escape key: dismisses preview before closing command bar', async () => {
    const onCloseSpy = vi.fn();
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <UniversalCommandBar
          isOpen={true}
          onClose={onCloseSpy}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    // Type high-value expense command that triggers HIGH risk and requires confirmation
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      nativeInputValueSetter?.call(input, 'I spent 50000 on rent');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Press Enter to submit in ACT mode
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Preview should now be displayed
    expect(container.textContent).toContain('Cancel');
    expect(container.textContent).toContain('Edit command');
    expect(onCloseSpy).not.toHaveBeenCalled();

    // First Escape: Should dismiss the preview layer back to INPUT, NOT close the modal
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onCloseSpy).not.toHaveBeenCalled();
    // Preview should now be gone, back to input
    expect(container.querySelector('input')).not.toBeNull();

    // Second Escape: Should now close the command bar
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });
});
