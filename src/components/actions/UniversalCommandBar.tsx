import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Sparkles,
  Zap,
  ArrowRight,
  X,
  History,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Clock,
  Compass,
  CornerDownLeft,
  FileText,
  Calendar,
  Pill,
  BookOpen,
} from 'lucide-react';
import {
  ProposedAction,
  InterpretationResult,
  ClarificationRequest,
  ClarificationOption,
  TransactionRecord,
  ConfirmationProof,
} from '../../core/actions/actionTypes';
import { LocalCommandParser } from '../../core/actions/LocalCommandParser';
import { AiActionInterpreter } from '../../core/actions/AiActionInterpreter';
import { ActionTransactionManager, TransactionExecutionReport } from '../../core/actions/ActionTransactionManager';
import { ActionConfirmationManager } from '../../core/actions/ActionConfirmationManager';
import { ActionUndoManager } from '../../core/actions/ActionUndoManager';
import { ActionStorage } from '../../core/actions/actionStorage';
import { SearchModeService, SearchResultItem } from '../../core/actions/SearchModeService';
import { AskModeService, AskResponse } from '../../core/actions/AskModeService';
import { ActionPreview } from './ActionPreview';
import { ActionResult } from './ActionResult';
import { ClarificationPrompt } from './ClarificationPrompt';
import { ActionHistory } from './ActionHistory';
import { isSensitiveCommand } from '../../utils/sensitiveCommandDetector';

interface UniversalCommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshAppState?: () => void;
  onShowUndoToast?: (txId: string, summary: string) => void;
}

type CommandMode = 'ACT' | 'SEARCH' | 'ASK';
type BarState = 'INPUT' | 'CLARIFYING' | 'PREVIEWING' | 'RESULT';

const RECENT_COMMANDS_KEY = 'paios_recent_safe_commands_v1';

export const UniversalCommandBar: React.FC<UniversalCommandBarProps> = ({
  isOpen,
  onClose,
  onRefreshAppState,
  onShowUndoToast,
}) => {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<CommandMode>('ACT');
  const [barState, setBarState] = useState<BarState>('INPUT');
  const [isProcessing, setIsProcessing] = useState(false);
  const [proposedActions, setProposedActions] = useState<ProposedAction[]>([]);
  const [clarificationRequest, setClarificationRequest] = useState<ClarificationRequest | null>(null);
  const [executionReport, setExecutionReport] = useState<TransactionExecutionReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Search & Ask state (strictly read-only)
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lastSubmitTimeRef = useRef<number>(0);

  // Restore focus to previous active element on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Load recent safe commands
      try {
        const stored = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) || '[]');
        setRecentCommands(stored.slice(0, 5));
      } catch {}
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInputText('');
      setBarState('INPUT');
      setProposedActions([]);
      setClarificationRequest(null);
      setExecutionReport(null);
      setErrorMessage(null);
      setSearchResults([]);
      setHasSearched(false);
      setAskResponse(null);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }
  }, [isOpen]);

  // Handle global Escape key to close & Focus Trap inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (showHistoryModal) {
          setShowHistoryModal(false);
          return;
        }
        if (barState === 'PREVIEWING' || barState === 'CLARIFYING' || barState === 'RESULT') {
          setBarState('INPUT');
          setProposedActions([]);
          setClarificationRequest(null);
          setExecutionReport(null);
          return;
        }
        onClose();
        return;
      }

      // Accessible Focus Trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showHistoryModal, barState]);

  const saveRecentCommand = (cmd: string) => {
    try {
      const existing: string[] = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) || '[]');
      const filtered = [cmd, ...existing.filter((c) => c !== cmd)].slice(0, 6);
      localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(filtered));
      setRecentCommands(filtered);
    } catch {}
  };

  const handleModeSwitch = (newMode: CommandMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSearchResults([]);
    setHasSearched(false);
    setAskResponse(null);
    setBarState('INPUT');
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  // Submission pipeline with mode isolation and Enter debounce
  const handleSubmit = async (textToSubmit?: string) => {
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < 350) return; // Debounce rapid Enter key presses
    lastSubmitTimeRef.current = now;

    const text = (textToSubmit || inputText).trim();
    if (!text || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);

    // MODE SEPARATION: Search Mode (strictly read-only, zero mutations)
    if (mode === 'SEARCH') {
      try {
        const results = await SearchModeService.search(text);
        setSearchResults(results);
        setHasSearched(true);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Search failed.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // MODE SEPARATION: Ask Mode (strictly read-only Q&A, zero mutations)
    if (mode === 'ASK') {
      try {
        const response = await AskModeService.ask(text);
        setAskResponse(response);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Unable to process question.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // MODE: ACT (action resolution and execution pipeline)
    try {
      // Step 1: Tier 1 - Fast local deterministic parser
      const localResult: InterpretationResult = LocalCommandParser.parse(text);

      if (localResult.safetyNotice) {
        setErrorMessage(localResult.safetyNotice);
        setIsProcessing(false);
        return;
      }

      if (localResult.clarificationNeeded) {
        setClarificationRequest(localResult.clarificationNeeded);
        setBarState('CLARIFYING');
        setIsProcessing(false);
        return;
      }

      let actionsToProcess = localResult.actions;

      // Step 2: Tier 2 - AI interpreter fallback if local parser produced no actions
      if (actionsToProcess.length === 0) {
        const aiResult = await AiActionInterpreter.interpret(text);

        if (aiResult.safetyNotice) {
          setErrorMessage(aiResult.safetyNotice);
          setIsProcessing(false);
          return;
        }

        if (aiResult.actions.length === 0) {
          setErrorMessage(aiResult.explanation || 'No actionable proposal could be resolved from this command.');
          setIsProcessing(false);
          return;
        }

        actionsToProcess = aiResult.actions;
      }

      setProposedActions(actionsToProcess);

      // Step 3: Check risk and confirmation requirement
      const requiresConfirmation = actionsToProcess.some((a) => a.requiresConfirmation || a.risk !== 'LOW');

      if (requiresConfirmation) {
        // Show preview for review and explicit confirmation
        setBarState('PREVIEWING');
      } else {
        // Safe low-risk action: Execute atomically immediately
        await executeActionsWithConfirmation(actionsToProcess, text, false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An error occurred while interpreting command.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeActionsWithConfirmation = async (
    actions: ProposedAction[],
    commandText: string,
    isConfirmedByUser: boolean = false
  ) => {
    setIsProcessing(true);
    try {
      const tx = ActionTransactionManager.buildTransaction(actions, commandText);
      let proof: ConfirmationProof | undefined;

      // DEF-01: Medium/High risk requires cryptographically bound single-use confirmation proof
      if (tx.requiresConfirmation || tx.risk !== 'LOW') {
        if (!isConfirmedByUser) {
          // Direct execution without user confirmation intercepted: force preview state
          setProposedActions(actions);
          setBarState('PREVIEWING');
          setIsProcessing(false);
          return;
        }
        // Explicit user confirmation received from ActionPreview: generate cryptographic proof
        proof = ActionConfirmationManager.generateProof(tx);
      }

      const report = await ActionTransactionManager.executeTransaction(tx, proof);
      setExecutionReport(report);

      if (report.success) {
        if (onRefreshAppState) onRefreshAppState();

        // Privacy-controlled recent safe commands persistence
        try {
          const actionTypes = actions.map((a) => a.type);
          const isSensitive = isSensitiveCommand(commandText, actionTypes);
          if (!isSensitive) {
            const stored = JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) || '[]');
            const updated = [commandText, ...stored.filter((c: any) => c !== commandText)].slice(0, 5);
            localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(updated));
            setRecentCommands(updated);
          }
        } catch {}

        // Non-blocking toast for immediate execution
        if (onShowUndoToast && report.transaction.undoStatus === 'AVAILABLE') {
          const summary = actions[0]?.title || 'Action completed';
          onShowUndoToast(report.transaction.id, summary);
          onClose();
          return;
        }
      }

      setBarState('RESULT');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to execute actions.');
      setBarState('INPUT');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClarificationSelected = (option: ClarificationOption) => {
    if (!clarificationRequest) return;
    setBarState('INPUT');
    setClarificationRequest(null);
    handleSubmit(`${inputText} (${option.label})`);
  };

  const handleUndo = async (transactionId: string) => {
    setIsProcessing(true);
    try {
      const res = await ActionUndoManager.undoTransaction(transactionId);
      if (res.success) {
        if (onRefreshAppState) onRefreshAppState();
        onClose();
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwitchToActAndExecute = (prompt: string) => {
    setMode('ACT');
    setInputText(prompt);
    setAskResponse(null);
    handleSubmit(prompt);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Universal Action Command Bar"
        className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 sm:pt-16 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-150"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isProcessing) onClose();
        }}
      >
        <div
          ref={modalRef}
          className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col"
        >
          {/* Top Bar / Search Input Area */}
          <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center shrink-0">
              {mode === 'ACT' ? <Zap className="w-4 h-4" /> : mode === 'SEARCH' ? <Search className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>

            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (mode === 'SEARCH' && hasSearched) {
                  setHasSearched(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                mode === 'ACT'
                  ? 'Add task, record expense, log dose, start focus...'
                  : mode === 'SEARCH'
                  ? 'Search across tasks, notes, journal, timeline...'
                  : 'Ask PAIOS anything about your day...'
              }
              disabled={isProcessing || barState === 'PREVIEWING'}
              className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none disabled:opacity-60"
              aria-label="Command bar input"
            />

            <div className="flex items-center gap-1.5 shrink-0">
              {isProcessing && (
                <div
                  role="status"
                  aria-label="Processing request"
                  className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"
                />
              )}
              {inputText && (
                <button
                  type="button"
                  onClick={() => {
                    setInputText('');
                    setSearchResults([]);
                    setHasSearched(false);
                    setAskResponse(null);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                  aria-label="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                title="View Action History"
                aria-label="View Action History"
              >
                <History className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div className="px-3 sm:px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1" role="tablist" aria-label="Command Bar Modes">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'ACT'}
                onClick={() => handleModeSwitch('ACT')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'ACT'
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Act
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'SEARCH'}
                onClick={() => handleModeSwitch('SEARCH')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'SEARCH'
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Search
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'ASK'}
                onClick={() => handleModeSwitch('ASK')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  mode === 'ASK'
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Ask
              </button>
            </div>

            <span className="text-[11px] text-slate-500 hidden sm:inline">
              ESC to close · ↵ to {mode === 'ACT' ? 'execute' : mode === 'SEARCH' ? 'search' : 'ask'}
            </span>
          </div>

          {/* Live Region for Errors / Notices */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-200 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SEARCH MODE CONTENT */}
          {mode === 'SEARCH' && (
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {searchResults.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-400">
                    Found {searchResults.length} matching record{searchResults.length === 1 ? '' : 's'} (Read-Only):
                  </p>
                  <div className="space-y-1.5">
                    {searchResults.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-200 truncate">{item.title}</p>
                          {item.subtitle && <p className="text-slate-400 text-[11px] mt-0.5">{item.subtitle}</p>}
                        </div>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-700/60 text-slate-300 shrink-0">
                          {item.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : hasSearched ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No records matching &quot;{inputText}&quot; found across tasks, schedule, vitals, or notes.
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Type a search keyword and press Enter to search locally across all PAIOS records.
                </div>
              )}
            </div>
          )}

          {/* ASK MODE CONTENT */}
          {mode === 'ASK' && (
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {askResponse ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                    {askResponse.answer}
                  </div>

                  {askResponse.suggestsActMode && askResponse.suggestedPrompt && (
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between gap-3">
                      <div className="text-xs text-indigo-200">
                        <span className="font-semibold">Action Request Detected:</span> Ready to perform this in Act mode.
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSwitchToActAndExecute(askResponse.suggestedPrompt!)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5"
                      >
                        <span>Switch to Act</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Ask questions about your daily schedule, active tasks, medication times, or vitals.
                </div>
              )}
            </div>
          )}

          {/* ACT MODE CONTENT: based on BarState */}
          {mode === 'ACT' && barState === 'CLARIFYING' && clarificationRequest && (
            <ClarificationPrompt
              request={clarificationRequest}
              onSelectOption={handleClarificationSelected}
              onCancel={() => setBarState('INPUT')}
            />
          )}

          {mode === 'ACT' && barState === 'PREVIEWING' && proposedActions.length > 0 && (
            <ActionPreview
              actions={proposedActions}
              onConfirm={(selected) => executeActionsWithConfirmation(selected, inputText, true)}
              onCancel={() => setBarState('INPUT')}
              onEditCommand={() => setBarState('INPUT')}
              isExecuting={isProcessing}
            />
          )}

          {mode === 'ACT' && barState === 'RESULT' && executionReport && (
            <ActionResult
              report={executionReport}
              onUndo={handleUndo}
              onClose={onClose}
              isUndoing={isProcessing}
            />
          )}

          {mode === 'ACT' && barState === 'INPUT' && (
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Recent Safe Commands */}
              {recentCommands.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-400">Recent Safe Commands</p>
                  <div className="space-y-1">
                    {recentCommands.map((cmd, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setInputText(cmd);
                          handleSubmit(cmd);
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 text-left text-xs text-slate-200 transition-colors group"
                      >
                        <span className="truncate">{cmd}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Useful Safe Command Examples */}
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-slate-400">Try saying or typing</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    'Add a high-priority task to call the doctor tomorrow',
                    'Move my unfinished work to tomorrow',
                    'I spent ₹850 on groceries',
                    'I took my evening medication',
                    'Start a 25-minute focus session on coding',
                    'Capture that I felt dizzy after lunch',
                    'Schedule two hours for exam preparation this weekend',
                    'Go to health',
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputText(example);
                        handleSubmit(example);
                      }}
                      className="p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/40 hover:border-indigo-500/50 text-left text-slate-300 hover:text-white transition-all"
                    >
                      &quot;{example}&quot;
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showHistoryModal && (
        <ActionHistory
          onClose={() => setShowHistoryModal(false)}
          onRefreshAppState={onRefreshAppState}
        />
      )}
    </>
  );
};
