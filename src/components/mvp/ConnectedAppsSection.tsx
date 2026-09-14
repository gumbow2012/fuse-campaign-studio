import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Grant = {
  client: { id: string; name: string };
  scopes: string[];
  granted_at: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ConnectedAppsSection() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.oauth.listGrants();
      setGrants(!error && Array.isArray(data) ? (data as Grant[]) : []);
    } catch {
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDisconnect = async (grant: Grant) => {
    setRevokingId(grant.client.id);
    try {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId: grant.client.id });
      if (error) throw error;
      toast({ title: `${grant.client.name} disconnected` });
      await load();
    } catch (error) {
      toast({
        title: "Could not disconnect",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section
      id="connected-apps"
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    >
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Connected apps</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Apps and assistants you have allowed to work with your FUSE account.
      </p>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Loading…
        </div>
      ) : grants.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">No connected apps yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {grants.map((grant) => (
            <li
              key={grant.client.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="min-w-0">
                <p className="font-sans text-sm font-semibold text-white">{grant.client.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Connected {formatDate(grant.granted_at)}</p>
                {grant.scopes?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {grant.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] text-cyan-200"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={revokingId === grant.client.id}
                onClick={() => void handleDisconnect(grant)}
                className="rounded-full border-destructive/40 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20"
              >
                {revokingId === grant.client.id ? "Disconnecting…" : "Disconnect"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
