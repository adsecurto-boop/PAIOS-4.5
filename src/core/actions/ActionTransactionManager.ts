import {
  ActionType,
  ProposedAction,
  TransactionRecord,
  ScopedSnapshot,
  AffectedRecordRef,
  ConfirmationProof,
  generateSecureUUID,
} from './actionTypes';
import { validateProposedAction, validateTransactionRecord } from './actionSchemas';
import { ActionRiskPolicy } from './ActionRiskPolicy';
import { ActionExecutor } from './ActionExecutor';
import { ActionStorage } from './actionStorage';
import { ActionConfirmationManager } from './ActionConfirmationManager';
import { StorageMutationAdapters } from './StorageMutationAdapters';
import { ActionMutationPlanner } from './ActionMutationPlanner';
import { getSyncDeviceId, getSyncMetadata } from '../../utils/recordSync';

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
   * Builds a transaction proposal containing one or more actions.
   *
   * Uses ActionMutationPlanner to enumerate ALL stores each action may mutate
   * BEFORE the WAL is written, ensuring complete before-snapshot coverage.
   * Pre-allocates deterministic IDs for create actions.
   */
  static buildTransaction(
    actions: ProposedAction[],
    originalCommand: string
  ): TransactionRecord {
    const riskEval = ActionRiskPolicy.evaluateTransactionRisk(actions);
    const txId = actions[0]?.transactionId || `tx_${generateSecureUUID()}`;
    const deviceId = getSyncDeviceId();
    const metadata = getSyncMetadata();

    const expectedRevisions: Record<string, Record<string, number>> = {};
    const affectedRecords: AffectedRecordRef[] = [];

    // Use ActionMutationPlanner to capture ALL stores per action
    for (const action of actions) {
      action.transactionId = txId;

      const plan = ActionMutationPlanner.plan(action);

      for (const ref of plan.refs) {
        // Deduplicate: don't add the same storageKey+recordId twice
        const alreadyPresent = affectedRecords.some(
          (r) => r.storageKey === ref.storageKey && r.recordId === ref.recordId
        );
        if (!alreadyPresent) {
          affectedRecords.push({ storageKey: ref.storageKey, recordId: ref.recordId });
        }

        if (!expectedRevisions[ref.storageKey]) expectedRevisions[ref.storageKey] = {};

        // Capture current revision for the record (used for concurrency detection)
        if (!ref.isCreate && expectedRevisions[ref.storageKey][ref.recordId] === undefined) {
          if (action.expectedRevisions && action.expectedRevisions[ref.recordId] !== undefined) {
            expectedRevisions[ref.storageKey][ref.recordId] = action.expectedRevisions[ref.recordId];
          } else {
            const adapter = StorageMutationAdapters.getAdapter(ref.storageKey);
            const snap = adapter ? adapter.captureSnapshot(ref.recordId) : undefined;
            const currentRev = (snap && snap.exists)
              ? (snap.revision !== undefined
                  ? snap.revision
                  : (metadata.keys[ref.storageKey]?.records?.[ref.recordId]?.updatedAt
                    || metadata.keys[ref.storageKey]?.updatedAt
                    || 0))
              : 0;
            expectedRevisions[ref.storageKey][ref.recordId] = currentRev;
          }
        }
        // For creates, revision starts at 0 (skip concurrency check in executeTransaction)
        if (ref.isCreate && expectedRevisions[ref.storageKey][ref.recordId] === undefined) {
          expectedRevisions[ref.storageKey][ref.recordId] = 0;
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
      phase: 'INITIALIZED',
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
   * Executes a transaction atomically with full rollback guarantees and confirmation proof verification.
   *
   * Item 2: Each complete action step (domain exec + ID capture + step-marker persist)
   *         is wrapped in a transactional error boundary. Any exception → ROLLING_BACK.
   * Item 3: Rollback verification is exact: exists-match + deep-equal data + containerData.
   * Item 6: execRes.affectedRecords merged as full AffectedRecordRef[] (with storageKey).
   * Item 7: Sync queuing removed — PAIOSStorage.setItem already enqueues via save().
   */
  static async executeTransaction(
    transaction: TransactionRecord,
    proof?: ConfirmationProof
  ): Promise<TransactionExecutionReport> {
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
      // Step 1: Central Independent Risk Recomputation & Confirmation Verification
      const riskEval = ActionRiskPolicy.evaluateTransactionRisk(transaction);
      transaction.risk = riskEval.risk;

      if (riskEval.risk === 'BLOCKED' || transaction.actions.some((a) => a.risk === 'BLOCKED')) {
        transaction.status = 'FAILED';
        transaction.phase = 'FAILED';
        transaction.failureReason = 'Security violation: Transaction contains blocked actions.';
        try { ActionStorage.saveTransaction(transaction); } catch {}
        return {
          success: false,
          transaction,
          executedActions: [],
          rolledBack: false,
          error: transaction.failureReason,
          message: 'Transaction is blocked by safety policy.',
        };
      }

      if (riskEval.risk !== 'LOW' || riskEval.requiresConfirmation || transaction.actions.some((a) => a.requiresConfirmation)) {
        const verifyResult = ActionConfirmationManager.verifyAndConsumeProof(transaction, proof);
        if (!verifyResult.valid) {
          transaction.status = 'FAILED';
          transaction.phase = 'FAILED';
          transaction.failureReason = `Confirmation error: ${verifyResult.reason}`;
          try { ActionStorage.saveTransaction(transaction); } catch {}
          return {
            success: false,
            transaction,
            executedActions: [],
            rolledBack: false,
            error: verifyResult.reason,
            message: `Requires confirmation proof: ${verifyResult.reason}`,
          };
        }
        transaction.confirmationProof = proof;
      }

      // Step 2: Validate transaction envelope
      const valReport = validateTransactionRecord(transaction);
      if (!valReport.isValid || !valReport.sanitized) {
        transaction.status = 'FAILED';
        transaction.phase = 'FAILED';
        transaction.failureReason = valReport.errors.join('; ');
        try { ActionStorage.saveTransaction(transaction); } catch {}
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

      // Step 3: Concurrency & Exact Revision Safety check
      const currentMeta = getSyncMetadata();
      for (const [key, records] of Object.entries(transaction.expectedRevisions)) {
        const adapter = StorageMutationAdapters.getAdapter(key);
        for (const [recId, expRev] of Object.entries(records)) {
          if (expRev > 0) {
            const snap = adapter.captureSnapshot(recId);
            if (!snap.exists) {
              transaction.status = 'FAILED';
              transaction.phase = 'FAILED';
              transaction.failureReason = `Concurrency conflict: Record ${recId} in ${key} was deleted or not found.`;
              try { ActionStorage.saveTransaction(transaction); } catch {}
              return {
                success: false,
                transaction,
                executedActions: [],
                rolledBack: false,
                error: transaction.failureReason,
                message: `Concurrency conflict: Record ${recId} not found or deleted.`,
              };
            }

            const currentRev = (snap.revision !== undefined)
              ? snap.revision
              : (currentMeta.keys[key]?.records?.[recId]?.updatedAt || currentMeta.keys[key]?.updatedAt || 0);
            if (currentRev !== expRev) {
              transaction.status = 'FAILED';
              transaction.phase = 'FAILED';
              transaction.failureReason = `Concurrency conflict: Record ${recId} in ${key} revision mismatch (expected ${expRev}, found ${currentRev}).`;
              try { ActionStorage.saveTransaction(transaction); } catch {}
              return {
                success: false,
                transaction,
                executedActions: [],
                rolledBack: false,
                error: transaction.failureReason,
                message: 'Proposal expired because data was modified concurrently (revision mismatch).',
              };
            }
          }
        }
      }

      // Step 4: Capture scoped before-state snapshot of ALL affected records (from planner refs)
      const beforeSnapshots: ScopedSnapshot[] = [];
      for (const ref of transaction.affectedRecords) {
        const snap = StorageMutationAdapters.getAdapter(ref.storageKey).captureSnapshot(ref.recordId);
        beforeSnapshots.push(snap);
      }
      transaction.beforeSnapshot = beforeSnapshots;

      // Step 5: Write-Ahead Logging (WAL) in JOURNALED phase BEFORE any domain write
      transaction.status = 'JOURNALED';
      transaction.phase = 'JOURNALED';
      try {
        ActionStorage.saveTransaction(transaction);
      } catch (walError: any) {
        transaction.status = 'FAILED';
        transaction.phase = 'FAILED';
        return {
          success: false,
          transaction,
          executedActions: [],
          rolledBack: false,
          error: walError?.message,
          message: `Failed to persist write-ahead journal: ${walError?.message || 'Journal failure'}`,
        };
      }

      // Step 6: Transition to COMMITTING phase
      transaction.status = 'COMMITTING';
      transaction.phase = 'COMMITTING';
      transaction.stepMarkers = [];
      ActionStorage.saveTransaction(transaction);

      // Step 7: Execute actions sequentially in deterministic order
      const executedActions: ProposedAction[] = [];
      const createdRecordSnapshots: ScopedSnapshot[] = [];
      const updatedAffectedRecords: AffectedRecordRef[] = [...transaction.affectedRecords];

      for (let i = 0; i < transaction.actions.length; i++) {
        const action = transaction.actions[i];

        // Item 2: Wrap the entire action step (execute + ID capture + step-marker)
        // in a transactional error boundary. Any post-write exception → ROLLING_BACK.
        try {
          const execRes = await ActionExecutor.executeAction(action);

          if (!execRes.success) {
            // Failure on action → Trigger Verified Rollback
            console.error(`[ActionTransactionManager] Action #${i} (${action.type}) failed: ${execRes.error}. Rolling back...`);
            return this.performRollback(transaction, i, action, beforeSnapshots, createdRecordSnapshots, executedActions, execRes.error || 'Execution failed');
          }

          // Item 6: Merge createdRecords as full AffectedRecordRef[] (with storageKey).
          // ActionExecutor returns both affectedRecords and createdRecordIds.
          for (const ref of execRes.affectedRecords) {
            const isNew = execRes.createdRecordIds.includes(ref.recordId);
            if (isNew) {
              // Record the before-snapshot for rollback (doesn't exist yet → exists: false)
              createdRecordSnapshots.push({ storageKey: ref.storageKey, recordId: ref.recordId, data: null, exists: false });
              if (!updatedAffectedRecords.some((r) => r.storageKey === ref.storageKey && r.recordId === ref.recordId)) {
                updatedAffectedRecords.push({ storageKey: ref.storageKey, recordId: ref.recordId });
              }
            }
          }

          executedActions.push(action);

          // Item 2: step-marker persist is inside the try — if it throws, ROLLING_BACK triggers
          ActionStorage.recordActionExecutionStep(transaction.id, {
            actionIndex: i,
            actionId: action.id,
            createdRecordIds: execRes.createdRecordIds,
            affectedRecordIds: execRes.affectedRecords.map((r) => r.recordId),
            completedAt: Date.now(),
          });

        } catch (stepError: any) {
          // Any exception in the action step (including step-marker failure) → ROLLING_BACK
          console.error(`[ActionTransactionManager] Action #${i} step error: ${stepError?.message}. Rolling back...`);
          return this.performRollback(transaction, i, action, beforeSnapshots, createdRecordSnapshots, executedActions, stepError?.message || 'Step error');
        }
      }

      // Step 8: Commit & Bookkeeping. Persistence failures after domain writes
      // are transactional failures too and must restore the verified before-state.
      try {
        transaction.affectedRecords = updatedAffectedRecords;
        transaction.afterSnapshot = transaction.affectedRecords.map((ref) =>
          StorageMutationAdapters.getAdapter(ref.storageKey).captureSnapshot(ref.recordId)
        );
        transaction.committedAt = Date.now();
        transaction.status = 'COMMITTED';
        transaction.phase = 'COMMITTED';
        transaction.afterSnapshotSummary = `${executedActions.length} action(s) successfully committed`;
        ActionStorage.saveTransaction(transaction);

        // PAIOSStorage already owns sync queueing. This field records intent only.
        transaction.syncStatus = 'SYNC_PENDING';
        ActionStorage.saveTransaction(transaction);
      } catch (commitError: any) {
        const lastAction = transaction.actions[transaction.actions.length - 1];
        return this.performRollback(
          transaction,
          Math.max(0, transaction.actions.length - 1),
          lastAction,
          beforeSnapshots,
          createdRecordSnapshots,
          executedActions,
          `Commit journal failure: ${commitError?.message || String(commitError)}`
        );
      }

      // Step 9: Emit event for UI synchronization
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

  /**
   * Item 3: Exact rollback verification.
   * Verifies that every before-snapshot matches current storage state:
   * - exists must match
   * - data must deep-equal
   * - containerData must deep-equal (where used)
   * - no newly created record remains
   */
  private static performRollback(
    transaction: TransactionRecord,
    failedActionIndex: number,
    failedAction: ProposedAction,
    beforeSnapshots: ScopedSnapshot[],
    createdRecordSnapshots: ScopedSnapshot[],
    executedActions: ProposedAction[],
    errorMessage: string
  ): TransactionExecutionReport {
    transaction.status = 'ROLLING_BACK';
    transaction.phase = 'ROLLING_BACK';
    try { ActionStorage.saveTransaction(transaction); } catch {}

    let rollbackVerified = true;
    const failedStores: string[] = [];

    // Restore created records first in reverse order (removes them)
    for (const createdSnap of [...createdRecordSnapshots].reverse()) {
      try {
        const adapter = StorageMutationAdapters.getAdapter(createdSnap.storageKey);
        const rep = adapter.restoreSnapshot(createdSnap);
        if (!rep.success) {
          rollbackVerified = false;
          failedStores.push(createdSnap.storageKey);
        }
      } catch {
        rollbackVerified = false;
        failedStores.push(createdSnap.storageKey);
      }
    }

    // Restore beforeSnapshots in reverse order
    for (const snap of [...beforeSnapshots].reverse()) {
      try {
        const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
        const rep = adapter.restoreSnapshot(snap);
        if (!rep.success) {
          rollbackVerified = false;
          failedStores.push(snap.storageKey);
        }
      } catch {
        rollbackVerified = false;
        failedStores.push(snap.storageKey);
      }
    }

    // Item 3: Exact post-rollback verification
    if (rollbackVerified) {
      // 1. Verify before-snapshots match current storage (exists + deep-equal data + containerData)
      for (const snap of beforeSnapshots) {
        try {
          const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
          const currentSnap = adapter.captureSnapshot(snap.recordId);

          if (currentSnap.exists !== snap.exists) {
            rollbackVerified = false;
            failedStores.push(snap.storageKey);
            break;
          }
          if (snap.exists && JSON.stringify(currentSnap.data) !== JSON.stringify(snap.data)) {
            rollbackVerified = false;
            failedStores.push(snap.storageKey);
            break;
          }
          if (snap.containerData !== undefined &&
              JSON.stringify(currentSnap.containerData) !== JSON.stringify(snap.containerData)) {
            rollbackVerified = false;
            failedStores.push(snap.storageKey);
            break;
          }
        } catch {
          rollbackVerified = false;
          failedStores.push(snap.storageKey);
          break;
        }
      }

      // 2. Verify no newly-created record remains in storage
      if (rollbackVerified) {
        for (const created of createdRecordSnapshots) {
          try {
            const adapter = StorageMutationAdapters.getAdapter(created.storageKey);
            const check = adapter.captureSnapshot(created.recordId);
            if (check.exists) {
              rollbackVerified = false;
              failedStores.push(created.storageKey);
            }
          } catch {
            rollbackVerified = false;
            failedStores.push(created.storageKey);
          }
        }
      }
    }

    if (!rollbackVerified) {
      transaction.status = 'RECOVERY_REQUIRED';
      transaction.phase = 'RECOVERY_REQUIRED';
      transaction.unresolvedDetails = {
        stores: Array.from(new Set(failedStores)),
        reason: 'Rollback verification failed to restore prior state.',
      };
      try { ActionStorage.saveTransaction(transaction); } catch {}
      return {
        success: false,
        transaction,
        executedActions,
        failedAction,
        rolledBack: false,
        error: 'Rollback verification failed',
        message: 'Critical error: Rollback failed verification. Manual recovery required.',
      };
    }

    transaction.status = 'ROLLED_BACK';
    transaction.phase = 'ROLLED_BACK';
    transaction.failureReason = `Action "${failedAction.title}" failed: ${errorMessage}`;
    try { ActionStorage.saveTransaction(transaction); } catch {}
    return {
      success: false,
      transaction,
      executedActions,
      failedAction,
      rolledBack: true,
      error: transaction.failureReason,
      message: `Execution failed on "${failedAction.title}". All changes were rolled back.`,
    };
  }
}
