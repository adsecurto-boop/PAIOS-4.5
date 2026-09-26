import { ActionType } from './actionTypes';
import { validateActionPayload, ValidationResult } from './actionSchemas';

export class ActionPayloadValidator {
  /**
   * Validates any arbitrary action payload against its strongly typed schema
   */
  static validate(type: ActionType, payload: unknown): ValidationResult {
    return validateActionPayload(type, payload);
  }
}
