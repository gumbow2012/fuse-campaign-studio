import { useState, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Play, CheckCircle, AlertCircle, Copy } from "lucide-react";

const CF_WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

const FLOWS = [
  { label: "PAPPARAZI", recipeId: "dvgEXt4aeShCeokMq5MIpZ" },
  { label: "RAVEN", recipeId: "8pyXqysncP9g3L2ic8Nob8" },
  { label: "UGC MIRROR", recipeId: "pqLsbL5ZJ8tlBCf3rH8eL1" },
  { label: "ARMORED TRUCK", recipeId: "3XW2sv5u2GVW2V1HVtGjL0" },
  { label: "BLUE LAB", recipeId: "yRblK7UvAxiaRjEw9blCJz" },
  { label: "GARAGE", recipeId: "86BheMWSbZTZbjUrTRHY7o" },
  { label: "UNBOXING", recipeId: "EtWKBYSzByNh548YHW4JQe" },
  { label: "GAS STATION", recipeId: "itkxIO30C0huXXMrsYEwaN" },
  { label: "JEANS", recipeId: "RkWlfogU1nhPSxKqDHXOjE" },
  { label: "ICE PICK", recipeId: "xeKqScADHcfDu54ofVVujY" },
] as const;

type LogEntry = { ts: string; msg: string; type: "info" | "success" | "error" };

const FlowTest = () => {
  const { user } = useAuth();
  const [selectedFlow, setSelectedFlow] = useState<string>(FLOWS[0].recipeId);
  const [imageUrl, setImageUrl] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const log = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { ts: new Date().toISOString().slice(11, 19), msg, type }]);
  }, []);

  const getToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated — log in first");
    return session.access_token;
  };

  const handleRun = async () => {
    if (!imageUrl.trim()) return;
    setRunning(true);
    setLogs([]);
    setResult(null);
    if (pollRef.current) clearInterval(pollRef.current);

    const flowLabel = FLOWS.find((f) => f.recipeId === selectedFlow)?.label ?? selectedFlow;

    try {
      const token = await getToken();
      log(`Token acquired (${token.slice(0, 12)}…)`);

      // 1) Trigger
      log(`POST /weavy/trigger — flow=${flowLabel}`);
      const triggerRes = await fetch(`${CF_WORKER_URL}/weavy/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipeId: selectedFlow, imageUrl: imageUrl.trim() }),
      });
      const triggerData = await triggerRes.json();

      if (!triggerRes.ok) {
        log(`Trigger FAILED (${triggerRes.status}): ${triggerData.error || JSON.stringify(triggerData)}`, "error");
        setResult(triggerData);
        setRunning(false);
        return;
      }

      const projectId = triggerData.projectId;
      const weavyRunId = triggerData.weavyRunId;
      log(`Trigger OK — projectId=${projectId} weavyRunId=${weavyRunId}`, "success");
      setResult(triggerData);

      // 2) Poll
      log("Polling /api/job/… every 3s");
      let pollCount = 0;
      pollRef.current = setInterval(async () => {
        pollCount++;
        try {
          const freshToken = await getToken();
          const statusRes = await fetch(`${CF_WORKER_URL}/api/job/${projectId}`, {
            headers: { Authorization: `Bearer ${freshToken}` },
          });
          const statusData = await statusRes.json();

          if (statusData.status === "complete" || statusData.status === "succeeded") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            log(`COMPLETE after ${pollCount} polls`, "success");
            setResult(statusData);
            setRunning(false);
          } else if (statusData.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            log(`FAILED: ${statusData.error || "Unknown error"}`, "error");
            setResult(statusData);
            setRunning(false);
          } else {
            if (pollCount % 5 === 0) log(`Still ${statusData.status}… (poll #${pollCount})`);
          }
        } catch (err) {
          log(`Poll error: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
      }, 3000);
    } catch (err) {
      log(`Error: ${err instanceof Error ? err.message : String(err)}`, "error");
      setRunning(false);
    }
  };

  const checkWeavyHealth = async () => {
    log("GET /weavy/health…");
    try {
      const res = await fetch(`${CF_WORKER_URL}/health`);
      const data = await res.json();
      log(`Health: ${JSON.stringify(data)}`, res.ok ? "success" : "error");
    } catch (err) {
      log(`Health check failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="container mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="font-display text-2xl font-black tracking-tight mb-1">Flow Test Panel</h1>
        <p className="text-xs text-muted-foreground mb-6">
          Debug tool — triggers Weavy recipes via CF Worker with auto-refreshed Supabase tokens.
        </p>

        {!user && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-6">
            <p className="text-sm font-bold text-destructive">Not logged in</p>
            <p className="text-xs text-muted-foreground mt-1">Sign in first to get a valid session token.</p>
          </div>
        )}

        {/* Controls */}
        <div className="space-y-4 mb-6">
          {/* Flow selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1.5 block">Flow</label>
            <select
              value={selectedFlow}
              onChange={(e) => setSelectedFlow(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            >
              {FLOWS.map((f) => (
                <option key={f.recipeId} value={f.recipeId}>
                  {f.label} — {f.recipeId}
                </option>
              ))}
            </select>
          </div>

          {/* Image URL */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1.5 block">Image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://pub-…r2.dev/your-image.png"
              className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/40"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleRun}
              disabled={running || !imageUrl.trim() || !user}
              className="flex-1 h-10"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Run Flow</>
              )}
            </Button>
            <Button variant="outline" onClick={checkWeavyHealth} className="h-10 text-xs">
              Health Check
            </Button>
          </div>
        </div>

        {/* Result JSON */}
        {result && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Result</span>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <pre className="rounded-lg border border-border bg-card p-4 text-xs text-foreground overflow-x-auto max-h-64 overflow-y-auto font-mono">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {/* Log */}
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1.5 block">Log</span>
          <div className="rounded-lg border border-border bg-card p-3 max-h-72 overflow-y-auto space-y-0.5 font-mono text-[11px]">
            {logs.length === 0 && <p className="text-muted-foreground/40">No logs yet…</p>}
            {logs.map((l, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground/50 shrink-0">{l.ts}</span>
                <span className={
                  l.type === "error" ? "text-destructive" :
                  l.type === "success" ? "text-primary" :
                  "text-foreground/80"
                }>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowTest;
