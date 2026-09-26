/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ProposedAction } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';

describe('DEF-04: Write-Ahead Logging & Journal Downtime Protection', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
    vi.restoreAllMocks();
  });

  it('aborts transaction immediately with 0 domain writes if WAL journaling fails', async () => {
    const action: ProposedAction = {
      id: 'act-wal-1',
      transactionId: 'tx-wal-fail',
      type: 'CREATE_TASK',
      title: 'Task that must not be created if WAL fails',
      risk: 'LOW',
      requiresConfirmation: false,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { title: 'Do not create me' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'wal test');
    tx.id = 'tx-wal-fail';

    // Mock ActionStorage.saveTransaction to fail on journal write
    const spy = vi.spyOn(ActionStorage, 'saveTransaction').mockImplementation(() => {
      throw new Error('Disk quota exceeded or Journal write failure');
    });

    const report = await ActionTransactionManager.executeTransaction(tx);

    expect(report.success).toBe(false);
    expect(report.message).toMatch(/journal|quota|failed to persist/i);

    // Verify 0 domain writes occurred
    const tasks = PAIOSStorage.getItem<any[]>('paios_tasks_v1', []);
    expect(tasks?.some((t) => t.title === 'Do not create me')).toBe(false);

    spy.mockRestore();
  });

  it('does not silently swallow journal errors in ActionStorage', () => {
    // Attempting to save a transaction when underlying storage throws must bubble up or throw typed error
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const dummyTx = {
      id: 'tx-fail-quota',
      originalCommand: 'test',
      actions: [],
      risk: 'LOW' as const,
      status: 'PROPOSED' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: 'web' as const,
      sourceDeviceId: 'dev',
      affectedRecords: [],
      expectedRevisions: {},
      beforeSnapshot: [],
      syncStatus: 'LOCAL' as const,
      undoStatus: 'NOT_APPLICABLE' as const,
    };

    expect(() => {
      ActionStorage.saveTransaction(dummyTx);
    }).toThrow(/QuotaExceededError|Journal/i);

    spy.mockRestore();
  });

  it('prevents ledger clearing from purging pending or recovery-required transactions while clearing committed', () => {
    const committedTx = {
      id: 'tx-committed-safe',
      originalCommand: 'done tx',
      actions: [],
      risk: 'LOW' as const,
      status: 'COMMITTED' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: 'web' as const,
      sourceDeviceId: 'dev',
      affectedRecords: [],
      expectedRevisions: {},
      beforeSnapshot: [],
      syncStatus: 'LOCAL' as const,
      undoStatus: 'AVAILABLE' as const,
    };

    const recoveryTx = {
      id: 'tx-recovery-needed',
      originalCommand: 'crashed tx',
      actions: [],
      risk: 'MEDIUM' as const,
      status: 'RECOVERY_REQUIRED' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: 'web' as const,
      sourceDeviceId: 'dev',
      affectedRecords: [],
      expectedRevisions: {},
      beforeSnapshot: [],
      syncStatus: 'LOCAL' as const,
      undoStatus: 'NOT_APPLICABLE' as const,
    };

    ActionStorage.saveTransaction(committedTx);
    ActionStorage.saveTransaction(recoveryTx);

    // Default clearLedger() with force=false:
    // Committed tx must be purged, recovery-required tx must be preserved
    ActionStorage.clearLedger();

    expect(ActionStorage.getTransaction('tx-committed-safe')).toBeUndefined();
    const retrievedRecovery = ActionStorage.getTransaction('tx-recovery-needed');
    expect(retrievedRecovery).toBeDefined();
    expect(retrievedRecovery?.status).toBe('RECOVERY_REQUIRED');

    // Forced clearLedger(true) purges all records
    ActionStorage.clearLedger(true);
    expect(ActionStorage.getTransaction('tx-recovery-needed')).toBeUndefined();
  });

  it('verifies clearTransactions() maintains parity with clearLedger() safety defaults', () => {
    const journaledTx = {
      id: 'tx-journaled-in-flight',
      originalCommand: 'in flight tx',
      actions: [],
      risk: 'LOW' as const,
      status: 'JOURNALED' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePlatform: 'web' as const,
      sourceDeviceId: 'dev',
      affectedRecords: [],
      expectedRevisions: {},
      beforeSnapshot: [],
      syncStatus: 'LOCAL' as const,
      undoStatus: 'NOT_APPLICABLE' as const,
    };

    ActionStorage.saveTransaction(journaledTx);

    // Default non-forced clearTransactions() must protect in-flight JOURNALED transaction
    ActionStorage.clearTransactions();
    expect(ActionStorage.getTransaction('tx-journaled-in-flight')).toBeDefined();

    // Forced clearTransactions(true) clears everything
    ActionStorage.clearTransactions(true);
    expect(ActionStorage.getTransaction('tx-journaled-in-flight')).toBeUndefined();
  });
});
