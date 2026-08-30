import React, { useState, useEffect } from 'react';
import {
  Layers,
  Calendar,
  Zap,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Shield,
  Download,
  Upload,
  Clock,
  Sparkles,
  Check,
  X,
  Play,
  ArrowRight,
  Plus,
  Terminal,
  Activity,
  Cpu,
  Heart,
  BookOpen,
  GitBranch,
  Volume2,
  Wallet,
  DollarSign,
  PiggyBank,
  TrendingUp,
} from 'lucide-react';
import { PreContextBroker, InboundPITRecord } from '../core/broker/PreContextBroker';
import { PriorityRanking } from '../core/broker/PriorityRanking';
import { TimetablePlugin, TimetableProposal } from '../core/plugins/TimetablePlugin';
import { PluginPortability } from '../core/plugins/PluginPortability';
import { PAIOSStorage } from '../storage';
import { AdaptiveTimetableResponse, AdaptiveTimetableBlock } from '../types';
import { MoneyManagerScreen } from '../components/money/MoneyManagerScreen';

export interface PluginMeta {
  id: string;
  name: string;
  category: 'Productivity' | 'Health' | 'Learning' | 'System' | 'Developer' | 'Finance';
  description: string;
  version: string;
  icon: string;
  author: string;
  installed: boolean;
  enabled: boolean;
  permissions: {
    name: string;
    description: string;
    level: 'read' | 'write' | 'full';
  }[];
  config: Record<string, any>;
}

const DEFAULT_PLUGINS: PluginMeta[] = [
  {
    id: 'money_budget_plugin',
    name: 'Money Manager & Budget Analyzer',
    category: 'Finance',
    description: 'Calculates monthly obligations, daily safe-to-spend limits, leftover surplus sweeps, and 5-year compound growth projections.',
    version: '4.5.4',
    icon: 'wallet',
    author: 'PAIOS Financial Labs',
    installed: true,
    enabled: true,
    permissions: [
      { name: 'Financial Read/Write', description: 'Manage monthly budget parameters, salary cycle, and daily expenses', level: 'full' },
      { name: 'Pre-Context Staging', description: 'Broadcast daily safe-to-spend limits into Pre-Context PIT for AI agent', level: 'write' }
    ],
    config: {
      defaultCurrency: '$',
      autoSweepDailySurplus: true,
      expectedReturnRate: 10
    }
  },
  {
    id: 'timetable_plugin',
    name: 'Adaptive Timetable Engine',
    category: 'Productivity',
    description: 'Dynamic contextual time-blocking with AI scheduling and Rule B1 60s proposal banners.',
    version: '5.0.0',
    icon: 'calendar',
    author: 'PAIOS Core Team',
    installed: true,
    enabled: true,
    permissions: [
      { name: 'Task Write Access', description: 'Modify and insert blocks into active daily timetable', level: 'write' },
      { name: 'Calendar Read Access', description: 'Inspect scheduled tasks and historical timeline logs', level: 'read' },
      { name: 'AI Schedule Invocations', description: 'Trigger dynamic Gemini schedule optimization', level: 'full' }
    ],
    config: {
      autoScheduleOnWake: true,
      proposalAutoLapseSecs: 60,
      bufferDelayMinutes: 15,
      defaultCategory: 'Work'
    }
  },
  {
    id: 'health_vitals_plugin',
    name: 'Clinical Health & Biometrics',
    category: 'Health',
    description: 'Tracks medication adherence, daily dosing intervals, refill burn rates, and blood pressure telemetry.',
    version: '5.0.0',
    icon: 'heart',
    author: 'Clinical Systems Group',
    installed: true,
    enabled: true,
    permissions: [
      { name: 'Biometric Read/Write', description: 'Log blood pressure, heart rate, weight, and symptom logs', level: 'write' },
      { name: 'Medication Dosing Access', description: 'Update prescription inventory and dose events', level: 'full' }
    ],
    config: {
      lowStockThresholdDays: 7,
      emergencyContactsEnabled: true,
      vitalCheckIntervalHours: 12
    }
  },
  {
    id: 'study_sr_plugin',
    name: 'Spaced Repetition Flashcards',
    category: 'Learning',
    description: 'SM-2 spaced recall algorithm for technical exams, ISTQB CTFL, and system architecture memorization.',
    version: '5.0.0',
    icon: 'book',
    author: 'PAIOS Learning',
    installed: true,
    enabled: true,
    permissions: [
      { name: 'Study Card Access', description: 'Create, review, and recalculate card ease factors', level: 'write' }
    ],
    config: {
      dailyCardGoal: 20,
      initialEaseFactor: 2.5,
      autoQueueDueCards: true
    }
  },
  {
    id: 'git_commits_plugin',
    name: 'Git Version & Commit Syncer',
    category: 'Developer',
    description: 'Monitors repository commits and auto-stages build version telemetry into the Pre-Context PIT.',
    version: '1.2.0',
    icon: 'git',
    author: 'DevOps Module',
    installed: false,
    enabled: false,
    permissions: [
      { name: 'Repository Read', description: 'Read local git commit hash and change logs', level: 'read' },
      { name: 'PIT Staging Access', description: 'Enqueue commit events into Pre-Context Broker', level: 'write' }
    ],
    config: {
      autoSyncOnPush: true,
      trackBranch: 'main'
    }
  },
  {
    id: 'focus_audio_plugin',
    name: 'Binaural Focus Synthesizer',
    category: 'System',
    description: 'Generates real-time ambient alpha-wave sounds and focus frequencies synchronized with active timers.',
    version: '2.1.0',
    icon: 'audio',
    author: 'Acoustic Labs',
    installed: false,
    enabled: false,
    permissions: [
      { name: 'Audio Hardware Control', description: 'Playback ambient synthesized audio streams', level: 'full' },
      { name: 'Timer State Listener', description: 'Listen for start/pause/resume focus timer triggers', level: 'read' }
    ],
    config: {
      frequencyHz: 432,
      ambientVolume: 65,
      autoFadeOnPause: true
    }
  }
];

interface PluginsScreenProps {
  onTriggerAiTimetable?: () => void;
  isAiScheduling?: boolean;
}

export const PluginsScreen: React.FC<PluginsScreenProps> = ({
  onTriggerAiTimetable,
  isAiScheduling = false
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'MARKETPLACE' | 'TIMETABLE' | 'PIT_LOGS' | 'MONEY_MANAGER'>('MARKETPLACE');
  const [plugins, setPlugins] = useState<PluginMeta[]>(() => {
    const saved = PAIOSStorage.getItem<PluginMeta[]>('paios_plugins_manifest');
    return saved && saved.length > 0 ? saved : DEFAULT_PLUGINS;
  });
  const [selectedPluginId, setSelectedPluginId] = useState<string>('timetable_plugin');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Timetable State
  const [timetable, setTimetable] = useState<AdaptiveTimetableResponse | null>(() => PAIOSStorage.getAdaptiveTimetable());
  const [activeProposal, setActiveProposal] = useState<TimetableProposal | null>(() => TimetablePlugin.getActiveProposal());
  const [proposalSecondsLeft, setProposalSecondsLeft] = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [newBlockActivity, setNewBlockActivity] = useState('');
  const [newBlockStart, setNewBlockStart] = useState('14:00');
  const [newBlockEnd, setNewBlockEnd] = useState('15:00');
  const [newBlockCategory, setNewBlockCategory] = useState('Work');

  // PIT Logs State
  const [pitRecords, setPitRecords] = useState<InboundPITRecord[]>([]);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [pitFilter, setPitFilter] = useState<'ALL' | 'STAGED' | 'SYNCED' | 'REJECTED'>('ALL');

  // Load PIT Records
  const refreshPitRecords = () => {
    const records = PAIOSStorage.getItem<InboundPITRecord[]>('paios_precontext_pit', []) || [];
    setPitRecords(records);
  };

  useEffect(() => {
    refreshPitRecords();
    const handlePitSync = () => {
      refreshPitRecords();
      setTimetable(PAIOSStorage.getAdaptiveTimetable());
    };
    const handleProposalUpdate = () => {
      const prop = TimetablePlugin.getActiveProposal();
      setActiveProposal(prop);
      if (prop) {
        setProposalSecondsLeft(Math.max(0, Math.ceil((prop.expiresAtMillis - Date.now()) / 1000)));
      }
    };

    window.addEventListener('precontext_pit_synced', handlePitSync);
    window.addEventListener('timetable_proposal_updated', handleProposalUpdate);
    window.addEventListener('paios_storage_change', handlePitSync);

    const interval = setInterval(() => {
      const prop = TimetablePlugin.getActiveProposal();
      setActiveProposal(prop);
      if (prop) {
        const left = Math.max(0, Math.ceil((prop.expiresAtMillis - Date.now()) / 1000));
        setProposalSecondsLeft(left);
      } else {
        setProposalSecondsLeft(0);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('precontext_pit_synced', handlePitSync);
      window.removeEventListener('timetable_proposal_updated', handleProposalUpdate);
      window.removeEventListener('paios_storage_change', handlePitSync);
    };
  }, []);

  const savePlugins = (updated: PluginMeta[]) => {
    setPlugins(updated);
    PAIOSStorage.setItem('paios_plugins_manifest', updated);
  };

  const handleToggleInstall = (id: string) => {
    const updated = plugins.map((p) => {
      if (p.id === id) {
        const newInstalled = !p.installed;
        return { ...p, installed: newInstalled, enabled: newInstalled };
      }
      return p;
    });
    savePlugins(updated);

    PreContextBroker.enqueuePIT({
      source_plugin_id: id,
      priority: 'medium',
      severity: 'info',
      payload: { action: 'PLUGIN_INSTALL_TOGGLE', pluginId: id }
    });
  };

  const handleToggleEnabled = (id: string) => {
    const updated = plugins.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p));
    savePlugins(updated);
  };

  // Rule B2 Force Sync Trigger
  const handleTriggerForceSync = async () => {
    setIsForceSyncing(true);
    try {
      // Enqueue user action into PIT
      PreContextBroker.enqueuePIT({
        source_plugin_id: 'user_action_header',
        priority: 'high',
        severity: 'info',
        payload: { action: 'FORCE_SYNC_CLICK' }
      });
      await PreContextBroker.triggerForceSync();
      refreshPitRecords();
    } finally {
      setIsForceSyncing(false);
    }
  };

  // Timetable Proposal Actions
  const handleAcceptProposal = (id: string) => {
    TimetablePlugin.acceptProposal(id);
    setActiveProposal(null);
    setTimetable(PAIOSStorage.getAdaptiveTimetable());
  };

  const handleDeclineProposal = (id: string) => {
    TimetablePlugin.rejectProposal(id);
    setActiveProposal(null);
  };

  // Manual Add Timetable Block
  const handleAddManualBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockActivity.trim()) return;

    const current = timetable || {
      dateString: new Date().toISOString().split('T')[0],
      generatedAtTimeStr: '12:00',
      explanation: 'Manual block schedule',
      blocks: []
    };

    const newBlock: AdaptiveTimetableBlock = {
      id: `block_${Date.now()}`,
      start: newBlockStart,
      end: newBlockEnd,
      duration_minutes: 60,
      activity: newBlockActivity.trim(),
      category: newBlockCategory,
      priority: 'HIGH',
      status: 'planned',
      isAiGenerated: false
    };

    const updated: AdaptiveTimetableResponse = {
      ...current,
      blocks: [newBlock, ...current.blocks]
    };

    PAIOSStorage.saveAdaptiveTimetable(updated);
    setTimetable(updated);
    setNewBlockActivity('');

    PreContextBroker.enqueuePIT({
      source_plugin_id: 'timetable_plugin',
      priority: 'medium',
      severity: 'info',
      payload: { action: 'MANUAL_BLOCK_ADDED', activity: newBlock.activity }
    });
  };

  const selectedPlugin = plugins.find((p) => p.id === selectedPluginId) || plugins[0];

  const filteredPlugins = plugins.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = filterCategory === 'ALL' || p.category.toUpperCase() === filterCategory.toUpperCase();
    return matchesSearch && matchesCat;
  });

  const filteredPitRecords = pitRecords.filter((r) => {
    if (pitFilter === 'ALL') return true;
    return r.status.toUpperCase() === pitFilter;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Sub-Navigation */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <span>Plugin & Timetable Hub</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/80">
                v5.0 Unified
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Modular architecture, dynamic scheduling engine, and Pre-Context Broker staging telemetry.
            </p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setActiveSubTab('MARKETPLACE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'MARKETPLACE'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Marketplace</span>
          </button>

          <button
            onClick={() => setActiveSubTab('MONEY_MANAGER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'MONEY_MANAGER'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Money Manager</span>
          </button>

          <button
            onClick={() => setActiveSubTab('TIMETABLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'TIMETABLE'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Timetable Plugin</span>
          </button>

          <button
            onClick={() => setActiveSubTab('PIT_LOGS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'PIT_LOGS'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Pre-Context PIT ({pitRecords.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-VIEW 1: MARKETPLACE & DUAL-PANE SPLIT SCREEN */}
      {activeSubTab === 'MARKETPLACE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Pane: Plugin Catalog */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search modular plugins..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {['ALL', 'PRODUCTIVITY', 'HEALTH', 'LEARNING', 'DEVELOPER'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                      filterCategory === cat
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/80'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Plugin Cards List */}
            <div className="space-y-3">
              {filteredPlugins.map((plugin) => {
                const isSelected = plugin.id === selectedPluginId;
                return (
                  <div
                    key={plugin.id}
                    onClick={() => setSelectedPluginId(plugin.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500/80 shadow-lg shadow-indigo-950/40'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-indigo-400">
                          {plugin.icon === 'calendar' && <Calendar className="w-5 h-5" />}
                          {plugin.icon === 'heart' && <Heart className="w-5 h-5 text-rose-400" />}
                          {plugin.icon === 'book' && <BookOpen className="w-5 h-5 text-purple-400" />}
                          {plugin.icon === 'git' && <GitBranch className="w-5 h-5 text-emerald-400" />}
                          {plugin.icon === 'audio' && <Volume2 className="w-5 h-5 text-cyan-400" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white">{plugin.name}</h3>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              v{plugin.version}
                            </span>
                            <span className="text-[10px] font-semibold text-indigo-400 uppercase">
                              {plugin.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{plugin.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {plugin.installed ? (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-md">
                            <Check className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleInstall(plugin.id);
                            }}
                            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all"
                          >
                            Install
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane: Detailed Configuration & Security Permissions Drawer */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 sticky top-4">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                  Plugin Specification & Security
                </span>
                <h2 className="text-lg font-bold text-white mt-0.5">{selectedPlugin.name}</h2>
                <p className="text-xs text-slate-400">Maintained by {selectedPlugin.author}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleInstall(selectedPlugin.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    selectedPlugin.installed
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 hover:bg-rose-900'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md'
                  }`}
                >
                  {selectedPlugin.installed ? 'Uninstall' : 'Install Plugin'}
                </button>
              </div>
            </div>

            {/* Enable/Disable switch */}
            {selectedPlugin.installed && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-white">Enable Plugin Runtime</span>
                </div>
                <button
                  onClick={() => handleToggleEnabled(selectedPlugin.id)}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    selectedPlugin.enabled ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      selectedPlugin.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Granular System Permissions */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Requested Sandbox Permissions</span>
              </div>

              <div className="space-y-2">
                {selectedPlugin.permissions.map((perm, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{perm.name}</span>
                      <span
                        className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded ${
                          perm.level === 'full'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800/80'
                            : perm.level === 'write'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                        }`}
                      >
                        {perm.level}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{perm.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Plugin Manifest Export / Import */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Portability Manifest</span>
                <span className="text-[10px] font-mono text-slate-500">Checksum Verified</span>
              </div>
              <div className="flex gap-2">
                {selectedPlugin.id === 'money_budget_plugin' && (
                  <button
                    onClick={() => setActiveSubTab('MONEY_MANAGER')}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Launch Money Manager</span>
                  </button>
                )}
                {selectedPlugin.id === 'timetable_plugin' && (
                  <button
                    onClick={() => setActiveSubTab('TIMETABLE')}
                    className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Launch Timetable</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    const manifestStr = PluginPortability.exportPluginData(selectedPlugin.id, selectedPlugin.config);
                    const blob = new Blob([manifestStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${selectedPlugin.id}-manifest.json`;
                    a.click();
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW: MONEY MANAGER & BUDGET ANALYZER */}
      {activeSubTab === 'MONEY_MANAGER' && (
        <MoneyManagerScreen />
      )}

      {/* SUB-VIEW 2: TIMETABLE PLUGIN & WEEKLY SCHEDULE */}
      {activeSubTab === 'TIMETABLE' && (
        <div className="space-y-6">
          {/* Rule B1: 60s Contextual Schedule Proposal Banner */}
          {activeProposal && activeProposal.status === 'pending' && proposalSecondsLeft > 0 && (
            <div className="bg-indigo-950/90 border border-indigo-500/60 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse-subtle">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/40 shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-300 fill-amber-300/30" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white flex items-center gap-2">
                    <span>Contextual Time-Block Proposal</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-900 text-indigo-300 border border-indigo-700/60 font-semibold">
                      Rule B1 (60s Auto-Lapse)
                    </span>
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Proposed focus: <strong className="text-indigo-300">{activeProposal.activity}</strong> ({activeProposal.start}–{activeProposal.end}). {activeProposal.reason}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950 px-2.5 py-1 rounded-lg border border-amber-800">
                  ⏱ {proposalSecondsLeft}s
                </span>
                <button
                  onClick={() => handleAcceptProposal(activeProposal.id)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept Block</span>
                </button>
                <button
                  onClick={() => handleDeclineProposal(activeProposal.id)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Decline</span>
                </button>
              </div>
            </div>
          )}

          {/* Schedule Engine Control Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Adaptive Daily Timetable</h3>
                <p className="text-xs text-slate-400">
                  Generated at {timetable?.generatedAtTimeStr || '10:00'} &bull; {timetable?.blocks.length || 0} scheduled blocks
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setManualMode(!manualMode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  manualMode
                    ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                {manualMode ? 'Close Manual Editor' : '+ Manual Block'}
              </button>

              {onTriggerAiTimetable && (
                <button
                  onClick={onTriggerAiTimetable}
                  disabled={isAiScheduling}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAiScheduling ? 'AI Optimizing...' : 'AI Reschedule'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Manual Block Form */}
          {manualMode && (
            <form onSubmit={handleAddManualBlock} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Insert Manual Schedule Block</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={newBlockActivity}
                  onChange={(e) => setNewBlockActivity(e.target.value)}
                  placeholder="Activity title (e.g. Deep Coding Sprint)"
                  className="sm:col-span-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={newBlockStart}
                  onChange={(e) => setNewBlockStart(e.target.value)}
                  placeholder="Start (14:00)"
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={newBlockEnd}
                  onChange={(e) => setNewBlockEnd(e.target.value)}
                  placeholder="End (15:00)"
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md"
                >
                  Save Block
                </button>
              </div>
            </form>
          )}

          {/* Timetable Schedule Grid */}
          <div className="space-y-3">
            {(!timetable || timetable.blocks.length === 0) ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
                <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No scheduled blocks for today yet.</p>
                <button
                  onClick={onTriggerAiTimetable}
                  className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md"
                >
                  Generate Adaptive Schedule
                </button>
              </div>
            ) : (
              timetable.blocks.map((block) => (
                <div
                  key={block.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs font-bold text-indigo-400 shrink-0">
                      {block.start} &ndash; {block.end}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{block.activity}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-slate-800 text-slate-300">
                          {block.category}
                        </span>
                        {block.isAiGenerated && (
                          <span className="text-[9px] font-mono font-bold text-purple-400 bg-purple-950 px-1.5 py-0.2 rounded border border-purple-800/60">
                            AI
                          </span>
                        )}
                      </div>
                      {block.reason && <p className="text-xs text-slate-400 mt-0.5">{block.reason}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                        block.status === 'completed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : block.status === 'in_progress'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {block.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: PRE-CONTEXT BROKER (INBOUND PIT) VISUAL LOGS */}
      {activeSubTab === 'PIT_LOGS' && (
        <div className="space-y-4">
          {/* Header & Rule B2 Force Sync Override Action */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Pre-Context Broker Inbound PIT</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Rule B2 Override
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Telemetry buffer staging incoming events. Composite Score = Priority &times; 0.6 + Severity &times; 0.4.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTriggerForceSync}
                disabled={isForceSyncing}
                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isForceSyncing ? 'animate-spin' : ''}`} />
                <span>Rule B2 Force Sync Override</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2">
            {['ALL', 'STAGED', 'SYNCED', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => setPitFilter(st as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  pitFilter === st
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* PIT Event Logs Stream Table / Cards */}
          <div className="space-y-2.5">
            {filteredPitRecords.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                No Pre-Context PIT events logged yet. Events will stage automatically as plugins dispatch telemetry.
              </div>
            ) : (
              filteredPitRecords.map((record) => {
                const priorityVal = record.priority === 'critical' ? 100 : record.priority === 'high' ? 75 : record.priority === 'medium' ? 50 : 25;
                const severityVal = (record.severity as string) === 'blocker' || (record.severity as string) === 'critical' ? 100 : record.severity === 'error' ? 75 : record.severity === 'warning' ? 50 : 25;
                const compositeScore = Math.round(priorityVal * 0.6 + severityVal * 0.4);

                return (
                  <div
                    key={record.id}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${
                          record.status === 'staged'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                            : record.status === 'synced'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {record.status}
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{record.source_plugin_id}</span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(record.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                          Payload: {JSON.stringify(record.payload)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                        Priority: {record.priority}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                        Severity: {record.severity}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-200 border border-indigo-700">
                        Composite: {compositeScore}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
