import { ActionType, ProposedAction, generateSecureUUID } from './actionTypes';
import { getTodayDateString } from '../../storage';

export interface MutationRef {
  storageKey: string;
  recordId: string;
  isCreate: boolean;
}

export interface ActionMutationPlan {
  refs: MutationRef[];
}

function generateSecureRandomInt(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % 100000;
  }
  return Math.floor(Math.random() * 100000);
}

export class ActionMutationPlanner {
  static plan(action: ProposedAction): ActionMutationPlan {
    const refs: MutationRef[] = [];
    
    switch (action.type) {
      case 'CREATE_TASK': {
        const id = action.preAllocatedId || String(Date.now() + generateSecureRandomInt());
        action.preAllocatedId = id;
        refs.push({ storageKey: 'paios_tasks_v1', recordId: id, isCreate: true });
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'UPDATE_TASK':
      case 'COMPLETE_TASK':
      case 'RESCHEDULE_TASK': {
        const taskId = String((action.payload as any).taskId);
        refs.push({ storageKey: 'paios_tasks_v1', recordId: taskId, isCreate: false });
        break;
      }
      case 'START_FOCUS_SESSION': {
        const actId = action.preAllocatedId || String(Date.now() + generateSecureRandomInt());
        action.preAllocatedId = actId;
        refs.push({ storageKey: 'paios_active_activity_v1', recordId: 'active', isCreate: false });
        refs.push({ storageKey: 'paios_activities_v1', recordId: actId, isCreate: true });
        break;
      }
      case 'PAUSE_FOCUS_SESSION':
      case 'RESUME_FOCUS_SESSION': {
        refs.push({ storageKey: 'paios_active_activity_v1', recordId: 'active', isCreate: false });
        break;
      }
      case 'FINISH_FOCUS_SESSION': {
        const payload = action.payload as any;
        const sessionId = payload.sessionId ? String(payload.sessionId) : 'last';
        refs.push({ storageKey: 'paios_active_activity_v1', recordId: 'active', isCreate: false });
        refs.push({ storageKey: 'paios_activities_v1', recordId: sessionId, isCreate: false });
        if (payload.completedTaskId) {
          refs.push({ storageKey: 'paios_tasks_v1', recordId: String(payload.completedTaskId), isCreate: false });
        }
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'CREATE_TIMETABLE_BLOCK':
      case 'REPLAN_DAY': {
        // Whole-container snapshot for the timetable (container pattern)
        refs.push({ storageKey: 'paios_timetable_v1', recordId: 'timetable_container', isCreate: false });
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'RECORD_EXPENSE':
      case 'RECORD_INCOME': {
        const id = action.preAllocatedId || `tx_${generateSecureUUID()}`;
        action.preAllocatedId = id;
        const surplusDate = (action.payload as any)?.dateString || getTodayDateString();
        (action.payload as any).dateString = surplusDate;
        refs.push({ storageKey: 'paios_expenses_v1', recordId: id, isCreate: true });
        refs.push({ storageKey: 'paios_daily_surplus_v1', recordId: surplusDate, isCreate: false });
        refs.push({ storageKey: 'paios_budget_profile_v1', recordId: 'profile', isCreate: false });
        break;
      }
      case 'RECORD_MEDICATION_EVENT': {
        const medPayload = action.payload as any;
        const doseEventId = medPayload.doseEventId || (action.affectedRecordIds?.[0] ?? 'unknown_dose');
        const medicationId = medPayload.medicationId || 'unknown_med';
        refs.push({ storageKey: 'paios_dose_events_v1', recordId: String(doseEventId), isCreate: false });
        refs.push({ storageKey: 'paios_refills_v1', recordId: String(medicationId), isCreate: false });
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'RECORD_SYMPTOM':
      case 'RECORD_VITAL': {
        const id = action.preAllocatedId || generateSecureUUID();
        action.preAllocatedId = id;
        refs.push({ storageKey: 'paios_vitals_v1', recordId: id, isCreate: true });
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'CREATE_QUICK_CAPTURE': {
        const id = action.preAllocatedId || String(Date.now() + generateSecureRandomInt());
        action.preAllocatedId = id;
        refs.push({ storageKey: 'paios_captures_v1', recordId: id, isCreate: true });
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'CREATE_JOURNAL_ENTRY': {
        const id = action.preAllocatedId || String(Date.now() + generateSecureRandomInt());
        action.preAllocatedId = id;
        refs.push({ storageKey: 'paios_journal_v1', recordId: id, isCreate: true });
        refs.push({ storageKey: 'paios_timeline_v1', recordId: '__container__', isCreate: false });
        break;
      }
      case 'NAVIGATE':
      case 'SEARCH':
        break;
    }
    
    return { refs };
  }
}
