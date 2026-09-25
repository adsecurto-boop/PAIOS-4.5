import { ActivityLog, EveningReview, MorningCheckIn, Task } from '../types';

export const getWeekStart = (date: Date = new Date()): Date => {
  const start = new Date(date);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const buildWeeklySummary = (
  tasks: Task[],
  activities: ActivityLog[],
  checkIns: MorningCheckIn[],
  reviews: EveningReview[],
  now: Date = new Date(),
) => {
  const weekStart = getWeekStart(now);
  const startMillis = weekStart.getTime();
  const endMillis = startMillis + 7 * 86400000;
  const weekStartDateString = toLocalDateString(weekStart);
  const dateStrings = new Set<string>();
  checkIns.forEach((item) => { if (item.dateString >= weekStartDateString) dateStrings.add(item.dateString); });
  reviews.forEach((item) => { if (item.dateString >= weekStartDateString) dateStrings.add(item.dateString); });

  return {
    weekStartDateString,
    completedTasks: tasks.filter((task) => task.status === 'COMPLETED' && task.completedAtMillis && task.completedAtMillis >= startMillis && task.completedAtMillis < endMillis).length,
    focusMinutes: Math.round(activities.filter((activity) => activity.startTimeMillis >= startMillis && activity.startTimeMillis < endMillis).reduce((sum, activity) => sum + (activity.durationSeconds || 0), 0) / 60),
    rhythmDays: dateStrings.size,
  };
};
