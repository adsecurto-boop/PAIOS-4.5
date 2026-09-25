import { describe, expect, it } from 'vitest';
import { getDailyCommandState, getTomorrowNoon, preserveCompletedBlocks } from '../../src/utils/dailyCommandCenter';
import { AdaptiveTimetableResponse, Task } from '../../src/types';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 1, title: 'Ship meaningful work', description: '', priority: 'HIGH', status: 'TODO',
  isPriorityPin: true, category: 'Work', createdAtMillis: 1, ...overrides,
});

describe('daily command center', () => {
  const now = new Date(2026, 8, 25, 14, 30);

  it('finds drift and the next actionable block without changing completed work', () => {
    const timetable: AdaptiveTimetableResponse = {
      dateString: '2026-09-25', generatedAtTimeStr: '09:00', explanation: 'Calm plan', blocks: [
        { id: 'past', start: '10:00', end: '10:30', duration_minutes: 30, activity: 'Missed', category: 'Work', priority: 'HIGH', status: 'planned' },
        { id: 'done', start: '11:00', end: '11:30', duration_minutes: 30, activity: 'Done', category: 'Work', priority: 'HIGH', status: 'completed' },
        { id: 'next', start: '15:00', end: '15:30', duration_minutes: 30, activity: 'Next', category: 'Study', priority: 'HIGH', status: 'planned' },
      ],
    };
    const state = getDailyCommandState(timetable, [task()], now);
    expect(state.isDrifting).toBe(true);
    expect(state.missedBlocks.map((block) => block.id)).toEqual(['past']);
    expect(state.nextBlock?.id).toBe('next');
    expect(state.nowBlock?.id).toBe('next');
    expect(state.nextBlocks).toEqual([]);
  });

  it('offers only open priority or due tasks for confirmed rollover', () => {
    const state = getDailyCommandState(null, [
      task(),
      task({ id: 2, isPriorityPin: false, dueDateMillis: now.getTime() }),
      task({ id: 3, isPriorityPin: false, dueDateMillis: null }),
      task({ id: 4, status: 'COMPLETED' }),
    ], now);
    expect(state.rolloverTasks.map((item) => item.id)).toEqual([1, 2]);
  });

  it('uses local tomorrow at noon to avoid timezone date rollover errors', () => {
    const tomorrow = new Date(getTomorrowNoon(now));
    expect(tomorrow.getDate()).toBe(26);
    expect(tomorrow.getHours()).toBe(12);
  });

  it('preserves completed work when the remaining day is replanned', () => {
    const completed = { id: 'done', start: '09:00', end: '09:30', duration_minutes: 30, activity: 'Done', category: 'Work', priority: 'HIGH' as const, status: 'completed' as const };
    const current: AdaptiveTimetableResponse = { dateString: '2026-09-25', generatedAtTimeStr: '08:00', explanation: 'Old', blocks: [completed] };
    const generated: AdaptiveTimetableResponse = { dateString: '2026-09-25', generatedAtTimeStr: '14:30', explanation: 'Replanned', blocks: [
      { id: 'next', start: '15:00', end: '15:30', duration_minutes: 30, activity: 'Next', category: 'Study', priority: 'HIGH', status: 'planned' },
    ] };
    expect(preserveCompletedBlocks(current, generated).blocks.map((block) => block.id)).toEqual(['done', 'next']);
  });
});
