/**
 * @vitest-environment jsdom
 */
/**
 * DEF-01-PREFLIGHT: Multi-Store Preflight Mutation Plan
 *
 * Every action must declare ALL potentially-mutated stores before WAL journaling.
 * The beforeSnapshot must contain entries for every store BEFORE any domain write occurs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ActionConfirmationManager } from '../../src/core/actions/ActionConfirmationManager';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { PAIOSStorage, getTodayDateString } from '../../src/storage';
import { ProposedAction } from '../../src/core/actions/actionTypes';

describe('DEF-01-PREFLIGHT: Multi-Store Preflight Mutation Planning', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
    ActionConfirmationManager.reset();
  });

  it('START_FOCUS_SESSION before-snapshot covers active_activity AND activities stores', async () => {
    const action: ProposedAction = {
      id: 'act-focus-1',
      transactionId: 'tx-focus-preflight',
      type: 'START_FOCUS_SESSION',
      title: 'Start Focus',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { name: 'Deep Work', category: 'Work' },
      affectedRecordIds: [],
      expectedRevisions: {},
      originDeviceId: 'test',
      sourceText: 'start focus session',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'start focus session');

    // Before executing: affectedRecords must include both stores
    const storeKeys = tx.affectedRecords.map((r) => r.storageKey);
    expect(storeKeys).toContain('paios_active_activity_v1');
    expect(storeKeys).toContain('paios_activities_v1');

    // After executing: beforeSnapshot must contain both stores
    const report = await ActionTransactionManager.executeTransaction(tx);
    expect(report.success).toBe(true);
    const snapshotKeys = report.transaction.beforeSnapshot.map((s) => s.storageKey);
    expect(snapshotKeys).toContain('paios_active_activity_v1');
    expect(snapshotKeys).toContain('paios_activities_v1');
  });

  it('RECORD_EXPENSE before-snapshot covers expenses, daily_surplus, AND budget_profile stores', async () => {
    const action: ProposedAction = {
      id: 'act-exp-preflight',
      transactionId: 'tx-exp-preflight',
      type: 'RECORD_EXPENSE',
      title: 'Coffee',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { amount: 150, title: 'Coffee', category: 'Food' },
      affectedRecordIds: [],
      expectedRevisions: {},
      originDeviceId: 'test',
      sourceText: 'record expense 150 coffee',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'record expense');
    const storeKeys = tx.affectedRecords.map((r) => r.storageKey);
    expect(storeKeys).toContain('paios_expenses_v1');
    expect(storeKeys).toContain('paios_daily_surplus_v1');
    expect(storeKeys).toContain('paios_budget_profile_v1');

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(report.success).toBe(true);
    const snapshotKeys = report.transaction.beforeSnapshot.map((s) => s.storageKey);
    expect(snapshotKeys).toContain('paios_expenses_v1');
    expect(snapshotKeys).toContain('paios_daily_surplus_v1');
    expect(snapshotKeys).toContain('paios_budget_profile_v1');
  });

  it('RECORD_MEDICATION_EVENT before-snapshot covers dose_events AND refills stores', async () => {
    // Seed a dose event
    const today = getTodayDateString();
    const doseMap: Record<string, any[]> = {
      [today]: [{
        id: 'dose-001',
        medicationId: 'med_1',
        medicationName: 'Metformin',
        scheduledTime: '08:00',
        scheduledDateString: today,
        status: 'SCHEDULED',
      }]
    };
    PAIOSStorage.setItem('paios_dose_events_v1', doseMap);
    PAIOSStorage.setItem('paios_refills_v1', [
      { id: 'refill_1', medicationId: 'med_1', quantityRemaining: 28, dailyBurnRate: 1 }
    ]);

    const action: ProposedAction = {
      id: 'act-med-preflight',
      transactionId: 'tx-med-preflight',
      type: 'RECORD_MEDICATION_EVENT',
      title: 'Take Metformin',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { doseEventId: 'dose-001', medicationId: 'med_1', status: 'TAKEN', scheduledDateString: today },
      affectedRecordIds: ['dose-001'],
      expectedRevisions: {},
      originDeviceId: 'test',
      sourceText: 'take metformin',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'take metformin');
    const storeKeys = tx.affectedRecords.map((r) => r.storageKey);
    expect(storeKeys).toContain('paios_dose_events_v1');
    expect(storeKeys).toContain('paios_refills_v1');

    const proof = ActionConfirmationManager.generateProof(tx);
    const report = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(report.success).toBe(true);
    const snapshotKeys = report.transaction.beforeSnapshot.map((s) => s.storageKey);
    expect(snapshotKeys).toContain('paios_dose_events_v1');
    expect(snapshotKeys).toContain('paios_refills_v1');
  });

  it('FINISH_FOCUS_SESSION with completedTaskId covers activities, active_activity, AND tasks stores', async () => {
    // Setup: start a session first
    const task = PAIOSStorage.addTask('Finish me', 'Work');
    const activity = PAIOSStorage.startActivity('Deep Work', 'Work');

    const action: ProposedAction = {
      id: 'act-finish-preflight',
      transactionId: 'tx-finish-preflight',
      type: 'FINISH_FOCUS_SESSION',
      title: 'Finish Focus',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { sessionId: activity.id, completedTaskId: task.id },
      affectedRecordIds: [String(activity.id)],
      expectedRevisions: {},
      originDeviceId: 'test',
      sourceText: 'finish focus',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'finish focus');
    const storeKeys = tx.affectedRecords.map((r) => r.storageKey);
    expect(storeKeys).toContain('paios_active_activity_v1');
    expect(storeKeys).toContain('paios_activities_v1');
    expect(storeKeys).toContain('paios_tasks_v1');
  });

  it('CREATE_TASK pre-allocates a deterministic ID in the plan before WAL', () => {
    const action: ProposedAction = {
      id: 'act-create-preflight',
      transactionId: 'tx-create-preflight',
      type: 'CREATE_TASK',
      title: 'My Task',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'My Task', category: 'Work' },
      affectedRecordIds: [],
      expectedRevisions: {},
      originDeviceId: 'test',
      sourceText: 'create task my task',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'create task');
    // After buildTransaction, the action should have a preAllocatedId set
    const act = tx.actions[0];
    expect(act.preAllocatedId).toBeDefined();
    expect(typeof act.preAllocatedId).toBe('string');
    expect(act.preAllocatedId!.length).toBeGreaterThan(0);

    // The affectedRecords must include paios_tasks_v1 with the pre-allocated ID
    const taskRef = tx.affectedRecords.find((r) => r.storageKey === 'paios_tasks_v1');
    expect(taskRef).toBeDefined();
    expect(taskRef!.recordId).toBe(act.preAllocatedId);
    expect(tx.affectedRecords.some((r) => r.storageKey === 'paios_timeline_v1' && r.recordId === '__container__')).toBe(true);
  });

  it('uses the pre-allocated ID for quick captures and snapshots the timeline side effect', async () => {
    const action: ProposedAction = {
      id: 'act-capture-preflight',
      transactionId: 'tx-capture-preflight',
      type: 'CREATE_QUICK_CAPTURE',
      title: 'Capture note',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { text: 'remember this', category: 'Personal' },
      affectedRecordIds: [],
      expectedRevisions: {},
      originDeviceId: 'test',
      sourceText: 'capture remember this',
      explanation: 'test',
    };

    const tx = ActionTransactionManager.buildTransaction([action], action.sourceText);
    const plannedId = tx.actions[0].preAllocatedId;
    expect(plannedId).toBeTruthy();
    expect(tx.affectedRecords).toContainEqual({ storageKey: 'paios_captures_v1', recordId: plannedId });
    expect(tx.affectedRecords).toContainEqual({ storageKey: 'paios_timeline_v1', recordId: '__container__' });

    const report = await ActionTransactionManager.executeTransaction(tx);
    expect(report.success).toBe(true);
    expect(PAIOSStorage.getAllCaptures().some((capture) => String(capture.id) === plannedId)).toBe(true);
    expect(report.transaction.afterSnapshot?.some(
      (snapshot) => snapshot.storageKey === 'paios_captures_v1' && snapshot.recordId === plannedId && snapshot.exists
    )).toBe(true);
  });
});
