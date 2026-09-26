/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRecovery } from '../../src/core/actions/ActionRecovery';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { TransactionRecord, ProposedAction } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';

function createDummyAction(txId: string, title = 'Sample Task'): ProposedAction {
  return {
    id: `act_${Math.random().toString(36).substring(2, 7)}`,
    transactionId: txId,
    type: 'CREATE_TASK',
    title,
    risk: 'LOW',
    requiresConfirmation: false,
    validationState: 'VALID',
    createdAt: Date.now(),
    payload: { title },
    affectedRecordIds: [],
  };
}

describe('ActionRecovery Unit Tests', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
  });

  it('safely marks transactions interrupted in VALIDATING state as FAILED', () => {
    const txId = 'tx-val-interrupted';
    const interruptedTx: TransactionRecord = {
      id: txId,
      originalCommand: 'create task test',
      actions: [createDummyAction(txId, 'test')],
      risk: 'LOW',
      status: 'VALIDATING',
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
      sourcePlatform: 'web',
      sourceDeviceId: 'dev-1',
      affectedRecords: [],
      expectedRevisions: {},
      beforeSnapshot: [],
      syncStatus: 'LOCAL',
      undoStatus: 'AVAILABLE',
    };

    ActionStorage.saveTransaction(interruptedTx);

    const report = ActionRecovery.recoverPendingTransactions();
    expect(report.recoveredCount).toBe(1);

    const updated = ActionStorage.getTransaction(txId);
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failureReason).toContain('Interrupted by application restart');
  });

  it('safely cleans up COMMITTING transactions with no written records', () => {
    const txId = 'tx-commit-interrupted';
    const committingTx: TransactionRecord = {
      id: txId,
      originalCommand: 'add task incomplete',
      actions: [createDummyAction(txId, 'incomplete')],
      risk: 'LOW',
      status: 'COMMITTING',
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
      sourcePlatform: 'web',
      sourceDeviceId: 'dev-1',
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: 'non-existent-task-id' }],
      expectedRevisions: {},
      beforeSnapshot: [],
      syncStatus: 'LOCAL',
      undoStatus: 'AVAILABLE',
    };

    ActionStorage.saveTransaction(committingTx);

    const report = ActionRecovery.recoverPendingTransactions();
    expect(report.recoveredCount).toBe(1);

    const updated = ActionStorage.getTransaction(txId);
    expect(updated?.status).toBe('FAILED');
  });

  it('reconciles COMMITTING transactions if records were already written before restart', () => {
    // Seed task as written
    PAIOSStorage.addTask('Already saved task', 'Work');
    const tasks = PAIOSStorage.getTasks();
    const taskId = String(tasks[0].id);

    const txId = 'tx-already-written';
    const committedAction = createDummyAction(txId, 'Already saved task');
    const committingTx: TransactionRecord = {
      id: txId,
      originalCommand: 'add task Already saved task',
      actions: [committedAction],
      risk: 'LOW',
      status: 'COMMITTING',
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
      sourcePlatform: 'web',
      sourceDeviceId: 'dev-1',
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: taskId }],
      expectedRevisions: {},
      beforeSnapshot: [],
      afterSnapshot: [{
        storageKey: 'paios_tasks_v1',
        recordId: taskId,
        data: JSON.parse(JSON.stringify(tasks[0])),
        exists: true,
      }],
      stepMarkers: [{ actionIndex: 0, actionId: committedAction.id, completedAt: Date.now() - 1000 }],
      syncStatus: 'LOCAL',
      undoStatus: 'AVAILABLE',
    };

    ActionStorage.saveTransaction(committingTx);

    const report = ActionRecovery.recoverPendingTransactions();
    expect(report.recoveredCount).toBe(1);

    const updated = ActionStorage.getTransaction(txId);
    expect(updated?.status).toBe('COMMITTED');
  });

  it('rolls back partial writes using before-snapshot', () => {
    // Task 1 was modified, Task 2 was never reached
    const originalTask = { id: 201, title: 'Original Title', category: 'Work', status: 'TODO' };
    PAIOSStorage.setItem('paios_tasks_v1', [
      { ...originalTask, title: 'Mutated Title Before Crash' },
    ]);

    const txId = 'tx-partial-crash';
    const partialTx: TransactionRecord = {
      id: txId,
      originalCommand: 'batch update',
      actions: [createDummyAction(txId, 'Update task 201')],
      risk: 'LOW',
      status: 'COMMITTING',
      createdAt: Date.now() - 5000,
      updatedAt: Date.now() - 5000,
      sourcePlatform: 'web',
      sourceDeviceId: 'dev-1',
      affectedRecords: [
        { storageKey: 'paios_tasks_v1', recordId: '201' },
        { storageKey: 'paios_tasks_v1', recordId: '202' }, // 202 was not written
      ],
      expectedRevisions: {},
      beforeSnapshot: [
        {
          storageKey: 'paios_tasks_v1',
          recordId: '201',
          data: originalTask,
          exists: true,
        },
        {
          storageKey: 'paios_tasks_v1',
          recordId: '202',
          data: null,
          exists: false,
        },
      ],
      syncStatus: 'LOCAL',
      undoStatus: 'AVAILABLE',
    };

    ActionStorage.saveTransaction(partialTx);

    const report = ActionRecovery.recoverPendingTransactions();
    expect(report.rolledBackCount).toBe(1);

    // Verify task 201 was rolled back to its snapshot data
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    const task201 = tasks?.find((t) => t.id === 201);
    expect(task201?.title).toBe('Original Title');

    const updated = ActionStorage.getTransaction(txId);
    expect(updated?.status).toBe('ROLLED_BACK');
  });
});
