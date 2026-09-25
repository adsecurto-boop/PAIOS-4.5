import { PAIOSStorage, getTodayDateString } from '../../storage';
import { Task, DoseEvent, ActivityLog, AdaptiveTimetableBlock, ExpenseTransaction } from '../../types';
import { ClarificationRequest, ClarificationOption } from './actionTypes';

export interface ResolvedTaskMatch {
  task?: Task;
  ambiguous: boolean;
  candidates: Task[];
  clarificationRequest?: ClarificationRequest;
}

export interface ResolvedDoseMatch {
  doseEvent?: DoseEvent;
  ambiguous: boolean;
  candidates: DoseEvent[];
  clarificationRequest?: ClarificationRequest;
}

export interface ScopedResolutionContext {
  activeTasks: Task[];
  activeActivity: ActivityLog | null;
  todayDoseEvents: DoseEvent[];
  todayTimetable: AdaptiveTimetableBlock[];
  recentExpenses: ExpenseTransaction[];
  currentDateString: string;
}

export class ActionContextResolver {
  /**
   * Builds lightweight scoped context from current storage state
   */
  static getScopedContext(): ScopedResolutionContext {
    const today = getTodayDateString();
    const tasks = PAIOSStorage.getTasks().filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    const activeActivity = PAIOSStorage.getActiveActivity();
    const doseEvents = PAIOSStorage.getDoseEvents().filter((d) => d.scheduledDateString === today);
    const timetable = PAIOSStorage.getAdaptiveTimetable()?.blocks || [];
    const expenses = PAIOSStorage.getExpenseTransactions().slice(-10);

    return {
      activeTasks: tasks,
      activeActivity,
      todayDoseEvents: doseEvents,
      todayTimetable: timetable,
      recentExpenses: expenses,
      currentDateString: today,
    };
  }

  /**
   * Resolves a task reference by name or query against active tasks
   */
  static resolveTask(query: string, context?: ScopedResolutionContext): ResolvedTaskMatch {
    const ctx = context || this.getScopedContext();
    const cleanQuery = query.toLowerCase().trim();

    if (!cleanQuery) {
      return { ambiguous: false, candidates: [] };
    }

    // 1. Exact match
    const exactMatches = ctx.activeTasks.filter(
      (t) => t.title.toLowerCase().trim() === cleanQuery
    );
    if (exactMatches.length === 1) {
      return { task: exactMatches[0], ambiguous: false, candidates: exactMatches };
    }
    if (exactMatches.length > 1) {
      return this.createTaskAmbiguityResult(exactMatches, query);
    }

    // 2. Substring / Prefix match
    const partialMatches = ctx.activeTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(cleanQuery) ||
        cleanQuery.includes(t.title.toLowerCase())
    );

    if (partialMatches.length === 1) {
      return { task: partialMatches[0], ambiguous: false, candidates: partialMatches };
    }
    if (partialMatches.length > 1) {
      return this.createTaskAmbiguityResult(partialMatches, query);
    }

    // 3. Token-based word overlap
    const queryTokens = cleanQuery.split(/\s+/).filter((tok) => tok.length > 2);
    if (queryTokens.length > 0) {
      const tokenMatches = ctx.activeTasks.filter((t) => {
        const titleLower = t.title.toLowerCase();
        return queryTokens.some((tok) => titleLower.includes(tok));
      });

      if (tokenMatches.length === 1) {
        return { task: tokenMatches[0], ambiguous: false, candidates: tokenMatches };
      }
      if (tokenMatches.length > 1) {
        return this.createTaskAmbiguityResult(tokenMatches, query);
      }
    }

    return { ambiguous: false, candidates: [] };
  }

  /**
   * Resolves a scheduled medication dose reference
   */
  static resolveDoseEvent(
    medicationQuery?: string,
    slotOrTime?: string,
    context?: ScopedResolutionContext
  ): ResolvedDoseMatch {
    const ctx = context || this.getScopedContext();
    const activeDoses = ctx.todayDoseEvents.filter((d) => d.status === 'SCHEDULED');

    if (activeDoses.length === 0) {
      return { ambiguous: false, candidates: [] };
    }

    let matches = activeDoses;

    if (medicationQuery && medicationQuery !== 'all_due' && medicationQuery !== 'medication') {
      const cleanMed = medicationQuery.toLowerCase().trim();
      matches = matches.filter(
        (d) =>
          d.medicationName.toLowerCase().includes(cleanMed) ||
          d.medicationId.toLowerCase() === cleanMed
      );
    }

    if (slotOrTime) {
      const cleanSlot = slotOrTime.toLowerCase().trim();
      if (cleanSlot.includes('morning')) {
        matches = matches.filter((d) => d.scheduledTime < '12:00');
      } else if (cleanSlot.includes('afternoon')) {
        matches = matches.filter((d) => d.scheduledTime >= '12:00' && d.scheduledTime < '17:00');
      } else if (cleanSlot.includes('evening') || cleanSlot.includes('night')) {
        matches = matches.filter((d) => d.scheduledTime >= '17:00');
      } else if (/^\d{2}:\d{2}$/.test(cleanSlot)) {
        matches = matches.filter((d) => d.scheduledTime === cleanSlot);
      }
    }

    if (matches.length === 1) {
      return { doseEvent: matches[0], ambiguous: false, candidates: matches };
    }

    if (matches.length > 1) {
      return this.createDoseAmbiguityResult(matches, medicationQuery || 'medication');
    }

    return { ambiguous: false, candidates: [] };
  }

  /**
   * Detects whether an identical financial transaction was logged recently (< 10 minutes)
   */
  static checkDuplicateExpense(amount: number, title: string, context?: ScopedResolutionContext): boolean {
    const ctx = context || this.getScopedContext();
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const cleanTitle = title.toLowerCase().trim();

    return ctx.recentExpenses.some((tx) => {
      return (
        tx.amount === amount &&
        tx.title.toLowerCase().trim() === cleanTitle &&
        tx.timestampMillis >= tenMinutesAgo
      );
    });
  }

  private static createTaskAmbiguityResult(candidates: Task[], query: string): ResolvedTaskMatch {
    const options: ClarificationOption[] = candidates.slice(0, 5).map((t) => ({
      id: String(t.id),
      label: t.title,
      description: `${t.category} · Priority: ${t.priority}${t.dueDateMillis ? ` · Due: ${new Date(t.dueDateMillis).toLocaleDateString()}` : ''}`,
      data: t,
    }));

    const clarificationRequest: ClarificationRequest = {
      id: `clarify_task_${Date.now()}`,
      prompt: `Multiple tasks matched "${query}". Which task did you mean?`,
      parameterName: 'taskId',
      actionType: 'UPDATE_TASK',
      options,
    };

    return {
      ambiguous: true,
      candidates,
      clarificationRequest,
    };
  }

  private static createDoseAmbiguityResult(candidates: DoseEvent[], query: string): ResolvedDoseMatch {
    const options: ClarificationOption[] = candidates.map((d) => ({
      id: d.id,
      label: `${d.medicationName} (${d.dosage})`,
      description: `Scheduled for ${d.scheduledTime} today`,
      data: d,
    }));

    const clarificationRequest: ClarificationRequest = {
      id: `clarify_med_${Date.now()}`,
      prompt: `Multiple scheduled doses matched "${query}". Which medication dose did you take?`,
      parameterName: 'doseEventId',
      actionType: 'RECORD_MEDICATION_EVENT',
      options,
    };

    return {
      ambiguous: true,
      candidates,
      clarificationRequest,
    };
  }
}
