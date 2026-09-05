import React, { useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Pill } from 'lucide-react';
import { DoseEvent, DoseStatus, Medication, RefillInventory } from '../../types';
import { DoseLedgerEngine } from '../../core/health/DoseLedgerEngine';

export interface MedicationScheduleCardProps {
  dose: DoseEvent;
  medication?: Medication;
  refill?: RefillInventory;
  onLogDose: (doseId: string, status: DoseStatus, note?: string) => void;
  doctorName?: string;
  currentTime?: Date;
}

export const MedicationScheduleCard: React.FC<MedicationScheduleCardProps> = ({
  dose,
  medication,
  refill,
  onLogDose,
  doctorName,
  currentTime,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const slotState = DoseLedgerEngine.getDoseSlotActionState(dose, refill, currentTime);

  const handleAction = async (status: DoseStatus) => {
    if (isProcessing) return;
    if (slotState.isCompleted || slotState.isSkipped) return;
    if (status === 'TAKEN' && slotState.isOutOfSupply) return;

    try {
      setIsProcessing(true);
      await onLogDose(dose.id, status);
    } finally {
      setIsProcessing(false);
    }
  };

  const getCardBorderClass = () => {
    if (slotState.isCompleted) return 'bg-emerald-950/20 border-emerald-800/50 shadow-emerald-950/20';
    if (slotState.isSkipped) return 'bg-amber-950/20 border-amber-800/50';
    if (slotState.isLockedFuture) return 'bg-slate-900/50 border-slate-800/70 opacity-90';
    return 'bg-slate-900/80 border-slate-800 hover:border-slate-700 shadow-md';
  };

  return (
    <div className={`border rounded-2xl p-4 transition-all space-y-3 ${getCardBorderClass()}`}>
      {/* Header with Scheduled Time and Drug Info */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 text-xs font-mono rounded-lg font-bold flex items-center gap-1 ${
                slotState.isCompleted
                  ? 'bg-emerald-900/60 text-emerald-300'
                  : slotState.isLockedFuture
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-slate-800 text-emerald-300'
              }`}
            >
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{dose.scheduledTime}</span>
            </span>

            <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
              <Pill className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>{dose.medicationName}</span>
            </h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {medication?.instructions || 'Take as prescribed by physician.'}
          </p>
        </div>

        {/* Status Pill */}
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 flex items-center gap-1 ${
            dose.status === 'TAKEN'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
              : dose.status === 'TAKEN_LATE'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold'
              : dose.status === 'SKIPPED'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
              : slotState.isLockedFuture
              ? 'bg-slate-800/80 text-slate-400 border border-slate-700/50'
              : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
          }`}
        >
          {dose.status === 'TAKEN' && <CheckCircle2 className="w-3 h-3" />}
          {dose.status === 'TAKEN_LATE' && <CheckCircle2 className="w-3 h-3" />}
          {dose.status === 'SKIPPED' && <XCircle className="w-3 h-3" />}
          {dose.status === 'SCHEDULED' && slotState.isLockedFuture && <Clock className="w-3 h-3" />}
          <span>
            {dose.status === 'SCHEDULED' && slotState.isLockedFuture
              ? 'WINDOW LOCKED'
              : dose.status}
          </span>
        </span>
      </div>

      {/* Out of Supply Alert Banner */}
      {slotState.isOutOfSupply && !slotState.isCompleted && !slotState.isSkipped && (
        <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-semibold">Refill Required - 0 supply left in vault</span>
        </div>
      )}

      {/* Metadata Indicators: Prescribing Doctor & Refill Supply */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
        <span className="text-slate-300 truncate">
          Doctor: {medication?.prescribingDoctor || doctorName || 'Primary Care'}
        </span>
        {refill && (
          <span
            className={`font-mono ${
              refill.quantityRemaining <= 0
                ? 'text-rose-400 font-bold'
                : refill.quantityRemaining <= 7
                ? 'text-amber-400 font-bold'
                : 'text-slate-400'
            }`}
          >
            Supply: {refill.quantityRemaining} {refill.unit} left
          </span>
        )}
      </div>

      {/* Action Container: Locked vs. Time-Window vs. Interactive */}
      <div className="pt-1">
        {slotState.isCompleted ? (
          <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-400 font-medium text-xs sm:text-sm">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {dose.status === 'TAKEN_LATE' ? 'Taken Late' : 'Taken'} at{' '}
                {slotState.actualTakenFormatted || DoseLedgerEngine.formatDoseTime(dose.actualTakenTimeMillis)}
              </span>
            </span>
            <span className="text-xs text-slate-400 font-normal shrink-0">Recorded for today</span>
          </div>
        ) : slotState.isSkipped ? (
          <div className="flex items-center justify-between px-4 py-2.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-400 font-medium text-xs sm:text-sm">
            <span className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Skipped</span>
            </span>
            <span className="text-xs text-slate-400 font-normal shrink-0">Recorded for today</span>
          </div>
        ) : slotState.isLockedFuture ? (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-slate-400 text-xs sm:text-sm">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              Scheduled for {slotState.targetTime} (Window opens at {slotState.windowStartTime})
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              disabled={isProcessing || slotState.isOutOfSupply}
              onClick={() => handleAction('TAKEN')}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Take Dose</span>
            </button>

            <button
              disabled={isProcessing}
              onClick={() => handleAction('SKIPPED')}
              className="py-2 px-3 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Skip</span>
            </button>

            <button
              disabled={isProcessing || slotState.isOutOfSupply}
              onClick={() => handleAction('TAKEN_LATE')}
              className="py-2 px-3 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl"
            >
              Taken Late
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
