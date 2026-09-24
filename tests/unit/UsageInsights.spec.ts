/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUsageInsights, getSevenDayUsageSummary, getUsageInsightEvents, trackUsageInsight } from '../../src/utils/usageInsights';

describe('Private device-local usage insights', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('records nothing without explicit consent', () => {
    trackUsageInsight('CHECK_IN', false);
    expect(getUsageInsightEvents()).toEqual([]);
  });

  it('aggregates meaningful daily-loop actions without storing content', () => {
    trackUsageInsight('CHECK_IN', true);
    trackUsageInsight('FOCUS_STARTED', true);
    trackUsageInsight('REVIEW_COMPLETED', true);

    const events = getUsageInsightEvents();
    expect(events).toHaveLength(3);
    expect(events.every((event) => !('payload' in event))).toBe(true);
    const summary = getSevenDayUsageSummary();
    expect(summary.activeDays).toBe(1);
    expect(summary.completeLoopDays).toBe(1);
  });

  it('deletes the entire local ledger when disabled', () => {
    trackUsageInsight('TASK_COMPLETED', true);
    clearUsageInsights();
    expect(getUsageInsightEvents()).toEqual([]);
  });
});
