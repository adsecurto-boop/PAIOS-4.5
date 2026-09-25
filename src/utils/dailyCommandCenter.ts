import { AdaptiveTimetableBlock, AdaptiveTimetableResponse, Task } from '../types';

const OPEN_BLOCK_STATUSES = new Set(['planned', 'delayed', 'rescheduled']);

const minutesFromTime = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

export interface DailyCommandState {
  hasTodayPlan: boolean;
  nextBlock: AdaptiveTimetableBlock | null;
  nowBlock: AdaptiveTimetableBlock | null;
  nextBlocks: AdaptiveTimetableBlock[];
  laterBlocks: AdaptiveTimetableBlock[];
  missedBlocks: AdaptiveTimetableBlock[];
  isDrifting: boolean;
  openTasks: Task[];
  rolloverTasks: Task[];
}

export const getDailyCommandState = (
  timetable: AdaptiveTimetableResponse | null,
  tasks: Task[],
  now: Date = new Date(),
): DailyCommandState => {
  const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const hasTodayPlan = timetable?.dateString === dateString && Boolean(timetable.blocks.length);
  const openBlocks = hasTodayPlan
    ? timetable!.blocks.filter((block) => OPEN_BLOCK_STATUSES.has(block.status))
    : [];
  const missedBlocks = openBlocks.filter((block) => minutesFromTime(block.end) < currentMinutes);
  const nextBlock = openBlocks
    .filter((block) => minutesFromTime(block.end) >= currentMinutes)
    .sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start))[0] || null;
  const orderedRemaining = openBlocks
    .filter((block) => minutesFromTime(block.end) >= currentMinutes)
    .sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start));
  const inProgress = timetable?.blocks.find((block) => block.status === 'in_progress') || null;
  const happeningNow = orderedRemaining.find((block) =>
    minutesFromTime(block.start) <= currentMinutes && minutesFromTime(block.end) > currentMinutes
  ) || null;
  const nowBlock = inProgress || happeningNow || orderedRemaining[0] || null;
  const afterNow = nowBlock ? orderedRemaining.filter((block) => block.id !== nowBlock.id) : orderedRemaining;
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const rolloverTasks = openTasks.filter((task) =>
    task.isPriorityPin || (task.dueDateMillis != null && task.dueDateMillis <= endOfToday.getTime())
  );

  return {
    hasTodayPlan,
    nextBlock,
    nowBlock,
    nextBlocks: afterNow.slice(0, 2),
    laterBlocks: afterNow.slice(2),
    missedBlocks,
    isDrifting: missedBlocks.length > 0,
    openTasks,
    rolloverTasks,
  };
};

export const getTomorrowNoon = (now: Date = new Date()): number => {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  return tomorrow.getTime();
};

export const preserveCompletedBlocks = (
  current: AdaptiveTimetableResponse | null,
  generated: AdaptiveTimetableResponse,
): AdaptiveTimetableResponse => {
  if (!current || current.dateString !== generated.dateString) return generated;
  const completed = current.blocks.filter((block) => block.status === 'completed');
  const completedIds = new Set(completed.map((block) => block.id));
  return {
    ...generated,
    blocks: [...completed, ...generated.blocks.filter((block) => !completedIds.has(block.id))],
  };
};
