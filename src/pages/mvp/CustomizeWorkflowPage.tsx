/**
 * TR9 — Pro personal workflow editor.
 *
 * A calm, customer-facing editor for a PRIVATE fork. No admin/creator controls:
 * no publish, submit, activate version, delete, marketplace metadata, approval,
 * attribution, versioning or admin test runs. Hidden creator prompts never
 * arrive here (server strips them for prompt-hidden forks).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { Loader2, RotateCcw, Copy, Play, Save } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  createFork,
  estimateForkRun,
  getFork,
  resetFork,
  runFork,
  updateFork,
  type PersonalGraph,
  type PersonalGraphNode,
  type TemplateFork,
} from "@/services/templateForks";

const PROMPTABLE = ["prompt", "image_gen", "video_gen"];
const SETTING_LABELS: Record<string, string> = {
  model: "Model",
  aspect_ratio: "Aspect ratio",
  aspectRatio: "Aspect ratio",
  resolution: "Resolution",
  duration: "Duration",
  duration_seconds: "Duration (seconds)",
};

function stageLabel(nodeType: string) {
  if (nodeType === "user_input") return "YOUR ASSETS";
  if (nodeType === "prompt") return "DIRECTION";
  if (nodeType === "image_gen") return "IMAGE STEPS";
  if (nodeType === "video_gen") return "MOTION STEPS";
  return "SUPPORTING STEPS";
}

const STAGE_ORDER = ["YOUR ASSETS", "DIRECTION", "IMAGE STEPS", "MOTION STEPS", "SUPPORTING STEPS"];

export default function CustomizeWorkflowPage() {
  const { forkId } = useParams<{ forkId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [fork, setFork] = useState<TemplateFork | null>(null);
  const [graph, setGraph] = useState<PersonalGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [running, setRunning] = useState(false);
  const [needsCredits, setNeedsCredits] = useState(false);
  const runKeyRef = useRef<string | null>(null);

  /** TR10b — server-authoritative dry-run cost (no charge, no job). */
  const refreshEstimate = useCallback(async () => {
    if (!forkId) return;
    setEstimating(true);
    try {
      const { estimatedCredits: credits } = await estimateForkRun(forkId);
      setEstimatedCredits(credits);
    } catch {
      setEstimatedCredits(null);
    } finally {
      setEstimating(false);
    }
  }, [forkId]);

  useEffect(() => {
    if (!forkId || accessDenied) return;
    void refreshEstimate();
  }, [forkId, accessDenied, refreshEstimate]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true, state: { redirectTo: `/app/templates/customize/${forkId ?? ""}` } });
      return;
    }
    if (!forkId) return;
    let cancelled = false;
    setLoading(true);
    getFork(forkId)
      .then((data) => {
        if (cancelled) return;
        setFork(data);
        setGraph(data.personalGraph);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const code = (error as { code?: string })?.code ?? "";
        if (code === "FORBIDDEN" || code === "HTTP_403") setAccessDenied(true);
        else toast({ title: "Couldn't load your private version", variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forkId, user, authLoading, navigate]);

  const groups = useMemo(() => {
    const map = new Map<string, PersonalGraphNode[]>();
    for (const node of graph?.nodes ?? []) {
      const label = stageLabel(node.node_type);
      const bucket = map.get(label) ?? [];
      bucket.push(node);
      map.set(label, bucket);
    }
    return STAGE_ORDER.filter((label) => map.has(label)).map((label) => ({
      label,
      nodes: map.get(label)!,
    }));
  }, [graph]);

  const patchNode = (id: string, patch: Partial<PersonalGraphNode>) => {
    setGraph((current) =>
      current
        ? { ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) }
        : current,
    );
  };

  const patchSetting = (id: string, key: string, value: string) => {
    setGraph((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === id ? { ...node, settings: { ...node.settings, [key]: value } } : node,
            ),
          }
        : current,
    );
  };

  const handleSave = async () => {
    if (!forkId || !graph) return;
    setSaving(true);
    try {
      await updateFork(forkId, graph);
      toast({ title: "Saved", description: "Your private version is up to date." });
      await refreshEstimate();
    } catch {
      toast({ title: "Couldn't save your changes", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * TR10b — auto-save, then run the private fork. Inputs are omitted so the
   * server reuses the originating run's assets (owner-scoped, server-priced).
   */
  const handleRun = async () => {
    if (!forkId || running) return;
    setRunning(true);
    setNeedsCredits(false);
    try {
      if (graph) await updateFork(forkId, graph);
      // One key per fork run attempt — a double-click can never double-charge.
      if (!runKeyRef.current) runKeyRef.current = crypto.randomUUID();
      const { jobId } = await runFork(forkId, runKeyRef.current);
      runKeyRef.current = null;
      navigate(`/app/templates?run=${jobId}`);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code === "INSUFFICIENT_CREDITS" || code === "HTTP_402" || code === "MEMBERSHIP_REQUIRED") {
        setNeedsCredits(true);
      } else if (code === "PRO_REQUIRED" || code === "FORBIDDEN" || code === "HTTP_403") {
        toast({
          title: "Pro membership required",
          description: "Personal versions run on Pro and above.",
        });
      } else {
        toast({
          title: "Couldn't start your run",
          description: (error as Error)?.message ?? undefined,
          variant: "destructive",
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const handleReset = async () => {
    if (!forkId) return;
    setResetting(true);
    try {
      await resetFork(forkId);
      const refreshed = await getFork(forkId);
      setFork(refreshed);
      setGraph(refreshed.personalGraph);
      toast({ title: "Reset", description: "Back to the original template." });
    } catch {
      toast({ title: "Couldn't reset this version", variant: "destructive" });
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!fork) return;
    setDuplicating(true);
    try {
      const created = await createFork(fork.sourceTemplateId);
      navigate(`/app/templates/customize/${created.forkId}`);
    } catch {
      toast({ title: "Couldn't duplicate this version", variant: "destructive" });
    } finally {
      setDuplicating(false);
    }
  };

  if (accessDenied) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="font-display text-2xl tracking-[0.14em] text-slate-100">YOU DON'T HAVE ACCESS</h1>
          <p className="mt-3 text-sm text-slate-400">
            This private version belongs to another account.
          </p>
          <Button className="mt-6" onClick={() => navigate("/app/templates")}>
            Back to templates
          </Button>
        </div>
      </SiteShell>
    );
  }

  if (loading || !graph || !fork) {
    return (
      <SiteShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-200 motion-reduce:animate-none" />
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <h1 className="font-display text-2xl tracking-[0.14em] text-slate-100 sm:text-3xl">
            YOUR PRIVATE VERSION
          </h1>
          <p className="mt-2 text-sm font-semibold tracking-[0.1em] text-cyan-200/90">{fork.basedOn}</p>
          <p className="mt-3 text-sm text-slate-400">
            Only you can see these changes. Your edits never affect the original template.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setResetOpen(true)} disabled={resetting}>
              <RotateCcw className="h-4 w-4" />
              Reset to original template
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => void handleDuplicate()} disabled={duplicating}>
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Copy className="h-4 w-4" />}
              Duplicate personal version
            </Button>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Estimated run cost:{" "}
              <span className="font-semibold text-slate-100">
                {estimating && estimatedCredits === null
                  ? "calculating…"
                  : estimatedCredits === null
                    ? "unavailable"
                    : `${estimatedCredits.toLocaleString()} credits`}
              </span>
            </p>
            <Button
              className="mt-3 gap-2"
              onClick={() => void handleRun()}
              disabled={running || saving || estimatedCredits === null}
            >
              {running
                ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                : <Play className="h-4 w-4" />}
              <span className="font-display tracking-[0.14em]">
                RUN MY VERSION{estimatedCredits !== null ? ` · ${estimatedCredits.toLocaleString()} CR` : ""}
              </span>
            </Button>
            {needsCredits && (
              <p className="mt-3 text-sm text-amber-200">
                You don't have enough credits for this run.{" "}
                <Link to="/app/membership" className="underline">
                  Top up your credits
                </Link>{" "}
                and try again.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              This reuses the assets from the run you customized — no re-uploading needed.
            </p>
          </div>
        </header>

        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="font-display text-xs tracking-[0.22em] text-slate-400">{group.label}</h2>
              <div className="mt-3 space-y-4">
                {group.nodes.map((node) => {
                  const promptable = PROMPTABLE.includes(node.node_type);
                  const settingKeys = Object.keys(node.settings ?? {});
                  return (
                    <article
                      key={node.id}
                      className="rounded-xl border border-white/10 bg-[#0c101c]/80 p-4 sm:p-5"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold tracking-[0.08em] text-slate-100">
                          {node.name || "Step"}
                        </h3>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          {node.node_type.replace(/_/g, " ")}
                        </span>
                      </div>

                      {promptable && fork.promptVisibility && (
                        <div className="mt-4">
                          <label className="text-xs uppercase tracking-[0.16em] text-slate-400" htmlFor={`prompt-${node.id}`}>
                            Prompt
                          </label>
                          <Textarea
                            id={`prompt-${node.id}`}
                            className="mt-2 min-h-24 bg-black/30"
                            value={node.prompt ?? ""}
                            onChange={(event) => patchNode(node.id, { prompt: event.target.value })}
                          />
                        </div>
                      )}

                      {promptable && !fork.promptVisibility && (
                        <div className="mt-4">
                          <label className="text-xs uppercase tracking-[0.16em] text-slate-400" htmlFor={`direction-${node.id}`}>
                            Your direction
                          </label>
                          <Textarea
                            id={`direction-${node.id}`}
                            className="mt-2 min-h-24 bg-black/30"
                            placeholder="e.g. colder lighting, tighter framing"
                            value={node.directionOverride ?? ""}
                            onChange={(event) => patchNode(node.id, { directionOverride: event.target.value })}
                          />
                          <p className="mt-2 text-xs text-slate-500">
                            Added on top of this step's built-in direction.
                          </p>
                        </div>
                      )}

                      {settingKeys.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {settingKeys.map((key) => (
                            <div key={key}>
                              <label
                                className="text-xs uppercase tracking-[0.16em] text-slate-400"
                                htmlFor={`setting-${node.id}-${key}`}
                              >
                                {SETTING_LABELS[key] ?? key}
                              </label>
                              <Input
                                id={`setting-${node.id}-${key}`}
                                className="mt-2 bg-black/30"
                                value={String(node.settings[key] ?? "")}
                                onChange={(event) => patchSetting(node.id, key, event.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {!promptable && settingKeys.length === 0 && (
                        <p className="mt-3 text-xs text-slate-500">
                          This step runs automatically — nothing to adjust.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0c101c] text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-[0.12em]">RESET TO ORIGINAL?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This discards your edits and restores the original template settings for this private version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my edits</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReset()}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SiteShell>
  );
}
