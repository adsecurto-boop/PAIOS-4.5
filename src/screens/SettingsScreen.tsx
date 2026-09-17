import React, { useState, useEffect } from 'react';
import {
  Settings,
  User,
  Key,
  Cpu,
  Database,
  RefreshCw,
  Download,
  Check,
  Monitor,
  Sparkles,
  Share2,
  Bell,
  Clock,
  Compass,
  AlertTriangle,
  GitCommit,
  HardDrive,
  Server,
  Activity,
  CheckCircle2,
  AlertCircle,
  Play,
  Loader2,
} from 'lucide-react';
import { UserSettings } from '../types';
import { CloudSyncBanner } from '../components/CloudSyncBanner';
import { AutoUpdateSyncBanner } from '../components/AutoUpdateSyncBanner';
import { SoftwareUpdateCard } from '../components/SoftwareUpdateCard';
import { exportAndShareBackup } from '../utils/exportShare';
import { checkOllamaHealth, sendOllamaChat } from '../services/ollamaClient';
import { getAuthToken } from '../storage';

interface SettingsScreenProps {
  settings: UserSettings;
  onUpdateSettings: (updated: Partial<UserSettings>) => void;
  onResetSampleData: () => void;
  onClearAllData: () => void;
  onExportData: (mode?: 'share' | 'download') => void;
  onOpenExportModal?: () => void;
  onStartTour?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
  onResetSampleData,
  onClearAllData,
  onExportData,
  onOpenExportModal,
  onStartTour,
}) => {
  const [name, setName] = useState(settings.userName);
  const [apiKey, setApiKey] = useState(settings.customApiKey || '');
  const [selectedModel, setSelectedModel] = useState(settings.preferredModel || 'gemini-3.7-flash');
  const [aiProviderVal, setAiProviderVal] = useState<'GEMINI' | 'OLLAMA'>(
    (settings.aiProvider?.toUpperCase() === 'OLLAMA') ? 'OLLAMA' : 'GEMINI'
  );
  const [ollamaUrlVal, setOllamaUrlVal] = useState(settings.ollamaBaseUrl || 'http://localhost:11434');
  const [ollamaModelVal, setOllamaModelVal] = useState(settings.ollamaModel || 'qwen2.5:7b');

  const [healthStatus, setHealthStatus] = useState<{
    checking: boolean;
    available: boolean;
    hasModel: boolean;
    models: string[];
    error?: string;
  }>({ checking: false, available: false, hasModel: false, models: [] });

  const [testStatus, setTestStatus] = useState<{
    running: boolean;
    reply?: string;
    latencyMs?: number;
    error?: string;
  }>({ running: false });

  const [officeStart, setOfficeStart] = useState(settings.officeStartTime || '13:00');
  const [officeEnd, setOfficeEnd] = useState(settings.officeEndTime || '22:00');
  const [bedtimeVal, setBedtimeVal] = useState(settings.bedtime || '00:00');
  const [wakeTimeVal, setWakeTimeVal] = useState(settings.wakeTime || '07:30');
  const [isWorkdayVal, setIsWorkdayVal] = useState(settings.isWorkday !== false);
  const [morningNotifEnabled, setMorningNotifEnabled] = useState(settings.morningNotificationEnabled !== false);
  const [morningTimeVal, setMorningTimeVal] = useState(settings.morningCheckInTime || '08:00');
  const [eveningNotifEnabled, setEveningNotifEnabled] = useState(settings.eveningNotificationEnabled !== false);
  const [eveningTimeVal, setEveningTimeVal] = useState(settings.eveningReviewTime || '21:30');
  const [dailySummaryEnabledVal, setDailySummaryEnabledVal] = useState(settings.dailySummaryEnabled !== false);
  const [dailySummaryTimeVal, setDailySummaryTimeVal] = useState(settings.dailySummaryTime || '21:00');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const runOllamaHealthCheck = async (urlToTest = ollamaUrlVal, modelToTest = ollamaModelVal) => {
    setHealthStatus((prev) => ({ ...prev, checking: true, error: undefined }));
    try {
      // First try backend assistant status endpoint if reachable
      const res = await fetch(
        `/assistant/status?provider=ollama&baseUrl=${encodeURIComponent(urlToTest)}&model=${encodeURIComponent(modelToTest)}`,
        { headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {} }
      ).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        const oStatus = data.ollamaStatus || {};
        setHealthStatus({
          checking: false,
          available: Boolean(oStatus.available),
          hasModel: Boolean(oStatus.hasModel),
          models: oStatus.models || [],
          error: oStatus.error,
        });
        return;
      }
    } catch (e) {}

    // Fallback to direct client-side fetch via checkOllamaHealth
    try {
      const direct = await checkOllamaHealth(urlToTest, modelToTest);
      setHealthStatus({
        checking: false,
        available: direct.available,
        hasModel: direct.hasModel,
        models: direct.models,
        error: direct.error,
      });
    } catch (err: any) {
      setHealthStatus({
        checking: false,
        available: false,
        hasModel: false,
        models: [],
        error: err?.message || 'Check failed',
      });
    }
  };

  useEffect(() => {
    if (aiProviderVal === 'OLLAMA') {
      runOllamaHealthCheck();
    }
  }, [aiProviderVal]);

  const handleTestLocalModel = async () => {
    setTestStatus({ running: true, error: undefined, reply: undefined });
    const startTime = Date.now();
    try {
      // Try backend /assistant/test endpoint
      const res = await fetch('/assistant/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) },
        body: JSON.stringify({
          provider: 'ollama',
          baseUrl: ollamaUrlVal,
          model: ollamaModelVal,
          prompt: 'Hello from PAIOS! Confirm connection in 1 brief sentence.',
        }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.success) {
          setTestStatus({
            running: false,
            reply: data.reply,
            latencyMs: data.latencyMs || (Date.now() - startTime),
          });
          return;
        } else {
          setTestStatus({
            running: false,
            error: data.error || 'Test inference returned failure',
            latencyMs: data.latencyMs || (Date.now() - startTime),
          });
          return;
        }
      }

      // Direct fallback to sendOllamaChat
      const direct = await sendOllamaChat({
        promptText: 'Hello from PAIOS! Confirm connection in 1 brief sentence.',
        baseUrl: ollamaUrlVal,
        model: ollamaModelVal,
      });

      if (direct.error) {
        setTestStatus({ running: false, error: direct.error, latencyMs: Date.now() - startTime });
      } else {
        setTestStatus({ running: false, reply: direct.text, latencyMs: Date.now() - startTime });
      }
    } catch (err: any) {
      setTestStatus({ running: false, error: err?.message || 'Inference test failed', latencyMs: Date.now() - startTime });
    }
  };

  const handleTriggerExport = async (mode: 'share' | 'download') => {
    try {
      const res = await exportAndShareBackup(mode);
      if (res.message) {
        setExportNotice(res.message);
        setTimeout(() => setExportNotice(null), 4000);
      }
    } catch (err: any) {
      setExportNotice('Export error occurred.');
      setTimeout(() => setExportNotice(null), 3000);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      userName: name.trim() || 'Alex',
      aiProvider: aiProviderVal,
      ollamaBaseUrl: ollamaUrlVal.trim() || 'http://localhost:11434',
      ollamaModel: ollamaModelVal.trim() || 'qwen2.5:7b',
      customApiKey: apiKey.trim() || undefined,
      preferredModel: selectedModel,
      officeStartTime: officeStart,
      officeEndTime: officeEnd,
      bedtime: bedtimeVal,
      wakeTime: wakeTimeVal,
      isWorkday: isWorkdayVal,
      morningNotificationEnabled: morningNotifEnabled,
      morningCheckInTime: morningTimeVal,
      eveningNotificationEnabled: eveningNotifEnabled,
      eveningReviewTime: eveningTimeVal,
      dailySummaryEnabled: dailySummaryEnabledVal,
      dailySummaryTime: dailySummaryTimeVal,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-xl text-white">PAIOS Operating System Settings</h2>
          <p className="text-xs text-slate-400">Configure profile preferences, AI model params, and Windows Desktop packaging</p>
        </div>
      </div>

      {/* Google SSO & Firestore Realtime Cloud Sync Banner */}
      <CloudSyncBanner />

      {/* In-App Software Updates & Release Manager */}
      <SoftwareUpdateCard />

      {/* Git Commit Auto-Update & Cross-Platform Sync Banner */}
      <AutoUpdateSyncBanner />

      {/* Interactive Setup & Onboarding Tour Launcher */}
      {onStartTour && (
        <div className="bg-gradient-to-r from-indigo-950/90 via-slate-900 to-cyan-950/90 border border-cyan-500/40 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <span>PAIOS Interactive Setup Tour & AI Guide</span>
                <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.5 rounded">
                  5-Step Wizard
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Relaunch AI setup guide to configure life parameters, starter templates, and cross-platform sync
              </p>
            </div>
          </div>
          <button
            onClick={onStartTour}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-cyan-600/30 transition-all shrink-0 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Launch Setup Tour</span>
          </button>
        </div>
      )}

      {/* Windows Desktop Packaging Banner */}
      {onOpenExportModal && (
        <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-cyan-950/80 border border-indigo-800/60 rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-indigo-600/30 text-indigo-300 border border-indigo-500/40">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <span>PAIOS Windows Desktop Executable</span>
                <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.5 rounded">
                  Win64 Native
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Generate Electron / Tauri build scripts to run PAIOS as a native `.exe` Windows app
              </p>
            </div>
          </div>
          <button
            onClick={onOpenExportModal}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all shrink-0 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Build Windows App</span>
          </button>
        </div>
      )}

      {/* User & AI Settings */}
      <form onSubmit={handleSaveProfile} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-5">
        <h3 className="font-heading font-bold text-base text-white border-b border-slate-800 pb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-400" /> User Profile & Identity
        </h3>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <h3 className="font-heading font-bold text-base text-white border-b border-slate-800 pb-3 pt-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" /> Adaptive Timetable & Life Parameters
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Office Shift Start
            </label>
            <input
              type="text"
              value={officeStart}
              onChange={(e) => setOfficeStart(e.target.value)}
              placeholder="e.g. 13:00 or 1:00 PM"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Office Shift End
            </label>
            <input
              type="text"
              value={officeEnd}
              onChange={(e) => setOfficeEnd(e.target.value)}
              placeholder="e.g. 22:00 or 10:00 PM"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Bedtime Target
            </label>
            <input
              type="text"
              value={bedtimeVal}
              onChange={(e) => setBedtimeVal(e.target.value)}
              placeholder="e.g. 00:00 or 12:00 AM"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Wake Time Target
            </label>
            <input
              type="text"
              value={wakeTimeVal}
              onChange={(e) => setWakeTimeVal(e.target.value)}
              placeholder="e.g. 07:30 or 7:30 AM"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        <h3 className="font-heading font-bold text-base text-white border-b border-slate-800 pb-3 pt-2 flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-400" /> Notifications & Automated Summary Reminders
        </h3>

        <div className="space-y-4">
          {/* Daily Insights Summary Notification */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Daily Top-Performance Insights Summary
                </h4>
                <p className="text-[11px] text-slate-400">
                  Triggers an automated alert summarizing your top focus categories & productivity.
                </p>
              </div>
              <input
                type="checkbox"
                checked={dailySummaryEnabledVal}
                onChange={(e) => setDailySummaryEnabledVal(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>
            {dailySummaryEnabledVal && (
              <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-2">
                <label className="text-xs text-slate-300 font-mono flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" /> Summary Notification Time:
                </label>
                <input
                  type="text"
                  value={dailySummaryTimeVal}
                  onChange={(e) => setDailySummaryTimeVal(e.target.value)}
                  placeholder="21:00"
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono w-28 text-center focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Check-In Reminders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Morning Check-In Reminder</span>
                <input
                  type="checkbox"
                  checked={morningNotifEnabled}
                  onChange={(e) => setMorningNotifEnabled(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </div>
              {morningNotifEnabled && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Time:</span>
                  <input
                    type="text"
                    value={morningTimeVal}
                    onChange={(e) => setMorningTimeVal(e.target.value)}
                    placeholder="08:00"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono w-24 text-center focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Evening Review Reminder</span>
                <input
                  type="checkbox"
                  checked={eveningNotifEnabled}
                  onChange={(e) => setEveningNotifEnabled(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </div>
              {eveningNotifEnabled && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Time:</span>
                  <input
                    type="text"
                    value={eveningTimeVal}
                    onChange={(e) => setEveningTimeVal(e.target.value)}
                    placeholder="21:30"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono w-24 text-center focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <h3 className="font-heading font-bold text-base text-white border-b border-slate-800 pb-3 pt-2 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" /> AI Intelligence Engine & Provider Routing
        </h3>

        {/* Provider Segmented Toggle */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Active AI Provider
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAiProviderVal('GEMINI')}
              className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                aiProviderVal === 'GEMINI'
                  ? 'bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-950/50 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${aiProviderVal === 'GEMINI' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span>Google Gemini</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-900 text-indigo-200 border border-indigo-700">Cloud</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  High-depth reasoning & flash speed via Google GenAI APIs.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAiProviderVal('OLLAMA')}
              className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                aiProviderVal === 'OLLAMA'
                  ? 'bg-emerald-950/60 border-emerald-500 shadow-md shadow-emerald-950/50 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className={`p-2 rounded-lg shrink-0 ${aiProviderVal === 'OLLAMA' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <span>Ollama Local</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-900 text-emerald-200 border border-emerald-700">Zero-Egress</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Fully private offline inference running locally on your hardware.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Conditional Provider Settings Card */}
        {aiProviderVal === 'OLLAMA' ? (
          <div className="p-4 rounded-xl bg-slate-950 border border-emerald-900/40 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> Ollama Local Daemon Configuration
              </span>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                Default: qwen2.5:7b
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Ollama Base URL
                </label>
                <input
                  type="text"
                  value={ollamaUrlVal}
                  onChange={(e) => setOllamaUrlVal(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Target Model Name
                </label>
                <input
                  type="text"
                  value={ollamaModelVal}
                  onChange={(e) => setOllamaModelVal(e.target.value)}
                  placeholder="qwen2.5:7b"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Quick Model Recommendation Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-400 font-mono mr-1">Recommended:</span>
              {['qwen2.5:7b', 'qwen2.5:14b', 'qwen2.5:3b', 'llama3.1:8b', 'deepseek-r1:8b'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOllamaModelVal(m)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                    ollamaModelVal === m
                      ? 'bg-emerald-950 text-emerald-200 border-emerald-600 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Connection Status & Health Check Card */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" /> Daemon Health & Model Status
                </span>
                <button
                  type="button"
                  onClick={() => runOllamaHealthCheck()}
                  disabled={healthStatus.checking}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${healthStatus.checking ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>{healthStatus.checking ? 'Checking...' : 'Check Connection'}</span>
                </button>
              </div>

              {/* Status Indicator Pill */}
              {healthStatus.checking ? (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                  <span>Pinging Ollama tags endpoint at <span className="font-mono text-cyan-300">{ollamaUrlVal}</span>...</span>
                </div>
              ) : healthStatus.available && healthStatus.hasModel ? (
                <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Ollama online! Model <strong className="font-mono text-emerald-300">{ollamaModelVal}</strong> is pulled and ready for offline inference.
                    </span>
                  </div>
                  <span className="text-[10px] font-mono bg-emerald-900/80 text-emerald-300 px-2 py-0.5 rounded shrink-0">
                    Ready
                  </span>
                </div>
              ) : healthStatus.available && !healthStatus.hasModel ? (
                <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800/70 text-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Daemon running, but target model <strong className="font-mono text-amber-300">{ollamaModelVal}</strong> is not installed.
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-300/80 font-mono pl-6">
                    Run: <code className="bg-slate-950 px-1.5 py-0.5 rounded border border-amber-900/60">ollama run {ollamaModelVal}</code> in terminal to pull it.
                  </p>
                  {healthStatus.models.length > 0 && (
                    <p className="text-[10px] text-slate-400 pl-6">
                      Installed models: {healthStatus.models.join(', ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-900/70 text-rose-200 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Cannot reach Ollama at <strong className="font-mono text-rose-300">{ollamaUrlVal}</strong> ({healthStatus.error || 'Connection Refused'}).
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-300/80 pl-6">
                    Make sure Ollama is installed and running in the background with <code className="bg-slate-950 px-1.5 py-0.5 rounded font-mono">ollama serve</code>.
                  </p>
                </div>
              )}
            </div>

            {/* Test Local Model Action */}
            <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestLocalModel}
                disabled={testStatus.running}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/50"
              >
                {testStatus.running ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Running Test Inference...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Test Local Model Response</span>
                  </>
                )}
              </button>

              {testStatus.latencyMs !== undefined && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2.5 py-1 rounded-lg">
                  ⚡ Latency: {testStatus.latencyMs}ms
                </span>
              )}
            </div>

            {/* Test Prompt Response Preview */}
            {testStatus.reply && (
              <div className="p-3 rounded-xl bg-slate-900 border border-emerald-800/60 text-xs space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                  Model Reply Preview:
                </span>
                <p className="text-slate-200 font-mono text-[11px] leading-relaxed">
                  "{testStatus.reply}"
                </p>
              </div>
            )}

            {testStatus.error && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-900 text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Test Failed:</span>
                  <span className="text-[11px] text-rose-300 font-mono">{testStatus.error}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Preferred Gemini Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="gemini-3.7-flash">gemini-3.7-flash (Recommended Fast)</option>
                <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Deep Reasoning)</option>
                <option value="gemini-flash-latest">gemini-flash-latest (Standard)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-amber-400" /> Custom Gemini API Key (Optional)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave empty to use server GEMINI_API_KEY environment variable"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Your key is used exclusively for server-proxied Gemini requests and never shared.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          {savedSuccess ? (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <Check className="w-4 h-4" /> Preferences saved!
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition-all"
          >
            Save Preferences
          </button>
        </div>
      </form>

      {/* Local Storage & Data Management */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
        <h3 className="font-heading font-bold text-base text-white border-b border-slate-800 pb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" /> Data Management & Persistence
        </h3>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
          <div>
            <span className="text-xs font-semibold text-white block">Seed / Restore Sample Data</span>
            <span className="text-[10px] text-slate-400">Restore rich default tasks, study flashcards, medications, and logs</span>
          </div>
          <button
            onClick={onResetSampleData}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Sample Data</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/50">
          <div>
            <span className="text-xs font-semibold text-indigo-200 block">Factory Reset & Relaunch Setup Guide</span>
            <span className="text-[10px] text-slate-400">Wipe user data and open the interactive AI Setup Wizard</span>
          </div>
          <button
            onClick={() => {
              if (confirm('Reset all user data and relaunch the AI Setup Guide?')) {
                onClearAllData();
                if (onStartTour) onStartTour();
              }
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-md shadow-indigo-600/30"
          >
            <Compass className="w-3.5 h-3.5 text-cyan-300" />
            <span>Reset & Start Setup</span>
          </button>
        </div>

        {exportNotice && (
          <div className="p-3 rounded-xl bg-indigo-950/80 border border-indigo-800 text-indigo-200 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportNotice}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
          <div>
            <span className="text-xs font-semibold text-white block">Export PAIOS Backup JSON</span>
            <span className="text-[10px] text-slate-400">Save to phone File Manager or download full local JSON database backup</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleTriggerExport('share')}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Launch Phone Share Sheet to Save File"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share / Save File</span>
            </button>
            <button
              onClick={() => handleTriggerExport('download')}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Direct File Download"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/40">
          <div>
            <span className="text-xs font-semibold text-rose-300 block">Clear All Local Data</span>
            <span className="text-[10px] text-rose-400/80">Wipe all tasks, cards, timeline logs, and chat messages</span>
          </div>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to clear all PAIOS data? This action cannot be undone.')) {
                onClearAllData();
              }
            }}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shrink-0"
          >
            Clear All Data
          </button>
        </div>
      </div>
    </div>
  );
};
