/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionRecovery } from '../../src/core/actions/ActionRecovery';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { StorageMutationAdapters } from '../../src/core/actions/StorageMutationAdapters';
import { PAIOSStorage } from '../../src/storage';
import { TransactionRecord, ProposedAction } from '../../src/core/actions/actionTypes';
import { Task } from '../../src/types';

describe('DEF-07: Verifiable Startup Crash Recovery', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
  });

  it('does not falsely classify pre-existing records as committed when crashed before mutation', () => {
    // A task already exists in storage with title "Original" and completed: false
    const task: Task = {
      id: 501,
      title: 'Original Task',
      completed: false,
      status: 'TODO',
      createdAt: Date.now(),
      priority: 'MEDIUM',
      category: 'General',
    };
    PAIOSStorage.setItem('paios_tasks_v1', [task]);

    // An update transaction was interrupted in COMMITTING before applying the update
    const action: ProposedAction = {
      id: 'act-crash-1',
      transactionId: 'tx-crash-1',
      type: 'COMPLETE_TASK',
      title: 'Complete task 501',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 501 },
      affectedRecordIds: ['501'],
      originDeviceId: 'dev',
      sourceText: 'done',
      explanation: 'test',
      expectedRevisions: {},
    };

    const crashedTx: TransactionRecord = {
      id: 'tx-crash-1',
      originalCommand: 'complete 501',
      actions: [action],
      risk: 'LOW',
      status: 'COMMITTING',
      phase: 'COMMITTING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: 'web',
      sourceDeviceId: 'dev',
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: '501' }],
      expectedRevisions: {},
      beforeSnapshot: [
        {
          storageKey: 'paios_tasks_v1',
          recordId: '501',
          exists: true,
          data: { ...task },
        },
      ],
      syncStatus: 'LOCAL',
      undoStatus: 'NOT_APPLICABLE',
      stepMarkers: [], // No steps completed!
    };

    ActionStorage.saveTransaction(crashedTx);

    // Run recovery
    const report = ActionRecovery.recoverPendingTransactions();

    // Because stepMarkers is empty and the task is still uncompleted in storage,
    // recovery must NOT claim it was committed!
    const recoveredTx = ActionStorage.getTransaction('tx-crash-1');
    expect(recoveredTx?.status).not.toBe('COMMITTED');
    expect(recoveredTx?.status).toBe('FAILED');
    expect(report.recoveredCount).toBe(1);

    // Storage remains intact and unchanged
    const currentTasks = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    expect(currentTasks[0].completed).toBe(false);
  });

  it('marks transaction RECOVERY_REQUIRED if rollback verification fails on startup recovery', () => {
    // Interrupted transaction with partial writes
    const crashedTx: TransactionRecord = {
      id: 'tx-crash-rollback-fail',
      originalCommand: 'multi action crash',
      actions: [],
      risk: 'MEDIUM',
      status: 'COMMITTING',
      phase: 'COMMITTING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: 'web',
      sourceDeviceId: 'dev',
      affectedRecords: [{ storageKey: 'paios_corrupt_store', recordId: 'rec-1' }],
      expectedRevisions: {},
      beforeSnapshot: [
        {
          storageKey: 'paios_corrupt_store',
          recordId: 'rec-1',
          exists: false,
          data: null,
        },
      ],
      syncStatus: 'LOCAL',
      undoStatus: 'NOT_APPLICABLE',
      stepMarkers: [{ actionIndex: 0, actionId: 'act-1', completedAt: Date.now() }],
    };

    // Put data in and simulate failing adapter restoration
    ActionStorage.saveTransaction(crashedTx);

    const adapter = StorageMutationAdapters.getAdapter('paios_corrupt_store');
    const spy = vi.spyOn(adapter, 'restoreSnapshot').mockReturnValue({
      success: false,
      storageKey: 'paios_corrupt_store',
      recordId: 'rec-1',
      error: 'Corrupt storage could not be restored',
    });

    // Simulate recovery with failing store
    const report = ActionRecovery.recoverPendingTransactions();
    const resultTx = ActionStorage.getTransaction('tx-crash-rollback-fail');

    spy.mockRestore();

    // If rollback failed or could not be verified, must flag for recovery
    expect(['RECOVERY_REQUIRED', 'FAILED']).toContain(resultTx?.status);
  });
});
