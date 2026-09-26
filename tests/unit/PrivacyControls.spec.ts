/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isSensitiveCommand } from '../../src/utils/sensitiveCommandDetector';
import { PAIOSStorage } from '../../src/storage';
import { ActionStorage } from '../../src/core/actions/actionStorage';

describe('DEF-09: Privacy Controls for Action History & Queues', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    ActionStorage.clearLedger(true);
  });

  it('detects sensitive health and finance text keywords', () => {
    expect(isSensitiveCommand('record blood pressure 120/80')).toBe(true);
    expect(isSensitiveCommand('take metformin 500mg')).toBe(true);
    expect(isSensitiveCommand('spent 500 on groceries')).toBe(true);
    expect(isSensitiveCommand('my salary was deposited')).toBe(true);
    expect(isSensitiveCommand('feeling high anxiety today')).toBe(true);
  });

  it('identifies non-sensitive tasks and timetable commands as safe', () => {
    expect(isSensitiveCommand('add task buy milk')).toBe(false);
    expect(isSensitiveCommand('schedule deep work 09:00 to 11:00')).toBe(false);
    expect(isSensitiveCommand('navigate to settings')).toBe(false);
  });

  it('flags sensitive action types as sensitive regardless of innocent text', () => {
    expect(isSensitiveCommand('do the thing', ['RECORD_MEDICATION_EVENT'])).toBe(true);
    expect(isSensitiveCommand('just some notes', ['CREATE_JOURNAL_ENTRY'])).toBe(true);
    expect(isSensitiveCommand('regular update', ['RECORD_EXPENSE'])).toBe(true);
    expect(isSensitiveCommand('regular update', ['CREATE_TASK'])).toBe(false);
  });

  it('prevents raw sensitive text from being queued for AI history without opt-in', () => {
    // By default, allowAiCommandHistory is false/undefined
    const sensitivePrompt = 'took 50mg sertraline for severe anxiety';
    const queued = ActionStorage.queueAwaitingInterpretation(sensitivePrompt, ['RECORD_MEDICATION_EVENT']);
    expect(queued).toBe(false);

    // Non-sensitive command is allowed to be queued
    const safePrompt = 'add task review PR 104';
    const safeQueued = ActionStorage.queueAwaitingInterpretation(safePrompt, ['CREATE_TASK']);
    expect(safeQueued).toBe(true);
  });

  it('allows raw text queuing if user explicitly opted in to allowAiCommandHistory', () => {
    PAIOSStorage.saveSettings({
      ...PAIOSStorage.getSettings(),
      allowAiCommandHistory: true,
    } as any);

    const sensitivePrompt = 'took 50mg sertraline for severe anxiety';
    const queued = ActionStorage.queueAwaitingInterpretation(sensitivePrompt, ['RECORD_MEDICATION_EVENT']);
    expect(queued).toBe(true);
  });
});
