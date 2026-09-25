import {
  ActionType,
  ProposedAction,
  TransactionRecord,
  ScopedSnapshot,
  AffectedRecordRef,
} from './actionTypes';
import { validateProposedAction, validateTransactionRecord } from './actionSchemas';
import { ActionRiskPolicy } from './ActionRiskPolicy';
import { ActionExecutor } from './ActionExecutor';
import { ActionStorage } from './actionStorage';
import { getSyncDeviceId, getSyncMetadata, recordLocalSyncMutation } from '../../utils/recordSync';
import { OfflineSyncManager } from '../sync/OfflineSyncManager';

export interface TransactionExecutionReport {
  success: boolean;
  transaction: TransactionRecord;
  executedActions: ProposedAction[];
  failedAction?: ProposedAction;
  error?: string;
  rolledBack: boolean;
  message: string;
}

export class ActionTransactionManager {
  private static executingTransactionIds = new Set<string>();

  /**
   * Builds a transaction proposal containing one or more actions
   */
  static buildTransaction(
    actions: ProposedAction[],
    originalCommand: string
  ): TransactionRecord {
    const riskEval = ActionRiskPolicy.evaluateTransactionRisk(actions);
    const txId = actions[0]?.transactionId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const deviceId = getSyncDeviceId();
    const metadata = getSyncMetadata();

    const expectedRevisions: Record<string, Record<string, number>> = {};
    const affectedRecords: AffectedRecordRef[] = [];

    // Capture baseline revisions for affected keys
    for (const action of actions) {
      action.transactionId = txId;
      for (const recId of action.affectedRecordIds) {
        // Collect affected records
        const storeKey = this.getStorageKeyForActionType(action.type);
        if (storeKey) {
          affectedRecords.push({ storageKey: storeKey, recordId: recId });
          if (!expectedRevisions[storeKey]) expectedRevisions[storeKey] = {};
          const currentRev = metadata.keys[storeKey]?.records?.[recId]?.updatedAt || metadata.keys[storeKey]?.updatedAt || 0;
          expectedRevisions[storeKey][recId] = currentRev;
        }
      }
    }

    const isWindow = typeof window !== 'undefined';
    const platform: 'windows' | 'android' | 'web' =
      isWindow && (window as any).electronAPI
        ? 'windows'
        : isWindow && typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
        ? 'android'
        : 'web';

    const tx: TransactionRecord = {
      id: txId,
      originalCommand,
      actions,
      risk: riskEval.risk,
      status: riskEval.requiresConfirmation ? 'AWAITING_CONFIRMATION' : 'PROPOSED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: platform,
      sourceDeviceId: deviceId,
      affectedRecords,
      expectedRevisions,
      beforeSnapshot: [],
      syncStatus: 'LOCAL',
      undoStatus: 'AVAILABLE',
    };

    return tx;
  }

  /**
   * Executes a transaction atomically with full rollback guarantees
   */
  static async executeTransaction(transaction: TransactionRecord): Promise<TransactionExecutionReport> {
    const txId = transaction.id;

    // Idempotency: Prevent running identical transaction twice concurrently or re-executing committed
    if (this.executingTransactionIds.has(txId)) {
      return {
        success: false,
        transaction,
        executedActions: [],
        rolledBack: false,
        error: `Transaction ${txId} is already executing.`,
        message: 'Transaction already in progress.',
      };
    }

    const existingTx = ActionStorage.getTransaction(txId);
    if (existingTx && (existingTx.status === 'COMMITTED' || existingTx.status === 'SYNCED')) {
      return {
        success: true,
        transaction: existingTx,
        executedActions: existingTx.actions,
        rolledBack: false,
        message: 'Transaction was already committed.',
      };
    }

    this.executingTransactionIds.add(txId);

    try {
      // Step 1: Validate transaction record envelope
      const valReport = validateTransactionRecord(transaction);
      if (!valReport.isValid || !valReport.sanitized) {
        transaction.status = 'FAILED';
        transaction.failureReason = valReport.errors.join('; ');
        ActionStorage.saveTransaction(transaction);
        return {
          success: false,
          transaction,
          executedActions: [],
          rolledBack: false,
          error: transaction.failureReason,
          message: 'Transaction failed validation and was rejected.',
        };
      }

      transaction = valReport.sanitized;
      transaction.status = 'VALIDATING';
      ActionStorage.saveTransaction(transaction);

      // Step 2: Concurrency & Revision Safety check
      const currentMeta = getSyncMetadata();
      for (const [key, records] of Object.entries(transaction.expectedRevisions)) {
        for (const [recId, expRev] of Object.entries(records)) {
          const currentRev = currentMeta.keys[key]?.records?.[recId]?.updatedAt || currentMeta.keys[key]?.updatedAt || 0;
          if (expRev > 0 && currentRev > expRev) {
            transaction.status = 'FAILED';
            transaction.failureReason = `Concurrency conflict: Record ${recId} in ${key} was updated on another device.`;
            ActionStorage.saveTransaction(transaction);
            return {
              success: false,
              transaction,
              executedActions: [],
              rolledBack: false,
              error: transaction.failureReason,
              message: 'Proposal expired because data was modified concurrently.',
            };
          }
        }
      }

      // Step 3: Capture scoped before-state snapshot of all affected records
      const beforeSnapshots: ScopedSnapshot[] = [];
      for (const ref of transaction.affectedRecords) {
        const snap = ActionExecutor.captureRecordSnapshot(ref.storageKey, ref.recordId);
        beforeSnapshots.push(snap);
      }
      transaction.beforeSnapshot = beforeSnapshots;
      transaction.status = 'COMMITTING';
      ActionStorage.saveTransaction(transaction);

      // Step 4: Execute actions sequentially in deterministic order
      const executedActions: ProposedAction[] = [];
      const createdRecordSnapshots: ScopedSnapshot[] = [];
      const updatedAffectedRecords: AffectedRecordRef[] = [...transaction.affectedRecords];

      for (let i = 0; i < transaction.actions.length; i++) {
        const action = transaction.actions[i];
        const execRes = await ActionExecutor.executeAction(action);

        if (!execRes.success) {
          // Failure on action -> Trigger Atomic Rollback!
          console.error(`[ActionTransactionManager] Action #${i} (${action.type}) failed: ${execRes.error}. Rolling back...`);

          // Restore beforeSnapshots
          for (const snap of beforeSnapshots) {
            ActionExecutor.restoreRecordSnapshot(snap);
          }

          // Remove any records newly created before the failure
          for (const createdSnap of createdRecordSnapshots) {
            ActionExecutor.restoreRecordSnapshot(createdSnap);
          }

          transaction.status = 'ROLLED_BACK';
          transaction.failureReason = `Action "${action.title}" failed: ${execRes.error || 'Execution error'}`;
          ActionStorage.saveTransaction(transaction);

          return {
            success: false,
            transaction,
            executedActions,
            failedAction: action,
            rolledBack: true,
            error: transaction.failureReason,
            message: `Execution failed on "${action.title}". All changes were rolled back.`,
          };
        }

        // Track created record IDs for rollback tracking
        for (const createdId of execRes.createdRecordIds) {
          const storeKey = this.getStorageKeyForActionType(action.type);
          if (storeKey) {
            createdRecordSnapshots.push({ storageKey: storeKey, recordId: createdId, data: null, exists: false });
            updatedAffectedRecords.push({ storageKey: storeKey, recordId: createdId });
          }
        }

        executedActions.push(action);
      }

      // Step 5: Post-execution State Verification
      transaction.affectedRecords = updatedAffectedRecords;
      transaction.committedAt = Date.now();
      transaction.status = 'COMMITTED';
      transaction.afterSnapshotSummary = `${executedActions.length} action(s) successfully committed`;
      ActionStorage.saveTransaction(transaction);

      // Step 6: Trigger Record-Level Sync
      try {
        const uniqueKeys = Array.from(new Set(transaction.affectedRecords.map((r) => r.storageKey)));
        for (const key of uniqueKeys) {
          const raw = localStorage.getItem(key);
          const currentVal = raw ? JSON.parse(raw) : null;
          recordLocalSyncMutation(key, null, currentVal);
          OfflineSyncManager.enqueueMutation(key, currentVal, 'SAVE');
        }
        transaction.syncStatus = 'SYNC_PENDING';
        ActionStorage.saveTransaction(transaction);
      } catch (syncErr) {
        console.warn('[ActionTransactionManager] Local sync queuing error:', syncErr);
      }

      // Step 7: Emit event for UI synchronization
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('paios_state_change', { detail: { transactionId: txId } }));
      }

      return {
        success: true,
        transaction,
        executedActions,
        rolledBack: false,
        message: 'All proposed actions executed successfully.',
      };
    } finally {
      this.executingTransactionIds.delete(txId);
    }
  }

  private static getStorageKeyForActionType(type: ActionType): string {
    switch (type) {
      case 'CREATE_TASK':
      case 'UPDATE_TASK':
      case 'COMPLETE_TASK':
      case 'RESCHEDULE_TASK':
        return 'paios_tasks_v1';
      case 'CREATE_TIMETABLE_BLOCK':
      case 'REPLAN_DAY':
        return 'paios_timetable_v1';
      case 'START_FOCUS_SESSION':
      case 'PAUSE_FOCUS_SESSION':
      case 'RESUME_FOCUS_SESSION':
      case 'FINISH_FOCUS_SESSION':
        return 'paios_activities_v1';
      case 'CREATE_QUICK_CAPTURE':
        return 'paios_captures_v1';
      case 'CREATE_JOURNAL_ENTRY':
        return 'paios_journal_v1';
      case 'RECORD_EXPENSE':
      case 'RECORD_INCOME':
        return 'paios_expenses_v1';
      case 'RECORD_MEDICATION_EVENT':
        return 'paios_dose_events_v1';
      case 'RECORD_SYMPTOM':
      case 'RECORD_VITAL':
        return 'paios_vitals_v1';
      default:
        return '';
    }
  }
}
