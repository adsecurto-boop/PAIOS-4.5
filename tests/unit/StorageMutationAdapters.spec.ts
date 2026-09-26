/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PAIOSStorage } from '../../src/storage';
import { StorageMutationAdapters } from '../../src/core/actions/StorageMutationAdapters';
import { AdaptiveTimetableResponse, DoseEvent, ActivityLog, ExpenseTransaction } from '../../src/types';

describe('DEF-03: Storage Mutation Adapters for Complex Stores & Side-Effects', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
  });

  describe('Timetable Container Adapter (paios_timetable_v1)', () => {
    it('accurately captures snapshot, appends timetable block into container object, and restores snapshot', () => {
      const initialTimetable: AdaptiveTimetableResponse = {
        dateString: '2026-09-25',
        blocks: [
          {
            id: 'block-1',
            start: '09:00',
            end: '10:00',
            duration_minutes: 60,
            activity: 'Morning Deep Work',
            category: 'DeepWork',
            priority: 'HIGH',
            reason: 'Top priority',
            completed: false,
          },
        ],
        generatedAtMillis: Date.now(),
      };
      PAIOSStorage.setItem('paios_timetable_v1', initialTimetable);

      const adapter = StorageMutationAdapters.getAdapter('paios_timetable_v1');
      const snapshot = adapter.captureSnapshot('block-2');

      expect(snapshot.exists).toBe(false);
      expect(snapshot.containerData).toBeDefined();

      // Perform block addition
      const newBlock = {
        id: 'block-2',
        start: '10:30',
        end: '11:30',
        duration_minutes: 60,
        activity: 'Design Review',
        category: 'Meetings',
        priority: 'MEDIUM' as const,
        reason: 'Sync',
        completed: false,
      };

      adapter.applyMutation({ type: 'ADD_BLOCK', block: newBlock });

      // Verify block is in timetable container
      const updated = PAIOSStorage.getItem<AdaptiveTimetableResponse>('paios_timetable_v1', null as any);
      expect(updated?.blocks).toHaveLength(2);
      expect(updated?.blocks[1].id).toBe('block-2');

      // Now restore snapshot (rollback)
      const report = adapter.restoreSnapshot(snapshot);
      expect(report.success).toBe(true);

      const rolledBack = PAIOSStorage.getItem<AdaptiveTimetableResponse>('paios_timetable_v1', null as any);
      expect(rolledBack?.blocks).toHaveLength(1);
      expect(rolledBack?.blocks[0].id).toBe('block-1');
    });
  });

  describe('Date-Bucketed Medication Adapter (paios_dose_events_v1)', () => {
    it('captures dose in date bucket, mutates status, and restores exact date-bucketed map', () => {
      const scheduledDose: DoseEvent = {
        id: 'dose-101',
        medicationId: 'med-aspirin',
        medicationName: 'Aspirin',
        dosage: '81mg',
        scheduledDateString: '2026-09-25',
        scheduledTime: '08:00',
        status: 'SCHEDULED',
      };

      // Set initial dose in storage and active medication
      PAIOSStorage.setItem('paios_medications_v1', [
        { id: 'med-aspirin', genericName: 'Aspirin', dosageStrength: '81', dosageUnit: 'mg', status: 'active', scheduleTimes: ['08:00'] },
      ]);
      PAIOSStorage.setItem('paios_dose_events_v1', { '2026-09-25': [scheduledDose] });

      const adapter = StorageMutationAdapters.getAdapter('paios_dose_events_v1');
      const snapshot = adapter.captureSnapshot('dose-101');
      expect(snapshot.exists).toBe(true);
      expect((snapshot.data as DoseEvent).status).toBe('SCHEDULED');

      // Apply mutation to mark taken
      const takenDose: DoseEvent = {
        ...scheduledDose,
        status: 'TAKEN',
        actualTakenTimeMillis: Date.now(),
        note: 'Taken on time',
      };
      adapter.applyMutation({ type: 'UPDATE_DOSE', dose: takenDose });

      // Verify storage reflects taken dose
      const events = PAIOSStorage.getDoseEvents('2026-09-25');
      const updatedDose = events.find((d) => d.id === 'dose-101');
      expect(updatedDose?.status).toBe('TAKEN');
      expect(updatedDose?.actualTakenTimeMillis).toBeDefined();

      // Roll back
      const report = adapter.restoreSnapshot(snapshot);
      expect(report.success).toBe(true);

      // Verify restored to SCHEDULED
      const restoredEvents = PAIOSStorage.getDoseEvents('2026-09-25');
      const restoredDose = restoredEvents.find((d) => d.id === 'dose-101');
      expect(restoredDose?.status).toBe('SCHEDULED');
      expect(restoredDose?.actualTakenTimeMillis).toBeUndefined();
    });
  });

  describe('Scalar Active Activity Adapter (paios_active_activity_v1)', () => {
    it('captures scalar active activity, finishes it, and restores prior active session on rollback', () => {
      const activeSession: ActivityLog = {
        id: 777,
        name: 'Deep Coding',
        category: 'Work',
        startTimeMillis: Date.now() - 1800000,
        endTimeMillis: null,
        durationMinutes: 30,
        completed: false,
      };

      PAIOSStorage.setItem('paios_active_activity_v1', activeSession);

      const adapter = StorageMutationAdapters.getAdapter('paios_active_activity_v1');
      const snapshot = adapter.captureSnapshot('777');
      expect(snapshot.exists).toBe(true);
      expect((snapshot.data as ActivityLog).name).toBe('Deep Coding');

      // Mutate: finish session
      adapter.applyMutation({ type: 'CLEAR_ACTIVE' });
      expect(PAIOSStorage.getItem('paios_active_activity_v1', null)).toBeNull();

      // Restore:
      const report = adapter.restoreSnapshot(snapshot);
      expect(report.success).toBe(true);
      const restored = PAIOSStorage.getItem<ActivityLog>('paios_active_activity_v1', null as any);
      expect(restored?.id).toBe(777);
      expect(restored?.name).toBe('Deep Coding');
    });
  });

  describe('Financial Coordinated Mutation Adapter (Expenses & Side-Effects)', () => {
    it('captures expense and related surplus states, appends expense, and restores all stores atomically', () => {
      // Set initial surplus
      const initialSurplus = [{ dateString: '2026-09-25', allocatedBudget: 1000, actualSpent: 200, surplus: 800 }];
      PAIOSStorage.setItem('paios_daily_surplus_v1', initialSurplus);
      PAIOSStorage.setItem('paios_expenses_v1', []);

      const expAdapter = StorageMutationAdapters.getAdapter('paios_expenses_v1');
      const surplusAdapter = StorageMutationAdapters.getAdapter('paios_daily_surplus_v1');

      const expSnap = expAdapter.captureSnapshot('exp-999');
      const surplusSnap = surplusAdapter.captureSnapshot('2026-09-25');

      const expense: ExpenseTransaction = {
        id: 'exp-999',
        amount: 300,
        title: 'Team Lunch',
        category: 'Food',
        dateString: '2026-09-25',
        timeString: '13:00',
        createdAtMillis: Date.now(),
      };

      expAdapter.applyMutation({ type: 'ADD_EXPENSE', expense });
      surplusAdapter.applyMutation({ type: 'RECORD_SPEND', dateString: '2026-09-25', amount: 300 });

      // Verify both updated
      const expenses = PAIOSStorage.getItem<ExpenseTransaction[]>('paios_expenses_v1', []);
      expect(expenses).toHaveLength(1);
      const surplus = PAIOSStorage.getItem<any[]>('paios_daily_surplus_v1', []);
      expect(surplus[0].actualSpent).toBe(500);

      // Rollback both
      expAdapter.restoreSnapshot(expSnap);
      surplusAdapter.restoreSnapshot(surplusSnap);

      // Verify both restored
      expect(PAIOSStorage.getItem<ExpenseTransaction[]>('paios_expenses_v1', [])).toHaveLength(0);
      expect(PAIOSStorage.getItem<any[]>('paios_daily_surplus_v1', [])[0].actualSpent).toBe(200);
    });
  });
});
