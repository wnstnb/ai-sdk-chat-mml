/**
 * Retries an asynchronous operation with exponential backoff.
 * 
 * @param operation The asynchronous function to retry.
 * @param maxRetries The maximum number of retries (default is 3).
 * @param baseDelay The base delay in milliseconds for the first retry (default is 1000ms).
 * @returns A promise that resolves with the result of the operation if successful.
 * @throws The error from the last attempt if all retries fail.
 */
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T | undefined> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error(`Operation failed after ${maxRetries} retries.`, error);
        throw error; // Re-throw the error from the last attempt
      }
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Operation failed. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // This line should theoretically be unreachable if maxRetries > 0, 
  // as the loop will either return a result or throw an error.
  // Added for type safety / exhaustive checks if maxRetries could be 0 or negative.
  return undefined; 
}; 