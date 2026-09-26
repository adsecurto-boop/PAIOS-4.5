import { describe, expect, it } from 'vitest';
import { buildLifeTimeline } from '../../src/utils/lifeTimeline';
describe('life timeline', () => {
  it('combines records from separate areas and sorts newest first', () => {
    const items = buildLifeTimeline({ timelineEntries: [{ id: 1, title: 'Focus', category: 'Work', timestampMillis: 10, type: 'ACTIVITY' }], tasks: [], captures: [{ id: 2, text: 'Remember this', category: 'Other', tags: '', createdAtMillis: 30 }], journalEntries: [{ id: 3, title: 'Reflection', content: 'Good day', tags: '', createdAtMillis: 20, updatedAtMillis: 20 }], doseEvents: [], vitalSigns: [], appointments: [] });
    expect(items.map((item) => item.title)).toEqual(['Remember this', 'Reflection', 'Focus']);
    expect(items.map((item) => item.source)).toEqual(['Capture inbox', 'Journal', 'Activity ledger']);
  });
  it('includes only medication events that have a recorded outcome', () => {
    const base = { medicationId: 'm', medicationName: 'Medicine', dosage: '5 mg', scheduledTime: '08:00', scheduledDateString: '2026-09-26', note: null };
    const items = buildLifeTimeline({ timelineEntries: [], tasks: [], captures: [], journalEntries: [], doseEvents: [{ ...base, id: '1', status: 'SCHEDULED' }, { ...base, id: '2', status: 'TAKEN', actualTakenTimeMillis: 100 }], vitalSigns: [], appointments: [] });
    expect(items).toHaveLength(1); expect(items[0].source).toBe('Medication ledger');
  });
});
