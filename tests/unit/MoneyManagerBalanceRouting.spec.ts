import { describe, it, expect, beforeEach } from 'vitest';
import { MoneyManagerPlugin } from '../../src/core/plugins/MoneyManagerPlugin';
import { PAIOSStorage } from '../../src/storage';
import { BudgetProfile, ExpenseTransaction, SavingsPot } from '../../src/types';

describe('Unit Test: MoneyManager Balance Routing & Net Worth Integrity', () => {
  let baseProfile: BudgetProfile;
  let mockPots: SavingsPot[];

  beforeEach(() => {
    baseProfile = {
      id: 'profile_test',
      monthlySalary: 5000,
      currency: '₹',
      salaryCycleDay: 1,
      currentBalance: 74,
      currentLiquidCash: 74,
      currentSaved: 500,
      currentEmergencySavings: 500,
      currentInvested: 1000,
      currentInvestedPortfolio: 1000,
      currentDebt: 600,
      currentTotalDebt: 600,
      debtInterestRate: 10,
      savingsInterestRate: 4,
      foodMonthly: 500,
      travelMonthly: 200,
      healthMonthly: 100,
      housingMonthly: 1000,
      loanClearanceMonthly: 200,
      learningMonthly: 100,
      investingMonthly: 200,
      savingsMonthly: 300,
      discretionaryMonthly: 500,
      expectedAnnualReturnRate: 10,
      updatedAtMillis: Date.now(),
    };

    mockPots = [
      {
        id: 'pot_pc',
        title: 'Building PC',
        targetAmount: 5000,
        currentAmount: 1500,
        categoryColor: 'cyan',
        iconName: 'Cpu',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pot_exam',
        title: 'ISTQB Exam',
        targetAmount: 3500,
        currentAmount: 3500,
        categoryColor: 'emerald',
        iconName: 'Award',
        isCompleted: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  });

  describe('1. Inflow Destination Routing', () => {
    it('logging ₹55 Inflow routed to Liquid Cash increases Liquid Checking from ₹74 to ₹129', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_inflow_1',
        title: 'Side Hustle Cash',
        amount: 55,
        type: 'INFLOW',
        category: 'DAILY_CASH',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: false,
        targetDestination: 'LIQUID_CASH',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      expect(result.updatedProfile.currentBalance).toBe(129);
      expect(result.updatedProfile.currentLiquidCash).toBe(129);
      expect(result.updatedProfile.currentSaved).toBe(500);
      expect(result.updatedProfile.currentInvested).toBe(1000);
      expect(result.updatedProfile.currentDebt).toBe(600);
    });

    it('logging Inflow routed to Emergency Savings increases Emergency Savings', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_inflow_2',
        title: 'Emergency Deposit',
        amount: 250,
        type: 'INFLOW',
        category: 'SAVINGS',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: false,
        targetDestination: 'EMERGENCY_SAVINGS',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      expect(result.updatedProfile.currentSaved).toBe(750);
      expect(result.updatedProfile.currentEmergencySavings).toBe(750);
      expect(result.updatedProfile.currentBalance).toBe(74);
    });

    it('logging Inflow routed to Invested Portfolio increases Invested Portfolio', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_inflow_3',
        title: 'Dividend Payout',
        amount: 300,
        type: 'INFLOW',
        category: 'DIVIDEND',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: false,
        targetDestination: 'INVESTED_PORTFOLIO',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      expect(result.updatedProfile.currentInvested).toBe(1300);
      expect(result.updatedProfile.currentInvestedPortfolio).toBe(1300);
      expect(result.updatedProfile.currentBalance).toBe(74);
    });

    it('logging Inflow routed to a Savings Pot deposits directly into pot without altering checking', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_inflow_4',
        title: 'Gift for PC Build',
        amount: 500,
        type: 'INFLOW',
        category: 'GIFT',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: false,
        targetDestination: 'SAVINGS_POT',
        targetPotId: 'pot_pc',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      expect(result.updatedProfile.currentBalance).toBe(74);
      const updatedPcPot = result.updatedPots.find((p) => p.id === 'pot_pc');
      expect(updatedPcPot?.currentAmount).toBe(2000);
    });
  });

  describe('2. Outflow Source Deduction & Debt Clearance', () => {
    it('logging ₹85 Outflow paid from Liquid Cash decreases Liquid Checking accordingly', () => {
      // Start with balance ₹129, deduct ₹85 -> ₹44
      const profileAt129: BudgetProfile = {
        ...baseProfile,
        currentBalance: 129,
        currentLiquidCash: 129,
      };

      const tx: ExpenseTransaction = {
        id: 'tx_outflow_1',
        title: 'Grocery Run',
        amount: 85,
        type: 'OUTFLOW',
        category: 'FOOD',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: true,
        fundingSource: 'LIQUID_CASH',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(profileAt129, tx, mockPots);

      expect(result.updatedProfile.currentBalance).toBe(44);
      expect(result.updatedProfile.currentLiquidCash).toBe(44);
    });

    it('paying an EMI decreases Outstanding Debt and deducts from Liquid Cash', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_emi_1',
        title: 'Personal Loan EMI',
        amount: 200,
        type: 'OUTFLOW',
        category: 'LOAN_EMI',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: true,
        fundingSource: 'DEBT_CLEARANCE',
      };

      const initialDebt = baseProfile.currentDebt || 600;
      const initialCash = baseProfile.currentBalance || 74;

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      expect(result.updatedProfile.currentDebt).toBe(initialDebt - 200);
      expect(result.updatedProfile.currentTotalDebt).toBe(initialDebt - 200);
      expect(result.updatedProfile.currentBalance).toBe(initialCash - 200);
    });

    it('logging Outflow paid from a Savings Pot deducts from that pot without double-deducting liquid cash', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_pot_outflow_1',
        title: 'PC GPU Purchase',
        amount: 500,
        type: 'OUTFLOW',
        category: 'SHOPPING',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: false,
        fundingSource: 'SAVINGS_POT',
        sourcePotId: 'pot_pc',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      // Checking balance remains untouched
      expect(result.updatedProfile.currentBalance).toBe(74);
      // Pot balance is deducted
      const updatedPcPot = result.updatedPots.find((p) => p.id === 'pot_pc');
      expect(updatedPcPot?.currentAmount).toBe(1000);
    });

    it('paying via Borrowed Debt / Credit Card increments Outstanding Debt instead of decreasing Liquid Cash', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_cc_1',
        title: 'Flight Tickets on Credit Card',
        amount: 350,
        type: 'OUTFLOW',
        category: 'TRAVEL',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: true,
        fundingSource: 'BORROW_DEBT',
      };

      const result = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);

      // Liquid cash remains untouched
      expect(result.updatedProfile.currentBalance).toBe(74);
      // Debt increments
      expect(result.updatedProfile.currentDebt).toBe(950);
      expect(result.updatedProfile.currentTotalDebt).toBe(950);
    });
  });

  describe('3. Pot Funding Isolation & Reversal', () => {
    it('supports reversible transaction balance adjustments upon deletion', () => {
      const tx: ExpenseTransaction = {
        id: 'tx_delete_test',
        title: 'Freelance Inflow',
        amount: 100,
        type: 'INFLOW',
        category: 'FREELANCE',
        dateString: '2026-09-06',
        timestampMillis: Date.now(),
        isNecessity: false,
        targetDestination: 'LIQUID_CASH',
      };

      // Apply
      const applied = MoneyManagerPlugin.applyTransactionBalanceRouting(baseProfile, tx, mockPots);
      expect(applied.updatedProfile.currentBalance).toBe(174);

      // Reverse
      const reversed = MoneyManagerPlugin.applyTransactionBalanceRouting(applied.updatedProfile, tx, applied.updatedPots, true);
      expect(reversed.updatedProfile.currentBalance).toBe(74);
    });

    it('withdrawing from a pot via PAIOSStorage restores funds to liquid checking and does NOT decrement emergency savings', () => {
      PAIOSStorage.saveBudgetProfile(baseProfile);
      PAIOSStorage.saveSavingsPot(mockPots[0]);

      const initialSaved = baseProfile.currentSaved || 500;
      const initialCash = baseProfile.currentBalance || 74;

      const { updatedPot } = PAIOSStorage.withdrawFromPot('pot_pc', 300, 'MEDICAL_EMERGENCY');

      expect(updatedPot.currentAmount).toBe(1200);

      const updatedProfile = PAIOSStorage.getBudgetProfile();
      // Liquid cash increased by 300
      expect(updatedProfile.currentBalance).toBe(initialCash + 300);
      // Emergency savings remains intact
      expect(updatedProfile.currentSaved).toBe(initialSaved);
    });
  });

  describe('4. Unified Balance Sheet & Net Worth Integrity', () => {
    it('calculates Net Worth using the unified formula (Liquid + Emergency + Invested + Pots) - Debt', () => {
      // Liquid: 74, Emergency: 500, Invested: 1000, Pots: (1500 + 3500 = 5000), Debt: 600
      // Expected Net Worth = (74 + 500 + 1000 + 5000) - 600 = 6574 - 600 = 5974
      const analysis = MoneyManagerPlugin.analyzeBudget(baseProfile, [], new Date(), mockPots);

      expect(analysis.totalAssets).toBe(74 + 500 + 1000 + 5000);
      expect(analysis.totalDebt).toBe(600);
      expect(analysis.netWorth).toBe(5974);
    });
  });
});
