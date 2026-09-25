import React from 'react';
import { Activity, BarChart3, BookOpen, Brain, CheckCircle2, History, Layers, Settings, Sparkles, Sun } from 'lucide-react';
import { NavTab } from '../types';

interface DesktopNavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const items = [
  { tab: NavTab.AI, label: 'Assistant', icon: Sparkles },
  { tab: NavTab.TODAY, label: 'Today', icon: Sun },
  { tab: NavTab.TIMELINE, label: 'Plan', icon: History },
  { tab: NavTab.TASKS, label: 'Tasks', icon: CheckCircle2 },
  { tab: NavTab.PLUGINS, label: 'Tools', icon: Layers },
  { tab: NavTab.HEALTH, label: 'Health', icon: Activity },
  { tab: NavTab.LEARN, label: 'Learn', icon: Brain },
  { tab: NavTab.INSIGHTS, label: 'Insights', icon: BarChart3 },
  { tab: NavTab.JOURNAL, label: 'Journal', icon: BookOpen },
  { tab: NavTab.SETTINGS, label: 'Settings', icon: Settings },
];

export const DesktopNavigation: React.FC<DesktopNavigationProps> = ({ activeTab, onSelectTab }) => (
  <nav className="hidden md:block border-b border-slate-800/80 bg-slate-950/80 px-4" aria-label="Primary navigation">
    <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto py-2">
      {items.map(({ tab, label, icon: Icon }) => {
        const selected = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelectTab(tab)}
            aria-current={selected ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${selected ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
