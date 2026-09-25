import { ProactiveSuggestion, ProposedAction } from './actionTypes';
import { PAIOSStorage, getTodayDateString } from '../../storage';
import { PROACTIVE_PREFERENCES_KEY } from './actionStorage';

export interface ProactivePreferences {
  disabledTypes: string[];
  dismissedUntil: Record<string, number>; // type -> timestamp
}

export class ProactiveAssistant {
  /**
   * Evaluates local state and returns at most ONE primary proactive suggestion
   */
  static getPrimarySuggestion(): ProactiveSuggestion | null {
    const settings = PAIOSStorage.getSettings();
    const prefs = this.getPreferences();

    // Check Quiet Hours
    if (settings.notificationQuietHoursEnabled) {
      const now = new Date();
      const currentHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const start = settings.notificationQuietHoursStart || '22:30';
      const end = settings.notificationQuietHoursEnd || '07:30';

      if (start > end) {
        // Over midnight, e.g. 22:30 to 07:30
        if (currentHM >= start || currentHM <= end) return null;
      } else {
        if (currentHM >= start && currentHM <= end) return null;
      }
    }

    // Do not interrupt active focus sessions
    const activeActivity = PAIOSStorage.getActiveActivity();
    if (activeActivity && !activeActivity.isPaused) {
      return null;
    }

    const today = getTodayDateString();
    const nowTime = Date.now();

    // 1. Upcoming Medication Window Check
    if (!this.isTypeMuted('MEDICATION_DUE', prefs, nowTime)) {
      const doses = PAIOSStorage.getDoseEvents();
      const nowHM = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const pendingDose = doses.find((d) => {
        return (
          d.scheduledDateString === today &&
          d.status === 'SCHEDULED' &&
          d.scheduledTime <= nowHM
        );
      });

      if (pendingDose) {
        return {
          id: `sugg_med_${pendingDose.id}`,
          type: 'MEDICATION_DUE',
          title: `Scheduled Dose: ${pendingDose.medicationName}`,
          reason: `Your ${pendingDose.dosage} dose of ${pendingDose.medicationName} was scheduled for ${pendingDose.scheduledTime}.`,
          timestamp: nowTime,
        };
      }
    }

    // 2. Overdue Priority Task Check
    if (!this.isTypeMuted('OVERDUE_PRIORITY', prefs, nowTime)) {
      const tasks = PAIOSStorage.getTasks();
      const overduePriority = tasks.find(
        (t) =>
          (t.priority === 'HIGH' || t.priority === 'CRITICAL' || t.isPriorityPin) &&
          t.status !== 'COMPLETED' &&
          t.status !== 'CANCELLED' &&
          t.dueDateMillis &&
          t.dueDateMillis < nowTime
      );

      if (overduePriority) {
        return {
          id: `sugg_task_${overduePriority.id}`,
          type: 'OVERDUE_PRIORITY',
          title: `Priority Task: "${overduePriority.title}"`,
          reason: `Marked ${overduePriority.priority} priority, due on ${new Date(overduePriority.dueDateMillis!).toLocaleDateString()}.`,
          timestamp: nowTime,
        };
      }
    }

    // 3. Evening Review Reminder
    if (!this.isTypeMuted('EVENING_REVIEW_INCOMPLETE', prefs, nowTime)) {
      const currentHour = new Date().getHours();
      if (currentHour >= 20) {
        const reviews = PAIOSStorage.getReviews();
        const todayReview = Array.isArray(reviews)
          ? reviews.find((r) => r.dateString === today)
          : (reviews as any)?.[today];
        if (!todayReview) {
          return {
            id: `sugg_review_${today}`,
            type: 'EVENING_REVIEW_INCOMPLETE',
            title: 'Evening Reflection & Review',
            reason: 'Take a quiet 3 minutes to reflect on today’s achievements and prepare for tomorrow.',
            timestamp: nowTime,
          };
        }
      }
    }

    return null;
  }

  static dismissSuggestion(suggestionId: string, type: string, action: 'DISMISS' | 'REMIND_LATER' | 'DONT_SUGGEST_AGAIN'): void {
    const prefs = this.getPreferences();
    const now = Date.now();

    if (action === 'DONT_SUGGEST_AGAIN') {
      if (!prefs.disabledTypes.includes(type)) {
        prefs.disabledTypes.push(type);
      }
    } else if (action === 'REMIND_LATER') {
      // Mute for 2 hours
      prefs.dismissedUntil[type] = now + 2 * 60 * 60 * 1000;
    } else {
      // Mute for 4 hours
      prefs.dismissedUntil[type] = now + 4 * 60 * 60 * 1000;
    }

    this.savePreferences(prefs);
  }

  private static isTypeMuted(type: string, prefs: ProactivePreferences, now: number): boolean {
    if (prefs.disabledTypes.includes(type)) return true;
    const until = prefs.dismissedUntil[type];
    return until ? until > now : false;
  }

  private static getPreferences(): ProactivePreferences {
    if (typeof localStorage === 'undefined') {
      return { disabledTypes: [], dismissedUntil: {} };
    }
    try {
      const raw = localStorage.getItem(PROACTIVE_PREFERENCES_KEY);
      return raw ? JSON.parse(raw) : { disabledTypes: [], dismissedUntil: {} };
    } catch {
      return { disabledTypes: [], dismissedUntil: {} };
    }
  }

  private static savePreferences(prefs: ProactivePreferences): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(PROACTIVE_PREFERENCES_KEY, JSON.stringify(prefs));
      } catch {}
    }
  }
}
