import { ActionType } from '../core/actions/actionTypes';

const SENSITIVE_ACTION_TYPES = new Set<string>([
  'RECORD_MEDICATION_EVENT',
  'RECORD_SYMPTOM',
  'RECORD_VITAL',
  'CREATE_JOURNAL_ENTRY',
  'RECORD_EXPENSE',
  'RECORD_INCOME',
]);

const SENSITIVE_KEYWORD_REGEX = /\b(medication|metformin|symptom|vital|journal|expense|income|salary|dose|blood|pressure|anxiety|depression|weight|secret|password|credit|card|spent|bought)\b|\d+\s*mg/i;

/**
 * Determines whether a command text or associated action types involve
 * sensitive personal health or financial data.
 */
export function isSensitiveCommand(text: string, actionTypes?: (ActionType | string)[]): boolean {
  if (actionTypes && actionTypes.some((t) => SENSITIVE_ACTION_TYPES.has(t))) {
    return true;
  }

  if (text && SENSITIVE_KEYWORD_REGEX.test(text)) {
    return true;
  }

  return false;
}
