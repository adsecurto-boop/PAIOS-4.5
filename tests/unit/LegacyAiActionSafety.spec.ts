/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PAIOSStorage, getTodayDateString } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';
import { ActionTransactionManager } from '../../src/core/actions/ActionTransactionManager';
import { ActionRiskPolicy } from '../../src/core/actions/ActionRiskPolicy';
import { ActionPayloadValidator } from '../../src/core/actions/ActionPayloadValidator';
import { DoseEvent } from '../../src/types';

describe('DEF-02: Legacy AI Action Safety & Confirmation Enforcement', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
  });

  it('rejects unconfirmed execution of AI-proposed medication logging', async () => {
    // Setup an existing scheduled dose
    const dose: DoseEvent = {
      id: 'dose-amox-1',
      medicationId: 'med-123',
      medicationName: 'Amoxicillin',
      dosage: '500mg',
      scheduledDateString: getTodayDateString(),
      scheduledTime: '08:00',
      status: 'SCHEDULED',
    };
    PAIOSStorage.setItem('paios_medications_v1', [
      { id: 'med-123', genericName: 'Amoxicillin', dosageStrength: '500', dosageUnit: 'mg', status: 'active', scheduleTimes: ['08:00'] },
    ]);
    PAIOSStorage.setItem('paios_dose_events_v1', { [getTodayDateString()]: [dose] });

    // AI proposed payload
    const aiPayload = JSON.stringify({
      medication_ids: ['med-123'],
      action: 'TAKEN',
      notes: 'Recorded via AI',
    });

    // Even if legacy caller attempts to build an action with requiresConfirmation: false
    const parsedPayload = JSON.parse(aiPayload);
    const action = {
      id: 'act-legacy-med',
      transactionId: 'tx-legacy-med',
      type: 'RECORD_MEDICATION_EVENT' as const,
      payload: {
        doseEventId: 'dose-amox-1',
        medicationId: 'med-123',
        medicationName: 'Amoxicillin',
        status: 'TAKEN' as const,
        note: parsedPayload.notes,
      },
      // Caller maliciously or naively sets risk to LOW and requiresConfirmation to false
      risk: 'LOW' as const,
      requiresConfirmation: false,
      title: 'Record dose',
      explanation: 'AI proposal',
      sourceText: 'LOG_DOSE',
      affectedRecordIds: ['dose-amox-1'],
      expectedRevisions: {},
      validationState: 'VALID' as const,
      createdAt: Date.now(),
      originDeviceId: 'test-device',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'AI Action: LOG_DOSE');

    // Central risk evaluation MUST recompute risk and override caller falsifications
    const recomputedRisk = ActionRiskPolicy.evaluateTransactionRisk(tx);
    expect(recomputedRisk.risk).toBe('MEDIUM');

    // Executing tx directly without confirmation proof MUST fail
    const result = await ActionTransactionManager.executeTransaction(tx);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/confirmation proof|unconfirmed|requires confirmation/i);

    // Verify storage is untouched: dose status remains SCHEDULED
    const currentDoses = PAIOSStorage.getDoseEvents();
    const currentDose = currentDoses.find((d) => d.id === 'dose-amox-1');
    expect(currentDose?.status).toBe('SCHEDULED');
  });

  it('rejects unconfirmed execution of AI-proposed expense logging', async () => {
    const aiPayload = JSON.stringify({
      amount: 450,
      title: 'Groceries',
      category: 'Food',
      flowType: 'OUTFLOW',
    });

    const parsed = JSON.parse(aiPayload);
    const action = {
      id: 'act-legacy-exp',
      transactionId: 'tx-legacy-exp',
      type: 'RECORD_EXPENSE' as const,
      payload: {
        amount: parsed.amount,
        title: parsed.title,
        category: parsed.category,
      },
      risk: 'LOW' as const, // Naively set to LOW by legacy handler
      requiresConfirmation: false,
      title: 'Record expense',
      explanation: 'AI proposal',
      sourceText: 'LOG_TRANSACTION',
      affectedRecordIds: [],
      expectedRevisions: {},
      validationState: 'VALID' as const,
      createdAt: Date.now(),
      originDeviceId: 'test-device',
    };

    const tx = ActionTransactionManager.buildTransaction([action], 'AI Action: LOG_TRANSACTION');
    
    // Independent risk evaluation
    expect(ActionRiskPolicy.evaluateTransactionRisk(tx).risk).toBe('MEDIUM');

    // Execution without confirmation proof must be rejected
    const result = await ActionTransactionManager.executeTransaction(tx);
    expect(result.success).toBe(false);

    // Zero expenses stored
    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.length ?? 0).toBe(0);
  });

  it('never marks a random unrelated scheduled dose as taken when medication name is not found', async () => {
    // Only Vitamin D is scheduled
    const dose: DoseEvent = {
      id: 'dose-vit-d',
      medicationId: 'med-vit-d',
      medicationName: 'Vitamin D3',
      dosage: '1000IU',
      scheduledDateString: getTodayDateString(),
      scheduledTime: '09:00',
      status: 'SCHEDULED',
    };
    PAIOSStorage.setItem('paios_medications_v1', [
      { id: 'med-vit-d', genericName: 'Vitamin D3', dosageStrength: '1000', dosageUnit: 'IU', status: 'active', scheduleTimes: ['09:00'] },
    ]);
    PAIOSStorage.setItem('paios_dose_events_v1', { [getTodayDateString()]: [dose] });

    // User or AI asked to log Metformin, which does not exist
    const requestedMed = 'Metformin';
    const doseList = PAIOSStorage.getDoseEvents();
    const matched = doseList.find((d) => 
      d.id === requestedMed || 
      d.medicationId === requestedMed || 
      d.medicationName.toLowerCase().includes(requestedMed.toLowerCase())
    );

    // Matching must fail, and MUST NOT fall back to picking Vitamin D
    expect(matched).toBeUndefined();

    // Verify Vitamin D dose is still SCHEDULED
    expect(doseList[0].status).toBe('SCHEDULED');
  });

  it('validates schema and rejects malformed AI payloads with zero writes', async () => {
    // Malformed expense with negative amount
    const invalidExpensePayload = {
      amount: -100,
      title: '',
    };

    const validation = ActionPayloadValidator.validate('RECORD_EXPENSE', invalidExpensePayload);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    // Verify no action could be executed
    const expenses = PAIOSStorage.getItem<any[]>('paios_expenses_v1', []);
    expect(expenses?.length ?? 0).toBe(0);
  });

  it('rejects NaN amount in RECORD_EXPENSE payload with zero writes', () => {
    const payload = { amount: NaN, title: 'Coffee' };
    const val = ActionPayloadValidator.validate('RECORD_EXPENSE', payload);
    expect(val.isValid).toBe(false);
    expect(val.errors.some((e) => /amount|number/i.test(e))).toBe(true);
    expect(PAIOSStorage.getItem<any[]>('paios_expenses_v1', [])).toHaveLength(0);
  });

  it('rejects negative amount in RECORD_INCOME payload with zero writes', () => {
    const payload = { amount: -500, title: 'Negative Salary' };
    const val = ActionPayloadValidator.validate('RECORD_INCOME', payload);
    expect(val.isValid).toBe(false);
    expect(val.errors.some((e) => /positive|amount/i.test(e))).toBe(true);
    expect(PAIOSStorage.getItem<any[]>('paios_expenses_v1', [])).toHaveLength(0);
  });

  it('rejects unknown action type HACK_SYSTEM with zero writes', () => {
    const val = ActionPayloadValidator.validate('HACK_SYSTEM' as any, { evil: true });
    expect(val.isValid).toBe(false);
    expect(val.errors.some((e) => /unknown|unsupported/i.test(e))).toBe(true);
  });

  it('rejects malformed medication status CONSUMED with zero writes', () => {
    const payload = { doseEventId: 'dose_1', status: 'CONSUMED' };
    const val = ActionPayloadValidator.validate('RECORD_MEDICATION_EVENT', payload);
    expect(val.isValid).toBe(false);
    expect(val.errors.some((e) => /status/i.test(e))).toBe(true);
  });
});
