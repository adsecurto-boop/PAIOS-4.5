import { Appointment, DoseEvent, JournalEntry, QuickCapture, Task, TimelineEntry, VitalSign } from '../types';

export type LifeTimelineKind = 'WORK' | 'HEALTH' | 'REFLECTION' | 'CAPTURE' | 'APPOINTMENT';
export interface LifeTimelineItem { id: string; title: string; detail?: string; timestampMillis: number; kind: LifeTimelineKind; source: string; }
interface Input { timelineEntries: TimelineEntry[]; tasks: Task[]; captures: QuickCapture[]; journalEntries: JournalEntry[]; doseEvents: DoseEvent[]; vitalSigns: VitalSign[]; appointments: Appointment[]; }

const doseTime = (dose: DoseEvent): number => dose.actualTakenTimeMillis || new Date(`${dose.scheduledDateString}T${dose.scheduledTime || '12:00'}:00`).getTime();
export const buildLifeTimeline = (input: Input): LifeTimelineItem[] => {
  const items: LifeTimelineItem[] = [
    ...input.timelineEntries.map((entry) => ({ id: `timeline:${entry.id}`, title: entry.title, detail: entry.note || (entry.durationMinutes != null ? `${entry.durationMinutes} minutes` : undefined), timestampMillis: entry.timestampMillis, kind: entry.type === 'DOSE' || entry.type === 'VITAL' || entry.type === 'HEALTH' ? 'HEALTH' as const : entry.type === 'JOURNAL' || entry.type === 'CHECKIN' ? 'REFLECTION' as const : entry.type === 'CAPTURE' ? 'CAPTURE' as const : entry.type === 'APPOINTMENT' ? 'APPOINTMENT' as const : 'WORK' as const, source: 'Activity ledger' })),
    ...input.tasks.filter((task) => task.completedAtMillis).map((task) => ({ id: `task:${task.id}`, title: task.title, detail: 'Completed task', timestampMillis: task.completedAtMillis!, kind: 'WORK' as const, source: 'Tasks' })),
    ...input.captures.map((capture) => ({ id: `capture:${capture.id}`, title: capture.text, detail: capture.inboxStatus === 'PROCESSED' ? `Filed as ${capture.processedType?.toLowerCase() || 'item'}` : 'Inbox capture', timestampMillis: capture.createdAtMillis, kind: 'CAPTURE' as const, source: 'Capture inbox' })),
    ...input.journalEntries.map((entry) => ({ id: `journal:${entry.id}`, title: entry.title, detail: entry.content.slice(0, 120), timestampMillis: entry.createdAtMillis, kind: 'REFLECTION' as const, source: 'Journal' })),
    ...input.doseEvents.filter((dose) => dose.status !== 'SCHEDULED').map((dose) => ({ id: `dose:${dose.id}`, title: `${dose.medicationName} · ${dose.status.toLowerCase().replace('_', ' ')}`, detail: dose.dosage, timestampMillis: doseTime(dose), kind: 'HEALTH' as const, source: 'Medication ledger' })),
    ...input.vitalSigns.map((vital) => ({ id: `vital:${vital.id}`, title: 'Vital signs recorded', detail: [vital.systolicBp && vital.diastolicBp ? `${vital.systolicBp}/${vital.diastolicBp} BP` : '', vital.restingHeartRate ? `${vital.restingHeartRate} bpm` : '', vital.weightKg ? `${vital.weightKg} kg` : ''].filter(Boolean).join(' · '), timestampMillis: vital.timestampMillis, kind: 'HEALTH' as const, source: 'Health' })),
    ...input.appointments.map((appointment) => ({ id: `appointment:${appointment.id}`, title: `${appointment.doctorName}: ${appointment.reason}`, detail: appointment.status.toLowerCase(), timestampMillis: appointment.scheduledTimeMillis, kind: 'APPOINTMENT' as const, source: 'Appointments' })),
  ];
  const unique = new Map<string, LifeTimelineItem>();
  for (const item of items) unique.set(item.id, item);
  return [...unique.values()].filter((item) => Number.isFinite(item.timestampMillis)).sort((a, b) => b.timestampMillis - a.timestampMillis);
};
