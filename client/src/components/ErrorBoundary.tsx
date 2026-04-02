import { cn } from "@/lib/utils";
import { TrendingUp, RotateCcw, Home } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-sm text-center gap-6">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>

            {/* Copy */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                PortfoliGo hit an unexpected error. Your portfolio data is safe — try reloading the page.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 transition-opacity cursor-pointer"
                )}
              >
                <RotateCcw size={14} />
                Reload
              </button>
              <button
                onClick={() => { window.location.href = "/"; }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                  "border border-border/60 bg-card text-foreground",
                  "hover:bg-muted/50 transition-colors cursor-pointer"
                )}
              >
                <Home size={14} />
                Go Home
              </button>
            </div>

            {/* Error code (not stack trace) for support reference */}
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/50 font-mono max-w-xs truncate">
                {this.state.error.message.slice(0, 80)}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
