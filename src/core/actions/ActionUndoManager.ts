import {
  TransactionRecord,
  ProposedAction,
  ScopedSnapshot,
  generateSecureUUID,
} from './actionTypes';
import { ActionStorage } from './actionStorage';
import { StorageMutationAdapters } from './StorageMutationAdapters';
import { PAIOSStorage } from '../../storage';
import { Task, ExpenseTransaction } from '../../types';

export interface UndoResult {
  success: boolean;
  compensatingTransaction?: TransactionRecord;
  error?: string;
  message: string;
}

export class ActionUndoManager {
  /**
   * Undoes a previously committed transaction using WAL discipline:
   * 1. Journal JOURNALED compensating tx BEFORE any mutation.
   * 2. Apply exact inverse via StorageMutationAdapters.
   * 3. Roll back partial undo on failure (original stays COMMITTED per Q3 decision).
   * 4. Verify final state deep-equals original before-snapshots.
   * 5. Mark COMMITTED only after verification passes.
   */
  static async undoTransaction(transactionId: string): Promise<UndoResult> {
    const originalTx = ActionStorage.getTransaction(transactionId);
    if (!originalTx) {
      return { success: false, error: 'Transaction not found in audit ledger', message: 'Transaction record not found.' };
    }

    if (originalTx.status !== 'COMMITTED' && originalTx.status !== 'SYNCED' && originalTx.status !== 'SYNC_PENDING') {
      return {
        success: false,
        error: `Cannot undo transaction with status "${originalTx.status}"`,
        message: 'Only successfully committed transactions can be undone.',
      };
    }

    if (originalTx.undoStatus === 'UNDONE') {
      return { success: false, error: 'Transaction has already been undone', message: 'This transaction was already undone.' };
    }

    if (originalTx.undoStatus === 'BLOCKED') {
      return { success: false, error: 'Transaction undo is blocked', message: 'Undo operation is blocked for this transaction.' };
    }

    // Unsupported action types (no-op actions with no mutations)
    const unsupportedUndoTypes = ['NAVIGATE', 'SEARCH'];
    if (originalTx.actions.some((a) => unsupportedUndoTypes.includes(a.type))) {
      return { success: false, error: 'Undo not available for this action type', message: 'Undo unavailable.' };
    }

    // Step 1: Detect post-commit user modifications or record deletion
    const integrity = this.validateRecordIntegrity(originalTx);
    if (!integrity.valid) {
      originalTx.undoStatus = 'BLOCKED';
      ActionStorage.saveTransaction(originalTx);
      return {
        success: false,
        error: integrity.reason,
        message: `Undo operation blocked: ${integrity.reason}`,
      };
    }

    const compTxId = `tx_undo_${generateSecureUUID()}`;

    // Step 2: Capture current state (before-snapshots for the undo operation itself)
    const beforeSnapshotsForUndo: ScopedSnapshot[] = [];
    for (const ref of originalTx.affectedRecords) {
      const adapter = StorageMutationAdapters.getAdapter(ref.storageKey);
      beforeSnapshotsForUndo.push(adapter.captureSnapshot(ref.recordId));
    }

    // Step 3: Build compensating transaction and JOURNAL it BEFORE any mutation (WAL)
    const compTx: TransactionRecord = {
      id: compTxId,
      originalCommand: `Undo: ${originalTx.originalCommand}`,
      actions: [],
      risk: 'LOW',
      status: 'JOURNALED',
      phase: 'JOURNALED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: originalTx.sourcePlatform,
      sourceDeviceId: originalTx.sourceDeviceId,
      affectedRecords: [...originalTx.affectedRecords],
      expectedRevisions: {},
      beforeSnapshot: beforeSnapshotsForUndo,
      syncStatus: 'LOCAL',
      undoStatus: 'NOT_APPLICABLE',
    };

    try {
      ActionStorage.saveTransaction(compTx);
    } catch (walError: any) {
      return { success: false, error: walError.message, message: 'Undo WAL journal failed.' };
    }

    // Step 4: Transition to COMMITTING phase
    compTx.status = 'COMMITTING';
    compTx.phase = 'COMMITTING';
    compTx.stepMarkers = [];
    ActionStorage.saveTransaction(compTx);

    const appliedSnapshots: ScopedSnapshot[] = [];

    // Step 5: Apply inverse mutations in reverse action order
    try {
      for (let i = originalTx.actions.length - 1; i >= 0; i--) {
        const action = originalTx.actions[i];
        const snapshotsForAction = this.getSnapshotsForAction(action, originalTx);

        for (const snap of snapshotsForAction) {
          const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
          const rep = adapter.restoreSnapshot(snap);
          if (!rep.success) {
            throw new Error(`Failed to restore ${snap.storageKey}:${snap.recordId}: ${rep.error}`);
          }
          appliedSnapshots.push(snap);
        }

        if (!compTx.stepMarkers) compTx.stepMarkers = [];
        compTx.stepMarkers.push({
          actionIndex: i,
          actionId: action.id,
          completedAt: Date.now(),
        });
        ActionStorage.saveTransaction(compTx);
      }
    } catch (err: any) {
      // Undo partially failed — restore the state captured immediately before Undo.
      let undoRollbackOk = true;
      const appliedKeys = new Set(appliedSnapshots.map((s) => `${s.storageKey}\u0000${s.recordId}`));
      const rollbackSnapshots = beforeSnapshotsForUndo.filter((s) =>
        appliedKeys.has(`${s.storageKey}\u0000${s.recordId}`)
      );
      for (const snap of [...rollbackSnapshots].reverse()) {
        try {
          const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
          const restored = adapter.restoreSnapshot(snap);
          if (!restored.success) undoRollbackOk = false;
        } catch {
          undoRollbackOk = false;
        }
      }

      if (undoRollbackOk) {
        for (const snap of rollbackSnapshots) {
          const current = StorageMutationAdapters.getAdapter(snap.storageKey).captureSnapshot(snap.recordId);
          if (
            current.exists !== snap.exists ||
            JSON.stringify(current.data) !== JSON.stringify(snap.data) ||
            JSON.stringify(current.containerData) !== JSON.stringify(snap.containerData)
          ) {
            undoRollbackOk = false;
            break;
          }
        }
      }

      compTx.status = undoRollbackOk ? 'ROLLED_BACK' : 'RECOVERY_REQUIRED';
      compTx.phase = compTx.status as any;
      compTx.failureReason = err.message;
      ActionStorage.saveTransaction(compTx);

      // Original stays COMMITTED (Q3 decision: allows retry)
      return {
        success: false,
        compensatingTransaction: compTx,
        error: err.message,
        message: `Undo failed: ${err.message}`,
      };
    }

    // Step 6: Verify final state deep-equals original before-snapshots
    let verifyOk = true;
    const failedVerifyStores: string[] = [];
    for (const snap of originalTx.beforeSnapshot) {
      const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
      const cur = adapter.captureSnapshot(snap.recordId);
      if (cur.exists !== snap.exists) {
        verifyOk = false;
        failedVerifyStores.push(snap.storageKey);
        continue;
      }
      if (snap.exists && JSON.stringify(cur.data) !== JSON.stringify(snap.data)) {
        verifyOk = false;
        failedVerifyStores.push(snap.storageKey);
      }
      if (snap.containerData !== undefined &&
          JSON.stringify(cur.containerData) !== JSON.stringify(snap.containerData)) {
        verifyOk = false;
        failedVerifyStores.push(snap.storageKey);
      }
    }

    if (!verifyOk) {
      compTx.status = 'RECOVERY_REQUIRED';
      compTx.phase = 'RECOVERY_REQUIRED';
      compTx.unresolvedDetails = { stores: Array.from(new Set(failedVerifyStores)), reason: 'Undo verification failed.' };
      ActionStorage.saveTransaction(compTx);
      return {
        success: false,
        compensatingTransaction: compTx,
        error: 'Undo verification failed',
        message: 'Undo committed but verification failed — manual recovery required.',
      };
    }

    // Step 7: Commit the undo
    compTx.status = 'COMMITTED';
    compTx.phase = 'COMMITTED';
    compTx.committedAt = Date.now();
    ActionStorage.saveTransaction(compTx);

    originalTx.undoStatus = 'UNDONE';
    originalTx.undoTransactionId = compTxId;
    ActionStorage.saveTransaction(originalTx);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('paios_state_change', { detail: { transactionId: compTxId } }));
    }

    return { success: true, compensatingTransaction: compTx, message: `Successfully undone "${originalTx.originalCommand}"` };
  }

  /**
   * Validates that records affected by the transaction have not been altered or deleted post-commit.
   * Matches strictly by record ID — never by title or content.
   */
  private static validateRecordIntegrity(tx: TransactionRecord): { valid: boolean; reason?: string } {
    if (tx.afterSnapshot?.length) {
      for (const expected of tx.afterSnapshot) {
        const current = StorageMutationAdapters.getAdapter(expected.storageKey).captureSnapshot(expected.recordId);
        if (
          current.exists !== expected.exists ||
          JSON.stringify(current.data) !== JSON.stringify(expected.data) ||
          JSON.stringify(current.containerData) !== JSON.stringify(expected.containerData)
        ) {
          return {
            valid: false,
            reason: `Record ${expected.storageKey}:${expected.recordId} changed after the action committed.`,
          };
        }
      }
      return { valid: true };
    }

    for (const action of tx.actions) {
      if (action.type === 'CREATE_TASK') {
        const tasks = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []) || [];
        // Match by ID only — never by title
        const createdId = tx.affectedRecords.find((r) => r.storageKey === 'paios_tasks_v1')?.recordId;
        if (!createdId) {
          return { valid: false, reason: 'Created task record ID not found in transaction.' };
        }
        const currentTask = tasks.find((t) => String(t.id) === String(createdId));
        if (!currentTask) {
          return { valid: false, reason: 'Created task was already deleted.' };
        }
        if (currentTask.revision && currentTask.revision > 1) {
          return { valid: false, reason: 'Record was modified since execution (post-commit modification).' };
        }
      }

      if (action.type === 'UPDATE_TASK' || action.type === 'COMPLETE_TASK' || action.type === 'RESCHEDULE_TASK') {
        const taskId = (action.payload as any).taskId;
        const tasks = PAIOSStorage.getItem<Task[]>('paios_tasks_v1', []) || [];
        const currentTask = tasks.find((t) => String(t.id) === String(taskId));
        if (!currentTask) {
          return { valid: false, reason: `Task #${taskId} was deleted.` };
        }
      }

      if (action.type === 'RECORD_EXPENSE') {
        const expenses = PAIOSStorage.getItem<ExpenseTransaction[]>('paios_expenses_v1', []) || [];
        const expId = tx.affectedRecords.find((r) => r.storageKey === 'paios_expenses_v1')?.recordId;
        if (expId && !expenses.some((e) => String(e.id) === String(expId))) {
          return { valid: false, reason: `Expense #${expId} was already removed.` };
        }
      }

      if (action.type === 'RECORD_MEDICATION_EVENT') {
        const doseEventId = (action.payload as any).doseEventId;
        const doseMap = PAIOSStorage.getItem<Record<string, any[]>>('paios_dose_events_v1', {}) || {};
        const allDoses = Object.values(doseMap).flat();
        if (doseEventId && !allDoses.some((d) => String(d.id) === String(doseEventId))) {
          return { valid: false, reason: `Dose event #${doseEventId} was not found.` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Returns the exact before-snapshots to restore for a given action.
   * Uses only ID-based matching from the transaction's beforeSnapshot and affectedRecords.
   * Never uses title-matching or forced status values.
   */
  private static getSnapshotsForAction(action: ProposedAction, tx: TransactionRecord): ScopedSnapshot[] {
    switch (action.type) {
      case 'CREATE_TASK': {
        // Delete by pre-allocated ID only — never by title
        const ref = tx.affectedRecords.find((r) => r.storageKey === 'paios_tasks_v1');
        if (!ref) return [];
        const snap = tx.beforeSnapshot.find(
          (s) => s.storageKey === 'paios_tasks_v1' && s.recordId === ref.recordId
        );
        // Before CREATE the task didn't exist — restore to non-existence
        const result = snap ? [snap] : [{ storageKey: 'paios_tasks_v1', recordId: ref.recordId, data: null, exists: false } as ScopedSnapshot];
        const timeline = tx.beforeSnapshot.find((s) => s.storageKey === 'paios_timeline_v1');
        if (timeline) result.push(timeline);
        return result;
      }

      case 'COMPLETE_TASK':
      case 'UPDATE_TASK':
      case 'RESCHEDULE_TASK': {
        // Restore the FULL before-snapshot — never force-set status
        const taskId = String((action.payload as any).taskId);
        const snap = tx.beforeSnapshot.find(
          (s) => s.storageKey === 'paios_tasks_v1' && s.recordId === taskId
        );
        return snap ? [snap] : [];
      }

      case 'RECORD_MEDICATION_EVENT': {
        // Restore exact dose snapshot AND exact refill snapshot
        const doseRef = tx.affectedRecords.find((r) => r.storageKey === 'paios_dose_events_v1');
        const refillRef = tx.affectedRecords.find((r) => r.storageKey === 'paios_refills_v1');
        const snaps: ScopedSnapshot[] = [];
        if (doseRef) {
          const s = tx.beforeSnapshot.find(
            (s) => s.storageKey === 'paios_dose_events_v1' && s.recordId === doseRef.recordId
          );
          if (s) snaps.push(s);
        }
        if (refillRef) {
          const s = tx.beforeSnapshot.find(
            (s) => s.storageKey === 'paios_refills_v1' && s.recordId === refillRef.recordId
          );
          if (s) snaps.push(s);
        }
        const timeline = tx.beforeSnapshot.find((s) => s.storageKey === 'paios_timeline_v1');
        if (timeline) snaps.push(timeline);
        return snaps;
      }

      case 'RECORD_EXPENSE':
      case 'RECORD_INCOME': {
        // Restore ALL financial store snapshots
        return tx.beforeSnapshot.filter((s) =>
          ['paios_expenses_v1', 'paios_daily_surplus_v1', 'paios_budget_profile_v1'].includes(s.storageKey)
        );
      }

      case 'START_FOCUS_SESSION':
      case 'FINISH_FOCUS_SESSION': {
        // Restore BOTH active activity AND history store
        return tx.beforeSnapshot.filter((s) =>
          ['paios_active_activity_v1', 'paios_activities_v1', 'paios_tasks_v1', 'paios_timeline_v1'].includes(s.storageKey)
        );
      }

      case 'PAUSE_FOCUS_SESSION':
      case 'RESUME_FOCUS_SESSION': {
        return tx.beforeSnapshot.filter((s) => s.storageKey === 'paios_active_activity_v1');
      }

      case 'CREATE_TIMETABLE_BLOCK':
      case 'REPLAN_DAY': {
        return tx.beforeSnapshot.filter((s) => s.storageKey === 'paios_timetable_v1');
      }

      case 'CREATE_QUICK_CAPTURE':
      case 'CREATE_JOURNAL_ENTRY':
      case 'RECORD_SYMPTOM':
      case 'RECORD_VITAL': {
        // Restore the created record plus the timeline container side effect.
        return tx.beforeSnapshot.filter((s) =>
          s.storageKey === 'paios_timeline_v1' ||
          tx.affectedRecords.some((r) => r.storageKey === s.storageKey && r.recordId === s.recordId)
        );
      }

      default: {
        // Unsupported: no restoration (undo already blocked above for NAVIGATE/SEARCH)
        return [];
      }
    }
  }
}
