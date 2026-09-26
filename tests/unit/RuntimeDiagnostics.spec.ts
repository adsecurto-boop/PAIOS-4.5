/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { recordRuntimeDiagnostic } from '../../src/utils/runtimeDiagnostics';

const STORAGE_KEY = 'paios_runtime_diagnostics_v1';

describe('runtime diagnostics hardening', () => {
  beforeEach(() => localStorage.clear());

  it('records bounded, sanitized diagnostics without persisting secrets', () => {
    recordRuntimeDiagnostic('error', new Error('request failed password=hunter2 token=abc123'));

    const diagnostics = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('error');
    expect(diagnostics[0].message).not.toContain('hunter2');
    expect(diagnostics[0].message).not.toContain('abc123');
    expect(diagnostics[0].message).toContain('[redacted]');
  });

  it('caps retained crash records to prevent unbounded local storage growth', () => {
    for (let index = 0; index < 30; index += 1) {
      recordRuntimeDiagnostic('unhandledrejection', `failure ${index}`);
    }

    const diagnostics = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(diagnostics).toHaveLength(20);
    expect(diagnostics[0].message).toBe('failure 29');
  });
});

