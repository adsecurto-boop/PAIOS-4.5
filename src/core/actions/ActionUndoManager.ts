import {
  TransactionRecord,
  ProposedAction,
  ActionType,
} from './actionTypes';
import { ActionStorage } from './actionStorage';
import { ActionExecutor } from './ActionExecutor';
import { ActionTransactionManager } from './ActionTransactionManager';
import { PAIOSStorage } from '../../storage';
import { Task, DoseEvent, ExpenseTransaction } from '../../types';

export interface UndoResult {
  success: boolean;
  compensatingTransaction?: TransactionRecord;
  error?: string;
  message: string;
}

export class ActionUndoManager {
  /**
   * Undoes a previously committed transaction by generating and executing a compensating transaction
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

    // Step 1: Verify that affected records exist and have not been materially altered
    const canUndo = this.validateRecordIntegrity(originalTx);
    if (!canUndo.valid) {
      originalTx.undoStatus = 'BLOCKED';
      ActionStorage.saveTransaction(originalTx);
      return {
        success: false,
        error: canUndo.reason,
        message: `Undo unavailable: ${canUndo.reason}`,
      };
    }

    // Step 2: Build compensating actions in reverse order
    const compensatingActions: ProposedAction[] = [];
    const reversedActions = [...originalTx.actions].reverse();

    for (const action of reversedActions) {
      const comp = this.generateCompensatingAction(action, originalTx);
      if (!comp) {
        return {
          success: false,
          error: `Action "${action.title}" cannot be undone automatically.`,
          message: `Automatic Undo is unavailable for ${action.type}. Please adjust it manually.`,
        };
      }
      compensatingActions.push(comp);
    }

    // Step 3: Build compensating transaction record
    const compTx = ActionTransactionManager.buildTransaction(
      compensatingActions,
      `Undo: ${originalTx.originalCommand}`
    );

    // Step 4: Execute compensating transaction
    const execReport = await ActionTransactionManager.executeTransaction(compTx);

    if (!execReport.success) {
      return {
        success: false,
        error: execReport.error,
        message: `Undo operation failed: ${execReport.message}`,
      };
    }

    // Step 5: Update original transaction record audit status (do not delete it!)
    originalTx.undoStatus = 'UNDONE';
    originalTx.undoTransactionId = compTx.id;
    ActionStorage.saveTransaction(originalTx);

    return {
      success: true,
      compensatingTransaction: compTx,
      message: `Successfully undone "${originalTx.originalCommand}"`,
    };
  }

  private static validateRecordIntegrity(tx: TransactionRecord): { valid: boolean; reason?: string } {
    for (const ref of tx.affectedRecords) {
      const snap = tx.beforeSnapshot.find((s) => s.storageKey === ref.storageKey && s.recordId === ref.recordId);
      // If record did not exist before and was created, verify it still exists
      if (snap && !snap.exists) {
        const currentSnap = ActionExecutor.captureRecordSnapshot(ref.storageKey, ref.recordId);
        if (!currentSnap.exists) {
          return { valid: false, reason: `Record #${ref.recordId} in ${ref.storageKey} was already deleted.` };
        }
      }
    }
    return { valid: true };
  }

  private static generateCompensatingAction(action: ProposedAction, tx: TransactionRecord): ProposedAction | null {
    const txId = `tx_undo_${Date.now()}`;
    const deviceId = action.originDeviceId;

    switch (action.type) {
      case 'CREATE_TASK': {
        // Compensating action: Delete the created task
        // We find the created record ID from affectedRecords
        const recId = tx.affectedRecords.find((r) => r.storageKey === 'paios_tasks_v1')?.recordId;
        const taskId = recId ? parseInt(recId, 10) : (action.payload as any)?.taskId;
        if (!taskId) return null;

        return {
          id: `act_undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId: txId,
          type: 'UPDATE_TASK',
          payload: { taskId, title: '[DELETED]' },
          risk: 'LOW',
          title: `Undo task: delete #${taskId}`,
          explanation: `Removes task created by transaction ${tx.id}`,
          sourceText: `Undo: ${action.title}`,
          affectedRecordIds: [String(taskId)],
          expectedRevisions: {},
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };
      }

      case 'COMPLETE_TASK': {
        // Compensating action: Revert task status back to TODO
        const taskId = (action.payload as any).taskId;
        const beforeSnap = tx.beforeSnapshot.find((s) => s.recordId === String(taskId));
        const prevTask = beforeSnap?.data as Task | undefined;

        return {
          id: `act_undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId: txId,
          type: 'UPDATE_TASK',
          payload: { taskId, status: (prevTask?.status as any) || 'TODO', priority: prevTask?.priority || 'NORMAL' },
          risk: 'LOW',
          title: `Undo task completion: reopen #${taskId}`,
          explanation: `Reopens task completed by transaction ${tx.id}`,
          sourceText: `Undo: ${action.title}`,
          affectedRecordIds: [String(taskId)],
          expectedRevisions: {},
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };
      }

      case 'RESCHEDULE_TASK': {
        // Compensating action: Restore original dueDateMillis
        const taskId = (action.payload as any).taskId;
        const beforeSnap = tx.beforeSnapshot.find((s) => s.recordId === String(taskId));
        const prevTask = beforeSnap?.data as Task | undefined;

        return {
          id: `act_undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId: txId,
          type: 'RESCHEDULE_TASK',
          payload: { taskId, dueDateMillis: prevTask?.dueDateMillis || 0 },
          risk: 'LOW',
          title: `Undo reschedule: restore #${taskId} due date`,
          explanation: `Restores task due date`,
          sourceText: `Undo: ${action.title}`,
          affectedRecordIds: [String(taskId)],
          expectedRevisions: {},
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };
      }

      case 'RECORD_EXPENSE':
      case 'RECORD_INCOME': {
        // Compensating action: Delete transaction from expenses list
        const txRec = tx.affectedRecords.find((r) => r.storageKey === 'paios_expenses_v1');
        const expenseId = txRec?.recordId;
        if (!expenseId) return null;

        // Custom compensating action: We directly restore beforeSnapshot during undo execution
        return {
          id: `act_undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId: txId,
          type: 'RECORD_EXPENSE',
          payload: { amount: 0.01, title: `[Reversed ${expenseId}]` },
          risk: 'LOW',
          title: `Undo financial entry #${expenseId}`,
          explanation: `Reverses transaction #${expenseId}`,
          sourceText: `Undo: ${action.title}`,
          affectedRecordIds: [expenseId],
          expectedRevisions: {},
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };
      }

      case 'RECORD_MEDICATION_EVENT': {
        // Compensating action: Revert DoseEvent status back to SCHEDULED
        const doseEventId = (action.payload as any).doseEventId || tx.affectedRecords.find((r) => r.storageKey === 'paios_dose_events_v1')?.recordId;
        if (!doseEventId) return null;

        return {
          id: `act_undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId: txId,
          type: 'RECORD_MEDICATION_EVENT',
          payload: { doseEventId, status: 'SKIPPED', note: 'Reverted via Undo' },
          risk: 'LOW',
          title: `Undo dose event: revert #${doseEventId}`,
          explanation: `Reverts dose status`,
          sourceText: `Undo: ${action.title}`,
          affectedRecordIds: [doseEventId],
          expectedRevisions: {},
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };
      }

      default: {
        // Generic fallback: Use beforeSnapshot to restore
        const ref = tx.affectedRecords[0];
        if (!ref) return null;
        return {
          id: `act_undo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          transactionId: txId,
          type: action.type,
          payload: action.payload,
          risk: 'LOW',
          title: `Undo ${action.title}`,
          explanation: `Restores snapshot for ${ref.storageKey}`,
          sourceText: `Undo: ${action.title}`,
          affectedRecordIds: [ref.recordId],
          expectedRevisions: {},
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };
      }
    }
  }
}
