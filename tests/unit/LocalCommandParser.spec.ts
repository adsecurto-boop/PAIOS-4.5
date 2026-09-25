/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCommandParser } from '../../src/core/actions/LocalCommandParser';
import { PAIOSStorage } from '../../src/storage';

describe('LocalCommandParser Unit Tests', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
  });

  describe('Direct Task Commands', () => {
    it('parses "add a high-priority task to call the doctor tomorrow"', () => {
      const res = LocalCommandParser.parse('add a high-priority task to call the doctor tomorrow');
      expect(res.confidence).toBeGreaterThan(0.9);
      expect(res.actions).toHaveLength(1);
      const action = res.actions[0];
      expect(action.type).toBe('CREATE_TASK');
      expect(action.payload.title).toBe('call the doctor');
      expect(action.payload.priority).toBe('HIGH');
      expect(action.payload.dueDateMillis).toBeDefined();
    });

    it('parses routine task creation: "create task finish report"', () => {
      const res = LocalCommandParser.parse('create task finish report');
      expect(res.confidence).toBeGreaterThan(0.9);
      expect(res.actions).toHaveLength(1);
      expect(res.actions[0].type).toBe('CREATE_TASK');
      expect(res.actions[0].payload.title).toBe('finish report');
    });

    it('resolves exact task match for "complete task call doctor"', () => {
      // Seed a matching task in storage
      PAIOSStorage.addTask('call doctor', 'Personal');

      const res = LocalCommandParser.parse('complete task call doctor');
      expect(res.confidence).toBeGreaterThan(0.9);
      expect(res.actions).toHaveLength(1);
      expect(res.actions[0].type).toBe('COMPLETE_TASK');
    });

    it('returns clarification request when multiple tasks match', () => {
      // Seed two tasks with similar names
      PAIOSStorage.addTask('Review pull request #1', 'Work');
      PAIOSStorage.addTask('Review pull request #2', 'Work');

      const res = LocalCommandParser.parse('complete task Review pull request');
      expect(res.clarificationNeeded).toBeDefined();
      expect(res.clarificationNeeded?.options.length).toBeGreaterThanOrEqual(2);
      expect(res.actions).toHaveLength(0);
    });
  });

  describe('Financial Commands', () => {
    it('parses "I spent ₹850 on groceries"', () => {
      const res = LocalCommandParser.parse('I spent ₹850 on groceries');
      expect(res.confidence).toBeGreaterThan(0.9);
      expect(res.actions).toHaveLength(1);
      const action = res.actions[0];
      expect(action.type).toBe('RECORD_EXPENSE');
      expect(action.payload.amount).toBe(850);
      expect(action.payload.category).toBe('Food');
    });

    it('parses freelance income deposit', () => {
      const res = LocalCommandParser.parse('received 5000 freelance');
      expect(res.confidence).toBeGreaterThan(0.9);
      expect(res.actions[0].type).toBe('RECORD_INCOME');
      expect(res.actions[0].payload.amount).toBe(5000);
      expect(res.actions[0].payload.category).toBe('Freelance');
    });
  });

  describe('Focus Session Commands', () => {
    it('parses "start a 45-min focus session on coding"', () => {
      const res = LocalCommandParser.parse('start a 45-min focus session on coding');
      expect(res.confidence).toBeGreaterThan(0.9);
      expect(res.actions[0].type).toBe('START_FOCUS_SESSION');
      expect(res.actions[0].payload.durationMinutes).toBe(45);
      expect(res.actions[0].payload.name).toBe('coding');
    });

    it('parses "pause focus" and "finish focus"', () => {
      const pause = LocalCommandParser.parse('pause focus');
      expect(pause.actions[0].type).toBe('PAUSE_FOCUS_SESSION');

      const finish = LocalCommandParser.parse('finish focus');
      expect(finish.actions[0].type).toBe('FINISH_FOCUS_SESSION');
    });
  });

  describe('Safety Guardrails & Medical Blocking', () => {
    it('blocks dangerous medication instructions immediately', () => {
      const res = LocalCommandParser.parse('double my dose of Metformin');
      expect(res.actions).toHaveLength(0);
      expect(res.safetyNotice).toContain('MEDICAL SAFETY');
    });
  });

  describe('Navigation & Search', () => {
    it('parses "go to health"', () => {
      const res = LocalCommandParser.parse('go to health');
      expect(res.actions[0].type).toBe('NAVIGATE');
      expect(res.actions[0].payload.tab).toBe('HEALTH');
    });

    it('parses "search groceries"', () => {
      const res = LocalCommandParser.parse('search groceries');
      expect(res.actions[0].type).toBe('SEARCH');
      expect(res.actions[0].payload.query).toBe('groceries');
    });
  });

  describe('Conversational & Unsupported Prompts', () => {
    it('flags ambiguous conversational prompt for AI Tier 2 interpretation', () => {
      const res = LocalCommandParser.parse('What is the meaning of life?');
      expect(res.actions).toHaveLength(0);
      expect(res.tier).toBe('AI_INTERPRETER');
      expect(res.confidence).toBeLessThan(0.5);
    });
  });
});
