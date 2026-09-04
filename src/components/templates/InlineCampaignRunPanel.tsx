/**
 * INLINE CAMPAIGN RUN PANEL — the whole run flow inside the product page.
 *
 * Presentation-only relocation of the builder's run flow: it reuses the exact
 * same pieces (TemplateInputCard for asset slots, `upload-run-input` through
 * `uploadRunInputFile`, `start-template-run` / `start-free-video-run`,
 * `get-job-status` polling, CampaignBuildGraph + CampaignResults) so nothing
 * about execution, credits, entitlement or auth changes here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import TemplateInputCard from "@/components/templates/TemplateInputCard";
import { CampaignBuildGraph, type PublicGraph } from "@/components/templates/CampaignBuildGraph";
import CampaignResults, { type CampaignResultOutput } from "@/components/templates/CampaignResults";
import GeneratePaywallModal from "@/components/mvp/GeneratePaywallModal";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { libraryKindForAssetType, saveLibraryAsset } from "@/services/libraryAssets";
import { fetchMyFreeVideoEntitlement, startFreeVideoRun } from "@/services/freeVideoRun";
import { readPublicFailure, type PublicGenerationFailure } from "@/lib/generationFailure";
import { track } from "@/lib/analytics/track";
import { trackFreeVideo } from "@/lib/analytics/freeVideoEvents";
import { cn } from "@/lib/utils";

export interface RunInputField {
  key: string;
  label: string;
  /** "image" | "video" behaves as an asset slot; anything else is a text field. */
  type: string;
  required: boolean;
}

type RunStatus = "queued" | "running" | "video_pending" | "complete" | "failed";

const ACTIVE_STATUSES = new Set<RunStatus>(["queued", "running", "video_pending"]);

interface RunState {
  status: RunStatus;
  progress: number;
  outputs: CampaignResultOutput[];
  publicFailure?: PublicGenerationFailure | null;
  publicGraph?: PublicGraph;
  statusMessage?: string;
}

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Missing authenticated session.");
  return session.access_token;
}

async function fetchJobStatus(jobId: string) {
  const token = await accessToken();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/get-job-status?jobId=${encodeURIComponent(jobId)}`,
    { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Could not load run status.");
  return data as {
    status: RunStatus;
    progress?: number;
    outputs?: CampaignResultOutput[];
    publicFailure?: PublicGenerationFailure | null;
    publicGraph?: PublicGraph;
    statusMessage?: string;
  };
}

async function startTemplateRun(versionId: string, inputs: Record<string, string>) {
  const token = await accessToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/start-template-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ versionId, inputs }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    track("template_run", { version_id: versionId, ok: false });
    throw new Error(data?.error ?? `Could not start the campaign (${response.status}).`);
  }
  track("template_run", { version_id: versionId, ok: true });
  return data as { jobId?: string; error?: string };
}

async function downloadOutput(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

interface Props {
  /** fuse_templates UUID — used by the free-video run. */
  templateId: string;
  /** Live version id — required by the paid run. */
  versionId: string | null;
  templateName: string;
  slug: string;
  creditCost: number | null;
  /** Catalog flag: this campaign offers the free first video. */
  freePreviewEnabled: boolean;
  inputFields: RunInputField[];
  className?: string;
  /** Lets the page react to the run lifecycle (e.g. swap the gallery). */
  onPhaseChange?: (phase: "idle" | "inputs" | "running" | "complete" | "failed") => void;
}

export default function InlineCampaignRunPanel({
  templateId,
  versionId,
  templateName,
  slug,
  creditCost,
  freePreviewEnabled,
  inputFields,
  className,
  onPhaseChange,
}: Props) {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isCreator, refreshProfile } = useAuth();
  const privileged = isAdmin || isCreator;

  const [stage, setStage] = useState<"cta" | "inputs">("cta");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [libraryAssets, setLibraryAssets] = useState<Record<string, { url: string; name?: string | null } | null>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<RunState | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [freeStatus, setFreeStatus] = useState<string | null>(null);
  /** Surfaced in the panel so a failed start is never an invisible no-op. */
  const [error, setError] = useState<string | null>(null);

  const assetFields = inputFields.filter((field) => field.type === "image" || field.type === "video");
  const textFields = inputFields.filter((field) => field.type !== "image" && field.type !== "video");
  const hasInputs = inputFields.length > 0;

  /* Signed-in free-video eligibility — read-only, server stays authoritative. */
  useEffect(() => {
    if (!user) {
      setFreeStatus(null);
      return;
    }
    let cancelled = false;
    void fetchMyFreeVideoEntitlement().then((entitlement) => {
      if (!cancelled) setFreeStatus(entitlement?.status ?? "available");
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const freeRunAvailable = freePreviewEnabled && !!user && freeStatus === "available";
  const balance = Number(profile?.credits_balance ?? 0);
  const shortOnCredits = !!user && !privileged && creditCost != null && balance < creditCost && !freeRunAvailable;

  const isFilled = (field: RunInputField) =>
    field.type === "image" || field.type === "video"
      ? !!files[field.key] || !!libraryAssets[field.key]?.url
      : !!textInputs[field.key]?.trim();

  const requiredReady = inputFields.filter((field) => field.required).every(isFilled);
  const readyCount = inputFields.filter(isFilled).length;

  const phase: "idle" | "inputs" | "running" | "complete" | "failed" = result
    ? result.status === "complete"
      ? "complete"
      : result.status === "failed"
        ? "failed"
        : "running"
    : stage === "inputs"
      ? "inputs"
      : "idle";

  const phaseRef = useRef(phase);
  useEffect(() => {
    if (phaseRef.current === phase) return;
    phaseRef.current = phase;
    onPhaseChange?.(phase);
  }, [onPhaseChange, phase]);

  /* Job-status polling — the same cadence the builder uses. */
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const status = await fetchJobStatus(jobId);
        if (cancelled) return;
        setResult((prev) => ({
          status: status.status,
          progress: status.progress ?? 0,
          outputs: Array.isArray(status.outputs) ? status.outputs : [],
          publicFailure: status.publicFailure ?? prev?.publicFailure ?? null,
          publicGraph: status.publicGraph ?? prev?.publicGraph,
          statusMessage: status.statusMessage ?? prev?.statusMessage,
        }));
        if (ACTIVE_STATUSES.has(status.status)) {
          timeoutId = window.setTimeout(poll, 3000);
        } else {
          void refreshProfile();
        }
      } catch {
        if (!cancelled) timeoutId = window.setTimeout(poll, 6000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [jobId, refreshProfile]);

  /** Uploads every asset slot through the existing run-input upload path. */
  const collectInputs = useCallback(async () => {
    const uploaded = Object.fromEntries(
      await Promise.all(
        assetFields
          .filter((field) => files[field.key] || libraryAssets[field.key]?.url)
          .map(async (field) => {
            const file = files[field.key];
            if (!file) return [field.key, libraryAssets[field.key]!.url];
            const url = await uploadRunInputFile(file);
            void saveLibraryAsset({
              kind: libraryKindForAssetType(undefined),
              url,
              name: file.name,
              metadata: { source: "template_input", input_key: field.key },
            });
            return [field.key, url];
          }),
      ),
    ) as Record<string, string>;

    const texts = Object.fromEntries(
      textFields
        .map((field) => [field.key, textInputs[field.key]?.trim() ?? ""])
        .filter(([, value]) => value.length > 0),
    ) as Record<string, string>;

    return { ...texts, ...uploaded };
  }, [assetFields, files, libraryAssets, textFields, textInputs]);

  const runNow = useCallback(async () => {
    if (hasInputs && !requiredReady) {
      toast({
        title: "Add your assets",
        description: "Fill every required slot before generating.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    setJobId(null);

    try {
      if (!privileged && !freeRunAvailable) {
        const fresh = (await refreshProfile()) ?? profile;
        const latestBalance = Number(fresh?.credits_balance ?? 0);
        if (creditCost != null && latestBalance < creditCost) {
          setPaywallOpen(true);
          return;
        }
      }

      let inputs: Record<string, string>;
      try {
        inputs = await collectInputs();
      } catch (uploadError) {
        throw new Error(
          uploadError instanceof Error
            ? `Asset upload failed — no credits were used. ${uploadError.message}`
            : "Asset upload failed — no credits were used.",
        );
      }

      if (freeRunAvailable) {
        trackFreeVideo("free_video_generation_started", {
          template_id: templateId,
          campaign_slug: slug,
        });
        const { jobId: freeJobId } = await startFreeVideoRun({ templateId, inputs });
        setJobId(freeJobId);
        setResult({ status: "queued", progress: 0, outputs: [] });
        setFreeStatus("reserved");
        toast({ title: "Your free video is generating", description: "This takes a few minutes." });
        return;
      }

      if (!versionId) throw new Error("This campaign is missing a live version.");
      track("generate", { template_id: templateId, surface: "product_page" });
      const data = await startTemplateRun(versionId, inputs);
      if (data?.error) throw new Error(String(data.error));
      if (!data?.jobId) throw new Error("The campaign did not return a job id.");
      setJobId(String(data.jobId));
      setResult({ status: "queued", progress: 0, outputs: [] });
      void refreshProfile();
      toast({ title: `${templateName} is running`, description: "Progress shows right here." });
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Could not start the campaign.";
      setError(message);
      toast({ title: "Generation failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [
    collectInputs,
    creditCost,
    freeRunAvailable,
    hasInputs,
    privileged,
    profile,
    refreshProfile,
    requiredReady,
    slug,
    templateId,
    templateName,
    versionId,
  ]);

  /** The single contextual CTA. Auth + entitlement behaviour is unchanged. */
  const handleCta = () => {
    if (!user) {
      navigate(
        `/auth?mode=signup&returnTo=${encodeURIComponent(`/templates/${slug}`)}&template=${encodeURIComponent(templateId)}`,
      );
      return;
    }
    if (shortOnCredits) {
      track("template_unlock_click", { template_id: templateId, surface: "product_page" });
      setPaywallOpen(true);
      return;
    }
    /* Always advance the panel: upload slots when the campaign needs assets,
       otherwise the confirm/generate step. Never a silent no-op. */
    setError(null);
    setStage("inputs");
  };

  const ctaLabel = !user && freePreviewEnabled
    ? "Try your first video free"
    : freeRunAvailable
      ? "Generate your free video"
      : shortOnCredits
        ? "Unlock access"
        : "Run campaign";

  const ctaSub = !user && freePreviewEnabled
    ? "Create an account and generate one video with your product."
    : freeRunAvailable
      ? "Your first video is on us — no credits used."
      : null;

  const costLine = freeRunAvailable
    ? "Free first video"
    : creditCost != null
      ? `${creditCost} credits`
      : null;

  const failureCopy = result?.publicFailure
    ? readPublicFailure(result.publicFailure)
    : null;

  /* ---------- rendering ---------- */

  if (result) {
    const running = ACTIVE_STATUSES.has(result.status);
    return (
      <div className={cn("space-y-4", className)}>
        {running ? (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--electric-cyan))]" aria-hidden />
              <p className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-white">
                {result.status === "video_pending" ? "Rendering video" : "Building your campaign"}
              </p>
            </div>
            <Progress value={Math.max(4, Math.min(100, result.progress))} className="mt-4 h-1.5" />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
              {result.statusMessage ?? "This usually takes a few minutes. Stay on this page."}
            </p>
            {result.publicGraph ? (
              <CampaignBuildGraph
                graph={result.publicGraph}
                statusMessage={result.statusMessage}
                progress={result.progress}
                runStatus={result.status}
                className="mt-5"
              />
            ) : null}
          </div>
        ) : result.status === "failed" ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-5">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-rose-100">
              {failureCopy?.title ?? "This run didn't finish"}
            </p>
            <p className="mt-2 text-sm leading-6 text-rose-100/80">
              {failureCopy?.message ??
                "Some clips didn't complete. You're not charged for anything that didn't finish."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
                onClick={() => {
                  setResult(null);
                  setJobId(null);
                  setStage(hasInputs ? "inputs" : "cta");
                }}
              >
                Try again
              </Button>
              {jobId ? (
                <Button
                  asChild
                  variant="ghost"
                  className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-300"
                >
                  <Link to={`/app/runs/${encodeURIComponent(jobId)}`}>See details</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.06] p-5">
              <p className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-emerald-100">
                Your campaign is ready
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">
                {result.outputs.length} {result.outputs.length === 1 ? "asset" : "assets"}
              </p>
            </div>
            <CampaignResults
              outputs={result.outputs}
              onDownload={(output, index) =>
                void downloadOutput(
                  output.url,
                  `${templateName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}.${output.type === "video" ? "mp4" : "jpg"}`,
                )
              }
            />
            <div className="flex flex-wrap gap-2">
              {jobId ? (
                <Button
                  asChild
                  className="rounded-full bg-[hsl(var(--electric-cyan))] text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
                >
                  <Link to={`/app/campaigns/${encodeURIComponent(jobId)}/edit`}>Edit campaign video</Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
                onClick={() => {
                  setResult(null);
                  setJobId(null);
                  setStage(hasInputs ? "inputs" : "cta");
                }}
              >
                Run again
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {stage === "inputs" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">
              {hasInputs ? "Add your product" : "Ready to generate"}
            </p>
            {hasInputs ? (
              <p
                className={cn(
                  "font-mono text-[9px] uppercase tracking-[0.2em]",
                  requiredReady ? "text-emerald-200" : "text-slate-500",
                )}
              >
                {readyCount}/{inputFields.length} ready
              </p>
            ) : null}
          </div>

          {hasInputs ? null : (
            <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-300">
              This campaign needs no uploads — generate it now.
            </p>
          )}


          {assetFields.map((field) => (
            <TemplateInputCard
              key={field.key}
              label={field.label}
              required={field.required}
              compact
              file={files[field.key] ?? null}
              libraryAsset={libraryAssets[field.key] ?? null}
              onFileChange={(file) => {
                setFiles((current) => ({ ...current, [field.key]: file }));
                if (file) setLibraryAssets((current) => ({ ...current, [field.key]: null }));
              }}
              onLibrarySelect={(asset) => {
                setLibraryAssets((current) => ({ ...current, [field.key]: asset }));
                setFiles((current) => ({ ...current, [field.key]: null }));
              }}
              onClear={() => {
                setFiles((current) => ({ ...current, [field.key]: null }));
                setLibraryAssets((current) => ({ ...current, [field.key]: null }));
              }}
            />
          ))}

          {textFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label
                htmlFor={`run-text-${field.key}`}
                className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-400"
              >
                {field.label}
              </label>
              <Input
                id={`run-text-${field.key}`}
                value={textInputs[field.key] ?? ""}
                onChange={(event) =>
                  setTextInputs((current) => ({ ...current, [field.key]: event.target.value }))
                }
                className="border-white/12 bg-black/40 text-sm text-white"
              />
            </div>
          ))}

          <Button
            type="button"
            onClick={() => void runNow()}
            disabled={!requiredReady || submitting}
            className="w-full rounded-full bg-[hsl(var(--electric-cyan))] py-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_40px_-12px_hsl(var(--electric-cyan)/0.85)] hover:bg-[hsl(var(--electric-blue))] disabled:opacity-45"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Starting
              </>
            ) : (
              <>
                Generate
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </Button>
          {costLine ? (
            <p className="text-center font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
              {costLine}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setStage("cta")}
            className="w-full text-center font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500 transition hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            onClick={handleCta}
            disabled={submitting}
            className="w-full rounded-full bg-[hsl(var(--electric-cyan))] py-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-950 shadow-[0_0_40px_-12px_hsl(var(--electric-cyan)/0.85)] hover:bg-[hsl(var(--electric-blue))]"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <>
                {ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </Button>
          {ctaSub ? (
            <p className="text-center text-[11px] leading-5 text-slate-400">{ctaSub}</p>
          ) : null}
        </>
      )}

      <GeneratePaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        templateName={templateName}
        creditsRequired={creditCost ?? 0}
        creditBalance={balance}
      />
      {/* Download affordance icon kept in the bundle for the results state. */}
      <Download className="hidden" aria-hidden />
    </div>
  );
}
