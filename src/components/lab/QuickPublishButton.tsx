import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type QuickPublishGate = {
  publishable: boolean;
  tested: boolean;
  reasons: string[];
  versionId: string;
  templateId: string;
  versionNumber: number;
  isActive: boolean;
  isFork: boolean;
  structuralIssueCount: number;
  executionNodeCount: number;
  customerInputCount: number;
  finalOutputCount: number;
  completedRunCount: number;
  latestTestJobId: string | null;
};

type Props = {
  versionId: string | null | undefined;
  templateName?: string | null;
  versionNumber?: number | null;
  /** True while a test run is still executing — button shows "Publish when ready". */
  building?: boolean;
  size?: "sm" | "default";
  variant?: "default" | "outline";
  className?: string;
  /** Optional hook to trigger a test run in place when the gate reports not tested. */
  onRunTest?: () => void;
  onPublished?: (result: { versionId: string; templateId: string }) => void | Promise<void>;
};

export function useQuickPublishAccess() {
  const { roles } = useAuth();
  return roles.includes("admin") || roles.includes("dev");
}

export default function QuickPublishButton({
  versionId,
  templateName,
  versionNumber,
  building = false,
  size = "sm",
  variant = "default",
  className,
  onRunTest,
  onPublished,
}: Props) {
  const canQuickPublish = useQuickPublishAccess();
  const [open, setOpen] = useState(false);
  const [loadingGate, setLoadingGate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [gate, setGate] = useState<QuickPublishGate | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ name: string; version: number } | null>(null);

  const loadGate = useCallback(async () => {
    if (!versionId) return;
    setLoadingGate(true);
    setGateError(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-template-workbench", {
        body: { action: "quick_publish_gate", versionId },
      });
      if (error) throw error;
      const payload = data as { quickGate?: QuickPublishGate; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      setGate(payload?.quickGate ?? null);
    } catch (error) {
      setGate(null);
      setGateError(error instanceof Error ? error.message : "Could not check publish requirements");
    } finally {
      setLoadingGate(false);
    }
  }, [versionId]);

  const openModal = useCallback(() => {
    setPublished(null);
    setOpen(true);
    void loadGate();
  }, [loadGate]);

  const publishNow = useCallback(async () => {
    if (!versionId) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-template-workbench", {
        body: { action: "quick_publish_version", versionId },
      });
      if (error) throw error;
      const payload = data as
        | { error?: string; templateName?: string | null; versionNumber?: number; templateId?: string }
        | null;
      if (payload?.error) throw new Error(payload.error);
      setPublished({
        name: payload?.templateName ?? templateName ?? "Template",
        version: Number(payload?.versionNumber ?? versionNumber ?? gate?.versionNumber ?? 0),
      });
      await onPublished?.({ versionId, templateId: payload?.templateId ?? gate?.templateId ?? "" });
    } catch (error) {
      toast({
        title: "Quick publish failed",
        description: error instanceof Error ? error.message : "Could not publish this version",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }, [gate?.templateId, gate?.versionNumber, onPublished, templateName, versionId, versionNumber]);

  if (!canQuickPublish || !versionId) return null;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn("rounded-full font-semibold", className)}
        disabled={building}
        onClick={openModal}
        title={building ? "Publish when ready" : "Quick publish this version live"}
      >
        <Zap className="mr-2 h-4 w-4" />
        {building ? "Publish when ready" : "Quick Publish"}
      </Button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setPublished(null); }}>
        <DialogContent className="sm:max-w-md">
          {published ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                  LIVE
                </DialogTitle>
                <DialogDescription>
                  {published.name} v{published.version} is now the marketplace version.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
                <Button asChild size="sm">
                  <Link to="/app/templates">View in marketplace</Link>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-300" />
                  Quick Publish
                </DialogTitle>
                <DialogDescription>
                  {templateName ? `${templateName}${versionNumber ? ` v${versionNumber}` : ""} — ` : ""}
                  deterministic safety checks only.
                </DialogDescription>
              </DialogHeader>

              {loadingGate ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking requirements…
                </div>
              ) : gateError ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                  {gateError}
                </p>
              ) : gate ? (
                <div className="space-y-3 text-sm">
                  <ul className="space-y-1.5">
                    <GateLine ok={gate.structuralIssueCount === 0 && gate.executionNodeCount > 0} label="Workflow connected" />
                    <GateLine ok={gate.customerInputCount > 0} label={`${gate.customerInputCount} customer input${gate.customerInputCount === 1 ? "" : "s"}`} />
                    <GateLine ok={gate.finalOutputCount > 0} label={`${gate.finalOutputCount} final output${gate.finalOutputCount === 1 ? "" : "s"}`} />
                    <GateLine ok={gate.tested} label="Latest test completed" />
                  </ul>

                  {gate.tested ? (
                    <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs font-medium text-amber-100">
                      This skips the full FUSE output audit.
                    </p>
                  ) : (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.1] px-3 py-2 text-xs font-semibold text-amber-100">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      NOT TESTED — This version has not completed a test run.
                    </p>
                  )}

                  {gate.reasons.length ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {gate.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                {gate && !gate.tested ? (
                  onRunTest ? (
                    <Button size="sm" onClick={() => { setOpen(false); onRunTest(); }}>Run test</Button>
                  ) : (
                    <Button asChild size="sm">
                      <Link to={`/app/lab/canvas?versionId=${versionId}`}>Run test</Link>
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    disabled={!gate?.publishable || publishing || loadingGate}
                    onClick={() => void publishNow()}
                  >
                    {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    Publish now
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GateLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-2", ok ? "text-emerald-200" : "text-muted-foreground")}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4 text-amber-200" />}
      {label}
    </li>
  );
}
