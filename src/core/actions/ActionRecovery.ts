import { TransactionRecord } from './actionTypes';
import { ActionStorage } from './actionStorage';
import { ActionExecutor } from './ActionExecutor';

export interface RecoveryReport {
  recoveredCount: number;
  rolledBackCount: number;
  flaggedForReviewCount: number;
  details: string[];
}

export class ActionRecovery {
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
        if (tx.status === 'SYNC_PENDING') {
          // Transaction was locally committed, only cloud sync is pending
          report.recoveredCount++;
          report.details.push(`Transaction ${tx.id} marked as committed (sync will proceed in background).`);
          continue;
        }

        if (tx.status === 'VALIDATING') {
          // Interrupted before any write occurred -> Safely mark FAILED
          tx.status = 'FAILED';
          tx.failureReason = 'Interrupted by application restart during validation phase.';
          ActionStorage.saveTransaction(tx);
          report.recoveredCount++;
          report.details.push(`Transaction ${tx.id} was safely aborted before mutation occurred.`);
          continue;
        }

        if (tx.status === 'COMMITTING') {
          // Interrupted during commit: Inspect whether records were written
          const analysis = this.analyzeCommitState(tx);

          if (analysis.allWritten) {
            // All records proved committed -> complete bookkeeping safely
            tx.status = 'COMMITTED';
            tx.committedAt = tx.committedAt || Date.now();
            ActionStorage.saveTransaction(tx);
            report.recoveredCount++;
            report.details.push(`Transaction ${tx.id} was confirmed committed and bookkeeping reconciled.`);
          } else if (analysis.noneWritten) {
            // No records written -> mark safely as FAILED
            tx.status = 'FAILED';
            tx.failureReason = 'Interrupted by restart before writes took effect.';
            ActionStorage.saveTransaction(tx);
            report.recoveredCount++;
            report.details.push(`Transaction ${tx.id} had no writes and was safely marked failed.`);
          } else {
            // Partial write detected -> Attempt clean rollback using beforeSnapshot
            if (tx.beforeSnapshot && tx.beforeSnapshot.length > 0) {
              console.warn(`[ActionRecovery] Partial write detected in transaction ${tx.id}. Restoring before-snapshot...`);
              for (const snap of tx.beforeSnapshot) {
                ActionExecutor.restoreRecordSnapshot(snap);
              }
              tx.status = 'ROLLED_BACK';
              tx.failureReason = 'Partial commit rolled back safely on startup.';
              ActionStorage.saveTransaction(tx);
              report.rolledBackCount++;
              report.details.push(`Transaction ${tx.id} had partial writes rolled back to initial snapshot.`);
            } else {
              // Cannot verify cleanly -> mark for user review, do NOT duplicate
              tx.status = 'FAILED';
              tx.failureReason = 'Uncertain state on restart; requires manual review.';
              ActionStorage.saveTransaction(tx);
              report.flaggedForReviewCount++;
              report.details.push(`Transaction ${tx.id} flagged for review to prevent duplicate records.`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[ActionRecovery] Failed to recover transaction ${tx.id}:`, err);
      }
    }

    return report;
  }

  private static analyzeCommitState(tx: TransactionRecord): { allWritten: boolean; noneWritten: boolean } {
    let writtenCount = 0;
    const total = tx.affectedRecords.length;

    for (const ref of tx.affectedRecords) {
      const snap = ActionExecutor.captureRecordSnapshot(ref.storageKey, ref.recordId);
      if (snap.exists) {
        writtenCount++;
      }
    }

    return {
      allWritten: total > 0 && writtenCount === total,
      noneWritten: writtenCount === 0,
    };
  }
}
