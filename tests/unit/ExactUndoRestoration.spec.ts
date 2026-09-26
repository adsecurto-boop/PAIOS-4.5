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
import { DoseEvent, RefillInventory, Task, ExpenseTransaction } from '../../src/types';

describe('DEF-06: Exact Inverse Restoration & Anti-Placeholder Undo', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    PAIOSStorage.setItem('paios_tasks_v1', []);
    ActionStorage.clearLedger(true);
    ActionConfirmationManager.reset();
  });

  it('genuinely deletes created task instead of renaming it to [DELETED]', async () => {
    const action: ProposedAction = {
      id: 'act-create-task',
      transactionId: 'tx-create-task',
      type: 'CREATE_TASK',
      title: 'Real Task',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Real Task', category: 'Work' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'create real task');
    tx.id = 'tx-create-task';

    const execReport = await ActionTransactionManager.executeTransaction(tx);
    expect(execReport.success).toBe(true);

    const tasksAfterCreate = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    expect(tasksAfterCreate).toHaveLength(1);
    expect(tasksAfterCreate[0].title).toBe('Real Task');

    // Perform Undo
    const undoReport = await ActionUndoManager.undoTransaction('tx-create-task');
    expect(undoReport.success).toBe(true);

    // Verify task is genuinely removed, NOT renamed to "[DELETED] Real Task"
    const tasksAfterUndo = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    expect(tasksAfterUndo).toHaveLength(0);
    expect(tasksAfterUndo.some((t) => t.title.includes('[DELETED]'))).toBe(false);
  });

  it('restores dose status to SCHEDULED, clears taken time, and replenishes refill inventory (+1)', async () => {
    const dose: DoseEvent = {
      id: 'dose-bp-1',
      medicationId: 'med-lisinopril',
      medicationName: 'Lisinopril',
      dosage: '10mg',
      scheduledDateString: '2026-09-25',
      scheduledTime: '09:00',
      status: 'SCHEDULED',
    };
    PAIOSStorage.setItem('paios_medications_v1', [
      { id: 'med-lisinopril', genericName: 'Lisinopril', dosageStrength: '10', dosageUnit: 'mg', status: 'active', scheduleTimes: ['09:00'] },
    ]);
    PAIOSStorage.setItem('paios_dose_events_v1', { '2026-09-25': [dose] });

    const refill: any = {
      id: 'refill-lisinopril',
      medicationId: 'med-lisinopril',
      medicationName: 'Lisinopril',
      quantityRemaining: 29,
      currentSupply: 29,
      unit: 'tablets',
      dailyBurnRate: 1,
      minimumThresholdDays: 5,
      refillsRemaining: 2,
    };
    PAIOSStorage.setItem('paios_refills_v1', [refill]);

    // Action takes the dose (which should decrement refill supply to 28)
    const action: ProposedAction = {
      id: 'act-take-dose',
      transactionId: 'tx-take-dose',
      type: 'RECORD_MEDICATION_EVENT',
      title: 'Take Lisinopril',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: {
        doseEventId: 'dose-bp-1',
        medicationId: 'med-lisinopril',
        medicationName: 'Lisinopril',
        status: 'TAKEN',
      },
      affectedRecordIds: ['dose-bp-1'],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'take dose');
    tx.id = 'tx-take-dose';

    const proof = ActionConfirmationManager.generateProof(tx);

    // Execute with bypass/proof
    const execReport = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(execReport.success).toBe(true);

    const takenDoses = PAIOSStorage.getDoseEvents();
    expect(takenDoses[0].status).toBe('TAKEN');

    // Undo the dose logging
    const undoReport = await ActionUndoManager.undoTransaction('tx-take-dose');
    expect(undoReport.success).toBe(true);

    // Verify dose is restored to SCHEDULED (NOT marked as SKIPPED)
    const restoredDoses = PAIOSStorage.getDoseEvents();
    expect(restoredDoses[0].status).toBe('SCHEDULED');
    expect(restoredDoses[0].actualTakenTimeMillis).toBeUndefined();

    // Verify refill inventory is replenished back to 29
    const refills = PAIOSStorage.getItem<RefillInventory[]>('paios_refills_v1', []);
    expect(refills[0].currentSupply).toBe(29);
  });

  it('genuinely removes expense and restores surplus instead of inserting a fake ₹0.01 transaction', async () => {
    // Initial surplus 1000, spend 0
    PAIOSStorage.setItem('paios_daily_surplus_v1', [{ dateString: '2026-09-25', allocatedBudget: 1000, actualSpent: 0, surplus: 1000 }]);
    PAIOSStorage.setItem('paios_expenses_v1', []);

    const action: ProposedAction = {
      id: 'act-real-exp',
      transactionId: 'tx-real-exp',
      type: 'RECORD_EXPENSE',
      title: 'Buy Groceries',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { amount: 350, title: 'Groceries', category: 'Food', dateString: '2026-09-25' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'spend 350');
    tx.id = 'tx-real-exp';

    const proof = ActionConfirmationManager.generateProof(tx);

    const execReport = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(execReport.success).toBe(true);

    const expensesAfter = PAIOSStorage.getItem<ExpenseTransaction[]>('paios_expenses_v1', []);
    expect(expensesAfter).toHaveLength(1);
    expect(expensesAfter[0].amount).toBe(350);

    // Undo expense
    const undoReport = await ActionUndoManager.undoTransaction('tx-real-exp');
    expect(undoReport.success).toBe(true);

    // Verify 0 expenses exist and no fake ₹0.01 placeholder exists
    const expensesAfterUndo = PAIOSStorage.getItem<ExpenseTransaction[]>('paios_expenses_v1', []);
    expect(expensesAfterUndo).toHaveLength(0);
    expect(expensesAfterUndo.some((e) => e.amount === 0.01)).toBe(false);

    // Verify surplus is restored to 1000 (actualSpent 0)
    const surplusAfterUndo = PAIOSStorage.getItem<any[]>('paios_daily_surplus_v1', []);
    expect(surplusAfterUndo[0].actualSpent).toBe(0);
    expect(surplusAfterUndo[0].surplus).toBe(1000);
  });

  it('blocks undo if a record has been modified by the user post-commit', async () => {
    const action: ProposedAction = {
      id: 'act-post-edit',
      transactionId: 'tx-post-edit',
      type: 'CREATE_TASK',
      title: 'Task to be edited',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Task to be edited' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'create task');
    tx.id = 'tx-post-edit';

    await ActionTransactionManager.executeTransaction(tx);

    // User subsequently edits the task
    const tasks = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    tasks[0].title = 'User edited this task';
    tasks[0].revision = (tasks[0].revision || 1) + 1;
    PAIOSStorage.setItem('paios_tasks_v1', tasks);

    // Attempt undo
    const undoReport = await ActionUndoManager.undoTransaction('tx-post-edit');
    expect(undoReport.success).toBe(false);
    expect(undoReport.message).toMatch(/modified since execution|post-commit modification|blocked/i);

    // Verify task is preserved and not clobbered
    const tasksFinal = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []);
    expect(tasksFinal[0].title).toBe('User edited this task');
  });
});
