import React, { useState } from 'react';
import {
  TrendingUp,
  Sparkles,
  Calendar,
  Zap,
  Info,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  CreditCard,
  PiggyBank,
  CheckCircle2,
  AlertCircle,
  Percent,
} from 'lucide-react';
import { BudgetProfile } from '../../types';
import {
  MoneyManagerPlugin,
  ProjectedGrowthPoint,
  ProjectedDebtPoint,
  ProjectedInvestedPoint,
  ProjectedSavingsPoint,
} from '../../core/plugins/MoneyManagerPlugin';

interface ProjectedGrowthChartProps {
  profile: BudgetProfile;
  averageDailySurplus: number;
}

export const ProjectedGrowthChart: React.FC<ProjectedGrowthChartProps> = ({
  profile,
  averageDailySurplus = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'INVESTED' | 'DEBT_FREE' | 'SAVINGS'>('INVESTED');

  // Invested Timeline State
  const [investedHorizonMonths, setInvestedHorizonMonths] = useState<number>(60); // 5 years
  const [returnRate, setReturnRate] = useState<number>(profile.expectedAnnualReturnRate || 10);
  const [hoveredInvestedPoint, setHoveredInvestedPoint] = useState<ProjectedInvestedPoint | null>(null);

  // Debt-Free Timeline State
  const [extraDebtPayment, setExtraDebtPayment] = useState<number>(0);
  const [hoveredDebtPoint, setHoveredDebtPoint] = useState<ProjectedDebtPoint | null>(null);

  // Savings Timeline State
  const [savingsHorizonMonths, setSavingsHorizonMonths] = useState<number>(36); // 3 years
  const [savingsRate, setSavingsRate] = useState<number>(profile.savingsInterestRate || 4);
  const [hoveredSavingsPoint, setHoveredSavingsPoint] = useState<ProjectedSavingsPoint | null>(null);

  // Data calculations
  const investedPoints = MoneyManagerPlugin.calculateInvestedTimeline(
    profile,
    investedHorizonMonths,
    returnRate
  );

  const debtTimeline = MoneyManagerPlugin.calculateDebtFreeTimeline(profile, extraDebtPayment);

  const savingsPoints = MoneyManagerPlugin.calculateSavingsTimeline(
    profile,
    averageDailySurplus,
    savingsHorizonMonths,
    savingsRate
  );

  // SVG Chart Dimensions
  const svgWidth = 600;
  const svgHeight = 220;
  const padX = 50;
  const padY = 30;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;

  // Helper for coordinates
  const getCoords = (index: number, total: number, val: number, max: number) => {
    const safeMax = max > 0 ? max : 100;
    const x = padX + (index / Math.max(1, total - 1)) * chartW;
    const y = padY + chartH - (val / safeMax) * chartH;
    return { x, y };
  };

  // --- 1. INVESTED TIMELINE PATHS ---
  const maxInvestedVal = Math.max(...investedPoints.map((p) => p.totalInvestedValue), 100);
  const investedValCoords = investedPoints.map((p, idx) =>
    getCoords(idx, investedPoints.length, p.totalInvestedValue, maxInvestedVal)
  );
  const investedContribCoords = investedPoints.map((p, idx) =>
    getCoords(idx, investedPoints.length, p.contributions, maxInvestedVal)
  );

  const investedLinePath = investedValCoords.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );
  const investedAreaPath = `${investedLinePath} L ${investedValCoords[investedValCoords.length - 1].x} ${
    padY + chartH
  } L ${investedValCoords[0].x} ${padY + chartH} Z`;

  const contribLinePath = investedContribCoords.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const finalInvested = investedPoints[investedPoints.length - 1] || {
    startingBalance: 0,
    contributions: 0,
    interestEarned: 0,
    totalInvestedValue: 0,
  };

  // --- 2. DEBT TIMELINE PATHS ---
  const maxDebtVal = Math.max(...debtTimeline.points.map((p) => p.remainingPrincipal), profile.currentDebt || 100);
  const debtCoords = debtTimeline.points.map((p, idx) =>
    getCoords(idx, debtTimeline.points.length, p.remainingPrincipal, maxDebtVal)
  );
  const debtLinePath = debtCoords.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );
  const debtAreaPath = `${debtLinePath} L ${debtCoords[debtCoords.length - 1].x} ${padY + chartH} L ${
    debtCoords[0].x
  } ${padY + chartH} Z`;

  // --- 3. SAVINGS TIMELINE PATHS ---
  const maxSavingsVal = Math.max(
    ...savingsPoints.map((p) => Math.max(p.projectedSavingsTotal, p.emergencyTarget6Mo)),
    100
  );
  const savingsCoords = savingsPoints.map((p, idx) =>
    getCoords(idx, savingsPoints.length, p.projectedSavingsTotal, maxSavingsVal)
  );
  const savingsLinePath = savingsCoords.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );
  const savingsAreaPath = `${savingsLinePath} L ${savingsCoords[savingsCoords.length - 1].x} ${
    padY + chartH
  } L ${savingsCoords[0].x} ${padY + chartH} Z`;

  const finalSavings = savingsPoints[savingsPoints.length - 1] || {
    projectedSavingsTotal: 0,
    interestYieldEarned: 0,
    emergencyTarget3Mo: 0,
    emergencyTarget6Mo: 0,
  };

  return (
    <div className="bg-slate-950 p-5 rounded-3xl border border-indigo-500/30 space-y-5 shadow-2xl relative overflow-hidden">
      {/* Ambient Visual Backlight */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header & Multi-Graph Mode Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <span>Predictive Wealth & Financial Projections</span>
                <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full font-semibold">
                  3 Interactive Graphs
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Compound growth curves, debt payoff freedom dates, and emergency savings milestones
              </p>
            </div>
          </div>
        </div>

        {/* Tab Pills */}
        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-2xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('INVESTED')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'INVESTED'
                ? 'bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Invested Growth</span>
          </button>

          <button
            onClick={() => setActiveTab('DEBT_FREE')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'DEBT_FREE'
                ? 'bg-orange-600 text-white font-bold shadow-lg shadow-orange-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Debt-Free Date</span>
          </button>

          <button
            onClick={() => setActiveTab('SAVINGS')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'SAVINGS'
                ? 'bg-teal-600 text-white font-bold shadow-lg shadow-teal-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PiggyBank className="w-3.5 h-3.5" />
            <span>Savings Timeline</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. INVESTED COMPOUND TIMELINE GRAPH */}
      {/* ========================================================= */}
      {activeTab === 'INVESTED' && (
        <div className="space-y-4 animate-fade-in">
          {/* Horizon & Rate Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 font-mono">
              {[
                { label: '1 Year', months: 12 },
                { label: '3 Years', months: 36 },
                { label: '5 Years', months: 60 },
                { label: '10 Years', months: 120 },
              ].map((h) => (
                <button
                  key={h.label}
                  onClick={() => setInvestedHorizonMonths(h.months)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    investedHorizonMonths === h.months
                      ? 'bg-emerald-600 text-white font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono text-[11px]">Expected CAGR:</span>
              <select
                value={returnRate}
                onChange={(e) => setReturnRate(Number(e.target.value))}
                className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="6">6% p.a. (Conservative Bonds)</option>
                <option value="8">8% p.a. (Balanced Portfolio)</option>
                <option value="10">10% p.a. (Broad Market Index)</option>
                <option value="12">12% p.a. (Aggressive SIP Growth)</option>
                <option value="15">15% p.a. (High Alpha Stocks)</option>
              </select>
            </div>
          </div>

          {/* Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/90 p-3 rounded-2xl border border-emerald-500/30">
              <span className="text-[10px] font-mono text-slate-400 block">Total Portfolio Value</span>
              <strong className="text-lg font-extrabold text-emerald-400 font-mono">
                {profile.currency}{finalInvested.totalInvestedValue.toLocaleString()}
              </strong>
              <span className="text-[10px] text-emerald-500/80 block mt-0.5 font-mono">
                At {investedHorizonMonths / 12} years horizon
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 block">Total Principal Contributed</span>
              <strong className="text-base font-extrabold text-slate-200 font-mono">
                {profile.currency}{finalInvested.contributions.toLocaleString()}
              </strong>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                Starting {profile.currency}{(profile.currentInvested || 0).toLocaleString()} + {profile.currency}{profile.investingMonthly || 0}/mo
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-indigo-500/30">
              <span className="text-[10px] font-mono text-slate-400 block">Compound Interest Earned</span>
              <strong className="text-base font-extrabold text-indigo-300 font-mono">
                +{profile.currency}{finalInvested.interestEarned.toLocaleString()}
              </strong>
              <span className="text-[10px] text-indigo-400/80 block mt-0.5 font-mono">
                From {returnRate}% annual compounding
              </span>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48 overflow-visible">
              <defs>
                <linearGradient id="investedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padY + chartH * (1 - ratio);
                const val = Math.round(maxInvestedVal * ratio);
                return (
                  <g key={idx}>
                    <line x1={padX} y1={y} x2={svgWidth - padX} y2={y} stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                    <text x={padX - 8} y={y + 3} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="monospace">
                      {profile.currency}{val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                    </text>
                  </g>
                );
              })}

              {/* Principal Line */}
              <path d={contribLinePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4" />

              {/* Compound Area & Line */}
              <path d={investedAreaPath} fill="url(#investedGradient)" />
              <path d={investedLinePath} fill="none" stroke="#10b981" strokeWidth="3" />

              {/* Data Points */}
              {investedPoints.map((p, idx) => {
                const coords = getCoords(idx, investedPoints.length, p.totalInvestedValue, maxInvestedVal);
                const isHovered = hoveredInvestedPoint?.month === p.month;
                return (
                  <g
                    key={idx}
                    onMouseEnter={() => setHoveredInvestedPoint(p)}
                    onMouseLeave={() => setHoveredInvestedPoint(null)}
                    className="cursor-pointer"
                  >
                    <circle cx={coords.x} cy={coords.y} r={isHovered ? 6 : 4} fill={isHovered ? '#34d399' : '#10b981'} stroke="#0f172a" strokeWidth="2" />
                    <text x={coords.x} y={svgHeight - 10} fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">
                      {p.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredInvestedPoint && (
              <div className="absolute top-4 right-4 bg-slate-950/95 border border-emerald-500/50 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono space-y-1 animate-fade-in z-20">
                <div className="text-white font-bold flex items-center gap-1.5 border-b border-slate-800 pb-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{hoveredInvestedPoint.label} Milestone</span>
                </div>
                <div className="text-emerald-400">
                  Total Value: <strong>{profile.currency}{hoveredInvestedPoint.totalInvestedValue.toLocaleString()}</strong>
                </div>
                <div className="text-slate-300">
                  Principal: {profile.currency}{hoveredInvestedPoint.contributions.toLocaleString()}
                </div>
                <div className="text-indigo-400">
                  Interest Earned: +{profile.currency}{hoveredInvestedPoint.interestEarned.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. DEBT-FREE TIMELINE GRAPH */}
      {/* ========================================================= */}
      {activeTab === 'DEBT_FREE' && (
        <div className="space-y-4 animate-fade-in">
          {/* Debt Freedom Milestone Banner */}
          <div className="p-4 bg-gradient-to-r from-orange-950/80 via-slate-900 to-slate-950 border border-orange-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-orange-400 font-bold uppercase tracking-wider">
                  Target Debt-Free Date
                </span>
                <span className="px-2 py-0.5 bg-orange-900/60 text-orange-200 border border-orange-600/50 rounded-full text-[10px] font-mono">
                  {profile.debtInterestRate || 12}% p.a. interest
                </span>
              </div>
              <h4 className="text-xl font-extrabold text-white mt-0.5 flex items-center gap-2">
                <span>{debtTimeline.debtFreeDate}</span>
                <span className="text-xs font-mono text-emerald-400 font-normal">
                  ({debtTimeline.debtFreeMonths} months remaining)
                </span>
              </h4>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono text-slate-400 block">Total Interest on Debt</span>
              <strong className="text-base font-extrabold text-orange-300 font-mono">
                {profile.currency}{debtTimeline.totalInterestPaid.toLocaleString()}
              </strong>
            </div>
          </div>

          {/* Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 block">Current Debt Balance</span>
              <strong className="text-base font-extrabold text-rose-400 font-mono">
                {profile.currency}{(profile.currentDebt || 0).toLocaleString()}
              </strong>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                Outstanding Principal
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-orange-500/30">
              <span className="text-[10px] font-mono text-slate-400 block">Monthly Debt Clearance</span>
              <strong className="text-base font-extrabold text-orange-300 font-mono">
                {profile.currency}{(debtTimeline.monthlyPayment).toLocaleString()} / mo
              </strong>
              <span className="text-[10px] text-orange-400/80 block mt-0.5 font-mono">
                Principal + Interest EMI
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-emerald-500/30">
              <span className="text-[10px] font-mono text-slate-400 block">Total Cost of Debt</span>
              <strong className="text-base font-extrabold text-emerald-300 font-mono">
                {profile.currency}{debtTimeline.totalPaid.toLocaleString()}
              </strong>
              <span className="text-[10px] text-emerald-400/80 block mt-0.5 font-mono">
                Principal + Total Interest
              </span>
            </div>
          </div>

          {/* SVG Amortization Chart */}
          <div className="relative bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48 overflow-visible">
              <defs>
                <linearGradient id="debtGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padY + chartH * (1 - ratio);
                const val = Math.round(maxDebtVal * ratio);
                return (
                  <g key={idx}>
                    <line x1={padX} y1={y} x2={svgWidth - padX} y2={y} stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                    <text x={padX - 8} y={y + 3} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="monospace">
                      {profile.currency}{val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                    </text>
                  </g>
                );
              })}

              {/* Amortization Area & Line */}
              <path d={debtAreaPath} fill="url(#debtGradient)" />
              <path d={debtLinePath} fill="none" stroke="#f97316" strokeWidth="3" />

              {/* Data Points */}
              {debtTimeline.points.map((p, idx) => {
                const coords = getCoords(idx, debtTimeline.points.length, p.remainingPrincipal, maxDebtVal);
                const isHovered = hoveredDebtPoint?.month === p.month;
                return (
                  <g
                    key={idx}
                    onMouseEnter={() => setHoveredDebtPoint(p)}
                    onMouseLeave={() => setHoveredDebtPoint(null)}
                    className="cursor-pointer"
                  >
                    <circle cx={coords.x} cy={coords.y} r={isHovered ? 6 : 4} fill={isHovered ? '#fb923c' : '#f97316'} stroke="#0f172a" strokeWidth="2" />
                    <text x={coords.x} y={svgHeight - 10} fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">
                      {p.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredDebtPoint && (
              <div className="absolute top-4 right-4 bg-slate-950/95 border border-orange-500/50 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono space-y-1 animate-fade-in z-20">
                <div className="text-white font-bold flex items-center gap-1.5 border-b border-slate-800 pb-1">
                  <Calendar className="w-3.5 h-3.5 text-orange-400" />
                  <span>{hoveredDebtPoint.label}</span>
                </div>
                <div className="text-orange-300">
                  Remaining Debt: <strong>{profile.currency}{hoveredDebtPoint.remainingPrincipal.toLocaleString()}</strong>
                </div>
                <div className="text-slate-400">
                  Interest Paid so far: {profile.currency}{hoveredDebtPoint.cumulativeInterestPaid.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. CURRENT SAVED & PROJECTED SAVINGS GRAPH */}
      {/* ========================================================= */}
      {activeTab === 'SAVINGS' && (
        <div className="space-y-4 animate-fade-in">
          {/* Horizon & Savings Rate Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 font-mono">
              {[
                { label: '6 Months', months: 6 },
                { label: '1 Year', months: 12 },
                { label: '2 Years', months: 24 },
                { label: '3 Years', months: 36 },
              ].map((h) => (
                <button
                  key={h.label}
                  onClick={() => setSavingsHorizonMonths(h.months)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    savingsHorizonMonths === h.months
                      ? 'bg-teal-600 text-white font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono text-[11px]">Savings Yield:</span>
              <select
                value={savingsRate}
                onChange={(e) => setSavingsRate(Number(e.target.value))}
                className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-teal-300 focus:outline-none focus:border-teal-500"
              >
                <option value="3">3% p.a. (Standard Savings)</option>
                <option value="4">4% p.a. (High-Yield Savings / MMF)</option>
                <option value="6">6% p.a. (Fixed Deposits / T-Bills)</option>
                <option value="7.5">7.5% p.a. (Government Savings Bonds)</option>
              </select>
            </div>
          </div>

          {/* Metric Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-900/90 p-3 rounded-2xl border border-teal-500/30">
              <span className="text-[10px] font-mono text-slate-400 block">Projected Savings Balance</span>
              <strong className="text-lg font-extrabold text-teal-400 font-mono">
                {profile.currency}{finalSavings.projectedSavingsTotal.toLocaleString()}
              </strong>
              <span className="text-[10px] text-teal-500/80 block mt-0.5 font-mono">
                At {savingsHorizonMonths} months mark
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
              <span className="text-[10px] font-mono text-slate-400 block">3-Month Emergency Target</span>
              <strong className="text-base font-extrabold text-cyan-300 font-mono">
                {profile.currency}{finalSavings.emergencyTarget3Mo.toLocaleString()}
              </strong>
              <span className="text-[10px] text-cyan-400/80 block mt-0.5 font-mono">
                3x Monthly Fixed Obligations
              </span>
            </div>

            <div className="bg-slate-900/90 p-3 rounded-2xl border border-indigo-500/30">
              <span className="text-[10px] font-mono text-slate-400 block">Interest Yield Earned</span>
              <strong className="text-base font-extrabold text-indigo-300 font-mono">
                +{profile.currency}{finalSavings.interestYieldEarned.toLocaleString()}
              </strong>
              <span className="text-[10px] text-indigo-400/80 block mt-0.5 font-mono">
                At {savingsRate}% annual savings yield
              </span>
            </div>
          </div>

          {/* SVG Savings Growth Chart */}
          <div className="relative bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-48 overflow-visible">
              <defs>
                <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padY + chartH * (1 - ratio);
                const val = Math.round(maxSavingsVal * ratio);
                return (
                  <g key={idx}>
                    <line x1={padX} y1={y} x2={svgWidth - padX} y2={y} stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
                    <text x={padX - 8} y={y + 3} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="monospace">
                      {profile.currency}{val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                    </text>
                  </g>
                );
              })}

              {/* 3-Month Emergency Target Reference Line */}
              {finalSavings.emergencyTarget3Mo > 0 && (
                <line
                  x1={padX}
                  y1={padY + chartH - (finalSavings.emergencyTarget3Mo / maxSavingsVal) * chartH}
                  x2={svgWidth - padX}
                  y2={padY + chartH - (finalSavings.emergencyTarget3Mo / maxSavingsVal) * chartH}
                  stroke="#06b6d4"
                  strokeDasharray="4 4"
                  strokeWidth="1.5"
                />
              )}

              {/* Savings Area & Line */}
              <path d={savingsAreaPath} fill="url(#savingsGradient)" />
              <path d={savingsLinePath} fill="none" stroke="#14b8a6" strokeWidth="3" />

              {/* Data Points */}
              {savingsPoints.map((p, idx) => {
                const coords = getCoords(idx, savingsPoints.length, p.projectedSavingsTotal, maxSavingsVal);
                const isHovered = hoveredSavingsPoint?.month === p.month;
                return (
                  <g
                    key={idx}
                    onMouseEnter={() => setHoveredSavingsPoint(p)}
                    onMouseLeave={() => setHoveredSavingsPoint(null)}
                    className="cursor-pointer"
                  >
                    <circle cx={coords.x} cy={coords.y} r={isHovered ? 6 : 4} fill={isHovered ? '#2dd4bf' : '#14b8a6'} stroke="#0f172a" strokeWidth="2" />
                    <text x={coords.x} y={svgHeight - 10} fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="monospace">
                      {p.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            {hoveredSavingsPoint && (
              <div className="absolute top-4 right-4 bg-slate-950/95 border border-teal-500/50 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono space-y-1 animate-fade-in z-20">
                <div className="text-white font-bold flex items-center gap-1.5 border-b border-slate-800 pb-1">
                  <Calendar className="w-3.5 h-3.5 text-teal-400" />
                  <span>{hoveredSavingsPoint.label}</span>
                </div>
                <div className="text-teal-300">
                  Projected Savings: <strong>{profile.currency}{hoveredSavingsPoint.projectedSavingsTotal.toLocaleString()}</strong>
                </div>
                <div className="text-indigo-400">
                  Yield Earned: +{profile.currency}{hoveredSavingsPoint.interestYieldEarned.toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
