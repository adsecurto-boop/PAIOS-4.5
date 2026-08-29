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
} from 'lucide-react';
import { BudgetProfile } from '../../types';
import { MoneyManagerPlugin, ProjectedGrowthPoint } from '../../core/plugins/MoneyManagerPlugin';

interface ProjectedGrowthChartProps {
  profile: BudgetProfile;
  averageDailySurplus: number;
}

export const ProjectedGrowthChart: React.FC<ProjectedGrowthChartProps> = ({
  profile,
  averageDailySurplus = 0,
}) => {
  const [horizonMonths, setHorizonMonths] = useState<number>(36); // Default 3 years
  const [returnRate, setReturnRate] = useState<number>(profile.expectedAnnualReturnRate || 10);
  const [hoveredPoint, setHoveredPoint] = useState<ProjectedGrowthPoint | null>(null);

  const points = MoneyManagerPlugin.calculateProjectedGrowth(
    profile,
    averageDailySurplus,
    horizonMonths,
    returnRate
  );

  const maxVal = Math.max(...points.map((p) => p.compoundPortfolio), 100);

  // SVG Chart ViewBox Dimensions
  const svgWidth = 600;
  const svgHeight = 220;
  const padX = 45;
  const padY = 30;
  const chartW = svgWidth - padX * 2;
  const chartH = svgHeight - padY * 2;

  const getCoordinates = (p: ProjectedGrowthPoint, index: number, total: number, val: number) => {
    const x = padX + (index / Math.max(1, total - 1)) * chartW;
    const y = padY + chartH - (val / maxVal) * chartH;
    return { x, y };
  };

  // Generate SVG Path for Compound Line & Area
  const compoundPoints = points.map((p, idx) => getCoordinates(p, idx, points.length, p.compoundPortfolio));
  const regularPoints = points.map((p, idx) => getCoordinates(p, idx, points.length, p.regularSavings));

  const compoundLinePath = compoundPoints.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const compoundAreaPath = `${compoundLinePath} L ${compoundPoints[compoundPoints.length - 1].x} ${
    padY + chartH
  } L ${compoundPoints[0].x} ${padY + chartH} Z`;

  const regularLinePath = regularPoints.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const finalPoint = points[points.length - 1] || {
    regularSavings: 0,
    boostedWithSurplus: 0,
    compoundPortfolio: 0,
  };

  const extraFromSweep = Math.max(0, finalPoint.boostedWithSurplus - finalPoint.regularSavings);
  const compoundInterestGains = Math.max(0, finalPoint.compoundPortfolio - finalPoint.boostedWithSurplus);

  return (
    <div className="bg-slate-950 p-5 rounded-2xl border border-indigo-500/30 space-y-4 shadow-xl relative overflow-hidden">
      {/* Header & Horizon Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                <span>Projected Wealth & Savings Growth</span>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                  <Sparkles className="w-3 h-3 text-amber-300" /> Compound Engine
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Visualizing growth from baseline savings, daily leftover sweeps, and {returnRate}% p.a. returns
              </p>
            </div>
          </div>
        </div>

        {/* Horizon Pills */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          {[
            { label: '30D', months: 1 },
            { label: '90D', months: 3 },
            { label: '1Y', months: 12 },
            { label: '3Y', months: 36 },
            { label: '5Y', months: 60 },
          ].map((h) => (
            <button
              key={h.label}
              onClick={() => setHorizonMonths(h.months)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                horizonMonths === h.months
                  ? 'bg-emerald-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Metric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-emerald-500/30">
          <span className="text-[10px] font-mono text-slate-400 block">Projected Portfolio</span>
          <strong className="text-base font-extrabold text-emerald-400 font-mono">
            {profile.currency}{finalPoint.compoundPortfolio.toLocaleString()}
          </strong>
          <span className="text-[10px] text-emerald-500/80 block mt-0.5 font-mono">
            At {horizonMonths} months mark
          </span>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-cyan-500/30">
          <span className="text-[10px] font-mono text-slate-400 block">Daily Sweeps Boost</span>
          <strong className="text-base font-extrabold text-cyan-300 font-mono">
            +{profile.currency}{extraFromSweep.toLocaleString()}
          </strong>
          <span className="text-[10px] text-cyan-400/80 block mt-0.5 font-mono">
            From daily unspent savings
          </span>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-indigo-500/30">
          <span className="text-[10px] font-mono text-slate-400 block">Compounded Interest Gains</span>
          <strong className="text-base font-extrabold text-indigo-300 font-mono">
            +{profile.currency}{compoundInterestGains.toLocaleString()}
          </strong>
          <span className="text-[10px] text-indigo-400/80 block mt-0.5 font-mono">
            At {returnRate}% annual rate
          </span>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-48 overflow-visible"
        >
          <defs>
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = padY + chartH * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={idx}>
                <line
                  x1={padX}
                  y1={y}
                  x2={svgWidth - padX}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padX - 8}
                  y={y + 3}
                  fill="#64748b"
                  fontSize="9"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {profile.currency}{val >= 1000 ? `${Math.round(val / 1000)}k` : val}
                </text>
              </g>
            );
          })}

          {/* Baseline Regular Savings Line */}
          <path
            d={regularLinePath}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeDasharray="4 4"
          />

          {/* Compound Growth Area */}
          <path d={compoundAreaPath} fill="url(#emeraldGradient)" />

          {/* Compound Growth Main Line */}
          <path
            d={compoundLinePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
          />

          {/* Interactive Data Points */}
          {points.map((p, idx) => {
            const coords = getCoordinates(p, idx, points.length, p.compoundPortfolio);
            const isHovered = hoveredPoint?.month === p.month;
            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? '#34d399' : '#10b981'}
                  stroke="#0f172a"
                  strokeWidth="2"
                />
                {/* Month label along bottom */}
                <text
                  x={coords.x}
                  y={svgHeight - 10}
                  fill="#94a3b8"
                  fontSize="9"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div className="absolute top-4 right-4 bg-slate-950/95 border border-emerald-500/50 p-2.5 rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono space-y-1 animate-fade-in z-20">
            <div className="text-white font-bold flex items-center gap-1.5 border-b border-slate-800 pb-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>{hoveredPoint.label} Milestone</span>
            </div>
            <div className="text-emerald-400">
              Compound Portfolio: <strong>{profile.currency}{hoveredPoint.compoundPortfolio.toLocaleString()}</strong>
            </div>
            <div className="text-cyan-300">
              Boosted Savings: {profile.currency}{hoveredPoint.boostedWithSurplus.toLocaleString()}
            </div>
            <div className="text-slate-400">
              Base Savings: {profile.currency}{hoveredPoint.regularSavings.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Legend & Rate Adjustment Slider */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-1 border-t border-slate-800/80">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
            <span className="w-3 h-1 bg-emerald-400 rounded-full" />
            <span>Compounded Portfolio ({returnRate}%)</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-indigo-400">
            <span className="w-3 h-1 bg-indigo-500 rounded-full" />
            <span>Baseline Savings</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono">Assumed Annual Return:</span>
          <select
            value={returnRate}
            onChange={(e) => setReturnRate(Number(e.target.value))}
            className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="6">6% (Conservative Debt/Bonds)</option>
            <option value="8">8% (Balanced Index)</option>
            <option value="10">10% (Broad Market Equities)</option>
            <option value="12">12% (Aggressive SIP Equities)</option>
            <option value="15">15% (High Alpha Growth)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
