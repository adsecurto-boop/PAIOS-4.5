import { PAIOSStorage } from '../storage';
import { OllamaHealthStatus } from '../types';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

export interface AiResponse {
  text: string;
  actionType?: string | null;
  actionPayloadJson?: string | null;
  error?: string;
}

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b';

/**
 * Resolves the effective Ollama Base URL
 */
export function getEffectiveOllamaBaseUrl(customUrl?: string): string {
  if (customUrl && typeof customUrl === 'string' && customUrl.trim()) {
    return customUrl.trim().replace(/\/+$/, '');
  }

  try {
    const settings = PAIOSStorage.getSettings();
    if (settings && settings.ollamaBaseUrl && typeof settings.ollamaBaseUrl === 'string' && settings.ollamaBaseUrl.trim()) {
      return settings.ollamaBaseUrl.trim().replace(/\/+$/, '');
    }
  } catch (e) {}

  return (
    (typeof process !== 'undefined' ? process.env?.PAIOS_OLLAMA_BASE_URL : undefined) ||
    DEFAULT_OLLAMA_BASE_URL
  ).replace(/\/+$/, '');
}

/**
 * Resolves the effective Ollama Model name
 */
export function getEffectiveOllamaModel(customModel?: string): string {
  if (customModel && typeof customModel === 'string' && customModel.trim()) {
    return customModel.trim();
  }

  try {
    const settings = PAIOSStorage.getSettings();
    if (settings && settings.ollamaModel && typeof settings.ollamaModel === 'string' && settings.ollamaModel.trim()) {
      return settings.ollamaModel.trim();
    }
  } catch (e) {}

  return (
    (typeof process !== 'undefined' ? process.env?.PAIOS_OLLAMA_MODEL : undefined) ||
    DEFAULT_OLLAMA_MODEL
  );
}

/**
 * Query Ollama /api/tags to verify daemon reachability and model availability
 */
export async function checkOllamaHealth(
  baseUrlOverride?: string,
  modelOverride?: string
): Promise<OllamaHealthStatus> {
  const baseUrl = getEffectiveOllamaBaseUrl(baseUrlOverride);
  const targetModel = getEffectiveOllamaModel(modelOverride);

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        available: false,
        baseUrl,
        models: [],
        hasModel: false,
        model: targetModel,
        error: `Ollama daemon returned HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];
    const modelNames: string[] = rawModels
      .map((m) => (typeof m === 'string' ? m : m?.name || ''))
      .filter(Boolean);

    // Check if target model (e.g. qwen2.5:7b or qwen2.5) matches any tag
    const targetClean = targetModel.toLowerCase().trim();
    const hasModel = modelNames.some((name) => {
      const n = name.toLowerCase().trim();
      return (
        n === targetClean ||
        n === `${targetClean}:latest` ||
        n.startsWith(`${targetClean}:`) ||
        targetClean.startsWith(`${n}:`)
      );
    });

    return {
      available: true,
      baseUrl,
      models: modelNames,
      hasModel,
      model: targetModel,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      available: false,
      baseUrl,
      models: [],
      hasModel: false,
      model: targetModel,
      error: isAbort
        ? `Connection to Ollama timed out at ${baseUrl}`
        : (err?.message || 'Unable to connect to Ollama daemon'),
    };
  }
}

/**
 * Standard function tool schemas compatible with Ollama /api/chat tool-calling
 */
export const OLLAMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'record_medication_dose',
      description: 'Records or updates medication dose adherence status (taken, skipped, or taken late) in the user health ledger.',
      parameters: {
        type: 'object',
        properties: {
          medication_ids: {
            type: 'array',
            items: { type: 'string' },
            description: "Array of medication IDs or names, or ['all_due']",
          },
          action: {
            type: 'string',
            enum: ['TAKEN', 'SKIPPED', 'TAKEN_LATE'],
            description: 'The adherence status for the dose',
          },
          timestamp: {
            type: 'number',
            description: 'Unix timestamp in milliseconds when dose was taken',
          },
          notes: {
            type: 'string',
            description: 'Optional clinical adherence observation or note',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_transaction',
      description: 'Records a financial inflow (income/salary) or outflow (expense/spend) into the PAIOS money manager ledger.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Transaction title or description' },
          amount: { type: 'number', description: 'Monetary amount' },
          type: { type: 'string', enum: ['INFLOW', 'OUTFLOW'], description: 'Transaction stream' },
          category: { type: 'string', description: 'Budget category e.g. Food, Travel, Salary, Freelance, Health' },
          notes: { type: 'string', description: 'Optional transaction notes or remarks' },
        },
        required: ['title', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Creates a new actionable task in the user PAIOS task list.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          priority: { type: 'string', enum: ['HIGH', 'NORMAL', 'LOW'], description: 'Task priority level' },
          dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        },
        required: ['title'],
      },
    },
  },
];

/**
 * Clinical safety interceptor check
 */
export function checkClinicalGuardrails(text: string): AiResponse | null {
  const clean = text.trim();

  // Level 5 Emergency Red-Flag Interceptor
  const redFlagRegexes = [
    { category: 'CARDIOVASCULAR', pattern: /\b(chest pain|crushing chest|chest pressure|left arm numb|passed out|syncope)\b/i },
    { category: 'ANAPHYLAXIS', pattern: /\b(throat closing|swollen lips|swollen tongue|cannot breathe|hives all over)\b/i },
    { category: 'NEUROLOGICAL', pattern: /\b(slurred speech|face drooping|sudden vision loss|seizure|convulsing)\b/i },
    { category: 'SEROTONIN_TOXICITY', pattern: /\b(severe tremor|rigid muscles|fever and agitation|serotonin syndrome)\b/i },
    { category: 'PSYCHIATRIC_CRISIS', pattern: /\b(want to end my life|suicidal thoughts|plan to harm myself)\b/i },
  ];

  for (const flag of redFlagRegexes) {
    if (flag.pattern.test(clean)) {
      return {
        text: `🚨 EMERGENCY MEDICAL ALERT (${flag.category}): The symptoms you described may indicate a medical emergency. Please call emergency services (911 or 112) or go to the nearest emergency room immediately. PAIOS cannot provide emergency treatment.`,
        actionType: null,
        actionPayloadJson: null,
      };
    }
  }

  // Prescription Alteration & Double-Dose Interceptor
  if (/\b(double.*dose|take.*two.*pills|take.*extra.*pill|increase.*dose|decrease.*dose|change.*dosage|stop.*taking.*medication)\b/i.test(clean)) {
    return {
      text: `⚠️ MEDICAL SAFETY NOTICE: PAIOS is strictly an organizational decision-support assistant and cannot alter, adjust, or prescribe medication dosages. Never double up on a missed dose. Please consult your prescribing doctor or pharmacist before making any changes to your medication schedule.`,
      actionType: null,
      actionPayloadJson: null,
    };
  }

  return null;
}

/**
 * Execute chat inference with Ollama running qwen2.5:7b
 */
export async function sendOllamaChat(params: {
  promptText: string;
  userContext?: string;
  role?: string;
  systemInstruction?: string;
  history?: any[];
  model?: string;
  baseUrl?: string;
  tools?: any[];
}): Promise<AiResponse> {
  const { promptText, userContext, role, history, model, baseUrl, tools = OLLAMA_TOOLS } = params;
  const cleanPrompt = (promptText || '').trim();

  // 1. Clinical deterministic safety check
  const safetyHit = checkClinicalGuardrails(cleanPrompt);
  if (safetyHit) {
    return safetyHit;
  }

  const effectiveBaseUrl = getEffectiveOllamaBaseUrl(baseUrl);
  const effectiveModel = getEffectiveOllamaModel(model);

  // 2. Build system instruction
  let roleDescription = 'You are PAIOS (Personal AI Operating System), a calm, highly intelligent personal productivity, life, and health assistant running offline locally.';
  if (role === 'sdet_mentor') {
    roleDescription = 'You are PAIOS SDET & ISTQB Mentor, an expert software test automation lead and engineering study coach specializing in ISTQB CTFL certification, Playwright/Python/Selenium automation, test strategy, and code review.';
  } else if (role === 'health_specialist') {
    roleDescription = 'You are PAIOS Health & Wellness Companion, an empathetic health-tracking assistant specializing in non-prescriptive medication logs, symptom tracking, refill alerts, and lifestyle wellness.';
  } else if (role === 'creative_coach') {
    roleDescription = 'You are PAIOS Creative Brainstormer & Performance Coach, an energetic coach focused on problem-solving, career goal execution, habit design, and high-impact project ideas.';
  }

  const now = new Date();
  const baseSystemInstruction = params.systemInstruction || `
${roleDescription}
You are powered locally by ${effectiveModel} with zero cloud network egress.
You have direct access to the user's real-time local PAIOS context (activities, timeline, tasks, health/medications, check-ins, reviews, journal).

CRITICAL HEALTH & CLINICAL SAFETY BOUNDARIES:
1. STRICT NON-PRESCRIPTIVE POLICY: NEVER suggest altering, increasing, decreasing, or stopping any medication. NEVER diagnose conditions or assert direct clinical causality.
2. MISSED DOSE PROTOCOL: NEVER tell a user to take a double dose to make up for a missed pill. Quote standard FDA leaflet guidance: "Take as soon as remembered unless close to the next scheduled dose; never double up."
3. HEALTH-AWARE TASK PRIORITIZATION: If dizziness, sedation, or grogginess is logged in the user context, advise caution regarding physical hazards.
4. EPISTEMIC PROVENANCE: Treat prescription records, RxNorm CUIs, and adherence logs as authoritative ground truth. Never invent missing doses.

CRITICAL TIME-BASED GROUNDING RULES:
1. Current Local Time: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
2. All advice, schedule suggestions, and reflections MUST be explicitly anchored to the user's current date and time of day.

SUPPORTED STRUCTURED ACTION FORMATS (Include at the VERY END of your response if an action is requested):
[[ACTION: {"type": "ADD_TASK", "title": "Finish API testing", "category": "Testing"}]]
or
[[ACTION: {"type": "CREATE_TASKS", "tasks": [{"title": "Review requirements", "category": "Work", "priority": "HIGH", "description": "Clarify the expected outcome"}]}]]
or
[[ACTION: {"type": "START_ACTIVITY", "name": "Study ISTQB", "category": "Study"}]]
or
[[ACTION: {"type": "SAVE_NOTE", "text": "Investigate API timeout issue"}]]
or
[[ACTION: {"type": "LOG_DOSE", "medication_ids": ["med_1"], "action": "TAKEN", "notes": "Morning dose taken"}]]
or
[[ACTION: {"type": "LOG_TRANSACTION", "type": "OUTFLOW", "amount": 25, "title": "Lunch", "category": "Food"}]]

Active PAIOS Context & Metadata:
${userContext || 'No context available.'}
`.trim();

  // 3. Assemble Ollama messages format
  const messages: OllamaChatMessage[] = [
    { role: 'system', content: baseSystemInstruction },
  ];

  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-12);
    for (const msg of recent) {
      if (msg && msg.text && typeof msg.text === 'string' && msg.text.trim()) {
        const isUserMsg = msg.isUser || msg.sender === 'USER' || msg.role === 'user';
        messages.push({
          role: isUserMsg ? 'user' : 'assistant',
          content: msg.text.trim(),
        });
      }
    }
  }

  if (messages.length <= 1 || messages[messages.length - 1].content !== cleanPrompt) {
    messages.push({
      role: 'user',
      content: cleanPrompt,
    });
  }

  // 4. Send request to Ollama /api/chat
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 60000) : null;

    const payload: any = {
      model: effectiveModel,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    const res = await fetch(`${effectiveBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      let parsedErr = '';
      try {
        parsedErr = JSON.parse(errBody)?.error || errBody;
      } catch {
        parsedErr = errBody;
      }
      return {
        text: `Ollama Local Error (HTTP ${res.status}): ${parsedErr || res.statusText}. Please verify that '${effectiveModel}' is pulled in Ollama (\`ollama run ${effectiveModel}\`).`,
        error: parsedErr || `HTTP ${res.status}`,
      };
    }

    const data: OllamaChatResponse = await res.json();
    const rawContent = data.message?.content || '';
    const toolCalls = data.message?.tool_calls || [];

    // 5. Parse action block from content or tool calls
    let actionType: string | null = null;
    let actionPayloadJson: string | null = null;

    const actionRegex = /\[\[ACTION:\s*(\{.*?\})\s*\]\]/s;
    const match = actionRegex.exec(rawContent);

    if (match) {
      actionPayloadJson = match[1];
      if (actionPayloadJson.includes('CREATE_TASKS')) actionType = 'CREATE_TASKS';
      else if (actionPayloadJson.includes('ADD_TASK')) actionType = 'ADD_TASK';
      else if (actionPayloadJson.includes('START_ACTIVITY')) actionType = 'START_ACTIVITY';
      else if (actionPayloadJson.includes('SAVE_NOTE')) actionType = 'SAVE_NOTE';
      else if (actionPayloadJson.includes('LOG_DOSE') || actionPayloadJson.includes('record_medication_dose')) actionType = 'LOG_DOSE';
      else if (actionPayloadJson.includes('LOG_TRANSACTION') || actionPayloadJson.includes('log_transaction')) actionType = 'LOG_TRANSACTION';
      else if (actionPayloadJson.includes('create_task')) actionType = 'create_task';
      else if (actionPayloadJson.includes('LOG_SYMPTOM')) actionType = 'LOG_SYMPTOM';
      else if (actionPayloadJson.includes('BOOK_APPOINTMENT')) actionType = 'BOOK_APPOINTMENT';
    }

    // Parse native Ollama tool calls if present
    if (!actionType && toolCalls.length > 0) {
      const call = toolCalls[0]?.function;
      if (call) {
        const fnName = call.name;
        const fnArgs = typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : (call.arguments || {});

        if (fnName === 'record_medication_dose' || fnName === 'log_dose') {
          actionType = 'LOG_DOSE';
          actionPayloadJson = JSON.stringify({
            type: 'record_medication_dose',
            medication_ids: fnArgs.medication_ids || ['all_due'],
            action: fnArgs.action || 'TAKEN',
            notes: fnArgs.notes || 'Logged via Ollama Tool Call',
            timestamp: fnArgs.timestamp || Date.now(),
          });
        } else if (fnName === 'log_transaction') {
          actionType = 'LOG_TRANSACTION';
          actionPayloadJson = JSON.stringify({ type: 'log_transaction', ...fnArgs });
        } else if (fnName === 'create_task') {
          actionType = 'create_task';
          actionPayloadJson = JSON.stringify({ type: 'create_task', ...fnArgs });
        }
      }
    }

    const cleanText = rawContent.replace(actionRegex, '').trim() || (actionType ? `Action ${actionType} recorded successfully.` : '');

    return {
      text: cleanText,
      actionType,
      actionPayloadJson,
    };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    const msg = isAbort
      ? `Local Ollama inference timed out (60s). Check system resource usage or GPU offloading.`
      : `Unable to reach local Ollama daemon at ${effectiveBaseUrl}: ${err?.message || 'Connection Refused'}. Make sure Ollama is running (\`ollama serve\`) and model \`${effectiveModel}\` is available.`;

    return {
      text: msg,
      error: err?.message || 'Connection Error',
    };
  }
}

/**
 * Async generator for streaming responses from Ollama
 */
export async function* streamOllamaChat(params: {
  promptText: string;
  userContext?: string;
  role?: string;
  model?: string;
  baseUrl?: string;
}): AsyncGenerator<string, void, unknown> {
  const { promptText, userContext, role, model, baseUrl } = params;
  const cleanPrompt = (promptText || '').trim();

  const safetyHit = checkClinicalGuardrails(cleanPrompt);
  if (safetyHit) {
    yield safetyHit.text;
    return;
  }

  const effectiveBaseUrl = getEffectiveOllamaBaseUrl(baseUrl);
  const effectiveModel = getEffectiveOllamaModel(model);

  const res = await fetch(`${effectiveBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: effectiveModel,
      messages: [
        { role: 'system', content: `You are PAIOS running locally via ${effectiveModel}. Context: ${userContext || 'None'}` },
        { role: 'user', content: cleanPrompt },
      ],
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    yield `Ollama streaming error: HTTP ${res.status}`;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          yield parsed.message.content;
        }
      } catch {}
    }
  }
}
