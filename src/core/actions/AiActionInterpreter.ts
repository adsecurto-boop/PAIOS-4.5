import {
  ActionType,
  ProposedAction,
  InterpretationResult,
  AnyActionPayload,
} from './actionTypes';
import { validateProposedAction, validateActionPayload, VALID_ACTION_TYPES } from './actionSchemas';
import { ActionRiskPolicy } from './ActionRiskPolicy';
import { ActionContextResolver } from './ActionContextResolver';
import { getSyncDeviceId, getSyncMetadata } from '../../utils/recordSync';
import { PAIOSStorage } from '../../storage';
import { sendClientGeminiChat } from '../../geminiClient';
import { AuthSyncService } from '../../services/AuthSyncService';

function generateActionId(): string {
  return `act_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function generateTransactionId(): string {
  return `tx_ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export class AiActionInterpreter {
  /**
   * Interprets complex or ambiguous requests via AI proxy with strict schema validation
   */
  static async interpret(userText: string): Promise<InterpretationResult> {
    const rawText = userText.trim();
    if (!rawText) {
      return { confidence: 0, actions: [], rawText, tier: 'AI_INTERPRETER' };
    }

    // Pre-flight check: clinical safety interceptor
    if (/\b(double.*dose|take.*two.*pills|take.*extra.*pill|increase.*dose|decrease.*dose|change.*dosage|stop.*taking.*medication)\b/i.test(rawText)) {
      return {
        confidence: 1.0,
        actions: [],
        rawText,
        tier: 'AI_INTERPRETER',
        safetyNotice: '⚠️ MEDICAL SAFETY: PAIOS is strictly an organizational assistant and cannot alter, adjust, or prescribe medication dosages. Please consult your healthcare provider.',
      };
    }

    // Build minimal scoped context for privacy and token efficiency
    const scopedCtx = ActionContextResolver.getScopedContext();
    const contextSummary = JSON.stringify({
      currentDate: scopedCtx.currentDateString,
      activeTasks: scopedCtx.activeTasks.slice(0, 8).map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
      scheduledMedications: scopedCtx.todayDoseEvents.map((d) => ({ id: d.id, med: d.medicationName, time: d.scheduledTime, status: d.status })),
      hasActiveFocus: Boolean(scopedCtx.activeActivity),
    });

    const systemPrompt = `You are PAIOS Action Proposal Assistant.
Given a user command and current context, formulate a structured action proposal conforming STRICTLY to the following closed ActionTypes:
- CREATE_TASK { title: string, category?: string, priority?: "LOW"|"NORMAL"|"HIGH"|"CRITICAL" }
- COMPLETE_TASK { taskId: number }
- RESCHEDULE_TASK { taskId: number, dueDateMillis: number }
- START_FOCUS_SESSION { name: string, durationMinutes?: number }
- FINISH_FOCUS_SESSION {}
- CREATE_QUICK_CAPTURE { text: string }
- CREATE_JOURNAL_ENTRY { title: string, content: string, moodScore?: number }
- RECORD_EXPENSE { amount: number, title: string, category?: string }
- RECORD_INCOME { amount: number, title: string, category?: string }
- RECORD_MEDICATION_EVENT { doseEventId?: string, status: "TAKEN"|"SKIPPED"|"TAKEN_LATE" }
- RECORD_SYMPTOM { symptomName: string, severity?: number }
- NAVIGATE { tab: string }
- SEARCH { query: string }

CRITICAL SAFETY BOUNDARIES:
- DO NOT propose dosage changes, dosage recommendations, or medical advice.
- DO NOT invent arbitrary action types.
- If the command is a question or conversational request without clear mutations, do not propose actions.
- Output proposal as a JSON object at the very end:
[[PROPOSAL: {"actions": [{"type": "ACTION_TYPE", "payload": { ... }, "title": "Human Title"}]}]]`;

    const settings = PAIOSStorage.getSettings();
    let replyText = '';
    let extractedProposalJson: string | null = null;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AuthSyncService.getToken() ? { Authorization: `Bearer ${AuthSyncService.getToken()}` } : {}),
        },
        body: JSON.stringify({
          userText: `${systemPrompt}\n\nContext:\n${contextSummary}\n\nUser Command: ${rawText}`,
          modelName: settings.preferredModel,
          customApiKey: settings.customApiKey,
          aiProvider: settings.aiProvider,
          ollamaModel: settings.ollamaModel,
          ollamaBaseUrl: settings.ollamaBaseUrl,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        replyText = data.text || data.reply || '';
      } else {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
    } catch (netErr) {
      // Fallback to client-side Gemini if server endpoint fails
      try {
        const fallbackRes = await sendClientGeminiChat({
          userText: `${systemPrompt}\n\nContext:\n${contextSummary}\n\nUser Command: ${rawText}`,
          modelName: settings.preferredModel,
          customApiKey: settings.customApiKey,
        });
        replyText = fallbackRes.text || '';
      } catch (clientErr) {
        // Offline / AI Unavailable: Save request to awaiting interpretation queue
        this.saveAwaitingInterpretation(rawText);
        return {
          confidence: 0,
          actions: [],
          rawText,
          tier: 'AI_INTERPRETER',
          explanation: 'AI service is currently offline or unreachable. Your command was saved to "Awaiting interpretation" and nothing was changed.',
        };
      }
    }

    // Extract [[PROPOSAL: ...]] or fallback action blocks
    const proposalMatch = replyText.match(/\[\[PROPOSAL:\s*({[\s\S]*?})\]\]/);
    if (proposalMatch) {
      extractedProposalJson = proposalMatch[1];
    } else {
      const legacyActionMatch = replyText.match(/\[\[ACTION:\s*({[\s\S]*?})\]\]/);
      if (legacyActionMatch) {
        try {
          const legacyObj = JSON.parse(legacyActionMatch[1]);
          const legacyType = legacyObj.type?.toUpperCase();
          if (VALID_ACTION_TYPES.has(legacyType)) {
            extractedProposalJson = JSON.stringify({
              actions: [{ type: legacyType, payload: legacyObj, title: legacyObj.title || legacyType }],
            });
          }
        } catch {}
      }
    }

    if (!extractedProposalJson) {
      return {
        confidence: 0.5,
        actions: [],
        rawText,
        tier: 'AI_INTERPRETER',
        explanation: replyText || 'No actionable operations proposed by the assistant.',
      };
    }

    // Treat model output as hostile/untrusted until strictly validated
    const validatedActions: ProposedAction[] = [];
    const txId = generateTransactionId();
    const deviceId = getSyncDeviceId();
    const metadata = getSyncMetadata();

    try {
      const parsed = JSON.parse(extractedProposalJson);
      const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [parsed];

      for (const item of rawActions) {
        const actionType = String(item.type || '').toUpperCase() as ActionType;
        if (!VALID_ACTION_TYPES.has(actionType)) {
          console.warn(`[AiActionInterpreter] Rejecting unknown action type from AI: ${actionType}`);
          continue;
        }

        const payloadValidation = validateActionPayload(actionType, item.payload);
        if (!payloadValidation.isValid || !payloadValidation.sanitized) {
          console.warn(`[AiActionInterpreter] Rejecting invalid payload for ${actionType}:`, payloadValidation.errors);
          continue;
        }

        const riskEval = ActionRiskPolicy.evaluateActionRisk(actionType, payloadValidation.sanitized);
        if (riskEval.isBlocked) {
          return {
            confidence: 1.0,
            actions: [],
            rawText,
            tier: 'AI_INTERPRETER',
            safetyNotice: riskEval.safetyNotice || 'The proposed action violates PAIOS safety guidelines.',
          };
        }

        const action: ProposedAction = {
          id: generateActionId(),
          transactionId: txId,
          type: actionType,
          payload: payloadValidation.sanitized,
          risk: riskEval.risk,
          title: String(item.title || actionType).slice(0, 300),
          explanation: item.explanation || riskEval.reasons.join('. '),
          sourceText: rawText,
          affectedRecordIds: [],
          expectedRevisions: {},
          requiresConfirmation: riskEval.requiresConfirmation,
          validationState: 'VALID',
          createdAt: Date.now(),
          originDeviceId: deviceId,
        };

        const validatedAction = validateProposedAction(action);
        if (validatedAction.isValid && validatedAction.sanitized) {
          validatedActions.push(validatedAction.sanitized);
        }
      }
    } catch (jsonErr) {
      console.warn('[AiActionInterpreter] Failed to parse proposal JSON:', jsonErr);
    }

    if (validatedActions.length === 0) {
      return {
        confidence: 0.3,
        actions: [],
        rawText,
        tier: 'AI_INTERPRETER',
        explanation: 'The AI proposal could not be validated against the permitted action schema.',
      };
    }

    return {
      confidence: 0.9,
      actions: validatedActions,
      rawText,
      tier: 'AI_INTERPRETER',
      explanation: replyText.replace(/\[\[[\s\S]*?\]\]/g, '').trim(),
    };
  }

  private static saveAwaitingInterpretation(command: string): void {
    try {
      const key = 'paios_awaiting_interpretation_v1';
      const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(command);
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
    } catch {}
  }
}
