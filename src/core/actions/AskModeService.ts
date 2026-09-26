import { PAIOSStorage } from '../../storage';

export interface AskResponse {
  answer: string;
  suggestsActMode?: boolean;
  suggestedPrompt?: string;
  contextUsed?: string[];
}

export interface AskOptions {
  context?: string;
}

/**
 * AskModeService
 * Dedicated, structurally read-only advisory and Q&A service.
 * Enforces zero-mutation invariant: can NEVER execute actions or modify state.
 * When a user query expresses mutation intent, it advises switching to Act mode with the suggested prompt.
 */
export class AskModeService {
  private static MUTATION_INTENT_PATTERNS = [
    /\b(create|add|new|schedule|reschedule|postpone)\b.*\b(task|block|event|note|reminder)\b/i,
    /\b(log|record|track|spend|spent|save)\b.*\b(expense|income|money|rupees|₹|\$)\b/i,
    /\b(take|taken|log|record)\b.*\b(dose|med|medication|pill|tablet)\b/i,
    /\b(start|pause|resume|finish|stop)\b.*\b(session|focus|activity|timer)\b/i,
    /\b(replan|reschedule|optimize)\b.*\b(day|schedule|timetable)\b/i,
    /\b(complete|finish|done|check off|mark)\b.*\b(task)\b/i,
    /\b(log|record)\b.*\b(vital|bp|blood pressure|symptom|heart rate|weight)\b/i,
  ];

  /**
   * Evaluates if query intends to mutate application state.
   */
  static detectMutationIntent(query: string): boolean {
    return this.MUTATION_INTENT_PATTERNS.some((pattern) => pattern.test(query));
  }

  /**
   * Processes a read-only query or question in Ask mode.
   * NEVER invokes ActionTransactionManager or mutates storage.
   */
  static async ask(query: string, options?: AskOptions): Promise<AskResponse> {
    if (!query || !query.trim()) {
      return { answer: 'Please enter a question or query.' };
    }

    const trimmed = query.trim();
    const isMutation = this.detectMutationIntent(trimmed);

    if (isMutation) {
      return {
        answer: `It looks like you want to perform an action ("${trimmed}"). Ask mode is read-only. Switch to "Act" mode to preview and execute this action safely.`,
        suggestsActMode: true,
        suggestedPrompt: trimmed,
      };
    }

    // Read-only briefing/Q&A logic
    const contextLines: string[] = [];
    const lower = trimmed.toLowerCase();

    if (lower.includes('task') || lower.includes('todo')) {
      const tasks = PAIOSStorage.getTasks();
      const open = tasks.filter((t) => !t.completed && t.status !== 'COMPLETED');
      contextLines.push(`You currently have ${open.length} active tasks.`);
    }

    if (lower.includes('med') || lower.includes('dose') || lower.includes('health')) {
      const doses = PAIOSStorage.getDoseEvents();
      const remaining = doses.filter((d) => d.status === 'SCHEDULED');
      contextLines.push(`You have ${remaining.length} doses scheduled for today.`);
    }

    if (lower.includes('schedule') || lower.includes('today') || lower.includes('time')) {
      const timetable = PAIOSStorage.getAdaptiveTimetable();
      const count = timetable?.blocks?.length || 0;
      contextLines.push(`Your timetable for today has ${count} planned blocks.`);
    }

    const summary = contextLines.length > 0
      ? `Here is your current information:\n- ${contextLines.join('\n- ')}`
      : `Based on your PAIOS workspace: no direct records matched "${trimmed}". Ask me about your tasks, medications, schedule, or switch to Act mode to perform changes.`;

    return {
      answer: summary,
      suggestsActMode: false,
      contextUsed: contextLines,
    };
  }
}
