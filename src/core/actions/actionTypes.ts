import { PriorityLevel, Category, TimetablePriority, NavTab } from '../../types';

export type ActionRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export type ActionStatus =
  | 'PROPOSED'
  | 'AWAITING_CONFIRMATION'
  | 'VALIDATING'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'SYNC_PENDING'
  | 'SYNCED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'UNDONE';

export type ActionType =
  | 'CREATE_TASK'
  | 'UPDATE_TASK'
  | 'COMPLETE_TASK'
  | 'RESCHEDULE_TASK'
  | 'CREATE_TIMETABLE_BLOCK'
  | 'REPLAN_DAY'
  | 'START_FOCUS_SESSION'
  | 'PAUSE_FOCUS_SESSION'
  | 'RESUME_FOCUS_SESSION'
  | 'FINISH_FOCUS_SESSION'
  | 'CREATE_QUICK_CAPTURE'
  | 'CREATE_JOURNAL_ENTRY'
  | 'RECORD_EXPENSE'
  | 'RECORD_INCOME'
  | 'RECORD_MEDICATION_EVENT'
  | 'RECORD_SYMPTOM'
  | 'RECORD_VITAL'
  | 'NAVIGATE'
  | 'SEARCH';

export type ValidationState = 'VALID' | 'INVALID' | 'STALE' | 'BLOCKED';

// Individual typed payloads for each ActionType
export interface CreateTaskPayload {
  title: string;
  category?: Category | string;
  priority?: PriorityLevel;
  description?: string;
  dueDateMillis?: number | null;
  estimatedDurationMinutes?: number | null;
}

export interface UpdateTaskPayload {
  taskId: number;
  title?: string;
  category?: Category | string;
  priority?: PriorityLevel;
  description?: string;
  dueDateMillis?: number | null;
  status?: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface CompleteTaskPayload {
  taskId: number;
  note?: string;
}

export interface RescheduleTaskPayload {
  taskId: number;
  dueDateMillis: number;
  newDateString?: string;
}

export interface CreateTimetableBlockPayload {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  duration_minutes: number;
  activity: string;
  category?: Category | string;
  priority?: TimetablePriority;
  reason?: string;
}

export interface ReplanDayPayload {
  reason: string;
  preserveCompleted?: boolean;
  targetDayString?: string; // "YYYY-MM-DD"
}

export interface StartFocusSessionPayload {
  name: string;
  category?: Category | string;
  durationMinutes?: number;
  note?: string;
}

export interface PauseFocusSessionPayload {
  sessionId?: number;
}

export interface ResumeFocusSessionPayload {
  sessionId?: number;
}

export interface FinishFocusSessionPayload {
  sessionId?: number;
  finalNote?: string;
  completedTaskId?: number | null;
}

export interface CreateQuickCapturePayload {
  text: string;
  category?: Category | string;
  tags?: string;
}

export interface CreateJournalEntryPayload {
  title: string;
  content: string;
  moodScore?: number; // 1-10
  category?: string;
  tags?: string;
}

export interface RecordExpensePayload {
  amount: number;
  title: string;
  category?: string;
  isNecessity?: boolean;
  dateString?: string; // "YYYY-MM-DD"
  timeString?: string; // "HH:MM"
  notes?: string;
  currency?: string;
}

export interface RecordIncomePayload {
  amount: number;
  title: string;
  category?: string;
  dateString?: string; // "YYYY-MM-DD"
  timeString?: string; // "HH:MM"
  notes?: string;
  currency?: string;
}

export interface RecordMedicationEventPayload {
  doseEventId?: string;
  medicationId?: string;
  medicationName?: string;
  status: 'TAKEN' | 'SKIPPED' | 'TAKEN_LATE';
  scheduledDateString?: string; // "YYYY-MM-DD"
  scheduledTime?: string;       // "HH:MM"
  note?: string;
  actualTakenTimeMillis?: number;
}

export interface RecordSymptomPayload {
  symptomName: string;
  severity?: number; // 1-10
  notes?: string;
  timestampMillis?: number;
}

export interface RecordVitalPayload {
  systolicBp?: number;
  diastolicBp?: number;
  restingHeartRate?: number;
  weightKg?: number;
  notes?: string;
  timestampMillis?: number;
}

export interface NavigatePayload {
  tab: NavTab | string;
  subSection?: string;
}

export interface SearchPayload {
  query: string;
}

// Discriminated Union for Action Payloads
export type ActionPayloadMap = {
  CREATE_TASK: CreateTaskPayload;
  UPDATE_TASK: UpdateTaskPayload;
  COMPLETE_TASK: CompleteTaskPayload;
  RESCHEDULE_TASK: RescheduleTaskPayload;
  CREATE_TIMETABLE_BLOCK: CreateTimetableBlockPayload;
  REPLAN_DAY: ReplanDayPayload;
  START_FOCUS_SESSION: StartFocusSessionPayload;
  PAUSE_FOCUS_SESSION: PauseFocusSessionPayload;
  RESUME_FOCUS_SESSION: ResumeFocusSessionPayload;
  FINISH_FOCUS_SESSION: FinishFocusSessionPayload;
  CREATE_QUICK_CAPTURE: CreateQuickCapturePayload;
  CREATE_JOURNAL_ENTRY: CreateJournalEntryPayload;
  RECORD_EXPENSE: RecordExpensePayload;
  RECORD_INCOME: RecordIncomePayload;
  RECORD_MEDICATION_EVENT: RecordMedicationEventPayload;
  RECORD_SYMPTOM: RecordSymptomPayload;
  RECORD_VITAL: RecordVitalPayload;
  NAVIGATE: NavigatePayload;
  SEARCH: SearchPayload;
};

export type AnyActionPayload = ActionPayloadMap[ActionType];

export interface ProposedAction<T extends ActionType = ActionType> {
  id: string;
  transactionId: string;
  type: T;
  payload: ActionPayloadMap[T];
  risk: ActionRisk;
  title: string;
  explanation: string;
  sourceText: string;
  affectedRecordIds: string[];
  expectedRevisions: Record<string, number>;
  requiresConfirmation: boolean;
  validationState: ValidationState;
  createdAt: number;
  originDeviceId: string;
}

export interface AffectedRecordRef {
  storageKey: string;
  recordId: string;
  revisionAtStart?: number;
}

export interface ScopedSnapshot {
  storageKey: string;
  recordId: string;
  data: unknown;
  revision?: number;
  exists: boolean;
}

export interface TransactionRecord {
  id: string;
  originalCommand: string;
  actions: ProposedAction[];
  risk: ActionRisk;
  status: ActionStatus;
  createdAt: number;
  updatedAt: number;
  committedAt?: number | null;
  sourcePlatform: 'windows' | 'android' | 'web';
  sourceDeviceId: string;
  affectedRecords: AffectedRecordRef[];
  expectedRevisions: Record<string, Record<string, number>>;
  beforeSnapshot: ScopedSnapshot[];
  afterSnapshotSummary?: string;
  failureReason?: string | null;
  syncStatus: 'LOCAL' | 'SYNC_PENDING' | 'SYNCED' | 'FAILED';
  undoStatus: 'AVAILABLE' | 'UNDONE' | 'NOT_APPLICABLE' | 'BLOCKED';
  undoTransactionId?: string | null;
}

export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  data?: unknown;
}

export interface ClarificationRequest {
  id: string;
  prompt: string;
  parameterName: string;
  actionType: ActionType;
  options: ClarificationOption[];
  allowCustomText?: boolean;
}

export interface InterpretationResult {
  confidence: number;
  actions: ProposedAction[];
  clarificationNeeded?: ClarificationRequest;
  explanation?: string;
  rawText: string;
  tier: 'LOCAL_PARSER' | 'AI_INTERPRETER' | 'MANUAL';
  missingFields?: string[];
  safetyNotice?: string;
}

export interface ProactiveSuggestion {
  id: string;
  type: 'SCHEDULE_DRIFT' | 'OVERDUE_PRIORITY' | 'MEDICATION_DUE' | 'EVENING_REVIEW_INCOMPLETE';
  title: string;
  reason: string;
  proposedAction?: ProposedAction;
  timestamp: number;
  dismissed?: boolean;
}
