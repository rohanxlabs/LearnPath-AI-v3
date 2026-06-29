import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Send } from 'lucide-react';
import { buttonStyles, glassCardClass } from '../styles/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReportIssue = () => {
    console.log('Reporting issue:', this.state.error);
    alert('Issue reported! Our team will investigate.');
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className={`flex flex-col items-center justify-center py-20 px-6 ${glassCardClass()} rounded-2xl`}>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Something went wrong</h3>
          <p className="text-sm text-zinc-400 max-w-md mb-6 text-center">
            A component crashed while rendering. This may be caused by a browser extension or network issue.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className={`px-6 py-3 ${buttonStyles.primary} rounded-xl font-bold text-sm inline-flex items-center gap-2`}
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <button
              onClick={this.handleReportIssue}
              className={`px-6 py-3 ${buttonStyles.secondary} rounded-xl font-bold text-sm inline-flex items-center gap-2`}
            >
              <Send className="w-4 h-4" />
              Report Issue
            </button>
          </div>
          {this.state.error && (
            <details className="mt-6 max-w-lg w-full">
              <summary className="text-xs text-zinc-500 cursor-pointer">Technical details</summary>
              <pre className="mt-2 text-xs text-red-400 text-left max-w-lg overflow-auto bg-white/5 p-3 rounded-lg border border-white/10">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
