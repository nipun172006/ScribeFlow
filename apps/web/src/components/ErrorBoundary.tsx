import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time exceptions anywhere in the React tree so a single
 * component throw degrades to a recoverable error card instead of a blank app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the failure during development; production logging would hook here.
    console.error("ScribeFlow render error", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-panel border border-error/35 bg-error/10 p-6 text-center shadow-soft backdrop-blur-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-error/30 bg-error/10 text-error">
            <AlertTriangle size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-primary">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            An unexpected error interrupted the page. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition duration-fast hover:bg-accent/90"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
