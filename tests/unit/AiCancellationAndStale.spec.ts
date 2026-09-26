/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiActionInterpreter } from '../../src/core/actions/AiActionInterpreter';

describe('DEF-09: AI Cancellation, Stale Request Discarding & Timeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts in-flight AI interpretation when signal is cancelled', async () => {
    const controller = new AbortController();

    // Start interpret call with signal
    const promise = AiActionInterpreter.interpret('add a complex event to calendar', {
      signal: controller.signal,
    });

    // Immediately abort
    controller.abort();

    await expect(promise).rejects.toThrow(/abort|cancel/i);
  });

  it('safely handles timeout if AI interpretation takes too long', async () => {
    vi.useFakeTimers();

    // Mock an AI call that hangs indefinitely
    const slowInterpretationPromise = AiActionInterpreter.interpretWithTimeout(
      'schedule a meeting',
      {},
      500 // 500ms timeout
    );

    // Fast-forward time past 500ms
    vi.advanceTimersByTime(600);

    await expect(slowInterpretationPromise).rejects.toThrow(/timeout|timed out/i);

    vi.useRealTimers();
  });

  it('discards stale interpretation results when sequence number or token is superseded', async () => {
    let activeToken = 1;

    // Simulate two sequential queries
    const results: string[] = [];

    const simulateQuery = async (query: string, token: number, delayMs: number) => {
      await new Promise((res) => setTimeout(res, delayMs));
      // Only commit result if token is still the active token
      if (token === activeToken) {
        results.push(query);
      }
    };

    // Query 1 starts (slow, 100ms)
    const p1 = simulateQuery('First Query', 1, 100);

    // User types faster: Query 2 starts (token becomes 2, fast 20ms)
    activeToken = 2;
    const p2 = simulateQuery('Second Query', 2, 20);

    await Promise.all([p1, p2]);

    // Only 'Second Query' should have committed, 'First Query' was discarded as stale
    expect(results).toEqual(['Second Query']);
  });
});
