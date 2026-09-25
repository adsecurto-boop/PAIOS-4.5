import { describe, expect, it } from 'vitest';
import { classifyCapture, tomorrowMorningMillis } from '../../src/utils/captureClassifier';

describe('unified inbox capture classifier', () => {
  it('extracts an expense amount without sending private text to a service', () => {
    expect(classifyCapture('Spent ₹450 on groceries')).toMatchObject({ type: 'EXPENSE', amount: 450 });
  });

  it('routes actionable, health, and study language to useful destinations', () => {
    expect(classifyCapture('Remind me to call the doctor tomorrow').type).toBe('TASK');
    expect(classifyCapture('Felt dizzy after my evening medication').type).toBe('HEALTH');
    expect(classifyCapture('Need to send the report').type).toBe('TASK');
    expect(classifyCapture('Revise Playwright chapter 3').type).toBe('STUDY');
  });

  it('defers to tomorrow at a predictable local time', () => {
    const value = new Date(tomorrowMorningMillis(new Date(2026, 8, 25, 18, 0)));
    expect(value.getDate()).toBe(26);
    expect(value.getHours()).toBe(9);
  });
});
