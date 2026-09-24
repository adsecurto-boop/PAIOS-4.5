import React from 'react';
import { BookOpen, CheckSquare, Play, X, Zap } from 'lucide-react';

interface QuickAddMenuProps {
  onDismiss: () => void;
  onAddTask: () => void;
  onAddNote: () => void;
  onStartFocus: () => void;
  onOpenJournal: () => void;
}

const actions = [
  { key: 'task', label: 'Task', description: 'Something to complete', icon: CheckSquare, color: 'text-emerald-300' },
  { key: 'note', label: 'Quick note', description: 'Capture before it disappears', icon: Zap, color: 'text-cyan-300' },
  { key: 'focus', label: 'Focus session', description: 'Start intentional work', icon: Play, color: 'text-indigo-300' },
  { key: 'journal', label: 'Journal', description: 'Reflect with more space', icon: BookOpen, color: 'text-amber-300' },
] as const;

export const QuickAddMenu: React.FC<QuickAddMenuProps> = ({ onDismiss, onAddTask, onAddNote, onStartFocus, onOpenJournal }) => {
  const handlers = { task: onAddTask, note: onAddNote, focus: onStartFocus, journal: onOpenJournal };
  const run = (key: keyof typeof handlers) => { onDismiss(); handlers[key](); };
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="quick-add-title" onMouseDown={(event) => event.target === event.currentTarget && onDismiss()}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div><h2 id="quick-add-title" className="font-heading text-base font-bold text-white">Add to PAIOS</h2><p className="mt-0.5 text-xs text-slate-400">What do you want to do right now?</p></div>
          <button type="button" onClick={onDismiss} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close quick add"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return <button key={action.key} type="button" onClick={() => run(action.key)} className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-left transition-colors hover:border-indigo-600/60 hover:bg-slate-900"><Icon className={`h-5 w-5 ${action.color}`} /><span className="mt-3 block text-sm font-semibold text-white">{action.label}</span><span className="mt-0.5 block text-[10px] text-slate-400">{action.description}</span></button>;
          })}
        </div>
      </div>
    </div>
  );
};
