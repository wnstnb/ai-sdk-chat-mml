import React from 'react';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';

type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

interface AutosaveStatusIndicatorProps {
    status: AutosaveStatus;
}

// Simple loading spinner SVG component
const LoadingSpinner = () => (
    <svg className="animate-spin h-3.5 w-3.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

export const AutosaveStatusIndicator: React.FC<AutosaveStatusIndicatorProps> = ({ status }) => {

    let content = null;
    switch (status) {
        case 'unsaved':
            content = <><Clock size={14} className="text-yellow-500 flex-shrink-0" /><span>Unsaved</span></>;
            break;
        case 'saving':
            content = <><LoadingSpinner /><span>Saving...</span></>;
            break;
        case 'saved':
            content = <><CheckCircle2 size={14} className="text-green-500 flex-shrink-0" /><span>Saved</span></>;
            break;
        case 'error':
            content = <><AlertCircle size={14} className="text-red-500 flex-shrink-0" /><span>Error</span></>;
            break;
        case 'idle': // Idle state - show nothing or a subtle indicator if preferred
        default:
            // Optionally show a default state like 'Ready' or just nothing
            // For now, return null for idle to match previous behavior (no indicator when idle)
            return null;
    }

    return (
        <div className="flex items-center gap-1.5 text-sm text-[--muted-text-color]" aria-live="polite" aria-atomic="true">
            {content}
        </div>
    );
}; 