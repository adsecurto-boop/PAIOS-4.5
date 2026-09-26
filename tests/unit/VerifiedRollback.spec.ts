/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ProposedAction } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { ActionConfirmationManager } from '../../src/core/actions/ActionConfirmationManager';

describe('DEF-05: Verified Rollback & Unresolved Failure Handling', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
    vi.restoreAllMocks();
  });

  it('verifies state restoration and sets RECOVERY_REQUIRED if rollback fails', async () => {
    const action1: ProposedAction = {
      id: 'act-rb-1',
      transactionId: 'tx-unresolved-rb',
      type: 'CREATE_TASK',
      title: 'Rollback verification task',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Rollback verification task' },
      affectedRecordIds: [],
    };

    const action2: ProposedAction = {
      id: 'act-rb-2',
      transactionId: 'tx-unresolved-rb',
      type: 'COMPLETE_TASK',
      title: 'Task that triggers failure',
      risk: 'MEDIUM',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 9999999 }, // Valid schema, will fail execution
      affectedRecordIds: ['9999999'],
    };

    const tx = ActionTransactionManager.buildTransaction([action1, action2], 'test verified rollback');
    tx.id = 'tx-unresolved-rb';

    // Mock storage setItem during rollback to fail, simulating corrupt or locked storage
    let action1Executed = false;
    const originalSetItem = PAIOSStorage.setItem.bind(PAIOSStorage);
    const setItemSpy = vi.spyOn(PAIOSStorage, 'setItem').mockImplementation((key, val) => {
      if (key === 'paios_tasks_v1' && !action1Executed) {
        action1Executed = true;
        return originalSetItem(key, val);
      }
      if (key === 'paios_tasks_v1' && action1Executed) {
        // Fail the rollback restore
        throw new Error('Disk write locked during rollback');
      }
      return originalSetItem(key, val);
    });

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    // Rollback could NOT complete and verify
    expect(report.success).toBe(false);
    expect(report.rolledBack).toBe(false);
    expect(report.transaction.status).toBe('RECOVERY_REQUIRED');
    expect(report.transaction.unresolvedDetails).toBeDefined();
    expect(report.message).toMatch(/recovery required|manual recovery|rollback failed/i);

    setItemSpy.mockRestore();
  });

  it('marks rolledBack true ONLY when post-rollback state strictly matches before-snapshot', async () => {
    const action1: ProposedAction = {
      id: 'act-clean-1',
      transactionId: 'tx-clean-rb',
      type: 'CREATE_TASK',
      title: 'Clean Rollback Task',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Clean Rollback Task' },
      affectedRecordIds: [],
    };

    const action2: ProposedAction = {
      id: 'act-clean-2',
      transactionId: 'tx-clean-rb',
      type: 'COMPLETE_TASK',
      title: 'Missing task fail',
      risk: 'MEDIUM',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 8888888 },
      affectedRecordIds: ['8888888'],
    };

    const tx = ActionTransactionManager.buildTransaction([action1, action2], 'clean rollback');
    tx.id = 'tx-clean-rb';

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    expect(report.success).toBe(false);
    expect(report.rolledBack).toBe(true);
    expect(report.transaction.status).toBe('ROLLED_BACK');

    // Confirm that verified rollback left zero orphan tasks
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    expect(tasks?.length ?? 0).toBe(0);
  });
});
