import { toast } from "sonner";

export interface ErrorHandlerOptions {
  // Define any options for the error handler, e.g., logging service, UI notification callback
  setErrorMessage?: (message: string) => void;
  logService?: (error: Error, context?: Record<string, any>) => void;
}

export const handleError = (
  error: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  options?: ErrorHandlerOptions,
  context?: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
): void => {
  console.error("Error occurred:", error);
  let message = "An unexpected error occurred. Please try again.";

  if (error instanceof Error) {
    // Standard JavaScript error
    message = error.message;
  }

  // Example: Distinguish error types or sources
  if (error?.response) {
    // Potentially an error from an HTTP request (e.g., Axios error)
    const { status, data } = error.response;
    message = `API Error (${status}): ${data?.message || error.message}`;
    switch (status) {
      case 400:
        message = `Invalid request (${status}). Please check your input. ${data?.message || ''}`.trim();
        break;
      case 401:
        message = `Unauthorized (${status}). Please log in again. ${data?.message || ''}`.trim();
        break;
      case 403:
        message = `Forbidden (${status}). You do not have permission to perform this action. ${data?.message || ''}`.trim();
        break;
      case 404:
        message = `Resource not found (${status}). ${data?.message || ''}`.trim();
        break;
      case 422: // Unprocessable Entity
        message = `Invalid input (${status}). ${data?.message || 'Please check the data you provided.'}`.trim();
        break;
      case 429:
        message = `Too many requests (${status}). Please try again later. ${data?.message || ''}`.trim();
        break;
      case 500:
        message = `Server error (${status}). Please try again later. ${data?.message || ''}`.trim();
        break;
      // Add more specific API error cases
      default:
        message = `API Error (${status}): ${data?.message || error.message || 'An unexpected API error occurred.'}`.trim();
        break;
    }
  } else if (error?.request) {
    // The request was made but no response was received
    message = "Network error. Please check your internet connection and try again.";
  }

  // Use options if provided
  if (options?.logService) {
    options.logService(error, { ...context, derivedMessage: message });
  }

  // Display the error message using Sonner toast
  toast.error(message);

  // If a specific setErrorMessage function is also provided, call it too.
  // This allows for more localized error display if needed, in addition to the global toast.
  if (options?.setErrorMessage) {
    options.setErrorMessage(message);
  }
  // In a real application, you might also send this error to a monitoring service
  // e.g., Sentry.captureException(error, { extra: { ...context, derivedMessage: message } });
};

// Example of a more specific error type
export class ApplicationError extends Error {
  public readonly context?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  public readonly isTrusted: boolean;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      context?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      isTrusted?: boolean;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.context = options?.context;
    this.isTrusted = options?.isTrusted ?? true; // Assume trusted unless specified
    Error.captureStackTrace(this, this.constructor);
  }
}

// Example of using the ApplicationError
export const handleApplicationError = (
  error: ApplicationError,
  options?: ErrorHandlerOptions
) => {
  console.warn(`ApplicationError handled: ${error.message}`, error.context);
  // Specific handling for trusted application errors
  if (options?.logService) {
    options.logService(error, {
      ...error.context,
      isTrusted: error.isTrusted,
    });
  }

  // Display the application error message using Sonner toast
  if (error.isTrusted) {
    toast.error(error.message);
  } else {
    toast.error("An unexpected application error occurred.");
  }

  // If a specific setErrorMessage function is also provided, call it too.
  if (options?.setErrorMessage && error.isTrusted) {
    options.setErrorMessage(error.message);
  } else if (options?.setErrorMessage) {
    options.setErrorMessage("An unexpected application error occurred.");
  }
};

// You might want a global error handler setup
// This is highly dependent on your framework (React, Next.js, etc.)
// For Next.js, you might use Error Boundaries for React components
// or a custom error handler for API routes.

/*
Example for a React Error Boundary (simplified):

import React, { Component, ErrorInfo, ReactNode } from "react";
import { handleError } from "./errorHandling"; // Assuming this file is in the same directory or accessible path

interface Props {
  children: ReactNode;
  fallbackUI?: ReactNode; // Optional custom UI to show on error
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorMessage: "Something went wrong in a component." };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
    handleError(error, {
      setErrorMessage: (message) => this.setState({ errorMessage: message })
    }, { componentStack: errorInfo.componentStack });
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallbackUI || <h1>{this.state.errorMessage || "Sorry.. there was an error"}</h1>;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
*/ 