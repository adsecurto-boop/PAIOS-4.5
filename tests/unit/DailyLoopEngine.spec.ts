import { describe, expect, it } from 'vitest';
import { getDailyLoopState } from '../../src/utils/dailyLoopEngine';
import { EveningReview, MorningCheckIn } from '../../src/types';

const checkIn = (dateString: string): MorningCheckIn => ({
  dateString,
  sleepHours: 7,
  sleepQuality: 7,
  energy: 7,
  mood: 7,
  mainGoal: 'Ship the release',
  priority1: 'Finish QA',
  priority2: 'Write notes',
  priority3: '',
  createdAtMillis: 1,
});

const review = (dateString: string): EveningReview => ({
  dateString,
  activeTimeFormatted: '1h',
  workTimeFormatted: '1h',
  studyTimeFormatted: '0m',
  tasksCompletedText: '1',
  wentWell: 'Focused',
  didntGoWell: '',
  learnedText: '',
  doDifferently: '',
  rating: 8,
  createdAtMillis: 1,
});

describe('daily loop engine', () => {
  it('starts with an intentional morning action', () => {
    const state = getDailyLoopState({ checkIns: [], reviews: [], tasks: [], hasFocusedToday: false, isPlanDrifting: false, now: new Date(2026, 8, 26, 8) });
    expect(state.phase).toBe('MORNING');
    expect(state.primaryAction).toBe('CHECK_IN');
  });

  it('offers a midday reset when meaningful progress has not started', () => {
    const state = getDailyLoopState({ checkIns: [checkIn('2026-09-26')], reviews: [], tasks: [], hasFocusedToday: false, isPlanDrifting: false, now: new Date(2026, 8, 26, 14) });
    expect(state.phase).toBe('RESET');
    expect(state.primaryAction).toBe('RESET_DAY');
    expect(state.bigThree).toEqual(['Finish QA', 'Write notes']);
  });

  it('closes the day after reflection', () => {
    const state = getDailyLoopState({ checkIns: [checkIn('2026-09-26')], reviews: [review('2026-09-26')], tasks: [], hasFocusedToday: true, isPlanDrifting: false, now: new Date(2026, 8, 26, 20) });
    expect(state.phase).toBe('CLOSED');
    expect(state.progress).toBe(100);
    expect(state.primaryAction).toBe('NONE');
  });

  it('preserves yesterday streak before the user has acted today', () => {
    const state = getDailyLoopState({ checkIns: [checkIn('2026-09-25'), checkIn('2026-09-24')], reviews: [], tasks: [], hasFocusedToday: false, isPlanDrifting: false, now: new Date(2026, 8, 26, 8) });
    expect(state.streak).toBe(2);
  });
});
