import { useState } from "react";
import { Loader2, CreditCard, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Mismatch = { accountId: string; displayName: string | null };

export default function LiveBillingProvisionCard() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState<Mismatch | null>(null);

  const run = async (confirmAccountId?: string) => {
    setRunning(true);
    setResult(null);
    setMismatch(null);
    try {
      const { data, error } = await supabase.functions.invoke("provision-live-billing", {
        body: confirmAccountId ? { confirmAccountId } : {},
      });

      let payload: any = data;
      if (error) {
        const context = (error as { context?: Response }).context;
        const text = context ? await context.text().catch(() => "") : "";
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = null;
        }
        if (payload?.error === "LIVE_STRIPE_ACCOUNT_MISMATCH") {
          setMismatch({ accountId: payload.accountId, displayName: payload.displayName ?? null });
          setResult(payload);
          return;
        }
        throw new Error(payload?.error || error.message || "Provisioning failed");
      }

      if (payload?.error) throw new Error(String(payload.error));
      setResult(payload);
      toast.success("Live billing catalog provisioned");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provisioning failed";
      toast.error(message);
      setResult({ error: message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-background/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CreditCard className="h-4 w-4" /> Live billing provisioning
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Verifies the live billing account, then creates or reuses subscription and credit-pack
            products/prices and records them in the billing catalog. Idempotent — existing prices are reused.
          </p>
        </div>
        <Button type="button" size="sm" className="rounded-full" disabled={running} onClick={() => void run()}>
          {running ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Provision live billing
        </Button>
      </div>

      {mismatch ? (
        <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <ShieldAlert className="h-4 w-4" /> Account mismatch — nothing was created
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            Connected account: <span className="font-mono">{mismatch.accountId}</span>
            {mismatch.displayName ? ` (${mismatch.displayName})` : ""}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 rounded-full"
            disabled={running}
            onClick={() => void run(mismatch.accountId)}
          >
            Confirm this account and provision
          </Button>
        </div>
      ) : null}

      {result ? (
        <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-border/50 bg-black/40 p-4 text-[11px] leading-relaxed text-foreground/80">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
