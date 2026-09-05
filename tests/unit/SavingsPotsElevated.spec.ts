/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoneyManagerPlugin } from '../../src/core/plugins/MoneyManagerPlugin';
import { PAIOSStorage } from '../../src/storage';
import { paiosDb } from '../../src/core/db';
import { SavingsPot, PotAllocationRecord, WithdrawalReasonCategory } from '../../src/types';

describe('Unit & ATDD Test: Elevated Target Savings Pots System', () => {
  beforeEach(async () => {
    localStorage.clear();
    await paiosDb.savingsPots.clear();
    await paiosDb.potAllocations.clear();
  });

  describe('1. Overflow & Priority Rules Engine', () => {
    it('cascades surplus funds cleanly to the overflow target pot when deposit exceeds capacity', () => {
      const primaryPot: SavingsPot = {
        id: 'pot_istqb',
        title: 'ISTQB Certification',
        targetAmount: 3500,
        currentAmount: 3000, // 500 remaining capacity
        categoryColor: 'violet',
        iconName: 'Award',
        isCompleted: false,
        isPriorityJar: true,
        autoOverflowTargetId: 'pot_bike',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const overflowTargetPot: SavingsPot = {
        id: 'pot_bike',
        title: 'Bike Fund',
        targetAmount: 15000,
        currentAmount: 2000,
        categoryColor: 'cyan',
        iconName: 'Bike',
        isCompleted: false,
        isPriorityJar: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const pots = [primaryPot, overflowTargetPot];
      const depositAmount = 800; // Exceeds 500 capacity by 300

      const result = MoneyManagerPlugin.cascadeOverflowAllocation(pots, 'pot_istqb', depositAmount);

      expect(result.primaryAllocation).toBe(500);
      expect(result.overflowAmount).toBe(300);
      expect(result.overflowTargetId).toBe('pot_bike');
      expect(result.updatedPots.find((p) => p.id === 'pot_istqb')?.currentAmount).toBe(3500);
      expect(result.updatedPots.find((p) => p.id === 'pot_istqb')?.isCompleted).toBe(true);
      expect(result.updatedPots.find((p) => p.id === 'pot_bike')?.currentAmount).toBe(2300);
    });

    it('falls back to next incomplete priority jar if autoOverflowTargetId is not specified', () => {
      const potA: SavingsPot = {
        id: 'pot_a',
        title: 'Emergency Buffer',
        targetAmount: 5000,
        currentAmount: 4800, // 200 remaining
        categoryColor: 'emerald',
        iconName: 'Shield',
        isCompleted: false,
        isPriorityJar: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const potB: SavingsPot = {
        id: 'pot_b',
        title: 'PC Build',
        targetAmount: 50000,
        currentAmount: 10000,
        categoryColor: 'cyan',
        iconName: 'Laptop',
        isCompleted: false,
        isPriorityJar: true, // Priority fallback
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = MoneyManagerPlugin.cascadeOverflowAllocation([potA, potB], 'pot_a', 500);

      expect(result.primaryAllocation).toBe(200);
      expect(result.overflowAmount).toBe(300);
      expect(result.overflowTargetId).toBe('pot_b');
      expect(result.updatedPots.find((p) => p.id === 'pot_b')?.currentAmount).toBe(10300);
    });

    it('enforces single active priority jar rule in PAIOSStorage.saveSavingsPot', () => {
      const pot1: SavingsPot = {
        id: 'pot_1',
        title: 'First Priority Pot',
        targetAmount: 10000,
        currentAmount: 2000,
        isPriorityJar: true,
        categoryColor: 'cyan',
        iconName: 'Target',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(pot1);
      let allPots = PAIOSStorage.getSavingsPots();
      expect(allPots.find((p) => p.id === 'pot_1')?.isPriorityJar).toBe(true);

      const pot2: SavingsPot = {
        id: 'pot_2',
        title: 'Second Pot Setting Priority',
        targetAmount: 20000,
        currentAmount: 5000,
        isPriorityJar: true, // Should unset pot_1
        categoryColor: 'emerald',
        iconName: 'Coins',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(pot2);
      allPots = PAIOSStorage.getSavingsPots();

      const savedPot1 = allPots.find((p) => p.id === 'pot_1');
      const savedPot2 = allPots.find((p) => p.id === 'pot_2');

      expect(savedPot1?.isPriorityJar).toBe(false);
      expect(savedPot2?.isPriorityJar).toBe(true);
    });

    it('automatically records OVERFLOW_CASCADE allocation record in PAIOSStorage.allocateToPot', () => {
      const pot1: SavingsPot = {
        id: 'p1',
        title: 'ISTQB Exam',
        targetAmount: 3000,
        currentAmount: 2800, // 200 remaining
        autoOverflowTargetId: 'p2',
        categoryColor: 'cyan',
        iconName: 'Target',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const pot2: SavingsPot = {
        id: 'p2',
        title: 'Laptop Upgrade',
        targetAmount: 60000,
        currentAmount: 5000,
        categoryColor: 'violet',
        iconName: 'Laptop',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(pot1);
      PAIOSStorage.saveSavingsPot(pot2);

      // Allocate 500 to p1 (200 fills p1, 300 cascades to p2)
      PAIOSStorage.allocateToPot('p1', 500, 'DAILY_LEFTOVER_SWEEP', 'EOD Sweep');

      const pots = PAIOSStorage.getSavingsPots();
      const updatedP1 = pots.find((p) => p.id === 'p1');
      const updatedP2 = pots.find((p) => p.id === 'p2');

      expect(updatedP1?.currentAmount).toBe(3000);
      expect(updatedP1?.isCompleted).toBe(true);
      expect(updatedP2?.currentAmount).toBe(5300);

      const allocations = PAIOSStorage.getPotAllocations();
      const overflowRecord = allocations.find((a) => a.source === 'OVERFLOW_CASCADE');
      expect(overflowRecord).toBeDefined();
      expect(overflowRecord?.potId).toBe('p2');
      expect(overflowRecord?.amount).toBe(300);
    });
  });

  describe('2. End-of-Day Leftover Sweep Integration & Priority Distribution', () => {
    it('distributes 100% of surplus to priority pot first using PRIORITY_FIRST mode', () => {
      const pots: SavingsPot[] = [
        {
          id: 'pot_normal',
          title: 'Normal Pot',
          targetAmount: 10000,
          currentAmount: 2000,
          isPriorityJar: false,
          categoryColor: 'cyan',
          iconName: 'Target',
          isCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'pot_priority',
          title: 'Priority Pot',
          targetAmount: 5000,
          currentAmount: 1000,
          isPriorityJar: true,
          categoryColor: 'emerald',
          iconName: 'Star',
          isCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const surplus = 650;
      const plan = MoneyManagerPlugin.distributeLeftoverSweep(surplus, pots, 'PRIORITY_FIRST');

      expect(plan.length).toBe(1);
      expect(plan[0].potId).toBe('pot_priority');
      expect(plan[0].allocatedAmount).toBe(650);
    });

    it('cascades remaining sweep surplus to other incomplete pots if priority pot fills up', () => {
      const pots: SavingsPot[] = [
        {
          id: 'pot_priority',
          title: 'Priority Pot',
          targetAmount: 1000,
          currentAmount: 800, // 200 remaining
          isPriorityJar: true,
          categoryColor: 'emerald',
          iconName: 'Star',
          isCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'pot_second',
          title: 'Second Pot',
          targetAmount: 5000,
          currentAmount: 1000,
          isPriorityJar: false,
          categoryColor: 'cyan',
          iconName: 'Target',
          isCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const surplus = 500;
      const plan = MoneyManagerPlugin.distributeLeftoverSweep(surplus, pots, 'PRIORITY_FIRST');

      expect(plan).toHaveLength(2);
      expect(plan.find((p) => p.potId === 'pot_priority')?.allocatedAmount).toBe(200);
      expect(plan.find((p) => p.potId === 'pot_second')?.allocatedAmount).toBe(300);
    });
  });

  describe('3. Liquid Milestone Celebrations & State Transitions', () => {
    it('detects milestone thresholds (25%, 50%, 75%, 100%) correctly', () => {
      const milestones25 = MoneyManagerPlugin.getPotMilestones(2500, 10000);
      expect(milestones25.reached25).toBe(true);
      expect(milestones25.reached50).toBe(false);
      expect(milestones25.reached75).toBe(false);
      expect(milestones25.reached100).toBe(false);
      expect(milestones25.highestMilestone).toBe(25);

      const milestones50 = MoneyManagerPlugin.getPotMilestones(5000, 10000);
      expect(milestones50.reached50).toBe(true);
      expect(milestones50.reached75).toBe(false);
      expect(milestones50.highestMilestone).toBe(50);

      const milestones75 = MoneyManagerPlugin.getPotMilestones(8000, 10000);
      expect(milestones75.reached75).toBe(true);
      expect(milestones75.reached100).toBe(false);
      expect(milestones75.highestMilestone).toBe(75);

      const milestones100 = MoneyManagerPlugin.getPotMilestones(10000, 10000);
      expect(milestones100.reached100).toBe(true);
      expect(milestones100.highestMilestone).toBe(100);
    });
  });

  describe('4. Intentional Withdrawal Friction & Audit Trail', () => {
    it('calculates setback days accurately for discretionary / impulse withdrawals', () => {
      // Withdrawing 1500 with an average daily surplus of 100 = 15 days setback
      const setbackDays = MoneyManagerPlugin.calculateWithdrawalSetbackDays(1500, 100);
      expect(setbackDays).toBe(15);

      // Falls back safely to dailySafeBudget if avgSurplus is 0
      const fallbackDays = MoneyManagerPlugin.calculateWithdrawalSetbackDays(2000, 0, 200);
      expect(fallbackDays).toBe(10);
    });

    it('persists withdrawalReasonCategory and logs WITHDRAWAL_OVERRIDE record', () => {
      const pot: SavingsPot = {
        id: 'pot_save',
        title: 'ISTQB Exam Fund',
        targetAmount: 5000,
        currentAmount: 4000,
        isPriorityJar: false,
        categoryColor: 'cyan',
        iconName: 'Target',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(pot);

      const reason: WithdrawalReasonCategory = 'CRITICAL_BILL_OR_DEBT';
      const justification = 'Urgent server hosting renewal invoice due';

      PAIOSStorage.withdrawFromPot('pot_save', 1200, justification, reason);

      const updatedPot = PAIOSStorage.getSavingsPots().find((p) => p.id === 'pot_save');
      expect(updatedPot?.currentAmount).toBe(2800);

      const allocations = PAIOSStorage.getPotAllocations();
      const withdrawalRecord = allocations.find((a) => a.potId === 'pot_save' && a.amount === -1200);

      expect(withdrawalRecord).toBeDefined();
      expect(withdrawalRecord?.source).toBe('WITHDRAWAL_OVERRIDE');
      expect(withdrawalRecord?.withdrawalReasonCategory).toBe('CRITICAL_BILL_OR_DEBT');
      expect(withdrawalRecord?.notes).toBe(justification);
    });
  });

  describe('5. Cross-Module Goal Binding', () => {
    it('persists and retrieves linkedGoalId correctly on savings pots', () => {
      const potWithGoal: SavingsPot = {
        id: 'pot_cert',
        title: 'Certification Jar',
        targetAmount: 8000,
        currentAmount: 3200,
        linkedGoalId: 'ISTQB Certification Exam',
        categoryColor: 'violet',
        iconName: 'Award',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(potWithGoal);

      const retrieved = PAIOSStorage.getSavingsPots().find((p) => p.id === 'pot_cert');
      expect(retrieved?.linkedGoalId).toBe('ISTQB Certification Exam');
    });

    it('dispatches paios_storage_change event when pots are mutated', () => {
      const eventSpy = vi.fn();
      window.addEventListener('paios_storage_change', eventSpy);

      const pot: SavingsPot = {
        id: 'pot_event_test',
        title: 'Event Test Pot',
        targetAmount: 1000,
        currentAmount: 100,
        categoryColor: 'cyan',
        iconName: 'Target',
        isCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      PAIOSStorage.saveSavingsPot(pot);

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('paios_storage_change', eventSpy);
    });
  });
});
