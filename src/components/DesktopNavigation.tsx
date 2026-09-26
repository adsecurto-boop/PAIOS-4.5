import React, { useState } from 'react';
import { BarChart3, BookOpen, Brain, CheckCircle2, HeartPulse, History, Layers, Settings, Sparkles, Sun, UserRound, X, Zap } from 'lucide-react';
import { NavTab } from '../types';

interface Props { activeTab: NavTab; onSelectTab: (tab: NavTab) => void; onOpenCapture: () => void; }
const primary = [{ tab: NavTab.TODAY, label: 'Today', icon: Sun }, { tab: NavTab.TIMELINE, label: 'Plan', icon: History }, { tab: NavTab.INSIGHTS, label: 'Insights', icon: BarChart3 }, { tab: NavTab.AI, label: 'Assistant', icon: Sparkles }];
const spaces = [
  { tab: NavTab.TASKS, label: 'Tasks', detail: 'Commitments and priorities', icon: CheckCircle2 },
  { tab: NavTab.HEALTH, label: 'Health', detail: 'Medication and wellbeing', icon: HeartPulse },
  { tab: NavTab.JOURNAL, label: 'Journal', detail: 'Notes and reflection', icon: BookOpen },
  { tab: NavTab.LEARN, label: 'Learn', detail: 'Study and recall', icon: Brain },
  { tab: NavTab.PLUGINS, label: 'Tools', detail: 'Money and extensions', icon: Layers },
  { tab: NavTab.SETTINGS, label: 'Settings', detail: 'Account and preferences', icon: Settings },
];

export const DesktopNavigation: React.FC<Props> = ({ activeTab, onSelectTab, onOpenCapture }) => {
  const [open, setOpen] = useState(false);
  const select = (tab: NavTab) => { setOpen(false); onSelectTab(tab); };
  const tab = ({ tab, label, icon: Icon }: typeof primary[number]) => <button key={tab} type="button" onClick={() => select(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${activeTab === tab ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}><Icon className="h-4 w-4" />{label}</button>;
  const spaceActive = spaces.some((item) => item.tab === activeTab);
  return <nav className="relative hidden border-b border-slate-800/80 bg-slate-950/80 px-4 md:block" aria-label="Primary navigation">
    <div className="mx-auto flex max-w-6xl items-center gap-1 py-2">{primary.slice(0, 2).map(tab)}<button type="button" onClick={onOpenCapture} className="mx-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-950/50 hover:bg-indigo-500"><Zap className="h-4 w-4" />Capture</button>{primary.slice(2).map(tab)}<button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={`ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${open || spaceActive ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}><UserRound className="h-4 w-4" />You</button></div>
    {open && <div className="absolute right-4 top-[calc(100%+0.5rem)] z-50 w-[420px] rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"><div className="mb-2 flex items-center justify-between px-1"><div><p className="text-xs font-bold text-white">Your spaces</p><p className="text-[10px] text-slate-400">Open supporting areas when you need them.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close your spaces" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-2">{spaces.map(({ tab, label, detail, icon: Icon }) => <button key={tab} type="button" onClick={() => select(tab)} className={`flex items-center gap-2.5 rounded-xl border p-3 text-left ${activeTab === tab ? 'border-indigo-500/60 bg-indigo-950/50' : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'}`}><Icon className="h-4 w-4 shrink-0 text-indigo-300" /><span className="min-w-0"><span className="block text-xs font-semibold text-white">{label}</span><span className="block truncate text-[9px] text-slate-500">{detail}</span></span></button>)}</div></div>}
  </nav>;
};
