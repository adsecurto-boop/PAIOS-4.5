/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ProposedAction } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { ActionConfirmationManager } from '../../src/core/actions/ActionConfirmationManager';
import { Task } from '../../src/types';
import { generateSecureUUID } from '../../src/core/actions/actionTypes';

describe('DEF-10: Action Concurrency, Exact Revision Matching & Secure UUIDs', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
  });

  it('generates collision-resistant secure UUIDs compliant with RFC4122', () => {
    const id1 = generateSecureUUID();
    const id2 = generateSecureUUID();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('rejects execution when current revision differs from expected revision (exact revision check)', async () => {
    // Initial task at revision 2
    const initialTask: Task = {
      id: 202,
      title: 'Design Spec',
      completed: false,
      status: 'TODO',
      createdAt: Date.now(),
      priority: 'HIGH',
      category: 'Work',
      revision: 2,
    };
    PAIOSStorage.setItem('paios_tasks_v1', [initialTask]);

    // Action was prepared when revision was expected to be 2
    const action: ProposedAction = {
      id: 'act-rev-1',
      transactionId: 'tx-rev-conflict',
      type: 'COMPLETE_TASK',
      title: 'Complete Design Spec',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 202 },
      affectedRecordIds: ['202'],
      expectedRevisions: { '202': 2 },
      originDeviceId: 'dev',
      sourceText: 'complete design spec',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'complete spec');
    tx.id = 'tx-rev-conflict';

    // Simulate concurrent tab or background sync updating the task revision to 3
    initialTask.revision = 3;
    initialTask.title = 'Design Spec v2';
    PAIOSStorage.setItem('paios_tasks_v1', [initialTask]);

    // Now execute: must fail due to exact revision mismatch
    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    expect(report.success).toBe(false);
    expect(report.message).toMatch(/revision mismatch|concurrency conflict|modified/i);
    expect(report.transaction.status).toBe('FAILED');

    // Confirm that task was not completed
    const currentTasks = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    expect(currentTasks[0].completed).toBe(false);
  });

  it('rejects execution if an affected record is deleted before transaction execution begins', async () => {
    // Initial task
    const initialTask: Task = {
      id: 303,
      title: 'Quick check',
      completed: false,
      status: 'TODO',
      createdAt: Date.now(),
      priority: 'LOW',
      category: 'General',
      revision: 1,
    };
    PAIOSStorage.setItem('paios_tasks_v1', [initialTask]);

    const action: ProposedAction = {
      id: 'act-deleted-1',
      transactionId: 'tx-deleted-conflict',
      type: 'COMPLETE_TASK',
      title: 'Complete quick check',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: 303 },
      affectedRecordIds: ['303'],
      expectedRevisions: { '303': 1 },
      originDeviceId: 'dev',
      sourceText: 'complete check',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'complete check');
    tx.id = 'tx-deleted-conflict';

    // Delete task concurrently
    PAIOSStorage.setItem('paios_tasks_v1', []);

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    expect(report.success).toBe(false);
    expect(report.message).toMatch(/not found|deleted|mismatch/i);
  });

  it('guarantees idempotency and rejects concurrent duplicate execution via Promise.all', async () => {
    const action: ProposedAction = {
      id: 'act-simul-1',
      transactionId: 'tx-simul-test',
      type: 'CREATE_TASK',
      title: 'Simultaneous task creation',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Simultaneous task creation', category: 'Work', priority: 'NORMAL' },
      affectedRecordIds: [],
      expectedRevisions: {},
      originDeviceId: 'dev',
      sourceText: 'create task',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'create task');
    tx.id = 'tx-simul-test';

    // Execute concurrently using Promise.all
    const [res1, res2] = await Promise.all([
      ActionTransactionManager.executeTransaction(tx),
      ActionTransactionManager.executeTransaction(tx),
    ]);

    // Exactly one should succeed, the other must be rejected for concurrency/in progress
    const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
    expect(successCount).toBe(1);

    const failedRes = res1.success ? res2 : res1;
    expect(failedRes.success).toBe(false);
    expect(failedRes.message).toMatch(/already in progress|already executing|already committed/i);

    // Verify only ONE task was created in storage
    const tasks = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    const matchingTasks = tasks.filter((t) => t.title === 'Simultaneous task creation');
    expect(matchingTasks).toHaveLength(1);
  });
});
