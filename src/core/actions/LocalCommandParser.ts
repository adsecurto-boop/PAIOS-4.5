import {
  ActionType,
  ProposedAction,
  InterpretationResult,
  CreateTaskPayload,
  CompleteTaskPayload,
  RescheduleTaskPayload,
  StartFocusSessionPayload,
  RecordExpensePayload,
  RecordIncomePayload,
  RecordMedicationEventPayload,
  RecordSymptomPayload,
  RecordVitalPayload,
  NavigatePayload,
  SearchPayload,
  CreateQuickCapturePayload,
  CreateJournalEntryPayload,
  CreateTimetableBlockPayload,
  generateSecureUUID,
} from './actionTypes';
import { ActionRiskPolicy } from './ActionRiskPolicy';
import { ActionContextResolver, ScopedResolutionContext } from './ActionContextResolver';
import { getSyncDeviceId, getSyncMetadata } from '../../utils/recordSync';
import { getTodayDateString } from '../../storage';

function generateActionId(): string {
  return `act_${generateSecureUUID()}`;
}

function generateTransactionId(): string {
  return `tx_${generateSecureUUID()}`;
}

function getTomorrowMillis(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

export class LocalCommandParser {
  /**
   * Main entrypoint for local parsing.
   * Returns an InterpretationResult with confidence 0.0 to 1.0.
   */
  static parse(text: string, context?: ScopedResolutionContext): InterpretationResult {
    const rawText = text.trim();
    if (!rawText) {
      return { confidence: 0, actions: [], rawText, tier: 'LOCAL_PARSER' };
    }

    const ctx = context || ActionContextResolver.getScopedContext();
    const txId = generateTransactionId();
    const deviceId = getSyncDeviceId();
    const metadata = getSyncMetadata();

    // 0. Safety Boundary: Block dosage modifications or dangerous requests immediately
    if (/\b(double.*dose|take.*two.*pills|take.*extra.*pill|increase.*dose|decrease.*dose|change.*dosage|stop.*taking.*medication)\b/i.test(rawText)) {
      return {
        confidence: 1.0,
        actions: [],
        rawText,
        tier: 'LOCAL_PARSER',
        safetyNotice: '⚠️ MEDICAL SAFETY: PAIOS cannot prescribe, alter, or adjust medication dosages. Never double up on a missed dose. Please consult your physician.',
      };
    }

    // 1. Navigation Commands
    // "go to health", "open settings", "show tasks", "navigate today"
    const navMatch = rawText.match(/^(?:go\s+to|open|show|navigate\s+to)\s+(today|timeline|plan|tasks|plugins|tools|health|learn|study|insights|ai|assistant|journal|settings)\b/i);
    if (navMatch) {
      const target = navMatch[1].toLowerCase();
      let tabName = 'TODAY';
      if (['today'].includes(target)) tabName = 'TODAY';
      else if (['timeline', 'plan'].includes(target)) tabName = 'TIMELINE';
      else if (['tasks'].includes(target)) tabName = 'TASKS';
      else if (['plugins', 'tools'].includes(target)) tabName = 'PLUGINS';
      else if (['health'].includes(target)) tabName = 'HEALTH';
      else if (['learn', 'study'].includes(target)) tabName = 'LEARN';
      else if (['insights'].includes(target)) tabName = 'INSIGHTS';
      else if (['ai', 'assistant'].includes(target)) tabName = 'AI';
      else if (['journal'].includes(target)) tabName = 'JOURNAL';
      else if (['settings'].includes(target)) tabName = 'SETTINGS';

      const payload: NavigatePayload = { tab: tabName as any };
      const action = this.buildProposedAction('NAVIGATE', payload, txId, deviceId, rawText, `Navigate to ${tabName}`, metadata);
      return { confidence: 0.98, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 2. Search Commands
    // "search groceries", "find presentation", "search for receipts"
    const searchMatch = rawText.match(/^(?:search(?:\s+for)?|find)\s+(.+)$/i);
    if (searchMatch && !/^(?:a\s+|an\s+)?focus\b/i.test(searchMatch[1])) {
      const query = searchMatch[1].trim();
      const payload: SearchPayload = { query };
      const action = this.buildProposedAction('SEARCH', payload, txId, deviceId, rawText, `Search for "${query}"`, metadata);
      return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 3. Medication Intake Commands
    // "I took my evening medication", "took Metformin", "mark morning vitamins as taken", "took dose"
    const medTakenMatch = rawText.match(/^(?:i\s+)?(?:took|taken|mark.*taken|log.*taken)\s+(?:my\s+)?(.+)?$/i);
    if (medTakenMatch || /^(?:i\s+)?took\s+my\s+(morning|afternoon|evening|night)\s+med(?:ication)?/i.test(rawText)) {
      const queryPart = medTakenMatch?.[1]?.trim() || '';
      let slot: string | undefined;
      if (/\bmorning\b/i.test(rawText)) slot = 'morning';
      else if (/\bafternoon\b/i.test(rawText)) slot = 'afternoon';
      else if (/\bevening|night\b/i.test(rawText)) slot = 'evening';

      const doseMatch = ActionContextResolver.resolveDoseEvent(queryPart || undefined, slot, ctx);

      if (doseMatch.ambiguous && doseMatch.clarificationRequest) {
        return {
          confidence: 0.85,
          actions: [],
          clarificationNeeded: doseMatch.clarificationRequest,
          rawText,
          tier: 'LOCAL_PARSER',
          explanation: `Please select which scheduled medication you took.`,
        };
      }

      if (doseMatch.doseEvent) {
        const payload: RecordMedicationEventPayload = {
          doseEventId: doseMatch.doseEvent.id,
          medicationId: doseMatch.doseEvent.medicationId,
          medicationName: doseMatch.doseEvent.medicationName,
          status: 'TAKEN',
          scheduledDateString: doseMatch.doseEvent.scheduledDateString,
          scheduledTime: doseMatch.doseEvent.scheduledTime,
          actualTakenTimeMillis: Date.now(),
          note: 'Recorded via Local Command Parser',
        };
        const action = this.buildProposedAction(
          'RECORD_MEDICATION_EVENT',
          payload,
          txId,
          deviceId,
          rawText,
          `Record ${doseMatch.doseEvent.medicationName} as Taken`,
          metadata,
          [doseMatch.doseEvent.id]
        );
        return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
      }

      // If no active doses found or unknown
      return {
        confidence: 0.6,
        actions: [],
        rawText,
        tier: 'LOCAL_PARSER',
        explanation: 'No scheduled medication matching your request was found for today.',
      };
    }

    // 4. Financial Transactions
    // "I spent ₹850 on groceries", "spent 45 for lunch", "paid 1200 electricity"
    const expenseMatch = rawText.match(/(?:i\s+)?(?:spent|spend|paid)\s+(?:₹|\$|€|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:on|for)?\s*(.*)$/i);
    if (expenseMatch) {
      const amount = parseFloat(expenseMatch[1]);
      let title = expenseMatch[2]?.trim() || 'Uncategorized expense';
      let category = 'Other';

      if (/grocer|food|lunch|dinner|breakfast|snack|coffee|tea|cafe/i.test(title)) category = 'Food';
      else if (/uber|cab|metro|bus|train|fuel|petrol|diesel|travel|flight/i.test(title)) category = 'Travel';
      else if (/doctor|med|pharmacy|hospital|health|lab/i.test(title)) category = 'Health';
      else if (/rent|maintenance|house|electricity|water|wifi|bill/i.test(title)) category = 'Housing';
      else if (/course|book|learn|exam|cert/i.test(title)) category = 'Learning';
      else if (/movie|game|show|concert/i.test(title)) category = 'Entertainment';

      const now = new Date();
      const payload: RecordExpensePayload = {
        amount,
        title: title || 'Expense',
        category,
        dateString: getTodayDateString(),
        timeString: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        isNecessity: ['Food', 'Health', 'Housing'].includes(category),
      };

      const action = this.buildProposedAction(
        'RECORD_EXPENSE',
        payload,
        txId,
        deviceId,
        rawText,
        `Record expense of ₹${amount} for ${title}`,
        metadata
      );
      return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // Income: "received 5000 freelance", "earned 2500"
    const incomeMatch = rawText.match(/(?:i\s+)?(?:received|earned|deposit)\s+(?:₹|\$|€|rs\.?\s*)?(\d+(?:\.\d+)?)\s*(?:from|for)?\s*(.*)$/i);
    if (incomeMatch) {
      const amount = parseFloat(incomeMatch[1]);
      let title = incomeMatch[2]?.trim() || 'Income';
      const now = new Date();
      const payload: RecordIncomePayload = {
        amount,
        title: title || 'Income',
        category: /freelance/i.test(title) ? 'Freelance' : /salary/i.test(title) ? 'Salary' : 'OtherIncome',
        dateString: getTodayDateString(),
        timeString: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      };

      const action = this.buildProposedAction(
        'RECORD_INCOME',
        payload,
        txId,
        deviceId,
        rawText,
        `Record income of ₹${amount} (${title})`,
        metadata
      );
      return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 5. Focus Session Controls
    // "start a 25-minute focus session on coding", "start focus session", "start focus"
    const startFocusMatch = rawText.match(/^(?:start|begin)\s+(?:a\s+)?(?:(\d+)[-\s]min(?:ute)?s?\s+)?focus(?:\s+session)?(?:\s+(?:on|for)\s+(.+))?$/i);
    if (startFocusMatch) {
      const duration = startFocusMatch[1] ? parseInt(startFocusMatch[1], 10) : 25;
      const name = startFocusMatch[2]?.trim() || 'Deep Work';
      const payload: StartFocusSessionPayload = {
        name,
        durationMinutes: duration,
        category: 'Work',
      };
      const action = this.buildProposedAction(
        'START_FOCUS_SESSION',
        payload,
        txId,
        deviceId,
        rawText,
        `Start ${duration}-min focus session: "${name}"`,
        metadata
      );
      return { confidence: 0.96, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    if (/^(?:pause\s+focus|pause\s+timer|pause\s+session)$/i.test(rawText)) {
      const action = this.buildProposedAction('PAUSE_FOCUS_SESSION', {}, txId, deviceId, rawText, 'Pause Focus Session', metadata);
      return { confidence: 0.98, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    if (/^(?:resume\s+focus|resume\s+timer|resume\s+session)$/i.test(rawText)) {
      const action = this.buildProposedAction('RESUME_FOCUS_SESSION', {}, txId, deviceId, rawText, 'Resume Focus Session', metadata);
      return { confidence: 0.98, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    if (/^(?:finish\s+focus|stop\s+focus|complete\s+focus|end\s+focus)$/i.test(rawText)) {
      const action = this.buildProposedAction('FINISH_FOCUS_SESSION', {}, txId, deviceId, rawText, 'Finish Focus Session', metadata);
      return { confidence: 0.98, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 6. Complete Task Commands
    // "complete task call doctor", "finish task report", "done with call doctor"
    const completeMatch = rawText.match(/^(?:complete|finish|done\s+with)\s+(?:task\s+)?(.+)$/i);
    if (completeMatch) {
      const taskQuery = completeMatch[1].trim();
      const taskMatch = ActionContextResolver.resolveTask(taskQuery, ctx);

      if (taskMatch.ambiguous && taskMatch.clarificationRequest) {
        return {
          confidence: 0.85,
          actions: [],
          clarificationNeeded: taskMatch.clarificationRequest,
          rawText,
          tier: 'LOCAL_PARSER',
          explanation: `Multiple tasks matched "${taskQuery}". Please choose the one to complete.`,
        };
      }

      if (taskMatch.task) {
        const payload: CompleteTaskPayload = { taskId: taskMatch.task.id };
        const action = this.buildProposedAction(
          'COMPLETE_TASK',
          payload,
          txId,
          deviceId,
          rawText,
          `Complete task: "${taskMatch.task.title}"`,
          metadata,
          [String(taskMatch.task.id)]
        );
        return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
      }
    }

    // 7. Reschedule / Move Task Commands
    // "move task call doctor to tomorrow", "reschedule report to tomorrow", "move my unfinished work to tomorrow"
    const moveMatch = rawText.match(/^(?:move|reschedule|postpone|delay)\s+(?:task\s+)?(.+?)\s+to\s+(tomorrow|\d{4}-\d{2}-\d{2})$/i);
    if (moveMatch) {
      const taskQuery = moveMatch[1].trim();
      const targetDate = moveMatch[2].toLowerCase();
      const newDueDate = targetDate === 'tomorrow' ? getTomorrowMillis() : new Date(`${targetDate}T12:00:00`).getTime();

      // Bulk rollover: "move my unfinished work to tomorrow"
      if (/^(?:my\s+)?(?:unfinished\s+work|pending\s+tasks|all\s+tasks)$/i.test(taskQuery)) {
        const openTasks = ctx.activeTasks;
        if (openTasks.length === 0) {
          return { confidence: 0.9, actions: [], rawText, tier: 'LOCAL_PARSER', explanation: 'No unfinished tasks to move.' };
        }

        const actions: ProposedAction[] = openTasks.map((t) => {
          const payload: RescheduleTaskPayload = { taskId: t.id, dueDateMillis: newDueDate, newDateString: 'Tomorrow' };
          return this.buildProposedAction(
            'RESCHEDULE_TASK',
            payload,
            txId,
            deviceId,
            rawText,
            `Move "${t.title}" to tomorrow`,
            metadata,
            [String(t.id)]
          );
        });

        return { confidence: 0.92, actions, rawText, tier: 'LOCAL_PARSER' };
      }

      const taskMatch = ActionContextResolver.resolveTask(taskQuery, ctx);
      if (taskMatch.ambiguous && taskMatch.clarificationRequest) {
        return {
          confidence: 0.85,
          actions: [],
          clarificationNeeded: taskMatch.clarificationRequest,
          rawText,
          tier: 'LOCAL_PARSER',
          explanation: `Multiple tasks matched "${taskQuery}". Which one should be rescheduled?`,
        };
      }

      if (taskMatch.task) {
        const payload: RescheduleTaskPayload = { taskId: taskMatch.task.id, dueDateMillis: newDueDate };
        const action = this.buildProposedAction(
          'RESCHEDULE_TASK',
          payload,
          txId,
          deviceId,
          rawText,
          `Move "${taskMatch.task.title}" to ${targetDate}`,
          metadata,
          [String(taskMatch.task.id)]
        );
        return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
      }
    }

    // 8. Create Task Commands
    // "add a high-priority task to call the doctor tomorrow"
    // "create task finish report"
    // "add task buy milk"
    const addTaskMatch = rawText.match(/^(?:add|create|remind\s+me\s+to)\s+(?:(?:a|an)\s+)?(?:(high|critical|normal|low)[-\s]priority\s+)?task\s+(?:to\s+)?(.+)$/i);
    if (addTaskMatch) {
      const priorityRaw = addTaskMatch[1]?.toUpperCase() || 'NORMAL';
      let taskTitle = addTaskMatch[2].trim();
      let dueDateMillis: number | null = null;

      // Extract "tomorrow" or date from end of title
      if (/\s+tomorrow$/i.test(taskTitle)) {
        dueDateMillis = getTomorrowMillis();
        taskTitle = taskTitle.replace(/\s+tomorrow$/i, '').trim();
      }

      const payload: CreateTaskPayload = {
        title: taskTitle,
        priority: priorityRaw as any,
        category: 'Personal',
        dueDateMillis,
      };

      const action = this.buildProposedAction(
        'CREATE_TASK',
        payload,
        txId,
        deviceId,
        rawText,
        `Add task: "${taskTitle}" (${priorityRaw} priority)`,
        metadata
      );
      return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 9. Quick Capture / Note
    // "capture that I felt dizzy after lunch", "note that client requested invoice"
    const captureMatch = rawText.match(/^(?:capture|note|quick\s+note)(?:\s+that)?\s+(.+)$/i);
    if (captureMatch) {
      const noteText = captureMatch[1].trim();
      // Check if it's describing dizziness / symptom
      if (/\b(dizzy|nausea|headache|fever|pain|cramp|fatigue)\b/i.test(noteText)) {
        const payload: RecordSymptomPayload = {
          symptomName: noteText,
          severity: 3,
        };
        const action = this.buildProposedAction('RECORD_SYMPTOM', payload, txId, deviceId, rawText, `Record symptom: "${noteText}"`, metadata);
        return { confidence: 0.9, actions: [action], rawText, tier: 'LOCAL_PARSER' };
      }

      const payload: CreateQuickCapturePayload = { text: noteText, category: 'Personal' };
      const action = this.buildProposedAction('CREATE_QUICK_CAPTURE', payload, txId, deviceId, rawText, `Quick capture: "${noteText}"`, metadata);
      return { confidence: 0.95, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 10. Journal reflection
    // "journal had a productive day", "reflect on..."
    const journalMatch = rawText.match(/^(?:journal|reflect(?:\s+on)?)\s*:\s*(.+)$/i) || rawText.match(/^journal\s+(.+)$/i);
    if (journalMatch) {
      const content = journalMatch[1].trim();
      const payload: CreateJournalEntryPayload = {
        title: `Reflection · ${getTodayDateString()}`,
        content,
        moodScore: 7,
        category: 'Personal',
      };
      const action = this.buildProposedAction('CREATE_JOURNAL_ENTRY', payload, txId, deviceId, rawText, 'Add Journal Reflection', metadata);
      return { confidence: 0.92, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // 11. Schedule block: "schedule two hours for exam preparation this weekend"
    const scheduleMatch = rawText.match(/^schedule\s+(?:(\d+|two|three|four)\s+hours?|(\d+)\s+mins?)\s+(?:for\s+)?(.+)$/i);
    if (scheduleMatch) {
      let durationMins = 60;
      if (scheduleMatch[1]) {
        const h = scheduleMatch[1].toLowerCase();
        durationMins = h === 'two' ? 120 : h === 'three' ? 180 : h === 'four' ? 240 : parseInt(h, 10) * 60;
      } else if (scheduleMatch[2]) {
        durationMins = parseInt(scheduleMatch[2], 10);
      }
      const activity = scheduleMatch[3].trim();
      const payload: CreateTimetableBlockPayload = {
        start: '10:00',
        end: '12:00',
        duration_minutes: durationMins,
        activity,
        category: 'Study',
      };
      const action = this.buildProposedAction(
        'CREATE_TIMETABLE_BLOCK',
        payload,
        txId,
        deviceId,
        rawText,
        `Schedule ${durationMins}m for "${activity}"`,
        metadata
      );
      return { confidence: 0.88, actions: [action], rawText, tier: 'LOCAL_PARSER' };
    }

    // Low confidence: defer to Tier 2 AI Interpreter
    return {
      confidence: 0.1,
      actions: [],
      rawText,
      tier: 'AI_INTERPRETER',
      explanation: 'Command requires conversational interpretation.',
    };
  }

  private static buildProposedAction(
    type: ActionType,
    payload: any,
    txId: string,
    deviceId: string,
    sourceText: string,
    title: string,
    metadata: any,
    affectedRecordIds: string[] = []
  ): ProposedAction {
    const riskEval = ActionRiskPolicy.evaluateActionRisk(type, payload);
    return {
      id: generateActionId(),
      transactionId: txId,
      type,
      payload,
      risk: riskEval.risk,
      title,
      explanation: riskEval.reasons.join('. ') || title,
      sourceText,
      affectedRecordIds,
      expectedRevisions: {},
      requiresConfirmation: riskEval.requiresConfirmation,
      validationState: 'VALID',
      createdAt: Date.now(),
      originDeviceId: deviceId,
    };
  }
}
