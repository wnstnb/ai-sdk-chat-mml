/**
 * Formats recording duration in seconds to MM:SS format
 * @param seconds - Duration in seconds
 * @returns Formatted time string in MM:SS format
 * 
 * @example
 * formatRecordingTime(0) // "0:00"
 * formatRecordingTime(65) // "1:05"
 * formatRecordingTime(3661) // "61:01"
 */
export function formatRecordingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

/**
 * Type definition for recording timer state
 */
export interface RecordingTimerState {
  recordingStartTime: string | null;
  recordingDuration: number;
  isRecording: boolean;
}

/**
 * Helper function to calculate elapsed time from a start time
 * @param startTime - ISO string or null
 * @returns Elapsed seconds or 0 if no start time
 */
export function calculateElapsedTime(startTime: string | null): number {
  if (!startTime) return 0;
  
  const startTimeMs = new Date(startTime).getTime();
  const currentTimeMs = Date.now();
  return Math.floor((currentTimeMs - startTimeMs) / 1000);
} 