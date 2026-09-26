import React, { useState, useEffect } from 'react';
import {
  Sun,
  History,
  CheckCircle2,
  Brain,
  BarChart3,
  Cpu,
  BookOpen,
  Settings,
  Plus,
  Play,
  Zap,
} from 'lucide-react';
import { NavTab, ActivityLog, Task, TimelineEntry, StudyCard, JournalEntry, MorningCheckIn, EveningReview, AiChatMessage, UserSettings, SearchResults, Medication, DoseEvent, DoseStatus, RefillInventory, VitalSign, DoctorContact, Appointment, AdaptiveTimetableResponse, TimetableStatus, QuickCapture, CaptureDestination, ExpenseTransaction, WeeklyReview } from './types';
import { PAIOSStorage, getAuthToken, getTodayDateString, getStartOfDayMillis } from './storage';
import { TopHeaderBar } from './components/TopHeaderBar';
import { MiniTimerPlayer } from './components/MiniTimerPlayer';
import { StartActivityModal } from './components/StartActivityModal';
import { FinishActivityModal } from './components/FinishActivityModal';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { CheckInModal } from './components/CheckInModal';
import { ReviewModal } from './components/ReviewModal';
import { TaskModal } from './components/TaskModal';
import { StudyCardModal } from './components/StudyCardModal';
import { SearchModal } from './components/SearchModal';
import { AuthModal } from './components/AuthModal';

import { NotificationCenterModal } from './components/NotificationCenterModal';
import { SetupWizardModal } from './components/SetupWizardModal';
import { UpdatePromptModal } from './components/UpdatePromptModal';
import { dispatchNotification, initializeNativeNotificationActions, NotificationRoute } from './utils/notifications';
import { initBackgroundVersionChecker, onVersionUpdateAvailable, VersionManifest } from './utils/versionCheck';

import { TodayScreen } from './screens/TodayScreen';
import { TimelineScreen } from './screens/TimelineScreen';
import { TasksScreen } from './screens/TasksScreen';
import { PluginsScreen } from './screens/PluginsScreen';
import { HealthScreen } from './screens/HealthScreen';
import { LearnScreen } from './screens/LearnScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { AiScreen } from './screens/AiScreen';
import { JournalScreen } from './screens/JournalScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';

import { onAuthChange, listenToCloudData, logOut, PaiosUser } from './firebase';
import { sendClientGeminiChat, sendClientGeminiTimetable } from './geminiClient';
import { exportAndShareBackup } from './utils/exportShare';
import { OfflineSyncManager } from './core/sync/OfflineSyncManager';
import { SyncConflictModal } from './components/SyncConflictModal';
import { getPendingSyncConflict, PendingSyncConflict } from './firebase';
import { trackUsageInsight } from './utils/usageInsights';
import { applyPlatformClass } from './utils/platform';
import { getTomorrowNoon, preserveCompletedBlocks } from './utils/dailyCommandCenter';
import { classifyCapture, tomorrowMorningMillis } from './utils/captureClassifier';
import { getWeekStart, toLocalDateString } from './utils/weeklyReview';

import { DesktopAppExportModal } from './components/DesktopAppExportModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { QuickAddMenu } from './components/QuickAddMenu';
import { DesktopNavigation } from './components/DesktopNavigation';
import { ActionRecovery } from './core/actions/ActionRecovery';
import { RecoveryBanner } from './components/actions/RecoveryBanner';
import { UniversalCommandBar } from './components/actions/UniversalCommandBar';
import { UndoToast } from './components/actions/UndoToast';
import { ActionUndoManager } from './core/actions/ActionUndoManager';
import { ActionTransactionManager } from './core/actions/ActionTransactionManager';
import { ActionConfirmationManager } from './core/actions/ActionConfirmationManager';
import { ActionRiskPolicy } from './core/actions/ActionRiskPolicy';
import { ActionPreview } from './components/actions/ActionPreview';
import { ProposedAction, generateSecureUUID } from './core/actions/actionTypes';
import { ActionPayloadValidator } from './core/actions/ActionPayloadValidator';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>(NavTab.AI);

  // Auth & Session State
  const [currentUser, setCurrentUser] = useState<PaiosUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  // Onboarding Flow State
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('paios_onboarding_completed') === 'true';
      }
    } catch {}
    return false;
  });

  const [showExportModal, setShowExportModal] = useState(false);

  // Storage State
  const [activeActivity, setActiveActivity] = useState<ActivityLog | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [studyCards, setStudyCards] = useState<StudyCard[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [checkIns, setCheckIns] = useState<MorningCheckIn[]>([]);
  const [reviews, setReviews] = useState<EveningReview[]>([]);
  const [weeklyReviews, setWeeklyReviews] = useState<WeeklyReview[]>([]);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [pendingSafetyError, setPendingSafetyError] = useState<string | null>(null);
  const [timetableErrorToast, setTimetableErrorToast] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(PAIOSStorage.getSettings());
  const [timetable, setTimetable] = useState<AdaptiveTimetableResponse | null>(PAIOSStorage.getAdaptiveTimetable());
  const [isGeneratingTimetable, setIsGeneratingTimetable] = useState(false);

  // Health State
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseEvents, setDoseEvents] = useState<DoseEvent[]>([]);
  const [refillInventories, setRefillInventories] = useState<RefillInventory[]>([]);
  const [vitalSigns, setVitalSigns] = useState<VitalSign[]>([]);
  const [doctors, setDoctors] = useState<DoctorContact[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Search
  const [searchResults, setSearchResults] = useState<SearchResults>({
    tasks: [],
    timeline: [],
    captures: [],
    journal: [],
    studyCards: [],
    medications: [],
  });

  // Modals
  const [showStartActivityModal, setShowStartActivityModal] = useState(false);
  const [showFinishActivityModal, setShowFinishActivityModal] = useState(false);
  const [showQuickCaptureModal, setShowQuickCaptureModal] = useState(false);
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showStudyCardModal, setShowStudyCardModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showSetupWizardModal, setShowSetupWizardModal] = useState(false);
  const [showUpdatePromptModal, setShowUpdatePromptModal] = useState(false);
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [pendingAiActions, setPendingAiActions] = useState<ProposedAction[]>([]);
  const [undoToastData, setUndoToastData] = useState<{ transactionId: string; summary: string } | null>(null);
  const [latestServerManifest, setLatestServerManifest] = useState<VersionManifest | null>(null);
  const [pendingSyncConflict, setPendingSyncConflict] = useState<PendingSyncConflict | null>(null);

  useEffect(() => applyPlatformClass(), []);

  useEffect(() => {
    let removeNativeListener: () => void = () => undefined;
    void initializeNativeNotificationActions().then((cleanup) => { removeNativeListener = cleanup; });
    const handleRoute = (event: Event) => {
      const route = (event as CustomEvent<NotificationRoute>).detail;
      if (!route) return;
      setShowNotificationModal(false);
      if (route.screen === 'CHECKIN') setShowCheckInModal(true);
      else if (route.screen === 'REVIEW') setShowReviewModal(true);
      else setActiveTab(NavTab[route.screen]);
    };
    window.addEventListener('paios_notification_route', handleRoute);
    return () => { removeNativeListener(); window.removeEventListener('paios_notification_route', handleRoute); };
  }, []);

  // Called by the Android bridge before the activity exits. Overlays behave like
  // native sheets: back dismisses the top interaction, then returns to Today.
  useEffect(() => {
    const appWindow = window as Window & { __PAIOS_HANDLE_BACK__?: () => boolean };
    appWindow.__PAIOS_HANDLE_BACK__ = () => {
      if (showCommandBar) { setShowCommandBar(false); return true; }
      if (showQuickAddMenu) { setShowQuickAddMenu(false); return true; }
      if (showSearchModal) { setShowSearchModal(false); return true; }
      if (showNotificationModal) { setShowNotificationModal(false); return true; }
      if (showTaskModal) { setShowTaskModal(false); return true; }
      if (showStudyCardModal) { setShowStudyCardModal(false); return true; }
      if (showQuickCaptureModal) { setShowQuickCaptureModal(false); return true; }
      if (showStartActivityModal) { setShowStartActivityModal(false); return true; }
      if (showFinishActivityModal) { setShowFinishActivityModal(false); return true; }
      if (showCheckInModal) { setShowCheckInModal(false); return true; }
      if (showReviewModal) { setShowReviewModal(false); return true; }
      if (showSetupWizardModal) { setShowSetupWizardModal(false); return true; }
      if (showUpdatePromptModal) { setShowUpdatePromptModal(false); return true; }
      if (showExportModal) { setShowExportModal(false); return true; }
      if (showAuthModal) { setShowAuthModal(false); return true; }
      if (activeTab !== NavTab.TODAY) { setActiveTab(NavTab.TODAY); return true; }
      return false;
    };
    return () => { delete appWindow.__PAIOS_HANDLE_BACK__; };
  }, [activeTab, showAuthModal, showCheckInModal, showCommandBar, showExportModal, showFinishActivityModal,
    showNotificationModal, showQuickAddMenu, showQuickCaptureModal, showReviewModal,
    showSearchModal, showSetupWizardModal, showStartActivityModal, showStudyCardModal,
    showTaskModal, showUpdatePromptModal]);

  // Live Timer State for MiniTimerPlayer
  const [elapsedTimerSeconds, setElapsedTimerSeconds] = useState(0);

  // Reload state helper
  const reloadState = () => {
    setActiveActivity(PAIOSStorage.getActiveActivity());
    setActivityLogs(PAIOSStorage.getActivities());
    setTasks(PAIOSStorage.getTasks());
    setTimelineEntries(PAIOSStorage.getTimelineEntries());
    setStudyCards(PAIOSStorage.getStudyCards());
    setJournalEntries(PAIOSStorage.getJournalEntries());
    setCaptures(PAIOSStorage.getAllCaptures());
    setCheckIns(PAIOSStorage.getCheckIns());
    setReviews(PAIOSStorage.getReviews());
    setWeeklyReviews(PAIOSStorage.getWeeklyReviews());
    setAiMessages(PAIOSStorage.getAiMessages());
    setSettings(PAIOSStorage.getSettings());
    setMedications(PAIOSStorage.getMedications());
    setDoseEvents(PAIOSStorage.getDoseEvents());
    setRefillInventories(PAIOSStorage.getRefillInventories());
    setVitalSigns(PAIOSStorage.getVitalSigns());
    setDoctors(PAIOSStorage.getDoctors());
    setAppointments(PAIOSStorage.getAppointments());
    setTimetable(PAIOSStorage.getAdaptiveTimetable());
  };

  useEffect(() => {
    // Startup recovery of pending or interrupted transactions
    ActionRecovery.recoverPendingTransactions();
    reloadState();

    const handleStorageChange = () => {
      reloadState();
    };
    window.addEventListener('paios_storage_change', handleStorageChange);
    window.addEventListener('paios_state_change', handleStorageChange);

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandBar((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    const handleNavigate = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.tab) {
        setActiveTab(detail.tab);
      } else if (detail.screen === 'learn') {
        setActiveTab(NavTab.LEARN);
      } else if (detail.screen === 'timeline') {
        setActiveTab(NavTab.TIMELINE);
      } else if (detail.screen === 'tasks') {
        setActiveTab(NavTab.TASKS);
      } else if (detail.screen === 'plugins' || detail.screen === 'money') {
        setActiveTab(NavTab.PLUGINS);
      }
    };
    window.addEventListener('paios_navigate', handleNavigate);
    const handleSyncConflict = () => setPendingSyncConflict(getPendingSyncConflict());
    window.addEventListener('paios_sync_conflict', handleSyncConflict);

    // Bootstrap OfflineSyncManager Reconnection Listeners & Service Worker
    OfflineSyncManager.init();
    initBackgroundVersionChecker();
    const unsubscribeUpdate = onVersionUpdateAvailable((manifest) => {
      setLatestServerManifest(manifest);
      setShowUpdatePromptModal(true);
    });

    return () => {
      window.removeEventListener('paios_storage_change', handleStorageChange);
      window.removeEventListener('paios_state_change', handleStorageChange);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('paios_navigate', handleNavigate);
      window.removeEventListener('paios_sync_conflict', handleSyncConflict);
      unsubscribeUpdate();
    };
  }, []);

  // Automated Schedule, Medication, Check-In & Daily Summary Notification Ticker (Every 60s)
  useEffect(() => {
    const firedNotifs = new Set<string>();

    const checkScheduledNotifs = () => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateStr = getTodayDateString();
      const quietHoursStart = settings.notificationQuietHoursStart || '22:30';
      const quietHoursEnd = settings.notificationQuietHoursEnd || '07:30';
      const isWithinQuietHours = () => {
        if (!settings.notificationQuietHoursEnabled || quietHoursStart === quietHoursEnd) return false;
        return quietHoursStart < quietHoursEnd
          ? timeStr >= quietHoursStart && timeStr < quietHoursEnd
          : timeStr >= quietHoursStart || timeStr < quietHoursEnd;
      };
      const silenceNonMedicalReminders = isWithinQuietHours();

      // 1. Medication Schedule Check
      medications.forEach((med) => {
        if (med.status === 'active' && med.scheduleTimes?.includes(timeStr)) {
          const key = `med_${med.id}_${dateStr}_${timeStr}`;
          if (!firedNotifs.has(key)) {
            firedNotifs.add(key);
            dispatchNotification(
              `Medication Dose Due: ${med.brandName || med.genericName}`,
              `Time to take ${med.dosageStrength}${med.dosageUnit} (${med.instructions || 'Scheduled Dose'}).`,
              'MEDICATION',
              { screen: 'HEALTH', medicationId: med.id }
            );
          }
        }
      });

      // 2. Scheduled AI Timetable Blocks & Timeline Reminders
      if (!silenceNonMedicalReminders && timetable && timetable.blocks) {
        timetable.blocks.forEach((block) => {
          if (block.start === timeStr && block.status !== 'completed') {
            const key = `block_${block.id}_${dateStr}_${timeStr}`;
            if (!firedNotifs.has(key)) {
              firedNotifs.add(key);
              dispatchNotification(
                `AI Schedule Reminder: ${block.activity}`,
                `Scheduled block (${block.category}) starting now (${block.start} - ${block.end}). ${block.goal ? 'Goal: ' + block.goal : ''}`,
                'SCHEDULE',
                { screen: 'TIMELINE', blockId: block.id }
              );
            }
          }
        });
      }

      // 3. Morning Check-In Reminder
      const morningTargetTime = settings.morningCheckInTime || settings.wakeTime || '08:00';
      if (!silenceNonMedicalReminders && settings.morningNotificationEnabled !== false && timeStr === morningTargetTime) {
        const key = `checkin_morn_${dateStr}_${timeStr}`;
        const hasCheckedIn = checkIns.some((c) => c.dateString === dateStr);
        if (!firedNotifs.has(key) && !hasCheckedIn) {
          firedNotifs.add(key);
          dispatchNotification(
            `Morning Check-In Reminder`,
            `Good morning ${settings.userName || 'Alex'}! Set your top 3 goals, sleep score, and mindset for today.`,
            'CHECKIN',
            { screen: 'CHECKIN' }
          );
        }
      }

      // 4. Evening Review Reminder
      const eveningTargetTime = settings.eveningReviewTime || settings.bedtime || '21:30';
      if (!silenceNonMedicalReminders && settings.eveningNotificationEnabled !== false && timeStr === eveningTargetTime) {
        const key = `review_eve_${dateStr}_${timeStr}`;
        const hasReviewed = reviews.some((r) => r.dateString === dateStr);
        if (!firedNotifs.has(key) && !hasReviewed) {
          firedNotifs.add(key);
          dispatchNotification(
            `Evening Reflection & Review`,
            `Time for your daily review! Log what went well, blockers, and rate your overall day.`,
            'CHECKIN',
            { screen: 'REVIEW' }
          );
        }
      }

      // 5. Daily Insights Top-Performance Summary Notification
      const summaryTime = settings.dailySummaryTime || '21:00';
      if (!silenceNonMedicalReminders && settings.dailySummaryEnabled !== false && timeStr === summaryTime) {
        const key = `daily_summary_${dateStr}_${timeStr}`;
        if (!firedNotifs.has(key)) {
          firedNotifs.add(key);

          // Calculate today's top performing categories
          const startOfToday = getStartOfDayMillis();
          const catSeconds: Record<string, number> = {};
          let totalSec = 0;

          const currentActivities = PAIOSStorage.getActivities();
          currentActivities.forEach((act) => {
            if (act.startTimeMillis >= startOfToday) {
              const sec = act.durationSeconds || 0;
              if (sec > 0) {
                const cat = act.category || 'Work';
                catSeconds[cat] = (catSeconds[cat] || 0) + sec;
                totalSec += sec;
              }
            }
          });

          const currentTimeline = PAIOSStorage.getTimelineEntries();
          currentTimeline.forEach((e) => {
            if (e.timestampMillis >= startOfToday && e.durationMinutes) {
              const sec = e.durationMinutes * 60;
              const cat = e.category || 'Work';
              catSeconds[cat] = (catSeconds[cat] || 0) + sec;
              totalSec += sec;
            }
          });

          const sortedCats = Object.entries(catSeconds)
            .map(([cat, sec]) => ({ cat, hrs: (sec / 3600).toFixed(1) }))
            .sort((a, b) => parseFloat(b.hrs) - parseFloat(a.hrs));

          const totalHrs = (totalSec / 3600).toFixed(1);
          let summaryMsg = `Total Focus Today: ${totalHrs} hrs.`;

          if (sortedCats.length > 0) {
            const topStr = sortedCats
              .slice(0, 2)
              .map((c) => `${c.cat} (${c.hrs}h)`)
              .join(', ');
            summaryMsg = `Today's Top Focus: ${topStr} | Total: ${totalHrs} hrs logged. Tap to view detailed insights!`;
          } else {
            summaryMsg = `No focus sessions logged today yet. Great time to complete your evening review!`;
          }

          dispatchNotification(
            `Daily Focus & Performance Summary`,
            summaryMsg,
            'SYSTEM',
            { screen: 'INSIGHTS' }
          );
        }
      }
    };

    const notifInterval = setInterval(checkScheduledNotifs, 60000);
    checkScheduledNotifs();
    return () => clearInterval(notifInterval);
  }, [medications, timetable, settings, checkIns, reviews]);

  // Firebase Auth Session Listener & Realtime Cloud Sync
  useEffect(() => {
    let cloudUnsub: (() => void) | null = null;
    const cleanupOfflineSync = OfflineSyncManager.init(() => PAIOSStorage.getAuthToken());

    const unsubAuth = onAuthChange((user) => {
      if (user) {
        setCurrentUser(user);
        if (cloudUnsub) cloudUnsub();
        cloudUnsub = listenToCloudData(user.uid, () => {
          reloadState();
        });
      } else {
        const savedGuest = localStorage.getItem('paios_guest_session');
        if (savedGuest === 'true') {
          setCurrentUser({
            uid: 'paios_local_owner',
            email: 'owner@paios.local',
            displayName: 'PAIOS Owner',
          });
        } else {
          setCurrentUser(null);
        }
        if (cloudUnsub) {
          cloudUnsub();
          cloudUnsub = null;
        }
      }
      setIsAuthLoading(false);
    });

    return () => {
      cleanupOfflineSync();
      unsubAuth();
      if (cloudUnsub) cloudUnsub();
    };
  }, []);

  const handleAuthSuccess = (user: any) => {
    localStorage.setItem('paios_guest_session', 'true');
    const mappedUser: PaiosUser = {
      uid: user.id || user.uid || 'usr_active',
      email: user.email || 'user@paios.ai',
      displayName: user.displayName || 'PAIOS User',
    };
    setCurrentUser(mappedUser);
    setShowAuthModal(false);
    setActiveTab(NavTab.TODAY);
    reloadState();
  };

  const handleLogOut = async () => {
    try {
      localStorage.removeItem('paios_guest_session');
      await logOut();
      setCurrentUser(null);
    } catch (e) {
      console.error('Logout error:', e);
      localStorage.removeItem('paios_guest_session');
      setCurrentUser(null);
    }
  };

  const handleCompleteOnboarding = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('paios_onboarding_completed', 'true');
      }
    } catch {}
    setHasCompletedOnboarding(true);
    reloadState();
  };

  // Global Desktop Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleSearch('');
        setShowSearchModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowTaskModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setShowQuickCaptureModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Timer Ticker Loop
  useEffect(() => {
    let interval: any = null;
    if (activeActivity) {
      const updateSeconds = () => {
        const now = Date.now();
        const pausedSecs = activeActivity.accumulatedPausedDurationSeconds || 0;
        if (activeActivity.isRunning && !activeActivity.isPaused) {
          const grossSecs = Math.max(0, Math.floor((now - activeActivity.startTimeMillis) / 1000));
          const netSecs = Math.max(0, grossSecs - pausedSecs);
          setElapsedTimerSeconds(netSecs);
        } else if (activeActivity.isPaused) {
          const pauseStart = activeActivity.pauseStartTimeMillis || now;
          const grossSecs = Math.max(0, Math.floor((pauseStart - activeActivity.startTimeMillis) / 1000));
          const netSecs = Math.max(0, grossSecs - pausedSecs);
          setElapsedTimerSeconds(netSecs);
        }
      };
      updateSeconds();
      interval = setInterval(updateSeconds, 1000);
    } else {
      setElapsedTimerSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeActivity]);

  // Activity Handlers
  const handleStartActivity = (name: string, category: string, note?: string) => {
    PAIOSStorage.startActivity(name, category, note);
    trackUsageInsight('FOCUS_STARTED', Boolean(settings.localUsageInsightsEnabled));
    reloadState();
  };

  const handleStartTaskTimer = (task: Task) => {
    PAIOSStorage.startActivity(task.title, task.category, task.description || undefined);
    reloadState();
  };

  const handlePauseActivity = (id?: number) => {
    PAIOSStorage.pauseActivity(id);
    reloadState();
  };

  const handleResumeActivity = (id?: number) => {
    PAIOSStorage.resumeActivity(id);
    reloadState();
  };

  const handleFinishActivity = (id?: number) => {
    PAIOSStorage.finishActivity(id);
    reloadState();
  };

  const handleFinishActivityWithDetails = (id: number, finalNote: string, completedTaskId?: number | null) => {
    PAIOSStorage.finishActivity(id, finalNote, completedTaskId);
    reloadState();
  };

  const handleDiscardActivity = (id: number) => {
    PAIOSStorage.discardActivity(id);
    reloadState();
  };

  // Quick Capture
  const handleSaveQuickCapture = (text: string, category: string) => {
    PAIOSStorage.addQuickCaptureNote(text, category);
    reloadState();
  };

  // CheckIn & Review
  const handleSaveCheckIn = (checkIn: MorningCheckIn) => {
    PAIOSStorage.saveCheckIn(checkIn);
    trackUsageInsight('CHECK_IN', Boolean(settings.localUsageInsightsEnabled));
    reloadState();
  };

  const handleSaveReview = (review: EveningReview) => {
    PAIOSStorage.saveReview(review);
    trackUsageInsight('REVIEW_COMPLETED', Boolean(settings.localUsageInsightsEnabled));
    reloadState();
  };

  // Tasks
  const handleSaveTask = (title: string, category: string, isPriority: boolean, description: string) => {
    PAIOSStorage.addTask(title, category, isPriority, description);
    reloadState();
  };

  const handleToggleTaskStatus = (taskId: number) => {
    const taskWasOpen = PAIOSStorage.getTasks().find((task) => task.id === taskId)?.status !== 'COMPLETED';
    PAIOSStorage.toggleTaskStatus(taskId);
    if (taskWasOpen) trackUsageInsight('TASK_COMPLETED', Boolean(settings.localUsageInsightsEnabled));
    reloadState();
  };

  const handleToggleTaskPriority = (taskId: number) => {
    PAIOSStorage.toggleTaskPriorityPin(taskId);
    reloadState();
  };

  const handleDeleteTask = (taskId: number) => {
    PAIOSStorage.deleteTask(taskId);
    reloadState();
  };

  const handleSaveWeeklyReview = (review: WeeklyReview, createTasks: boolean) => {
    PAIOSStorage.saveWeeklyReview(review);
    if (createTasks) {
      const existingTitles = new Set(PAIOSStorage.getTasks().map((task) => task.title.trim().toLowerCase()));
      review.nextOutcomes.forEach((outcome) => {
        if (!existingTitles.has(outcome.toLowerCase())) {
          PAIOSStorage.addTask(outcome, 'Personal', true, `Weekly outcome · Week of ${review.weekStartDateString}`);
        }
      });
    }
    reloadState();
  };

  const handleProcessCapture = (id: number, type: CaptureDestination) => {
    const capture = PAIOSStorage.getAllCaptures().find((item) => item.id === id);
    if (!capture) return;
    const suggestion = classifyCapture(capture.text);
    let targetId: string | number | null = null;

    if (type === 'TASK') {
      targetId = PAIOSStorage.addTask(capture.text, capture.category, false, 'Created from PAIOS Inbox').id;
    } else if (type === 'EXPENSE' && suggestion.amount) {
      const now = new Date();
      const transaction: ExpenseTransaction = {
        id: `tx_inbox_${Date.now()}`,
        title: capture.text,
        amount: suggestion.amount,
        type: 'OUTFLOW',
        category: 'Other',
        dateString: getTodayDateString(),
        timeString: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        timestampMillis: Date.now(),
        isNecessity: false,
        notes: 'Confirmed from PAIOS Inbox',
        provenance: 'AI_EXTRACTED',
      };
      PAIOSStorage.saveExpenseTransaction(transaction);
      targetId = transaction.id;
    } else if (type === 'HEALTH') {
      targetId = PAIOSStorage.logVitalSign({ symptoms: capture.text, note: 'Confirmed from PAIOS Inbox' }).id;
    } else if (type === 'STUDY') {
      targetId = PAIOSStorage.addStudyCard(capture.category || 'Inbox', capture.text, 'Add the answer during your next review.').id;
    } else if (type === 'JOURNAL') {
      targetId = PAIOSStorage.addJournalEntry('Inbox reflection', capture.text, 5, capture.category).id;
    }

    PAIOSStorage.updateQuickCapture(id, {
      inboxStatus: 'PROCESSED',
      processedAtMillis: Date.now(),
      processedType: type,
      processedTargetId: targetId,
      deferUntilMillis: null,
    });
    reloadState();
  };

  const handleUndoCapture = (id: number) => {
    const capture = PAIOSStorage.getAllCaptures().find((item) => item.id === id);
    if (!capture) return;
    const targetId = capture.processedTargetId;
    if (capture.processedType === 'TASK' && typeof targetId === 'number') PAIOSStorage.deleteTask(targetId);
    if (capture.processedType === 'EXPENSE' && typeof targetId === 'string') PAIOSStorage.deleteExpenseTransaction(targetId);
    if (capture.processedType === 'HEALTH' && typeof targetId === 'string') PAIOSStorage.deleteVitalSign(targetId);
    if (capture.processedType === 'STUDY' && typeof targetId === 'number') PAIOSStorage.deleteStudyCard(targetId);
    if (capture.processedType === 'JOURNAL' && typeof targetId === 'number') PAIOSStorage.deleteJournalEntry(targetId);
    PAIOSStorage.updateQuickCapture(id, { inboxStatus: 'UNPROCESSED', processedAtMillis: null, processedType: null, processedTargetId: null });
    reloadState();
  };

  const handleRolloverTasks = (taskIds: number[]) => {
    const tomorrow = getTomorrowNoon();
    const selectedIds = new Set(taskIds);
    PAIOSStorage.getTasks()
      .filter((task) => selectedIds.has(task.id) && task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
      .forEach((task) => PAIOSStorage.updateTask({ ...task, dueDateMillis: tomorrow }));
    reloadState();
  };

  // Study Cards
  const handleSaveStudyCard = (topic: string, question: string, answer: string) => {
    PAIOSStorage.addStudyCard(topic, question, answer);
    reloadState();
  };

  const handleReviewStudyCard = (cardId: number, rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY') => {
    PAIOSStorage.reviewStudyCard(cardId, rating);
    reloadState();
  };

  const handleDeleteStudyCard = (id: number) => {
    PAIOSStorage.deleteStudyCard(id);
    reloadState();
  };

  // Journal
  const handleAddJournalEntry = (title: string, content: string, moodScore: number, category: string) => {
    PAIOSStorage.addJournalEntry(title, content, moodScore, category);
    reloadState();
  };

  const handleDeleteJournalEntry = (id: number) => {
    PAIOSStorage.deleteJournalEntry(id);
    reloadState();
  };

  // Timeline & Adaptive Timetable
  const handleDeleteTimelineEntry = (id: number) => {
    PAIOSStorage.deleteTimelineEntry(id);
    reloadState();
  };

  const handleGenerateTimetable = async (adaptationReason?: string) => {
    setIsGeneratingTimetable(true);
    const contextStr = PAIOSStorage.getUserContextString();
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentDateStr = getTodayDateString();
    const saveGeneratedTimetable = (generated: AdaptiveTimetableResponse) => {
      PAIOSStorage.saveAdaptiveTimetable(preserveCompletedBlocks(PAIOSStorage.getAdaptiveTimetable(), generated));
    };

    try {
      const res = await fetch('/api/ai/generate-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) },
        body: JSON.stringify({
          userContext: contextStr,
          currentTimeStr,
          currentDateStr,
          isWorkday: settings.isWorkday !== false,
          officeStartTime: settings.officeStartTime || '13:00',
          officeEndTime: settings.officeEndTime || '22:00',
          bedtime: settings.bedtime || '00:00',
          wakeTime: settings.wakeTime || '07:30',
          adaptationReason,
          customApiKey: settings.customApiKey,
          modelName: settings.preferredModel,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.success && Array.isArray(data.blocks)) {
          const responseObj: AdaptiveTimetableResponse = {
            dateString: currentDateStr,
            generatedAtTimeStr: currentTimeStr,
            explanation: data.explanation || 'AI generated schedule',
            blocks: data.blocks,
          };
          saveGeneratedTimetable(responseObj);
          reloadState();
          return;
        }
      }

      // If server returned non-JSON HTML or failed, fall back to client-side engine
      console.warn('Server timeline endpoint returned non-JSON/failed. Executing client-side timetable engine...');
      const fallbackData = await sendClientGeminiTimetable({
        userContext: contextStr,
        currentTimeStr,
        currentDateStr,
        isWorkday: settings.isWorkday !== false,
        officeStartTime: settings.officeStartTime || '13:00',
        officeEndTime: settings.officeEndTime || '22:00',
        bedtime: settings.bedtime || '00:00',
        wakeTime: settings.wakeTime || '07:30',
        adaptationReason,
        customApiKey: settings.customApiKey,
        modelName: settings.preferredModel,
      });

      const responseObj: AdaptiveTimetableResponse = {
        dateString: currentDateStr,
        generatedAtTimeStr: currentTimeStr,
        explanation: fallbackData.explanation,
        blocks: fallbackData.blocks,
      };
      saveGeneratedTimetable(responseObj);
      reloadState();
    } catch (err: any) {
      console.warn('Timetable server fetch error, falling back to client-side timetable generator:', err);
      try {
        const fallbackData = await sendClientGeminiTimetable({
          userContext: contextStr,
          currentTimeStr,
          currentDateStr,
          isWorkday: settings.isWorkday !== false,
          officeStartTime: settings.officeStartTime || '13:00',
          officeEndTime: settings.officeEndTime || '22:00',
          bedtime: settings.bedtime || '00:00',
          wakeTime: settings.wakeTime || '07:30',
          adaptationReason,
          customApiKey: settings.customApiKey,
          modelName: settings.preferredModel,
        });

        const responseObj: AdaptiveTimetableResponse = {
          dateString: currentDateStr,
          generatedAtTimeStr: currentTimeStr,
          explanation: fallbackData.explanation,
          blocks: fallbackData.blocks,
        };
        saveGeneratedTimetable(responseObj);
        reloadState();
      } catch (fallbackErr: any) {
        setTimetableErrorToast(`Unable to generate timetable: ${fallbackErr?.message || 'Error'}`);
      }
    } finally {
      setIsGeneratingTimetable(false);
    }
  };

  const handleUpdateTimetableBlockStatus = (blockId: string, status: TimetableStatus) => {
    PAIOSStorage.updateTimetableBlockStatus(blockId, status);
    reloadState();
  };

  const handleDeleteTimetableBlock = (blockId: string) => {
    PAIOSStorage.deleteTimetableBlock(blockId);
    reloadState();
  };

  // Search
  const handleSearch = (query: string) => {
    const res = PAIOSStorage.searchAll(query);
    setSearchResults(res);
  };

  // Settings
  const handleUpdateSettings = (updated: Partial<UserSettings>) => {
    PAIOSStorage.updateSettings(updated);
    reloadState();
  };

  const handleResetSampleData = () => {
    PAIOSStorage.seedSampleData();
    reloadState();
  };

  const handleClearAllData = () => {
    PAIOSStorage.clearAllData();
    reloadState();
  };

  const handleExportData = async (mode: 'share' | 'download' = 'share') => {
    await exportAndShareBackup(mode);
  };

  // AI Chat Communication
  const handleSendAiMessage = async (userText: string, options?: { role?: string; taskComplexity?: string }) => {
    const userMsg: AiChatMessage = {
      id: Date.now(),
      text: userText,
      isUser: true,
      timestampMillis: Date.now(),
    };

    PAIOSStorage.addAiMessage(userMsg);
    reloadState();

    const contextStr = PAIOSStorage.getUserContextString();
    const currentHistory = PAIOSStorage.getAiMessages();

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) },
        body: JSON.stringify({
          userText,
          userContext: contextStr,
          modelName: settings.preferredModel,
          customApiKey: settings.customApiKey,
          aiProvider: settings.aiProvider,
          ollamaModel: settings.ollamaModel,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          role: options?.role || 'productivity',
          taskComplexity: options?.taskComplexity || 'general',
          history: currentHistory,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        const botMsg: AiChatMessage = {
          id: Date.now() + 1,
          text: data.text || data.reply || data.error || "I'm sorry, I couldn't generate a response.",
          isUser: false,
          timestampMillis: Date.now(),
          actionType: data.actionType || undefined,
          actionPayloadJson: data.actionPayloadJson || undefined,
        };

        PAIOSStorage.addAiMessage(botMsg);
        reloadState();
        return;
      }

      // If server returned HTML (standalone/offline app) or failed, fall back to direct client-side Gemini execution
      console.warn('Server endpoint returned non-JSON response. Executing direct client-side Gemini call...');
      const fallbackData = await sendClientGeminiChat({
        userText,
        userContext: contextStr,
        modelName: settings.preferredModel,
        customApiKey: settings.customApiKey,
        aiProvider: settings.aiProvider,
        ollamaModel: settings.ollamaModel,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        role: options?.role || 'productivity',
        taskComplexity: options?.taskComplexity || 'general',
        history: currentHistory,
      });

      const botMsg: AiChatMessage = {
        id: Date.now() + 1,
        text: fallbackData.text,
        isUser: false,
        timestampMillis: Date.now(),
        actionType: (fallbackData.actionType as any) || undefined,
        actionPayloadJson: fallbackData.actionPayloadJson || undefined,
      };

      PAIOSStorage.addAiMessage(botMsg);
      reloadState();
    } catch (err: any) {
      console.error('AI Chat Error, falling back to client-side call:', err);
      try {
        const fallbackData = await sendClientGeminiChat({
          userText,
          userContext: contextStr,
          modelName: settings.preferredModel,
          customApiKey: settings.customApiKey,
          aiProvider: settings.aiProvider,
          ollamaModel: settings.ollamaModel,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          role: options?.role || 'productivity',
          taskComplexity: options?.taskComplexity || 'general',
          history: currentHistory,
        });
        const botMsg: AiChatMessage = {
          id: Date.now() + 1,
          text: fallbackData.text,
          isUser: false,
          timestampMillis: Date.now(),
          actionType: (fallbackData.actionType as any) || undefined,
          actionPayloadJson: fallbackData.actionPayloadJson || undefined,
        };

        PAIOSStorage.addAiMessage(botMsg);
        reloadState();
      } catch (fallbackErr: any) {
        const errorMsg: AiChatMessage = {
          id: Date.now() + 1,
          text: fallbackErr?.message || 'Error connecting to PAIOS AI server. Please verify your network or Gemini settings.',
          isUser: false,
          timestampMillis: Date.now(),
        };
        PAIOSStorage.addAiMessage(errorMsg);
        reloadState();
      }
    }
  };

  const handleClearAiChat = () => {
    PAIOSStorage.clearAiChat();
    reloadState();
  };

  // Health Handlers
  const handleLogDose = (doseId: string, status: DoseStatus, note?: string) => {
    PAIOSStorage.logDoseEvent(doseId, status, note);
    reloadState();
  };

  const handleUpdateRefill = (id: string, newQty: number) => {
    PAIOSStorage.updateRefillQuantity(id, newQty, true);
    reloadState();
  };

  const handleSaveRefill = (refill: RefillInventory) => {
    PAIOSStorage.saveRefillInventory(refill);
    reloadState();
  };

  const handleDeleteRefill = (id: string) => {
    PAIOSStorage.deleteRefillInventory(id);
    reloadState();
  };

  const handleLogVital = (vital: Omit<VitalSign, 'id' | 'timestampMillis'>) => {
    PAIOSStorage.logVitalSign(vital);
    reloadState();
  };

  const handleAddMedication = (med: Medication) => {
    PAIOSStorage.saveMedication(med);
    reloadState();
  };

  const handleDeleteMedication = (id: string) => {
    PAIOSStorage.deleteMedication(id);
    reloadState();
  };

  const handleSaveDoctor = (doc: DoctorContact) => {
    PAIOSStorage.saveDoctor(doc);
    reloadState();
  };

  const handleDeleteDoctor = (id: string) => {
    PAIOSStorage.deleteDoctor(id);
    reloadState();
  };

  const handleBookAppointment = (aptData: Omit<Appointment, 'id' | 'createdAtMillis'>) => {
    PAIOSStorage.bookAppointment(aptData);
    reloadState();
  };

  const handleUpdateAppointmentStatus = (id: string, status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED') => {
    PAIOSStorage.updateAppointmentStatus(id, status);
    reloadState();
  };

  const handleDeleteAppointment = (id: string) => {
    PAIOSStorage.deleteAppointment(id);
    reloadState();
  };

  // AI Action Execution via Deterministic Action Transaction Engine
  const handleExecuteAiAction = async (actionType: string, actionPayloadJson: string) => {
    try {
      setPendingSafetyError(null);
      const payload = JSON.parse(actionPayloadJson);
      const partials: Array<{ type: string, payload: any, title?: string, sourceText?: string }> = [];
      const txId = `tx_ai_${generateSecureUUID()}`;

      const deviceId = typeof localStorage !== 'undefined' ? localStorage.getItem('paios_sync_device_id_v1') || 'device' : 'device';

      if (actionType === 'CREATE_TASKS' || payload.type === 'CREATE_TASKS') {
        const proposedTasks = Array.isArray(payload.tasks) ? payload.tasks.slice(0, 10) : [];
        proposedTasks.forEach((task: any) => {
          if (!task?.title || typeof task.title !== 'string') return;
          partials.push({
            type: 'CREATE_TASK',
            payload: {
              title: task.title.trim(),
              category: task.category || 'Personal',
              priority: (task.priority === 'HIGH' || task.priority === 'CRITICAL' || Boolean(task.isPriority)) ? 'HIGH' : 'NORMAL',
              description: task.description || 'Added from an approved PAIOS AI proposal',
            },
            title: `Add task: "${task.title.trim()}"`,
            sourceText: 'CREATE_TASKS'
          });
        });
      } else if (actionType === 'ADD_TASK' || payload.type === 'ADD_TASK' || actionType === 'create_task' || payload.type === 'create_task') {
        const title = payload.title || 'AI Generated Task';
        partials.push({
          type: 'CREATE_TASK',
          payload: {
            title,
            category: payload.category || 'General',
            priority: (payload.priority === 'HIGH' || payload.priority === 'CRITICAL') ? 'HIGH' : 'NORMAL',
            description: payload.description || 'Added via PAIOS AI',
          },
          title: `Add task: "${title}"`,
          sourceText: 'ADD_TASK'
        });
      } else if (actionType === 'START_ACTIVITY' || payload.type === 'START_ACTIVITY') {
        partials.push({
          type: 'START_FOCUS_SESSION',
          payload: {
            name: payload.name || 'AI Session',
            category: payload.category || 'Work',
            note: 'Started via PAIOS AI',
          },
          title: `Start focus session: "${payload.name || 'AI Session'}"`,
          sourceText: 'START_ACTIVITY'
        });
      } else if (actionType === 'SAVE_NOTE' || payload.type === 'SAVE_NOTE') {
        partials.push({
          type: 'CREATE_QUICK_CAPTURE',
          payload: {
            text: payload.text || 'AI Note',
            category: 'Personal',
          },
          title: `Capture note: "${(payload.text || 'Note').slice(0, 30)}"`,
          sourceText: 'SAVE_NOTE'
        });
      } else if (
        actionType === 'LOG_DOSE' ||
        payload.type === 'LOG_DOSE' ||
        actionType === 'record_medication_dose' ||
        payload.type === 'record_medication_dose'
      ) {
        const doseList = PAIOSStorage.getDoseEvents();
        const medIds: string[] = Array.isArray(payload.medication_ids)
          ? payload.medication_ids
          : payload.medicationId
          ? [payload.medicationId]
          : payload.medicationName
          ? [payload.medicationName]
          : [];
        const actionStatus = payload.action || payload.status || 'TAKEN';
        const noteText = payload.notes || 'Recorded via PAIOS AI Tool Execution';

        let targetDose = doseList.find((d) => d.id === medIds[0] || d.medicationId === medIds[0]);
        if (!targetDose && medIds[0] && medIds[0] !== 'all_due') {
          targetDose = doseList.find((d) => d.medicationName.toLowerCase().includes(medIds[0].toLowerCase()));
        }
        if (!targetDose) {
          targetDose = doseList.find((d) => d.status === 'SCHEDULED');
        }

        if (targetDose) {
          partials.push({
            type: 'RECORD_MEDICATION_EVENT',
            payload: {
              doseEventId: targetDose.id,
              medicationId: targetDose.medicationId,
              medicationName: targetDose.medicationName,
              status: actionStatus === 'SKIPPED' ? 'SKIPPED' : 'TAKEN',
              note: noteText,
            },
            title: `Record ${targetDose.medicationName} as ${actionStatus}`,
            sourceText: 'LOG_DOSE',
          });
        }
      } else if (actionType === 'LOG_SYMPTOM' || payload.type === 'LOG_SYMPTOM') {
        partials.push({
          type: 'RECORD_SYMPTOM',
          payload: {
            symptomName: payload.symptomName || 'Symptom',
            severity: payload.severity || 1,
            notes: 'Logged via AI Proposal',
          },
          title: `Record symptom: "${payload.symptomName || 'Symptom'}"`,
          sourceText: 'LOG_SYMPTOM'
        });
      } else if (
        actionType === 'LOG_TRANSACTION' ||
        payload.type === 'LOG_TRANSACTION' ||
        actionType === 'log_transaction' ||
        payload.type === 'log_transaction'
      ) {
        const isInflow = payload.type === 'INFLOW' || payload.flowType === 'INFLOW';
        const amt = Number(payload.amount);
        partials.push({
          type: isInflow ? 'RECORD_INCOME' : 'RECORD_EXPENSE',
          payload: {
            amount: isNaN(amt) ? 0 : amt,
            title: payload.title || payload.description || 'Transaction',
            category: payload.category || (isInflow ? 'OtherIncome' : 'Other'),
          },
          title: `Record ${isInflow ? 'income' : 'expense'}: ₹${isNaN(amt) ? 0 : amt}`,
          sourceText: 'LOG_TRANSACTION'
        });
      } else {
         setPendingSafetyError(`Unknown action type: ${actionType}`);
         return;
      }

      if (partials.length === 0) return;

      const actions: Partial<ProposedAction>[] = [];
      for (const p of partials) {
        const validation = ActionPayloadValidator.validate(p.type as any, p.payload);
        if (!validation.isValid) {
          setPendingSafetyError(`Validation failed for ${p.type}: ${validation.errors.join(', ')}`);
          return;
        }
        actions.push({
          type: p.type as any,
          payload: p.payload,
          title: p.title,
          sourceText: p.sourceText,
          explanation: 'AI proposal',
          originDeviceId: deviceId,
        });
      }

      if (actions.length > 0) {
        const tx = ActionTransactionManager.buildTransaction(actions as any, `AI Action: ${actionType}`);

        if (tx.requiresConfirmation || tx.risk !== 'LOW') {
          setPendingAiActions(tx.actions);
          return;
        }

        const result = await ActionTransactionManager.executeTransaction(tx);
        if (result.success) {
          reloadState();
          setUndoToastData({ transactionId: tx.id, summary: tx.actions[0]?.title || 'AI Action completed' });
        } else {
          setPendingSafetyError(result.message || 'Execution failed');
        }
      }
    } catch (e: any) {
      console.error('Failed to parse AI action payload:', e);
      setPendingSafetyError(`Failed to parse AI action payload: ${e.message}`);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const currentWeekStart = toLocalDateString(getWeekStart());
  const todayCheckIn = checkIns.find((c) => c.dateString === todayStr) || null;
  const todayReview = reviews.find((r) => r.dateString === todayStr) || null;

  // Render Loading Screen during Auth Check
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-4 animate-pulse">
          <Cpu className="w-8 h-8" />
        </div>
        <p className="text-sm font-medium text-slate-400 font-mono tracking-wide">Initializing PAIOS Session...</p>
      </div>
    );
  }

  // Render OnboardingScreen if new/unauthenticated guest user encountering goal setup
  if (!hasCompletedOnboarding) {
    return (
      <OnboardingScreen
        userName={currentUser?.displayName || settings.userName || 'Alex'}
        onCompleteOnboarding={handleCompleteOnboarding}
      />
    );
  }

  // Render AuthScreen if unauthenticated and guest session active is false
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="android-app-shell min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white overflow-x-hidden w-full max-w-full safe-area-left safe-area-right">
      <div className="flex-1 flex flex-col w-full">
          <div className="flex-1 flex flex-col bg-slate-950">
            <RecoveryBanner onRefreshAppState={reloadState} />
            {/* Top Header Bar */}
            <TopHeaderBar
              userName={currentUser.displayName || settings.userName || 'PAIOS User'}
              user={currentUser}
              onLogOut={handleLogOut}
              onSyncComplete={reloadState}
              onOpenNotifications={() => setShowNotificationModal(true)}
              onOpenTour={() => setShowSetupWizardModal(true)}
              onOpenQuickAdd={() => setShowQuickAddMenu(true)}
              onOpenSearch={() => {
                handleSearch('');
                setShowSearchModal(true);
              }}
              onOpenCheckIn={() => setShowCheckInModal(true)}
              onOpenReview={() => setShowReviewModal(true)}
              onOpenSettings={() => setActiveTab(NavTab.SETTINGS)}
              onOpenCommandBar={() => setShowCommandBar(true)}
            />

            <DesktopNavigation activeTab={activeTab} onSelectTab={setActiveTab} />

            {/* Main Content Area */}
            <main className="android-main flex-1 min-h-0 max-w-6xl w-full mx-auto p-3 sm:p-6 pb-28 md:pb-20 overflow-x-hidden">
              {activeTab === NavTab.TODAY && (
                <TodayScreen
                  activeActivity={activeActivity}
                  priorities={tasks.filter((t) => t.isPriorityPin)}
                  todayTasks={tasks}
                  timelineEntries={timelineEntries}
                  checkIns={checkIns}
                  reviews={reviews}
                  inboxCaptures={captures}
                  activityLogs={activityLogs}
                  weeklyReview={weeklyReviews.find((review) => review.weekStartDateString === currentWeekStart)}
                  timetable={timetable}
                  isGeneratingTimetable={isGeneratingTimetable}
                  userName={settings.userName}
                  onStartActivity={handleStartActivity}
                  onPauseActivity={handlePauseActivity}
                  onResumeActivity={handleResumeActivity}
                  onFinishActivity={handleFinishActivity}
                  onToggleTaskStatus={handleToggleTaskStatus}
                  onOpenStartActivity={() => setShowStartActivityModal(true)}
                  onOpenQuickCapture={() => setShowQuickCaptureModal(true)}
                  onOpenAddTask={() => setShowTaskModal(true)}
                  onOpenJournal={() => setActiveTab(NavTab.JOURNAL)}
                  onOpenStudy={() => setActiveTab(NavTab.LEARN)}
                  onOpenCheckIn={() => setShowCheckInModal(true)}
                  onOpenReview={() => setShowReviewModal(true)}
                  onGeneratePlan={() => handleGenerateTimetable('Create a calm daily plan around the user’s top outcomes, current energy, fixed commitments, and realistic breaks.')}
                  onReplanDay={() => handleGenerateTimetable('The current plan has drifted. Preserve completed work and rebuild only the remaining day with realistic buffers.')}
                  onStartPlannedBlock={(block) => {
                    PAIOSStorage.updateTimetableBlockStatus(block.id, 'in_progress');
                    handleStartActivity(block.activity, block.category, block.goal || block.reason);
                  }}
                  onOpenPlan={() => setActiveTab(NavTab.TIMELINE)}
                  onRolloverTasks={handleRolloverTasks}
                  onProcessCapture={handleProcessCapture}
                  onDeferCapture={(id) => { PAIOSStorage.updateQuickCapture(id, { inboxStatus: 'DEFERRED', deferUntilMillis: tomorrowMorningMillis() }); reloadState(); }}
                  onArchiveCapture={(id) => { PAIOSStorage.updateQuickCapture(id, { inboxStatus: 'ARCHIVED' }); reloadState(); }}
                  onUndoCapture={handleUndoCapture}
                  onSaveWeeklyReview={handleSaveWeeklyReview}
                />
              )}

              {activeTab === NavTab.TIMELINE && (
                <TimelineScreen
                  timelineEntries={timelineEntries}
                  timetable={timetable}
                  settings={settings}
                  isGeneratingTimetable={isGeneratingTimetable}
                  onGenerateTimetable={handleGenerateTimetable}
                  onUpdateBlockStatus={handleUpdateTimetableBlockStatus}
                  onDeleteBlock={handleDeleteTimetableBlock}
                  onDeleteTimelineEntry={handleDeleteTimelineEntry}
                  onStartActivity={handleStartActivity}
                  onUpdateSettings={handleUpdateSettings}
                />
              )}

              {activeTab === NavTab.TASKS && (
                <TasksScreen
                  tasks={tasks}
                  onToggleTaskStatus={handleToggleTaskStatus}
                  onToggleTaskPriorityPin={handleToggleTaskPriority}
                  onDeleteTask={handleDeleteTask}
                  onOpenAddTask={() => setShowTaskModal(true)}
                />
              )}

              {activeTab === NavTab.PLUGINS && (
                <PluginsScreen
                  onTriggerAiTimetable={handleGenerateTimetable}
                  isAiScheduling={isGeneratingTimetable}
                />
              )}

              {activeTab === NavTab.HEALTH && (
                <HealthScreen
                  medications={medications}
                  doseEvents={doseEvents}
                  refillInventories={refillInventories}
                  vitalSigns={vitalSigns}
                  doctors={doctors}
                  appointments={appointments}
                  onLogDose={handleLogDose}
                  onUpdateRefill={handleUpdateRefill}
                  onSaveRefill={handleSaveRefill}
                  onDeleteRefill={handleDeleteRefill}
                  onLogVital={handleLogVital}
                  onAddMedication={handleAddMedication}
                  onDeleteMedication={handleDeleteMedication}
                  onSaveDoctor={handleSaveDoctor}
                  onDeleteDoctor={handleDeleteDoctor}
                  onBookAppointment={handleBookAppointment}
                  onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
                  onDeleteAppointment={handleDeleteAppointment}
                />
              )}

              {activeTab === NavTab.LEARN && (
                <LearnScreen
                  studyCards={studyCards}
                  onStartStudySession={(topic, mins) => {
                    handleStartActivity(`Study: ${topic}`, 'Study', `${mins} min active recall session`);
                  }}
                  onReviewStudyCard={handleReviewStudyCard}
                  onDeleteStudyCard={handleDeleteStudyCard}
                  onOpenAddCard={() => setShowStudyCardModal(true)}
                />
              )}

              {activeTab === NavTab.INSIGHTS && (
                <InsightsScreen
                  activityLogs={activityLogs}
                  activeActivity={activeActivity}
                  timelineEntries={timelineEntries}
                  tasks={tasks}
                  checkIns={checkIns}
                  reviews={reviews}
                  usageInsightsEnabled={Boolean(settings.localUsageInsightsEnabled)}
                />
              )}

              {activeTab === NavTab.AI && (
                <AiScreen
                  messages={aiMessages}
                  userContextString={PAIOSStorage.getUserContextString()}
                  onSendMessage={handleSendAiMessage}
                  onExecuteAction={handleExecuteAiAction}
                  onClearHistory={handleClearAiChat}
                  activeActivity={activeActivity}
                  tasksCount={tasks.filter((t) => t.status !== 'COMPLETED').length}
                  dueFlashcardsCount={studyCards.length}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenQuickCapture={() => setShowQuickCaptureModal(true)}
                  onOpenStartActivity={() => setShowStartActivityModal(true)}
                  onOpenAddTask={() => setShowTaskModal(true)}
                  settings={settings}
                />
              )}

              {activeTab === NavTab.JOURNAL && (
                <JournalScreen
                  entries={journalEntries}
                  onAddJournalEntry={handleAddJournalEntry}
                  onDeleteJournalEntry={handleDeleteJournalEntry}
                />
              )}

              {activeTab === NavTab.SETTINGS && (
                <SettingsScreen
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onResetSampleData={handleResetSampleData}
                  onClearAllData={handleClearAllData}
                  onExportData={handleExportData}
                  onOpenExportModal={() => setShowExportModal(true)}
                  onStartTour={() => setShowSetupWizardModal(true)}
                />
              )}
            </main>
          </div>
        </div>

      {/* Persistent Floating Mini Timer Player */}
      {activeActivity && activeTab !== NavTab.TODAY && (
        <div className="fixed bottom-[calc(58px+env(safe-area-inset-bottom,0px))] md:bottom-12 left-0 right-0 z-40">
          <MiniTimerPlayer
            activity={activeActivity}
            elapsedSeconds={elapsedTimerSeconds}
            onPause={handlePauseActivity}
            onResume={handleResumeActivity}
            onFinish={handleFinishActivity}
            onTap={() => setActiveTab(NavTab.TODAY)}
          />
        </div>
      )}

      {/* Mobile Android Floating Action Button (FAB) for Quick Capture */}
      <button
        onClick={() => setShowQuickAddMenu(true)}
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] right-4 z-40 md:hidden w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-xl shadow-indigo-600/40 border border-indigo-400/30 flex items-center justify-center active:scale-90 transition-transform"
        aria-label="Quick Capture Task or Note"
        title="Add to PAIOS"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Mobile Bottom Navigation Dock */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenCommandBar={() => setShowCommandBar(true)}
      />

      {/* Modals */}
      {showQuickAddMenu && (
        <QuickAddMenu
          onDismiss={() => setShowQuickAddMenu(false)}
          onAddTask={() => setShowTaskModal(true)}
          onAddNote={() => setShowQuickCaptureModal(true)}
          onStartFocus={() => setShowStartActivityModal(true)}
          onOpenJournal={() => setActiveTab(NavTab.JOURNAL)}
        />
      )}

      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}

      {pendingSyncConflict && currentUser?.uid && (
        <SyncConflictModal
          conflict={pendingSyncConflict}
          userId={currentUser.uid}
          onResolved={() => {
            setPendingSyncConflict(null);
            reloadState();
          }}
        />
      )}

      {showExportModal && (
        <DesktopAppExportModal onDismiss={() => setShowExportModal(false)} />
      )}

      {showStartActivityModal && (
        <StartActivityModal
          onDismiss={() => setShowStartActivityModal(false)}
          onStart={handleStartActivity}
        />
      )}

      {showQuickCaptureModal && (
        <QuickCaptureModal
          onDismiss={() => setShowQuickCaptureModal(false)}
          onSave={handleSaveQuickCapture}
        />
      )}

      {showCheckInModal && (
        <CheckInModal
          dateString={todayStr}
          existingCheckIn={todayCheckIn}
          onDismiss={() => setShowCheckInModal(false)}
          onSave={handleSaveCheckIn}
        />
      )}

      {showReviewModal && (
        <ReviewModal
          dateString={todayStr}
          activeTimeText={`${(
            timelineEntries.reduce((acc, e) => acc + (e.durationMinutes || 0), 0) / 60
          ).toFixed(1)}h`}
          tasksCompletedText={`${tasks.filter((t) => t.status === 'COMPLETED').length} tasks`}
          existingReview={todayReview}
          onDismiss={() => setShowReviewModal(false)}
          onSave={handleSaveReview}
        />
      )}

      {showTaskModal && (
        <TaskModal
          onDismiss={() => setShowTaskModal(false)}
          onSave={handleSaveTask}
        />
      )}

      {showStudyCardModal && (
        <StudyCardModal
          onDismiss={() => setShowStudyCardModal(false)}
          onSave={handleSaveStudyCard}
        />
      )}

      {showSearchModal && (
        <SearchModal
          searchResults={searchResults}
          onSearch={handleSearch}
          onDismiss={() => setShowSearchModal(false)}
        />
      )}

      <NotificationCenterModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
      />

      <SetupWizardModal
        isOpen={showSetupWizardModal}
        onClose={() => setShowSetupWizardModal(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onResetAllData={handleClearAllData}
        onCompleteTour={() => {
          setShowSetupWizardModal(false);
          reloadState();
        }}
      />

      <UpdatePromptModal
        isOpen={showUpdatePromptModal}
        onClose={() => setShowUpdatePromptModal(false)}
        serverManifest={latestServerManifest}
      />

      <UniversalCommandBar
        isOpen={showCommandBar}
        onClose={() => setShowCommandBar(false)}
        onRefreshAppState={reloadState}
        onShowUndoToast={(txId, summary) => setUndoToastData({ transactionId: txId, summary })}
      />

      {pendingAiActions.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Action"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
            <ActionPreview
              actions={pendingAiActions}
              onConfirm={async (selected) => {
                const tx = ActionTransactionManager.buildTransaction(
                  selected,
                  selected[0]?.title || 'Confirmed AI Action'
                );
                const proof = ActionConfirmationManager.generateProof(tx);
                const res = await ActionTransactionManager.executeTransaction(tx, proof);
                setPendingAiActions([]);
                if (res.success) {
                  reloadState();
                  setUndoToastData({
                    transactionId: tx.id,
                    summary: selected[0]?.title || 'Action completed',
                  });
                }
              }}
              onCancel={() => setPendingAiActions([])}
              onEditCommand={() => setPendingAiActions([])}
            />
          </div>
        </div>
      )}

      {undoToastData && (
        <UndoToast
          transactionId={undoToastData.transactionId}
          summary={undoToastData.summary}
          onUndo={async (txId) => {
            await ActionUndoManager.undoTransaction(txId);
            reloadState();
          }}
          onDismiss={() => setUndoToastData(null)}
        />
      )}
    </div>
  );
};

export default App;
