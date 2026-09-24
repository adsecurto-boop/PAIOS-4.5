export type UsageInsightEventType = 'CHECK_IN' | 'FOCUS_STARTED' | 'REVIEW_COMPLETED' | 'TASK_COMPLETED';

export interface UsageInsightEvent {
  id: string;
  type: UsageInsightEventType;
  timestampMillis: number;
  dateString: string;
}

const STORAGE_KEY = 'paios_usage_insights_v1';

function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getUsageInsightEvents(): UsageInsightEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function trackUsageInsight(type: UsageInsightEventType, enabled: boolean): void {
  if (!enabled || typeof localStorage === 'undefined') return;
  const now = new Date();
  const event: UsageInsightEvent = {
    id: `${type}_${now.getTime()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestampMillis: now.getTime(),
    dateString: localDateString(now),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([event, ...getUsageInsightEvents()].slice(0, 500)));
  window.dispatchEvent(new Event('paios_usage_insights_change'));
}

export function clearUsageInsights(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('paios_usage_insights_change'));
}

export function getSevenDayUsageSummary() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return { dateString: localDateString(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }) };
  });
  const events = getUsageInsightEvents();
  const rows = days.map((day) => {
    const types = new Set(events.filter((event) => event.dateString === day.dateString).map((event) => event.type));
    const completedSteps = Number(types.has('CHECK_IN')) + Number(types.has('FOCUS_STARTED') || types.has('TASK_COMPLETED')) + Number(types.has('REVIEW_COMPLETED'));
    return { ...day, completedSteps };
  });
  return {
    days: rows,
    activeDays: rows.filter((day) => day.completedSteps > 0).length,
    completeLoopDays: rows.filter((day) => day.completedSteps === 3).length,
    totalEvents: events.filter((event) => rows.some((day) => day.dateString === event.dateString)).length,
  };
}
