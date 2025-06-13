/**
 * AI Operation Error Boundary
 * Catches errors during AI operations to prevent editor crashes
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  children: ReactNode;
  fallbackComponent?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

export class AIOperationErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: `ai-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error for debugging
    console.error('[AIOperationErrorBoundary] Caught error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Show user-friendly error notification
    toast.error('An AI operation encountered an error, but the editor is still functional');

    // Auto-reset after 10 seconds to allow continued use
    this.resetTimeoutId = window.setTimeout(() => {
      this.handleReset();
    }, 10000);
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error boundary when props change (if enabled)
    if (this.props.resetOnPropsChange && prevProps.children !== this.props.children) {
      if (this.state.hasError) {
        this.handleReset();
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  handleReset = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  handleReportError = () => {
    const { error, errorInfo, errorId } = this.state;
    
    if (error && errorInfo && errorId) {
      // In a real application, this would send to an error reporting service
      console.log('[AIOperationErrorBoundary] Error report:', {
        errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });
      
      toast.success('Error report sent. Thank you for helping us improve!');
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback component if provided
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent;
      }

      // Default fallback UI
      return (
        <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/20 m-2">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                AI Operation Error
              </h3>
              
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                An error occurred during an AI operation, but the editor is still functional. 
                You can continue working with other parts of the document.
              </p>
              
              {this.state.error && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer hover:text-red-800 dark:hover:text-red-200">
                    Technical Details
                  </summary>
                  <pre className="mt-1 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-2 rounded overflow-auto max-h-32">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Try Again
                </button>
                
                <button
                  onClick={this.handleReportError}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Report Error
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based wrapper for functional components
 */
export const useAIOperationErrorBoundary = () => {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  return { captureError, resetError, hasError: !!error };
};

/**
 * Higher-order component to wrap components with AI operation error boundary
 */
export const withAIOperationErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallbackComponent?: ReactNode
) => {
  const WrappedComponent = (props: P) => (
    <AIOperationErrorBoundary fallbackComponent={fallbackComponent}>
      <Component {...props} />
    </AIOperationErrorBoundary>
  );

  WrappedComponent.displayName = `withAIOperationErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};

export default AIOperationErrorBoundary; 