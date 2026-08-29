// PAIOS Money Manager, Budget Analyzer & Preparer Plugin
import {
  BudgetProfile,
  ExpenseTransaction,
  DailySurplusRecord,
  BudgetAnalysisResult,
} from '../../types';
import { PreContextBroker } from '../broker/PreContextBroker';

export const DEFAULT_BUDGET_PROFILE: BudgetProfile = {
  id: 'default_budget_profile',
  monthlySalary: 5000,
  currency: '$',
  salaryCycleDay: 1,
  // Necessities & Fixed Obligations
  foodMonthly: 800,
  travelMonthly: 300,
  healthMonthly: 250,
  housingMonthly: 1400,
  loanClearanceMonthly: 400,
  // Growth & Planned Expenses
  learningMonthly: 200,
  investingMonthly: 650,
  savingsMonthly: 500,
  discretionaryMonthly: 500,
  expectedAnnualReturnRate: 10, // 10% expected return on investment
  updatedAtMillis: Date.now(),
};

export interface ProjectedGrowthPoint {
  month: number;
  label: string;
  regularSavings: number;
  boostedWithSurplus: number;
  compoundPortfolio: number;
}

export class MoneyManagerPlugin {
  /**
   * Calculates current salary cycle boundaries and days remaining
   */
  public static calculateCycleDates(
    salaryCycleDay: number = 1,
    targetDate: Date = new Date()
  ): {
    cycleStartDate: string;
    cycleEndDate: string;
    daysRemaining: number;
    totalDaysInCycle: number;
    currentDayInCycle: number;
  } {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed
    const day = targetDate.getDate();

    let cycleStart: Date;
    let cycleEnd: Date;

    const safeCycleDay = Math.max(1, Math.min(28, salaryCycleDay));

    if (day >= safeCycleDay) {
      // Current cycle began this month on safeCycleDay
      cycleStart = new Date(year, month, safeCycleDay, 0, 0, 0);
      if (safeCycleDay === 1) {
        const lastDay = new Date(year, month + 1, 0).getDate();
        cycleEnd = new Date(year, month, lastDay, 23, 59, 59);
      } else {
        cycleEnd = new Date(year, month + 1, safeCycleDay - 1, 23, 59, 59);
      }
    } else {
      // Current cycle began last month on safeCycleDay
      cycleStart = new Date(year, month - 1, safeCycleDay, 0, 0, 0);
      cycleEnd = new Date(year, month, safeCycleDay - 1, 23, 59, 59);
    }

    const formatDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    const oneDayMillis = 1000 * 60 * 60 * 24;
    const totalDaysInCycle = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / oneDayMillis));
    
    // Remaining days inclusive of today
    const daysRemaining = Math.max(1, Math.ceil((cycleEnd.getTime() - targetDate.getTime()) / oneDayMillis));
    const currentDayInCycle = Math.min(totalDaysInCycle, totalDaysInCycle - daysRemaining + 1);

    return {
      cycleStartDate: formatDateStr(cycleStart),
      cycleEndDate: formatDateStr(cycleEnd),
      daysRemaining,
      totalDaysInCycle,
      currentDayInCycle,
    };
  }

  /**
   * Evaluates and analyzes the complete budget health, limits, and ratios
   */
  public static analyzeBudget(
    profile: BudgetProfile,
    transactions: ExpenseTransaction[] = [],
    targetDate: Date = new Date()
  ): BudgetAnalysisResult {
    const cycle = this.calculateCycleDates(profile.salaryCycleDay, targetDate);

    // 1. Obligations & Fixed Necessities
    const totalFixedObligations =
      (profile.foodMonthly || 0) +
      (profile.travelMonthly || 0) +
      (profile.healthMonthly || 0) +
      (profile.housingMonthly || 0) +
      (profile.loanClearanceMonthly || 0);

    // 2. Growth & Planned Investments
    const totalPlannedInvestments =
      (profile.learningMonthly || 0) +
      (profile.investingMonthly || 0) +
      (profile.savingsMonthly || 0);

    // 3. Free-to-use discretionary capital
    const totalFreeMoney = Math.max(0, (profile.monthlySalary || 0) - (totalFixedObligations + totalPlannedInvestments));

    // 4. Daily & Weekly Safe-to-Spend
    const safeToSpendDaily = Math.round((totalFreeMoney / cycle.totalDaysInCycle) * 100) / 100;
    const safeToSpendWeekly = Math.round(safeToSpendDaily * 7 * 100) / 100;
    const idealDailySavings = Math.round((totalPlannedInvestments / cycle.totalDaysInCycle) * 100) / 100;

    // 5. 50/30/20 Rule Breakdown
    const salary = profile.monthlySalary || 1;
    const needsRatio = Math.round((totalFixedObligations / salary) * 100);
    const wantsRatio = Math.round((totalFreeMoney / salary) * 100);
    const savingsRatio = Math.round((totalPlannedInvestments / salary) * 100);

    // 6. Compute Budget Health Score (0-100)
    let score = 100;
    if (needsRatio > 50) score -= (needsRatio - 50) * 1.5;
    if (wantsRatio > 35) score -= (wantsRatio - 35) * 1.2;
    if (savingsRatio < 20) score -= (20 - savingsRatio) * 2;
    if (totalFixedObligations + totalPlannedInvestments > salary) score -= 40;
    const budgetHealthScore = Math.max(10, Math.min(100, Math.round(score)));

    // 7. Dynamic Recommendations
    const recommendations: string[] = [];
    if (needsRatio > 50) {
      recommendations.push(
        `Fixed obligations are ${needsRatio}% of your income. Look into trimming non-essential recurring subscriptions or housing/loan rates.`
      );
    }
    if (savingsRatio < 20) {
      recommendations.push(
        `Savings & investment allocation is currently ${savingsRatio}%. Aim for at least 20% to build an accelerated wealth buffer.`
      );
    } else {
      recommendations.push(
        `Great savings rate of ${savingsRatio}%! Your consistent daily investing compounding will yield significant long-term growth.`
      );
    }
    if (safeToSpendDaily > 0) {
      recommendations.push(
        `Safe daily spend limit is ${profile.currency}${safeToSpendDaily.toFixed(2)}. Any unspent amount at the end of the day can be swept to boost your investment vault!`
      );
    }

    return {
      totalFixedObligations,
      totalPlannedInvestments,
      totalFreeMoney,
      safeToSpendDaily,
      safeToSpendWeekly,
      idealDailySavings,
      daysRemainingInCycle: cycle.daysRemaining,
      cycleStartDate: cycle.cycleStartDate,
      cycleEndDate: cycle.cycleEndDate,
      budgetHealthScore,
      needsRatio,
      wantsRatio,
      savingsRatio,
      recommendations,
    };
  }

  /**
   * Calculates actual daily spending and leftover surplus for a given date
   */
  public static calculateDailySurplus(
    profile: BudgetProfile,
    transactions: ExpenseTransaction[],
    dateString: string // YYYY-MM-DD
  ): {
    dailyBudget: number;
    actualSpend: number;
    surplusAmount: number;
    isOverBudget: boolean;
  } {
    const analysis = this.analyzeBudget(profile, transactions, new Date(dateString));
    const dailyBudget = analysis.safeToSpendDaily;

    const dayTransactions = transactions.filter((t) => t.dateString === dateString);
    const actualSpend = dayTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const surplusAmount = Math.max(0, dailyBudget - actualSpend);
    const isOverBudget = actualSpend > dailyBudget;

    return {
      dailyBudget,
      actualSpend,
      surplusAmount: Math.round(surplusAmount * 100) / 100,
      isOverBudget,
    };
  }

  /**
   * Generates projected wealth growth curves with compound interest
   */
  public static calculateProjectedGrowth(
    profile: BudgetProfile,
    averageDailySurplus: number = 0,
    monthsHorizon: number = 36,
    annualReturnRatePercent: number = 10
  ): ProjectedGrowthPoint[] {
    const monthlyBaseSavings = (profile.investingMonthly || 0) + (profile.savingsMonthly || 0);
    const monthlySurplusBonus = averageDailySurplus * 30;
    const monthlyTotalSavings = monthlyBaseSavings + monthlySurplusBonus;

    const r = (annualReturnRatePercent || 10) / 100 / 12; // Monthly interest rate
    const points: ProjectedGrowthPoint[] = [];

    let currentCompoundValue = 0;

    for (let m = 1; m <= monthsHorizon; m++) {
      const regularSavings = Math.round(monthlyBaseSavings * m);
      const boostedWithSurplus = Math.round(monthlyTotalSavings * m);

      // Future value of periodic annuity: FV = P * [((1 + r)^n - 1) / r]
      if (r > 0) {
        currentCompoundValue = Math.round(monthlyTotalSavings * ((Math.pow(1 + r, m) - 1) / r));
      } else {
        currentCompoundValue = boostedWithSurplus;
      }

      let label = `Month ${m}`;
      if (m === 1) label = '1 Mo';
      else if (m === 3) label = '3 Mo';
      else if (m === 6) label = '6 Mo';
      else if (m === 12) label = '1 Year';
      else if (m === 24) label = '2 Years';
      else if (m === 36) label = '3 Years';
      else if (m === 60) label = '5 Years';

      // Keep key monthly intervals
      if (m <= 6 || m % 3 === 0 || m === monthsHorizon) {
        points.push({
          month: m,
          label,
          regularSavings,
          boostedWithSurplus,
          compoundPortfolio: currentCompoundValue,
        });
      }
    }

    return points;
  }

  /**
   * Computes moving spending averages (7d, 30d) and category distributions
   */
  public static calculateSpendingAverages(
    transactions: ExpenseTransaction[],
    daysWindow: number = 30
  ): {
    totalSpent: number;
    averageDailySpend: number;
    averageWeeklySpend: number;
    categoryBreakdown: Record<string, number>;
  } {
    const now = Date.now();
    const windowMillis = daysWindow * 24 * 60 * 60 * 1000;
    const filtered = transactions.filter((t) => now - t.timestampMillis <= windowMillis);

    const totalSpent = filtered.reduce((acc, t) => acc + (t.amount || 0), 0);
    const averageDailySpend = daysWindow > 0 ? Math.round((totalSpent / daysWindow) * 100) / 100 : 0;
    const averageWeeklySpend = Math.round(averageDailySpend * 7 * 100) / 100;

    const categoryBreakdown: Record<string, number> = {};
    filtered.forEach((t) => {
      const cat = t.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (t.amount || 0);
    });

    return {
      totalSpent,
      averageDailySpend,
      averageWeeklySpend,
      categoryBreakdown,
    };
  }

  /**
   * Stages active budget limits into PreContextBroker PIT for AI awareness
   */
  public static stageBudgetTelemetryToPIT(
    profile: BudgetProfile,
    analysis: BudgetAnalysisResult
  ): void {
    try {
      PreContextBroker.enqueuePIT({
        source_plugin_id: 'money_budget_plugin',
        priority: 'high',
        severity: 'info',
        payload: {
          action: 'BUDGET_TELEMETRY_UPDATE',
          currency: profile.currency,
          monthlySalary: profile.monthlySalary,
          safeToSpendDaily: analysis.safeToSpendDaily,
          safeToSpendWeekly: analysis.safeToSpendWeekly,
          totalFixedObligations: analysis.totalFixedObligations,
          budgetHealthScore: analysis.budgetHealthScore,
          daysRemainingInCycle: analysis.daysRemainingInCycle,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      console.warn('[MoneyManagerPlugin] PIT telemetry staging deferred:', e);
    }
  }
}
