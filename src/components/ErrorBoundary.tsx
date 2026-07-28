import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { RefreshCw, AlertTriangle, Send, Check } from 'lucide-react';
import { buttonStyles, glassCardClass } from '../styles/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reported: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  declare state: State;
  declare props: Readonly<Props>;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, reported: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Forward to Sentry in all environments where the SDK is initialised.
    Sentry.captureException(error, { tags: { source: 'ErrorBoundary' }, extra: { componentStack: errorInfo.componentStack } });
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught render error:', error.message, errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, reported: false });
  };

  handleReportIssue = () => {
    if (this.state.error) {
      // Send to Sentry when configured; falls back silently when DSN is absent.
      Sentry.captureException(this.state.error, { tags: { source: 'ErrorBoundary' } });
    }
    this.setState({ reported: true });
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
              disabled={this.state.reported}
              className={`px-6 py-3 ${buttonStyles.secondary} rounded-xl font-bold text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {this.state.reported ? <><Check className="w-4 h-4" /> Reported</> : <><Send className="w-4 h-4" /> Report Issue</>}
            </button>
          </div>
          {/* Stack trace is only shown in development — never in production builds. */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 max-w-lg w-full">
              <summary className="text-xs text-zinc-500 cursor-pointer">Technical details</summary>
              <pre className="mt-2 text-xs text-red-400 text-left max-w-lg overflow-auto bg-white/5 p-3 rounded-lg border border-white/10">
                {`Error: ${this.state.error.message}\n\nStack:\n${this.state.error.stack || 'N/A'}`}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
