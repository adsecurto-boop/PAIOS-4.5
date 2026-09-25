import { describe, it, expect } from 'vitest';
import {
  validateActionPayload,
  validateProposedAction,
  validateTransactionRecord,
  validateCreateTaskPayload,
  validateRecordExpensePayload,
  validateRecordIncomePayload,
  validateStartFocusSessionPayload,
  validateRecordMedicationEventPayload,
  validateCreateTimetableBlockPayload,
  validateRecordSymptomPayload,
  validateCreateQuickCapturePayload,
  validateRecordVitalPayload,
} from '../../src/core/actions/actionSchemas';
import { ProposedAction } from '../../src/core/actions/actionTypes';

describe('ActionPayloadValidator & Schemas', () => {
  describe('ProposedAction Envelope Validation', () => {
    it('accepts valid proposed action envelope', () => {
      const action: ProposedAction = {
        id: 'act-12345',
        transactionId: 'tx-12345',
        type: 'CREATE_TASK',
        title: 'Review pull request',
        risk: 'LOW',
        requiresConfirmation: false,
        validationState: 'VALID',
        createdAt: Date.now(),
        payload: {
          title: 'Review pull request',
          category: 'Coding',
        },
      };

      const res = validateProposedAction(action);
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.sanitized?.title).toBe('Review pull request');
    });

    it('rejects proposed action with missing or invalid ID/transactionId', () => {
      const res = validateProposedAction({
        id: '',
        transactionId: '',
        type: 'CREATE_TASK',
        title: 'Task',
        risk: 'LOW',
        payload: { title: 'Valid title' },
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('id'))).toBe(true);
    });

    it('rejects unsupported or unknown action type', () => {
      const res = validateProposedAction({
        id: 'act-1',
        transactionId: 'tx-1',
        type: 'DESTROY_DATABASE' as any,
        title: 'Dangerous task',
        risk: 'HIGH',
        payload: {},
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('action type'))).toBe(true);
    });
  });

  describe('TransactionRecord Envelope Validation', () => {
    it('validates a complete transaction record with actions', () => {
      const res = validateTransactionRecord({
        id: 'tx-100',
        originalCommand: 'add task buy groceries',
        risk: 'LOW',
        status: 'COMMITTED',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        actions: [
          {
            id: 'act-1',
            transactionId: 'tx-100',
            type: 'CREATE_TASK',
            title: 'buy groceries',
            risk: 'LOW',
            requiresConfirmation: false,
            validationState: 'VALID',
            createdAt: Date.now(),
            payload: { title: 'buy groceries' },
          },
        ],
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized?.id).toBe('tx-100');
    });

    it('rejects transaction record with empty actions', () => {
      const res = validateTransactionRecord({
        id: 'tx-101',
        originalCommand: 'empty command',
        risk: 'LOW',
        status: 'PROPOSED',
        actions: [],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('at least one action'))).toBe(true);
    });
  });

  describe('CREATE_TASK Schema & Sanitization', () => {
    it('validates and sanitizes clean task payload', () => {
      const res = validateCreateTaskPayload({
        title: ' Buy groceries ',
        category: ' Personal ',
        priority: 'HIGH',
        dueDateMillis: 1787760000000,
        estimatedDurationMinutes: 30,
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized?.title).toBe('Buy groceries');
      expect(res.sanitized?.category).toBe('Personal');
      expect(res.sanitized?.priority).toBe('HIGH');
    });

    it('rejects empty or whitespace-only task title', () => {
      const res = validateCreateTaskPayload({
        title: '   ',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Task title');
    });

    it('rejects invalid priority value', () => {
      const res = validateCreateTaskPayload({
        title: 'Important task',
        priority: 'SUPER_URGENT' as any,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('priority'))).toBe(true);
    });
  });

  describe('RECORD_EXPENSE & RECORD_INCOME Numeric Boundaries', () => {
    it('accepts valid expense amount and currency', () => {
      const res = validateRecordExpensePayload({
        amount: 42.5,
        title: 'Lunch at cafe',
        category: 'Food',
        currency: 'USD',
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized?.amount).toBe(42.5);
      expect(res.sanitized?.title).toBe('Lunch at cafe');
    });

    it('rejects zero or negative expense amounts', () => {
      const zeroRes = validateRecordExpensePayload({
        amount: 0,
        title: 'Coffee',
      });
      expect(zeroRes.isValid).toBe(false);

      const negRes = validateRecordExpensePayload({
        amount: -15,
        title: 'Coffee',
      });
      expect(negRes.isValid).toBe(false);
    });

    it('rejects exorbitant amounts exceeding 1,000,000 limit', () => {
      const hugeRes = validateRecordExpensePayload({
        amount: 1000000.01,
        title: 'Luxury Jet',
      });
      expect(hugeRes.isValid).toBe(false);
      expect(hugeRes.errors.some((e) => e.includes('1,000,000'))).toBe(true);
    });

    it('rejects NaN income amount', () => {
      const nanRes = validateRecordIncomePayload({
        amount: NaN,
        title: 'Salary',
      });
      expect(nanRes.isValid).toBe(false);
    });
  });

  describe('START_FOCUS_SESSION Boundaries', () => {
    it('accepts valid focus session duration and note', () => {
      const res = validateStartFocusSessionPayload({
        name: 'Deep Work',
        durationMinutes: 45,
        note: 'Focus on action assistant',
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized?.durationMinutes).toBe(45);
    });

    it('rejects zero or excessive (> 360 min) focus duration', () => {
      const zeroRes = validateStartFocusSessionPayload({
        name: 'Focus',
        durationMinutes: 0,
      });
      expect(zeroRes.isValid).toBe(false);

      const excessiveRes = validateStartFocusSessionPayload({
        name: 'Focus',
        durationMinutes: 361,
      });
      expect(excessiveRes.isValid).toBe(false);
    });
  });

  describe('RECORD_MEDICATION_EVENT Schema & Safety', () => {
    it('accepts valid medication dose event', () => {
      const res = validateRecordMedicationEventPayload({
        medicationName: 'Metformin',
        status: 'TAKEN',
        doseEventId: 'dose-123',
        scheduledDateString: '2026-10-01',
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized?.medicationName).toBe('Metformin');
      expect(res.sanitized?.status).toBe('TAKEN');
    });

    it('rejects medication event missing all identification (name, id, doseEventId)', () => {
      const res = validateRecordMedicationEventPayload({
        status: 'TAKEN',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Either doseEventId, medicationId, or medicationName');
    });

    it('rejects invalid medication status', () => {
      const res = validateRecordMedicationEventPayload({
        medicationName: 'Aspirin',
        status: 'THROW_AWAY' as any,
      });
      expect(res.isValid).toBe(false);
    });
  });

  describe('CREATE_TIMETABLE_BLOCK Schema', () => {
    it('validates start and end time format', () => {
      const valid = validateCreateTimetableBlockPayload({
        activity: 'Team Standup',
        start: '09:30',
        end: '10:00',
        duration_minutes: 30,
      });
      expect(valid.isValid).toBe(true);

      const invalid = validateCreateTimetableBlockPayload({
        activity: 'Team Standup',
        start: '9:30 AM',
        end: '10:00',
        duration_minutes: 30,
      });
      expect(invalid.isValid).toBe(false);
    });
  });

  describe('RECORD_SYMPTOM & CREATE_QUICK_CAPTURE', () => {
    it('validates symptom severity in 1-10 scale', () => {
      const valid = validateRecordSymptomPayload({
        symptomName: 'Headache',
        severity: 7,
      });
      expect(valid.isValid).toBe(true);

      const outOfBounds = validateRecordSymptomPayload({
        symptomName: 'Headache',
        severity: 11,
      });
      expect(outOfBounds.isValid).toBe(false);
    });

    it('validates quick capture content', () => {
      const valid = validateCreateQuickCapturePayload({
        text: 'Remember to verify git status',
        category: 'Dev',
      });
      expect(valid.isValid).toBe(true);
      expect(valid.sanitized?.text).toBe('Remember to verify git status');

      const empty = validateCreateQuickCapturePayload({
        text: '   ',
      });
      expect(empty.isValid).toBe(false);
    });
  });

  describe('RECORD_VITAL Boundaries', () => {
    it('accepts realistic blood pressure and heart rate', () => {
      const res = validateRecordVitalPayload({
        systolicBp: 120,
        diastolicBp: 80,
        restingHeartRate: 72,
        weightKg: 75.5,
      });
      expect(res.isValid).toBe(true);
      expect(res.sanitized?.systolicBp).toBe(120);
      expect(res.sanitized?.weightKg).toBe(75.5);
    });

    it('rejects physiological impossible values', () => {
      const res = validateRecordVitalPayload({
        systolicBp: 20, // Too low
        restingHeartRate: 400, // Too high
      });
      expect(res.isValid).toBe(false);
    });
  });
});
