import { ActionType, ActionRisk } from './actionTypes';
import { VALID_ACTION_TYPES } from './actionSchemas';

export interface ActionDescriptor {
  type: ActionType;
  label: string;
  category: 'TASK' | 'PLANNING' | 'FOCUS' | 'MONEY' | 'HEALTH' | 'CAPTURE' | 'NAVIGATION';
  defaultRisk: ActionRisk;
  supportsUndo: boolean;
  requiresContext: boolean;
  description: string;
}

export const ACTION_REGISTRY: Record<ActionType, ActionDescriptor> = {
  CREATE_TASK: {
    type: 'CREATE_TASK',
    label: 'Create Task',
    category: 'TASK',
    defaultRisk: 'LOW',
    supportsUndo: true,
    requiresContext: false,
    description: 'Creates a new task in the tasks list or inbox',
  },
  UPDATE_TASK: {
    type: 'UPDATE_TASK',
    label: 'Update Task',
    category: 'TASK',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: true,
    description: 'Modifies an existing task properties',
  },
  COMPLETE_TASK: {
    type: 'COMPLETE_TASK',
    label: 'Complete Task',
    category: 'TASK',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: true,
    description: 'Marks an existing open task as completed',
  },
  RESCHEDULE_TASK: {
    type: 'RESCHEDULE_TASK',
    label: 'Reschedule Task',
    category: 'TASK',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: true,
    description: 'Changes the due date of an existing task',
  },
  CREATE_TIMETABLE_BLOCK: {
    type: 'CREATE_TIMETABLE_BLOCK',
    label: 'Add Timetable Block',
    category: 'PLANNING',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: false,
    description: 'Adds a time-blocked event to today schedule',
  },
  REPLAN_DAY: {
    type: 'REPLAN_DAY',
    label: 'Replan Day',
    category: 'PLANNING',
    defaultRisk: 'HIGH',
    supportsUndo: true,
    requiresContext: true,
    description: 'Rebuilds remaining daily timetable blocks while preserving completed work',
  },
  START_FOCUS_SESSION: {
    type: 'START_FOCUS_SESSION',
    label: 'Start Focus Session',
    category: 'FOCUS',
    defaultRisk: 'LOW',
    supportsUndo: true,
    requiresContext: false,
    description: 'Starts a deep work or activity timer',
  },
  PAUSE_FOCUS_SESSION: {
    type: 'PAUSE_FOCUS_SESSION',
    label: 'Pause Focus Session',
    category: 'FOCUS',
    defaultRisk: 'LOW',
    supportsUndo: false,
    requiresContext: true,
    description: 'Pauses the currently running focus timer',
  },
  RESUME_FOCUS_SESSION: {
    type: 'RESUME_FOCUS_SESSION',
    label: 'Resume Focus Session',
    category: 'FOCUS',
    defaultRisk: 'LOW',
    supportsUndo: false,
    requiresContext: true,
    description: 'Resumes a paused focus timer',
  },
  FINISH_FOCUS_SESSION: {
    type: 'FINISH_FOCUS_SESSION',
    label: 'Finish Focus Session',
    category: 'FOCUS',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: true,
    description: 'Completes active focus session and records activity log',
  },
  CREATE_QUICK_CAPTURE: {
    type: 'CREATE_QUICK_CAPTURE',
    label: 'Quick Capture',
    category: 'CAPTURE',
    defaultRisk: 'LOW',
    supportsUndo: true,
    requiresContext: false,
    description: 'Stores a quick thought or item in the inbox',
  },
  CREATE_JOURNAL_ENTRY: {
    type: 'CREATE_JOURNAL_ENTRY',
    label: 'Journal Entry',
    category: 'CAPTURE',
    defaultRisk: 'LOW',
    supportsUndo: true,
    requiresContext: false,
    description: 'Creates a reflective journal entry',
  },
  RECORD_EXPENSE: {
    type: 'RECORD_EXPENSE',
    label: 'Record Expense',
    category: 'MONEY',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: false,
    description: 'Logs an outflow transaction in the financial ledger',
  },
  RECORD_INCOME: {
    type: 'RECORD_INCOME',
    label: 'Record Income',
    category: 'MONEY',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: false,
    description: 'Logs an inflow transaction in the financial ledger',
  },
  RECORD_MEDICATION_EVENT: {
    type: 'RECORD_MEDICATION_EVENT',
    label: 'Record Medication Event',
    category: 'HEALTH',
    defaultRisk: 'MEDIUM',
    supportsUndo: true,
    requiresContext: true,
    description: 'Records an adherence event (taken, skipped, late) for a scheduled dose',
  },
  RECORD_SYMPTOM: {
    type: 'RECORD_SYMPTOM',
    label: 'Record Symptom',
    category: 'HEALTH',
    defaultRisk: 'LOW',
    supportsUndo: true,
    requiresContext: false,
    description: 'Records a symptom occurrence and severity',
  },
  RECORD_VITAL: {
    type: 'RECORD_VITAL',
    label: 'Record Vital',
    category: 'HEALTH',
    defaultRisk: 'LOW',
    supportsUndo: true,
    requiresContext: false,
    description: 'Logs physical biometric readings (blood pressure, heart rate, weight)',
  },
  NAVIGATE: {
    type: 'NAVIGATE',
    label: 'Navigate',
    category: 'NAVIGATION',
    defaultRisk: 'LOW',
    supportsUndo: false,
    requiresContext: false,
    description: 'Navigates to an application screen or tab',
  },
  SEARCH: {
    type: 'SEARCH',
    label: 'Search',
    category: 'NAVIGATION',
    defaultRisk: 'LOW',
    supportsUndo: false,
    requiresContext: false,
    description: 'Executes a workspace search query',
  },
};

export class ActionRegistry {
  static isPermitted(type: string): type is ActionType {
    return VALID_ACTION_TYPES.has(type as ActionType);
  }

  static getDescriptor(type: ActionType): ActionDescriptor {
    const desc = ACTION_REGISTRY[type];
    if (!desc) {
      throw new Error(`Unregistered action type: ${type}`);
    }
    return desc;
  }

  static getAllDescriptors(): ActionDescriptor[] {
    return Object.values(ACTION_REGISTRY);
  }

  static supportsUndo(type: ActionType): boolean {
    return ACTION_REGISTRY[type]?.supportsUndo ?? false;
  }
}
