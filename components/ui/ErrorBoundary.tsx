'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// A simple component to display when an error is caught
const ErrorDisplay: React.FC<{ error: Error | null, message?: string }> = ({ error, message }) => {
  return (
    <div style={{ padding: '20px', border: '1px solid red', margin: '20px', borderRadius: '5px', backgroundColor: '#ffebee', textAlign: 'center' }}>
      <h2>Something went wrong.</h2>
      <p>{message || "We're sorry, an unexpected error occurred."}</p>
      <button 
        onClick={() => window.location.reload()}
        style={{
          marginTop: '15px',
          padding: '10px 15px',
          border: 'none',
          borderRadius: '4px',
          backgroundColor: '#d32f2f', // A reddish color
          color: 'white',
          cursor: 'pointer',
          fontSize: '16px'
        }}
      >
        Refresh Page
      </button>
      {process.env.NODE_ENV === 'development' && error && (
        <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px', textAlign: 'left' }}>
          <summary>Error Details (Development Only)</summary>
          {error.toString()}
          <br />
          {error.stack}
        </details>
      )}
    </div>
  );
};

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null }; // errorInfo is set in componentDidCatch
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });
    // Example: logErrorToMyService(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <ErrorDisplay error={this.state.error} message={this.props.fallbackMessage} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 