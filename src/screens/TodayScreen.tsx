import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Pin,
  CheckCircle2,
  Circle,
  Plus,
  Zap,
  BookOpen,
  Brain,
  History,
  Timer,
  Tag,
  Clock,
  Sparkles,
  ArrowRight,
  X,
  Check,
  Activity,
  CalendarCheck,
  ListChecks,
  Sun,
  Moon,
  Flame,
  RefreshCw,
  CalendarClock,
  AlertTriangle,
} from 'lucide-react';
import { ActivityLog, Task, TimelineEntry, MorningCheckIn, EveningReview, AdaptiveTimetableBlock, AdaptiveTimetableResponse, CaptureDestination, QuickCapture, WeeklyReview } from '../types';
import { TimetablePlugin, TimetableProposal } from '../core/plugins/TimetablePlugin';
import { getDailyCommandState } from '../utils/dailyCommandCenter';
import { InboxCard } from '../components/InboxCard';
import { WeeklyResetCard } from '../components/WeeklyResetCard';

interface TodayScreenProps {
  activeActivity: ActivityLog | null;
  priorities: Task[];
  todayTasks: Task[];
  timelineEntries: TimelineEntry[];
  checkIns: MorningCheckIn[];
  reviews: EveningReview[];
  inboxCaptures: QuickCapture[];
  activityLogs: ActivityLog[];
  weeklyReview?: WeeklyReview;
  timetable: AdaptiveTimetableResponse | null;
  isGeneratingTimetable: boolean;
  userName: string;
  onStartActivity: (name: string, category: string, note?: string) => void;
  onStartTaskTimer?: (task: Task) => void;
  onPauseActivity: (id?: number) => void;
  onResumeActivity: (id?: number) => void;
  onFinishActivity: (id?: number) => void;
  onOpenFinishModal?: () => void;
  onToggleTaskStatus: (taskId: number) => void;
  onOpenStartActivity: () => void;
  onOpenQuickCapture: () => void;
  onOpenAddTask: () => void;
  onOpenJournal: () => void;
  onOpenStudy: () => void;
  onOpenCheckIn: () => void;
  onOpenReview: () => void;
  onGeneratePlan: () => void;
  onReplanDay: () => void;
  onStartPlannedBlock: (block: AdaptiveTimetableBlock) => void;
  onOpenPlan: () => void;
  onRolloverTasks: (taskIds: number[]) => void;
  onProcessCapture: (id: number, type: CaptureDestination) => void;
  onDeferCapture: (id: number) => void;
  onArchiveCapture: (id: number) => void;
  onUndoCapture: (id: number) => void;
  onSaveWeeklyReview: (review: WeeklyReview, createTasks: boolean) => void;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({
  activeActivity,
  priorities,
  todayTasks,
  timelineEntries,
  checkIns,
  reviews,
  inboxCaptures,
  activityLogs,
  weeklyReview,
  timetable,
  isGeneratingTimetable,
  userName,
  onStartActivity,
  onStartTaskTimer,
  onPauseActivity,
  onResumeActivity,
  onFinishActivity,
  onOpenFinishModal,
  onToggleTaskStatus,
  onOpenStartActivity,
  onOpenQuickCapture,
  onOpenAddTask,
  onOpenJournal,
  onOpenStudy,
  onOpenCheckIn,
  onOpenReview,
  onGeneratePlan,
  onReplanDay,
  onStartPlannedBlock,
  onOpenPlan,
  onRolloverTasks,
  onProcessCapture,
  onDeferCapture,
  onArchiveCapture,
  onUndoCapture,
  onSaveWeeklyReview,
}) => {
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [activeProposal, setActiveProposal] = useState<TimetableProposal | null>(() =>
    TimetablePlugin.getActiveProposal()
  );
  const [proposalSecondsLeft, setProposalSecondsLeft] = useState(0);

  // Live timer ticker update
  useEffect(() => {
    let interval: any = null;
    if (activeActivity) {
      const updateSeconds = () => {
        const now = Date.now();
        const pausedSecs = activeActivity.accumulatedPausedDurationSeconds || 0;
        if (activeActivity.isRunning && !activeActivity.isPaused) {
          const grossSecs = Math.max(0, Math.floor((now - activeActivity.startTimeMillis) / 1000));
          const netSecs = Math.max(0, grossSecs - pausedSecs);
          setLiveSeconds(netSecs);
        } else if (activeActivity.isPaused) {
          const pauseStart = activeActivity.pauseStartTimeMillis || now;
          const grossSecs = Math.max(0, Math.floor((pauseStart - activeActivity.startTimeMillis) / 1000));
          const netSecs = Math.max(0, grossSecs - pausedSecs);
          setLiveSeconds(netSecs);
        }
      };
      updateSeconds();
      interval = setInterval(updateSeconds, 1000);
    } else {
      setLiveSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeActivity]);

  // Timetable Proposal 60s Ticker & Event Listeners
  useEffect(() => {
    const updateProposalState = () => {
      const prop = TimetablePlugin.getActiveProposal();
      setActiveProposal(prop);
      if (prop) {
        const left = Math.max(0, Math.ceil((prop.expiresAtMillis - Date.now()) / 1000));
        setProposalSecondsLeft(left);
      } else {
        setProposalSecondsLeft(0);
      }
    };

    updateProposalState();
    const interval = setInterval(updateProposalState, 1000);

    const handleProposalUpdate = () => updateProposalState();
    window.addEventListener('timetable_proposal_updated', handleProposalUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('timetable_proposal_updated', handleProposalUpdate);
    };
  }, []);

  const handleAcceptProposal = (id: string) => {
    TimetablePlugin.acceptProposal(id);
    setActiveProposal(null);
  };

  const handleDeclineProposal = (id: string) => {
    TimetablePlugin.rejectProposal(id);
    setActiveProposal(null);
  };

  const formatTimer = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleFinishClick = () => {
    if (onOpenFinishModal) {
      onOpenFinishModal();
    } else if (activeActivity) {
      onFinishActivity(activeActivity.id);
    }
  };

  const handleStartTask = (task: Task) => {
    if (onStartTaskTimer) {
      onStartTaskTimer(task);
    } else {
      onStartActivity(task.title, task.category, task.description || undefined);
    }
  };

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const openPriorities = priorities.filter((task) => task.status !== 'COMPLETED');
  const openTasks = todayTasks.filter((task) => task.status !== 'COMPLETED');
  const nextTask = openPriorities[0] || openTasks[0];
  const completedToday = todayTasks.filter((task) => task.status === 'COMPLETED').length;
  const focusMinutes = timelineEntries
    .filter((entry) => entry.type === 'ACTIVITY')
    .reduce((total, entry) => total + (entry.durationMinutes || 0), 0);
  const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayCheckIn = checkIns.find((checkIn) => checkIn.dateString === todayString);
  const todayReview = reviews.find((review) => review.dateString === todayString);
  const hasFocusedToday = focusMinutes > 0 || completedToday > 0;
  const hasEveningWindow = now.getHours() >= 17;

  const ritualDates = new Set([
    ...checkIns.map((checkIn) => checkIn.dateString),
    ...reviews.map((review) => review.dateString),
  ]);
  let dailyRhythmStreak = 0;
  for (let offset = 0; ; offset += 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!ritualDates.has(dateString)) break;
    dailyRhythmStreak += 1;
  }

  const rhythmSteps = [
    { label: 'Intention', done: Boolean(todayCheckIn), action: onOpenCheckIn },
    { label: 'Focus', done: hasFocusedToday, action: onOpenStartActivity },
    { label: 'Reflect', done: Boolean(todayReview), action: onOpenReview },
  ];
  const nextRhythmStep = rhythmSteps.find((step) => !step.done);
  const commandState = getDailyCommandState(timetable, todayTasks, now);

  const handleRollover = () => {
    if (!commandState.rolloverTasks.length) return;
    const confirmed = window.confirm(
      `Move ${commandState.rolloverTasks.length} unfinished commitment${commandState.rolloverTasks.length === 1 ? '' : 's'} to tomorrow? Completed work will stay untouched.`
    );
    if (confirmed) onRolloverTasks(commandState.rolloverTasks.map((task) => task.id));
  };

  return (
    <div className="space-y-5 pb-12">
      <section className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Daily cockpit</p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-white">{greeting}, {userName}.</h1>
          <p className="mt-1 text-sm text-slate-400">Choose one meaningful thing, protect the time, then close the loop.</p>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 sm:mt-0">
          <CalendarCheck className="h-4 w-4 text-emerald-400" />
          <span>{completedToday} completed · {openTasks.length} still open</span>
        </div>
      </section>

      <section className={`rounded-2xl border p-4 shadow-xl ${commandState.isDrifting ? 'border-amber-700/60 bg-amber-950/20' : 'border-indigo-800/60 bg-gradient-to-br from-indigo-950/45 to-slate-900'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {commandState.isDrifting ? <AlertTriangle className="h-4 w-4 text-amber-400" /> : <CalendarClock className="h-4 w-4 text-indigo-300" />}
              <h2 className="font-heading text-sm font-bold text-white">Daily command</h2>
              {commandState.hasTodayPlan && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${commandState.isDrifting ? 'bg-amber-900/60 text-amber-200' : 'bg-emerald-950 text-emerald-300'}`}>
                  {commandState.isDrifting ? `${commandState.missedBlocks.length} missed` : 'On track'}
                </span>
              )}
            </div>
            {!commandState.hasTodayPlan ? (
              <><p className="mt-2 text-sm font-semibold text-white">Turn today’s commitments into a realistic plan.</p><p className="mt-1 text-xs text-slate-400">PAIOS will propose focused blocks, breaks, and buffers. You remain in control.</p></>
            ) : commandState.isDrifting ? (
              <><p className="mt-2 text-sm font-semibold text-amber-100">The plan has drifted. That’s information, not failure.</p><p className="mt-1 text-xs text-slate-400">Rebuild the remaining hours while preserving everything already completed.</p></>
            ) : commandState.nextBlock ? (
              <><p className="mt-2 truncate text-sm font-semibold text-white">Next: {commandState.nextBlock.activity}</p><p className="mt-1 text-xs text-slate-400">{commandState.nextBlock.start}–{commandState.nextBlock.end} · {commandState.nextBlock.duration_minutes} min · {commandState.nextBlock.reason || 'Planned around your priorities'}</p></>
            ) : (
              <><p className="mt-2 text-sm font-semibold text-white">The planned work is closed for today.</p><p className="mt-1 text-xs text-slate-400">Review the day or prepare tomorrow without disturbing completed work.</p></>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!commandState.hasTodayPlan && <button type="button" onClick={onGeneratePlan} disabled={isGeneratingTimetable} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"><Sparkles className="mr-1.5 inline h-3.5 w-3.5" />{isGeneratingTimetable ? 'Planning…' : 'Plan my day'}</button>}
            {commandState.isDrifting && <button type="button" onClick={onReplanDay} disabled={isGeneratingTimetable} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"><RefreshCw className={`mr-1.5 inline h-3.5 w-3.5 ${isGeneratingTimetable ? 'animate-spin' : ''}`} />{isGeneratingTimetable ? 'Replanning…' : 'Replan remaining day'}</button>}
            {commandState.hasTodayPlan && !commandState.isDrifting && commandState.nextBlock && !activeActivity && <button type="button" onClick={() => onStartPlannedBlock(commandState.nextBlock!)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"><Play className="mr-1.5 inline h-3.5 w-3.5 fill-current" />Start next block</button>}
            {commandState.hasTodayPlan && <button type="button" onClick={onOpenPlan} className="rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:border-indigo-500 hover:text-white">View plan</button>}
          </div>
        </div>
        {hasEveningWindow && !todayReview && commandState.rolloverTasks.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-800/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">Close the loop: {commandState.rolloverTasks.length} unfinished commitment{commandState.rolloverTasks.length === 1 ? '' : 's'} can be carried into tomorrow.</p>
            <button type="button" onClick={handleRollover} className="self-start rounded-lg border border-indigo-700/60 bg-indigo-950/50 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-900/60 sm:self-auto">Review & move to tomorrow</button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              <h2 className="font-heading text-sm font-bold text-white">Daily rhythm</h2>
              {dailyRhythmStreak > 0 && (
                <span className="rounded-full border border-amber-800/60 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  {dailyRhythmStreak}-day return streak
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {todayCheckIn?.mainGoal
                ? `Today’s intention: ${todayCheckIn.mainGoal}`
                : 'A two-minute check-in keeps the day anchored to what matters.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5" aria-label="Daily rhythm progress">
            {rhythmSteps.map((step, index) => (
              <React.Fragment key={step.label}>
                {index > 0 && <div className={`h-px w-4 sm:w-7 ${step.done ? 'bg-emerald-500/70' : 'bg-slate-700'}`} />}
                <button
                  type="button"
                  onClick={step.done ? undefined : step.action}
                  disabled={step.done}
                  className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${
                    step.done
                      ? 'cursor-default border border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                      : 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-indigo-500 hover:text-white'
                  }`}
                >
                  {step.done ? <Check className="mr-1 inline h-3 w-3" /> : null}
                  {step.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
        {nextRhythmStep && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-900/60 bg-indigo-950/30 px-3 py-2.5">
            <p className="text-xs text-indigo-100">
              {!todayCheckIn
                ? 'Start small: name the one outcome that would make today worthwhile.'
                : nextRhythmStep.label === 'Reflect' && !hasEveningWindow
                  ? 'Your evening reflection will be ready later. For now, protect one focused block.'
                  : nextRhythmStep.label === 'Reflect'
                    ? 'Close the loop with a quick reflection while the day is still fresh.'
                    : 'A short focused block is enough to move the day forward.'}
            </p>
            <button
              type="button"
              onClick={nextRhythmStep.action}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              {!todayCheckIn ? <><Sun className="mr-1 inline h-3.5 w-3.5" /> Check in</> : nextRhythmStep.label === 'Reflect' ? <><Moon className="mr-1 inline h-3.5 w-3.5" /> Reflect</> : 'Start focus'}
            </button>
          </div>
        )}
      </section>
      {/* Rule B1: 60s Contextual Schedule Proposal Banner */}
      {activeProposal && activeProposal.status === 'pending' && proposalSecondsLeft > 0 && (
        <div className="bg-indigo-950/80 border border-indigo-500/50 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all animate-pulse-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/40 shrink-0">
              <Sparkles className="w-5 h-5 text-amber-300 fill-amber-300/30" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-2">
                <span>AI Contextual Schedule Proposal</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-900/80 text-indigo-300 border border-indigo-700/60 font-semibold">
                  Rule B1 (60s Auto-Lapse)
                </span>
              </p>
              <p className="text-xs text-slate-300 mt-0.5">
                Suggested focus: <strong className="text-indigo-300">{activeProposal.activity}</strong> ({activeProposal.start}–{activeProposal.end}). {activeProposal.reason}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <span className="text-xs font-mono font-bold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-800/80">
              ⏱ {proposalSecondsLeft}s
            </span>
            <button
              onClick={() => handleAcceptProposal(activeProposal.id)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Accept</span>
            </button>
            <button
              onClick={() => handleDeclineProposal(activeProposal.id)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Decline</span>
            </button>
          </div>
        </div>
      )}

      {/* The one decision that matters right now. */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        {activeActivity ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                      activeActivity.isPaused ? 'bg-amber-400 opacity-75' : 'bg-emerald-400 opacity-75'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      activeActivity.isPaused ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                </span>
                <span className="text-xs font-mono uppercase tracking-widest text-indigo-300 font-semibold">
                  {activeActivity.isPaused ? 'Timer Paused' : 'Live Focus Session'}
                </span>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-semibold">
                {activeActivity.category}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
              <div>
                <h2 className="text-2xl font-heading font-extrabold text-white">{activeActivity.activityName}</h2>
                {activeActivity.note && (
                  <p className="text-xs text-slate-400 mt-1 italic font-mono">&ldquo;{activeActivity.note}&rdquo;</p>
                )}
              </div>

              <div className="text-3xl sm:text-4xl font-mono font-black tracking-tight text-emerald-400 bg-slate-950/80 px-4 py-2 rounded-xl border border-emerald-900/50 shadow-inner inline-block self-start sm:self-auto">
                {formatTimer(liveSeconds)}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-800/80">
              {activeActivity.isPaused ? (
                <button
                  onClick={() => onResumeActivity(activeActivity.id)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Session</span>
                </button>
              ) : (
                <button
                  onClick={() => onPauseActivity(activeActivity.id)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-600/20"
                >
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause Timer</span>
                </button>
              )}

              <button
                onClick={handleFinishClick}
                className="py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Finish & Log</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-indigo-400" />
                <h2 className="font-heading font-bold text-lg text-white">Now</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Ready</span>
            </div>

            {nextTask ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">Your next best action</p>
                    <p className="mt-1 truncate text-base font-semibold text-white">{nextTask.title}</p>
                    {nextTask.description && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{nextTask.description}</p>}
                  </div>
                  <span className="shrink-0 rounded-lg bg-indigo-950 px-2 py-1 text-[10px] font-mono text-indigo-300">{nextTask.category}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-300">Your slate is clear. Capture what matters or begin a deliberate focus session.</p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={onOpenStartActivity}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{nextTask ? 'Start focus' : 'Start a focus session'}</span>
              </button>
              {nextTask && (
                <button
                  onClick={() => handleStartTask(nextTask)}
                  className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:border-indigo-500 hover:text-white"
                >
                  Track this task
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Low-friction capture stays close to the daily plan. */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          onClick={onOpenQuickCapture}
          className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition-all group flex flex-col justify-between h-20"
        >
          <Zap className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          <div>
            <span className="text-xs font-semibold text-white block">Quick Note</span>
            <span className="text-[10px] text-slate-400">Instant capture</span>
          </div>
        </button>

        <button
          onClick={onOpenAddTask}
          className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition-all group flex flex-col justify-between h-20"
        >
          <Plus className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <div>
            <span className="text-xs font-semibold text-white block">Add Task</span>
            <span className="text-[10px] text-slate-400">To-do item</span>
          </div>
        </button>

        <button
          onClick={onOpenJournal}
          className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition-all group flex flex-col justify-between h-20"
        >
          <BookOpen className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          <div>
            <span className="text-xs font-semibold text-white block">Journal</span>
            <span className="text-[10px] text-slate-400">Reflective entry</span>
          </div>
        </button>

        <button
          onClick={onOpenStudy}
          className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-left transition-all group flex flex-col justify-between h-20"
        >
          <Brain className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
          <div>
            <span className="text-xs font-semibold text-white block">Study Cards</span>
            <span className="text-[10px] text-slate-400">Active recall</span>
          </div>
        </button>
      </section>

      <InboxCard
        captures={inboxCaptures}
        onOpenCapture={onOpenQuickCapture}
        onProcess={onProcessCapture}
        onDefer={onDeferCapture}
        onArchive={onArchiveCapture}
        onUndo={onUndoCapture}
      />

      <WeeklyResetCard
        tasks={todayTasks}
        activities={activityLogs}
        checkIns={checkIns}
        reviews={reviews}
        savedReview={weeklyReview}
        onSave={onSaveWeeklyReview}
      />

      {/* Today's commitments, not an unbounded task dump. */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-amber-400 fill-current" />
            <h3 className="font-heading font-bold text-base text-white">Today&rsquo;s commitments</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">{priorities.length} / 3 pinned</span>
        </div>

        {priorities.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl">
            <p className="text-xs text-slate-400">No priority tasks pinned for today.</p>
            <button
              onClick={onOpenAddTask}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              + Add a priority task
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {priorities.map((task) => {
              const isTaskActive = activeActivity && activeActivity.activityName.toLowerCase().includes(task.title.toLowerCase());
              return (
                <div
                  key={task.id}
                  className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 group ${
                    isTaskActive
                      ? 'bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-950/50'
                      : 'bg-slate-950 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => onToggleTaskStatus(task.id)}
                      className="text-slate-500 hover:text-emerald-400 transition-colors"
                      title={task.status === 'COMPLETED' ? 'Mark Incomplete' : 'Mark Complete'}
                    >
                      {task.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-950" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-xs font-medium text-white truncate ${
                            task.status === 'COMPLETED' ? 'line-through text-slate-500' : ''
                          }`}
                        >
                          {task.title}
                        </p>
                        {isTaskActive && (
                          <span className="flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.2 rounded animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Tracking Now
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-1.5 py-0.2 rounded">
                          {task.category}
                        </span>
                        {task.description && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{task.description}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {task.status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleStartTask(task)}
                        className={`p-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                          isTaskActive
                            ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                            : 'bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white'
                        }`}
                        title="Start timer for this task"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span className="hidden sm:inline text-[11px] font-medium">Track</span>
                      </button>
                    )}
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">
                      High Priority
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* A compact record makes the end-of-day review feel achievable. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Timeline Logs */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                <h3 className="font-heading font-bold text-base text-white">Close the loop</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">{timelineEntries.length} entries</span>
            </div>

            {timelineEntries.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-6 text-center">No timeline activity logged today yet.</p>
            ) : (
              <div className="space-y-3">
                {timelineEntries.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                        {entry.type} &bull; {entry.category}
                      </span>
                      <h4 className="text-xs font-semibold text-white mt-0.5">{entry.title}</h4>
                      {entry.note && <p className="text-[11px] text-slate-400 mt-0.5">{entry.note}</p>}
                    </div>
                    {entry.durationMinutes !== undefined && entry.durationMinutes !== null && (
                      <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                        {entry.durationMinutes > 0 ? `${entry.durationMinutes}m` : '< 1m'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Progress summary */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-indigo-400" />
                <h3 className="font-heading font-bold text-base text-white">Today at a glance</h3>
              </div>
            <button
              onClick={onOpenAddTask}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-2xl font-bold text-white">{focusMinutes}m</p>
              <p className="mt-1 text-[11px] text-slate-400">intentional focus</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-2xl font-bold text-white">{completedToday}/{todayTasks.length}</p>
              <p className="mt-1 text-[11px] text-slate-400">tasks complete</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-indigo-900/60 bg-indigo-950/30 p-3.5">
            <p className="text-xs font-medium text-indigo-100">
              {openTasks.length === 0
                ? 'Your commitments are complete. Take a moment to note what made today work.'
                : `Keep the list small: ${openTasks.length} task${openTasks.length === 1 ? '' : 's'} remain. Choose the next one when you are ready.`}
            </p>
            <button onClick={onOpenJournal} className="mt-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200">
              Write a short reflection →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
