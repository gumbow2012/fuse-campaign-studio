import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-wide render guard: a single component crash should degrade to a
 * recoverable screen, never a blank page.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never swallow silently — surface for debugging.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-black/30 p-8 text-center">
          <h1 className="text-lg font-semibold uppercase tracking-[0.18em] text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            This screen hit an unexpected error. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-white/10"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
