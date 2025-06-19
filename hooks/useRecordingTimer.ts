import { useState, useEffect, useCallback } from 'react';
import { formatRecordingTime, calculateElapsedTime, RecordingTimerState } from '@/lib/utils/formatRecordingTime';

/**
 * Custom hook for managing recording timer state
 * Provides recording duration tracking and formatted time display
 */
export function useRecordingTimer(isRecording: boolean, recordingStartTime: string | null = null) {
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  // Timer effect that updates duration every second when recording
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    
    if (isRecording && recordingStartTime) {
      // Start timer - update every second
      timerInterval = setInterval(() => {
        const elapsed = calculateElapsedTime(recordingStartTime);
        setRecordingDuration(elapsed);
      }, 1000);
    } else {
      // Reset timer when not recording
      setRecordingDuration(0);
    }

    // Cleanup interval on unmount or when recording stops
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isRecording, recordingStartTime]);

  // Memoized formatted time string
  const formattedTime = useCallback(() => {
    return formatRecordingTime(recordingDuration);
  }, [recordingDuration]);

  return {
    recordingDuration,
    formattedTime,
    setRecordingDuration, // Allow manual duration setting if needed
  };
}

/**
 * Alternative hook that manages its own start time state
 * Useful when the component needs to track its own recording lifecycle
 */
export function useRecordingTimerWithStartTime(isRecording: boolean) {
  const [recordingStartTime, setRecordingStartTime] = useState<string | null>(null);
  
  // Update start time when recording state changes
  useEffect(() => {
    if (isRecording && !recordingStartTime) {
      // Recording just started
      const timestamp = new Date().toISOString();
      setRecordingStartTime(timestamp);
    } else if (!isRecording) {
      // Recording stopped - keep start time for potential resume or clear it
      // This depends on the component's needs
    }
  }, [isRecording, recordingStartTime]);

  const timer = useRecordingTimer(isRecording, recordingStartTime);

  const resetTimer = useCallback(() => {
    setRecordingStartTime(null);
    timer.setRecordingDuration(0);
  }, [timer]);

  return {
    ...timer,
    recordingStartTime,
    setRecordingStartTime,
    resetTimer,
  };
} 