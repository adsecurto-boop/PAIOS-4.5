import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from './src/server/db';

const _filename = typeof __filename !== 'undefined' ? __filename : '';
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

const app = express();
const PORT = process.env.PORT || 3001;
// Production deployments must supply a stable secret. Development receives an
// ephemeral secret so credentials cannot be forged with a repository default.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production.');
}
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test'
  ? 'paios-test-jwt-secret-not-for-production'
  : crypto.randomBytes(32).toString('hex'));

// AI Provider Configurations (Google Gemini Cloud vs. Ollama Local qwen2.5:7b)
export const PAIOS_AI_PROVIDER = (process.env.PAIOS_AI_PROVIDER || 'gemini').toLowerCase();
export const PAIOS_OLLAMA_MODEL = process.env.PAIOS_OLLAMA_MODEL || 'qwen2.5:7b';
export const PAIOS_OLLAMA_BASE_URL = (process.env.PAIOS_OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');

function resolveLocalOllamaUrl(candidate?: string): string {
  if (!candidate) return PAIOS_OLLAMA_BASE_URL;
  const parsed = new URL(candidate);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only a local Ollama endpoint may be selected from the client.');
  }
  return parsed.toString().replace(/\/$/, '');
}

/**
 * Server-side Ollama execution proxy targeting local qwen2.5:7b
 */
export async function executeOllamaChatServer(params: {
  cleanUserText: string;
  systemInstruction: string;
  history?: any[];
  model?: string;
  baseUrl?: string;
}): Promise<{ reply: string; actionType: string | null; actionPayloadJson: string | null; usage?: any }> {
  const baseUrl = resolveLocalOllamaUrl(params.baseUrl);
  const model = params.model || PAIOS_OLLAMA_MODEL;

  const messages: any[] = [{ role: 'system', content: params.systemInstruction }];

  if (Array.isArray(params.history) && params.history.length > 0) {
    const recent = params.history.slice(-14);
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

  if (messages.length <= 1 || messages[messages.length - 1].content !== params.cleanUserText) {
    messages.push({
      role: 'user',
      content: params.cleanUserText,
    });
  }

  const tools = [
    {
      type: 'function',
      function: {
        name: 'record_medication_dose',
        description: 'Records or updates medication dose adherence status in user health ledger.',
        parameters: {
          type: 'object',
          properties: {
            medication_ids: { type: 'array', items: { type: 'string' } },
            action: { type: 'string', enum: ['TAKEN', 'SKIPPED', 'TAKEN_LATE'] },
            timestamp: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'log_transaction',
        description: 'Records a financial inflow or outflow in the money manager ledger.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            amount: { type: 'number' },
            type: { type: 'string', enum: ['INFLOW', 'OUTFLOW'] },
            category: { type: 'string' },
            notes: { type: 'string' },
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
            title: { type: 'string' },
            priority: { type: 'string', enum: ['HIGH', 'NORMAL', 'LOW'] },
            dueDate: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: false,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text || res.statusText}`);
  }

  const data: any = await res.json();
  const rawContent = data.message?.content || '';
  const toolCalls = data.message?.tool_calls || [];

  let actionType: string | null = null;
  let actionPayloadJson: string | null = null;

  const actionRegex = /\[\[ACTION:\s*(\{.*?\})\s*\]\]/s;
  const match = actionRegex.exec(rawContent);

  if (match) {
    actionPayloadJson = match[1];
    if (actionPayloadJson.includes('ADD_TASK')) actionType = 'ADD_TASK';
    else if (actionPayloadJson.includes('START_ACTIVITY')) actionType = 'START_ACTIVITY';
    else if (actionPayloadJson.includes('SAVE_NOTE')) actionType = 'SAVE_NOTE';
    else if (actionPayloadJson.includes('LOG_DOSE') || actionPayloadJson.includes('record_medication_dose')) actionType = 'LOG_DOSE';
    else if (actionPayloadJson.includes('LOG_TRANSACTION') || actionPayloadJson.includes('log_transaction')) actionType = 'LOG_TRANSACTION';
    else if (actionPayloadJson.includes('create_task')) actionType = 'create_task';
    else if (actionPayloadJson.includes('LOG_SYMPTOM')) actionType = 'LOG_SYMPTOM';
    else if (actionPayloadJson.includes('BOOK_APPOINTMENT')) actionType = 'BOOK_APPOINTMENT';
  }

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

  const cleanReply = rawContent.replace(actionRegex, '').trim() || (actionType ? `Action ${actionType} recorded successfully.` : '');

  return {
    reply: cleanReply,
    actionType,
    actionPayloadJson,
    usage: {
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    },
  };
}

app.use(express.json());

// Authentication Middleware
export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Authorization Bearer token is required' });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token is required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const user = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(decoded.id) as {
      id: string;
      email: string;
      display_name: string;
      created_at: number;
    } | undefined;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User session no longer exists' });
    }

    (req as any).user = {
      id: user.id,
      email: user.email.toLowerCase(),
      displayName: user.display_name || user.email.split('@')[0],
      created_at: user.created_at,
    };
    (req as any).userId = user.id;
    next();
  } catch (err: any) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  }
}

// API Endpoint: Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'PAIOS' });
});

// Diagnostic & Status Endpoint for AI Assistant Providers (Ollama Local vs. Google Gemini)
app.get('/assistant/status', requireAuth, async (req, res) => {
  const requestedProvider = ((req.query.provider as string) || PAIOS_AI_PROVIDER).toLowerCase();
  let baseUrl: string;
  try { baseUrl = resolveLocalOllamaUrl(req.query.baseUrl as string | undefined); }
  catch (err: any) { return res.status(400).json({ error: err.message }); }
  const targetModel = (req.query.model as string) || PAIOS_OLLAMA_MODEL;

  let ollamaAvailable = false;
  let ollamaModels: string[] = [];
  let hasModel = false;
  let ollamaError: string | undefined;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(t);
    if (resp.ok) {
      const data: any = await resp.json();
      ollamaModels = (data?.models || []).map((m: any) => (typeof m === 'string' ? m : m?.name || '')).filter(Boolean);
      ollamaAvailable = true;
      const targetClean = targetModel.toLowerCase().trim();
      hasModel = ollamaModels.some((n: string) => {
        const lower = n.toLowerCase().trim();
        return (
          lower === targetClean ||
          lower === `${targetClean}:latest` ||
          lower.startsWith(`${targetClean}:`) ||
          targetClean.startsWith(`${lower}:`)
        );
      });
    } else {
      ollamaError = `HTTP ${resp.status}: ${resp.statusText}`;
    }
  } catch (err: any) {
    ollamaError = err?.message || 'Connection Refused';
  }

  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('test-'));
  const activeProvider = requestedProvider === 'ollama' ? 'ollama' : 'gemini';
  const isAvailable = activeProvider === 'ollama' ? (ollamaAvailable && hasModel) : hasGeminiKey;

  res.json({
    provider: activeProvider,
    model: activeProvider === 'ollama' ? targetModel : (process.env.GEMINI_MODEL || 'gemini-3.7-flash'),
    available: isAvailable,
    localEndpoint: baseUrl,
    ollamaStatus: {
      available: ollamaAvailable,
      baseUrl,
      models: ollamaModels,
      hasModel,
      model: targetModel,
      error: ollamaError,
    },
    geminiStatus: {
      available: hasGeminiKey,
      hasApiKey: hasGeminiKey,
    },
  });
});

// Diagnostic Inference Test Endpoint for AI Assistant Providers
app.post('/assistant/test', requireAuth, async (req, res) => {
  const provider = ((req.body?.provider as string) || PAIOS_AI_PROVIDER).toLowerCase();
  let baseUrl: string;
  try { baseUrl = resolveLocalOllamaUrl(req.body?.baseUrl as string | undefined); }
  catch (err: any) { return res.status(400).json({ error: err.message }); }
  const targetModel = (req.body?.model as string) || PAIOS_OLLAMA_MODEL;
  const testPrompt = req.body?.prompt || 'Hello! Respond with a 1-sentence confirmation that PAIOS is connected.';

  const startTime = Date.now();

  if (provider === 'ollama') {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 20000);
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: testPrompt }],
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return res.status(resp.status).json({
          success: false,
          provider: 'ollama',
          model: targetModel,
          error: `Ollama error HTTP ${resp.status}: ${errText}`,
          latencyMs: Date.now() - startTime,
        });
      }

      const data: any = await resp.json();
      const reply = data.message?.content || 'Model responded with empty message.';
      return res.json({
        success: true,
        provider: 'ollama',
        model: targetModel,
        reply,
        latencyMs: Date.now() - startTime,
      });
    } catch (err: any) {
      return res.status(503).json({
        success: false,
        provider: 'ollama',
        model: targetModel,
        error: `Ollama connection failed: ${err.message || 'Unreachable'}`,
        latencyMs: Date.now() - startTime,
      });
    }
  } else {
    // Gemini test inference
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('test-')) {
      return res.json({
        success: true,
        provider: 'gemini',
        model: 'gemini-3.7-flash',
        reply: 'Gemini test response (running with test / mock credentials).',
        latencyMs: Date.now() - startTime,
      });
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const resp = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
      });
      return res.json({
        success: true,
        provider: 'gemini',
        model: 'gemini-3.7-flash',
        reply: resp.text || '',
        latencyMs: Date.now() - startTime,
      });
    } catch (err: any) {
      return res.status(503).json({
        success: false,
        provider: 'gemini',
        model: 'gemini-3.7-flash',
        error: `Gemini call failed: ${err.message || err}`,
        latencyMs: Date.now() - startTime,
      });
    }
  }
});

// --- IN-APP SOFTWARE UPDATE & VERSION ENDPOINTS ---
const dynamicVersionManifest: any = {
  version: '4.6.1',
  buildNumber: '9',
  buildTimestamp: Date.now(),
  gitCommit: 'c3249c0',
  releaseNotes: 'PAIOS v4.6.1: Balance Sheet Cashflow Routing, Savings Pots Isolation, Downgrade Protection & Net Worth Integrity',
  platforms: {
    windows: {
      url: 'https://github.com/adsecurto-boop/PAIOS-4.5/releases/download/latest/PAIOS-Desktop-Windows-x64.zip',
      filename: 'PAIOS-Desktop-Windows-x64.zip',
    },
    android: {
      url: 'https://github.com/adsecurto-boop/PAIOS-4.5/releases/download/latest/app-release.apk',
      filename: 'app-release.apk',
    },
  },
};

// API Endpoint: Version Check Manifest
app.get('/api/version', (_req, res) => {
  const versionPath = path.join(_dirname, 'dist', 'version.json');
  if (fs.existsSync(versionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
      return res.json(data);
    } catch (e) {}
  }
  res.json(dynamicVersionManifest);
});

// API Endpoint: Publish New Version
app.post('/api/version/publish', (_req, res) => {
  res.status(403).json({ error: 'Version publishing is restricted to the release pipeline.' });
});

// API Endpoint: Download Platform Binary (Windows ZIP / Android APK)
app.get('/api/version/download/:platform', (req, res) => {
  const platform = req.params.platform;
  if (platform === 'android') {
    const apkPath = path.join(_dirname, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    const debugApkPath = path.join(_dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (fs.existsSync(apkPath)) {
      return res.download(apkPath, 'PAIOS-Release.apk');
    } else if (fs.existsSync(debugApkPath)) {
      return res.download(debugApkPath, 'PAIOS-Debug.apk');
    }
    return res.redirect('https://github.com/adsecurto-boop/PAIOS-4.5/releases/download/latest/app-release.apk');
  } else if (platform === 'windows') {
    const zipPath = path.join(_dirname, 'dist-electron', 'PAIOS-Desktop-Windows-x64.zip');
    const webZipPath = path.join(_dirname, 'dist', 'PAIOS-Web-Dist.zip');
    if (fs.existsSync(zipPath)) {
      return res.download(zipPath, 'PAIOS-Desktop-Windows-x64.zip');
    } else if (fs.existsSync(webZipPath)) {
      return res.download(webZipPath, 'PAIOS-Web-Dist.zip');
    }
    return res.redirect('https://raw.githubusercontent.com/adsecurto-boop/PAIOS-4.5/main/public/version.json');
  }
  res.status(404).json({ error: 'Platform not found' });
});

// --- AUTHENTICATION ENDPOINTS ---
app.post('/api/auth/register', (req, res) => {
  const { email, password, displayName } = req.body || {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existingUser) {
    return res.status(409).json({ error: 'This email is already registered. Please login.' });
  }

  const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const cleanDisplayName = displayName?.trim() || cleanEmail.split('@')[0];

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, cleanEmail, passwordHash, cleanDisplayName, now, now);

  const token = jwt.sign({ id, email: cleanEmail }, JWT_SECRET, { expiresIn: '60d' });

  res.status(201).json({
    token,
    user: {
      id,
      email: cleanEmail,
      displayName: cleanDisplayName,
      created_at: now,
    },
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as any;

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. User not found.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '60d' });

  res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email.toLowerCase(),
      displayName: user.display_name || user.email.split('@')[0],
      created_at: user.created_at,
    },
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = (req as any).user;
  res.status(200).json({ user });
});

// --- MULTI-STORE SQLITE SYNC ENDPOINTS ---
app.post('/api/sync/push', requireAuth, (req, res) => {
  const userId = (req as any).userId;
  const { key, payload, version } = req.body || {};

  if (!key || typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ error: 'Storage key is required' });
  }

  if (payload === undefined || payload === null) {
    return res.status(400).json({ error: 'Storage payload is required' });
  }

  const storageKey = key.trim();
  const compositeId = `${userId}:${storageKey}`;
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const v = Number.isInteger(version) ? version : 1;
  const now = Date.now();

  db.prepare(`
    INSERT INTO user_storage (id, user_id, storage_key, payload, version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload = excluded.payload,
      version = excluded.version,
      updated_at = excluded.updated_at
  `).run(compositeId, userId, storageKey, payloadStr, v, now);

  res.status(200).json({
    success: true,
    key: storageKey,
    updatedAt: now,
    syncedAt: now,
  });
});

app.get('/api/sync/pull', requireAuth, (req, res) => {
  const userId = (req as any).userId;
  const rows = db.prepare('SELECT storage_key, payload, version, updated_at FROM user_storage WHERE user_id = ?').all(userId) as any[];

  const data: Record<string, any> = {};
  for (const row of rows) {
    try {
      data[row.storage_key] = JSON.parse(row.payload);
    } catch {
      data[row.storage_key] = row.payload;
    }
  }

  res.status(200).json({
    success: true,
    data,
    pulledAt: Date.now(),
  });
});

app.delete('/api/sync/data', requireAuth, (req, res) => {
  const userId = (req as any).userId;
  const key = (req.query.key as string) || (req.body?.key as string);

  if (key && typeof key === 'string' && key.trim()) {
    const storageKey = key.trim();
    db.prepare('DELETE FROM user_storage WHERE user_id = ? AND storage_key = ?').run(userId, storageKey);
  } else {
    db.prepare('DELETE FROM user_storage WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM plugin_inbound_pit WHERE user_id = ?').run(userId);
  }

  res.status(200).json({
    success: true,
    message: key ? `Key ${key} removed` : 'All user data dropped',
  });
});

// Server-side Application Version Manifest Store
let currentServerVersion = {
  version: '1.0.0',
  buildTimestamp: 1787463500000,
  gitCommit: 'c9f81a2',
  releaseNotes: 'PAIOS Production Build - Auto-Update & Cross-Device Sync Ready',
  mandatory: false,
};

// API Endpoint: Get Version Manifest
app.get('/api/version', (_req, res) => {
  res.json(currentServerVersion);
});

// API Endpoint: Trigger / Publish New Version (for Git commits and auto-update testing)
app.post('/api/version/publish', (req, res) => {
  const { version, gitCommit, releaseNotes, mandatory } = req.body || {};
  const nextVersion = version || `1.0.${Math.floor(Math.random() * 90) + 10}`;
  const nextCommit = gitCommit || `commit_${Math.random().toString(36).substring(2, 8)}`;
  
  currentServerVersion = {
    version: nextVersion,
    buildTimestamp: Date.now(),
    gitCommit: nextCommit,
    releaseNotes: releaseNotes || 'Latest Git commit build published with performance and sync enhancements.',
    mandatory: Boolean(mandatory),
  };

  res.json({
    success: true,
    message: 'New PAIOS version published successfully!',
    serverVersion: currentServerVersion,
  });
});

// Cross-Device REST Sync API Store (Legacy backwards compatibility)
// These unauthenticated in-memory endpoints are deliberately retired.  The
// authenticated SQLite sync API above is the only supported REST sync path.
app.use(['/api/sync/vault', '/api/sync/user', '/api/sync/auth'], (_req, res) => {
  res.status(410).json({ error: 'Legacy sync endpoint retired. Use authenticated /api/sync endpoints.' });
});
interface SyncRecord {
  snapshot: Record<string, any>;
  updatedAt: number;
}

const vaultStore = new Map<string, SyncRecord>();
const userStore = new Map<string, SyncRecord>();
const authStore = new Map<string, { uid: string; email: string; password?: string; displayName: string }>();

// Vault Sync Endpoints
app.get('/api/sync/vault/:code', (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const record = vaultStore.get(code);
  res.json({
    success: true,
    snapshot: record?.snapshot || null,
    updatedAt: record?.updatedAt || 0,
  });
});

app.post('/api/sync/vault/:code', (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const { snapshot } = req.body;
  if (!snapshot) {
    res.status(400).json({ error: 'Missing snapshot' });
    return;
  }
  const updatedAt = Date.now();
  vaultStore.set(code, { snapshot, updatedAt });
  res.json({ success: true, snapshot, updatedAt });
});

// User Cloud Sync Endpoints
app.get('/api/sync/user/:userId', (req, res) => {
  const userId = req.params.userId.trim();
  const record = userStore.get(userId);
  res.json({
    success: true,
    snapshot: record?.snapshot || null,
    updatedAt: record?.updatedAt || 0,
  });
});

app.post('/api/sync/user/:userId', (req, res) => {
  const userId = req.params.userId.trim();
  const { snapshot } = req.body;
  if (!snapshot) {
    res.status(400).json({ error: 'Missing snapshot' });
    return;
  }
  const updatedAt = Date.now();
  userStore.set(userId, { snapshot, updatedAt });
  res.json({ success: true, snapshot, updatedAt });
});

// User Auth Endpoint (Legacy backwards compatibility)
app.post('/api/sync/auth', (req, res) => {
  const { action, email, password, displayName } = req.body;

  if (action === 'guest') {
    const guestUid = `guest_${Math.random().toString(36).substring(2, 9)}`;
    const user = { uid: guestUid, email: null, displayName: 'Guest User' };
    res.json({ success: true, user });
    return;
  }

  if (action === 'signup') {
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const lowerEmail = email.toLowerCase();
    if (authStore.has(lowerEmail)) {
      res.status(400).json({ error: 'This email is already registered. Please sign in instead.' });
      return;
    }
    const uid = `user_${Math.random().toString(36).substring(2, 11)}`;
    const newUser = { uid, email: lowerEmail, password, displayName: displayName || email.split('@')[0] };
    authStore.set(lowerEmail, newUser);
    res.json({ success: true, user: { uid: newUser.uid, email: newUser.email, displayName: newUser.displayName } });
    return;
  }

  if (action === 'login') {
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const lowerEmail = email.toLowerCase();
    const existing = authStore.get(lowerEmail);
    if (!existing || existing.password !== password) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    res.json({ success: true, user: { uid: existing.uid, email: existing.email, displayName: existing.displayName } });
    return;
  }

  res.status(400).json({ error: 'Invalid action' });
});

// API Endpoint: AI Chat (Dual-Engine: Google Gemini Cloud & Ollama Local qwen2.5:7b)
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const { message, userText, userContext, modelName, role, taskComplexity, history, aiProvider, ollamaModel, ollamaBaseUrl } = req.body || {};
    const promptText = (message !== undefined ? message : userText);

    if (!promptText || typeof promptText !== 'string' || !promptText.trim()) {
      return res.status(400).json({ error: 'Message payload is required and cannot be empty' });
    }

    const cleanUserText = promptText.trim();

    // Pre-processing Emergency Red-Flag Interceptor
    const redFlagRegexes = [
      { category: 'CARDIOVASCULAR', pattern: /\b(chest pain|crushing chest|chest pressure|left arm numb|passed out|syncope)\b/i },
      { category: 'ANAPHYLAXIS', pattern: /\b(throat closing|swollen lips|swollen tongue|cannot breathe|hives all over)\b/i },
      { category: 'NEUROLOGICAL', pattern: /\b(slurred speech|face drooping|sudden vision loss|seizure|convulsing)\b/i },
      { category: 'SEROTONIN_TOXICITY', pattern: /\b(severe tremor|rigid muscles|fever and agitation|serotonin syndrome)\b/i },
      { category: 'PSYCHIATRIC_CRISIS', pattern: /\b(want to end my life|suicidal thoughts|plan to harm myself)\b/i },
    ];

    for (const flag of redFlagRegexes) {
      if (flag.pattern.test(cleanUserText)) {
        const emergencyText = `🚨 EMERGENCY MEDICAL ALERT (${flag.category}): The symptoms you described may indicate a medical emergency. Please call emergency services (911 or 112) or go to the nearest emergency room immediately. PAIOS cannot provide emergency treatment.`;
        return res.json({
          reply: emergencyText,
          text: emergencyText,
          actionType: null,
          actionPayloadJson: null,
        });
      }
    }

    // Pre-processing Prescription Alteration & Double-Dose Interceptor
    if (/\b(double.*dose|take.*two.*pills|take.*extra.*pill|increase.*dose|decrease.*dose|change.*dosage|stop.*taking.*medication)\b/i.test(cleanUserText)) {
      const refusalText = `⚠️ MEDICAL SAFETY NOTICE: PAIOS is strictly an organizational decision-support assistant and cannot alter, adjust, or prescribe medication dosages. Never double up on a missed dose. Please consult your prescribing doctor or pharmacist before making any changes to your medication schedule.`;
      return res.json({
        reply: refusalText,
        text: refusalText,
        actionType: null,
        actionPayloadJson: null,
      });
    }

    // Role Persona System Instructions
    let roleDescription = 'You are PAIOS (Personal AI Operating System), a calm, highly intelligent personal productivity, life, and health assistant.';
    if (role === 'sdet_mentor') {
      roleDescription = 'You are PAIOS SDET & ISTQB Mentor, an expert software test automation lead and engineering study coach specializing in ISTQB CTFL certification, Playwright/Python/Selenium automation, test strategy, and code review.';
    } else if (role === 'health_specialist') {
      roleDescription = 'You are PAIOS Health & Wellness Companion, an empathetic health-tracking assistant specializing in non-prescriptive medication logs, symptom tracking, refill alerts, and lifestyle wellness.';
    } else if (role === 'creative_coach') {
      roleDescription = 'You are PAIOS Creative Brainstormer & Performance Coach, an energetic coach focused on problem-solving, career goal execution, habit design, and high-impact project ideas.';
    }

    const serverNow = new Date();
    const systemInstruction = `
${roleDescription}
You have direct access to the user's real-time local PAIOS context (activities, timeline, tasks, health/medications, check-ins, reviews, journal).

CRITICAL HEALTH & CLINICAL SAFETY BOUNDARIES:
1. STRICT NON-PRESCRIPTIVE POLICY: NEVER suggest altering, increasing, decreasing, or stopping any medication. NEVER diagnose conditions or assert direct clinical causality.
2. MISSED DOSE PROTOCOL: NEVER tell a user to take a double dose to make up for a missed pill. Quote standard FDA leaflet guidance: "Take as soon as remembered unless close to the next scheduled dose; never double up."
3. HEALTH-AWARE TASK PRIORITIZATION: If dizziness, sedation, or grogginess is logged in the user context, advise caution regarding physical hazards (driving, heavy machinery).
4. EPISTEMIC PROVENANCE: Treat prescription records, RxNorm CUIs, and adherence logs as authoritative ground truth. Never invent missing doses or false refill numbers.

CRITICAL TIME-BASED GROUNDING RULES:
1. ALWAYS reference the explicit CURRENT LOCAL TIME & DATE METADATA provided in the context below (Server Time: ${serverNow.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${serverNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).
2. All advice, schedule suggestions, and reflections MUST be explicitly anchored to the user's current date and time of day.
3. Answer user questions directly, objectively, and accurately based on their real PAIOS data. Never fabricate data.

SUPPORTED STRUCTURED ACTION FORMATS (Include at the VERY END of your response if an action is requested):
[[ACTION: {"type": "ADD_TASK", "title": "Finish API testing", "category": "Testing"}]]
or
[[ACTION: {"type": "START_ACTIVITY", "name": "Study ISTQB", "category": "Study"}]]
or
[[ACTION: {"type": "SAVE_NOTE", "text": "Investigate API timeout issue"}]]
or
[[ACTION: {"type": "LOG_DOSE", "medication_ids": ["med_1"], "action": "TAKEN", "notes": "Morning dose taken"}]]
or
[[ACTION: {"type": "LOG_SYMPTOM", "symptomName": "Dizziness", "severity": 3}]]
or
[[ACTION: {"type": "BOOK_APPOINTMENT", "doctorName": "Dr Devendra Ratnani", "dateString": "2026-09-02", "timeString": "10:30", "reason": "Follow-up"}]]

Active PAIOS Context & Metadata:
${userContext || 'No context available.'}
`.trim();

    const effectiveProvider = ((aiProvider as string) || PAIOS_AI_PROVIDER).toLowerCase();
    const effectiveOllamaModel = (ollamaModel as string) || PAIOS_OLLAMA_MODEL;
    const effectiveOllamaBaseUrl = ((ollamaBaseUrl as string) || PAIOS_OLLAMA_BASE_URL).replace(/\/+$/, '');

    // Direct Ollama Route when explicitly configured
    if (effectiveProvider === 'ollama') {
      try {
        const ollamaRes = await executeOllamaChatServer({
          cleanUserText,
          systemInstruction,
          history,
          model: effectiveOllamaModel,
          baseUrl: effectiveOllamaBaseUrl,
        });

        return res.status(200).json({
          reply: ollamaRes.reply,
          text: ollamaRes.reply,
          actionType: ollamaRes.actionType,
          actionPayloadJson: ollamaRes.actionPayloadJson,
          usage: ollamaRes.usage,
          provider: 'ollama',
          model: effectiveOllamaModel,
        });
      } catch (ollamaErr: any) {
        console.warn('Ollama chat execution failed, checking fallback:', ollamaErr?.message || ollamaErr);
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('test-')) {
          return res.status(503).json({
            error: `Local Ollama (${effectiveOllamaModel} at ${effectiveOllamaBaseUrl}) unavailable: ${ollamaErr?.message || 'Connection refused'}. Ensure Ollama daemon is running (\`ollama serve\`) and '${effectiveOllamaModel}' is pulled.`,
          });
        }
        // Fall back to Gemini if available
      }
    }

    // Always use server-side process.env.GEMINI_API_KEY (strictly ignore client-supplied keys)
    const apiKey = process.env.GEMINI_API_KEY;

    // Test environment or dummy key fallback
    if (process.env.NODE_ENV === 'test' || !apiKey || apiKey.startsWith('test-')) {
      // If not in test mode, try Ollama before returning dummy response
      if (process.env.NODE_ENV !== 'test' && !apiKey) {
        try {
          const fallbackRes = await executeOllamaChatServer({
            cleanUserText,
            systemInstruction,
            history,
            model: effectiveOllamaModel,
            baseUrl: effectiveOllamaBaseUrl,
          });
          return res.status(200).json({
            reply: fallbackRes.reply,
            text: fallbackRes.reply,
            actionType: fallbackRes.actionType,
            actionPayloadJson: fallbackRes.actionPayloadJson,
            usage: fallbackRes.usage,
            provider: 'ollama',
            model: effectiveOllamaModel,
            fallback: true,
          });
        } catch (ollamaFallbackErr) {
          // Continue to test mock
        }
      }

      let actionType: string | null = null;
      let actionPayloadJson: string | null = null;
      let mockReply = `Server-side AI response for: ${cleanUserText}`;

      // If user confirms taking medication doses
      if (/\b(take|took|mark.*dose|record.*dose|log.*dose|taken)\b/i.test(cleanUserText)) {
        actionType = 'LOG_DOSE';
        actionPayloadJson = JSON.stringify({
          type: 'record_medication_dose',
          action: 'TAKEN',
          medication_ids: ['all_due'],
          notes: 'Dose marked taken via AI Assistant conversation',
          timestamp: Date.now(),
        });
        mockReply = `I have marked your scheduled medication dose as taken in your Health Ledger.`;
      } else if (/\b(spent|spend|paid|received|earned|deposit|expense|income|transaction)\b/i.test(cleanUserText)) {
        actionType = 'LOG_TRANSACTION';
        const numMatch = cleanUserText.match(/\d+(\.\d+)?/);
        const amount = numMatch ? parseFloat(numMatch[0]) : 50;
        const isInflow = /\b(received|earned|deposit|income|salary)\b/i.test(cleanUserText);
        actionPayloadJson = JSON.stringify({
          type: 'log_transaction',
          flowType: isInflow ? 'INFLOW' : 'OUTFLOW',
          amount,
          title: cleanUserText.slice(0, 40),
          category: isInflow ? 'Salary' : 'Food',
        });
        mockReply = `I have logged this ${isInflow ? 'income' : 'expense'} transaction of ${amount} in your Ledger.`;
      } else if (/\b(create.*task|add.*task|remind.*to)\b/i.test(cleanUserText)) {
        actionType = 'create_task';
        actionPayloadJson = JSON.stringify({
          type: 'create_task',
          title: cleanUserText.replace(/^(create|add|remind me to)\s+/i, ''),
          priority: 'NORMAL',
        });
        mockReply = `I have added this task to your task list.`;
      }

      return res.status(200).json({
        reply: mockReply,
        text: mockReply,
        actionType,
        actionPayloadJson,
        usage: { totalTokens: 32 },
        provider: 'gemini',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Model candidate routing based on task complexity or explicit model selection
    let modelCandidates: string[] = [];
    const lowerModel = (modelName || '').toLowerCase();
    const mode = taskComplexity || (lowerModel.includes('pro') ? 'complex' : lowerModel.includes('lite') ? 'fast' : 'general');

    if (mode === 'complex') {
      modelCandidates = ['gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.5-flash'];
    } else if (mode === 'fast') {
      modelCandidates = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-3.5-flash'];
    } else {
      modelCandidates = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    }

    // Build multi-turn contents array from history
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-14);
      for (const msg of recentHistory) {
        if (msg && msg.text && typeof msg.text === 'string' && msg.text.trim()) {
          const roleTag = msg.isUser || msg.sender === 'USER' || msg.role === 'user' ? 'user' : 'model';
          contents.push({
            role: roleTag,
            parts: [{ text: msg.text }],
          });
        }
      }
    }

    if (contents.length === 0 || contents[contents.length - 1].parts[0].text !== cleanUserText) {
      contents.push({
        role: 'user',
        parts: [{ text: cleanUserText }],
      });
    }

    let fullText = '';
    let lastError: any = null;
    let usageMetadata: any = null;
    let geminiFunctionCalls: any[] = [];

    const geminiTools: any[] = [
      {
        functionDeclarations: [
          {
            name: 'record_medication_dose',
            description: 'Records or updates medication dose adherence status (taken, skipped, or taken late) in the user health ledger.',
            parameters: {
              type: 'OBJECT',
              properties: {
                medication_ids: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                  description: "Array of medication IDs or names, or ['all_due']",
                },
                action: {
                  type: 'STRING',
                  enum: ['TAKEN', 'SKIPPED', 'TAKEN_LATE'],
                  description: 'The adherence status for the dose',
                },
                timestamp: {
                  type: 'NUMBER',
                  description: 'Unix timestamp in milliseconds when dose was taken',
                },
                notes: {
                  type: 'STRING',
                  description: 'Optional clinical adherence observation or note',
                },
              },
              required: ['action'],
            },
          },
          {
            name: 'log_transaction',
            description: 'Records a financial inflow (income/salary) or outflow (expense/spend) into the PAIOS money manager ledger.',
            parameters: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: 'Transaction title or description' },
                amount: { type: 'NUMBER', description: 'Monetary amount' },
                type: { type: 'STRING', enum: ['INFLOW', 'OUTFLOW'], description: 'Transaction stream' },
                category: { type: 'STRING', description: 'Budget category e.g. Food, Travel, Salary, Freelance, Health' },
                notes: { type: 'STRING', description: 'Optional transaction notes or remarks' },
              },
              required: ['title', 'amount'],
            },
          },
          {
            name: 'create_task',
            description: 'Creates a new actionable task in the user PAIOS task list.',
            parameters: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: 'Task title' },
                priority: { type: 'STRING', enum: ['HIGH', 'NORMAL', 'LOW'], description: 'Task priority level' },
                dueDate: { type: 'STRING', description: 'Due date in YYYY-MM-DD format' },
              },
              required: ['title'],
            },
          },
        ],
      },
    ];

    for (const targetModel of modelCandidates) {
      try {
        const callConfig: any = {
          systemInstruction,
          temperature: 0.7,
          tools: geminiTools,
        };

        if (targetModel === 'gemini-3.1-pro-preview' || mode === 'complex') {
          callConfig.thinkingConfig = {
            thinkingLevel: ThinkingLevel.HIGH,
          };
        }

        const response = await ai.models.generateContent({
          model: targetModel,
          contents,
          config: callConfig,
        });
        fullText = response.text || '';
        usageMetadata = response.usageMetadata;
        if (response.functionCalls && response.functionCalls.length > 0) {
          geminiFunctionCalls = response.functionCalls;
        }
        if (fullText) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${targetModel} call failed, trying next candidate:`, err?.message || err);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (!fullText && geminiFunctionCalls.length === 0) {
      // Fallback chain: Gemini failed, try local Ollama qwen2.5:7b
      try {
        console.warn('Gemini models failed. Attempting clean fallback to local Ollama qwen2.5:7b...');
        const fallbackRes = await executeOllamaChatServer({
          cleanUserText,
          systemInstruction,
          history,
          model: effectiveOllamaModel,
          baseUrl: effectiveOllamaBaseUrl,
        });
        return res.status(200).json({
          reply: fallbackRes.reply,
          text: fallbackRes.reply,
          actionType: fallbackRes.actionType,
          actionPayloadJson: fallbackRes.actionPayloadJson,
          usage: fallbackRes.usage,
          provider: 'ollama',
          model: effectiveOllamaModel,
          fallback: true,
        });
      } catch (ollamaErr: any) {
        return res.status(502).json({
          error: `AI gateway communication failed (Gemini error: ${lastError?.message || 'Failed'}; Ollama fallback: ${ollamaErr?.message || 'Unavailable'})`,
        });
      }
    }

    // Parse action block or tool calls
    let actionType: string | null = null;
    let actionPayloadJson: string | null = null;
    const actionRegex = /\[\[ACTION:\s*(\{.*?\})\s*\]\]/s;
    const match = actionRegex.exec(fullText);

    if (match) {
      actionPayloadJson = match[1];
      if (actionPayloadJson.includes('ADD_TASK')) actionType = 'ADD_TASK';
      else if (actionPayloadJson.includes('START_ACTIVITY')) actionType = 'START_ACTIVITY';
      else if (actionPayloadJson.includes('SAVE_NOTE')) actionType = 'SAVE_NOTE';
      else if (actionPayloadJson.includes('LOG_DOSE') || actionPayloadJson.includes('record_medication_dose')) actionType = 'LOG_DOSE';
      else if (actionPayloadJson.includes('LOG_TRANSACTION') || actionPayloadJson.includes('log_transaction')) actionType = 'LOG_TRANSACTION';
      else if (actionPayloadJson.includes('create_task')) actionType = 'create_task';
      else if (actionPayloadJson.includes('LOG_SYMPTOM')) actionType = 'LOG_SYMPTOM';
      else if (actionPayloadJson.includes('BOOK_APPOINTMENT')) actionType = 'BOOK_APPOINTMENT';
    }

    if (!actionType && geminiFunctionCalls.length > 0) {
      const call = geminiFunctionCalls[0];
      if (call.name === 'record_medication_dose' || call.name === 'log_dose') {
        actionType = 'LOG_DOSE';
        actionPayloadJson = JSON.stringify({
          type: 'record_medication_dose',
          medication_ids: call.args?.medication_ids || ['all_due'],
          action: call.args?.action || 'TAKEN',
          notes: call.args?.notes || 'Logged via PAIOS AI Tool Execution',
          timestamp: call.args?.timestamp || Date.now(),
        });
      } else if (call.name === 'log_transaction') {
        actionType = 'LOG_TRANSACTION';
        actionPayloadJson = JSON.stringify({ type: 'log_transaction', ...call.args });
      } else if (call.name === 'create_task') {
        actionType = 'create_task';
        actionPayloadJson = JSON.stringify({ type: 'create_task', ...call.args });
      } else if (call.name === 'add_task') {
        actionType = 'ADD_TASK';
        actionPayloadJson = JSON.stringify({ type: 'ADD_TASK', ...call.args });
      } else if (call.name === 'start_activity') {
        actionType = 'START_ACTIVITY';
        actionPayloadJson = JSON.stringify({ type: 'START_ACTIVITY', ...call.args });
      } else if (call.name === 'save_note') {
        actionType = 'SAVE_NOTE';
        actionPayloadJson = JSON.stringify({ type: 'SAVE_NOTE', ...call.args });
      }
    }

    const cleanText = fullText.replace(actionRegex, '').trim() || (actionType ? `Action ${actionType} recorded successfully.` : '');

    res.status(200).json({
      reply: cleanText,
      text: cleanText,
      actionType,
      actionPayloadJson,
      usage: usageMetadata,
      provider: 'gemini',
    });
  } catch (err: any) {
    console.error('Gemini API Error:', err);
    res.status(503).json({
      error: `AI Service Unavailable: ${err.message || 'Internal Server Error'}`,
    });
  }
});

// API Endpoint: Content Operations & Analysis (Dual-Engine: Gemini & Ollama)
app.post('/api/ai/analyze-content', requireAuth, async (req, res) => {
  try {
    const { prompt, content, taskComplexity = 'general', aiProvider, ollamaModel, ollamaBaseUrl } = req.body || {};

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const provider = ((aiProvider as string) || PAIOS_AI_PROVIDER).toLowerCase();
    const targetOllamaModel = (ollamaModel as string) || PAIOS_OLLAMA_MODEL;
    const targetOllamaBaseUrl = resolveLocalOllamaUrl(ollamaBaseUrl as string | undefined);
    const apiKey = process.env.GEMINI_API_KEY;

    // Direct Ollama Route or fallback when no Gemini key is configured
    if (provider === 'ollama' || !apiKey) {
      try {
        const instruction = prompt || 'Analyze, summarize, or edit the following user text for clarity, key insights, and actionable steps:';
        const resp = await fetch(`${targetOllamaBaseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: targetOllamaModel,
            messages: [
              { role: 'system', content: instruction },
              { role: 'user', content },
            ],
            stream: false,
          }),
        });

        if (resp.ok) {
          const data: any = await resp.json();
          return res.json({
            success: true,
            modelUsed: `ollama:${targetOllamaModel}`,
            provider: 'ollama',
            taskComplexity,
            resultText: data.message?.content || '',
          });
        }
      } catch (ollamaErr: any) {
        if (!apiKey) {
          return res.json({
            success: false,
            error: `Ollama analysis failed: ${ollamaErr.message}`,
            resultText: 'Local Ollama analysis failed and no Gemini API key is configured.',
          });
        }
      }
    }

    if (!apiKey) {
      res.json({
        success: false,
        error: 'No Gemini API key available.',
        resultText: 'API key missing. Please check server configuration or Settings.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let modelName = 'gemini-3.5-flash';
    const config: any = { temperature: 0.3 };

    if (taskComplexity === 'complex') {
      modelName = 'gemini-3.1-pro-preview';
      config.thinkingConfig = {
        thinkingLevel: ThinkingLevel.HIGH,
      };
      // Do NOT set maxOutputTokens
    } else if (taskComplexity === 'fast') {
      modelName = 'gemini-3.1-flash-lite';
    }

    const instruction = prompt || 'Analyze, summarize, or edit the following user text for clarity, key insights, and actionable steps:';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: `${instruction}\n\n---\n${content}`,
      config,
    });

    res.json({
      success: true,
      modelUsed: modelName,
      taskComplexity,
      resultText: response.text || '',
    });
  } catch (err: any) {
    console.error('Gemini Content Analysis Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error',
      resultText: `Content analysis failed: ${err.message}`,
    });
  }
});

// Local Fallback Rule-Based Adaptive Timetable Generator
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 615;
  const clean = timeStr.trim().toLowerCase();
  let hours = 0;
  let minutes = 0;

  if (clean.includes('am') || clean.includes('pm')) {
    const isPm = clean.includes('pm');
    const parts = clean.replace(/am|pm/g, '').trim().split(':');
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
  } else {
    const parts = clean.split(':');
    hours = parseInt(parts[0], 10) || 0;
    minutes = parseInt(parts[1], 10) || 0;
  }
  return hours * 60 + minutes;
}

function formatMinutesToTime(mins: number): string {
  const norm = (mins + 24 * 60) % (24 * 60);
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function generateLocalFallbackTimetable(params: {
  currentTimeStr: string;
  isWorkday: boolean;
  officeStartTime: string;
  officeEndTime: string;
  bedtime: string;
}) {
  const {
    currentTimeStr = '10:15',
    isWorkday = true,
    officeStartTime = '13:00',
    officeEndTime = '22:00',
    bedtime = '00:00',
  } = params;

  let cursor = parseTimeToMinutes(currentTimeStr);
  let endDayMins = parseTimeToMinutes(bedtime);
  if (endDayMins <= cursor) {
    endDayMins += 24 * 60;
  }

  const officeStartMins = parseTimeToMinutes(officeStartTime);
  const officeEndMins = parseTimeToMinutes(officeEndTime);

  const blocks: any[] = [];
  let blockIdx = 1;

  const addBlock = (durationMins: number, activity: string, category: string, priority: string, reason: string, goal?: string) => {
    if (cursor >= endDayMins) return;
    const blockEnd = Math.min(cursor + durationMins, endDayMins);
    const dur = blockEnd - cursor;
    if (dur <= 0) return;

    blocks.push({
      id: `fallback_block_${blockIdx++}`,
      start: formatMinutesToTime(cursor),
      end: formatMinutesToTime(blockEnd),
      duration_minutes: dur,
      activity,
      category,
      goal: goal || (category === 'Study' ? 'ISTQB Certification' : category === 'Coding' ? 'Build PAIOS' : undefined),
      priority,
      reason,
      status: 'planned',
    });
    cursor = blockEnd;
  };

  addBlock(15, 'Freshen up / Prepare for focus', 'Personal', 'RECOVERY', 'Transition into active routine from current time');

  if (isWorkday) {
    if (cursor < officeStartMins) {
      const timeBeforeOffice = officeStartMins - cursor;
      if (timeBeforeOffice >= 90) {
        addBlock(75, 'ISTQB Focused Active Recall Study', 'Study', 'HIGH', 'Top-priority learning goal before office shift', 'ISTQB Certification');
        addBlock(15, 'Short Rest Break', 'Break', 'RECOVERY', 'Mental recovery between study and preparation');
      }
      if (cursor < officeStartMins - 30) {
        addBlock(30, 'Lunch & Office Preparation', 'Personal', 'RECOVERY', 'Nutritional intake and preparation for office shift');
      }
      if (cursor < officeStartMins) {
        addBlock(officeStartMins - cursor, 'Commute / Transition to Office', 'Work', 'FIXED', 'Travel and shift check-in');
      }
    }

    if (cursor < officeEndMins) {
      const shiftDur = officeEndMins - cursor;
      addBlock(shiftDur, 'Office Shift', 'Work', 'FIXED', 'Required office schedule commitment');
    }

    if (cursor < endDayMins) {
      addBlock(30, 'Commute Home & Dinner', 'Personal', 'RECOVERY', 'Post-work recovery, family time, and meal');
      if (endDayMins - cursor >= 90) {
        addBlock(45, 'PAIOS Architecture & Testing', 'Coding', 'HIGH', 'Daily engineering sprint for career and skills', 'Build PAIOS');
        addBlock(15, 'Short Rest Break', 'Break', 'RECOVERY', 'Relaxation break');
      }
    }
  } else {
    addBlock(90, 'ISTQB Active Recall & Mock Tests', 'Study', 'HIGH', 'Deep learning block using spaced repetition', 'ISTQB Certification');
    addBlock(15, 'Hydration & Stretch Break', 'Break', 'RECOVERY', 'Short mental rest');
    addBlock(45, 'Lunch & Family Time', 'Personal', 'RECOVERY', 'Nutritional meal and social relaxation');
    addBlock(90, 'PAIOS Development & Automation', 'Coding', 'HIGH', 'Hands-on Playwright/Python engineering', 'Build PAIOS');
    addBlock(15, 'Rest & Recovery Break', 'Break', 'RECOVERY', 'Recovery time');
    addBlock(60, 'Playwright & Software Testing Skills', 'Testing', 'FLEXIBLE', 'Automation framework practice', 'SDET Career');
    addBlock(45, 'Dinner & Recreation', 'Personal', 'RECOVERY', 'Evening relaxation with family');
  }

  if (endDayMins - cursor >= 45) {
    const remainingBeforeWinddown = endDayMins - cursor - 45;
    if (remainingBeforeWinddown > 0) {
      addBlock(remainingBeforeWinddown, 'Flexible Personal Routine & Reading', 'Personal', 'OPTIONAL', 'Personal hobbies or light reading');
    }
    addBlock(15, 'Daily Evening Review & Tomorrow Prep', 'Personal', 'FLEXIBLE', 'Reflect on accomplishments and plan next day');
    addBlock(30, 'Wind Down / Sleep Preparation', 'Personal', 'RECOVERY', 'Prepare mind and body for sleep at target bedtime');
  } else if (endDayMins - cursor > 0) {
    addBlock(endDayMins - cursor, 'Wind Down / Sleep Preparation', 'Personal', 'RECOVERY', 'Prepare for sleep at target bedtime');
  }

  return {
    explanation: 'Generated using PAIOS adaptive local schedule engine (AI service busy/unavailable). Schedule starts strictly from current time and optimizes study, work, and recovery until bedtime.',
    blocks,
  };
}

// API Endpoint: Gemini Adaptive Timeline Generation
app.post('/api/ai/generate-timeline', requireAuth, async (req, res) => {
  try {
    const {
      userContext,
      currentTimeStr = '10:15',
      currentDateStr = new Date().toISOString().split('T')[0],
      isWorkday = true,
      officeStartTime = '13:00',
      officeEndTime = '22:00',
      bedtime = '00:00',
      wakeTime = '07:30',
      adaptationReason,
      modelName,
    } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Fallback local schedule generation when no API key is provided
      const fallback = generateLocalFallbackTimetable({
        currentTimeStr,
        isWorkday,
        officeStartTime,
        officeEndTime,
        bedtime,
      });
      res.json({
        success: true,
        dateString: currentDateStr,
        generatedAtTimeStr: currentTimeStr,
        explanation: 'Generated using local adaptive engine (No Gemini API Key provided).',
        blocks: fallback.blocks,
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const modelCandidates = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];
    if (modelName && typeof modelName === 'string') {
      if (modelName.includes('pro')) {
        modelCandidates.unshift('gemini-3.1-pro-preview');
      } else if (modelName.includes('lite')) {
        modelCandidates.unshift('gemini-3.1-flash-lite');
      }
    }

    const systemInstruction = `
You are the PAIOS (Personal AI Operating System) Adaptive Daily Timetable Engine.
Your job is to generate a realistic, dynamic, adaptive daily timetable for the user starting strictly at the CURRENT TIME (${currentTimeStr}) and ending at BEDTIME (${bedtime}) on ${currentDateStr}.

CRITICAL SCHEDULING CONSTRAINTS & BEHAVIORS:
1. START FROM CURRENT TIME: The schedule MUST begin directly at the CURRENT TIME (${currentTimeStr}). NEVER schedule activities before ${currentTimeStr}.
2. END AT BEDTIME: The schedule ends when reaching bedtime (${bedtime}).
3. NO OVERLAPPING BLOCKS: Blocks must be strictly sequential (end time of block N = start time of block N+1).
4. DAY TYPE & FIXED COMMITMENTS:
   - Day Mode: ${isWorkday ? 'WORKDAY' : 'WEEK-OFF / REST & STUDY DAY'}.
   ${isWorkday ? `- Office Shift is FIXED from ${officeStartTime} to ${officeEndTime}. Include commute/prep before and after.` : '- Today is a Week-Off! Prioritize deep ISTQB active recall study, PAIOS development, family time, and relaxation.'}
   - Scheduled doctor appointments and medication dose times MUST be marked as "FIXED".
5. RECOVERY & HUMAN WELLBEING:
   - Do NOT fill every minute with work or study.
   - Deliberately schedule short breaks (15m), meals (lunch/dinner), recovery time, family/social time, and a 30m wind-down routine before bedtime. Mark these as "RECOVERY".
6. FOCUS & STUDY PRINCIPLES:
   - For study (ISTQB certification, Playwright/Python automation, SDET skills), use realistic sessions of 45-90 minutes.
   - Emphasize Active Recall, Spaced Repetition, practice questions, and reviewing previous material before new study.
   - Never schedule continuous uninterrupted study over 90 minutes.
7. GOAL-AWARE PRIORITIZATION & OVERFLOW DEFERRAL:
   - Primary user goals: 1. SDET career advancement, 2. ISTQB Certification, 3. PAIOS development, 4. Playwright/Python automation.
   - If there is not enough time remaining before bedtime, prioritize high-value tasks and mark remaining overflow tasks as "deferred" with a clear reason.
8. DYNAMIC ADAPTATION REASON:
   ${adaptationReason ? `- Adaptation context provided: "${adaptationReason}". Re-optimize the remaining timetable from ${currentTimeStr} accordingly.` : '- Generating full daily timetable starting now.'}

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this structure (no markdown formatting outside JSON):
{
  "explanation": "Why this plan? (2-3 concise sentences explaining task prioritization, break placement, and any deferred tasks)",
  "blocks": [
    {
      "id": "block_1",
      "start": "10:15",
      "end": "10:30",
      "duration_minutes": 15,
      "activity": "Freshen up / prepare",
      "category": "Personal",
      "goal": "Personal Routine",
      "priority": "RECOVERY",
      "reason": "Transition into morning focus state",
      "status": "planned"
    }
  ]
}

Priority MUST be one of: "FIXED", "HIGH", "FLEXIBLE", "OPTIONAL", "RECOVERY".
Status MUST be one of: "planned", "in_progress", "completed", "skipped", "delayed", "rescheduled", "deferred".
Category MUST be one of: "Work", "Study", "Coding", "Testing", "Personal", "Exercise", "Break", "Health", "Other".
`.trim();

    const promptText = `
Generate the adaptive daily timetable from CURRENT TIME (${currentTimeStr}) to BEDTIME (${bedtime}) for date ${currentDateStr}.

PAIOS Context & User State:
${userContext}
`.trim();

    let resultJsonText = '';
    let lastError: any = null;

    for (const targetModel of modelCandidates) {
      try {
        const config: any = {
          systemInstruction,
          temperature: 0.3,
          responseMimeType: 'application/json',
        };

        if (targetModel === 'gemini-3.1-pro-preview') {
          config.thinkingConfig = {
            thinkingLevel: ThinkingLevel.HIGH,
          };
        }

        const response = await ai.models.generateContent({
          model: targetModel,
          contents: promptText,
          config,
        });
        resultJsonText = response.text || '';
        if (resultJsonText) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Timetable generation on model ${targetModel} failed, trying candidate fallback:`, err?.message || err);
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (!resultJsonText) {
      console.warn('All Gemini AI model attempts failed. Executing local rule-based timetable engine fallback.');
      const fallback = generateLocalFallbackTimetable({
        currentTimeStr,
        isWorkday,
        officeStartTime,
        officeEndTime,
        bedtime,
      });
      res.json({
        success: true,
        dateString: currentDateStr,
        generatedAtTimeStr: currentTimeStr,
        explanation: fallback.explanation,
        blocks: fallback.blocks,
      });
      return;
    }

    // Clean JSON response
    const jsonMatch = resultJsonText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : resultJsonText;
    const parsedData = JSON.parse(cleanJson);

    res.json({
      success: true,
      dateString: currentDateStr,
      generatedAtTimeStr: currentTimeStr,
      explanation: parsedData.explanation || 'AI generated adaptive timetable based on current time and goals.',
      blocks: Array.isArray(parsedData.blocks) ? parsedData.blocks : [],
    });
  } catch (err: any) {
    console.error('Timeline Generation Error, using local fallback:', err);
    const fallback = generateLocalFallbackTimetable({
      currentTimeStr: req.body.currentTimeStr || '10:15',
      isWorkday: req.body.isWorkday !== false,
      officeStartTime: req.body.officeStartTime || '13:00',
      officeEndTime: req.body.officeEndTime || '22:00',
      bedtime: req.body.bedtime || '00:00',
    });
    res.json({
      success: true,
      dateString: req.body.currentDateStr || new Date().toISOString().split('T')[0],
      generatedAtTimeStr: req.body.currentTimeStr || '10:15',
      explanation: fallback.explanation,
      blocks: fallback.blocks,
    });
  }
});

// Explicit API 404 Handler - prevents Vite SPA static fallback from serving index.html for API calls
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.path} not found` });
});

// Setup server middleware and static serving
async function setupMiddleware() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });
  }
}

setupMiddleware().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
