import React from 'react';
import { ClarificationRequest, ClarificationOption } from '../../core/actions/actionTypes';
import { HelpCircle, ChevronRight } from 'lucide-react';

interface ClarificationPromptProps {
  request: ClarificationRequest;
  onSelectOption: (option: ClarificationOption) => void;
  onCancel: () => void;
}

export const ClarificationPrompt: React.FC<ClarificationPromptProps> = ({
  request,
  onSelectOption,
  onCancel,
}) => {
  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-200">
      <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200">
        <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-white">Clarification Needed</h4>
          <p className="text-xs text-amber-200/90 mt-0.5">{request.prompt}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400">Please choose one of the following options:</p>
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {request.options.map((option) => (
            <button
              key={option.id}
              onClick={() => onSelectOption(option)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-indigo-500/60 transition-all text-left group"
            >
              <div className="min-w-0 pr-2">
                <span className="block text-sm font-medium text-slate-100 group-hover:text-indigo-200">
                  {option.label}
                </span>
                {option.description && (
                  <span className="block text-xs text-slate-400 truncate mt-0.5">
                    {option.description}
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
