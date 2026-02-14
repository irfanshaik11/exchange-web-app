/**
 * Error Boundary Component
 *
 * Catches JavaScript errors in child components and displays a fallback UI
 * instead of crashing the entire application.
 *
 * Special handling for ChunkLoadError: automatically clears caches and reloads
 * once per session to recover from stale chunks after deployments.
 */

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /loading chunk [\d]+ failed/i.test(error.message || '') ||
    /loading css chunk/i.test(error.message || '')
  );
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    this.setState({ errorInfo });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Auto-recover from ChunkLoadError (stale chunks after deployment)
    if (isChunkLoadError(error)) {
      const EB_KEY = '__eb_chunk_retry';
      try {
        const already = sessionStorage.getItem(EB_KEY);
        if (!already) {
          sessionStorage.setItem(EB_KEY, '1');
          console.log('[ErrorBoundary] ChunkLoadError detected — clearing caches and reloading');
          // Clear non-image caches, then reload
          if (typeof caches !== 'undefined') {
            caches.keys().then((keys) => {
              const toDelete = keys.filter((k) => !k.includes('pulse-image-cache'));
              return Promise.all(toDelete.map((k) => caches.delete(k)));
            }).then(() => {
              window.location.reload();
            }).catch(() => {
              window.location.reload();
            });
          } else {
            window.location.reload();
          }
          return;
        }
        // Already tried auto-recovery — fall through to show fallback UI
        console.log('[ErrorBoundary] ChunkLoadError persists after auto-recovery — showing fallback');
      } catch (e) {
        // sessionStorage unavailable — fall through to fallback UI
      }
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    // Clear the auto-recovery flag so a fresh reload gets a clean slate
    try { sessionStorage.removeItem('__eb_chunk_retry'); } catch (e) {}
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg bg-[#16171C] p-6 text-center">
          <div className="mb-4 text-4xl">⚠️</div>
          <h2 className="mb-2 text-lg font-semibold text-white">
            Something went wrong
          </h2>
          <p className="mb-4 text-sm text-gray-400">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
            >
              Reload Page
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
            <details className="mt-4 w-full max-w-md text-left">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
                Error Details
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/50 p-2 text-xs text-red-400">
                {this.state.error?.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
