import { formatDistanceToNowStrict, format, isValid, parseISO, differenceInDays } from 'date-fns';

/**
 * Formats a date into a human-readable relative string or a specific date format.
 * - If the date is within the last 7 days, it shows as relative time (e.g., "3 hours ago", "2 days ago").
 * - If the date is older than 7 days, it shows as "MMM d, yyyy" (e.g., "Jun 5, 2025").
 * @param dateInput The date to format (string, number, or Date object).
 * @returns A formatted date string or an error message for invalid dates.
 */
export function formatRelativeDate(dateInput: string | number | Date): string {
  let dateObject: Date;

  if (typeof dateInput === 'string') {
    dateObject = parseISO(dateInput); // Handles ISO 8601 strings
  } else {
    dateObject = new Date(dateInput);
  }

  if (!isValid(dateObject)) {
    return 'Invalid date';
  }

  const now = new Date();
  if (differenceInDays(now, dateObject) < 7) {
    try {
      // formatDistanceToNowStrict doesn't add "ago" by default for some locales/versions,
      // so we add it manually for consistency.
      const distance = formatDistanceToNowStrict(dateObject, { addSuffix: false });
      // Handle cases like "0 seconds" which should be "just now" or similar
      if (distance === '0 seconds') return 'just now';
      // Add " ago" only if it's not already included by addSuffix (though we set it to false)
      // This check is more of a safeguard for future `date-fns` changes or locale differences.
      return distance.endsWith(' ago') ? distance : `${distance} ago`;
    } catch (e) {
      // Fallback for any unexpected error with formatDistanceToNowStrict
      return format(dateObject, 'MMM d, yyyy');
    }
  } else {
    return format(dateObject, 'MMM d, yyyy');
  }
} 