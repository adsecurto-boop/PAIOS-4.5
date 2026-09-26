import { PAIOSStorage, getTodayDateString } from '../../storage';
import { ScopedSnapshot } from './actionTypes';
import {
  AdaptiveTimetableResponse,
  AdaptiveTimetableBlock,
  DoseEvent,
  ActivityLog,
  Task,
  ExpenseTransaction,
  RefillInventory,
  DailySurplusRecord,
  QuickCapture,
  JournalEntry,
  VitalSign,
} from '../../types';

export interface RestorationReport {
  success: boolean;
  storageKey: string;
  recordId: string;
  error?: string;
}

export interface StorageAdapter {
  captureSnapshot(recordId: string): ScopedSnapshot;
  applyMutation(mutation: any): void;
  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport;
  verifyRecord?(recordId: string, predicate: (record: any) => boolean): boolean;
}

/**
 * Task Storage Adapter (paios_tasks_v1)
 */
class TaskAdapter implements StorageAdapter {
  private key = 'paios_tasks_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const tasks = PAIOSStorage.getItem<Task[]>(this.key, []) || [];
    const numericId = Number(recordId);
    const found = tasks.find((t) => t.id === numericId);
    return {
      storageKey: this.key,
      recordId,
      data: found ? JSON.parse(JSON.stringify(found)) : null,
      revision: found?.revision,
      exists: Boolean(found),
    };
  }

  applyMutation(mutation: { type: 'ADD_TASK' | 'UPDATE_TASK' | 'DELETE_TASK'; task?: Task; taskId?: number }): void {
    const tasks = PAIOSStorage.getItem<Task[]>(this.key, []) || [];
    if (mutation.type === 'ADD_TASK' && mutation.task) {
      PAIOSStorage.setItem(this.key, [...tasks, mutation.task]);
    } else if (mutation.type === 'UPDATE_TASK' && mutation.task) {
      const idx = tasks.findIndex((t) => t.id === mutation.task!.id);
      if (idx !== -1) {
        tasks[idx] = mutation.task;
        PAIOSStorage.setItem(this.key, [...tasks]);
      }
    } else if (mutation.type === 'DELETE_TASK' && mutation.taskId) {
      PAIOSStorage.setItem(this.key, tasks.filter((t) => t.id !== mutation.taskId));
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      const tasks = PAIOSStorage.getItem<Task[]>(this.key, []) || [];
      const numericId = Number(snapshot.recordId);
      if (!snapshot.exists) {
        // Record did not exist originally -> remove it
        const filtered = tasks.filter((t) => t.id !== numericId);
        PAIOSStorage.setItem(this.key, filtered);
      } else {
        const idx = tasks.findIndex((t) => t.id === numericId);
        if (idx !== -1) {
          tasks[idx] = snapshot.data as Task;
          PAIOSStorage.setItem(this.key, [...tasks]);
        } else {
          PAIOSStorage.setItem(this.key, [...tasks, snapshot.data as Task]);
        }
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Timetable Container Adapter (paios_timetable_v1)
 */
class TimetableAdapter implements StorageAdapter {
  private key = 'paios_timetable_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const current = PAIOSStorage.getItem<AdaptiveTimetableResponse>(this.key, null as any);
    const block = current?.blocks?.find((b) => b.id === recordId);
    return {
      storageKey: this.key,
      recordId,
      data: block ? JSON.parse(JSON.stringify(block)) : null,
      containerData: current ? JSON.parse(JSON.stringify(current)) : null,
      exists: Boolean(block),
    };
  }

  applyMutation(mutation: { type: 'ADD_BLOCK' | 'UPDATE_BLOCK' | 'SET_TIMETABLE'; block?: AdaptiveTimetableBlock; timetable?: AdaptiveTimetableResponse }): void {
    if (mutation.type === 'SET_TIMETABLE' && mutation.timetable) {
      PAIOSStorage.setItem(this.key, mutation.timetable);
      return;
    }
    const current = PAIOSStorage.getItem<AdaptiveTimetableResponse>(this.key, null as any) || {
      dateString: new Date().toISOString().split('T')[0],
      blocks: [],
    };
    if (mutation.type === 'ADD_BLOCK' && mutation.block) {
      const updated = {
        ...current,
        blocks: [...(current.blocks || []), mutation.block],
      };
      PAIOSStorage.setItem(this.key, updated);
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      if (snapshot.containerData !== undefined) {
        PAIOSStorage.setItem(this.key, snapshot.containerData);
      } else {
        // Fallback if no container data
        const current = PAIOSStorage.getItem<AdaptiveTimetableResponse>(this.key, null as any);
        if (current && current.blocks) {
          if (!snapshot.exists) {
            current.blocks = current.blocks.filter((b) => b.id !== snapshot.recordId);
          } else {
            const idx = current.blocks.findIndex((b) => b.id === snapshot.recordId);
            if (idx !== -1) current.blocks[idx] = snapshot.data as AdaptiveTimetableBlock;
            else current.blocks.push(snapshot.data as AdaptiveTimetableBlock);
          }
          PAIOSStorage.setItem(this.key, { ...current });
        }
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Medication Dose Events Adapter (paios_dose_events_v1)
 * Date-bucketed dictionary Record<string, DoseEvent[]>
 */
class DoseEventsAdapter implements StorageAdapter {
  private key = 'paios_dose_events_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const rawMap = PAIOSStorage.getItem<Record<string, DoseEvent[]>>(this.key, {}) || {};
    let foundDose: DoseEvent | undefined;
    for (const bucket of Object.values(rawMap)) {
      const match = bucket.find((d) => d.id === recordId);
      if (match) {
        foundDose = match;
        break;
      }
    }
    return {
      storageKey: this.key,
      recordId,
      data: foundDose ? JSON.parse(JSON.stringify(foundDose)) : null,
      containerData: JSON.parse(JSON.stringify(rawMap)),
      exists: Boolean(foundDose),
    };
  }

  applyMutation(mutation: { type: 'UPDATE_DOSE'; dose: DoseEvent }): void {
    const rawMap = PAIOSStorage.getItem<Record<string, DoseEvent[]>>(this.key, {}) || {};
    const dateKey = mutation.dose.scheduledDateString;
    if (!rawMap[dateKey]) rawMap[dateKey] = [];
    const idx = rawMap[dateKey].findIndex((d) => d.id === mutation.dose.id);
    if (idx !== -1) {
      rawMap[dateKey][idx] = mutation.dose;
    } else {
      rawMap[dateKey].push(mutation.dose);
    }
    PAIOSStorage.setItem(this.key, rawMap);
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      if (snapshot.containerData !== undefined) {
        PAIOSStorage.setItem(this.key, snapshot.containerData);
      } else {
        const rawMap = PAIOSStorage.getItem<Record<string, DoseEvent[]>>(this.key, {}) || {};
        for (const [dateKey, list] of Object.entries(rawMap)) {
          rawMap[dateKey] = list.filter((d) => d.id !== snapshot.recordId);
        }
        if (snapshot.exists && snapshot.data) {
          const dose = snapshot.data as DoseEvent;
          if (!rawMap[dose.scheduledDateString]) rawMap[dose.scheduledDateString] = [];
          rawMap[dose.scheduledDateString].push(dose);
        }
        PAIOSStorage.setItem(this.key, rawMap);
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Refill Inventory Adapter (paios_refills_v1)
 */
class RefillAdapter implements StorageAdapter {
  private key = 'paios_refills_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const refills = PAIOSStorage.getItem<RefillInventory[]>(this.key, []) || [];
    const found = refills.find((r) => r.id === recordId || r.medicationId === recordId);
    return {
      storageKey: this.key,
      recordId,
      data: found ? JSON.parse(JSON.stringify(found)) : null,
      exists: Boolean(found),
    };
  }

  applyMutation(mutation: { type: 'ADJUST_SUPPLY'; medicationId: string; delta: number }): void {
    const refills = PAIOSStorage.getItem<RefillInventory[]>(this.key, []) || [];
    const found = refills.find((r) => r.medicationId === mutation.medicationId || r.id === mutation.medicationId);
    if (found) {
      const currentVal = found.quantityRemaining ?? found.currentSupply ?? 0;
      const newVal = Math.max(0, currentVal + mutation.delta);
      found.currentSupply = newVal;
      found.quantityRemaining = newVal;
      PAIOSStorage.setItem(this.key, [...refills]);
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      const refills = PAIOSStorage.getItem<RefillInventory[]>(this.key, []) || [];
      if (!snapshot.exists) {
        PAIOSStorage.setItem(this.key, refills.filter((r) => r.id !== snapshot.recordId && r.medicationId !== snapshot.recordId));
      } else {
        const idx = refills.findIndex((r) => r.id === snapshot.recordId || r.medicationId === snapshot.recordId);
        if (idx !== -1) {
          refills[idx] = snapshot.data as RefillInventory;
          PAIOSStorage.setItem(this.key, [...refills]);
        } else {
          PAIOSStorage.setItem(this.key, [...refills, snapshot.data as RefillInventory]);
        }
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Active Activity Adapter (paios_active_activity_v1)
 */
class ActiveActivityAdapter implements StorageAdapter {
  private key = 'paios_active_activity_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const active = PAIOSStorage.getItem<ActivityLog | null>(this.key, null);
    return {
      storageKey: this.key,
      recordId,
      data: active ? JSON.parse(JSON.stringify(active)) : null,
      exists: Boolean(active),
    };
  }

  applyMutation(mutation: { type: 'SET_ACTIVE' | 'CLEAR_ACTIVE'; activity?: ActivityLog }): void {
    if (mutation.type === 'CLEAR_ACTIVE') {
      PAIOSStorage.setItem(this.key, null);
    } else if (mutation.type === 'SET_ACTIVE' && mutation.activity) {
      PAIOSStorage.setItem(this.key, mutation.activity);
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      PAIOSStorage.setItem(this.key, snapshot.exists ? snapshot.data : null);
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Expenses Adapter (paios_expenses_v1)
 */
class ExpenseAdapter implements StorageAdapter {
  private key = 'paios_expenses_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const list = PAIOSStorage.getItem<ExpenseTransaction[]>(this.key, []) || [];
    const found = list.find((e) => e.id === recordId);
    return {
      storageKey: this.key,
      recordId,
      data: found ? JSON.parse(JSON.stringify(found)) : null,
      exists: Boolean(found),
    };
  }

  applyMutation(mutation: { type: 'ADD_EXPENSE' | 'REMOVE_EXPENSE'; expense?: ExpenseTransaction; expenseId?: string }): void {
    const list = PAIOSStorage.getItem<ExpenseTransaction[]>(this.key, []) || [];
    if (mutation.type === 'ADD_EXPENSE' && mutation.expense) {
      PAIOSStorage.setItem(this.key, [...list, mutation.expense]);
    } else if (mutation.type === 'REMOVE_EXPENSE' && mutation.expenseId) {
      PAIOSStorage.setItem(this.key, list.filter((e) => e.id !== mutation.expenseId));
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      const list = PAIOSStorage.getItem<ExpenseTransaction[]>(this.key, []) || [];
      if (!snapshot.exists) {
        PAIOSStorage.setItem(this.key, list.filter((e) => e.id !== snapshot.recordId));
      } else {
        const idx = list.findIndex((e) => e.id === snapshot.recordId);
        if (idx !== -1) {
          list[idx] = snapshot.data as ExpenseTransaction;
          PAIOSStorage.setItem(this.key, [...list]);
        } else {
          PAIOSStorage.setItem(this.key, [...list, snapshot.data as ExpenseTransaction]);
        }
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Daily Surplus Adapter (paios_daily_surplus_v1)
 */
class DailySurplusAdapter implements StorageAdapter {
  private key = 'paios_daily_surplus_v1';

  captureSnapshot(recordId: string): ScopedSnapshot {
    const list = PAIOSStorage.getItem<DailySurplusRecord[]>(this.key, []) || [];
    const targetDate = recordId === 'today_surplus' ? getTodayDateString() : recordId;
    const found = list.find((s) => s.dateString === targetDate || s.dateString === recordId || s.id === recordId);
    return {
      storageKey: this.key,
      recordId,
      data: found ? JSON.parse(JSON.stringify(found)) : null,
      containerData: JSON.parse(JSON.stringify(list)),
      exists: Boolean(found),
    };
  }

  applyMutation(mutation: { type: 'RECORD_SPEND' | 'SET_RECORD'; dateString: string; amount?: number; record?: DailySurplusRecord }): void {
    const list = PAIOSStorage.getItem<DailySurplusRecord[]>(this.key, []) || [];
    const idx = list.findIndex((s) => s.dateString === mutation.dateString);
    if (mutation.type === 'RECORD_SPEND' && mutation.amount !== undefined) {
      if (idx !== -1) {
        list[idx].actualSpend = (list[idx].actualSpend || 0) + mutation.amount;
        list[idx].actualSpent = (list[idx].actualSpent || 0) + mutation.amount;
        list[idx].surplus = (list[idx].dailySafeBudget || list[idx].allocatedBudget || 0) - (list[idx].actualSpend || 0);
        PAIOSStorage.setItem(this.key, [...list]);
      } else {
        const defaultBudget = 1000;
        const newRec: DailySurplusRecord = {
          id: `surplus_${Date.now()}`,
          dateString: mutation.dateString,
          dailySafeBudget: defaultBudget,
          allocatedBudget: defaultBudget,
          actualSpend: mutation.amount,
          actualSpent: mutation.amount,
          sweptAmount: 0,
          surplus: defaultBudget - mutation.amount,
          timestampMillis: Date.now(),
        };
        PAIOSStorage.setItem(this.key, [...list, newRec]);
      }
    } else if (mutation.type === 'SET_RECORD' && mutation.record) {
      if (idx !== -1) list[idx] = mutation.record;
      else list.push(mutation.record);
      PAIOSStorage.setItem(this.key, [...list]);
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      if (snapshot.containerData !== undefined) {
        PAIOSStorage.setItem(this.key, snapshot.containerData);
        return { success: true, storageKey: this.key, recordId: snapshot.recordId };
      }
      const list = PAIOSStorage.getItem<DailySurplusRecord[]>(this.key, []) || [];
      const targetDate = snapshot.recordId === 'today_surplus' ? getTodayDateString() : snapshot.recordId;
      if (!snapshot.exists) {
        PAIOSStorage.setItem(this.key, list.filter((s) => s.dateString !== targetDate && s.dateString !== snapshot.recordId && s.id !== snapshot.recordId));
      } else {
        const idx = list.findIndex((s) => s.dateString === targetDate || s.dateString === snapshot.recordId || s.id === snapshot.recordId);
        if (idx !== -1) {
          list[idx] = snapshot.data as DailySurplusRecord;
          PAIOSStorage.setItem(this.key, [...list]);
        } else {
          PAIOSStorage.setItem(this.key, [...list, snapshot.data as DailySurplusRecord]);
        }
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

/**
 * Generic Array Storage Adapter (quick captures, journal, vitest, activities, timeline)
 */
class GenericArrayStorageAdapter implements StorageAdapter {
  constructor(private key: string) {}

  captureSnapshot(recordId: string): ScopedSnapshot {
    const list = PAIOSStorage.getItem<any[]>(this.key, []) || [];
    if (recordId === '__container__') {
      return {
        storageKey: this.key,
        recordId,
        data: null,
        containerData: JSON.parse(JSON.stringify(list)),
        exists: true,
      };
    }
    const found = list.find((item) => String(item.id) === String(recordId));
    return {
      storageKey: this.key,
      recordId,
      data: found ? JSON.parse(JSON.stringify(found)) : null,
      exists: Boolean(found),
    };
  }

  applyMutation(mutation: { type: 'ADD' | 'UPDATE' | 'DELETE'; item?: any; id?: string }): void {
    const list = PAIOSStorage.getItem<any[]>(this.key, []) || [];
    if (mutation.type === 'ADD' && mutation.item) {
      PAIOSStorage.setItem(this.key, [...list, mutation.item]);
    } else if (mutation.type === 'UPDATE' && mutation.item) {
      const idx = list.findIndex((i) => String(i.id) === String(mutation.item.id));
      if (idx !== -1) {
        list[idx] = mutation.item;
        PAIOSStorage.setItem(this.key, [...list]);
      }
    } else if (mutation.type === 'DELETE' && mutation.id) {
      PAIOSStorage.setItem(this.key, list.filter((i) => String(i.id) !== String(mutation.id)));
    }
  }

  restoreSnapshot(snapshot: ScopedSnapshot): RestorationReport {
    try {
      if (snapshot.recordId === '__container__' && snapshot.containerData !== undefined) {
        PAIOSStorage.setItem(this.key, snapshot.containerData);
        return { success: true, storageKey: this.key, recordId: snapshot.recordId };
      }
      const list = PAIOSStorage.getItem<any[]>(this.key, []) || [];
      if (!snapshot.exists) {
        PAIOSStorage.setItem(this.key, list.filter((i) => String(i.id) !== String(snapshot.recordId)));
      } else {
        const idx = list.findIndex((i) => String(i.id) === String(snapshot.recordId));
        if (idx !== -1) {
          list[idx] = snapshot.data;
          PAIOSStorage.setItem(this.key, [...list]);
        } else {
          PAIOSStorage.setItem(this.key, [...list, snapshot.data]);
        }
      }
      return { success: true, storageKey: this.key, recordId: snapshot.recordId };
    } catch (e: any) {
      return { success: false, storageKey: this.key, recordId: snapshot.recordId, error: e?.message };
    }
  }
}

export class StorageMutationAdapters {
  private static adapters: Record<string, StorageAdapter> = {
    paios_tasks_v1: new TaskAdapter(),
    paios_timetable_v1: new TimetableAdapter(),
    paios_dose_events_v1: new DoseEventsAdapter(),
    paios_refills_v1: new RefillAdapter(),
    paios_active_activity_v1: new ActiveActivityAdapter(),
    paios_expenses_v1: new ExpenseAdapter(),
    paios_daily_surplus_v1: new DailySurplusAdapter(),
    paios_activities_v1: new GenericArrayStorageAdapter('paios_activities_v1'),
    paios_captures_v1: new GenericArrayStorageAdapter('paios_captures_v1'),
    paios_journal_v1: new GenericArrayStorageAdapter('paios_journal_v1'),
    paios_vitals_v1: new GenericArrayStorageAdapter('paios_vitals_v1'),
    paios_timeline_v1: new GenericArrayStorageAdapter('paios_timeline_v1'),
  };

  static getAdapter(storageKey: string): StorageAdapter {
    if (!this.adapters[storageKey]) {
      this.adapters[storageKey] = new GenericArrayStorageAdapter(storageKey);
    }
    return this.adapters[storageKey];
  }
}
