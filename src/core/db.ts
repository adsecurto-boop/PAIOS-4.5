import Dexie, { type Table } from 'dexie';
import {
  Task,
  Medication,
  DoseEvent,
  RefillInventory,
  ExpenseTransaction,
  TimelineEntry,
  StudyCard,
  JournalEntry,
  MorningCheckIn,
  EveningReview,
  VitalSign,
  DoctorContact,
  Appointment,
  QuickCapture,
  SavingsPot,
  PotAllocationRecord,
} from '../types';

export interface VaultSyncRecord {
  key: string;
  payload: any;
  updatedAt: number;
}

export class PaiosDexieDB extends Dexie {
  tasks!: Table<Task, number>;
  medications!: Table<Medication, string>;
  doseEvents!: Table<DoseEvent, string>;
  refillInventories!: Table<RefillInventory, string>;
  transactions!: Table<ExpenseTransaction, string>;
  timeline!: Table<TimelineEntry, number>;
  studyCards!: Table<StudyCard, number>;
  journal!: Table<JournalEntry, number>;
  checkIns!: Table<MorningCheckIn, string>;
  reviews!: Table<EveningReview, string>;
  vitals!: Table<VitalSign, string>;
  doctors!: Table<DoctorContact, string>;
  appointments!: Table<Appointment, string>;
  captures!: Table<QuickCapture, number>;
  vaultSync!: Table<VaultSyncRecord, string>;
  savingsPots!: Table<SavingsPot, string>;
  potAllocations!: Table<PotAllocationRecord, string>;

  private mutationListeners: Set<() => void> = new Set();

  constructor() {
    super('PaiosLocalDB');

    this.version(1).stores({
      tasks: 'id, category, status, priority, dueDateMillis, isPriorityPin, createdAtMillis',
      medications: 'id, status, genericName, brandName, createdAtMillis',
      doseEvents: 'id, medicationId, scheduledDateString, status, scheduledTime',
      refillInventories: 'id, medicationId, quantityRemaining',
      transactions: 'id, type, category, dateString, timestampMillis',
      timeline: 'id, category, timestampMillis, type',
      studyCards: 'id, topic, confidence, reviewCount',
      journal: 'id, title, tags, createdAtMillis',
      checkIns: 'dateString, createdAtMillis',
      reviews: 'dateString, createdAtMillis',
      vitals: 'id, timestampMillis',
      doctors: 'id, name, specialty',
      appointments: 'id, doctorId, scheduledDateString, status',
      captures: 'id, category, createdAtMillis',
      vaultSync: 'key, updatedAt',
    });

    this.version(2).stores({
      savingsPots: 'id, title, isCompleted, createdAt',
      potAllocations: 'id, potId, date, source, timestamp',
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('paios_storage_change', () => this.notifyMutation());
    }
  }

  public subscribe(callback: () => void): () => void {
    this.mutationListeners.add(callback);
    return () => {
      this.mutationListeners.delete(callback);
    };
  }

  public notifyMutation(): void {
    this.mutationListeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('[PaiosDexieDB] Error in mutation listener:', e);
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('paios_dexie_change'));
    }
  }
}

export const paiosDb = new PaiosDexieDB();

/**
 * Hydrates Dexie tables from localStorage if Dexie tables are empty
 */
export async function migrateLocalStorageToDexie(): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const taskCount = await paiosDb.tasks.count();
    if (taskCount === 0) {
      const rawTasks = localStorage.getItem('paios_tasks_v1');
      if (rawTasks) {
        const tasks: Task[] = JSON.parse(rawTasks);
        if (Array.isArray(tasks) && tasks.length > 0) {
          await paiosDb.tasks.bulkPut(tasks);
        }
      }
    }

    const medCount = await paiosDb.medications.count();
    if (medCount === 0) {
      const rawMeds = localStorage.getItem('paios_medications_v1');
      if (rawMeds) {
        const meds: Medication[] = JSON.parse(rawMeds);
        if (Array.isArray(meds) && meds.length > 0) {
          await paiosDb.medications.bulkPut(meds);
        }
      }
    }

    const doseCount = await paiosDb.doseEvents.count();
    if (doseCount === 0) {
      const rawDoses = localStorage.getItem('paios_dose_events_v1');
      if (rawDoses) {
        try {
          const parsed = JSON.parse(rawDoses);
          const doses: DoseEvent[] = Array.isArray(parsed)
            ? parsed
            : typeof parsed === 'object' && parsed !== null
            ? (Object.values(parsed) as DoseEvent[][]).flat()
            : [];
          if (doses.length > 0) {
            await paiosDb.doseEvents.bulkPut(doses);
          }
        } catch (e) {}
      }
    }

    const txCount = await paiosDb.transactions.count();
    if (txCount === 0) {
      const rawTx = localStorage.getItem('paios_expense_transactions_v1');
      if (rawTx) {
        const txs: ExpenseTransaction[] = JSON.parse(rawTx);
        if (Array.isArray(txs) && txs.length > 0) {
          await paiosDb.transactions.bulkPut(txs);
        }
      }
    }

    const refillCount = await paiosDb.refillInventories.count();
    if (refillCount === 0) {
      const rawRefills = localStorage.getItem('paios_refills_v1');
      if (rawRefills) {
        const refills: RefillInventory[] = JSON.parse(rawRefills);
        if (Array.isArray(refills) && refills.length > 0) {
          await paiosDb.refillInventories.bulkPut(refills);
        }
      }
    }

    const timelineCount = await paiosDb.timeline.count();
    if (timelineCount === 0) {
      const rawTimeline = localStorage.getItem('paios_timeline_v1');
      if (rawTimeline) {
        const entries: TimelineEntry[] = JSON.parse(rawTimeline);
        if (Array.isArray(entries) && entries.length > 0) {
          await paiosDb.timeline.bulkPut(entries);
        }
      }
    }

    const cardsCount = await paiosDb.studyCards.count();
    if (cardsCount === 0) {
      const rawCards = localStorage.getItem('paios_study_cards_v1');
      if (rawCards) {
        const cards: StudyCard[] = JSON.parse(rawCards);
        if (Array.isArray(cards) && cards.length > 0) {
          await paiosDb.studyCards.bulkPut(cards);
        }
      }
    }

    const vitalsCount = await paiosDb.vitals.count();
    if (vitalsCount === 0) {
      const rawVitals = localStorage.getItem('paios_vitals_v1');
      if (rawVitals) {
        const vitals: VitalSign[] = JSON.parse(rawVitals);
        if (Array.isArray(vitals) && vitals.length > 0) {
          await paiosDb.vitals.bulkPut(vitals);
        }
      }
    }

    const doctorsCount = await paiosDb.doctors.count();
    if (doctorsCount === 0) {
      const rawDoctors = localStorage.getItem('paios_doctors_v1');
      if (rawDoctors) {
        const docs: DoctorContact[] = JSON.parse(rawDoctors);
        if (Array.isArray(docs) && docs.length > 0) {
          await paiosDb.doctors.bulkPut(docs);
        }
      }
    }

    const apptCount = await paiosDb.appointments.count();
    if (apptCount === 0) {
      const rawAppts = localStorage.getItem('paios_appointments_v1');
      if (rawAppts) {
        const appts: Appointment[] = JSON.parse(rawAppts);
        if (Array.isArray(appts) && appts.length > 0) {
          await paiosDb.appointments.bulkPut(appts);
        }
      }
    }

    const potCount = await paiosDb.savingsPots.count();
    if (potCount === 0) {
      const rawPots = localStorage.getItem('paios_savings_pots_v1');
      if (rawPots) {
        const pots: SavingsPot[] = JSON.parse(rawPots);
        if (Array.isArray(pots) && pots.length > 0) {
          await paiosDb.savingsPots.bulkPut(pots);
        }
      }
    }

    const allocCount = await paiosDb.potAllocations.count();
    if (allocCount === 0) {
      const rawAllocs = localStorage.getItem('paios_pot_allocations_v1');
      if (rawAllocs) {
        const allocs: PotAllocationRecord[] = JSON.parse(rawAllocs);
        if (Array.isArray(allocs) && allocs.length > 0) {
          await paiosDb.potAllocations.bulkPut(allocs);
        }
      }
    }
  } catch (err) {
    console.warn('[PaiosDexieDB] Migration notice:', err);
  }
}
