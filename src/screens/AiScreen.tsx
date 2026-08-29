import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Check,
  Play,
  Zap,
  RefreshCw,
  Copy,
  Code,
  HeartPulse,
  Lightbulb,
  Brain,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Flame,
  MessageSquare,
  Plus
} from 'lucide-react';
import { AiChatMessage, ActivityLog, NavTab } from '../types';

export type ChatRole = 'productivity' | 'sdet_mentor' | 'health_specialist' | 'creative_coach';
export type TaskComplexityMode = 'general' | 'complex' | 'fast';

interface AiScreenProps {
  messages: AiChatMessage[];
  userContextString: string;
  onSendMessage: (userText: string, options?: { role?: ChatRole; taskComplexity?: TaskComplexityMode }) => Promise<void>;
  onExecuteAction: (actionType: string, actionPayloadJson: string) => void;
  onClearHistory?: () => void;
  activeActivity?: ActivityLog | null;
  tasksCount?: number;
  dueFlashcardsCount?: number;
  onNavigateTab?: (tab: NavTab) => void;
  onOpenQuickCapture?: () => void;
  onOpenStartActivity?: () => void;
  onOpenAddTask?: () => void;
}

export const AiScreen: React.FC<AiScreenProps> = ({
  messages,
  userContextString,
  onSendMessage,
  onExecuteAction,
  onClearHistory,
  activeActivity,
  tasksCount = 0,
  dueFlashcardsCount = 0,
  onNavigateTab,
  onOpenQuickCapture,
  onOpenStartActivity,
  onOpenAddTask,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeRole, setActiveRole] = useState<ChatRole>('productivity');
  const [taskComplexity, setTaskComplexity] = useState<TaskComplexityMode>('general');
  const [executedActionIds, setExecutedActionIds] = useState<number[]>([]);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;
    setInputText('');
    setIsSending(true);
    try {
      await onSendMessage(text, { role: activeRole, taskComplexity });
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExecute = (msgId: number, type: string, payloadJson: string) => {
    onExecuteAction(type, payloadJson);
    setExecutedActionIds((prev) => [...prev, msgId]);
  };

  const handleCopyText = (msgId: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Roles Metadata & Configurations
  const roleConfigs = {
    productivity: {
      name: 'Productivity OS',
      shortName: 'Productivity',
      icon: Sparkles,
      badge: 'Core Intelligence',
      color: 'from-indigo-500 to-cyan-500',
      activeBorder: 'border-indigo-500',
      activeBg: 'bg-indigo-950/60 text-indigo-200',
      tagline: 'Adaptive scheduling, daily focus blocks, and priority management',
      starters: [
        { title: 'Morning Briefing', prompt: 'Give me a structured summary of my top priorities and schedule today' },
        { title: 'Time-Block Day', prompt: 'Build an optimized daily timetable blocking focus sessions around my meetings' },
        { title: 'Add High-Priority Task', prompt: 'Add a high priority task: Complete Playwright regression suite before 5 PM' },
        { title: 'Start Focus Timer', prompt: 'Start a 30-minute Deep Work focus activity timer' },
      ],
    },
    sdet_mentor: {
      name: 'SDET & ISTQB Mentor',
      shortName: 'SDET & QA',
      icon: Code,
      badge: 'Engineering & QA',
      color: 'from-purple-500 to-indigo-500',
      activeBorder: 'border-purple-500',
      activeBg: 'bg-purple-950/60 text-purple-200',
      tagline: 'ISTQB CTFL certification, Playwright/TypeScript patterns, and test automation',
      starters: [
        { title: 'ISTQB Quiz', prompt: 'Quiz me on ISTQB Equivalence Partitioning and Boundary Value Analysis' },
        { title: 'Playwright Pattern', prompt: 'Write a clean Playwright TypeScript page object model example for login flows' },
        { title: 'API Test Strategy', prompt: 'How should I design an automated test suite for an authenticated REST API?' },
        { title: 'Review Test Cases', prompt: 'Give me a review checklist for UI and API automated regression suites' },
      ],
    },
    health_specialist: {
      name: 'Health & Wellness',
      shortName: 'Health',
      icon: HeartPulse,
      badge: 'Clinical & Habits',
      color: 'from-rose-500 to-amber-500',
      activeBorder: 'border-rose-500',
      activeBg: 'bg-rose-950/60 text-rose-200',
      tagline: 'Prescription tracking, refill inventories, vitals, and wellness check-ins',
      starters: [
        { title: 'Medication Check', prompt: 'Check my medication schedule and current refill inventory status' },
        { title: 'Log Daily Vitals', prompt: 'Help me log my blood pressure reading of 120/80 and heart rate 72 bpm' },
        { title: 'Refill Alert Help', prompt: 'Which medications are running low and need a pharmacy refill soon?' },
        { title: 'Missed Dose Advice', prompt: 'What is the general best practice if a daily dose is delayed by 2 hours?' },
      ],
    },
    creative_coach: {
      name: 'Creative Coach',
      shortName: 'Goals & Growth',
      icon: Lightbulb,
      badge: 'Execution Coach',
      color: 'from-emerald-500 to-teal-500',
      activeBorder: 'border-emerald-500',
      activeBg: 'bg-emerald-950/60 text-emerald-200',
      tagline: 'Sprint goal setting, habit execution, and career advancement roadmaps',
      starters: [
        { title: 'Sprint Roadmap', prompt: 'Help me outline a 4-week goal roadmap to master test automation' },
        { title: 'Brainstorm Projects', prompt: 'Brainstorm 3 portfolio projects that showcase senior QA automation skills' },
        { title: 'Evening Reflection', prompt: 'Guide me through a structured 5-minute evening review to improve learning retention' },
        { title: 'Habit Optimization', prompt: 'How can I build a consistent daily 45-minute deep focus habit?' },
      ],
    },
  };

  const modelTierInfo = {
    fast: {
      modelName: 'gemini-3.1-flash-lite',
      label: 'Fast',
      badge: '⚡ Fast Mode',
      desc: 'Instant answers & quick captures',
    },
    general: {
      modelName: 'gemini-3.5-flash',
      label: 'Balanced',
      badge: '🤖 Gemini 3.5 Flash',
      desc: 'Optimal for daily scheduling & multi-turn reasoning',
    },
    complex: {
      modelName: 'gemini-3.1-pro-preview',
      label: 'Deep Reason',
      badge: '🧠 Gemini 3.1 Pro',
      desc: 'High-depth technical reasoning & complex plans',
    },
  };

  const currentRole = roleConfigs[activeRole];
  const ActiveRoleIcon = currentRole.icon;

  // Time-based friendly greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] min-h-[640px] max-h-[880px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
      {/* 1. TOP HEADER & PERSONA SELECTOR BAR */}
      <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr ${currentRole.color} flex items-center justify-center text-white shadow-lg shadow-indigo-950/50 shrink-0`}>
            <ActiveRoleIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-bold text-sm sm:text-base text-white flex items-center gap-1.5">
                <span>PAIOS Intelligence</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-semibold">
                  Home
                </span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.2 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block truncate max-w-md">
              {currentRole.tagline}
            </p>
          </div>
        </div>

        {/* Persona Selector Chips & Tier Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Persona Pills */}
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto">
            {(Object.keys(roleConfigs) as ChatRole[]).map((roleKey) => {
              const r = roleConfigs[roleKey];
              const Icon = r.icon;
              const isSelected = activeRole === roleKey;
              return (
                <button
                  key={roleKey}
                  onClick={() => setActiveRole(roleKey)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    isSelected
                      ? `${r.activeBg} ${r.activeBorder} shadow-sm border`
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={r.tagline}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{r.shortName}</span>
                </button>
              );
            })}
          </div>

          {/* Model Mode Pill Dropdown */}
          <div className="relative">
            <select
              value={taskComplexity}
              onChange={(e) => setTaskComplexity(e.target.value as TaskComplexityMode)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-sm"
            >
              <option value="general">🤖 3.5 Flash (Balanced)</option>
              <option value="complex">🧠 3.1 Pro (Deep)</option>
              <option value="fast">⚡ Flash-Lite (Fast)</option>
            </select>
          </div>

          {/* Clear Chat Button */}
          {messages.length > 0 && onClearHistory && (
            <button
              onClick={onClearHistory}
              title="Start a fresh conversation"
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 border border-slate-800 transition-all text-xs flex items-center gap-1 font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. AT-A-GLANCE CONTEXT TICKER (Quick status summary on Home) */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between gap-3 text-xs overflow-x-auto">
        <div className="flex items-center gap-4 text-slate-400 shrink-0">
          {activeActivity ? (
            <div className="flex items-center gap-1.5 text-amber-300 font-mono font-medium">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>Active: {activeActivity.activityName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Ready for new focus sprint</span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>{tasksCount} pending task{tasksCount === 1 ? '' : 's'}</span>
          </div>

          {dueFlashcardsCount > 0 && (
            <div className="flex items-center gap-1.5 text-purple-300">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <span>{dueFlashcardsCount} cards due</span>
            </div>
          )}
        </div>

        {/* Quick Hub Navigation Shortcuts */}
        {onNavigateTab && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab(NavTab.TODAY)}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-900 transition-colors"
            >
              Today View &rarr;
            </button>
            <button
              onClick={() => onNavigateTab(NavTab.TIMELINE)}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-900 transition-colors"
            >
              Timetable &rarr;
            </button>
            <button
              onClick={() => onNavigateTab(NavTab.PLUGINS)}
              className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-slate-900 transition-colors"
            >
              Plugins Hub &rarr;
            </button>
          </div>
        )}
      </div>

      {/* 3. MAIN CHAT / HOME CONTENT CONTAINER */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-900/40">
        {messages.length === 0 ? (
          /* HOME LANDING VIEW (Visually clean, inviting, uncluttered) */
          <div className="max-w-2xl mx-auto py-6 sm:py-10 space-y-6">
            {/* Friendly Greeting Card */}
            <div className="text-center space-y-3">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${currentRole.color} p-0.5 mx-auto shadow-xl shadow-indigo-500/10`}>
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-white">
                  <ActiveRoleIcon className="w-8 h-8" />
                </div>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-heading">
                  {getGreeting()}, welcome to PAIOS AI
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-lg mx-auto">
                  Your context-aware AI copilot for high-leverage planning, test automation, clinical wellness, and habit execution.
                </p>
              </div>
            </div>

            {/* Quick Action Category Starters */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Suggested Starter Prompts ({currentRole.name})
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  {modelTierInfo[taskComplexity].badge}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {currentRole.starters.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(starter.prompt)}
                    className="p-3.5 rounded-2xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800/80 hover:border-indigo-500/60 text-left transition-all group flex flex-col justify-between gap-2 shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {starter.title}
                      </span>
                      <Send className="w-3.5 h-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      &ldquo;{starter.prompt}&rdquo;
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Workspace Shortcuts Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 font-medium">Quick Workspace Actions:</span>
              <div className="flex items-center gap-2">
                {onOpenStartActivity && (
                  <button
                    onClick={onOpenStartActivity}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" /> Focus Timer
                  </button>
                )}
                {onOpenAddTask && (
                  <button
                    onClick={onOpenAddTask}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-indigo-400" /> New Task
                  </button>
                )}
                {onOpenQuickCapture && (
                  <button
                    onClick={onOpenQuickCapture}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Zap className="w-3 h-3 text-amber-400" /> Capture
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* CONVERSATION THREAD STREAM */
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${msg.isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                    msg.isUser
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-950 text-cyan-400 border border-indigo-900/60 shadow-md'
                  }`}
                >
                  {msg.isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className="space-y-2 max-w-[88%] sm:max-w-[82%]">
                  <div
                    className={`relative group p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      msg.isUser
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-950/40'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none whitespace-pre-line shadow-md'
                    }`}
                  >
                    {/* Header Metadata for Bot */}
                    {!msg.isUser && (
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2.5 pb-1.5 border-b border-slate-800/80">
                        <span className="flex items-center gap-1 text-indigo-400 font-semibold">
                          <Sparkles className="w-3 h-3" /> Gemini Assistant
                        </span>
                        <div className="flex items-center gap-2">
                          {msg.timestampMillis && (
                            <span>{new Date(msg.timestampMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                          <button
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            className="text-slate-400 hover:text-white transition-colors"
                            title="Copy response"
                          >
                            {copiedMsgId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {msg.text}

                    {/* Timestamp for User */}
                    {msg.isUser && msg.timestampMillis && (
                      <div className="text-[10px] font-mono text-indigo-200/80 text-right mt-1.5">
                        {new Date(msg.timestampMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>

                  {/* Interactive Executable Action Card */}
                  {!msg.isUser && msg.actionType && msg.actionPayloadJson && (
                    <div className="bg-slate-950 border border-indigo-900/80 p-3.5 rounded-2xl space-y-2 shadow-xl">
                      <div className="flex items-center justify-between text-[11px] font-mono font-bold text-indigo-400">
                        <span className="flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-amber-400" /> Proposed Action: {msg.actionType}
                        </span>
                      </div>

                      <pre className="text-[10px] font-mono text-slate-300 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 overflow-x-auto">
                        {msg.actionPayloadJson}
                      </pre>

                      {executedActionIds.includes(msg.id) || msg.isActionConfirmed ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold pt-1">
                          <ShieldCheck className="w-4 h-4" /> Action Executed & Stored to Workspace
                        </div>
                      ) : (
                        <button
                          onClick={() => handleExecute(msg.id, msg.actionType!, msg.actionPayloadJson!)}
                          className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Execute & Save to Workspace
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sending / Thinking Indicator */}
        {isSending && (
          <div className="max-w-3xl mx-auto flex items-center gap-3 text-xs font-mono text-indigo-300 p-3 bg-slate-950 rounded-2xl border border-indigo-900/50 w-fit shadow-md">
            <Bot className="w-4 h-4 animate-bounce text-cyan-400" />
            <span>Gemini ({modelTierInfo[taskComplexity].modelName}) is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. BOTTOM INPUT FORM (Clean, spacious, modern) */}
      <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-end gap-2 bg-slate-900 border border-slate-800 focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/30 rounded-2xl p-2 transition-all shadow-inner">
            <textarea
              ref={inputRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${currentRole.name} anything... (e.g. plan my day, log vitals, quiz me)`}
              className="flex-1 bg-transparent border-0 resize-none px-3 py-1.5 text-xs sm:text-sm text-white focus:outline-none placeholder:text-slate-500 max-h-32 min-h-[38px]"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0 shadow-md shadow-indigo-950/40"
              title="Send message (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 font-mono">
            <span>Powered by Google Gemini</span>
            <span className="hidden sm:inline">Press Enter to send &bull; Shift+Enter for new line</span>
          </div>
        </form>
      </div>
    </div>
  );
};


