import { CaptureDestination } from '../types';

export interface CaptureSuggestion {
  type: CaptureDestination;
  label: string;
  reason: string;
  amount?: number;
}

export const classifyCapture = (text: string): CaptureSuggestion => {
  const normalized = text.trim().toLowerCase();
  const amountMatch = text.match(/(?:₹|rs\.?|inr|\$)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined;

  if (amount && /spent|paid|bought|purchase|expense|grocer|food|fuel|bill/.test(normalized)) {
    return { type: 'EXPENSE', label: 'Expense', reason: 'Contains spending language and an amount', amount };
  }
  if (/dizzy|symptom|pain|headache|nausea|fever|blood pressure|bp |heart rate|medicine|medication/.test(normalized)) {
    return { type: 'HEALTH', label: 'Health log', reason: 'Contains a symptom or medication signal' };
  }
  if (/study|revise|revision|flashcard|learn|quiz|exam|chapter/.test(normalized)) {
    return { type: 'STUDY', label: 'Study card', reason: 'Looks like learning material' };
  }
  if (/reflect|journal|felt |grateful|today i|lesson learned/.test(normalized)) {
    return { type: 'JOURNAL', label: 'Journal', reason: 'Looks like a reflection' };
  }
  if (/remind|todo|to-do|need to|must |call |email |send |book |schedule |finish |complete /.test(normalized)) {
    return { type: 'TASK', label: 'Task', reason: 'Contains an actionable commitment' };
  }
  return { type: 'NOTE', label: 'Note', reason: 'Best kept as reference until you decide' };
};

export const tomorrowMorningMillis = (now: Date = new Date()): number => {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.getTime();
};
