import {
  ActionType,
  ActionRisk,
  ActionStatus,
  ValidationState,
  ProposedAction,
  TransactionRecord,
  AnyActionPayload,
  CreateTaskPayload,
  UpdateTaskPayload,
  CompleteTaskPayload,
  RescheduleTaskPayload,
  CreateTimetableBlockPayload,
  ReplanDayPayload,
  StartFocusSessionPayload,
  PauseFocusSessionPayload,
  ResumeFocusSessionPayload,
  FinishFocusSessionPayload,
  CreateQuickCapturePayload,
  CreateJournalEntryPayload,
  RecordExpensePayload,
  RecordIncomePayload,
  RecordMedicationEventPayload,
  RecordSymptomPayload,
  RecordVitalPayload,
  NavigatePayload,
  SearchPayload,
} from './actionTypes';

export const VALID_ACTION_TYPES = new Set<ActionType>([
  'CREATE_TASK',
  'UPDATE_TASK',
  'COMPLETE_TASK',
  'RESCHEDULE_TASK',
  'CREATE_TIMETABLE_BLOCK',
  'REPLAN_DAY',
  'START_FOCUS_SESSION',
  'PAUSE_FOCUS_SESSION',
  'RESUME_FOCUS_SESSION',
  'FINISH_FOCUS_SESSION',
  'CREATE_QUICK_CAPTURE',
  'CREATE_JOURNAL_ENTRY',
  'RECORD_EXPENSE',
  'RECORD_INCOME',
  'RECORD_MEDICATION_EVENT',
  'RECORD_SYMPTOM',
  'RECORD_VITAL',
  'NAVIGATE',
  'SEARCH',
]);

export const VALID_RISKS = new Set<ActionRisk>(['LOW', 'MEDIUM', 'HIGH', 'BLOCKED']);
export const VALID_STATUSES = new Set<ActionStatus>([
  'PROPOSED',
  'AWAITING_CONFIRMATION',
  'JOURNALED',
  'VALIDATING',
  'COMMITTING',
  'COMMITTED',
  'SYNC_PENDING',
  'SYNCED',
  'FAILED',
  'ROLLING_BACK',
  'ROLLED_BACK',
  'UNDONE',
  'RECOVERY_REQUIRED',
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ValidationResult<T = unknown> {
  isValid: boolean;
  sanitized?: T;
  errors: string[];
}

export function isFinitePositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val > 0;
}

export function isNonNegativeNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val >= 0;
}

export function isCleanString(val: unknown, minLength = 1, maxLength = 1000): val is string {
  return typeof val === 'string' && val.trim().length >= minLength && val.length <= maxLength;
}

/**
 * Validates and sanitizes CREATE_TASK payload
 */
export function validateCreateTaskPayload(raw: unknown): ValidationResult<CreateTaskPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isCleanString(obj.title, 1, 300)) {
    errors.push('Task title is required (1-300 characters)');
  }

  const sanitized: CreateTaskPayload = {
    title: String(obj.title || '').trim(),
  };

  if (obj.category !== undefined) {
    if (typeof obj.category !== 'string') errors.push('Category must be a string');
    else sanitized.category = obj.category.trim();
  }

  if (obj.priority !== undefined) {
    const p = String(obj.priority).toUpperCase();
    if (!['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(p)) {
      errors.push('Invalid priority level');
    } else {
      sanitized.priority = p as any;
    }
  }

  if (obj.description !== undefined) {
    if (typeof obj.description !== 'string') errors.push('Description must be a string');
    else sanitized.description = obj.description.slice(0, 2000);
  }

  if (obj.dueDateMillis !== undefined && obj.dueDateMillis !== null) {
    if (!isFinitePositiveNumber(obj.dueDateMillis)) errors.push('dueDateMillis must be a positive number');
    else sanitized.dueDateMillis = obj.dueDateMillis;
  }

  if (obj.estimatedDurationMinutes !== undefined && obj.estimatedDurationMinutes !== null) {
    if (!isFinitePositiveNumber(obj.estimatedDurationMinutes) || obj.estimatedDurationMinutes > 1440) {
      errors.push('estimatedDurationMinutes must be between 1 and 1440');
    } else {
      sanitized.estimatedDurationMinutes = Math.round(obj.estimatedDurationMinutes);
    }
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes UPDATE_TASK payload
 */
export function validateUpdateTaskPayload(raw: unknown): ValidationResult<UpdateTaskPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isFinitePositiveNumber(obj.taskId)) {
    errors.push('Valid numeric taskId is required');
  }

  const sanitized: UpdateTaskPayload = {
    taskId: Number(obj.taskId),
  };

  if (obj.title !== undefined) {
    if (!isCleanString(obj.title, 1, 300)) errors.push('Title must be 1-300 characters');
    else sanitized.title = obj.title.trim();
  }

  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.priority !== undefined) {
    const p = String(obj.priority).toUpperCase();
    if (!['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(p)) errors.push('Invalid priority level');
    else sanitized.priority = p as any;
  }
  if (obj.description !== undefined) sanitized.description = String(obj.description).slice(0, 2000);
  if (obj.dueDateMillis !== undefined && obj.dueDateMillis !== null) {
    if (!isFinitePositiveNumber(obj.dueDateMillis)) errors.push('dueDateMillis must be a positive number');
    else sanitized.dueDateMillis = obj.dueDateMillis;
  }
  if (obj.status !== undefined) {
    const s = String(obj.status).toUpperCase();
    if (!['TODO', 'IN_PROGRESS', 'COMPLETED'].includes(s)) errors.push('Invalid task status');
    else sanitized.status = s as any;
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes COMPLETE_TASK payload
 */
export function validateCompleteTaskPayload(raw: unknown): ValidationResult<CompleteTaskPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isFinitePositiveNumber(obj.taskId)) {
    errors.push('Valid numeric taskId is required');
  }

  const sanitized: CompleteTaskPayload = { taskId: Number(obj.taskId) };
  if (obj.note !== undefined) sanitized.note = String(obj.note).slice(0, 500);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes RESCHEDULE_TASK payload
 */
export function validateRescheduleTaskPayload(raw: unknown): ValidationResult<RescheduleTaskPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isFinitePositiveNumber(obj.taskId)) errors.push('Valid numeric taskId is required');
  if (!isFinitePositiveNumber(obj.dueDateMillis)) errors.push('Valid dueDateMillis timestamp is required');

  const sanitized: RescheduleTaskPayload = {
    taskId: Number(obj.taskId),
    dueDateMillis: Number(obj.dueDateMillis),
  };

  if (obj.newDateString !== undefined) {
    if (!DATE_REGEX.test(String(obj.newDateString))) errors.push('newDateString must be in YYYY-MM-DD format');
    else sanitized.newDateString = String(obj.newDateString);
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes CREATE_TIMETABLE_BLOCK payload
 */
export function validateCreateTimetableBlockPayload(raw: unknown): ValidationResult<CreateTimetableBlockPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!TIME_REGEX.test(String(obj.start))) errors.push('start must be in HH:MM format');
  if (!TIME_REGEX.test(String(obj.end))) errors.push('end must be in HH:MM format');
  if (!isFinitePositiveNumber(obj.duration_minutes) || Number(obj.duration_minutes) > 720) {
    errors.push('duration_minutes must be a positive number up to 720');
  }
  if (!isCleanString(obj.activity, 1, 200)) errors.push('activity name is required');

  const sanitized: CreateTimetableBlockPayload = {
    start: String(obj.start),
    end: String(obj.end),
    duration_minutes: Number(obj.duration_minutes),
    activity: String(obj.activity).trim(),
  };

  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.priority !== undefined) sanitized.priority = String(obj.priority).toUpperCase() as any;
  if (obj.reason !== undefined) sanitized.reason = String(obj.reason).slice(0, 300);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes REPLAN_DAY payload
 */
export function validateReplanDayPayload(raw: unknown): ValidationResult<ReplanDayPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  if (!isCleanString(obj.reason, 1, 500)) errors.push('Replan reason is required');

  const sanitized: ReplanDayPayload = {
    reason: String(obj.reason).trim(),
    preserveCompleted: obj.preserveCompleted !== false,
  };
  if (obj.targetDayString !== undefined) {
    if (!DATE_REGEX.test(String(obj.targetDayString))) errors.push('targetDayString must be YYYY-MM-DD');
    else sanitized.targetDayString = String(obj.targetDayString);
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes START_FOCUS_SESSION payload
 */
export function validateStartFocusSessionPayload(raw: unknown): ValidationResult<StartFocusSessionPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  if (!isCleanString(obj.name, 1, 200)) errors.push('Session name is required');

  const sanitized: StartFocusSessionPayload = {
    name: String(obj.name).trim(),
  };
  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.durationMinutes !== undefined && obj.durationMinutes !== null) {
    if (!isFinitePositiveNumber(obj.durationMinutes) || Number(obj.durationMinutes) > 360) {
      errors.push('durationMinutes must be between 1 and 360');
    } else {
      sanitized.durationMinutes = Math.round(Number(obj.durationMinutes));
    }
  }
  if (obj.note !== undefined) sanitized.note = String(obj.note).slice(0, 500);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes FINISH_FOCUS_SESSION payload
 */
export function validateFinishFocusSessionPayload(raw: unknown): ValidationResult<FinishFocusSessionPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  const sanitized: FinishFocusSessionPayload = {};
  if (obj.sessionId !== undefined && obj.sessionId !== null) {
    if (!isFinitePositiveNumber(obj.sessionId)) errors.push('sessionId must be a positive number');
    else sanitized.sessionId = Number(obj.sessionId);
  }
  if (obj.finalNote !== undefined) sanitized.finalNote = String(obj.finalNote).slice(0, 500);
  if (obj.completedTaskId !== undefined && obj.completedTaskId !== null) {
    if (!isFinitePositiveNumber(obj.completedTaskId)) errors.push('completedTaskId must be a positive number');
    else sanitized.completedTaskId = Number(obj.completedTaskId);
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes CREATE_QUICK_CAPTURE payload
 */
export function validateCreateQuickCapturePayload(raw: unknown): ValidationResult<CreateQuickCapturePayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  if (!isCleanString(obj.text, 1, 2000)) errors.push('Capture text is required');

  const sanitized: CreateQuickCapturePayload = {
    text: String(obj.text).trim(),
  };
  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.tags !== undefined) sanitized.tags = String(obj.tags).slice(0, 200);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes CREATE_JOURNAL_ENTRY payload
 */
export function validateCreateJournalEntryPayload(raw: unknown): ValidationResult<CreateJournalEntryPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  if (!isCleanString(obj.title, 1, 300)) errors.push('Journal title is required');
  if (!isCleanString(obj.content, 1, 10000)) errors.push('Journal content is required');

  const sanitized: CreateJournalEntryPayload = {
    title: String(obj.title).trim(),
    content: String(obj.content).trim(),
  };

  if (obj.moodScore !== undefined && obj.moodScore !== null) {
    const score = Number(obj.moodScore);
    if (!Number.isInteger(score) || score < 1 || score > 10) errors.push('moodScore must be an integer between 1 and 10');
    else sanitized.moodScore = score;
  }
  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.tags !== undefined) sanitized.tags = String(obj.tags).slice(0, 200);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes RECORD_EXPENSE payload
 */
export function validateRecordExpensePayload(raw: unknown): ValidationResult<RecordExpensePayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isFinitePositiveNumber(obj.amount)) {
    errors.push('Expense amount must be a finite positive number greater than 0');
  } else if (Number(obj.amount) > 1000000) {
    errors.push('Expense amount cannot exceed 1,000,000');
  }
  if (!isCleanString(obj.title, 1, 200)) {
    errors.push('Expense title is required');
  }

  const sanitized: RecordExpensePayload = {
    amount: Number(obj.amount),
    title: String(obj.title).trim(),
  };

  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.isNecessity !== undefined) sanitized.isNecessity = Boolean(obj.isNecessity);
  if (obj.dateString !== undefined) {
    if (!DATE_REGEX.test(String(obj.dateString))) errors.push('dateString must be in YYYY-MM-DD format');
    else sanitized.dateString = String(obj.dateString);
  }
  if (obj.timeString !== undefined) {
    if (!TIME_REGEX.test(String(obj.timeString))) errors.push('timeString must be in HH:MM format');
    else sanitized.timeString = String(obj.timeString);
  }
  if (obj.notes !== undefined) sanitized.notes = String(obj.notes).slice(0, 500);
  if (obj.currency !== undefined) sanitized.currency = String(obj.currency).slice(0, 10);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes RECORD_INCOME payload
 */
export function validateRecordIncomePayload(raw: unknown): ValidationResult<RecordIncomePayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isFinitePositiveNumber(obj.amount)) {
    errors.push('Income amount must be a finite positive number greater than 0');
  } else if (Number(obj.amount) > 1000000) {
    errors.push('Income amount cannot exceed 1,000,000');
  }
  if (!isCleanString(obj.title, 1, 200)) {
    errors.push('Income title is required');
  }

  const sanitized: RecordIncomePayload = {
    amount: Number(obj.amount),
    title: String(obj.title).trim(),
  };

  if (obj.category !== undefined) sanitized.category = String(obj.category).trim();
  if (obj.dateString !== undefined) {
    if (!DATE_REGEX.test(String(obj.dateString))) errors.push('dateString must be in YYYY-MM-DD format');
    else sanitized.dateString = String(obj.dateString);
  }
  if (obj.timeString !== undefined) {
    if (!TIME_REGEX.test(String(obj.timeString))) errors.push('timeString must be in HH:MM format');
    else sanitized.timeString = String(obj.timeString);
  }
  if (obj.notes !== undefined) sanitized.notes = String(obj.notes).slice(0, 500);
  if (obj.currency !== undefined) sanitized.currency = String(obj.currency).slice(0, 10);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes RECORD_MEDICATION_EVENT payload
 */
export function validateRecordMedicationEventPayload(raw: unknown): ValidationResult<RecordMedicationEventPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  const status = String(obj.status || '').toUpperCase();
  if (!['TAKEN', 'SKIPPED', 'TAKEN_LATE'].includes(status)) {
    errors.push("status must be 'TAKEN', 'SKIPPED', or 'TAKEN_LATE'");
  }

  if (!obj.doseEventId && !obj.medicationId && !obj.medicationName) {
    errors.push('Either doseEventId, medicationId, or medicationName must be specified');
  }

  const sanitized: RecordMedicationEventPayload = {
    status: status as any,
  };

  if (obj.doseEventId !== undefined) sanitized.doseEventId = String(obj.doseEventId).trim();
  if (obj.medicationId !== undefined) sanitized.medicationId = String(obj.medicationId).trim();
  if (obj.medicationName !== undefined) sanitized.medicationName = String(obj.medicationName).trim();
  if (obj.scheduledDateString !== undefined) {
    if (!DATE_REGEX.test(String(obj.scheduledDateString))) errors.push('scheduledDateString must be YYYY-MM-DD');
    else sanitized.scheduledDateString = String(obj.scheduledDateString);
  }
  if (obj.scheduledTime !== undefined) {
    if (!TIME_REGEX.test(String(obj.scheduledTime))) errors.push('scheduledTime must be HH:MM');
    else sanitized.scheduledTime = String(obj.scheduledTime);
  }
  if (obj.note !== undefined) sanitized.note = String(obj.note).slice(0, 500);
  if (obj.actualTakenTimeMillis !== undefined && obj.actualTakenTimeMillis !== null) {
    if (!isFinitePositiveNumber(obj.actualTakenTimeMillis)) errors.push('actualTakenTimeMillis must be a positive number');
    else sanitized.actualTakenTimeMillis = Number(obj.actualTakenTimeMillis);
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes RECORD_SYMPTOM payload
 */
export function validateRecordSymptomPayload(raw: unknown): ValidationResult<RecordSymptomPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isCleanString(obj.symptomName, 1, 200)) {
    errors.push('symptomName is required');
  }

  const sanitized: RecordSymptomPayload = {
    symptomName: String(obj.symptomName).trim(),
  };

  if (obj.severity !== undefined && obj.severity !== null) {
    const sev = Number(obj.severity);
    if (!Number.isInteger(sev) || sev < 1 || sev > 10) errors.push('severity must be an integer between 1 and 10');
    else sanitized.severity = sev;
  }
  if (obj.notes !== undefined) sanitized.notes = String(obj.notes).slice(0, 500);
  if (obj.timestampMillis !== undefined && obj.timestampMillis !== null) {
    if (!isFinitePositiveNumber(obj.timestampMillis)) errors.push('timestampMillis must be a positive timestamp');
    else sanitized.timestampMillis = Number(obj.timestampMillis);
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes RECORD_VITAL payload
 */
export function validateRecordVitalPayload(raw: unknown): ValidationResult<RecordVitalPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  const sanitized: RecordVitalPayload = {};

  let hasAnyReading = false;

  if (obj.systolicBp !== undefined && obj.systolicBp !== null) {
    const s = Number(obj.systolicBp);
    if (!Number.isFinite(s) || s < 40 || s > 300) errors.push('systolicBp must be between 40 and 300');
    else { sanitized.systolicBp = Math.round(s); hasAnyReading = true; }
  }

  if (obj.diastolicBp !== undefined && obj.diastolicBp !== null) {
    const d = Number(obj.diastolicBp);
    if (!Number.isFinite(d) || d < 30 || d > 200) errors.push('diastolicBp must be between 30 and 200');
    else { sanitized.diastolicBp = Math.round(d); hasAnyReading = true; }
  }

  if (obj.restingHeartRate !== undefined && obj.restingHeartRate !== null) {
    const hr = Number(obj.restingHeartRate);
    if (!Number.isFinite(hr) || hr < 30 || hr > 250) errors.push('restingHeartRate must be between 30 and 250');
    else { sanitized.restingHeartRate = Math.round(hr); hasAnyReading = true; }
  }

  if (obj.weightKg !== undefined && obj.weightKg !== null) {
    const w = Number(obj.weightKg);
    if (!Number.isFinite(w) || w < 2 || w > 500) errors.push('weightKg must be between 2 and 500');
    else { sanitized.weightKg = Number(w.toFixed(1)); hasAnyReading = true; }
  }

  if (!hasAnyReading && !obj.notes) {
    errors.push('At least one vital reading (blood pressure, heart rate, weight) or note is required');
  }

  if (obj.notes !== undefined) sanitized.notes = String(obj.notes).slice(0, 500);
  if (obj.timestampMillis !== undefined && obj.timestampMillis !== null) {
    if (!isFinitePositiveNumber(obj.timestampMillis)) errors.push('timestampMillis must be a positive timestamp');
    else sanitized.timestampMillis = Number(obj.timestampMillis);
  }

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes NAVIGATE payload
 */
export function validateNavigatePayload(raw: unknown): ValidationResult<NavigatePayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  const tab = String(obj.tab || '').toUpperCase();
  const validTabs = ['TODAY', 'TIMELINE', 'TASKS', 'PLUGINS', 'HEALTH', 'LEARN', 'INSIGHTS', 'AI', 'JOURNAL', 'SETTINGS'];

  if (!validTabs.includes(tab)) {
    errors.push(`Invalid navigation tab: ${tab}`);
  }

  const sanitized: NavigatePayload = { tab: tab as any };
  if (obj.subSection !== undefined) sanitized.subSection = String(obj.subSection).slice(0, 100);

  return { isValid: errors.length === 0, sanitized: errors.length === 0 ? sanitized : undefined, errors };
}

/**
 * Validates and sanitizes SEARCH payload
 */
export function validateSearchPayload(raw: unknown): ValidationResult<SearchPayload> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['Payload must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  if (!isCleanString(obj.query, 1, 200)) {
    errors.push('Search query is required (1-200 characters)');
  }

  return {
    isValid: errors.length === 0,
    sanitized: errors.length === 0 ? { query: String(obj.query).trim() } : undefined,
    errors,
  };
}

/**
 * Validates any action payload by ActionType
 */
export function validateActionPayload(type: ActionType, rawPayload: unknown): ValidationResult<AnyActionPayload> {
  if (!VALID_ACTION_TYPES.has(type)) {
    return { isValid: false, errors: [`Unknown or unsupported action type: ${type}`] };
  }

  switch (type) {
    case 'CREATE_TASK': return validateCreateTaskPayload(rawPayload);
    case 'UPDATE_TASK': return validateUpdateTaskPayload(rawPayload);
    case 'COMPLETE_TASK': return validateCompleteTaskPayload(rawPayload);
    case 'RESCHEDULE_TASK': return validateRescheduleTaskPayload(rawPayload);
    case 'CREATE_TIMETABLE_BLOCK': return validateCreateTimetableBlockPayload(rawPayload);
    case 'REPLAN_DAY': return validateReplanDayPayload(rawPayload);
    case 'START_FOCUS_SESSION': return validateStartFocusSessionPayload(rawPayload);
    case 'PAUSE_FOCUS_SESSION': return { isValid: true, sanitized: (rawPayload as any) || {}, errors: [] };
    case 'RESUME_FOCUS_SESSION': return { isValid: true, sanitized: (rawPayload as any) || {}, errors: [] };
    case 'FINISH_FOCUS_SESSION': return validateFinishFocusSessionPayload(rawPayload);
    case 'CREATE_QUICK_CAPTURE': return validateCreateQuickCapturePayload(rawPayload);
    case 'CREATE_JOURNAL_ENTRY': return validateCreateJournalEntryPayload(rawPayload);
    case 'RECORD_EXPENSE': return validateRecordExpensePayload(rawPayload);
    case 'RECORD_INCOME': return validateRecordIncomePayload(rawPayload);
    case 'RECORD_MEDICATION_EVENT': return validateRecordMedicationEventPayload(rawPayload);
    case 'RECORD_SYMPTOM': return validateRecordSymptomPayload(rawPayload);
    case 'RECORD_VITAL': return validateRecordVitalPayload(rawPayload);
    case 'NAVIGATE': return validateNavigatePayload(rawPayload);
    case 'SEARCH': return validateSearchPayload(rawPayload);
    default:
      return { isValid: false, errors: [`Validator not implemented for action type: ${type}`] };
  }
}

/**
 * Validates an entire ProposedAction envelope
 */
export function validateProposedAction(raw: unknown): ValidationResult<ProposedAction> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['ProposedAction must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isCleanString(obj.id, 1, 100)) errors.push('ProposedAction requires a valid string id');
  if (!isCleanString(obj.transactionId, 1, 100)) errors.push('ProposedAction requires a valid string transactionId');
  if (!VALID_ACTION_TYPES.has(obj.type as ActionType)) errors.push(`Invalid action type: ${obj.type}`);
  if (!VALID_RISKS.has(obj.risk as ActionRisk)) errors.push(`Invalid risk: ${obj.risk}`);
  if (!isCleanString(obj.title, 1, 300)) errors.push('ProposedAction requires a valid title');

  const payloadValidation = validateActionPayload(obj.type as ActionType, obj.payload);
  if (!payloadValidation.isValid) {
    errors.push(...payloadValidation.errors);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const sanitized: ProposedAction = {
    id: String(obj.id),
    transactionId: String(obj.transactionId),
    type: obj.type as ActionType,
    payload: payloadValidation.sanitized as any,
    risk: obj.risk as ActionRisk,
    title: String(obj.title).trim(),
    explanation: String(obj.explanation || '').trim(),
    sourceText: String(obj.sourceText || '').slice(0, 1000),
    affectedRecordIds: Array.isArray(obj.affectedRecordIds) ? obj.affectedRecordIds.map(String) : [],
    expectedRevisions: typeof obj.expectedRevisions === 'object' && obj.expectedRevisions ? (obj.expectedRevisions as any) : {},
    requiresConfirmation: Boolean(obj.requiresConfirmation),
    validationState: (obj.validationState as ValidationState) || 'VALID',
    createdAt: isFinitePositiveNumber(obj.createdAt) ? Number(obj.createdAt) : Date.now(),
    originDeviceId: String(obj.originDeviceId || 'local'),
    preAllocatedId: obj.preAllocatedId ? String(obj.preAllocatedId) : undefined,
  };

  return { isValid: true, sanitized, errors: [] };
}

/**
 * Validates a restored TransactionRecord
 */
export function validateTransactionRecord(raw: unknown): ValidationResult<TransactionRecord> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { isValid: false, errors: ['TransactionRecord must be an object'] };
  }
  const obj = raw as Record<string, unknown>;

  if (!isCleanString(obj.id, 1, 100)) errors.push('TransactionRecord requires valid string id');
  if (!VALID_RISKS.has(obj.risk as ActionRisk)) errors.push('Invalid transaction risk');
  if (!VALID_STATUSES.has(obj.status as ActionStatus)) errors.push('Invalid transaction status');
  if (!Array.isArray(obj.actions)) {
    errors.push('TransactionRecord must contain an actions array');
  } else if (obj.actions.length === 0 && !['RECOVERY_REQUIRED', 'FAILED', 'ROLLED_BACK', 'UNDONE', 'COMMITTING', 'VALIDATING', 'JOURNALED', 'ROLLING_BACK'].includes(String(obj.status))) {
    errors.push('TransactionRecord must contain at least one action');
  }

  const validatedActions: ProposedAction[] = [];
  if (Array.isArray(obj.actions)) {
    for (let i = 0; i < obj.actions.length; i++) {
      const v = validateProposedAction(obj.actions[i]);
      if (!v.isValid) {
        errors.push(`Action at index ${i} is invalid: ${v.errors.join('; ')}`);
      } else if (v.sanitized) {
        validatedActions.push(v.sanitized);
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const sanitized: TransactionRecord = {
    id: String(obj.id),
    originalCommand: String(obj.originalCommand || '').slice(0, 2000),
    actions: validatedActions,
    risk: obj.risk as ActionRisk,
    status: obj.status as ActionStatus,
    phase: obj.phase as any,
    confirmationProof: obj.confirmationProof as any,
    stepMarkers: Array.isArray(obj.stepMarkers) ? (obj.stepMarkers as any) : undefined,
    unresolvedDetails: typeof obj.unresolvedDetails === 'object' && obj.unresolvedDetails ? (obj.unresolvedDetails as any) : undefined,
    createdAt: isFinitePositiveNumber(obj.createdAt) ? Number(obj.createdAt) : Date.now(),
    updatedAt: isFinitePositiveNumber(obj.updatedAt) ? Number(obj.updatedAt) : Date.now(),
    committedAt: isFinitePositiveNumber(obj.committedAt) ? Number(obj.committedAt) : null,
    sourcePlatform: ['windows', 'android', 'web'].includes(String(obj.sourcePlatform)) ? (obj.sourcePlatform as any) : 'web',
    sourceDeviceId: String(obj.sourceDeviceId || 'local'),
    affectedRecords: Array.isArray(obj.affectedRecords) ? (obj.affectedRecords as any) : [],
    expectedRevisions: typeof obj.expectedRevisions === 'object' && obj.expectedRevisions ? (obj.expectedRevisions as any) : {},
    beforeSnapshot: Array.isArray(obj.beforeSnapshot) ? (obj.beforeSnapshot as any) : [],
    afterSnapshot: Array.isArray(obj.afterSnapshot) ? (obj.afterSnapshot as any) : undefined,
    afterSnapshotSummary: obj.afterSnapshotSummary ? String(obj.afterSnapshotSummary) : undefined,
    failureReason: obj.failureReason ? String(obj.failureReason) : null,
    syncStatus: ['LOCAL', 'SYNC_PENDING', 'SYNCED', 'FAILED'].includes(String(obj.syncStatus)) ? (obj.syncStatus as any) : 'LOCAL',
    undoStatus: ['AVAILABLE', 'UNDONE', 'NOT_APPLICABLE', 'BLOCKED'].includes(String(obj.undoStatus)) ? (obj.undoStatus as any) : 'AVAILABLE',
    undoTransactionId: obj.undoTransactionId ? String(obj.undoTransactionId) : null,
  };

  return { isValid: true, sanitized, errors: [] };
}
