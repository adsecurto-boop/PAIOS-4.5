import React, { useMemo, useState } from 'react';
import { ArrowRight, CalendarRange, Check, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { ActivityLog, EveningReview, MorningCheckIn, Task, WeeklyReview } from '../types';
import { buildWeeklySummary } from '../utils/weeklyReview';

interface WeeklyResetCardProps {
  tasks: Task[];
  activities: ActivityLog[];
  checkIns: MorningCheckIn[];
  reviews: EveningReview[];
  savedReview?: WeeklyReview;
  onSave: (review: WeeklyReview, createTasks: boolean) => void;
}

export const WeeklyResetCard: React.FC<WeeklyResetCardProps> = ({ tasks, activities, checkIns, reviews, savedReview, onSave }) => {
  const summary = useMemo(() => buildWeeklySummary(tasks, activities, checkIns, reviews), [tasks, activities, checkIns, reviews]);
  const [expanded, setExpanded] = useState(false);
  const [wins, setWins] = useState(savedReview?.wins || '');
  const [lesson, setLesson] = useState(savedReview?.lesson || '');
  const [outcomes, setOutcomes] = useState<string[]>(savedReview?.nextOutcomes || ['', '', '']);
  const [createTasks, setCreateTasks] = useState(true);

  const save = () => {
    const nextOutcomes = outcomes.map((value) => value.trim()).filter(Boolean).slice(0, 3);
    if (!wins.trim() && !lesson.trim() && nextOutcomes.length === 0) return;
    const now = Date.now();
    onSave({
      weekStartDateString: summary.weekStartDateString,
      wins: wins.trim(),
      lesson: lesson.trim(),
      nextOutcomes,
      completedTasks: summary.completedTasks,
      focusMinutes: summary.focusMinutes,
      rhythmDays: summary.rhythmDays,
      createdAtMillis: savedReview?.createdAtMillis || now,
      updatedAtMillis: now,
    }, createTasks && !savedReview);
    setExpanded(false);
  };

  return <section className="rounded-2xl border border-violet-900/60 bg-gradient-to-br from-violet-950/35 to-slate-900 p-4 shadow-lg">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-600/20 p-2 text-violet-300"><CalendarRange className="h-5 w-5" /></div><div><h2 className="text-sm font-bold text-white">Weekly reset</h2><p className="text-[10px] text-slate-400">Close the week, learn, and choose what matters next.</p></div></div>
      <div className="flex items-center gap-3"><div className="hidden gap-3 text-[10px] text-slate-400 sm:flex"><span>{summary.completedTasks} done</span><span>{summary.focusMinutes}m focus</span><span>{summary.rhythmDays}/7 rhythm</span></div>{expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</div>
    </button>
    {!expanded && savedReview && <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-900/50 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" />This week is closed. Your next outcomes are ready.</div>}
    {expanded && <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
      <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-950 p-3"><b className="text-lg text-white">{summary.completedTasks}</b><p className="text-[10px] text-slate-500">tasks completed</p></div><div className="rounded-xl bg-slate-950 p-3"><b className="text-lg text-white">{summary.focusMinutes}m</b><p className="text-[10px] text-slate-500">focused</p></div><div className="rounded-xl bg-slate-950 p-3"><b className="text-lg text-white">{summary.rhythmDays}/7</b><p className="text-[10px] text-slate-500">days checked in</p></div></div>
      <div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-slate-300">What worked?<textarea value={wins} onChange={(e) => setWins(e.target.value)} rows={3} placeholder="Wins, progress, moments to repeat…" className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm font-normal text-white outline-none focus:border-violet-500" /></label><label className="text-xs font-semibold text-slate-300">What will you change?<textarea value={lesson} onChange={(e) => setLesson(e.target.value)} rows={3} placeholder="One lesson or adjustment…" className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm font-normal text-white outline-none focus:border-violet-500" /></label></div>
      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><Target className="h-4 w-4 text-violet-300" />Next week’s three outcomes</div><div className="grid gap-2 md:grid-cols-3">{[0, 1, 2].map((index) => <input key={index} value={outcomes[index] || ''} onChange={(e) => setOutcomes((current) => { const next = [...current]; next[index] = e.target.value; return next; })} placeholder={`Outcome ${index + 1}`} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-violet-500" />)}</div></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={createTasks} disabled={Boolean(savedReview)} onChange={(e) => setCreateTasks(e.target.checked)} className="accent-violet-500" />Pin outcomes as tasks</label><button type="button" onClick={save} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-500">Save weekly reset <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button></div>
    </div>}
  </section>;
};
