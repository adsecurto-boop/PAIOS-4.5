import { DoseEvent, DoseStatus, RefillInventory } from '../../types';

export interface DoseWindowResult {
  targetTime: string;
  windowStartTime: string;
  isFutureLocked: boolean;
  isWithinWindow: boolean;
  isPastWindow: boolean;
}

export interface DoseSlotActionState {
  isCompleted: boolean;
  isSkipped: boolean;
  isLockedFuture: boolean;
  isOutOfSupply: boolean;
  canTake: boolean;
  targetTime: string;
  windowStartTime: string;
  actualTakenFormatted: string;
}

export class DoseLedgerEngine {
  /**
   * Calculates the administration time window for a scheduled dose slot.
   * Default window opens 2 hours before scheduled time.
   */
  public static calculateDoseWindow(
    scheduledTime: string,
    windowHoursBefore: number = 2,
    currentTime: Date = new Date()
  ): DoseWindowResult {
    const cleanTime = (scheduledTime || '08:00').trim();
    const [schedHour, schedMin] = cleanTime.split(':').map((v) => parseInt(v, 10) || 0);

    const windowStartHour = Math.max(0, schedHour - windowHoursBefore);
    const windowStartTime = `${String(windowStartHour).padStart(2, '0')}:${String(schedMin).padStart(2, '0')}`;

    const currentHour = currentTime.getHours();
    const currentMin = currentTime.getMinutes();

    const currentTotalMins = currentHour * 60 + currentMin;
    const windowStartTotalMins = windowStartHour * 60 + schedMin;
    const schedTotalMins = schedHour * 60 + schedMin;

    const isFutureLocked = currentTotalMins < windowStartTotalMins;
    const isWithinWindow = currentTotalMins >= windowStartTotalMins && currentTotalMins <= schedTotalMins;
    const isPastWindow = currentTotalMins > schedTotalMins;

    return {
      targetTime: cleanTime,
      windowStartTime,
      isFutureLocked,
      isWithinWindow,
      isPastWindow,
    };
  }

  /**
   * Evaluates the comprehensive action and display state for a dose slot.
   */
  public static getDoseSlotActionState(
    dose?: DoseEvent | null,
    refill?: RefillInventory,
    currentTime: Date = new Date()
  ): DoseSlotActionState {
    if (!dose) {
      return {
        isCompleted: false,
        isSkipped: false,
        isLockedFuture: false,
        isOutOfSupply: Boolean(refill && refill.quantityRemaining <= 0),
        canTake: false,
        targetTime: '',
        windowStartTime: '',
        actualTakenFormatted: '',
      };
    }
    const isCompleted = dose.status === 'TAKEN' || dose.status === 'TAKEN_LATE';
    const isSkipped = dose.status === 'SKIPPED';

    const windowInfo = this.calculateDoseWindow(dose.scheduledTime, 2, currentTime);
    
    // Only lock future if the dose has not already been recorded/taken/skipped
    const isLockedFuture = !isCompleted && !isSkipped && windowInfo.isFutureLocked;

    const isOutOfSupply = Boolean(refill && refill.quantityRemaining <= 0);

    const canTake = !isCompleted && !isSkipped && !isLockedFuture && !isOutOfSupply;

    let actualTakenFormatted = '';
    if (dose.actualTakenTimeMillis) {
      actualTakenFormatted = this.formatDoseTime(dose.actualTakenTimeMillis);
    }

    return {
      isCompleted,
      isSkipped,
      isLockedFuture,
      isOutOfSupply,
      canTake,
      targetTime: windowInfo.targetTime,
      windowStartTime: windowInfo.windowStartTime,
      actualTakenFormatted,
    };
  }

  /**
   * Formats timestamp millis to local 24-hour time string HH:MM.
   */
  public static formatDoseTime(timestampMillis?: number | null): string {
    if (!timestampMillis) return '';
    const date = new Date(timestampMillis);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  /**
   * Validates if a dose slot is terminal and locked for the calendar day.
   */
  public static isDoseTerminal(status: DoseStatus): boolean {
    return status === 'TAKEN' || status === 'TAKEN_LATE' || status === 'SKIPPED';
  }
}
