import { TransactionRecord } from './actionTypes';
import { validateTransactionRecord } from './actionSchemas';
import { isSensitiveCommand } from '../../utils/sensitiveCommandDetector';

export const ACTION_TRANSACTIONS_KEY = 'paios_action_transactions_v1';
export const AWAITING_INTERPRETATION_KEY = 'paios_awaiting_interpretation_v1';
export const PROACTIVE_PREFERENCES_KEY = 'paios_proactive_preferences_v1';

const MAX_TRANSACTIONS_RETENTION = 150;

export class ActionStorage {
  /**
   * Retrieves all stored transaction records, sorted by createdAt descending
   */
  static getAllTransactions(): TransactionRecord[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(ACTION_TRANSACTIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const validList: TransactionRecord[] = [];
      for (const item of parsed) {
        const v = validateTransactionRecord(item);
        if (v.isValid && v.sanitized) {
          validList.push(v.sanitized);
        }
      }
      return validList.sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      console.warn('[ActionStorage] Failed to read transactions:', err);
      return [];
    }
  }

  /**
   * Retrieves a specific transaction by its ID
   */
  static getTransaction(id: string): TransactionRecord | undefined {
    return this.getAllTransactions().find((tx) => tx.id === id);
  }

  /**
   * Saves a new or updated transaction record
   */
  static saveTransaction(record: TransactionRecord): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = this.getAllTransactions();
      const existingIdx = list.findIndex((t) => t.id === record.id);

      if (existingIdx >= 0) {
        list[existingIdx] = { ...record, updatedAt: Date.now() };
      } else {
        list.unshift({ ...record, updatedAt: Date.now() });
      }

      // Safe bounded retention
      const boundedList = list.slice(0, MAX_TRANSACTIONS_RETENTION);
      localStorage.setItem(ACTION_TRANSACTIONS_KEY, JSON.stringify(boundedList));
    } catch (err: any) {
      console.error('[ActionStorage] Failed to save transaction journal:', err);
      throw new Error(`[ActionStorage] Journal persistence failed: ${err?.message || String(err)}`);
    }
  }

  /**
   * Records an execution step marker immediately after an action succeeds
   */
  static recordActionExecutionStep(
    transactionId: string,
    marker: { actionIndex: number; actionId: string; createdRecordIds?: string[]; affectedRecordIds?: string[]; completedAt: number }
  ): void {
    const tx = this.getTransaction(transactionId);
    if (!tx) return;
    if (!tx.stepMarkers) tx.stepMarkers = [];
    tx.stepMarkers.push(marker);
    this.saveTransaction(tx);
  }

  /**
   * Updates partial fields of an existing transaction
   */
  static updateTransaction(id: string, updates: Partial<TransactionRecord>): void {
    const tx = this.getTransaction(id);
    if (!tx) return;
    this.saveTransaction({
      ...tx,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  /**
   * Retrieves transactions left in transitional states for recovery
   */
  static getPendingTransactions(): TransactionRecord[] {
    return this.getAllTransactions().filter((tx) =>
      ['JOURNALED', 'VALIDATING', 'COMMITTING', 'ROLLING_BACK', 'SYNC_PENDING', 'RECOVERY_REQUIRED'].includes(tx.status)
    );
  }

  /**
   * Retrieves transactions that require manual or user-assisted recovery
   */
  static getRecoveryRequiredTransactions(): TransactionRecord[] {
    return this.getAllTransactions().filter((tx) => tx.status === 'RECOVERY_REQUIRED');
  }

  /**
   * Clears transactions ledger, with protection for pending or recovery-required transactions unless forced
   */
  static clearTransactions(force: boolean = false): void {
    if (typeof localStorage === 'undefined') return;
    if (force) {
      localStorage.removeItem(ACTION_TRANSACTIONS_KEY);
      return;
    }

    const all = this.getAllTransactions();
    const protectedStatuses = ['RECOVERY_REQUIRED', 'JOURNALED', 'VALIDATING', 'COMMITTING', 'AWAITING_CONFIRMATION'];
    const preserved = all.filter((tx) => protectedStatuses.includes(tx.status));

    if (preserved.length === 0) {
      localStorage.removeItem(ACTION_TRANSACTIONS_KEY);
    } else {
      localStorage.setItem(ACTION_TRANSACTIONS_KEY, JSON.stringify(preserved));
    }
  }

  static clearLedger(force: boolean = false): void {
    this.clearTransactions(force);
  }

  /**
   * Awaiting interpretation queue helpers
   */
  static queueAwaitingInterpretation(command: string, isSensitiveOrActionTypes?: boolean | string[]): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const settingsRaw = localStorage.getItem('paios_settings_v1');
      const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
      const allowHistory = settings.allowAiCommandHistory === true;

      const isSensitive = typeof isSensitiveOrActionTypes === 'boolean'
        ? isSensitiveOrActionTypes
        : isSensitiveCommand(command, isSensitiveOrActionTypes);

      if (!allowHistory && isSensitive) {
        return false; // skip silently
      }

      const list = this.getAwaitingInterpretation();
      list.unshift(command);
      localStorage.setItem(AWAITING_INTERPRETATION_KEY, JSON.stringify(list.slice(0, 50)));
      return true;
    } catch {
      return false;
    }
  }

  static getAwaitingInterpretation(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(AWAITING_INTERPRETATION_KEY) || '[]');
    } catch {
      return [];
    }
  }

  static removeAwaitingInterpretation(command: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = this.getAwaitingInterpretation().filter((c) => c !== command);
      localStorage.setItem(AWAITING_INTERPRETATION_KEY, JSON.stringify(list));
    } catch {}
  }
}
