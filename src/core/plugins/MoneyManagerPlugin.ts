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
  // Balance Sheet & Wealth Base
  currentBalance: 3500,
  currentSaved: 8000,
  currentDebt: 12000,
  debtInterestRate: 12, // 12% p.a. debt rate
  currentInvested: 15000,
  savingsInterestRate: 4, // 4% p.a. savings yield
  // Necessities & Fixed Obligations
  foodMonthly: 800,
  travelMonthly: 300,
  healthMonthly: 250,
  housingMonthly: 1400,
  loanClearanceMonthly: 400,
  familyContributionMonthly: 400, // Family support / parents contribution
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

export interface ProjectedDebtPoint {
  month: number;
  label: string;
  remainingPrincipal: number;
  cumulativeInterestPaid: number;
  monthlyPayment: number;
}

export interface ProjectedInvestedPoint {
  month: number;
  label: string;
  startingBalance: number;
  contributions: number;
  interestEarned: number;
  totalInvestedValue: number;
}

export interface ProjectedSavingsPoint {
  month: number;
  label: string;
  emergencyTarget3Mo: number;
  emergencyTarget6Mo: number;
  projectedSavingsTotal: number;
  interestYieldEarned: number;
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

    // 1. Obligations & Fixed Necessities (including Family Contribution)
    const totalFixedObligations =
      (profile.foodMonthly || 0) +
      (profile.travelMonthly || 0) +
      (profile.healthMonthly || 0) +
      (profile.housingMonthly || 0) +
      (profile.loanClearanceMonthly || 0) +
      (profile.familyContributionMonthly || 0);

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

    // 6. Net Worth & Balance Sheet Metrics
    const totalAssets =
      (profile.currentBalance || 0) +
      (profile.currentSaved || 0) +
      (profile.currentInvested || 0);
    const totalDebt = profile.currentDebt || 0;
    const netWorth = totalAssets - totalDebt;

    // 7. Debt Payoff Timeline quick estimation
    const debtCalc = this.calculateDebtFreeTimeline(profile);
    const debtFreeMonths = debtCalc.debtFreeMonths;

    // 8. Compute Budget Health Score (0-100)
    let score = 100;
    if (needsRatio > 50) score -= (needsRatio - 50) * 1.5;
    if (wantsRatio > 35) score -= (wantsRatio - 35) * 1.2;
    if (savingsRatio < 20) score -= (20 - savingsRatio) * 2;
    if (totalFixedObligations + totalPlannedInvestments > salary) score -= 40;
    if (totalDebt > salary * 6) score -= 15;
    const budgetHealthScore = Math.max(10, Math.min(100, Math.round(score)));

    // 9. Dynamic Recommendations
    const recommendations: string[] = [];
    if (needsRatio > 50) {
      recommendations.push(
        `Fixed obligations are ${needsRatio}% of your income (including ${profile.currency}${profile.familyContributionMonthly || 0} family support). Look into optimizing discretionary spending or fixed bills.`
      );
    }
    if (totalDebt > 0 && debtCalc.isPayoffPossible) {
      recommendations.push(
        `At current monthly debt clearance of ${profile.currency}${profile.loanClearanceMonthly}/mo, you will be 100% DEBT-FREE in ${debtFreeMonths} months (${debtCalc.debtFreeDate}).`
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
      netWorth,
      totalAssets,
      totalDebt,
      debtFreeMonths,
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
   * Generates projected wealth growth curves with compound interest (Legacy + Full Support)
   */
  public static calculateProjectedGrowth(
    profile: BudgetProfile,
    averageDailySurplus: number = 0,
    monthsHorizon: number = 36,
    annualReturnRatePercent: number = 10
  ): ProjectedGrowthPoint[] {
    const initialInvested = profile.currentInvested || 0;
    const monthlyBaseSavings = (profile.investingMonthly || 0) + (profile.savingsMonthly || 0);
    const monthlySurplusBonus = averageDailySurplus * 30;
    const monthlyTotalSavings = monthlyBaseSavings + monthlySurplusBonus;

    const r = (annualReturnRatePercent || 10) / 100 / 12; // Monthly interest rate
    const points: ProjectedGrowthPoint[] = [];

    let currentCompoundValue = initialInvested;

    for (let m = 1; m <= monthsHorizon; m++) {
      const regularSavings = Math.round(initialInvested + monthlyBaseSavings * m);
      const boostedWithSurplus = Math.round(initialInvested + monthlyTotalSavings * m);

      // Month-by-month compounding with monthly additions
      if (r > 0) {
        currentCompoundValue = Math.round((currentCompoundValue + monthlyTotalSavings) * (1 + r));
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
   * Generates exact debt-free amortization timeline with interest calculation
   */
  public static calculateDebtFreeTimeline(
    profile: BudgetProfile,
    extraMonthlyPayment: number = 0,
    maxMonths: number = 240
  ): {
    debtFreeMonths: number;
    debtFreeDate: string;
    totalInterestPaid: number;
    totalPaid: number;
    monthlyPayment: number;
    isPayoffPossible: boolean;
    points: ProjectedDebtPoint[];
  } {
    let balance = Math.max(0, profile.currentDebt || 0);
    const annualRate = Math.max(0, profile.debtInterestRate || 12);
    const monthlyRate = annualRate / 100 / 12;
    const payment = Math.max(0, (profile.loanClearanceMonthly || 0) + extraMonthlyPayment);

    const points: ProjectedDebtPoint[] = [];
    points.push({
      month: 0,
      label: 'Now',
      remainingPrincipal: Math.round(balance),
      cumulativeInterestPaid: 0,
      monthlyPayment: payment,
    });

    if (balance === 0) {
      return {
        debtFreeMonths: 0,
        debtFreeDate: 'Already Debt Free',
        totalInterestPaid: 0,
        totalPaid: 0,
        monthlyPayment: payment,
        isPayoffPossible: true,
        points,
      };
    }

    let cumulativeInterest = 0;
    let months = 0;
    let isPossible = true;

    // Minimum monthly interest
    const initialInterest = balance * monthlyRate;
    if (payment <= initialInterest && monthlyRate > 0) {
      isPossible = false;
    }

    while (balance > 0 && months < maxMonths && isPossible) {
      months++;
      const monthlyInterest = balance * monthlyRate;
      cumulativeInterest += monthlyInterest;
      const principalPaid = Math.min(balance, payment - monthlyInterest);
      balance = Math.max(0, balance - principalPaid);

      if (months <= 6 || months % 3 === 0 || balance === 0 || months === maxMonths) {
        let label = `Month ${months}`;
        if (months === 1) label = '1 Mo';
        else if (months === 6) label = '6 Mo';
        else if (months === 12) label = '1 Yr';
        else if (months === 24) label = '2 Yrs';
        else if (months === 36) label = '3 Yrs';
        else if (months === 60) label = '5 Yrs';

        points.push({
          month: months,
          label,
          remainingPrincipal: Math.round(balance),
          cumulativeInterestPaid: Math.round(cumulativeInterest),
          monthlyPayment: payment,
        });
      }
    }

    const today = new Date();
    const targetPayoffDate = new Date(today.getFullYear(), today.getMonth() + months, 1);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const debtFreeDate = `${monthNames[targetPayoffDate.getMonth()]} ${targetPayoffDate.getFullYear()}`;

    return {
      debtFreeMonths: months,
      debtFreeDate,
      totalInterestPaid: Math.round(cumulativeInterest),
      totalPaid: Math.round((profile.currentDebt || 0) + cumulativeInterest),
      monthlyPayment: payment,
      isPayoffPossible: isPossible,
      points,
    };
  }

  /**
   * Generates detailed investment portfolio growth timeline with starting invested balance & CAGR
   */
  public static calculateInvestedTimeline(
    profile: BudgetProfile,
    horizonMonths: number = 60,
    annualReturnRatePercent: number = 10
  ): ProjectedInvestedPoint[] {
    const startingBalance = Math.max(0, profile.currentInvested || 0);
    const monthlyContribution = Math.max(0, profile.investingMonthly || 0);
    const r = Math.max(0, annualReturnRatePercent) / 100 / 12;

    const points: ProjectedInvestedPoint[] = [];
    let portfolioValue = startingBalance;
    let totalContributed = startingBalance;

    points.push({
      month: 0,
      label: 'Now',
      startingBalance,
      contributions: totalContributed,
      interestEarned: 0,
      totalInvestedValue: Math.round(portfolioValue),
    });

    for (let m = 1; m <= horizonMonths; m++) {
      totalContributed += monthlyContribution;
      portfolioValue = (portfolioValue + monthlyContribution) * (1 + r);
      const interestEarned = Math.max(0, portfolioValue - totalContributed);

      if (m <= 6 || m % 6 === 0 || m === horizonMonths) {
        let label = `Mo ${m}`;
        if (m === 12) label = '1 Year';
        else if (m === 24) label = '2 Years';
        else if (m === 36) label = '3 Years';
        else if (m === 60) label = '5 Years';
        else if (m === 120) label = '10 Years';

        points.push({
          month: m,
          label,
          startingBalance,
          contributions: Math.round(totalContributed),
          interestEarned: Math.round(interestEarned),
          totalInvestedValue: Math.round(portfolioValue),
        });
      }
    }

    return points;
  }

  /**
   * Generates savings & emergency buffer timeline over time with yield rates & milestones
   */
  public static calculateSavingsTimeline(
    profile: BudgetProfile,
    averageDailySurplus: number = 0,
    horizonMonths: number = 36,
    annualSavingsRatePercent: number = 4
  ): ProjectedSavingsPoint[] {
    const startingSavings = Math.max(0, profile.currentSaved || 0);
    const monthlySavingsBase = Math.max(0, profile.savingsMonthly || 0);
    const monthlySurplusSweep = Math.max(0, averageDailySurplus * 30);
    const monthlyTotalSavings = monthlySavingsBase + monthlySurplusSweep;
    const r = Math.max(0, annualSavingsRatePercent) / 100 / 12;

    // Monthly fixed obligations for emergency targets
    const monthlyNeeds =
      (profile.foodMonthly || 0) +
      (profile.travelMonthly || 0) +
      (profile.healthMonthly || 0) +
      (profile.housingMonthly || 0) +
      (profile.loanClearanceMonthly || 0) +
      (profile.familyContributionMonthly || 0);

    const target3Mo = monthlyNeeds * 3;
    const target6Mo = monthlyNeeds * 6;

    const points: ProjectedSavingsPoint[] = [];
    let currentSavings = startingSavings;
    let cumulativeYield = 0;

    points.push({
      month: 0,
      label: 'Now',
      emergencyTarget3Mo: target3Mo,
      emergencyTarget6Mo: target6Mo,
      projectedSavingsTotal: Math.round(currentSavings),
      interestYieldEarned: 0,
    });

    for (let m = 1; m <= horizonMonths; m++) {
      const monthYield = currentSavings * r;
      cumulativeYield += monthYield;
      currentSavings = currentSavings + monthlyTotalSavings + monthYield;

      if (m <= 6 || m % 3 === 0 || m === horizonMonths) {
        let label = `Mo ${m}`;
        if (m === 6) label = '6 Mo';
        else if (m === 12) label = '1 Year';
        else if (m === 24) label = '2 Years';
        else if (m === 36) label = '3 Years';

        points.push({
          month: m,
          label,
          emergencyTarget3Mo: target3Mo,
          emergencyTarget6Mo: target6Mo,
          projectedSavingsTotal: Math.round(currentSavings),
          interestYieldEarned: Math.round(cumulativeYield),
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
          currentBalance: profile.currentBalance,
          currentSaved: profile.currentSaved,
          currentInvested: profile.currentInvested,
          currentDebt: profile.currentDebt,
          familyContributionMonthly: profile.familyContributionMonthly,
          netWorth: analysis.netWorth,
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
