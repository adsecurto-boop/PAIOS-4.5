/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkOllamaHealth,
  sendOllamaChat,
  getEffectiveOllamaBaseUrl,
  getEffectiveOllamaModel,
  checkClinicalGuardrails,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from '../../src/services/ollamaClient';
import { sendClientGeminiChat } from '../../src/geminiClient';
import { PAIOSStorage } from '../../src/storage';

describe('Unit Tests: Local Ollama (qwen2.5:7b) AI Provider & Fallback Engine', () => {
  beforeEach(() => {
    PAIOSStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Configuration & Parameter Resolution', () => {
    it('resolves default endpoint and model when unconfigured', () => {
      expect(getEffectiveOllamaBaseUrl()).toBe('http://localhost:11434');
      expect(getEffectiveOllamaModel()).toBe('qwen2.5:7b');
    });

    it('resolves custom parameters with highest precedence', () => {
      const url = getEffectiveOllamaBaseUrl('http://127.0.0.1:11434/');
      const model = getEffectiveOllamaModel('qwen2.5:14b');

      expect(url).toBe('http://127.0.0.1:11434');
      expect(model).toBe('qwen2.5:14b');
    });

    it('resolves stored settings from PAIOSStorage', () => {
      PAIOSStorage.saveSettings({
        ...PAIOSStorage.getSettings(),
        ollamaBaseUrl: 'http://custom-host:11434/',
        ollamaModel: 'qwen2.5:32b',
      });

      expect(getEffectiveOllamaBaseUrl()).toBe('http://custom-host:11434');
      expect(getEffectiveOllamaModel()).toBe('qwen2.5:32b');
    });
  });

  describe('2. Daemon Health & Model Tag Verification', () => {
    it('returns available and hasModel true when qwen2.5:7b is installed in Ollama', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: 'qwen2.5:7b', modified_at: '2026-09-01T00:00:00Z', size: 4500000000 },
              { name: 'llama3.1:8b', modified_at: '2026-09-01T00:00:00Z', size: 4700000000 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const health = await checkOllamaHealth('http://localhost:11434', 'qwen2.5:7b');
      expect(health.available).toBe(true);
      expect(health.hasModel).toBe(true);
      expect(health.models).toContain('qwen2.5:7b');
      expect(health.error).toBeUndefined();
    });

    it('returns available true but hasModel false when model is not yet pulled', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [{ name: 'llama3.1:8b', size: 4700000000 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const health = await checkOllamaHealth('http://localhost:11434', 'qwen2.5:7b');
      expect(health.available).toBe(true);
      expect(health.hasModel).toBe(false);
      expect(health.models).toEqual(['llama3.1:8b']);
    });

    it('returns available false with error message when daemon is unreachable', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed to connect to localhost:11434 (ECONNREFUSED)'));

      const health = await checkOllamaHealth('http://localhost:11434', 'qwen2.5:7b');
      expect(health.available).toBe(false);
      expect(health.hasModel).toBe(false);
      expect(health.error).toContain('ECONNREFUSED');
    });
  });

  describe('3. Deterministic Clinical Safety & Guardrails', () => {
    it('intercepts Level 5 cardiovascular emergencies before network transmission', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const response = await sendOllamaChat({
        promptText: 'I feel sudden crushing chest pressure and left arm numb',
      });

      expect(response.text).toContain('EMERGENCY MEDICAL ALERT (CARDIOVASCULAR)');
      expect(response.text).toContain('call emergency services');
      expect(response.actionType).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('intercepts psychiatric crisis alerts deterministically', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const response = await sendOllamaChat({
        promptText: 'I want to end my life, what should I do?',
      });

      expect(response.text).toContain('EMERGENCY MEDICAL ALERT (PSYCHIATRIC_CRISIS)');
      expect(response.actionType).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('strictly blocks prescriptive dosage alteration and double-dose inquiries', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const response = await sendOllamaChat({
        promptText: 'Should I double dose my medication because I forgot this morning?',
      });

      expect(response.text).toContain('MEDICAL SAFETY NOTICE');
      expect(response.text).toContain('Never double up on a missed dose');
      expect(response.actionType).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. Request Formatting, Tool Calling & Action Parsing', () => {
    it('formats messages and parses structured action blocks correctly', async () => {
      let sentBody: any = null;
      vi.spyOn(global, 'fetch').mockImplementationOnce(async (url, init: any) => {
        sentBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            model: 'qwen2.5:7b',
            created_at: '2026-09-06T12:00:00Z',
            message: {
              role: 'assistant',
              content: 'I have added the review task for you.\n\n[[ACTION: {"type": "ADD_TASK", "title": "ISTQB CTFL Practice Exam", "category": "Study"}]]',
            },
            done: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const response = await sendOllamaChat({
        promptText: 'Create a task to practice ISTQB CTFL exam',
        userContext: 'Office shift ends at 22:00',
        model: 'qwen2.5:7b',
      });

      expect(sentBody).toBeDefined();
      expect(sentBody.model).toBe('qwen2.5:7b');
      expect(sentBody.messages[0].role).toBe('system');
      expect(sentBody.messages[0].content).toContain('qwen2.5:7b');
      expect(sentBody.messages[0].content).toContain('Office shift ends at 22:00');
      expect(sentBody.messages[1].role).toBe('user');
      expect(sentBody.messages[1].content).toBe('Create a task to practice ISTQB CTFL exam');

      expect(response.text).toBe('I have added the review task for you.');
      expect(response.actionType).toBe('ADD_TASK');
      expect(response.actionPayloadJson).toContain('ISTQB CTFL Practice Exam');
    });

    it('parses native Ollama tool calls into PAIOS ledger actions', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'qwen2.5:7b',
            created_at: '2026-09-06T12:00:00Z',
            message: {
              role: 'assistant',
              content: 'Logged your morning dose.',
              tool_calls: [
                {
                  function: {
                    name: 'record_medication_dose',
                    arguments: JSON.stringify({
                      medication_ids: ['med_1'],
                      action: 'TAKEN',
                      notes: 'Morning tablet taken with water',
                    }),
                  },
                },
              ],
            },
            done: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const response = await sendOllamaChat({
        promptText: 'I took my morning sertraline dose',
      });

      expect(response.actionType).toBe('LOG_DOSE');
      expect(response.actionPayloadJson).toBeDefined();
      const parsedPayload = JSON.parse(response.actionPayloadJson!);
      expect(parsedPayload.type).toBe('record_medication_dose');
      expect(parsedPayload.action).toBe('TAKEN');
      expect(parsedPayload.medication_ids).toEqual(['med_1']);
    });

    it('handles daemon errors gracefully with clear user guidance', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

      const response = await sendOllamaChat({
        promptText: 'What is today schedule?',
        baseUrl: 'http://localhost:11434',
        model: 'qwen2.5:7b',
      });

      expect(response.error).toBeDefined();
      expect(response.text).toContain('Unable to reach local Ollama daemon at http://localhost:11434');
      expect(response.text).toContain('ollama serve');
      expect(response.text).toContain('qwen2.5:7b');
    });
  });

  describe('5. Client-Side Dual Provider & Fallback Integration', () => {
    it('routes directly to Ollama when aiProvider in settings is OLLAMA', async () => {
      PAIOSStorage.saveSettings({
        ...PAIOSStorage.getSettings(),
        aiProvider: 'OLLAMA',
        ollamaModel: 'qwen2.5:7b',
      });

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'qwen2.5:7b',
            created_at: '2026-09-06T12:00:00Z',
            message: {
              role: 'assistant',
              content: 'Offline local response from qwen2.5:7b.',
            },
            done: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const response = await sendClientGeminiChat({
        userText: 'Hello from offline mode',
      });

      expect(response.text).toBe('Offline local response from qwen2.5:7b.');
    });

    it('falls back to Ollama when Gemini API key is missing', async () => {
      const origGeminiKey = process.env.GEMINI_API_KEY;
      const origViteKey = process.env.VITE_GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.VITE_GEMINI_API_KEY;

      try {
        PAIOSStorage.saveSettings({
          ...PAIOSStorage.getSettings(),
          aiProvider: 'GEMINI',
          customApiKey: '',
          ollamaModel: 'qwen2.5:7b',
        });

        vi.spyOn(global, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              model: 'qwen2.5:7b',
              created_at: '2026-09-06T12:00:00Z',
              message: {
                role: 'assistant',
                content: 'Fallback response from local Ollama qwen2.5:7b.',
              },
              done: true,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );

        const response = await sendClientGeminiChat({
          userText: 'Test fallback without cloud API key',
        });

        expect(response.text).toBe('Fallback response from local Ollama qwen2.5:7b.');
        expect(response.provider).toBe('ollama');
        expect(response.fallback).toBe(true);
      } finally {
        if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
        if (origViteKey !== undefined) process.env.VITE_GEMINI_API_KEY = origViteKey;
      }
    });
  });

  describe('6. Settings Persistence & Toggle State', () => {
    it('persists AI provider toggle and model preferences in PAIOSStorage', () => {
      PAIOSStorage.updateSettings({
        aiProvider: 'OLLAMA',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'qwen2.5:7b',
      });

      const updated = PAIOSStorage.getSettings();
      expect(updated.aiProvider).toBe('OLLAMA');
      expect(updated.ollamaBaseUrl).toBe('http://localhost:11434');
      expect(updated.ollamaModel).toBe('qwen2.5:7b');

      // Toggle back to Gemini
      PAIOSStorage.updateSettings({
        aiProvider: 'GEMINI',
      });

      const toggled = PAIOSStorage.getSettings();
      expect(toggled.aiProvider).toBe('GEMINI');
      expect(toggled.ollamaModel).toBe('qwen2.5:7b');
    });
  });
});
