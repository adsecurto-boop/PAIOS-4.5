import { describe, it, expect } from 'vitest';
import { ActionRiskPolicy, HIGH_FINANCIAL_THRESHOLD } from '../../src/core/actions/ActionRiskPolicy';
import { ProposedAction } from '../../src/core/actions/actionTypes';

describe('ActionRiskPolicy Unit Tests', () => {
  describe('Single Action Risk Evaluation', () => {
    it('evaluates task creation as LOW risk without requiring confirmation', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('CREATE_TASK', {
        title: 'Draft architecture proposal',
      });
      expect(res.risk).toBe('LOW');
      expect(res.requiresConfirmation).toBe(false);
      expect(res.isBlocked).toBe(false);
    });

    it('evaluates task status change (COMPLETE_TASK) as MEDIUM risk with confirmation required', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('COMPLETE_TASK', {
        taskId: 123,
      });
      expect(res.risk).toBe('MEDIUM');
      expect(res.requiresConfirmation).toBe(true);
      expect(res.isBlocked).toBe(false);
    });

    it('evaluates routine financial expense as MEDIUM risk with confirmation', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('RECORD_EXPENSE', {
        amount: 250,
        title: 'Books',
      });
      expect(res.risk).toBe('MEDIUM');
      expect(res.requiresConfirmation).toBe(true);
      expect(res.isBlocked).toBe(false);
    });

    it('escalates large financial transactions (>= threshold) to HIGH risk', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('RECORD_EXPENSE', {
        amount: HIGH_FINANCIAL_THRESHOLD,
        title: 'Server Renewal',
      });
      expect(res.risk).toBe('HIGH');
      expect(res.requiresConfirmation).toBe(true);
      expect(res.reasons.some((r) => r.includes('Unusually large'))).toBe(true);
    });

    it('blocks negative or non-positive financial amounts', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('RECORD_EXPENSE', {
        amount: -50,
        title: 'Invalid',
      });
      expect(res.risk).toBe('BLOCKED');
      expect(res.isBlocked).toBe(true);
      expect(res.safetyNotice).toBeDefined();
    });

    it('evaluates REPLAN_DAY as HIGH risk requiring explicit user confirmation', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('REPLAN_DAY', {
        reason: 'Delayed meeting',
      });
      expect(res.risk).toBe('HIGH');
      expect(res.requiresConfirmation).toBe(true);
    });

    it('blocks clinical prescription or dosage alteration attempts', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('RECORD_MEDICATION_EVENT', {
        medicationName: 'Metformin',
        status: 'TAKEN',
        newDosage: '1000mg', // clinical modification attempt
      } as any);
      expect(res.risk).toBe('BLOCKED');
      expect(res.isBlocked).toBe(true);
      expect(res.safetyNotice).toContain('PAIOS never generates or modifies medication dosages');
    });

    it('blocks unknown or unauthorized action types', () => {
      const res = ActionRiskPolicy.evaluateActionRisk('DROP_TABLES' as any, {});
      expect(res.risk).toBe('BLOCKED');
      expect(res.isBlocked).toBe(true);
    });
  });

  describe('Multi-Action Transaction Risk Evaluation', () => {
    it('returns LOW risk for a transaction with only low risk operations', () => {
      const actions: ProposedAction[] = [
        {
          id: '1',
          transactionId: 'tx-1',
          type: 'CREATE_TASK',
          title: 'Task 1',
          risk: 'LOW',
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          payload: { title: 'Task 1' },
        },
        {
          id: '2',
          transactionId: 'tx-1',
          type: 'CREATE_QUICK_CAPTURE',
          title: 'Capture 1',
          risk: 'LOW',
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          payload: { text: 'Capture 1' },
        },
      ];

      const res = ActionRiskPolicy.evaluateTransactionRisk(actions);
      expect(res.risk).toBe('LOW');
      expect(res.requiresConfirmation).toBe(false);
      expect(res.isBlocked).toBe(false);
    });

    it('escalates collective risk to highest component risk', () => {
      const actions: ProposedAction[] = [
        {
          id: '1',
          transactionId: 'tx-2',
          type: 'CREATE_TASK',
          title: 'Task 1',
          risk: 'LOW',
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          payload: { title: 'Task 1' },
        },
        {
          id: '2',
          transactionId: 'tx-2',
          type: 'RECORD_EXPENSE',
          title: 'Expense 1',
          risk: 'MEDIUM',
          requiresConfirmation: true,
          validationState: 'VALID',
          createdAt: Date.now(),
          payload: { amount: 50, title: 'Expense 1' },
        },
      ];

      const res = ActionRiskPolicy.evaluateTransactionRisk(actions);
      expect(res.risk).toBe('MEDIUM');
      expect(res.requiresConfirmation).toBe(true);
    });

    it('escalates to HIGH risk when batch size exceeds 3 actions', () => {
      const actions: ProposedAction[] = [1, 2, 3, 4].map((i) => ({
        id: `act-${i}`,
        transactionId: 'tx-batch',
        type: 'CREATE_TASK',
        title: `Task ${i}`,
        risk: 'LOW',
        requiresConfirmation: false,
        validationState: 'VALID',
        createdAt: Date.now(),
        payload: { title: `Task ${i}` },
      }));

      const res = ActionRiskPolicy.evaluateTransactionRisk(actions);
      expect(res.risk).toBe('HIGH');
      expect(res.requiresConfirmation).toBe(true);
      expect(res.reasons.some((r) => r.includes('Batch transaction containing 4 actions'))).toBe(true);
    });

    it('blocks the entire transaction if any single action is BLOCKED', () => {
      const actions: ProposedAction[] = [
        {
          id: '1',
          transactionId: 'tx-blocked',
          type: 'CREATE_TASK',
          title: 'Task 1',
          risk: 'LOW',
          requiresConfirmation: false,
          validationState: 'VALID',
          createdAt: Date.now(),
          payload: { title: 'Task 1' },
        },
        {
          id: '2',
          transactionId: 'tx-blocked',
          type: 'RECORD_EXPENSE',
          title: 'Negative Expense',
          risk: 'BLOCKED',
          requiresConfirmation: true,
          validationState: 'VALID',
          createdAt: Date.now(),
          payload: { amount: -100, title: 'Negative' },
        },
      ];

      const res = ActionRiskPolicy.evaluateTransactionRisk(actions);
      expect(res.risk).toBe('BLOCKED');
      expect(res.isBlocked).toBe(true);
    });
  });
});
