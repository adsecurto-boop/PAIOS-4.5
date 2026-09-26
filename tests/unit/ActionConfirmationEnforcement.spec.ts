/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ProposedAction } from '../../src/core/actions/actionTypes';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { ActionConfirmationManager } from '../../src/core/actions/ActionConfirmationManager';

describe('DEF-01: Action Confirmation Enforcement & Proof Verification', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
  });

  it('rejects execution of MEDIUM/HIGH risk action when confirmation proof is missing', async () => {
    const mediumRiskAction: ProposedAction = {
      id: 'act-med-1',
      transactionId: 'tx-conf-1',
      type: 'RECORD_EXPENSE',
      title: 'Expense requiring confirmation',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { amount: 500, title: 'Office Supplies', category: 'Supplies' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([mediumRiskAction], 'record 500 expense');
    tx.id = 'tx-conf-1';

    // Attempt direct execution without proof
    const report = await ActionTransactionManager.executeTransaction(tx);

    expect(report.success).toBe(false);
    expect(report.message).toMatch(/confirmation proof|unconfirmed|requires confirmation/i);
    expect(report.transaction.status).not.toBe('COMMITTED');

    // Verify 0 domain writes occurred
    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.length ?? 0).toBe(0);
  });

  it('rejects execution when confirmation proof is forged or token is invalid', async () => {
    const action: ProposedAction = {
      id: 'act-high-1',
      transactionId: 'tx-conf-2',
      type: 'REPLAN_DAY',
      title: 'Replan entire day',
      risk: 'HIGH',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { reason: 'Emergency shift' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'replan day');
    tx.id = 'tx-conf-2';

    // Provide a forged fake proof
    const fakeProof = {
      token: 'forged-fake-token-123',
      transactionId: 'tx-conf-2',
      actionsHash: 'dummyhash',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    };

    const report = await ActionTransactionManager.executeTransaction(tx, fakeProof);

    expect(report.success).toBe(false);
    expect(report.message).toMatch(/invalid.*proof|forged|verification failed/i);
    expect(report.transaction.status).not.toBe('COMMITTED');
  });

  it('rejects execution when confirmation proof is expired', async () => {
    const action: ProposedAction = {
      id: 'act-exp-1',
      transactionId: 'tx-conf-3',
      type: 'RECORD_EXPENSE',
      title: 'Expensive buy',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { amount: 1500, title: 'Server Hosting', category: 'Ops' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'record 1500 expense');
    tx.id = 'tx-conf-3';

    // Issue proof then simulate expiration
    const proof = ActionConfirmationManager.generateProof(tx);
    proof.expiresAt = Date.now() - 1000; // expired 1s ago

    const report = await ActionTransactionManager.executeTransaction(tx, proof);

    expect(report.success).toBe(false);
    expect(report.message).toMatch(/expired/i);
    expect(report.transaction.status).not.toBe('COMMITTED');

    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.length ?? 0).toBe(0);
  });

  it('prohibits single-use confirmation proof from being reused twice', async () => {
    const action: ProposedAction = {
      id: 'act-single-1',
      transactionId: 'tx-single-use',
      type: 'RECORD_EXPENSE',
      title: 'Single use expense',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { amount: 200, title: 'Single Use Lunch', category: 'Food' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'record 200 expense');
    tx.id = 'tx-single-use';

    const proof = ActionConfirmationManager.generateProof(tx);

    // First execution with proof should succeed
    const firstReport = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(firstReport.success).toBe(true);
    expect(firstReport.transaction.status).toBe('COMMITTED');

    // Create a new transaction trying to reuse the already consumed proof
    const action2: ProposedAction = {
      ...action,
      id: 'act-single-2',
      transactionId: 'tx-single-use-2',
      payload: { amount: 200, title: 'Second lunch attempt', category: 'Food' },
    };
    const tx2 = ActionTransactionManager.buildTransaction([action2], 'record 200 expense again');
    tx2.id = 'tx-single-use-2';

    // Attempt reuse on tx2 or re-execution with the same proof
    const secondReport = await ActionTransactionManager.executeTransaction(tx2, proof);
    expect(secondReport.success).toBe(false);
    expect(secondReport.message).toMatch(/proof.*already used|consumed|invalid/i);
  });

  it('rejects execution if action payload was modified after proof generation (tamper detection)', async () => {
    const action: ProposedAction = {
      id: 'act-tamper-1',
      transactionId: 'tx-tamper',
      type: 'RECORD_EXPENSE',
      title: 'Legit expense',
      risk: 'MEDIUM',
      requiresConfirmation: true,
      validationState: 'VALID',
      createdAt: Date.now(),
      payload: { amount: 50, title: 'Coffee', category: 'Food' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'record coffee 50');
    tx.id = 'tx-tamper';

    // Generate proof for 50
    const proof = ActionConfirmationManager.generateProof(tx);

    // Tamper with payload: change amount to 50000
    (tx.actions[0].payload as any).amount = 50000;

    const report = await ActionTransactionManager.executeTransaction(tx, proof);
    expect(report.success).toBe(false);
    expect(report.message).toMatch(/hash mismatch|tampered|invalid.*proof/i);

    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.length ?? 0).toBe(0);
  });

  it('strictly blocks execution of BLOCKED risk actions under all circumstances', async () => {
    const blockedAction: ProposedAction = {
      id: 'act-blocked-1',
      transactionId: 'tx-blocked',
      type: 'RECORD_EXPENSE',
      title: 'Negative Amount Malicious Action',
      risk: 'BLOCKED',
      requiresConfirmation: true,
      validationState: 'BLOCKED',
      createdAt: Date.now(),
      payload: { amount: -500, title: 'Negative exploit', category: 'Evil' },
      affectedRecordIds: [],
    };

    const tx = ActionTransactionManager.buildTransaction([blockedAction], 'negative exploit');
    tx.id = 'tx-blocked';

    // Even if caller attempts to forge or supply a proof, BLOCKED actions must be rejected
    const report = await ActionTransactionManager.executeTransaction(tx);
    expect(report.success).toBe(false);
    expect(report.message).toMatch(/blocked/i);
    expect(report.transaction.status).toBe('FAILED');
  });
});
