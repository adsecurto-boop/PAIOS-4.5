// PAIOS Money Manager, Budget Analyzer & Preparer Plugin
import {
  BudgetProfile,
  ExpenseTransaction,
  DailySurplusRecord,
  BudgetAnalysisResult,
  BudgetCategory,
  DailyNetSavings,
  PlannedVsActualTimeline,
  PlannedVsActualCategory,
  BudgetRecoveryState,
  VarianceStatus,
} from '../../types';
import { PreContextBroker } from '../broker/PreContextBroker';

export const DEFAULT_BUDGET_PROFILE: BudgetProfile = {
  id: 'default_budget_profile',
  monthlySalary: 5000,
  expectedVariableIncome: 0,
  variableIncomeStreams: [],
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
  appliedRecoveryAdjustment: 0,
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

    // Multi-stream Income
    const variableIncome =
      profile.expectedVariableIncome ||
      (profile.variableIncomeStreams || []).reduce((acc, v) => acc + (v.expectedMonthlyAmount || 0), 0);
    const totalIncome = (profile.monthlySalary || 0) + variableIncome;

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
    const totalFreeMoney = Math.max(0, totalIncome - (totalFixedObligations + totalPlannedInvestments));

    // 4. Daily & Weekly Safe-to-Spend
    const safeToSpendDaily = Math.round((totalFreeMoney / cycle.totalDaysInCycle) * 100) / 100;
    const safeToSpendWeekly = Math.round(safeToSpendDaily * 7 * 100) / 100;
    const idealDailySavings = Math.round((totalPlannedInvestments / cycle.totalDaysInCycle) * 100) / 100;

    // Recovery Quota adjustment
    const appliedDailyAdjustment = profile.appliedRecoveryAdjustment || 0;
    const effectiveDailyBudget = Math.max(0, Math.round((safeToSpendDaily - appliedDailyAdjustment) * 100) / 100);

    // 5. 50/30/20 Rule Breakdown
    const baseSalary = totalIncome > 0 ? totalIncome : 1;
    const needsRatio = Math.round((totalFixedObligations / baseSalary) * 100);
    const wantsRatio = Math.round((totalFreeMoney / baseSalary) * 100);
    const savingsRatio = Math.round((totalPlannedInvestments / baseSalary) * 100);

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
    if (totalFixedObligations + totalPlannedInvestments > totalIncome) score -= 40;
    if (totalDebt > totalIncome * 6) score -= 15;
    const budgetHealthScore = Math.max(10, Math.min(100, Math.round(score)));

    // 9. Dynamic Recommendations
    const recommendations: string[] = [];
    if (variableIncome > 0) {
      recommendations.push(
        `Multi-stream income active: ${profile.currency}${variableIncome.toLocaleString()}/mo variable income boosting free capital.`
      );
    }
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
    if (appliedDailyAdjustment > 0) {
      recommendations.push(
        `Automated Loss Recovery active: safe daily spend is reduced by ${profile.currency}${appliedDailyAdjustment.toFixed(2)}/day to absorb prior cycle overages.`
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
      appliedDailyAdjustment,
      effectiveDailyBudget,
      recommendations,
    };
  }

  /**
   * Computes daily dual Inflows, Outflows, and Net Savings for a given date
   */
  public static calculateDailyNetSavings(
    transactions: ExpenseTransaction[],
    dateString: string
  ): DailyNetSavings {
    const dayTransactions = transactions.filter((t) => t.dateString === dateString);

    let totalInflow = 0;
    let totalOutflow = 0;

    dayTransactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'INFLOW') {
        totalInflow += amt;
      } else {
        totalOutflow += amt;
      }
    });

    const netSaved = totalInflow - totalOutflow;

    return {
      dateString,
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      netSaved: Math.round(netSaved * 100) / 100,
      safeDailyBudget: 0,
      unspentAllowance: 0,
      totalSweptPotential: 0,
    };
  }

  /**
   * Calculates actual daily spending, dual inflow/outflow, and leftover surplus for a given date
   */
  public static calculateDailySurplus(
    profile: BudgetProfile,
    transactions: ExpenseTransaction[],
    dateString: string // YYYY-MM-DD
  ): {
    dailyBudget: number;
    effectiveDailyBudget: number;
    actualSpend: number;
    totalInflow: number;
    netSaved: number;
    unspentAllowance: number;
    surplusAmount: number;
    isOverBudget: boolean;
  } {
    const analysis = this.analyzeBudget(profile, transactions, new Date(dateString));
    const dailyBudget = analysis.safeToSpendDaily;
    const effectiveDailyBudget = analysis.effectiveDailyBudget || dailyBudget;

    const netMetrics = this.calculateDailyNetSavings(transactions, dateString);
    const actualSpend = netMetrics.totalOutflow;
    const totalInflow = netMetrics.totalInflow;
    const netSaved = netMetrics.netSaved;

    // Unspent daily allowance from discretionary safe budget
    const unspentAllowance = Math.max(0, effectiveDailyBudget - actualSpend);

    // End-of-day sweep = unspent allowance + positive ad-hoc net income
    const surplusAmount = unspentAllowance + (netSaved > 0 ? netSaved : 0);
    const isOverBudget = actualSpend > effectiveDailyBudget;

    return {
      dailyBudget,
      effectiveDailyBudget,
      actualSpend,
      totalInflow,
      netSaved,
      unspentAllowance: Math.round(unspentAllowance * 100) / 100,
      surplusAmount: Math.round(surplusAmount * 100) / 100,
      isOverBudget,
    };
  }

  /**
   * Generates RFC 4180 compliant CSV ledger export string entirely client-side
   */
  public static exportToCSV(
    transactions: ExpenseTransaction[],
    currency: string = '$'
  ): string {
    const sorted = [...transactions].sort((a, b) => a.timestampMillis - b.timestampMillis);

    const headers = [
      'Date',
      'Time',
      'Type',
      'Title',
      'Category',
      `Amount (${currency})`,
      `Net Running Balance (${currency})`,
      'Notes',
    ];

    let runningBalance = 0;
    const rows = sorted.map((t) => {
      const type = t.type === 'INFLOW' ? 'INFLOW' : 'OUTFLOW';
      const amount = Number(t.amount) || 0;
      if (type === 'INFLOW') {
        runningBalance += amount;
      } else {
        runningBalance -= amount;
      }

      const dateStr = t.dateString || '';
      const timeStr = t.timeString || (t.timestampMillis ? new Date(t.timestampMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
      const title = (t.title || '').replace(/"/g, '""');
      const category = (t.category || 'Other').replace(/"/g, '""');
      const notes = (t.notes || t.note || '').replace(/"/g, '""');

      return [
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"${type}"`,
        `"${title}"`,
        `"${category}"`,
        (type === 'INFLOW' ? amount : -amount).toFixed(2),
        runningBalance.toFixed(2),
        `"${notes}"`,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }

  /**
   * Generates Excel XML Spreadsheet 2003 (.xlsx / .xml) workbook entirely client-side without external network egress
   */
  public static exportToExcel(
    transactions: ExpenseTransaction[],
    profile: BudgetProfile,
    analysis: BudgetAnalysisResult
  ): string {
    const sorted = [...transactions].sort((a, b) => a.timestampMillis - b.timestampMillis);
    const currency = profile.currency || '$';

    let runningBalance = 0;
    const transactionRowsXml = sorted
      .map((t) => {
        const type = t.type === 'INFLOW' ? 'INFLOW' : 'OUTFLOW';
        const amount = Number(t.amount) || 0;
        if (type === 'INFLOW') {
          runningBalance += amount;
        } else {
          runningBalance -= amount;
        }

        const dateStr = t.dateString || '';
        const timeStr =
          t.timeString ||
          (t.timestampMillis
            ? new Date(t.timestampMillis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '');
        const title = (t.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const category = (t.category || 'Other').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const notes = (t.notes || t.note || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        return `
    <Row>
      <Cell><Data ss:Type="String">${dateStr}</Data></Cell>
      <Cell><Data ss:Type="String">${timeStr}</Data></Cell>
      <Cell><Data ss:Type="String">${type}</Data></Cell>
      <Cell><Data ss:Type="String">${title}</Data></Cell>
      <Cell><Data ss:Type="String">${category}</Data></Cell>
      <Cell><Data ss:Type="Number">${(type === 'INFLOW' ? amount : -amount).toFixed(2)}</Data></Cell>
      <Cell><Data ss:Type="Number">${runningBalance.toFixed(2)}</Data></Cell>
      <Cell><Data ss:Type="String">${notes}</Data></Cell>
    </Row>`;
      })
      .join('');

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F46E5" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SubHeader">
   <Font ss:Bold="1" ss:Color="#1E293B"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Overview &amp; Wealth Analytics">
  <Table>
   <Column ss:Width="200"/>
   <Column ss:Width="160"/>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">PAIOS Metric</Data></Cell>
    <Cell><Data ss:Type="String">Value (${currency})</Data></Cell>
   </Row>
   <Row><Cell><Data ss:Type="String">Monthly Base Salary</Data></Cell><Cell><Data ss:Type="Number">${profile.monthlySalary}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Expected Variable Income</Data></Cell><Cell><Data ss:Type="Number">${profile.expectedVariableIncome || 0}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Liquid Checking Balance</Data></Cell><Cell><Data ss:Type="Number">${profile.currentBalance || 0}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Emergency Savings Vault</Data></Cell><Cell><Data ss:Type="Number">${profile.currentSaved || 0}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Invested Portfolio</Data></Cell><Cell><Data ss:Type="Number">${profile.currentInvested || 0}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Outstanding Debt</Data></Cell><Cell><Data ss:Type="Number">${profile.currentDebt || 0}</Data></Cell></Row>
   <Row ss:StyleID="SubHeader"><Cell><Data ss:Type="String">Net Worth Position</Data></Cell><Cell><Data ss:Type="Number">${analysis.netWorth || 0}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Fixed Needs (50%)</Data></Cell><Cell><Data ss:Type="Number">${analysis.totalFixedObligations}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Discretionary Wants (30%)</Data></Cell><Cell><Data ss:Type="Number">${analysis.totalFreeMoney}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Investments &amp; Savings (20%)</Data></Cell><Cell><Data ss:Type="Number">${analysis.totalPlannedInvestments}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Safe-to-Spend Daily Cap</Data></Cell><Cell><Data ss:Type="Number">${analysis.safeToSpendDaily}</Data></Cell></Row>
   <Row><Cell><Data ss:Type="String">Budget Health Score</Data></Cell><Cell><Data ss:Type="Number">${analysis.budgetHealthScore}</Data></Cell></Row>
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Transaction Ledger">
  <Table>
   <Column ss:Width="100"/>
   <Column ss:Width="80"/>
   <Column ss:Width="90"/>
   <Column ss:Width="200"/>
   <Column ss:Width="130"/>
   <Column ss:Width="110"/>
   <Column ss:Width="130"/>
   <Column ss:Width="220"/>
   <Row ss:StyleID="Header">
    <Cell><Data ss:Type="String">Date</Data></Cell>
    <Cell><Data ss:Type="String">Time</Data></Cell>
    <Cell><Data ss:Type="String">Type</Data></Cell>
    <Cell><Data ss:Type="String">Title</Data></Cell>
    <Cell><Data ss:Type="String">Category</Data></Cell>
    <Cell><Data ss:Type="String">Amount (${currency})</Data></Cell>
    <Cell><Data ss:Type="String">Running Balance (${currency})</Data></Cell>
    <Cell><Data ss:Type="String">Notes</Data></Cell>
   </Row>
   ${transactionRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
  }

  /**
   * Dispatches client-side browser file download
   */
  public static downloadFile(content: string, filename: string, mimeType: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[MoneyManagerPlugin] Download failed:', e);
    }
  }

  /**
   * Calculates Planned vs Actual variance across Daily, Weekly, and Monthly timelines
   */
  public static calculatePlannedVsActual(
    profile: BudgetProfile,
    transactions: ExpenseTransaction[],
    targetDate: Date = new Date()
  ): PlannedVsActualTimeline {
    const analysis = this.analyzeBudget(profile, transactions, targetDate);
    const cycle = this.calculateCycleDates(profile.salaryCycleDay, targetDate);
    const formatDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    };

    const targetDateStr = formatDateStr(targetDate);

    // Filter transactions in the current cycle
    const cycleTransactions = transactions.filter((t) => {
      return t.dateString >= cycle.cycleStartDate && t.dateString <= cycle.cycleEndDate;
    });

    // 1. Daily Metrics
    const todayTransactions = transactions.filter((t) => t.dateString === targetDateStr && t.type !== 'INFLOW');
    const dailyActual = todayTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const dailySafeCap = analysis.effectiveDailyBudget || analysis.safeToSpendDaily;
    const dailyVariance = dailySafeCap - dailyActual;
    const dailyPercent = dailySafeCap > 0 ? (dailyActual / dailySafeCap) * 100 : 0;
    const dailyStatus: VarianceStatus =
      dailyPercent > 100 ? 'OVER_BUDGET' : dailyPercent >= 85 ? 'APPROACHING_LIMIT' : 'ON_TRACK';

    // 2. Weekly Metrics (Past 7 days discretionary outflows)
    const sevenDaysAgoDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - 7);
    const sevenDaysAgo = formatDateStr(sevenDaysAgoDate);
    const weeklyTransactions = transactions.filter(
      (t) => t.dateString >= sevenDaysAgo && t.dateString <= targetDateStr && t.type !== 'INFLOW'
    );
    const weeklyActual = weeklyTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const weeklyCap = analysis.safeToSpendWeekly;
    const weeklyVariance = weeklyCap - weeklyActual;
    const weeklyPercent = weeklyCap > 0 ? (weeklyActual / weeklyCap) * 100 : 0;
    const weeklyStatus: VarianceStatus =
      weeklyPercent > 100 ? 'OVER_BUDGET' : weeklyPercent >= 85 ? 'APPROACHING_LIMIT' : 'ON_TRACK';

    // 3. Monthly Category Breakdown
    const categoryAllocations: Record<string, { planned: number; isNeeds: boolean; isSavings: boolean }> = {
      Food: { planned: profile.foodMonthly || 0, isNeeds: true, isSavings: false },
      Travel: { planned: profile.travelMonthly || 0, isNeeds: true, isSavings: false },
      Health: { planned: profile.healthMonthly || 0, isNeeds: true, isSavings: false },
      Housing: { planned: profile.housingMonthly || 0, isNeeds: true, isSavings: false },
      FamilyContribution: { planned: profile.familyContributionMonthly || 0, isNeeds: true, isSavings: false },
      LoanClearance: { planned: profile.loanClearanceMonthly || 0, isNeeds: true, isSavings: false },
      Learning: { planned: profile.learningMonthly || 0, isNeeds: false, isSavings: true },
      Investing: { planned: profile.investingMonthly || 0, isNeeds: false, isSavings: true },
      Savings: { planned: profile.savingsMonthly || 0, isNeeds: false, isSavings: true },
      Entertainment: { planned: profile.discretionaryMonthly || 0, isNeeds: false, isSavings: false },
      Other: { planned: 100, isNeeds: false, isSavings: false },
    };

    const categoryActuals: Record<string, number> = {};
    let needsActual = 0;
    let wantsActual = 0;
    let savingsActual = 0;

    cycleTransactions.forEach((t) => {
      if (t.type === 'INFLOW') return;
      const cat = t.category || 'Other';
      categoryActuals[cat] = (categoryActuals[cat] || 0) + (t.amount || 0);

      const meta = categoryAllocations[cat];
      if (meta?.isNeeds) {
        needsActual += t.amount || 0;
      } else if (meta?.isSavings) {
        savingsActual += t.amount || 0;
      } else {
        wantsActual += t.amount || 0;
      }
    });

    const categoryResults: PlannedVsActualCategory[] = Object.keys(categoryAllocations).map((cat) => {
      const planned = categoryAllocations[cat].planned;
      const actual = categoryActuals[cat] || 0;
      const variance = planned - actual;
      const percentUsed = planned > 0 ? Math.round((actual / planned) * 100) : actual > 0 ? 100 : 0;
      const status: VarianceStatus =
        percentUsed > 100 ? 'OVER_BUDGET' : percentUsed >= 85 ? 'APPROACHING_LIMIT' : 'ON_TRACK';

      return {
        category: cat,
        planned,
        actual: Math.round(actual * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        percentUsed,
        status,
      };
    });

    return {
      daily: {
        safeCap: Math.round(dailySafeCap * 100) / 100,
        actualSpent: Math.round(dailyActual * 100) / 100,
        variance: Math.round(dailyVariance * 100) / 100,
        status: dailyStatus,
      },
      weekly: {
        rollingCap: Math.round(weeklyCap * 100) / 100,
        actualSpent: Math.round(weeklyActual * 100) / 100,
        variance: Math.round(weeklyVariance * 100) / 100,
        status: weeklyStatus,
      },
      monthly: {
        needsPlanned: analysis.totalFixedObligations,
        needsActual: Math.round(needsActual * 100) / 100,
        wantsPlanned: analysis.totalFreeMoney,
        wantsActual: Math.round(wantsActual * 100) / 100,
        savingsPlanned: analysis.totalPlannedInvestments,
        savingsActual: Math.round(savingsActual * 100) / 100,
        categories: categoryResults,
      },
    };
  }

  /**
   * Evaluates over-budget breaches and calculates automated recovery adjustments
   */
  public static evaluateLossRecovery(
    profile: BudgetProfile,
    transactions: ExpenseTransaction[],
    targetDate: Date = new Date(),
    existingRecovery?: BudgetRecoveryState
  ): BudgetRecoveryState {
    const cycle = this.calculateCycleDates(profile.salaryCycleDay, targetDate);
    const timeline = this.calculatePlannedVsActual(profile, transactions, targetDate);

    // Check for category breaches
    const breachedCategories = timeline.monthly.categories.filter((c) => c.variance < 0);
    const totalCategoryOverage = breachedCategories.reduce((acc, c) => acc + Math.abs(c.variance), 0);

    // Check for daily breach
    const dailyBreach = timeline.daily.variance < 0 ? Math.abs(timeline.daily.variance) : 0;
    const overageAmount = Math.max(totalCategoryOverage, dailyBreach);

    const activeBreach = overageAmount > 0;
    const daysRemaining = Math.max(1, cycle.daysRemaining);
    const dailyReductionQuota = activeBreach
      ? Math.round((overageAmount / daysRemaining) * 100) / 100
      : 0;

    // Suggest dynamic trade-offs
    let tradeOffSuggestion = '';
    if (activeBreach) {
      const topBreached = breachedCategories[0]?.category || 'Daily Discretionary';
      const unspentEntertainment = Math.max(0, (profile.discretionaryMonthly || 0) - (timeline.monthly.categories.find(c => c.category === 'Entertainment')?.actual || 0));

      if (unspentEntertainment >= overageAmount) {
        tradeOffSuggestion = `Reallocate ${profile.currency}${overageAmount.toFixed(2)} from unspent Entertainment allowance to cover ${topBreached} overage without reducing daily budget.`;
      } else {
        tradeOffSuggestion = `Reduce daily safe-to-spend limit by ${profile.currency}${dailyReductionQuota.toFixed(2)}/day across the remaining ${daysRemaining} days to preserve end-of-month balance.`;
      }
    }

    return {
      activeBreach,
      overageAmount: Math.round(overageAmount * 100) / 100,
      breachedCategory: breachedCategories[0]?.category as string || undefined,
      daysRemaining,
      dailyReductionQuota,
      appliedDailyAdjustment: profile.appliedRecoveryAdjustment || existingRecovery?.appliedDailyAdjustment || 0,
      tradeOffSuggestion,
      shiftedSurplusHistory: existingRecovery?.shiftedSurplusHistory || [],
      status: existingRecovery?.status || (activeBreach ? 'IDLE' : 'RESOLVED'),
      updatedAtMillis: Date.now(),
    };
  }

  /**
   * Applies the calculated daily reduction adjustment to the active profile
   */
  public static applyRecoveryAdjustment(
    profile: BudgetProfile,
    recovery: BudgetRecoveryState
  ): {
    updatedProfile: BudgetProfile;
    updatedRecovery: BudgetRecoveryState;
  } {
    const adjustment = recovery.dailyReductionQuota;
    const updatedProfile: BudgetProfile = {
      ...profile,
      appliedRecoveryAdjustment: adjustment,
      updatedAtMillis: Date.now(),
    };

    const updatedRecovery: BudgetRecoveryState = {
      ...recovery,
      appliedDailyAdjustment: adjustment,
      status: 'ADJUSTED',
      updatedAtMillis: Date.now(),
    };

    return { updatedProfile, updatedRecovery };
  }

  /**
   * Shifts surplus from one category to another to absorb overages
   */
  public static shiftCategorySurplus(
    profile: BudgetProfile,
    fromCategory: BudgetCategory,
    toCategory: BudgetCategory,
    amount: number
  ): BudgetProfile {
    const shiftAmt = Math.max(0, amount);
    const updated = { ...profile };

    const getProp = (cat: BudgetCategory): keyof BudgetProfile => {
      switch (cat) {
        case 'Food': return 'foodMonthly';
        case 'Travel': return 'travelMonthly';
        case 'Health': return 'healthMonthly';
        case 'Housing': return 'housingMonthly';
        case 'FamilyContribution': return 'familyContributionMonthly';
        case 'LoanClearance': return 'loanClearanceMonthly';
        case 'Learning': return 'learningMonthly';
        case 'Investing': return 'investingMonthly';
        case 'Savings': return 'savingsMonthly';
        case 'Entertainment': return 'discretionaryMonthly';
        default: return 'discretionaryMonthly';
      }
    };

    const fromKey = getProp(fromCategory);
    const toKey = getProp(toCategory);

    const currentFrom = Number(updated[fromKey]) || 0;
    const currentTo = Number(updated[toKey]) || 0;

    (updated as any)[fromKey] = Math.max(0, currentFrom - shiftAmt);
    (updated as any)[toKey] = currentTo + shiftAmt;
    updated.updatedAtMillis = Date.now();

    return updated;
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
    const filtered = transactions.filter((t) => now - t.timestampMillis <= windowMillis && t.type !== 'INFLOW');

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
          expectedVariableIncome: profile.expectedVariableIncome,
          currentBalance: profile.currentBalance,
          currentSaved: profile.currentSaved,
          currentInvested: profile.currentInvested,
          currentDebt: profile.currentDebt,
          familyContributionMonthly: profile.familyContributionMonthly,
          netWorth: analysis.netWorth,
          safeToSpendDaily: analysis.safeToSpendDaily,
          effectiveDailyBudget: analysis.effectiveDailyBudget,
          safeToSpendWeekly: analysis.safeToSpendWeekly,
          totalFixedObligations: analysis.totalFixedObligations,
          budgetHealthScore: analysis.budgetHealthScore,
          daysRemainingInCycle: analysis.daysRemainingInCycle,
          appliedDailyAdjustment: analysis.appliedDailyAdjustment,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      console.warn('[MoneyManagerPlugin] PIT telemetry staging deferred:', e);
    }
  }
}
