import {
  ActionType,
  ProposedAction,
  ScopedSnapshot,
  AffectedRecordRef,
  generateSecureUUID,
  CreateTaskPayload,
  UpdateTaskPayload,
  CompleteTaskPayload,
  RescheduleTaskPayload,
  CreateTimetableBlockPayload,
  ReplanDayPayload,
  StartFocusSessionPayload,
  FinishFocusSessionPayload,
  CreateQuickCapturePayload,
  CreateJournalEntryPayload,
  RecordExpensePayload,
  RecordIncomePayload,
  RecordMedicationEventPayload,
  RecordSymptomPayload,
  RecordVitalPayload,
} from './actionTypes';
import { PAIOSStorage, getTodayDateString } from '../../storage';
import { ExpenseTransaction, DoseStatus, AdaptiveTimetableBlock, DoseEvent } from '../../types';

import { StorageMutationAdapters } from './StorageMutationAdapters';

export interface ExecutionResult {
  success: boolean;
  affectedRecords: AffectedRecordRef[];
  createdRecordIds: string[];
  createdRecords?: AffectedRecordRef[];
  error?: string;
  summary: string;
}

export class ActionExecutor {
  /**
   * Captures a scoped before-snapshot for a specific record in storage using dedicated adapters
   */
  static captureRecordSnapshot(storageKey: string, recordId: string): ScopedSnapshot {
    return StorageMutationAdapters.getAdapter(storageKey).captureSnapshot(recordId);
  }

  /**
   * Restores a scoped record snapshot (for atomic rollback) using dedicated adapters
   */
  static restoreRecordSnapshot(snapshot: ScopedSnapshot): void {
    const report = StorageMutationAdapters.getAdapter(snapshot.storageKey).restoreSnapshot(snapshot);
    if (!report.success) {
      throw new Error(`Failed to restore record snapshot for ${snapshot.storageKey}:${snapshot.recordId}: ${report.error}`);
    }
  }

  /**
   * Executes a validated action deterministically against storage
   */
  static async execute(action: ProposedAction): Promise<ExecutionResult> {
    return this.executeAction(action);
  }

  static async executeAction(action: ProposedAction): Promise<ExecutionResult> {
    try {
      switch (action.type) {
        case 'CREATE_TASK': return this.executeCreateTask(action.payload as CreateTaskPayload, action);
        case 'UPDATE_TASK': return this.executeUpdateTask(action.payload as UpdateTaskPayload);
        case 'COMPLETE_TASK': return this.executeCompleteTask(action.payload as CompleteTaskPayload);
        case 'RESCHEDULE_TASK': return this.executeRescheduleTask(action.payload as RescheduleTaskPayload);
        case 'CREATE_TIMETABLE_BLOCK': return this.executeCreateTimetableBlock(action.payload as CreateTimetableBlockPayload, action);
        case 'REPLAN_DAY': return this.executeReplanDay(action.payload as ReplanDayPayload);
        case 'START_FOCUS_SESSION': return this.executeStartFocusSession(action.payload as StartFocusSessionPayload, action);
        case 'PAUSE_FOCUS_SESSION': return this.executePauseFocusSession();
        case 'RESUME_FOCUS_SESSION': return this.executeResumeFocusSession();
        case 'FINISH_FOCUS_SESSION': return this.executeFinishFocusSession(action.payload as FinishFocusSessionPayload);
        case 'CREATE_QUICK_CAPTURE': return this.executeCreateQuickCapture(action.payload as CreateQuickCapturePayload, action);
        case 'CREATE_JOURNAL_ENTRY': return this.executeCreateJournalEntry(action.payload as CreateJournalEntryPayload, action);
        case 'RECORD_EXPENSE': return this.executeRecordExpense(action.payload as RecordExpensePayload, action);
        case 'RECORD_INCOME': return this.executeRecordIncome(action.payload as RecordIncomePayload, action);
        case 'RECORD_MEDICATION_EVENT': return this.executeRecordMedicationEvent(action.payload as RecordMedicationEventPayload);
        case 'RECORD_SYMPTOM': return this.executeRecordSymptom(action.payload as RecordSymptomPayload, action);
        case 'RECORD_VITAL': return this.executeRecordVital(action.payload as RecordVitalPayload, action);
        case 'NAVIGATE':
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('paios_navigate', { detail: action.payload }));
          }
          return { success: true, affectedRecords: [], createdRecordIds: [], summary: 'Navigated to tab' };
        case 'SEARCH':
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('paios_search', { detail: action.payload }));
          }
          return { success: true, affectedRecords: [], createdRecordIds: [], summary: 'Executed search' };
        default:
          return { success: false, affectedRecords: [], createdRecordIds: [], error: `Unknown action: ${action.type}`, summary: 'Failed' };
      }
    } catch (err: any) {
      return {
        success: false,
        affectedRecords: [],
        createdRecordIds: [],
        error: err?.message || 'Execution error',
        summary: 'Execution failed',
      };
    }
  }

  // Individual Executors
  private static executeCreateTask(payload: CreateTaskPayload, action?: ProposedAction): ExecutionResult {
    const preId = action?.preAllocatedId ? Number(action.preAllocatedId) : undefined;
    const task = PAIOSStorage.addTask(
      payload.title,
      payload.category || 'Personal',
      payload.priority === 'HIGH' || payload.priority === 'CRITICAL',
      payload.description || '',
      preId
    );
    if (payload.dueDateMillis) {
      PAIOSStorage.updateTask({ ...task, dueDateMillis: payload.dueDateMillis });
    }
    const idStr = String(task.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: idStr }],
      createdRecordIds: [idStr],
      summary: `Created task "${task.title}"`,
    };
  }

  private static executeUpdateTask(payload: UpdateTaskPayload): ExecutionResult {
    const existing = PAIOSStorage.getTasks().find((t) => t.id === payload.taskId);
    if (!existing) {
      return { success: false, affectedRecords: [], createdRecordIds: [], error: `Task #${payload.taskId} not found`, summary: 'Task not found' };
    }

    const updated = {
      ...existing,
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload.category ? { category: payload.category } : {}),
      ...(payload.priority ? { priority: payload.priority } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.dueDateMillis !== undefined ? { dueDateMillis: payload.dueDateMillis } : {}),
      ...(payload.status ? { status: payload.status } : {}),
    };
    PAIOSStorage.updateTask(updated);

    const idStr = String(existing.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: idStr }],
      createdRecordIds: [],
      summary: `Updated task "${existing.title}"`,
    };
  }

  private static executeCompleteTask(payload: CompleteTaskPayload): ExecutionResult {
    const existing = PAIOSStorage.getTasks().find((t) => t.id === payload.taskId);
    if (!existing) {
      return { success: false, affectedRecords: [], createdRecordIds: [], error: `Task #${payload.taskId} not found`, summary: 'Task not found' };
    }

    PAIOSStorage.updateTask({
      ...existing,
      status: 'COMPLETED',
      completedAtMillis: Date.now(),
    });

    const idStr = String(existing.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: idStr }],
      createdRecordIds: [],
      summary: `Completed task "${existing.title}"`,
    };
  }

  private static executeRescheduleTask(payload: RescheduleTaskPayload): ExecutionResult {
    const existing = PAIOSStorage.getTasks().find((t) => t.id === payload.taskId);
    if (!existing) {
      return { success: false, affectedRecords: [], createdRecordIds: [], error: `Task #${payload.taskId} not found`, summary: 'Task not found' };
    }

    PAIOSStorage.updateTask({
      ...existing,
      dueDateMillis: payload.dueDateMillis,
    });

    const idStr = String(existing.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_tasks_v1', recordId: idStr }],
      createdRecordIds: [],
      summary: `Rescheduled task "${existing.title}"`,
    };
  }

  private static executeCreateTimetableBlock(payload: CreateTimetableBlockPayload, action?: ProposedAction): ExecutionResult {
    const blockId = action?.preAllocatedId || `block_${generateSecureUUID()}`;
    const block: AdaptiveTimetableBlock = {
      id: blockId,
      start: payload.start,
      end: payload.end,
      duration_minutes: payload.duration_minutes,
      activity: payload.activity,
      category: payload.category || 'General',
      priority: payload.priority || 'FLEXIBLE',
      reason: payload.reason,
      status: 'planned',
      isAiGenerated: false,
    };

    const current = PAIOSStorage.getAdaptiveTimetable();
    const blocks = current?.blocks ? [...current.blocks, block] : [block];
    PAIOSStorage.saveAdaptiveTimetable({
      dateString: current?.dateString || getTodayDateString(),
      generatedAtTimeStr: current?.generatedAtTimeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      explanation: current?.explanation || 'Updated schedule',
      blocks,
    });

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_timetable_v1', recordId: block.id }],
      createdRecordIds: [block.id],
      summary: `Scheduled "${block.activity}" (${block.start} - ${block.end})`,
    };
  }

  private static executeReplanDay(payload: ReplanDayPayload): ExecutionResult {
    const current = PAIOSStorage.getAdaptiveTimetable();
    const blocks = current?.blocks || [];
    const completedBlocks = payload.preserveCompleted ? blocks.filter((b) => b.status === 'completed') : [];
    const uncompletedBlocks = blocks.filter((b) => b.status !== 'completed');

    // Also inspect pending tasks from paios_tasks_v1
    const pendingTasks = (PAIOSStorage.getItem<any[]>('paios_tasks_v1', []) || []).filter(
      (t) => !t.completed && t.status !== 'COMPLETED'
    );

    const rescheduledBlocks: AdaptiveTimetableBlock[] = [];
    let startMinutes = 9 * 60; // 09:00 default
    if (completedBlocks.length > 0) {
      const lastCompleted = completedBlocks[completedBlocks.length - 1];
      if (lastCompleted.end) {
        const [h, m] = lastCompleted.end.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          startMinutes = Math.max(startMinutes, h * 60 + m);
        }
      }
    }

    const blocksToSchedule: AdaptiveTimetableBlock[] =
      uncompletedBlocks.length > 0
        ? uncompletedBlocks
        : pendingTasks.map((t, idx) => ({
            id: `block_task_${t.id}_${idx}`,
            start: '09:00',
            end: '10:00',
            duration_minutes: 60,
            activity: t.title,
            category: t.category || 'General',
            priority: t.priority || 'FLEXIBLE',
            reason: 'Scheduled from pending task',
            status: 'planned' as const,
          }));

    for (const b of blocksToSchedule) {
      const dur = b.duration_minutes || 60;
      const sh = Math.floor(startMinutes / 60);
      const sm = startMinutes % 60;
      const eh = Math.floor((startMinutes + dur) / 60);
      const em = (startMinutes + dur) % 60;
      const startTimeStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
      const endTimeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      startMinutes += dur + 15; // 15 min buffer

      rescheduledBlocks.push({
        ...b,
        start: startTimeStr,
        end: endTimeStr,
        status: 'planned',
      });
    }

    const allBlocks = [...completedBlocks, ...rescheduledBlocks];

    PAIOSStorage.saveAdaptiveTimetable({
      dateString: payload.targetDayString || current?.dateString || getTodayDateString(),
      generatedAtTimeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      explanation: `Replanned schedule: ${payload.reason}`,
      blocks: allBlocks,
    });

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_timetable_v1', recordId: 'today_timetable' }],
      createdRecordIds: rescheduledBlocks.map((b) => b.id),
      summary: `Replanned schedule with ${rescheduledBlocks.length} block(s): ${payload.reason}`,
    };
  }

  private static executeStartFocusSession(payload: StartFocusSessionPayload, action?: ProposedAction): ExecutionResult {
    const preId = action?.preAllocatedId ? Number(action.preAllocatedId) : undefined;
    const act = PAIOSStorage.startActivity(payload.name, payload.category || 'Work', payload.note, preId);
    const idStr = String(act.id);
    return {
      success: true,
      affectedRecords: [
        { storageKey: 'paios_active_activity_v1', recordId: 'active' },
        { storageKey: 'paios_activities_v1', recordId: idStr },
      ],
      createdRecordIds: [idStr],
      summary: `Started focus session: "${payload.name}"`,
    };
  }

  private static executePauseFocusSession(): ExecutionResult {
    PAIOSStorage.pauseActivity();
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_active_activity_v1', recordId: 'active' }],
      createdRecordIds: [],
      summary: 'Paused active focus session',
    };
  }

  private static executeResumeFocusSession(): ExecutionResult {
    PAIOSStorage.resumeActivity();
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_active_activity_v1', recordId: 'active' }],
      createdRecordIds: [],
      summary: 'Resumed active focus session',
    };
  }

  private static executeFinishFocusSession(payload: FinishFocusSessionPayload): ExecutionResult {
    PAIOSStorage.finishActivity(payload.sessionId, payload.finalNote, payload.completedTaskId);
    return {
      success: true,
      affectedRecords: [
        { storageKey: 'paios_active_activity_v1', recordId: 'active' },
        { storageKey: 'paios_activities_v1', recordId: String(payload.sessionId || 'last') },
      ],
      createdRecordIds: [],
      summary: 'Finished focus session',
    };
  }

  private static executeCreateQuickCapture(payload: CreateQuickCapturePayload, action?: ProposedAction): ExecutionResult {
    const plannedId = action?.preAllocatedId ? Number(action.preAllocatedId) : undefined;
    const capture = PAIOSStorage.addQuickCaptureNote(payload.text, payload.category || 'Personal', plannedId);
    const idStr = String(capture.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_captures_v1', recordId: idStr }],
      createdRecordIds: [idStr],
      summary: `Captured note: "${payload.text.slice(0, 40)}..."`,
    };
  }

  private static executeCreateJournalEntry(payload: CreateJournalEntryPayload, action?: ProposedAction): ExecutionResult {
    const plannedId = action?.preAllocatedId ? Number(action.preAllocatedId) : undefined;
    const entry = PAIOSStorage.addJournalEntry(payload.title, payload.content, payload.moodScore || 7, payload.category || 'Personal', '', plannedId);
    const idStr = String(entry.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_journal_v1', recordId: idStr }],
      createdRecordIds: [idStr],
      summary: `Created journal entry: "${payload.title}"`,
    };
  }

  private static executeRecordExpense(payload: RecordExpensePayload, action?: ProposedAction): ExecutionResult {
    const now = new Date();
    const txId = action?.preAllocatedId || `tx_${generateSecureUUID()}`;
    const dateStr = payload.dateString || getTodayDateString();
    const tx: ExpenseTransaction = {
      id: txId,
      title: payload.title,
      amount: payload.amount,
      type: 'OUTFLOW',
      category: (payload.category as any) || 'Other',
      dateString: dateStr,
      timeString: payload.timeString || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      timestampMillis: Date.now(),
      isNecessity: payload.isNecessity ?? false,
      notes: payload.notes || 'Recorded via Action Assistant',
      provenance: 'AI_EXTRACTED',
    };

    PAIOSStorage.saveExpenseTransaction(tx);

    StorageMutationAdapters.getAdapter('paios_daily_surplus_v1').applyMutation({
      type: 'RECORD_SPEND',
      dateString: dateStr,
      amount: payload.amount,
    } as any);

    return {
      success: true,
      affectedRecords: [
        { storageKey: 'paios_expenses_v1', recordId: tx.id },
        { storageKey: 'paios_daily_surplus_v1', recordId: dateStr },
        { storageKey: 'paios_budget_profile_v1', recordId: 'profile' },
      ],
      createdRecordIds: [tx.id],
      summary: `Recorded expense of ₹${payload.amount} for "${payload.title}"`,
    };
  }

  private static executeRecordIncome(payload: RecordIncomePayload, action?: ProposedAction): ExecutionResult {
    const now = new Date();
    const txId = action?.preAllocatedId || `tx_inc_${generateSecureUUID()}`;
    const dateStr = payload.dateString || getTodayDateString();
    const tx: ExpenseTransaction = {
      id: txId,
      title: payload.title,
      amount: payload.amount,
      type: 'INFLOW',
      category: (payload.category as any) || 'OtherIncome',
      dateString: dateStr,
      timeString: payload.timeString || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      timestampMillis: Date.now(),
      isNecessity: false,
      notes: payload.notes || 'Recorded via Action Assistant',
      provenance: 'AI_EXTRACTED',
    };

    PAIOSStorage.saveExpenseTransaction(tx);

    return {
      success: true,
      affectedRecords: [
        { storageKey: 'paios_expenses_v1', recordId: tx.id },
        { storageKey: 'paios_daily_surplus_v1', recordId: dateStr },
        { storageKey: 'paios_budget_profile_v1', recordId: 'profile' },
      ],
      createdRecordIds: [tx.id],
      summary: `Recorded income of ₹${payload.amount} ("${payload.title}")`,
    };
  }

  private static executeRecordMedicationEvent(payload: RecordMedicationEventPayload): ExecutionResult {
    const targetDate = payload.scheduledDateString || getTodayDateString();
    const doses = PAIOSStorage.getDoseEvents(targetDate);
    let target: DoseEvent | undefined;

    if (payload.doseEventId) {
      target = doses.find((d) => d.id === payload.doseEventId);
    }

    if (!target && payload.medicationId) {
      const candidates = doses.filter((d) => d.medicationId === payload.medicationId);
      if (payload.scheduledTime) {
        target = candidates.find((d) => d.scheduledTime === payload.scheduledTime);
      } else if (candidates.length === 1) {
        target = candidates[0];
      } else if (candidates.length > 1) {
        target = candidates.find((d) => d.status === 'SCHEDULED') || candidates[0];
      }
    }

    if (!target && payload.medicationName) {
      const candidates = doses.filter((d) =>
        d.medicationName.toLowerCase().includes(payload.medicationName!.toLowerCase())
      );
      if (payload.scheduledTime) {
        target = candidates.find((d) => d.scheduledTime === payload.scheduledTime);
      } else if (candidates.length === 1) {
        target = candidates[0];
      } else if (candidates.length > 1) {
        target = candidates.find((d) => d.status === 'SCHEDULED') || candidates[0];
      }
    }

    if (!target) {
      return {
        success: false,
        affectedRecords: [],
        createdRecordIds: [],
        error: `Scheduled dose event not found for "${payload.medicationName || payload.medicationId || payload.doseEventId || 'unknown'}" on ${targetDate}`,
        summary: 'Scheduled dose not found',
      };
    }

    const updated = PAIOSStorage.logDoseEvent(target.id, payload.status as DoseStatus, payload.note, targetDate);
    if (!updated) {
      return {
        success: false,
        affectedRecords: [],
        createdRecordIds: [],
        error: `Failed to log dose event ${target.id}`,
        summary: 'Dose logging rejected',
      };
    }

    return {
      success: true,
      affectedRecords: [
        { storageKey: 'paios_dose_events_v1', recordId: target.id },
        { storageKey: 'paios_refills_v1', recordId: target.medicationId },
      ],
      createdRecordIds: [],
      summary: `Recorded ${target.medicationName} as ${payload.status}`,
    };
  }

  private static executeRecordSymptom(payload: RecordSymptomPayload, action?: ProposedAction): ExecutionResult {
    const vital = PAIOSStorage.logVitalSign({
      symptoms: payload.symptomName,
      dizzinessSeverity: /dizzy/i.test(payload.symptomName) ? payload.severity || 3 : undefined,
      note: payload.notes || `Logged severity ${payload.severity || 'unrated'} via Action Assistant`,
    }, action?.preAllocatedId);

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_vitals_v1', recordId: vital.id }],
      createdRecordIds: [vital.id],
      summary: `Recorded symptom: "${payload.symptomName}" (Severity: ${payload.severity || 'N/A'})`,
    };
  }

  private static executeRecordVital(payload: RecordVitalPayload, action?: ProposedAction): ExecutionResult {
    const vital = PAIOSStorage.logVitalSign({
      systolicBp: payload.systolicBp,
      diastolicBp: payload.diastolicBp,
      restingHeartRate: payload.restingHeartRate,
      weightKg: payload.weightKg,
      note: payload.notes || 'Recorded via Action Assistant',
    }, action?.preAllocatedId);

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_vitals_v1', recordId: vital.id }],
      createdRecordIds: [vital.id],
      summary: `Recorded vitals: BP ${payload.systolicBp || '-'}/${payload.diastolicBp || '-'}, HR ${payload.restingHeartRate || '-'}`,
    };
  }
}
