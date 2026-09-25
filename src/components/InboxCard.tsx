import React from 'react';
import { Archive, Clock3, Inbox, RotateCcw, Sparkles } from 'lucide-react';
import { CaptureDestination, QuickCapture } from '../types';
import { classifyCapture } from '../utils/captureClassifier';

interface InboxCardProps {
  captures: QuickCapture[];
  onOpenCapture: () => void;
  onProcess: (id: number, type: CaptureDestination) => void;
  onDefer: (id: number) => void;
  onArchive: (id: number) => void;
  onUndo: (id: number) => void;
}

export const InboxCard: React.FC<InboxCardProps> = ({ captures, onOpenCapture, onProcess, onDefer, onArchive, onUndo }) => {
  const actionable = captures.filter((capture) => {
    const status = capture.inboxStatus || 'UNPROCESSED';
    return status === 'UNPROCESSED' || (status === 'DEFERRED' && (capture.deferUntilMillis || 0) <= Date.now());
  });
  const recentlyProcessed = captures.find((capture) => capture.inboxStatus === 'PROCESSED' && capture.processedAtMillis && Date.now() - capture.processedAtMillis < 300000);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Inbox className="h-4 w-4 text-cyan-400" /><div><h2 className="text-sm font-bold text-white">Inbox</h2><p className="text-[10px] text-slate-500">Capture now. Decide calmly.</p></div></div>
        <button type="button" onClick={onOpenCapture} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500">Quick capture</button>
      </div>
      {actionable.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">Inbox clear. New thoughts can land here without interrupting your focus.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {actionable.slice(0, 4).map((capture) => {
            const suggestion = classifyCapture(capture.text);
            const type = capture.suggestedType || suggestion.type;
            return <div key={capture.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-xs font-medium text-white">{capture.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-800/60 bg-cyan-950/50 px-2 py-1 text-[10px] text-cyan-200"><Sparkles className="mr-1 inline h-3 w-3" />Suggested: {suggestion.label}{suggestion.amount ? ` · ₹${suggestion.amount}` : ''}</span>
                <button type="button" onClick={() => { if (window.confirm(`Convert this capture to ${suggestion.label}?`)) onProcess(capture.id, type); }} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-500">Confirm</button>
                <button type="button" onClick={() => onDefer(capture.id)} className="rounded-lg border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300"><Clock3 className="mr-1 inline h-3 w-3" />Tomorrow</button>
                <button type="button" onClick={() => onArchive(capture.id)} className="rounded-lg px-2 py-1.5 text-[10px] text-slate-500 hover:text-white"><Archive className="mr-1 inline h-3 w-3" />Archive</button>
              </div>
            </div>;
          })}
        </div>
      )}
      {recentlyProcessed && <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-950/30 px-3 py-2 text-[10px] text-emerald-300"><span>Filed as {recentlyProcessed.processedType?.toLowerCase()}.</span><button type="button" onClick={() => onUndo(recentlyProcessed.id)} className="font-semibold hover:text-white"><RotateCcw className="mr-1 inline h-3 w-3" />Undo</button></div>}
    </section>
  );
};
