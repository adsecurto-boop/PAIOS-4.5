import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu,
  Award,
  Bike,
  TrendingUp,
  Sparkles,
  Laptop,
  Plane,
  Heart,
  Shield,
  Coins,
  Target,
  Car,
  GraduationCap,
  Gift,
  Plus,
  ArrowUpRight,
  Edit3,
  Trash2,
  MoreVertical,
  CheckCircle2,
  Calendar,
  Star,
  CornerDownRight,
} from 'lucide-react';
import { SavingsPot } from '../../types';
import { MoneyManagerPlugin } from '../../core/plugins/MoneyManagerPlugin';

// Map icon names to Lucide icon components
export const POT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Cpu,
  Award,
  Bike,
  TrendingUp,
  Sparkles,
  Laptop,
  Plane,
  Heart,
  Shield,
  Coins,
  Target,
  Car,
  GraduationCap,
  Gift,
};

export interface SavingsPotCardProps {
  pot: SavingsPot;
  currency: string;
  onAddMoney: (pot: SavingsPot) => void;
  onWithdraw: (pot: SavingsPot) => void;
  onEdit: (pot: SavingsPot) => void;
  onDelete: (potId: string) => void;
  onNavigateToLinkedGoal?: (goalId: string) => void;
}

export const SavingsPotCard: React.FC<SavingsPotCardProps> = ({
  pot,
  currency,
  onAddMoney,
  onWithdraw,
  onEdit,
  onDelete,
  onNavigateToLinkedGoal,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const { fillPercentage, remainingAmount, isCompleted } =
    MoneyManagerPlugin.calculatePotProgress(pot.currentAmount, pot.targetAmount);

  const { milestones, currentTier } = MoneyManagerPlugin.getPotMilestones(
    pot.currentAmount,
    pot.targetAmount
  );

  const IconComponent = POT_ICONS[pot.iconName] || Target;

  // Theming definitions with dynamic warmth shift based on liquid milestone tier
  const getColorStyles = (color: string, tier: 0 | 25 | 50 | 75 | 100) => {
    let liquidGradient = 'from-cyan-400 via-teal-400 to-blue-500';
    let waveHex = '#06b6d4';

    switch (color) {
      case 'emerald':
        liquidGradient =
          tier === 100
            ? 'from-amber-400 via-emerald-400 to-teal-500'
            : tier >= 75
            ? 'from-emerald-400 via-teal-400 to-emerald-600'
            : 'from-emerald-500 via-teal-500 to-emerald-600';
        waveHex = tier === 100 ? '#f59e0b' : '#10b981';
        return {
          glow: 'from-emerald-500/30 to-teal-600/10 border-emerald-500/40',
          liquid: liquidGradient,
          wave: waveHex,
          accent: 'text-emerald-400',
          badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          button: 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-600/30',
        };
      case 'violet':
        liquidGradient =
          tier === 100
            ? 'from-amber-400 via-violet-400 to-purple-600'
            : tier >= 75
            ? 'from-violet-400 via-fuchsia-500 to-indigo-600'
            : 'from-violet-500 via-purple-500 to-indigo-600';
        waveHex = tier === 100 ? '#f59e0b' : '#8b5cf6';
        return {
          glow: 'from-violet-500/30 to-purple-600/10 border-violet-500/40',
          liquid: liquidGradient,
          wave: waveHex,
          accent: 'text-violet-400',
          badge: 'bg-violet-950/80 text-violet-300 border-violet-800',
          button: 'bg-gradient-to-r from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-violet-600/30',
        };
      case 'amber':
        liquidGradient =
          tier === 100
            ? 'from-yellow-300 via-amber-400 to-emerald-500'
            : tier >= 75
            ? 'from-amber-400 via-orange-400 to-red-500'
            : 'from-amber-500 via-yellow-500 to-orange-500';
        waveHex = tier === 100 ? '#10b981' : '#f59e0b';
        return {
          glow: 'from-amber-500/30 to-orange-600/10 border-amber-500/40',
          liquid: liquidGradient,
          wave: waveHex,
          accent: 'text-amber-400',
          badge: 'bg-amber-950/80 text-amber-300 border-amber-800',
          button: 'bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 shadow-amber-600/30',
        };
      case 'rose':
        liquidGradient =
          tier === 100
            ? 'from-amber-400 via-rose-400 to-pink-600'
            : tier >= 75
            ? 'from-rose-400 via-red-500 to-pink-500'
            : 'from-rose-500 via-pink-500 to-red-500';
        waveHex = tier === 100 ? '#f59e0b' : '#f43f5e';
        return {
          glow: 'from-rose-500/30 to-pink-600/10 border-rose-500/40',
          liquid: liquidGradient,
          wave: waveHex,
          accent: 'text-rose-400',
          badge: 'bg-rose-950/80 text-rose-300 border-rose-800',
          button: 'bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 shadow-rose-600/30',
        };
      case 'sky':
        liquidGradient =
          tier === 100
            ? 'from-emerald-400 via-sky-400 to-blue-500'
            : tier >= 75
            ? 'from-sky-300 via-cyan-400 to-blue-600'
            : 'from-sky-400 via-blue-500 to-cyan-500';
        waveHex = tier === 100 ? '#10b981' : '#38bdf8';
        return {
          glow: 'from-sky-500/30 to-blue-600/10 border-sky-500/40',
          liquid: liquidGradient,
          wave: waveHex,
          accent: 'text-sky-400',
          badge: 'bg-sky-950/80 text-sky-300 border-sky-800',
          button: 'bg-gradient-to-r from-sky-600 to-blue-500 hover:from-sky-500 hover:to-blue-400 shadow-sky-600/30',
        };
      case 'cyan':
      default:
        liquidGradient =
          tier === 100
            ? 'from-amber-400 via-emerald-400 to-cyan-500'
            : tier >= 75
            ? 'from-cyan-300 via-teal-400 to-blue-500'
            : 'from-cyan-400 via-teal-400 to-blue-500';
        waveHex = tier === 100 ? '#f59e0b' : '#06b6d4';
        return {
          glow: 'from-cyan-500/30 to-blue-600/10 border-cyan-500/40',
          liquid: liquidGradient,
          wave: waveHex,
          accent: 'text-cyan-400',
          badge: 'bg-cyan-950/80 text-cyan-300 border-cyan-800',
          button: 'bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 shadow-cyan-600/30',
        };
    }
  };

  const styles = getColorStyles(pot.categoryColor, currentTier);

  return (
    <div
      className={`relative bg-slate-900/90 rounded-3xl p-5 border transition-all duration-300 flex flex-col justify-between shadow-xl ${
        isCompleted
          ? 'border-amber-400/80 ring-2 ring-amber-400/40 shadow-[0_0_30px_rgba(245,158,11,0.25)]'
          : pot.isPriorityJar
          ? 'border-amber-500/60 ring-1 ring-amber-500/30'
          : styles.glow
      }`}
    >
      {/* Priority Jar Banner */}
      {pot.isPriorityJar && (
        <div className="absolute -top-3 left-4 z-20 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md shadow-amber-500/30">
          <Star className="w-3 h-3 fill-slate-950" />
          <span>Priority Jar</span>
        </div>
      )}

      {/* Celebration Banner for Completed Pot */}
      {isCompleted && (
        <div className="absolute -top-3 right-4 z-20 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg shadow-amber-500/40 animate-bounce">
          <Sparkles className="w-3 h-3" />
          <span>Goal Achieved! 🚀</span>
        </div>
      )}

      {/* Card Header: Icon, Title & Action Menu */}
      <div className="flex items-start justify-between gap-3 mb-2 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-2.5 rounded-2xl bg-slate-950 border border-slate-800 ${styles.accent} shrink-0 shadow-inner`}
          >
            <IconComponent className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading font-bold text-sm text-white truncate">
              {pot.title}
            </h4>

            {/* Target Date or Deadline */}
            {pot.targetDate ? (
              <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>Target: {pot.targetDate}</span>
              </div>
            ) : (
              <span className="text-[10px] text-slate-500 font-mono">No deadline</span>
            )}
          </div>
        </div>

        {/* Options Menu Button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Pot actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                className="absolute right-0 mt-1 w-44 rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl py-1 z-30 font-semibold text-xs"
              >
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onEdit(pot);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-900 flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Edit Pot &amp; Settings</span>
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onWithdraw(pot);
                  }}
                  disabled={pot.currentAmount <= 0}
                  className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-900 disabled:opacity-40 flex items-center gap-2"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                  <span>Break Jar / Withdraw</span>
                </button>
                <div className="border-t border-slate-800/80 my-1" />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(pot.id);
                  }}
                  className="w-full px-3 py-1.5 text-left text-rose-400 hover:bg-rose-950/40 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Pot</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Linked Goal or Overflow Tag Strip */}
      {(pot.linkedGoalId || pot.autoOverflowTargetId) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {pot.linkedGoalId && (
            <button
              type="button"
              onClick={() => onNavigateToLinkedGoal && onNavigateToLinkedGoal(pot.linkedGoalId!)}
              className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800/70 hover:bg-indigo-900 flex items-center gap-1 transition-colors truncate max-w-full"
            >
              <Target className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
              <span className="truncate">Goal: {pot.linkedGoalId}</span>
            </button>
          )}

          {pot.autoOverflowTargetId && (
            <span className="text-[9px] font-mono text-slate-400 flex items-center gap-1">
              <CornerDownRight className="w-2.5 h-2.5 text-cyan-400" />
              <span>Overflows on 100%</span>
            </span>
          )}
        </div>
      )}

      {/* Centerpiece: Animated Glass Jar / Cylinder Container */}
      <div className="relative h-44 w-full rounded-2xl overflow-hidden bg-slate-950/90 border border-slate-700/60 shadow-inner flex flex-col justify-end p-2 my-1">
        {/* Glass Jar Measurement Ticks with Milestone Status */}
        <div className="absolute inset-y-2 right-2.5 flex flex-col justify-between items-end pointer-events-none z-10 text-[9px] font-mono select-none">
          {milestones.slice().reverse().map((m) => (
            <span
              key={m.pct}
              className={`flex items-center gap-1 transition-colors ${
                m.reached ? 'text-amber-400 font-bold' : 'text-slate-500/80'
              }`}
            >
              {m.pct}%
              <span
                className={`w-2 h-px inline-block ${
                  m.reached ? 'bg-amber-400' : 'bg-slate-700/60'
                }`}
              />
            </span>
          ))}
        </div>

        {/* Gloss highlight / Reflection line across jar */}
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-10 rounded-t-2xl" />
        <div className="absolute left-1.5 inset-y-2 w-1.5 bg-white/5 rounded-full pointer-events-none z-10" />

        {/* Dynamic Fluid Liquid Fill Container */}
        <motion.div
          className={`relative w-full rounded-b-xl overflow-hidden bg-gradient-to-t ${styles.liquid}`}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(4, fillPercentage)}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          {/* Animated Water Surface Waves */}
          <div className="absolute -top-3 inset-x-0 h-4 overflow-hidden pointer-events-none">
            <motion.div
              className="flex w-[200%]"
              animate={{ x: ['0%', '-50%'] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
            >
              <svg
                viewBox="0 0 500 20"
                preserveAspectRatio="none"
                className="w-1/2 h-4 opacity-70"
                style={{ fill: styles.wave }}
              >
                <path d="M0,10 C150,20 350,0 500,10 L500,20 L0,20 Z" />
              </svg>
              <svg
                viewBox="0 0 500 20"
                preserveAspectRatio="none"
                className="w-1/2 h-4 opacity-70"
                style={{ fill: styles.wave }}
              >
                <path d="M0,10 C150,20 350,0 500,10 L500,20 L0,20 Z" />
              </svg>
            </motion.div>
          </div>

          {/* Bubble particle effects floating up within water */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-60">
            {[20, 45, 70, 85].map((leftPct, i) => (
              <motion.span
                key={i}
                className="absolute bottom-0 w-1.5 h-1.5 rounded-full bg-white/50"
                style={{ left: `${leftPct}%` }}
                animate={{
                  y: [0, -120],
                  opacity: [0, 0.9, 0],
                  scale: [0.6, 1.2],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.2 + i * 0.6,
                  delay: i * 0.5,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Overlay Current Amount & Progress Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 text-center px-2">
          <div className="bg-slate-950/75 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-slate-800/80 shadow-lg">
            <div className="text-lg font-extrabold font-mono text-white tracking-tight">
              {currency}{pot.currentAmount.toLocaleString()}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              of {currency}{pot.targetAmount.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Milestone Badges & Progress Stats Strip */}
      <div className="space-y-1.5 mt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            {isCompleted ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Target className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{isCompleted ? 'Goal Completed' : `${currency}${remainingAmount.toLocaleString()} to go`}</span>
          </span>
          <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${styles.badge}`}>
            {fillPercentage}%
          </span>
        </div>

        {/* Small fill bar with milestone ticks */}
        <div className="relative w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800/60">
          <div
            className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${styles.liquid}`}
            style={{ width: `${fillPercentage}%` }}
          />
        </div>

        {/* Milestone Threshold Indicator Strip */}
        <div className="flex items-center justify-between px-0.5 text-[9px] font-mono text-slate-500">
          {milestones.map((m) => (
            <span
              key={m.pct}
              className={`transition-colors flex items-center gap-0.5 ${
                m.reached ? 'text-amber-400 font-bold' : ''
              }`}
            >
              {m.reached && <Sparkles className="w-2 h-2 text-amber-400" />}
              {m.pct}%
            </span>
          ))}
        </div>
      </div>

      {/* Quick Action Button */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center gap-2">
        <button
          onClick={() => onAddMoney(pot)}
          className={`w-full py-2 px-3 rounded-xl text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-1.5 ${styles.button}`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Money</span>
        </button>
      </div>
    </div>
  );
};
