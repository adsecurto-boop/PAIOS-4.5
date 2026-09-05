import React, { useState, useEffect } from 'react';
import { X, Target, Palette, Calendar, Star, GitFork, BookOpen } from 'lucide-react';
import { SavingsPot } from '../../types';
import { POT_ICONS } from './SavingsPotCard';
import { PAIOSStorage } from '../../storage';

export interface AddEditPotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pot: SavingsPot) => void;
  existingPot?: SavingsPot | null;
  currency: string;
  allPots?: SavingsPot[];
}

const COLOR_OPTIONS = [
  { id: 'cyan', label: 'Cyan Teal', bgClass: 'bg-cyan-500' },
  { id: 'emerald', label: 'Emerald Green', bgClass: 'bg-emerald-500' },
  { id: 'violet', label: 'Electric Violet', bgClass: 'bg-violet-500' },
  { id: 'amber', label: 'Warm Amber', bgClass: 'bg-amber-500' },
  { id: 'rose', label: 'Neon Rose', bgClass: 'bg-rose-500' },
  { id: 'sky', label: 'Sky Blue', bgClass: 'bg-sky-500' },
];

const AVAILABLE_ICONS = Object.keys(POT_ICONS);

export const AddEditPotModal: React.FC<AddEditPotModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingPot,
  currency,
  allPots,
}) => {
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [categoryColor, setCategoryColor] = useState('cyan');
  const [iconName, setIconName] = useState('Target');
  const [isPriorityJar, setIsPriorityJar] = useState(false);
  const [autoOverflowTargetId, setAutoOverflowTargetId] = useState('');
  const [linkedGoalId, setLinkedGoalId] = useState('');

  const potsList = allPots || (isOpen ? PAIOSStorage.getSavingsPots() : []);
  const otherPots = potsList.filter((p) => !existingPot || p.id !== existingPot.id);

  useEffect(() => {
    if (existingPot) {
      setTitle(existingPot.title);
      setTargetAmount(existingPot.targetAmount.toString());
      setTargetDate(existingPot.targetDate || '');
      setCategoryColor(existingPot.categoryColor || 'cyan');
      setIconName(existingPot.iconName || 'Target');
      setIsPriorityJar(!!existingPot.isPriorityJar);
      setAutoOverflowTargetId(existingPot.autoOverflowTargetId || '');
      setLinkedGoalId(existingPot.linkedGoalId || '');
    } else {
      setTitle('');
      setTargetAmount('');
      setTargetDate('');
      setCategoryColor('cyan');
      setIconName('Target');
      setIsPriorityJar(false);
      setAutoOverflowTargetId('');
      setLinkedGoalId('');
    }
  }, [existingPot, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numTarget = parseFloat(targetAmount);
    if (!title.trim() || isNaN(numTarget) || numTarget <= 0) return;

    const pot: SavingsPot = {
      id: existingPot ? existingPot.id : `pot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      targetAmount: numTarget,
      currentAmount: existingPot ? existingPot.currentAmount : 0,
      categoryColor,
      iconName,
      targetDate: targetDate.trim() ? targetDate.trim() : undefined,
      isCompleted: existingPot ? existingPot.currentAmount >= numTarget : false,
      isPriorityJar,
      autoOverflowTargetId: autoOverflowTargetId.trim() ? autoOverflowTargetId.trim() : undefined,
      linkedGoalId: linkedGoalId.trim() ? linkedGoalId.trim() : undefined,
      createdAt: existingPot ? existingPot.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(pot);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-cyan-400" />
            <span>{existingPot ? 'Edit Savings Pot' : 'Create New Target Pot'}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pot Title */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Pot Name / Purpose
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Building PC, ISTQB Exam, Bike Fund"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Target Amount & Target Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Target Amount ({currency})
              </label>
              <input
                type="number"
                required
                min="1"
                step="1"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="50000"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Target Date (Optional)</span>
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Color Palette Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5 text-slate-400" />
              <span>Water Fill Theme Color</span>
            </label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryColor(c.id)}
                  className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                    c.bgClass
                  } ${
                    categoryColor === c.id
                      ? 'ring-2 ring-white scale-110 shadow-lg'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Icon Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Choose Icon Metaphor
            </label>
            <div className="grid grid-cols-7 gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800">
              {AVAILABLE_ICONS.map((key) => {
                const IconC = POT_ICONS[key];
                const isSelected = iconName === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIconName(key)}
                    className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30 scale-105'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                    title={key}
                  >
                    <IconC className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Jar Toggle */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl ${
                  isPriorityJar
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Star className="w-4 h-4 fill-current" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Priority Savings Jar</p>
                <p className="text-[10px] text-slate-400">
                  End-of-day leftover sweep will fill this jar first before others.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPriorityJar}
                onChange={(e) => setIsPriorityJar(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Auto-Overflow Cascade Destination */}
          {otherPots.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5 text-indigo-400" />
                <span>Auto-Overflow Destination (When 100% Full)</span>
              </label>
              <select
                value={autoOverflowTargetId}
                onChange={(e) => setAutoOverflowTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">None (Stop at 100% target)</option>
                {otherPots.map((p) => (
                  <option key={p.id} value={p.id}>
                    Cascade to: {p.title} ({currency}{p.currentAmount.toLocaleString()} / {currency}{p.targetAmount.toLocaleString()})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Any surplus pouring past this jar's target will automatically spill into the selected destination jar.
              </p>
            </div>
          )}

          {/* Linked Career / Learning Goal */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Link to Career / Learning Goal (Optional)</span>
            </label>
            <input
              type="text"
              value={linkedGoalId}
              onChange={(e) => setLinkedGoalId(e.target.value)}
              placeholder="e.g., ISTQB Exam Prep, AWS Cloud Certification"
              list="goal-suggestions"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            />
            <datalist id="goal-suggestions">
              <option value="ISTQB Exam Prep" />
              <option value="AWS Solutions Architect" />
              <option value="Docker & Kubernetes Mastery" />
              <option value="Python Data Science Deep Dive" />
              <option value="Emergency Buffer" />
            </datalist>
            <p className="text-[10px] text-slate-500 mt-1">
              Cross-links readiness badges onto tasks and study roadmap milestones in LearnScreen and TasksScreen.
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/30"
            >
              {existingPot ? 'Update Pot' : 'Create Pot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
