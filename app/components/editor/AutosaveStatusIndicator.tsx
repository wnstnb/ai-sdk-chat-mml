import React from 'react';
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react';

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';
export type LocalSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutosaveStatusIndicatorProps {
    status: AutosaveStatus;
    batchContext?: {
        isInBatch: boolean;
        batchType: 'ai-tools' | 'user-typing' | 'manual';
        batchChangesCount: number;
    };
    localSaveStatus?: LocalSaveStatus;
}

const LoadingSpinner = () => (
    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const AutosaveStatusIndicator: React.FC<AutosaveStatusIndicatorProps> = ({ 
    status, 
    batchContext,
    localSaveStatus 
}) => {
    let content = null;
    let title = '';
    
    const isInAIBatch = batchContext?.isInBatch && batchContext?.batchType === 'ai-tools';
    const hasMultipleChanges = (batchContext?.batchChangesCount || 0) > 1;
    
    // --- ADDED: Handle local save status display (takes precedence over server status) ---
    if (localSaveStatus === 'saving') {
        content = <><LoadingSpinner /><span>Local Save...</span></>;
        title = 'Saving to local storage (small changes)';
    } else if (localSaveStatus === 'saved') {
        content = <><CheckCircle2 size={14} className="text-blue-500 flex-shrink-0" /><span>Local Saved</span></>;
        title = 'Changes saved locally (will sync on page leave)';
    } else if (localSaveStatus === 'error') {
        content = <><AlertCircle size={14} className="text-orange-500 flex-shrink-0" /><span>Local Error</span></>;
        title = 'Error saving locally';
    } else {
        // Show server save status when no local save activity
        switch (status) {
        case 'unsaved':
            if (isInAIBatch && hasMultipleChanges) {
                content = <><Clock size={14} className="text-blue-500 flex-shrink-0" /><span>AI Editing ({batchContext?.batchChangesCount})</span></>;
                title = `AI is making multiple changes (${batchContext?.batchChangesCount} so far). Auto-save will wait until complete.`;
            } else if (isInAIBatch) {
                content = <><Clock size={14} className="text-blue-500 flex-shrink-0" /><span>AI Editing</span></>;
                title = 'AI is making changes. Auto-save will wait until complete.';
            } else {
                content = <><Clock size={14} className="text-yellow-500 flex-shrink-0" /><span>Unsaved</span></>;
                title = 'Document has unsaved changes';
            }
            break;
        case 'saving':
            if (hasMultipleChanges) {
                content = <><LoadingSpinner /><span>Saving ({batchContext?.batchChangesCount} changes)</span></>;
                title = `Saving ${batchContext?.batchChangesCount} batched changes...`;
            } else {
                content = <><LoadingSpinner /><span>Saving...</span></>;
                title = 'Saving document...';
            }
            break;
        case 'saved':
            if (hasMultipleChanges) {
                content = <><CheckCircle2 size={14} className="text-green-500 flex-shrink-0" /><span>Saved ({batchContext?.batchChangesCount} changes)</span></>;
                title = `Successfully saved ${batchContext?.batchChangesCount} batched changes`;
            } else {
                content = <><CheckCircle2 size={14} className="text-green-500 flex-shrink-0" /><span>Saved</span></>;
                title = 'Document saved successfully';
            }
            break;
        case 'error':
            content = <><AlertCircle size={14} className="text-red-500 flex-shrink-0" /><span>Error</span></>;
            title = 'Error saving document';
            break;
            case 'idle': // Idle state - show nothing or a subtle indicator if preferred
            default:
                // Optionally show a default state like 'Ready' or just nothing
                // For now, return null for idle to match previous behavior (no indicator when idle)
                return null;
        }
    }

    return (
        <div 
            className="flex items-center gap-1.5 text-sm text-[--muted-text-color]" 
            aria-live="polite" 
            aria-atomic="true"
            title={title}
        >
            {content}
        </div>
    );
}; 