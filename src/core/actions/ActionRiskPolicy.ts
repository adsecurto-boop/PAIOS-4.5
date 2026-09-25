import { ActionType, ActionRisk, ProposedAction, AnyActionPayload, RecordExpensePayload, RecordIncomePayload } from './actionTypes';
import { ACTION_REGISTRY } from './ActionRegistry';

export const HIGH_FINANCIAL_THRESHOLD = 25000; // e.g. ₹25,000 or $500 equivalent

export interface RiskEvaluation {
  risk: ActionRisk;
  requiresConfirmation: boolean;
  reasons: string[];
  isBlocked: boolean;
  safetyNotice?: string;
}

export class ActionRiskPolicy {
  /**
   * Evaluates the risk of a single action based on its type and payload
   */
  static evaluateActionRisk(type: ActionType, payload: AnyActionPayload): RiskEvaluation {
    const reasons: string[] = [];

    // Rule 1: Guard against unregistered action types
    if (!ACTION_REGISTRY[type]) {
      return {
        risk: 'BLOCKED',
        requiresConfirmation: true,
        reasons: [`Action type "${type}" is not recognized or permitted in PAIOS`],
        isBlocked: true,
        safetyNotice: 'Unknown operations cannot be executed automatically.',
      };
    }

    const baseRisk = ACTION_REGISTRY[type].defaultRisk;

    // Rule 2: Medication safety checks
    if (type === 'RECORD_MEDICATION_EVENT') {
      const medPayload = payload as any;
      // If someone tries to pass custom dose modifications through medication event
      if (medPayload.newDosage || medPayload.changeDosage || medPayload.prescribe) {
        return {
          risk: 'BLOCKED',
          requiresConfirmation: true,
          reasons: ['Modifying medication dosage or prescription regimens is strictly prohibited'],
          isBlocked: true,
          safetyNotice: 'PAIOS never generates or modifies medication dosages. Please consult your prescribing physician.',
        };
      }

      // Skipping or delaying is medium risk, taking scheduled dose is medium risk (requires confirmation to prevent false compliance records)
      return {
        risk: 'MEDIUM',
        requiresConfirmation: true,
        reasons: ['Recording medication events updates your clinical adherence history'],
        isBlocked: false,
      };
    }

    // Rule 3: Financial safety checks
    if (type === 'RECORD_EXPENSE' || type === 'RECORD_INCOME') {
      const finPayload = payload as RecordExpensePayload | RecordIncomePayload;
      const amount = finPayload.amount;

      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          risk: 'BLOCKED',
          requiresConfirmation: true,
          reasons: ['Financial amounts must be strictly positive and finite numbers'],
          isBlocked: true,
          safetyNotice: 'Invalid transaction amount detected.',
        };
      }

      if (amount >= HIGH_FINANCIAL_THRESHOLD) {
        return {
          risk: 'HIGH',
          requiresConfirmation: true,
          reasons: [`Unusually large financial transaction (amount: ${amount})`],
          isBlocked: false,
        };
      }

      return {
        risk: 'MEDIUM',
        requiresConfirmation: true,
        reasons: ['Financial transactions modify your budget and cash ledger balances'],
        isBlocked: false,
      };
    }

    // Rule 4: Timetable and Replanning safety
    if (type === 'REPLAN_DAY') {
      return {
        risk: 'HIGH',
        requiresConfirmation: true,
        reasons: ['Replanning regenerates your remaining day schedule'],
        isBlocked: false,
      };
    }

    // Rule 5: Task changes
    if (type === 'RESCHEDULE_TASK' || type === 'UPDATE_TASK' || type === 'COMPLETE_TASK') {
      return {
        risk: 'MEDIUM',
        requiresConfirmation: true,
        reasons: ['Modifying existing task state requires confirmation'],
        isBlocked: false,
      };
    }

    // Rule 6: Focus finishing
    if (type === 'FINISH_FOCUS_SESSION') {
      return {
        risk: 'MEDIUM',
        requiresConfirmation: true,
        reasons: ['Completing focus session will log final activity duration'],
        isBlocked: false,
      };
    }

    // Rule 7: Low risk actions (Task creation, quick capture, journal, search, navigate, start/pause/resume focus)
    if (baseRisk === 'LOW') {
      return {
        risk: 'LOW',
        requiresConfirmation: false,
        reasons: ['Low risk, non-destructive operation with Undo available'],
        isBlocked: false,
      };
    }

    return {
      risk: baseRisk,
      requiresConfirmation: true,
      reasons,
      isBlocked: false,
    };
  }

  /**
   * Evaluates the collective risk of a proposed multi-action transaction
   */
  static evaluateTransactionRisk(actions: ProposedAction[]): RiskEvaluation {
    if (actions.length === 0) {
      return {
        risk: 'LOW',
        requiresConfirmation: false,
        reasons: ['Empty transaction'],
        isBlocked: false,
      };
    }

    const reasons: string[] = [];
    let highestRisk: ActionRisk = 'LOW';
    let requiresConfirmation = false;
    let isBlocked = false;
    let safetyNotice: string | undefined;

    // Check individual actions
    for (const action of actions) {
      const evalResult = this.evaluateActionRisk(action.type, action.payload);
      if (evalResult.isBlocked) {
        return evalResult;
      }
      if (evalResult.requiresConfirmation) {
        requiresConfirmation = true;
      }
      if (this.riskPrecedence(evalResult.risk) > this.riskPrecedence(highestRisk)) {
        highestRisk = evalResult.risk;
      }
      if (evalResult.reasons.length > 0) {
        reasons.push(...evalResult.reasons);
      }
    }

    // Batch size escalation: More than 3 actions escalates to HIGH risk
    if (actions.length > 3 && highestRisk !== 'BLOCKED') {
      highestRisk = 'HIGH';
      requiresConfirmation = true;
      reasons.push(`Batch transaction containing ${actions.length} actions requires detailed review`);
    }

    return {
      risk: highestRisk,
      requiresConfirmation,
      reasons: Array.from(new Set(reasons)),
      isBlocked,
      safetyNotice,
    };
  }

  private static riskPrecedence(risk: ActionRisk): number {
    switch (risk) {
      case 'LOW': return 1;
      case 'MEDIUM': return 2;
      case 'HIGH': return 3;
      case 'BLOCKED': return 4;
      default: return 0;
    }
  }
}
