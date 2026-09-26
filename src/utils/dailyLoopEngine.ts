import { EveningReview, MorningCheckIn, Task } from '../types';

export type DailyLoopPhase = 'MORNING' | 'ACTIVE' | 'RESET' | 'EVENING' | 'CLOSED';

export interface DailyLoopState {
  phase: DailyLoopPhase;
  progress: number;
  streak: number;
  headline: string;
  guidance: string;
  primaryAction: 'CHECK_IN' | 'START_FOCUS' | 'RESET_DAY' | 'REVIEW' | 'NONE';
  bigThree: string[];
}

const localDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getRhythmStreak = (
  checkIns: MorningCheckIn[],
  reviews: EveningReview[],
  now: Date,
): number => {
  const completedDates = new Set([
    ...checkIns.map((item) => item.dateString),
    ...reviews.map((item) => item.dateString),
  ]);
  let cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);

  // A user should not lose yesterday's streak before having a chance to act today.
  if (!completedDates.has(localDateString(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (completedDates.has(localDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

interface DailyLoopInput {
  checkIns: MorningCheckIn[];
  reviews: EveningReview[];
  tasks: Task[];
  hasFocusedToday: boolean;
  isPlanDrifting: boolean;
  now?: Date;
}

export const getDailyLoopState = ({
  checkIns,
  reviews,
  tasks,
  hasFocusedToday,
  isPlanDrifting,
  now = new Date(),
}: DailyLoopInput): DailyLoopState => {
  const dateString = localDateString(now);
  const checkIn = checkIns.find((item) => item.dateString === dateString);
  const review = reviews.find((item) => item.dateString === dateString);
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED').length;
  const hasMeaningfulProgress = hasFocusedToday || completedTasks > 0;
  const hour = now.getHours();

  const bigThree = checkIn
    ? [checkIn.priority1, checkIn.priority2, checkIn.priority3].map((item) => item.trim()).filter(Boolean).slice(0, 3)
    : tasks.filter((task) => task.isPriorityPin && task.status !== 'CANCELLED').slice(0, 3).map((task) => task.title);

  let phase: DailyLoopPhase;
  let headline: string;
  let guidance: string;
  let primaryAction: DailyLoopState['primaryAction'];

  if (review) {
    phase = 'CLOSED';
    headline = 'Today is closed';
    guidance = 'Your work and reflection are safely recorded. Tomorrow can start with a clean slate.';
    primaryAction = 'NONE';
  } else if (!checkIn && hour < 12) {
    phase = 'MORNING';
    headline = 'Choose what makes today worthwhile';
    guidance = 'Set one intention and no more than three meaningful outcomes.';
    primaryAction = 'CHECK_IN';
  } else if (hour >= 17) {
    phase = 'EVENING';
    headline = 'Close the loop';
    guidance = hasMeaningfulProgress
      ? 'Capture what worked, release unfinished work, and choose tomorrow’s first step.'
      : 'Even a difficult day deserves a clean ending. Record what happened without judgement.';
    primaryAction = 'REVIEW';
  } else if (hour >= 12 && (!hasMeaningfulProgress || isPlanDrifting)) {
    phase = 'RESET';
    headline = 'Reset the day, don’t abandon it';
    guidance = 'Keep one essential outcome and rebuild the remaining time around reality.';
    primaryAction = 'RESET_DAY';
  } else {
    phase = 'ACTIVE';
    headline = hasMeaningfulProgress ? 'Continue where you left off' : 'Begin the first meaningful block';
    guidance = 'Protect one focused block. Everything else can wait until it is complete.';
    primaryAction = 'START_FOCUS';
  }

  const completedSteps = Number(Boolean(checkIn)) + Number(hasMeaningfulProgress) + Number(Boolean(review));
  return {
    phase,
    progress: Math.round((completedSteps / 3) * 100),
    streak: getRhythmStreak(checkIns, reviews, now),
    headline,
    guidance,
    primaryAction,
    bigThree,
  };
};
