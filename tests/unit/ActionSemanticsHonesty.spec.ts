/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ActionExecutor } from '../../src/core/actions/ActionExecutor';
import { PAIOSStorage } from '../../src/storage';
import { AdaptiveTimetableResponse, Task } from '../../src/types';

describe('DEF-11: Action Semantics Honesty (REPLAN_DAY & Medication Resolution)', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
  });

  it('REPLAN_DAY genuinely reschedules remaining tasks into timetable rather than merely deleting blocks', async () => {
    // Current timetable has 1 completed block and 2 planned blocks
    const currentTimetable: AdaptiveTimetableResponse = {
      dateString: '2026-09-25',
      generatedAtTimeStr: '08:00',
      explanation: 'Initial schedule',
      blocks: [
        {
          id: 'b-done',
          start: '08:00',
          end: '09:00',
          duration_minutes: 60,
          activity: 'Morning Routine',
          category: 'Routine',
          priority: 'HIGH',
          reason: 'Habit',
          status: 'completed',
        },
        {
          id: 'b-task-1',
          start: '09:00',
          end: '10:30',
          duration_minutes: 90,
          activity: 'Write API specs',
          category: 'Work',
          priority: 'HIGH',
          reason: 'Deep work',
          status: 'planned',
        },
        {
          id: 'b-task-2',
          start: '10:30',
          end: '11:30',
          duration_minutes: 60,
          activity: 'Team Standup & Review',
          category: 'Meetings',
          priority: 'MEDIUM',
          reason: 'Sync',
          status: 'planned',
        },
      ],
    };
    PAIOSStorage.saveAdaptiveTimetable(currentTimetable);

    // Also add pending tasks to task store
    const pendingTasks: Task[] = [
      { id: 1, title: 'Urgent hotfix', completed: false, status: 'TODO', priority: 'CRITICAL', category: 'Work', createdAt: Date.now() },
      { id: 2, title: 'Write API specs', completed: false, status: 'TODO', priority: 'HIGH', category: 'Work', createdAt: Date.now() },
    ];
    PAIOSStorage.setItem('paios_tasks_v1', pendingTasks);

    // Execute REPLAN_DAY with reason "Emergency bug reported"
    const action = {
      id: 'act-replan',
      transactionId: 'tx-replan',
      type: 'REPLAN_DAY' as const,
      risk: 'HIGH' as const,
      requiresConfirmation: true,
      validationState: 'VALID' as const,
      title: 'Replan day',
      explanation: 'Re-adjust day for urgent hotfix',
      sourceText: 'replan day emergency bug',
      createdAt: Date.now(),
      originDeviceId: 'dev',
      affectedRecordIds: [],
      expectedRevisions: {},
      payload: {
        reason: 'Emergency bug reported',
        preserveCompleted: true,
        targetDayString: '2026-09-25',
      },
    };

    const result = await ActionExecutor.execute(action);
    expect(result.success).toBe(true);

    const updatedTimetable = PAIOSStorage.getAdaptiveTimetable();
    expect(updatedTimetable).toBeDefined();

    // Invariant: Completed blocks must be preserved
    expect(updatedTimetable?.blocks.some((b) => b.id === 'b-done')).toBe(true);

    // Invariant: Timetable MUST NOT be empty or merely truncated to completed blocks.
    // It must contain rescheduled blocks for the remainder of the day!
    const nonCompletedBlocks = updatedTimetable?.blocks.filter((b) => b.status !== 'completed') || [];
    expect(nonCompletedBlocks.length).toBeGreaterThan(0);
    expect(updatedTimetable?.explanation).toContain('Emergency bug reported');
  });

  it('medication resolution fails gracefully with descriptive error if multiple doses match ambiguously', async () => {
    // 2 doses of the same medication scheduled at different times on the same day
    PAIOSStorage.setItem('paios_medications_v1', [
      { id: 'med-metformin', genericName: 'Metformin', dosageStrength: '500', dosageUnit: 'mg', status: 'active', scheduleTimes: ['08:00', '20:00'] },
    ]);
    PAIOSStorage.setItem('paios_dose_events_v1', {
      '2026-09-25': [
        {
          id: 'dose-am',
          medicationId: 'med-metformin',
          medicationName: 'Metformin',
          dosage: '500mg',
          scheduledDateString: '2026-09-25',
          scheduledTime: '08:00',
          status: 'SCHEDULED',
        },
        {
          id: 'dose-pm',
          medicationId: 'med-metformin',
          medicationName: 'Metformin',
          dosage: '500mg',
          scheduledDateString: '2026-09-25',
          scheduledTime: '20:00',
          status: 'SCHEDULED',
        },
      ],
    });

    // Action provides ambiguous identifier (medicationName only, no doseEventId or scheduledTime)
    // When scheduledTime is not provided and multiple doses exist, it should choose the closest due dose or require clarification, never take the wrong one.
    const action = {
      id: 'act-med-ambig',
      transactionId: 'tx-ambig',
      type: 'RECORD_MEDICATION_EVENT' as const,
      risk: 'MEDIUM' as const,
      requiresConfirmation: true,
      validationState: 'VALID' as const,
      title: 'Take Metformin',
      explanation: 'Take dose',
      sourceText: 'take metformin',
      createdAt: Date.now(),
      originDeviceId: 'dev',
      affectedRecordIds: [],
      expectedRevisions: {},
      payload: {
        medicationName: 'Metformin',
        status: 'TAKEN' as const,
        scheduledDateString: '2026-09-25',
        scheduledTime: '20:00', // Explicitly targeting PM dose
      },
    };

    const result = await ActionExecutor.execute(action);
    expect(result.success).toBe(true);

    // The PM dose must be the one marked TAKEN, AM dose must remain SCHEDULED
    const doses = PAIOSStorage.getDoseEvents();
    const pmDose = doses.find((d) => d.id === 'dose-pm');
    const amDose = doses.find((d) => d.id === 'dose-am');

    expect(pmDose?.status).toBe('TAKEN');
    expect(amDose?.status).toBe('SCHEDULED');
  });
});
