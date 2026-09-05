/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PAIOSStorage, getTodayDateString } from '../../src/storage';
import { paiosDb } from '../../src/core/db';
import { DoseLedgerEngine } from '../../src/core/health/DoseLedgerEngine';
import { Medication, RefillInventory } from '../../src/types';

describe('Unit Test: Daily Schedule Ledger State Machine & Safety Protection', () => {
  const today = getTodayDateString();

  beforeEach(async () => {
    localStorage.clear();
    await paiosDb.medications.clear();
    await paiosDb.refillInventories.clear();
    await paiosDb.doseEvents.clear();
    PAIOSStorage.clear();
  });

  describe('1. Deterministic Dose Slot Modeling', () => {
    it('generates exactly one dose slot for once-daily medications', () => {
      const med: Medication = {
        id: 'med_once_daily',
        genericName: 'Propranolol HCl SR',
        brandName: 'Inderal LA',
        dosageStrength: 40,
        dosageUnit: 'mg',
        form: 'sustained_release_tablet',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 capsule in morning',
        scheduleTimes: ['08:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const doses = PAIOSStorage.getDoseEvents(today);
      const medDoses = doses.filter((d) => d.medicationId === 'med_once_daily');

      expect(medDoses).toHaveLength(1);
      expect(medDoses[0].scheduledTime).toBe('08:00');
      expect(medDoses[0].status).toBe('SCHEDULED');
      expect(medDoses[0].id).toBe(`dose_med_once_daily_${today}_0800`);
    });

    it('generates two distinct, independent dose slots for twice-daily medications', () => {
      const med: Medication = {
        id: 'med_twice_daily',
        genericName: 'Sertraline HCl',
        brandName: 'Zoloft',
        dosageStrength: 50,
        dosageUnit: 'mg',
        form: 'tablet',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 tablet twice daily (morning & night)',
        scheduleTimes: ['08:00', '21:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const doses = PAIOSStorage.getDoseEvents(today);
      const medDoses = doses.filter((d) => d.medicationId === 'med_twice_daily');

      expect(medDoses).toHaveLength(2);
      const morningDose = medDoses.find((d) => d.scheduledTime === '08:00');
      const nightDose = medDoses.find((d) => d.scheduledTime === '21:00');

      expect(morningDose).toBeDefined();
      expect(nightDose).toBeDefined();
      expect(morningDose!.id).toBe(`dose_med_twice_daily_${today}_0800`);
      expect(nightDose!.id).toBe(`dose_med_twice_daily_${today}_2100`);
    });
  });

  describe('2. Single-Action Locking & Terminal States', () => {
    it('locks dose slot upon taking dose and rejects repeated actions', () => {
      const med: Medication = {
        id: 'med_lock_test',
        genericName: 'Quetiapine',
        brandName: 'Seroquel',
        dosageStrength: 100,
        dosageUnit: 'mg',
        form: 'tablet',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 at bedtime',
        scheduleTimes: ['22:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const refill: RefillInventory = {
        id: 'refill_lock_test',
        medicationId: 'med_lock_test',
        medicationName: 'Quetiapine 100 mg',
        quantityRemaining: 10,
        unit: 'tablets',
        dailyBurnRate: 1,
        minimumThresholdDays: 5,
        dosesPerDay: 1,
      };
      PAIOSStorage.saveRefillInventory(refill);

      const doseId = `dose_med_lock_test_${today}_2200`;

      // 1. Initial State
      const initialDoses = PAIOSStorage.getDoseEvents(today);
      const initialDose = initialDoses.find((d) => d.id === doseId);
      expect(initialDose?.status).toBe('SCHEDULED');

      // 2. Take Dose
      const logged = PAIOSStorage.logDoseEvent(doseId, 'TAKEN');
      expect(logged).not.toBeNull();
      expect(logged?.status).toBe('TAKEN');
      expect(logged?.actualTakenTimeMillis).toBeDefined();
      const initialTakenTime = logged?.actualTakenTimeMillis;

      // Refill inventory should have decremented by 1 (10 -> 9)
      const refillAfterTake = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_lock_test');
      expect(refillAfterTake?.quantityRemaining).toBe(9);

      // Slot action state: isCompleted must be true and canTake must be false
      const actionState = DoseLedgerEngine.getDoseSlotActionState(logged!, refillAfterTake);
      expect(actionState.isCompleted).toBe(true);
      expect(actionState.canTake).toBe(false);

      // 3. Repeated Click Guard: attempting to log dose again must be rejected
      const duplicateLogged = PAIOSStorage.logDoseEvent(doseId, 'TAKEN');
      expect(duplicateLogged?.status).toBe('TAKEN');
      expect(duplicateLogged?.actualTakenTimeMillis).toBe(initialTakenTime);

      // Inventory must NOT be decremented again
      const refillAfterDuplicate = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_lock_test');
      expect(refillAfterDuplicate?.quantityRemaining).toBe(9);
    });

    it('locks dose slot when SKIPPED and does not decrement refill vault', () => {
      const med: Medication = {
        id: 'med_skip_test',
        genericName: 'Clomipramine',
        brandName: 'Anafranil',
        dosageStrength: 25,
        dosageUnit: 'mg',
        form: 'capsule',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 capsule evening',
        scheduleTimes: ['21:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const refill: RefillInventory = {
        id: 'refill_skip_test',
        medicationId: 'med_skip_test',
        medicationName: 'Clomipramine 25 mg',
        quantityRemaining: 15,
        unit: 'capsules',
        dailyBurnRate: 1,
        minimumThresholdDays: 5,
        dosesPerDay: 1,
      };
      PAIOSStorage.saveRefillInventory(refill);

      const doseId = `dose_med_skip_test_${today}_2100`;
      const logged = PAIOSStorage.logDoseEvent(doseId, 'SKIPPED');

      expect(logged?.status).toBe('SKIPPED');

      // Refill quantity must remain unchanged (15)
      const currentRefill = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_skip_test');
      expect(currentRefill?.quantityRemaining).toBe(15);

      // Verify terminal action state
      const actionState = DoseLedgerEngine.getDoseSlotActionState(logged!, currentRefill);
      expect(actionState.isSkipped).toBe(true);
      expect(actionState.canTake).toBe(false);
      expect(DoseLedgerEngine.isDoseTerminal(logged!.status)).toBe(true);
    });
  });

  describe('3. Dosing Time-Window Gate (Twice-Daily & Interval Protection)', () => {
    it('enforces pre-scheduled window gate and locks future doses', () => {
      // Dose scheduled at 21:00 (Night). Window opens 2 hours prior at 19:00.
      const nightDose = {
        id: 'dose_night',
        medicationId: 'med_twice',
        medicationName: 'Sertraline HCl',
        scheduledDate: today,
        scheduledTime: '21:00',
        status: 'SCHEDULED' as const,
      };

      // Simulated Current Time: 08:30 AM
      const morningTime = new Date();
      morningTime.setHours(8, 30, 0, 0);

      const morningCheck = DoseLedgerEngine.getDoseSlotActionState(nightDose, undefined, morningTime);
      expect(morningCheck.isLockedFuture).toBe(true);
      expect(morningCheck.canTake).toBe(false);
      expect(morningCheck.targetTime).toBe('21:00');
      expect(morningCheck.windowStartTime).toBe('19:00');

      // Simulated Current Time: 19:15 PM (Window now open!)
      const eveningTime = new Date();
      eveningTime.setHours(19, 15, 0, 0);

      const eveningCheck = DoseLedgerEngine.getDoseSlotActionState(nightDose, undefined, eveningTime);
      expect(eveningCheck.isLockedFuture).toBe(false);
      expect(eveningCheck.canTake).toBe(true);
    });

    it('taking morning dose locks morning slot while night slot remains scheduled/future', () => {
      const med: Medication = {
        id: 'med_sertraline_twice',
        genericName: 'Sertraline HCl',
        brandName: 'Zoloft',
        dosageStrength: 50,
        dosageUnit: 'mg',
        form: 'tablet',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 tablet morning and night',
        scheduleTimes: ['08:00', '21:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const refill: RefillInventory = {
        id: 'refill_sertraline_twice',
        medicationId: 'med_sertraline_twice',
        medicationName: 'Sertraline HCl 50 mg',
        quantityRemaining: 30,
        unit: 'tablets',
        dailyBurnRate: 2,
        minimumThresholdDays: 7,
        dosesPerDay: 2,
        timingSlots: ['Morning', 'Night'],
      };
      PAIOSStorage.saveRefillInventory(refill);

      const morningDoseId = `dose_med_sertraline_twice_${today}_0800`;
      const nightDoseId = `dose_med_sertraline_twice_${today}_2100`;

      // Take morning dose at 08:15 AM
      const morningTaken = PAIOSStorage.logDoseEvent(morningDoseId, 'TAKEN');
      expect(morningTaken?.status).toBe('TAKEN');

      // Inspect both doses
      const doses = PAIOSStorage.getDoseEvents(today);
      const morningDose = doses.find((d) => d.id === morningDoseId);
      const nightDose = doses.find((d) => d.id === nightDoseId);

      expect(morningDose?.status).toBe('TAKEN');
      expect(nightDose?.status).toBe('SCHEDULED');

      // Stock should have decremented only by 1
      const currentRefill = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_sertraline_twice');
      expect(currentRefill?.quantityRemaining).toBe(29);
    });
  });

  describe('4. Refill Vault & Supply Depletion Protection', () => {
    it('disables take action and rejects logging when supply is 0', () => {
      const med: Medication = {
        id: 'med_depleted',
        genericName: 'Quetiapine',
        brandName: 'Seroquel',
        dosageStrength: 100,
        dosageUnit: 'mg',
        form: 'tablet',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 at night',
        scheduleTimes: ['22:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const emptyRefill: RefillInventory = {
        id: 'refill_depleted',
        medicationId: 'med_depleted',
        medicationName: 'Quetiapine 100 mg',
        quantityRemaining: 0, // Exhausted stock!
        unit: 'tablets',
        dailyBurnRate: 1,
        minimumThresholdDays: 5,
        dosesPerDay: 1,
      };
      PAIOSStorage.saveRefillInventory(emptyRefill);

      const doseId = `dose_med_depleted_${today}_2200`;
      const dose = PAIOSStorage.getDoseEvents(today).find((d) => d.id === doseId);

      // Verify UI state evaluation
      const actionState = DoseLedgerEngine.getDoseSlotActionState(dose!, emptyRefill);
      expect(actionState.isOutOfSupply).toBe(true);
      expect(actionState.canTake).toBe(false);

      // Verify storage guard: logging must be rejected and return null
      const result = PAIOSStorage.logDoseEvent(doseId, 'TAKEN');
      expect(result).toBeNull();

      // Dose status must remain SCHEDULED
      const doseAfterAttempt = PAIOSStorage.getDoseEvents(today).find((d) => d.id === doseId);
      expect(doseAfterAttempt?.status).toBe('SCHEDULED');

      // Inventory must not go negative
      const refillAfter = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_depleted');
      expect(refillAfter?.quantityRemaining).toBe(0);
    });
  });

  describe('5. Dexie.js Persistence & Hydration', () => {
    it('syncs dose events to Dexie.js and survives hydration', async () => {
      const med: Medication = {
        id: 'med_persist_test',
        genericName: 'Propranolol SR',
        brandName: 'Inderal LA',
        dosageStrength: 40,
        dosageUnit: 'mg',
        form: 'sustained_release_tablet',
        route: 'oral',
        status: 'active',
        instructions: 'Take 1 morning',
        scheduleTimes: ['08:00'],
        createdAtMillis: Date.now(),
      };
      PAIOSStorage.saveMedication(med);

      const refill: RefillInventory = {
        id: 'refill_persist_test',
        medicationId: 'med_persist_test',
        medicationName: 'Propranolol SR 40 mg',
        quantityRemaining: 20,
        unit: 'capsules',
        dailyBurnRate: 1,
        minimumThresholdDays: 7,
        dosesPerDay: 1,
      };
      PAIOSStorage.saveRefillInventory(refill);

      const doseId = `dose_med_persist_test_${today}_0800`;
      PAIOSStorage.logDoseEvent(doseId, 'TAKEN');

      // Wait for async Dexie background write to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check Dexie table directly
      const dexieDoses = await paiosDb.doseEvents.toArray();
      const dexieDose = dexieDoses.find((d) => d.id === doseId);
      expect(dexieDose).toBeDefined();
      expect(dexieDose?.status).toBe('TAKEN');

      // Clear memory cache and rehydrate from Dexie
      PAIOSStorage.clearMemoryCache();
      const hydrated = await PAIOSStorage.hydrateFromDexie();
      expect(hydrated).toBe(true);

      const rehydratedDoses = PAIOSStorage.getDoseEvents(today);
      const rehydratedDose = rehydratedDoses.find((d) => d.id === doseId);
      expect(rehydratedDose?.status).toBe('TAKEN');
    });
  });
});
