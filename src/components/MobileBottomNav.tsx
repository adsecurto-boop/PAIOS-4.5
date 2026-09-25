import React, { useState } from 'react';
import { BarChart2, Book, BookOpen, CheckSquare, Clock, HeartPulse, Layers, MoreHorizontal, Settings, Sparkles, Sun, Zap } from 'lucide-react';
import { NavTab } from '../types';

interface MobileBottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenCommandBar?: () => void;
}

const primaryTabs = [
  { id: NavTab.TODAY, label: 'Today', icon: Sun },
  { id: NavTab.TIMELINE, label: 'Plan', icon: Clock },
  { id: NavTab.TASKS, label: 'Tasks', icon: CheckSquare },
  { id: NavTab.AI, label: 'Assistant', icon: Sparkles },
];

const secondaryTabs = [
  { id: NavTab.HEALTH, label: 'Health', description: 'Medication and wellbeing', icon: HeartPulse },
  { id: NavTab.JOURNAL, label: 'Journal', description: 'Notes and reflections', icon: Book },
  { id: NavTab.LEARN, label: 'Learn', description: 'Study cards and recall', icon: BookOpen },
  { id: NavTab.INSIGHTS, label: 'Insights', description: 'Progress and patterns', icon: BarChart2 },
  { id: NavTab.PLUGINS, label: 'Tools', description: 'Money and extensions', icon: Layers },
  { id: NavTab.SETTINGS, label: 'Settings', description: 'Account and preferences', icon: Settings },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, onSelectTab, onOpenCommandBar }) => {
  const [showMore, setShowMore] = useState(false);
  const isSecondaryActive = secondaryTabs.some((tab) => tab.id === activeTab);
  const select = (tab: NavTab) => {
    setShowMore(false);
    onSelectTab(tab);
  };

  return (
    <>
      {showMore && <div className="fixed inset-0 z-40 bg-slate-950/60 md:hidden" onClick={() => setShowMore(false)} aria-hidden="true" />}
      <nav className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-slate-800/80 bg-slate-950/95 pb-[env(safe-area-inset-bottom,8px)] shadow-2xl backdrop-blur-2xl md:hidden" aria-label="Primary navigation">
        {showMore && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
            <div className="mb-2 px-1"><p className="text-xs font-bold text-white">More from PAIOS</p><p className="text-[10px] text-slate-400">Open supporting areas when you need them.</p></div>

            {onOpenCommandBar && (
              <button
                type="button"
                onClick={() => {
                  setShowMore(false);
                  onOpenCommandBar();
                }}
                className="w-full mb-2.5 flex items-center justify-between gap-2.5 rounded-xl border border-indigo-500/50 bg-indigo-950/60 p-2.5 text-left hover:border-indigo-400 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/40 text-indigo-300 flex items-center justify-center shrink-0">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-white">Command Bar</span>
                    <span className="block text-[10px] text-indigo-300/80">Execute actions, add tasks, record vitals</span>
                  </div>
                </div>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {secondaryTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => select(tab.id)} className={`flex items-center gap-2.5 rounded-xl border p-3 text-left ${isActive ? 'border-indigo-500/60 bg-indigo-950/50' : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-indigo-300' : 'text-slate-400'}`} />
                    <span className="min-w-0"><span className="block text-xs font-semibold text-white">{tab.label}</span><span className="block truncate text-[9px] text-slate-500">{tab.description}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid grid-cols-5 px-1.5 py-1.5">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} type="button" onClick={() => select(tab.id)} className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl text-[9.5px] font-medium ${isActive ? 'text-indigo-200' : 'text-slate-400'}`} aria-current={isActive ? 'page' : undefined}>
                <span className={`flex h-6 w-11 items-center justify-center rounded-full ${isActive ? 'border border-indigo-500/50 bg-indigo-600/40' : ''}`}><Icon className="h-4 w-4" /></span><span className="mt-0.5">{tab.label}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setShowMore((value) => !value)} className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl text-[9.5px] font-medium ${showMore || isSecondaryActive ? 'text-indigo-200' : 'text-slate-400'}`} aria-expanded={showMore}>
            <span className={`flex h-6 w-11 items-center justify-center rounded-full ${showMore || isSecondaryActive ? 'border border-indigo-500/50 bg-indigo-600/40' : ''}`}><MoreHorizontal className="h-4 w-4" /></span><span className="mt-0.5">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
