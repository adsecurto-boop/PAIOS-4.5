import { describe, expect, it } from 'vitest';
import { buildWeeklySummary, getWeekStart, toLocalDateString } from '../../src/utils/weeklyReview';
import { ActivityLog, Task } from '../../src/types';

describe('weekly reset summary', () => {
  const now = new Date(2026, 8, 25, 12, 0); // Friday
  const monday = new Date(2026, 8, 21, 9, 0);

  it('uses Monday as the stable local week boundary', () => {
    expect(toLocalDateString(getWeekStart(now))).toBe('2026-09-21');
  });

  it('summarizes only work completed in the current week', () => {
    const tasks: Task[] = [
      { id: 1, title: 'Done', description: '', priority: 'HIGH', status: 'COMPLETED', isPriorityPin: true, category: 'Work', createdAtMillis: monday.getTime(), completedAtMillis: monday.getTime() },
      { id: 2, title: 'Old', description: '', priority: 'NORMAL', status: 'COMPLETED', isPriorityPin: false, category: 'Work', createdAtMillis: 1, completedAtMillis: 1 },
    ];
    const activities: ActivityLog[] = [{ id: 1, activityName: 'Focus', category: 'Work', startTimeMillis: monday.getTime(), durationSeconds: 3600, isRunning: false, isPaused: false, accumulatedPausedDurationSeconds: 0 }];
    const summary = buildWeeklySummary(tasks, activities, [
      { dateString: '2026-09-21', sleepHours: 7, sleepQuality: 7, energy: 7, mood: 7, mainGoal: '', priority1: '', priority2: '', priority3: '', createdAtMillis: monday.getTime() },
    ], [
      { dateString: '2026-09-21', activeTimeFormatted: '', workTimeFormatted: '', studyTimeFormatted: '', tasksCompletedText: '', wentWell: '', didntGoWell: '', learnedText: '', doDifferently: '', rating: 7, createdAtMillis: monday.getTime() },
    ], now);
    expect(summary).toMatchObject({ completedTasks: 1, focusMinutes: 60, rhythmDays: 1, weekStartDateString: '2026-09-21' });
  });
});
