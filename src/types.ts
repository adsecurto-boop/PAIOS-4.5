export type PriorityLevel = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type Category = "Work" | "Study" | "Coding" | "Testing" | "Personal" | "Exercise" | "Break" | "Health" | "Other";
export type TimelineType = "ACTIVITY" | "TASK" | "CAPTURE" | "CHECKIN" | "JOURNAL" | "DOSE" | "VITAL" | "APPOINTMENT" | "HEALTH";

export interface Task {
  id: number;
  title: string;
  description: string;
  priority: PriorityLevel;
  status: TaskStatus;
  isPriorityPin: boolean;
  category: Category | string;
  dueDateMillis?: number | null;
  estimatedDurationMinutes?: number | null;
  createdAtMillis: number;
  completedAtMillis?: number | null;
  safetyWarning?: string | null;
}

export interface ActivityLog {
  id: number;
  activityName: string;
  category: Category | string;
  startTimeMillis: number;
  endTimeMillis?: number | null;
  durationSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  pauseStartTimeMillis?: number | null;
  accumulatedPausedDurationSeconds: number;
  note?: string | null;
}

export interface TimelineEntry {
  id: number;
  title: string;
  category: Category | string;
  timestampMillis: number;
  durationMinutes?: number | null;
  note?: string | null;
  type: TimelineType;
}

export interface QuickCapture {
  id: number;
  text: string;
  category: Category | string;
  tags: string;
  createdAtMillis: number;
}

export interface MorningCheckIn {
  dateString: string; // YYYY-MM-DD
  sleepHours: number;
  sleepQuality: number; // 1-10
  energy: number; // 1-10
  mood: number; // 1-10
  mainGoal: string;
  priority1: string;
  priority2: string;
  priority3: string;
  createdAtMillis: number;
}

export interface EveningReview {
  id?: number;
  dateString: string; // YYYY-MM-DD
  activeTimeFormatted: string;
  workTimeFormatted: string;
  studyTimeFormatted: string;
  tasksCompletedText: string;
  wentWell: string;
  didntGoWell: string;
  learnedText: string;
  doDifferently: string;
  rating: number; // 1-10
  createdAtMillis: number;
}

export interface JournalEntry {
  id: number;
  title: string;
  content: string;
  tags: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  category?: string;
  moodScore?: number;
}

export interface StudyCard {
  id: number;
  topic: string;
  question: string;
  answer: string;
  confidence: number; // 1 to 10
  lastReviewedMillis?: number | null;
  reviewCount: number;
  easeFactor: number;
}

export interface DoctorContact {
  id: string;
  name: string;
  specialty: string;
  clinicName: string;
  phone: string;
  emergencyPhone: string;
  email?: string;
  address?: string;
}

export interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  scheduledTimeMillis: number;
  scheduledDateString: string; // 'YYYY-MM-DD'
  scheduledTimeString: string; // '10:30'
  reason: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  createdAtMillis: number;
}

// Health & Medication Management Interfaces
export interface Medication {
  id: string;
  genericName: string;
  brandName: string;
  dosageStrength: number;
  dosageUnit: string; // mg, mcg, mL
  form: string; // tablet, capsule, sustained_release_tablet, liquid
  route: string; // oral, sublingual
  status: 'active' | 'historical' | 'discontinued';
  rxNormCui?: string;
  instructions: string;
  scheduleTimes: string[]; // ['08:00', '22:00']
  foodRelation?: 'before_meals' | 'with_meals' | 'after_meals' | 'empty_stomach' | 'no_restriction';
  createdAtMillis: number;
  prescribingDoctor?: string;
}

export type DoseStatus = 'SCHEDULED' | 'TAKEN' | 'TAKEN_LATE' | 'SKIPPED' | 'MISSED';

export interface DoseEvent {
  id: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  scheduledTime: string; // '08:00', '21:00'
  scheduledDateString: string; // 'YYYY-MM-DD'
  status: DoseStatus;
  actualTakenTimeMillis?: number | null;
  note?: string | null;
}

export interface RefillInventory {
  id: string;
  medicationId: string;
  medicationName: string;
  quantityRemaining: number;
  unit: string;
  dailyBurnRate: number;
  minimumThresholdDays: number;
  pharmacyName?: string;
  pharmacyPhone?: string;
  refillsRemaining: number;
  lastRefillDateString?: string;
  purchaseDateString?: string; // Date prescription was bought (e.g. '2026-08-01')
  daysSupplied?: number; // Days of medication supplied (e.g. 30, 60, 90)
  dosesPerDay?: number; // Times per day to take (e.g. 1, 2, 3)
  timingSlots?: ('Morning' | 'Afternoon' | 'Night')[]; // Slots e.g. ['Morning', 'Night']
}

export interface VitalSign {
  id: string;
  timestampMillis: number;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  restingHeartRate?: number | null;
  weightKg?: number | null;
  dizzinessSeverity?: number | null; // 1-10
  sedationSeverity?: number | null; // 1-10
  symptoms?: string | null;
  note?: string | null;
}

export interface AIMessage {
  id: number;
  sender?: "USER" | "AI";
  isUser?: boolean;
  text: string;
  actionType?: "ADD_TASK" | "START_ACTIVITY" | "SAVE_NOTE" | "LOG_DOSE" | "record_medication_dose" | "LOG_SYMPTOM" | "BOOK_APPOINTMENT" | null;
  actionPayloadJson?: string | null;
  isActionConfirmed?: boolean | null;
  timestampMillis: number;
}

export type AiChatMessage = AIMessage;

export interface UserSettings {
  id: number;
  userName: string;
  aiProvider: string;
  aiModel: string;
  customApiKey: string;
  themeMode: "SYSTEM" | "DARK" | "LIGHT";
  morningNotificationEnabled: boolean;
  eveningNotificationEnabled: boolean;
  dailySummaryEnabled?: boolean;
  dailySummaryTime?: string; // e.g. "21:00"
  morningCheckInTime?: string; // e.g. "08:00"
  eveningReviewTime?: string; // e.g. "21:30"
  preferredModel?: string;
  officeStartTime?: string; // e.g. "13:00"
  officeEndTime?: string;   // e.g. "22:00"
  bedtime?: string;         // e.g. "00:00"
  wakeTime?: string;        // e.g. "07:30"
  isWorkday?: boolean;      // true for workday shift, false for week-off
  goals?: string[];         // User long-term goals
  onboardingCompleted?: boolean; // Has user completed the initial setup tour?
  autoUpdateOnCommit?: boolean;  // Automatically sync/update when git commits occur
  gitCommitVersion?: string;    // Current Git commit hash/timestamp version
}

export type TimetablePriority = "FIXED" | "HIGH" | "FLEXIBLE" | "OPTIONAL" | "RECOVERY";
export type TimetableStatus = "planned" | "in_progress" | "completed" | "skipped" | "delayed" | "rescheduled" | "deferred";

export interface AdaptiveTimetableBlock {
  id: string;
  start: string;            // "10:15"
  end: string;              // "10:30"
  duration_minutes: number;
  activity: string;
  category: Category | string;
  goal?: string;
  priority: TimetablePriority;
  reason?: string;
  status: TimetableStatus;
  isAiGenerated?: boolean;
}

export interface AdaptiveTimetableResponse {
  dateString: string;
  generatedAtTimeStr: string;
  explanation: string;
  blocks: AdaptiveTimetableBlock[];
}

export interface SearchResults {
  tasks: Task[];
  timeline: TimelineEntry[];
  captures: QuickCapture[];
  journal: JournalEntry[];
  studyCards: StudyCard[];
  medications?: Medication[];
}

export enum NavTab {
  TODAY = "TODAY",
  TIMELINE = "TIMELINE",
  TASKS = "TASKS",
  PLUGINS = "PLUGINS",
  HEALTH = "HEALTH",
  LEARN = "LEARN",
  INSIGHTS = "INSIGHTS",
  AI = "AI",
  JOURNAL = "JOURNAL",
  SETTINGS = "SETTINGS",
}

// --- MONEY MANAGER & BUDGET ANALYZER DATA MODELS ---
export type TransactionType = 'INFLOW' | 'OUTFLOW';
export type IncomeCategory =
  | 'SALARY'
  | 'FREELANCE'
  | 'GIFT'
  | 'DIVIDEND'
  | 'DAILY_CASH'
  | 'OTHER_INCOME';
export type ExpenseCategory =
  | 'FOOD'
  | 'TRAVEL'
  | 'HEALTH'
  | 'HOUSING'
  | 'LOAN_EMI'
  | 'FAMILY_SUPPORT'
  | 'LEARNING'
  | 'ENTERTAINMENT'
  | 'MISC';

export interface DailyLedgerEntry {
  id: string;
  timestamp: string; // ISO format
  date: string;      // YYYY-MM-DD
  type: TransactionType;
  title: string;
  amount: number;
  category: IncomeCategory | ExpenseCategory | BudgetCategory | string;
  notes?: string;
  provenance?: 'MANUAL' | 'AI_EXTRACTED' | 'SWEEP';
}

export type BudgetCategory =
  | 'Food'
  | 'Travel'
  | 'Health'
  | 'Housing'
  | 'LoanClearance'
  | 'FamilyContribution'
  | 'Learning'
  | 'Investing'
  | 'Savings'
  | 'Entertainment'
  | 'Salary'
  | 'Freelance'
  | 'SideCash'
  | 'Dividends'
  | 'Reimbursements'
  | 'Gift'
  | 'OtherIncome'
  | 'Other'
  | IncomeCategory
  | ExpenseCategory;

export interface VariableIncomeStream {
  id: string;
  name: string;
  category: 'Freelance' | 'SideCash' | 'Dividends' | 'Reimbursements' | 'Gift' | 'OtherIncome' | IncomeCategory;
  expectedMonthlyAmount: number;
}

export interface BudgetProfile {
  id: string;
  monthlySalary: number;
  currency: string;
  salaryCycleDay: number; // 1 to 31 (day of month salary arrives)
  // Multi-Stream Variable Income
  expectedVariableIncome?: number;
  variableIncomeStreams?: VariableIncomeStream[];
  // Balance Sheet & Current Wealth Position
  currentBalance?: number; // Checking / liquid cash balance
  currentSaved?: number; // Current emergency / liquid savings
  currentDebt?: number; // Outstanding debt / loans / credit cards
  debtInterestRate?: number; // Annual debt interest rate % p.a.
  currentInvested?: number; // Current invested portfolio value
  savingsInterestRate?: number; // Annual savings yield rate % p.a.
  // Target Allocations (e.g. 50/30/20)
  needsTargetPercent?: number; // Target <= 50%
  wantsTargetPercent?: number; // Target <= 30%
  savingsTargetPercent?: number; // Target >= 20%
  // Necessities & Fixed Obligations
  foodMonthly: number;
  travelMonthly: number;
  healthMonthly: number;
  housingMonthly: number;
  loanClearanceMonthly: number;
  familyContributionMonthly?: number; // Family support / parents contribution
  // Growth & Planned Expenses
  learningMonthly: number;
  investingMonthly: number;
  savingsMonthly: number;
  discretionaryMonthly: number;
  expectedAnnualReturnRate: number; // e.g. 10 (%) for compound projection
  appliedRecoveryAdjustment?: number; // Daily budget deduction quota applied by recovery arbiter
  categoryCaps?: Partial<Record<BudgetCategory, number>>; // Optional explicit monthly category caps
  updatedAtMillis: number;
}

export interface ExpenseTransaction {
  id: string;
  title: string;
  amount: number;
  type?: TransactionType; // Defaults to 'OUTFLOW' for backwards compatibility
  category: BudgetCategory | IncomeCategory | ExpenseCategory | string;
  dateString: string; // YYYY-MM-DD
  timeString?: string; // HH:mm
  timestampMillis: number;
  isNecessity: boolean;
  note?: string;
  notes?: string;
  provenance?: 'MANUAL' | 'AI_EXTRACTED' | 'SWEEP';
}

export interface DailySurplusRecord {
  id: string;
  dateString: string; // YYYY-MM-DD
  dailySafeBudget: number;
  actualSpend: number;
  sweptAmount: number;
  timestampMillis: number;
}

export interface DailyNetSavings {
  dateString: string;
  totalInflow: number;
  totalOutflow: number;
  netSaved: number;
  safeDailyBudget: number;
  unspentAllowance: number;
  totalSweptPotential: number;
}

export type VarianceStatus = 'ON_TRACK' | 'APPROACHING_LIMIT' | 'OVER_BUDGET';

export interface PlannedVsActualCategory {
  category: BudgetCategory | string;
  planned: number;
  actual: number;
  variance: number; // positive = under budget, negative = over budget
  percentUsed: number;
  status: VarianceStatus;
}

export interface PlannedVsActualTimeline {
  daily: {
    safeCap: number;
    actualSpent: number;
    variance: number;
    status: VarianceStatus;
  };
  weekly: {
    rollingCap: number;
    actualSpent: number;
    variance: number;
    status: VarianceStatus;
  };
  monthly: {
    needsPlanned: number;
    needsActual: number;
    wantsPlanned: number;
    wantsActual: number;
    savingsPlanned: number;
    savingsActual: number;
    categories: PlannedVsActualCategory[];
  };
}

export interface BudgetRecoveryState {
  activeBreach: boolean;
  overageAmount: number;
  breachedCategory?: string;
  daysRemaining: number;
  dailyReductionQuota: number;
  appliedDailyAdjustment: number;
  tradeOffSuggestion?: string;
  shiftedSurplusHistory?: {
    fromCategory: string;
    toCategory: string;
    amount: number;
    timestampMillis: number;
  }[];
  status: 'IDLE' | 'ADJUSTED' | 'RESOLVED';
  updatedAtMillis: number;
}

export interface BudgetAnalysisResult {
  totalFixedObligations: number;
  totalPlannedInvestments: number;
  totalFreeMoney: number;
  safeToSpendDaily: number;
  safeToSpendWeekly: number;
  idealDailySavings: number;
  daysRemainingInCycle: number;
  cycleStartDate: string;
  cycleEndDate: string;
  budgetHealthScore: number; // 0 to 100
  needsRatio: number;
  wantsRatio: number;
  savingsRatio: number;
  netWorth?: number;
  totalAssets?: number;
  totalDebt?: number;
  debtFreeMonths?: number;
  appliedDailyAdjustment?: number;
  effectiveDailyBudget?: number;
  recommendations: string[];
}


// --- TARGET SAVINGS POTS (JARS / SINKING FUNDS) ---
export interface SavingsPot {
  id: string;
  title: string;                 // e.g., "Building PC", "ISTQB Exam", "Bike Fund"
  targetAmount: number;          // e.g., 50000, 3500
  currentAmount: number;         // accumulated savings
  categoryColor: string;         // accent color (cyan, emerald, violet, amber, etc.)
  iconName: string;              // Lucide icon key (e.g., 'Cpu', 'Award', 'Bike', 'TrendingUp')
  targetDate?: string;           // Optional target completion date (YYYY-MM-DD)
  isCompleted: boolean;
  isPriorityJar?: boolean;       // Only one pot can be active priority at a time
  autoOverflowTargetId?: string; // Pot ID to receive surplus once this pot hits 100%
  linkedGoalId?: string;         // Optional link to a PAIOS Goal/Project (e.g., ISTQB Exam)
  createdAt: string;             // ISO timestamp
  updatedAt: string;
}

export type PotAllocationSource =
  | 'DAILY_LEFTOVER_SWEEP'
  | 'MANUAL_DEPOSIT'
  | 'WINDFALL'
  | 'WITHDRAWAL_OVERRIDE'
  | 'OVERFLOW_CASCADE';

export type WithdrawalReasonCategory =
  | 'MEDICAL_EMERGENCY'
  | 'CRITICAL_BILL_OR_DEBT'
  | 'URGENT_FAMILY_SUPPORT'
  | 'IMPULSE_OR_OTHER';

export interface PotAllocationRecord {
  id: string;
  potId: string;
  amount: number;
  date: string;                  // YYYY-MM-DD
  timestamp: string;             // ISO timestamp
  source: PotAllocationSource;
  withdrawalReasonCategory?: WithdrawalReasonCategory;
  notes?: string;
}
