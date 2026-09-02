/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { PAIOSStorage, getTodayDateString } from '../../src/storage';
import { Medication, RefillInventory, DoseEvent } from '../../src/types';

describe('ATDD: AI Conversational Dose Confirmation & State Mutation (BUG-04)', () => {
  let authToken: string;

  beforeEach(async () => {
    PAIOSStorage.clear();

    // Register authenticated user for AI proxy
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: `ai_dose_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@paios.ai`,
        password: 'SecurePassword123!',
        displayName: 'Health Dose User',
      });
    authToken = regRes.body.token;

    // Seed medication and refill inventory
    const med: Medication = {
      id: 'med_test_sertraline',
      genericName: 'Sertraline HCl',
      brandName: 'Zoloft',
      dosageStrength: 50,
      dosageUnit: 'mg',
      form: 'tablet',
      route: 'oral',
      status: 'active',
      instructions: 'Take 1 tablet in the morning',
      scheduleTimes: ['08:00'],
      createdAtMillis: Date.now(),
    };
    PAIOSStorage.saveMedication(med);

    const refill: RefillInventory = {
      id: 'refill_test_sertraline',
      medicationId: 'med_test_sertraline',
      medicationName: 'Sertraline HCl 50 mg',
      quantityRemaining: 15,
      unit: 'tablets',
      dailyBurnRate: 1,
      minimumThresholdDays: 7,
      timingSlots: ['Morning'],
      dosesPerDay: 1,
    };
    PAIOSStorage.saveRefillInventory(refill);
  });

  it('returns structured record_medication_dose tool action from AI chat proxy', async () => {
    const response = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        message: 'I took my morning Sertraline dose, mark it as taken.',
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('actionType');
    expect(response.body.actionType).toBe('LOG_DOSE');
    expect(response.body).toHaveProperty('actionPayloadJson');

    const payload = JSON.parse(response.body.actionPayloadJson);
    expect(payload.type).toBe('record_medication_dose');
    expect(payload.action).toBe('TAKEN');
  });

  it('executes dose adherence mutation and transitions Daily Schedule Ledger status to TAKEN', () => {
    const today = getTodayDateString();
    const initialDoses = PAIOSStorage.getDoseEvents(today);
    const targetDose = initialDoses.find((d) => d.medicationId === 'med_test_sertraline');
    expect(targetDose).toBeDefined();
    expect(targetDose?.status).toBe('SCHEDULED');

    // Simulate tool execution in storage layer
    const updatedDose = PAIOSStorage.logDoseEvent(targetDose!.id, 'TAKEN', 'Dose logged via AI tool execution');

    expect(updatedDose).not.toBeNull();
    expect(updatedDose!.status).toBe('TAKEN');
    expect(updatedDose!.actualTakenTimeMillis).toBeGreaterThan(0);

    // Verify Daily Schedule Ledger state
    const currentDoses = PAIOSStorage.getDoseEvents(today);
    const currentTarget = currentDoses.find((d) => d.id === targetDose!.id);
    expect(currentTarget?.status).toBe('TAKEN');

    // Verify Refill Vault inventory decremented
    const refills = PAIOSStorage.getRefillInventories();
    const currentRefill = refills.find((r) => r.medicationId === 'med_test_sertraline');
    expect(currentRefill?.quantityRemaining).toBe(14);
  });
});
