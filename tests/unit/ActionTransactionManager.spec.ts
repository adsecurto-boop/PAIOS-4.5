/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ActionConfirmationManager } from '../../src/core/actions/ActionConfirmationManager';
import { ProposedAction, TransactionRecord } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { ActionExecutor } from '../../src/core/actions/ActionExecutor';

describe('ActionTransactionManager Unit Tests', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
    ActionConfirmationManager.reset();
  });

  it('atomically executes a multi-action transaction', async () => {
    const actions: ProposedAction[] = [
      {
        id: 'act-1',
        transactionId: 'tx-multi-1',
        type: 'CREATE_TASK',
        title: 'Task Alpha',
        risk: 'LOW',
        requiresConfirmation: false,
        validationState: 'VALID',
        createdAt: Date.now(),
        payload: { title: 'Task Alpha', category: 'Work' },
        affectedRecordIds: [],
      },
      {
        id: 'act-2',
        transactionId: 'tx-multi-1',
        type: 'RECORD_EXPENSE',
        title: 'Expense Beta',
        risk: 'MEDIUM',
        requiresConfirmation: true,
        validationState: 'VALID',
        createdAt: Date.now(),
        payload: { amount: 120, title: 'Team Coffee', category: 'Food' },
        affectedRecordIds: [],
      },
    ];

    const tx = ActionTransactionManager.buildTransaction(actions, 'add task alpha and log 120 expense for team coffee');
    tx.id = 'tx-multi-1';

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    expect(report.success).toBe(true);
    expect(report.rolledBack).toBe(false);
    expect(report.transaction.status).toBe('COMMITTED');

    // Verify task is stored in PAIOSStorage
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    expect(tasks?.some((t) => t.title === 'Task Alpha')).toBe(true);

    // Verify expense is stored in PAIOSStorage
    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.some((e) => e.title === 'Team Coffee' && e.amount === 120)).toBe(true);

    // Verify transaction ledger has record
    const recorded = ActionStorage.getTransaction('tx-multi-1');
    expect(recorded?.status).toBe('COMMITTED');
  });

  it('triggers atomic rollback when an action in the batch fails', async () => {
    // Action 1 creates a task
    const action1: ProposedAction = {
      id: 'act-task',
      transactionId: 'tx-fail-1',
      type: 'CREATE_TASK',
      title: 'Rollback Task Test',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Rollback Task Test' },
      affectedRecordIds: [],
    };

    // Action 2 attempts to complete a non-existent task ID that causes ActionExecutor to fail
    const action2: ProposedAction = {
      id: 'act-invalid',
      transactionId: 'tx-fail-1',
      type: 'COMPLETE_TASK',
      title: 'Complete non-existent task',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 9999999 },
      affectedRecordIds: ['9999999'],
    };

    const tx = ActionTransactionManager.buildTransaction([action1, action2], 'rollback test');
    tx.id = 'tx-fail-1';

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    expect(report.success).toBe(false);
    expect(report.rolledBack).toBe(true);
    expect(report.transaction.status).toBe('ROLLED_BACK');
    expect(report.failedAction?.id).toBe('act-invalid');

    // Crucial check: Action 1 was rolled back and did NOT leave orphan records
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    expect(tasks?.some((t) => t.title === 'Rollback Task Test')).toBe(false);
  });

  it('guarantees idempotency when re-executing already committed transactions', async () => {
    const action: ProposedAction = {
      id: 'act-idem',
      transactionId: 'tx-idem-1',
      type: 'CREATE_TASK',
      title: 'Idempotent Task',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Idempotent Task' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'idempotent command');
    tx.id = 'tx-idem-1';

    const firstRun = await ActionTransactionManager.executeTransaction(tx);
    expect(firstRun.success).toBe(true);
    expect(firstRun.transaction.status).toBe('COMMITTED');

    // Second run with the same transaction
    const secondRun = await ActionTransactionManager.executeTransaction(tx);
    expect(secondRun.success).toBe(true);
    expect(secondRun.message).toContain('already committed');

    // Confirm task was not created twice
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    expect(tasks?.filter((t) => t.title === 'Idempotent Task')).toHaveLength(1);
  });

  it('aborts transaction if concurrency revision mismatch is detected', async () => {
    // Initial task
    const initialTask = { id: 101, title: 'Original Task', completed: false };
    PAIOSStorage.setItem('paios_tasks_v1', [initialTask]);

    const action: ProposedAction = {
      id: 'act-conflict',
      transactionId: 'tx-conflict-1',
      type: 'COMPLETE_TASK',
      title: 'Complete task 101',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 101 },
      affectedRecordIds: ['101'],
      expectedRevisions: {
        paios_tasks_v1: {
          '101': 1000, // Client expects revision 1000
        },
      },
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'complete task 101');
    tx.id = 'tx-conflict-1';
    tx.expectedRevisions = {
      paios_tasks_v1: {
        '101': 1000,
      },
    };

    // Simulate remote device updating revision to 2000 in sync metadata
    const meta = {
      keys: {
        paios_tasks_v1: {
          records: {
            '101': { updatedAt: 2000 },
          },
        },
      },
    };
    PAIOSStorage.setItem('paios_sync_metadata_v2', meta);

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(report.success).toBe(false);
    expect(report.transaction.status).toBe('FAILED');
    expect(report.error).toContain('Concurrency conflict');
  });
});
