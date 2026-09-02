/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PAIOSStorage } from '../../src/storage';
import { Medication, RefillInventory, DoctorContact, Appointment } from '../../src/types';

describe('Unit Test: Health & Medication Regimen Engine', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
  });

  it('saves and retrieves active medications', () => {
    const med: Medication = {
      id: 'med_test_1',
      genericName: 'Sertraline',
      brandName: 'Zoloft',
      dosageStrength: 50,
      dosageUnit: 'mg',
      form: 'tablet',
      route: 'oral',
      status: 'active',
      instructions: 'Take 1 tablet in morning',
      scheduleTimes: ['08:00'],
      foodRelation: 'with_meals',
      createdAtMillis: Date.now(),
    };

    PAIOSStorage.saveMedication(med);
    const retrieved = PAIOSStorage.getMedications();

    expect(retrieved.some((m) => m.id === 'med_test_1')).toBe(true);
  });

  it('logs dose events and updates refill stock count', () => {
    const refill: RefillInventory = {
      id: 'refill_test_1',
      medicationId: 'med_test_1',
      medicationName: 'Sertraline 50 mg',
      quantityRemaining: 10,
      unit: 'tablets',
      dailyBurnRate: 1,
      minimumThresholdDays: 5,
    };

    PAIOSStorage.saveRefillInventory(refill);
    const updated = PAIOSStorage.updateRefillQuantity('med_test_1', -1);

    expect(updated).not.toBeNull();
    expect(updated!.quantityRemaining).toBe(9);
  });

  it('deletes medication from storage', () => {
    const med: Medication = {
      id: 'med_del_1',
      genericName: 'Propranolol',
      brandName: 'Inderal',
      dosageStrength: 40,
      dosageUnit: 'mg',
      form: 'tablet',
      route: 'oral',
      status: 'active',
      instructions: 'Take as needed',
      scheduleTimes: ['08:00'],
      createdAtMillis: Date.now(),
    };

    PAIOSStorage.saveMedication(med);
    PAIOSStorage.deleteMedication('med_del_1');

    expect(PAIOSStorage.getMedications().some((m) => m.id === 'med_del_1')).toBe(false);
  });

  it('saves doctor contact information', () => {
    const doc: DoctorContact = {
      id: 'doc_test_1',
      name: 'Dr. Devendra Ratnani',
      specialty: 'Neuropsychiatry',
      clinicName: 'Ratnani Mind Care',
      phone: '+91 98260 12345',
    };

    PAIOSStorage.saveDoctor(doc);
    const doctors = PAIOSStorage.getDoctors();
    expect(doctors.some((d) => d.id === 'doc_test_1')).toBe(true);
  });

  it('books and updates scheduled medical appointments', () => {
    const apt = PAIOSStorage.bookAppointment({
      doctorId: 'doc_1',
      doctorName: 'Dr. Devendra Ratnani',
      scheduledTimeMillis: Date.now() + 86400000,
      scheduledDateString: '2026-08-30',
      scheduledTimeString: '10:00',
      reason: 'Medication Review',
      status: 'SCHEDULED',
    });

    expect(apt.id).toContain('apt_');

    PAIOSStorage.updateAppointmentStatus(apt.id, 'COMPLETED');
    const appointments = PAIOSStorage.getAppointments();
    const updated = appointments.find((a) => a.id === apt.id);
    expect(updated!.status).toBe('COMPLETED');
  });

  it('handles appointment cancellation status transition', () => {
    const apt = PAIOSStorage.bookAppointment({
      doctorId: 'doc_2',
      doctorName: 'Dr. Vance',
      scheduledTimeMillis: Date.now() + 86400000 * 2,
      scheduledDateString: '2026-08-31',
      scheduledTimeString: '11:00',
      reason: 'Checkup',
      status: 'SCHEDULED',
    });

    PAIOSStorage.updateAppointmentStatus(apt.id, 'CANCELLED');
    const updated = PAIOSStorage.getAppointments().find((a) => a.id === apt.id);
    expect(updated!.status).toBe('CANCELLED');
  });

  it('deletes doctor contact from storage', () => {
    const doc: DoctorContact = {
      id: 'doc_del',
      name: 'Dr Delete',
      specialty: 'General',
    };
    PAIOSStorage.saveDoctor(doc);
    PAIOSStorage.deleteDoctor('doc_del');
    expect(PAIOSStorage.getDoctors().some((d) => d.id === 'doc_del')).toBe(false);
  });

  it('logs vital signs telemetry into health history', () => {
    const vital = PAIOSStorage.logVitalSign({
      systolicBp: 120,
      diastolicBp: 80,
      restingHeartRate: 72,
      symptoms: 'Normal baseline check',
    });

    expect(vital.id).toContain('vital_');
    expect(PAIOSStorage.getVitalSigns().length).toBeGreaterThanOrEqual(1);
  });

  it('synchronizes medication schedule times and auto-recalculates burn rate when editing refill timing slots (BUG-01)', () => {
    // 1. Create medication with initial Morning schedule
    const med: Medication = {
      id: 'med_sync_1',
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

    // 2. Create initial Refill Vault item
    const refill: RefillInventory = {
      id: 'refill_sync_1',
      medicationId: 'med_sync_1',
      medicationName: 'Sertraline HCl 50 mg',
      quantityRemaining: 30,
      unit: 'tablets',
      dailyBurnRate: 1,
      minimumThresholdDays: 7,
      timingSlots: ['Morning'],
      dosesPerDay: 1,
    };
    PAIOSStorage.saveRefillInventory(refill);

    // Verify initial state
    let savedMed = PAIOSStorage.getMedications().find((m) => m.id === 'med_sync_1');
    expect(savedMed?.scheduleTimes).toEqual(['08:00']);

    // 3. User edits Refill Vault timing from Morning -> Morning + Night
    const updatedRefill: RefillInventory = {
      ...refill,
      timingSlots: ['Morning', 'Night'],
      dosesPerDay: 2,
    };
    PAIOSStorage.saveRefillInventory(updatedRefill);

    // 4. Assert Refill Vault dailyBurnRate auto-recalculated
    const retrievedRefill = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_sync_1');
    expect(retrievedRefill?.dailyBurnRate).toBe(2);
    expect(retrievedRefill?.timingSlots).toEqual(['Morning', 'Night']);

    // 5. Assert Active Prescriptions medication scheduleTimes updated to ['08:00', '21:00']
    savedMed = PAIOSStorage.getMedications().find((m) => m.id === 'med_sync_1');
    expect(savedMed?.scheduleTimes).toEqual(['08:00', '21:00']);

    // 6. Assert Today's Schedule Ledger dose events updated
    const todayDoses = PAIOSStorage.getDoseEvents();
    const medDoses = todayDoses.filter((d) => d.medicationId === 'med_sync_1');
    expect(medDoses.map((d) => d.scheduledTime)).toEqual(expect.arrayContaining(['08:00', '21:00']));
  });

  it('synchronizes refill inventory slots and burn rate when saving medication schedule (BUG-01)', () => {
    const refill: RefillInventory = {
      id: 'refill_sync_2',
      medicationId: 'med_sync_2',
      medicationName: 'Propranolol 40 mg',
      quantityRemaining: 60,
      unit: 'capsules',
      dailyBurnRate: 1,
      minimumThresholdDays: 7,
      timingSlots: ['Morning'],
      dosesPerDay: 1,
    };
    PAIOSStorage.saveRefillInventory(refill);

    const med: Medication = {
      id: 'med_sync_2',
      genericName: 'Propranolol',
      brandName: 'Inderal',
      dosageStrength: 40,
      dosageUnit: 'mg',
      form: 'capsule',
      route: 'oral',
      status: 'active',
      instructions: 'Take 1 capsule morning and night',
      scheduleTimes: ['08:00', '21:00'],
      createdAtMillis: Date.now(),
    };
    PAIOSStorage.saveMedication(med);

    const updatedRefill = PAIOSStorage.getRefillInventories().find((r) => r.id === 'refill_sync_2');
    expect(updatedRefill?.timingSlots).toEqual(['Morning', 'Night']);
    expect(updatedRefill?.dailyBurnRate).toBe(2);
  });
});
