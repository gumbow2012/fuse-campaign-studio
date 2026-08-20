import { Button } from "@/components/ui/button";

export const AuthSpinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export const AuthRetry = ({ onRetry }: { onRetry: () => void }) => (
  <div className="min-h-screen bg-background flex items-center justify-center px-6">
    <div className="w-full max-w-md rounded-xl border border-border/40 bg-card p-8 text-center">
      <h1 className="font-display text-xl font-black text-foreground mb-2">
        Couldn't verify your access
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        We couldn't confirm your account permissions. Check your connection and try again.
      </p>
      <Button onClick={onRetry} className="w-full font-bold">
        Retry
      </Button>
    </div>
  </div>
);
