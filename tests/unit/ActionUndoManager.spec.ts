/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionUndoManager } from '../../src/core/actions/ActionUndoManager';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ActionConfirmationManager } from '../../src/core/actions/ActionConfirmationManager';
import { ProposedAction } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';

describe('ActionUndoManager Unit Tests', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
    ActionConfirmationManager.reset();
  });

  it('successfully undoes a completed task and preserves audit records', async () => {
    // 1. Create a task in storage
    const task = PAIOSStorage.addTask('Complete quarterly audit', 'Work', true);
    expect(task.status).toBe('TODO');

    // 2. Commit a COMPLETE_TASK transaction
    const completeAction: ProposedAction = {
      id: 'act-comp-1',
      transactionId: 'tx-comp-1',
      type: 'COMPLETE_TASK',
      title: 'Complete quarterly audit',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: task.id },
      affectedRecordIds: [String(task.id)],
    };

    const tx = ActionTransactionManager.buildTransaction([completeAction], 'complete quarterly audit');
    tx.id = 'tx-comp-1';

    const proof = ActionConfirmationManager.generateProof(tx);
    const execReport = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(execReport.success).toBe(true);
    expect(execReport.transaction.status).toBe('COMMITTED');

    // Verify task is now COMPLETED
    const completedTasks = PAIOSStorage.getTasks();
    const completedTask = completedTasks.find((t) => t.id === task.id);
    expect(completedTask?.status).toBe('COMPLETED');

    // 3. Perform Undo
    const undoReport = await ActionUndoManager.undoTransaction('tx-comp-1');
    expect(undoReport.success).toBe(true);

    // 4. Verify original transaction was NOT destroyed
    const originalRecord = ActionStorage.getTransaction('tx-comp-1');
    expect(originalRecord).toBeDefined();
    expect(originalRecord?.undoStatus).toBe('UNDONE');
    expect(originalRecord?.undoTransactionId).toBeDefined();

    // 5. Verify task is no longer COMPLETED
    const reopenedTasks = PAIOSStorage.getTasks();
    const reopenedTask = reopenedTasks.find((t) => t.id === task.id);
    expect(reopenedTask?.status).toBe('TODO');
  });

  it('prevents duplicate undo on already undone transactions', async () => {
    const task = PAIOSStorage.addTask('File expense report', 'Finance');
    const completeAction: ProposedAction = {
      id: 'act-file-1',
      transactionId: 'tx-file-1',
      type: 'COMPLETE_TASK',
      title: 'File expense report',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { taskId: task.id },
      affectedRecordIds: [String(task.id)],
    };

    const tx = ActionTransactionManager.buildTransaction([completeAction], 'file expense report');
    tx.id = 'tx-file-1';
    const proof = ActionConfirmationManager.generateProof(tx);
    await ActionTransactionManager.executeTransaction(tx, proof);

    // First undo
    const firstUndo = await ActionUndoManager.undoTransaction('tx-file-1');
    expect(firstUndo.success).toBe(true);

    // Second undo attempt
    const secondUndo = await ActionUndoManager.undoTransaction('tx-file-1');
    expect(secondUndo.success).toBe(false);
    expect(secondUndo.error).toContain('already been undone');
  });

  it('rejects undo for non-existent transactions gracefully', async () => {
    const res = await ActionUndoManager.undoTransaction('tx-non-existent-999');
    expect(res.success).toBe(false);
    expect(res.error).toContain('not found in audit ledger');
  });
});
