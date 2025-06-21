'use client';

import React from 'react';
import { X } from 'lucide-react';

interface RecordingStatusOverlayProps {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Formatted timer string (e.g., "1:23") */
  formattedTime: string;
  /** Optional cancel recording function */
  onCancelRecording?: () => void;
  /** Show cancel button (defaults to false) */
  showCancelButton?: boolean;
  /** Custom aria label for the timer */
  timerAriaLabel?: string;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Reusable recording status overlay component
 * Displays recording dot, timer, status text, and optional cancel button
 * 
 * Designed to be positioned absolutely over audio visualizers
 */
export const RecordingStatusOverlay: React.FC<RecordingStatusOverlayProps> = ({
  isRecording,
  formattedTime,
  onCancelRecording,
  showCancelButton = false,
  timerAriaLabel,
  className = '',
}) => {
  if (!isRecording) {
    return null;
  }

  const defaultTimerAriaLabel = `Recording duration: ${formattedTime}`;

  return (
    <div 
      className={`absolute inset-0 pointer-events-none flex items-center justify-between px-3 z-20 ${className}`}
    >
      {/* Left: Recording Status Indicators */}
      <div className="flex items-center gap-2 pointer-events-none">
        {/* Recording Dot */}
        <div 
          className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg" 
          role="status"
          aria-label="Recording in progress"
        />
        
        {/* Timer Display */}
        <span 
          className="text-sm font-mono font-medium text-red-600 dark:text-red-400 bg-white/90 dark:bg-gray-900/90 px-2 py-1 rounded-md shadow-sm backdrop-blur-sm"
          aria-live="polite"
          aria-label={timerAriaLabel || defaultTimerAriaLabel}
        >
          {formattedTime}
        </span>
        
        {/* Recording Status Text */}
        <span className="text-xs text-red-600 dark:text-red-400 font-medium bg-white/80 dark:bg-gray-900/80 px-1.5 py-0.5 rounded backdrop-blur-sm">
          Recording...
        </span>
      </div>
      
      {/* Right: Optional Cancel Button */}
      {showCancelButton && onCancelRecording && (
        <div className="flex items-center gap-2 pointer-events-auto z-30">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancelRecording();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-6 h-6 rounded-full bg-gray-500/80 hover:bg-gray-600/80 dark:bg-gray-400/80 dark:hover:bg-gray-300/80 text-white dark:text-gray-900 flex items-center justify-center transition-colors duration-200 backdrop-blur-sm cursor-pointer"
            title="Cancel recording"
            aria-label="Cancel recording"
            style={{ pointerEvents: 'auto' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default RecordingStatusOverlay; 