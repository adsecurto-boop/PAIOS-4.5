import {
  ActionType,
  ProposedAction,
  ScopedSnapshot,
  AffectedRecordRef,
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
import { ExpenseTransaction, DoseStatus, AdaptiveTimetableBlock } from '../../types';

export interface ExecutionResult {
  success: boolean;
  affectedRecords: AffectedRecordRef[];
  createdRecordIds: string[];
  error?: string;
  summary: string;
}

export class ActionExecutor {
  /**
   * Captures a scoped before-snapshot for a specific record in storage
   */
  static captureRecordSnapshot(storageKey: string, recordId: string): ScopedSnapshot {
    try {
      const parsed = PAIOSStorage.getItem<any>(storageKey, null);
      if (!parsed) return { storageKey, recordId, data: null, exists: false };

      if (Array.isArray(parsed)) {
        const item = parsed.find((x: any) => String(x.id) === String(recordId));
        return {
          storageKey,
          recordId,
          data: item ? JSON.parse(JSON.stringify(item)) : null,
          exists: Boolean(item),
        };
      }

      if (typeof parsed === 'object' && parsed !== null) {
        const val = parsed[recordId];
        return {
          storageKey,
          recordId,
          data: val ? JSON.parse(JSON.stringify(val)) : null,
          exists: val !== undefined,
        };
      }

      return { storageKey, recordId, data: null, exists: false };
    } catch {
      return { storageKey, recordId, data: null, exists: false };
    }
  }

  /**
   * Restores a scoped record snapshot (for atomic rollback)
   */
  static restoreRecordSnapshot(snapshot: ScopedSnapshot): void {
    try {
      let parsed = PAIOSStorage.getItem<any>(snapshot.storageKey, null);

      if (!snapshot.exists) {
        // Record did not exist prior to transaction -> remove it
        if (Array.isArray(parsed)) {
          parsed = parsed.filter((x: any) => String(x.id) !== String(snapshot.recordId));
          PAIOSStorage.setItem(snapshot.storageKey, parsed);
        } else if (typeof parsed === 'object' && parsed !== null) {
          delete parsed[snapshot.recordId];
          PAIOSStorage.setItem(snapshot.storageKey, parsed);
        }
        return;
      }

      // Record existed -> restore previous data
      if (Array.isArray(parsed)) {
        const idx = parsed.findIndex((x: any) => String(x.id) === String(snapshot.recordId));
        if (idx >= 0) {
          parsed[idx] = snapshot.data;
        } else {
          parsed.push(snapshot.data);
        }
        PAIOSStorage.setItem(snapshot.storageKey, parsed);
      } else if (typeof parsed === 'object' && parsed !== null) {
        parsed[snapshot.recordId] = snapshot.data;
        PAIOSStorage.setItem(snapshot.storageKey, parsed);
      }
    } catch (err) {
      console.error('[ActionExecutor] Failed to restore record snapshot:', err);
    }
  }

  /**
   * Executes a validated action deterministically against storage
   */
  static async executeAction(action: ProposedAction): Promise<ExecutionResult> {
    try {
      switch (action.type) {
        case 'CREATE_TASK': return this.executeCreateTask(action.payload as CreateTaskPayload);
        case 'UPDATE_TASK': return this.executeUpdateTask(action.payload as UpdateTaskPayload);
        case 'COMPLETE_TASK': return this.executeCompleteTask(action.payload as CompleteTaskPayload);
        case 'RESCHEDULE_TASK': return this.executeRescheduleTask(action.payload as RescheduleTaskPayload);
        case 'CREATE_TIMETABLE_BLOCK': return this.executeCreateTimetableBlock(action.payload as CreateTimetableBlockPayload);
        case 'REPLAN_DAY': return this.executeReplanDay(action.payload as ReplanDayPayload);
        case 'START_FOCUS_SESSION': return this.executeStartFocusSession(action.payload as StartFocusSessionPayload);
        case 'PAUSE_FOCUS_SESSION': return this.executePauseFocusSession();
        case 'RESUME_FOCUS_SESSION': return this.executeResumeFocusSession();
        case 'FINISH_FOCUS_SESSION': return this.executeFinishFocusSession(action.payload as FinishFocusSessionPayload);
        case 'CREATE_QUICK_CAPTURE': return this.executeCreateQuickCapture(action.payload as CreateQuickCapturePayload);
        case 'CREATE_JOURNAL_ENTRY': return this.executeCreateJournalEntry(action.payload as CreateJournalEntryPayload);
        case 'RECORD_EXPENSE': return this.executeRecordExpense(action.payload as RecordExpensePayload);
        case 'RECORD_INCOME': return this.executeRecordIncome(action.payload as RecordIncomePayload);
        case 'RECORD_MEDICATION_EVENT': return this.executeRecordMedicationEvent(action.payload as RecordMedicationEventPayload);
        case 'RECORD_SYMPTOM': return this.executeRecordSymptom(action.payload as RecordSymptomPayload);
        case 'RECORD_VITAL': return this.executeRecordVital(action.payload as RecordVitalPayload);
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
  private static executeCreateTask(payload: CreateTaskPayload): ExecutionResult {
    const task = PAIOSStorage.addTask(
      payload.title,
      payload.category || 'Personal',
      payload.priority === 'HIGH' || payload.priority === 'CRITICAL',
      payload.description || ''
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

  private static executeCreateTimetableBlock(payload: CreateTimetableBlockPayload): ExecutionResult {
    const block: AdaptiveTimetableBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
    // If preserveCompleted is true, keep completed blocks and reschedule planned ones
    const remaining = payload.preserveCompleted ? blocks.filter((b) => b.status === 'completed') : [];
    PAIOSStorage.saveAdaptiveTimetable({
      dateString: payload.targetDayString || getTodayDateString(),
      generatedAtTimeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      explanation: `Replanned: ${payload.reason}`,
      blocks: remaining,
    });

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_timetable_v1', recordId: 'today_timetable' }],
      createdRecordIds: [],
      summary: `Replanned schedule: ${payload.reason}`,
    };
  }

  private static executeStartFocusSession(payload: StartFocusSessionPayload): ExecutionResult {
    const act = PAIOSStorage.startActivity(payload.name, payload.category || 'Work', payload.note);
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

  private static executeCreateQuickCapture(payload: CreateQuickCapturePayload): ExecutionResult {
    const capture = PAIOSStorage.addQuickCaptureNote(payload.text, payload.category || 'Personal');
    const idStr = String(capture.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_captures_v1', recordId: idStr }],
      createdRecordIds: [idStr],
      summary: `Captured note: "${payload.text.slice(0, 40)}..."`,
    };
  }

  private static executeCreateJournalEntry(payload: CreateJournalEntryPayload): ExecutionResult {
    const entry = PAIOSStorage.addJournalEntry(payload.title, payload.content, payload.moodScore || 7, payload.category || 'Personal');
    const idStr = String(entry.id);
    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_journal_v1', recordId: idStr }],
      createdRecordIds: [idStr],
      summary: `Created journal entry: "${payload.title}"`,
    };
  }

  private static executeRecordExpense(payload: RecordExpensePayload): ExecutionResult {
    const now = new Date();
    const tx: ExpenseTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: payload.title,
      amount: payload.amount,
      type: 'OUTFLOW',
      category: (payload.category as any) || 'Other',
      dateString: payload.dateString || getTodayDateString(),
      timeString: payload.timeString || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      timestampMillis: Date.now(),
      isNecessity: payload.isNecessity ?? false,
      notes: payload.notes || 'Recorded via Action Assistant',
      provenance: 'AI_EXTRACTED',
    };

    PAIOSStorage.saveExpenseTransaction(tx);

    return {
      success: true,
      affectedRecords: [
        { storageKey: 'paios_expenses_v1', recordId: tx.id },
        { storageKey: 'paios_budget_profile_v1', recordId: 'profile' },
      ],
      createdRecordIds: [tx.id],
      summary: `Recorded expense of ₹${payload.amount} for "${payload.title}"`,
    };
  }

  private static executeRecordIncome(payload: RecordIncomePayload): ExecutionResult {
    const now = new Date();
    const tx: ExpenseTransaction = {
      id: `tx_inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: payload.title,
      amount: payload.amount,
      type: 'INFLOW',
      category: (payload.category as any) || 'OtherIncome',
      dateString: payload.dateString || getTodayDateString(),
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
        { storageKey: 'paios_budget_profile_v1', recordId: 'profile' },
      ],
      createdRecordIds: [tx.id],
      summary: `Recorded income of ₹${payload.amount} ("${payload.title}")`,
    };
  }

  private static executeRecordMedicationEvent(payload: RecordMedicationEventPayload): ExecutionResult {
    const today = getTodayDateString();
    const doses = PAIOSStorage.getDoseEvents();
    let target = doses.find((d) => d.id === payload.doseEventId);

    if (!target && payload.medicationId) {
      target = doses.find((d) => d.medicationId === payload.medicationId && d.scheduledDateString === today);
    }
    if (!target && payload.medicationName) {
      target = doses.find(
        (d) =>
          d.medicationName.toLowerCase().includes(payload.medicationName!.toLowerCase()) &&
          d.scheduledDateString === today
      );
    }

    if (!target) {
      return {
        success: false,
        affectedRecords: [],
        createdRecordIds: [],
        error: 'Scheduled dose event not found for today',
        summary: 'Scheduled dose not found',
      };
    }

    PAIOSStorage.logDoseEvent(target.id, payload.status as DoseStatus, payload.note);

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_dose_events_v1', recordId: target.id }],
      createdRecordIds: [],
      summary: `Recorded ${target.medicationName} as ${payload.status}`,
    };
  }

  private static executeRecordSymptom(payload: RecordSymptomPayload): ExecutionResult {
    const vital = PAIOSStorage.logVitalSign({
      symptoms: payload.symptomName,
      dizzinessSeverity: /dizzy/i.test(payload.symptomName) ? payload.severity || 3 : undefined,
      note: payload.notes || `Logged severity ${payload.severity || 'unrated'} via Action Assistant`,
    });

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_vitals_v1', recordId: vital.id }],
      createdRecordIds: [vital.id],
      summary: `Recorded symptom: "${payload.symptomName}" (Severity: ${payload.severity || 'N/A'})`,
    };
  }

  private static executeRecordVital(payload: RecordVitalPayload): ExecutionResult {
    const vital = PAIOSStorage.logVitalSign({
      systolicBp: payload.systolicBp,
      diastolicBp: payload.diastolicBp,
      restingHeartRate: payload.restingHeartRate,
      weightKg: payload.weightKg,
      note: payload.notes || 'Recorded via Action Assistant',
    });

    return {
      success: true,
      affectedRecords: [{ storageKey: 'paios_vitals_v1', recordId: vital.id }],
      createdRecordIds: [vital.id],
      summary: `Recorded vitals: BP ${payload.systolicBp || '-'}/${payload.diastolicBp || '-'}, HR ${payload.restingHeartRate || '-'}`,
    };
  }
}
