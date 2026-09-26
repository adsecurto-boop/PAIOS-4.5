import { TransactionRecord } from './actionTypes';
import { ActionStorage } from './actionStorage';
import { StorageMutationAdapters } from './StorageMutationAdapters';

export interface RecoveryReport {
  recoveredCount: number;
  rolledBackCount: number;
  flaggedForReviewCount: number;
  details: string[];
}

export class ActionRecovery {
  /**
   * Runs startup recovery and returns diagnostic report
   */
  static async runStartupRecovery(): Promise<RecoveryReport> {
    return this.recoverPendingTransactions();
  }

  /**
   * Inspects pending or interrupted transactions on application startup
   */
  static recoverPendingTransactions(): RecoveryReport {
    const pending = ActionStorage.getPendingTransactions();
    const report: RecoveryReport = {
      recoveredCount: 0,
      rolledBackCount: 0,
      flaggedForReviewCount: 0,
      details: [],
    };

    if (pending.length === 0) {
      return report;
    }

    console.log(`[ActionRecovery] Found ${pending.length} pending transaction(s) requiring recovery analysis...`);

    for (const tx of pending) {
      try {
        if (tx.status === 'RECOVERY_REQUIRED') {
          if (!tx.beforeSnapshot?.length) {
            report.flaggedForReviewCount++;
            report.details.push(`Transaction ${tx.id} still requires manual recovery because no before-state is available.`);
            continue;
          }

          const failedStores: string[] = [];
          for (const snap of [...tx.beforeSnapshot].reverse()) {
            const restored = StorageMutationAdapters.getAdapter(snap.storageKey).restoreSnapshot(snap);
            if (!restored.success) failedStores.push(snap.storageKey);
          }
          for (const snap of tx.beforeSnapshot) {
            const current = StorageMutationAdapters.getAdapter(snap.storageKey).captureSnapshot(snap.recordId);
            if (
              current.exists !== snap.exists ||
              JSON.stringify(current.data) !== JSON.stringify(snap.data) ||
              JSON.stringify(current.containerData) !== JSON.stringify(snap.containerData)
            ) {
              failedStores.push(snap.storageKey);
            }
          }

          if (failedStores.length === 0) {
            tx.status = 'ROLLED_BACK';
            tx.phase = 'ROLLED_BACK';
            tx.failureReason = 'Recovery-required transaction restored to its verified before-state.';
            tx.unresolvedDetails = undefined;
            ActionStorage.saveTransaction(tx);
            report.rolledBackCount++;
            report.recoveredCount++;
            report.details.push(`Transaction ${tx.id} was restored and verified.`);
          } else {
            tx.unresolvedDetails = {
              stores: Array.from(new Set(failedStores)),
              reason: 'Retry could not restore the exact before-state.',
            };
            ActionStorage.saveTransaction(tx);
            report.flaggedForReviewCount++;
            report.details.push(`Transaction ${tx.id} still requires manual recovery.`);
          }
          continue;
        }

        if (tx.status === 'SYNC_PENDING') {
          // Transaction was locally committed, only cloud sync is pending
          report.recoveredCount++;
          report.details.push(`Transaction ${tx.id} marked as committed (sync will proceed in background).`);
          continue;
        }

        if (tx.status === 'JOURNALED' || tx.status === 'VALIDATING') {
          // Interrupted before any domain write occurred -> Safely mark FAILED
          tx.status = 'FAILED';
          tx.phase = 'FAILED';
          tx.failureReason = 'Interrupted by application restart before mutation execution began.';
          ActionStorage.saveTransaction(tx);
          report.recoveredCount++;
          report.details.push(`Transaction ${tx.id} was safely aborted before mutation occurred.`);
          continue;
        }

        if (tx.status === 'COMMITTING' || tx.status === 'ROLLING_BACK') {
          const stepCount = tx.stepMarkers?.length || 0;
          const totalActions = tx.actions?.length || 0;

          // Check if any domain records were actually modified compared to beforeSnapshot
          let anyRecordModified = false;
          if (tx.beforeSnapshot && tx.beforeSnapshot.length > 0) {
            for (const snap of tx.beforeSnapshot) {
              try {
                const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
                const current = adapter.captureSnapshot(snap.recordId);
                if (snap.exists !== current.exists || JSON.stringify(snap.data) !== JSON.stringify(current.data)) {
                  anyRecordModified = true;
                  break;
                }
              } catch {
                anyRecordModified = true;
                break;
              }
            }
          }

          let exactAfterState = false;
          if (tx.afterSnapshot?.length) {
            exactAfterState = tx.afterSnapshot.every((expected) => {
              const current = StorageMutationAdapters.getAdapter(expected.storageKey).captureSnapshot(expected.recordId);
              return current.exists === expected.exists &&
                JSON.stringify(current.data) === JSON.stringify(expected.data) &&
                JSON.stringify(current.containerData) === JSON.stringify(expected.containerData);
            });
          }

          if (totalActions > 0 && stepCount === totalActions && exactAfterState) {
            // All actions and their exact after-state are proven.
            tx.status = 'COMMITTED';
            tx.phase = 'COMMITTED';
            tx.committedAt = tx.committedAt || Date.now();
            ActionStorage.saveTransaction(tx);
            report.recoveredCount++;
            report.details.push(`Transaction ${tx.id} confirmed all steps completed; reconciled to COMMITTED.`);
            continue;
          }

          if (!anyRecordModified && stepCount === 0) {
            // Zero actions executed and storage is identical to before-snapshots -> Safely mark FAILED
            tx.status = 'FAILED';
            tx.phase = 'FAILED';
            tx.failureReason = 'Interrupted by restart before writes took effect.';
            ActionStorage.saveTransaction(tx);
            report.recoveredCount++;
            report.details.push(`Transaction ${tx.id} had no writes and was safely marked failed.`);
            continue;
          }

          // Partial write detected -> Attempt clean verified rollback using beforeSnapshot
          if (tx.beforeSnapshot && tx.beforeSnapshot.length > 0) {
            console.warn(`[ActionRecovery] Partial write detected in transaction ${tx.id}. Restoring before-snapshot...`);
            let rollbackVerified = true;
            const failedStores: string[] = [];

            // Restore in reverse order
            for (const snap of [...tx.beforeSnapshot].reverse()) {
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

            // Verify post-rollback state
            if (rollbackVerified) {
              for (const snap of tx.beforeSnapshot) {
                try {
                  const adapter = StorageMutationAdapters.getAdapter(snap.storageKey);
                  const cur = adapter.captureSnapshot(snap.recordId);
                  if (
                    snap.exists !== cur.exists ||
                    JSON.stringify(snap.data) !== JSON.stringify(cur.data) ||
                    JSON.stringify(snap.containerData) !== JSON.stringify(cur.containerData)
                  ) {
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
            }

            if (rollbackVerified) {
              tx.status = 'ROLLED_BACK';
              tx.phase = 'ROLLED_BACK';
              tx.failureReason = 'Partial commit rolled back safely on startup.';
              ActionStorage.saveTransaction(tx);
              report.rolledBackCount++;
              report.details.push(`Transaction ${tx.id} had partial writes rolled back to initial snapshot.`);
            } else {
              tx.status = 'RECOVERY_REQUIRED';
              tx.phase = 'RECOVERY_REQUIRED';
              tx.unresolvedDetails = {
                stores: Array.from(new Set(failedStores)),
                reason: 'Startup recovery rollback could not be verified.',
              };
              ActionStorage.saveTransaction(tx);
              report.flaggedForReviewCount++;
              report.details.push(`Transaction ${tx.id} flagged for recovery (rollback failed verification).`);
            }
          } else {
            // Cannot rollback cleanly without snapshots -> flag for manual recovery
            tx.status = 'RECOVERY_REQUIRED';
            tx.phase = 'RECOVERY_REQUIRED';
            tx.failureReason = 'Interrupted without before-snapshots; manual recovery required.';
            tx.unresolvedDetails = {
              stores: tx.affectedRecords ? Array.from(new Set(tx.affectedRecords.map((r) => r.storageKey))) : [],
              reason: 'Missing snapshots prevented automated rollback.',
            };
            ActionStorage.saveTransaction(tx);
            report.flaggedForReviewCount++;
            report.details.push(`Transaction ${tx.id} flagged for review to prevent data loss.`);
          }
        }
      } catch (err: any) {
        console.error(`[ActionRecovery] Failed to recover transaction ${tx.id}:`, err);
        tx.status = 'RECOVERY_REQUIRED';
        tx.phase = 'RECOVERY_REQUIRED';
        tx.failureReason = `Exception during recovery: ${err?.message || String(err)}`;
        try {
          ActionStorage.saveTransaction(tx);
        } catch {}
        report.flaggedForReviewCount++;
      }
    }

    return report;
  }
}
