/**
 * INLINE CAMPAIGN RUN PANEL — the whole run flow inside the product page.
 *
 * Presentation was redesigned (calm Apple-style reference list + generation
 * summary), but the pipeline is untouched: `upload-run-input` through
 * `uploadRunInputFile`, `start-template-run` / `start-free-video-run`,
 * `get-job-status` polling and CampaignResultsStage all behave exactly as
 * before, keyed by each field's real backend input key.
 *
 * The panel NEVER invents inputs: it renders whatever `configState` reports and
 * refuses to generate while configuration is loading or failed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, RefreshCw } from "lucide-react";
import CampaignReferenceList from "@/components/campaigns/CampaignReferenceList";
import CampaignResultsStage from "@/components/results/CampaignResultsStage";
import { type CampaignResultOutput } from "@/components/templates/CampaignResults";
import GeneratePaywallModal from "@/components/mvp/GeneratePaywallModal";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { libraryKindForAssetType, saveLibraryAsset } from "@/services/libraryAssets";
import { fetchMyFreeVideoEntitlement, startFreeVideoRun } from "@/services/freeVideoRun";
import { type PublicGenerationFailure } from "@/lib/generationFailure";
import { type PublicGraph } from "@/components/templates/CampaignBuildGraph";
import { readinessLine, type CampaignField, type CampaignFieldsState } from "@/lib/campaignFields";
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
  /** Real configured inputs, with loading/failed distinguished from "none". */
  configState: CampaignFieldsState;
  /** "8 images · 9 video clips" — from the template's real output counts. */
  deliverables?: string;
  aspectLabel?: string;
  /** Retry hook for failed configuration. */
  onRetryConfig?: () => void;
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
  configState,
  deliverables,
  aspectLabel,
  onRetryConfig,
  className,
  onPhaseChange,
}: Props) {
  const navigate = useNavigate();
  const { user, profile, isAdmin, isCreator, refreshProfile } = useAuth();
  const privileged = isAdmin || isCreator;

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

  const configReady = configState.status === "ready";
  const fields: CampaignField[] = configReady ? configState.fields : [];
  const referenceFields = useMemo(() => fields.filter((field) => field.kind !== "text"), [fields]);
  const textFields = useMemo(() => fields.filter((field) => field.kind === "text"), [fields]);

  /**
   * Fresh visit = fresh state. Progress/error state only ever comes from a run
   * started in this session, so mounting (or switching templates) clears any
   * leftover run state instead of surfacing a prior interrupted job.
   */
  useEffect(() => {
    setFiles({});
    setLibraryAssets({});
    setTextInputs({});
    setSubmitting(false);
    setJobId(null);
    setResult(null);
    setError(null);
    setPaywallOpen(false);
  }, [slug, templateId, versionId]);

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

  const isFilled = useCallback(
    (field: CampaignField) =>
      field.kind === "text"
        ? !!textInputs[field.id]?.trim()
        : !!files[field.id] || !!libraryAssets[field.id]?.url,
    [files, libraryAssets, textInputs],
  );

  const requiredFields = fields.filter((field) => field.required);
  const missingRequired = requiredFields.filter((field) => !isFilled(field)).length;
  const requiredReady = missingRequired === 0;
  const requiredReferenceCount = referenceFields.filter((field) => field.required).length;
  const addedRequiredCount = referenceFields.filter((field) => field.required && isFilled(field)).length;

  const phase: "idle" | "inputs" | "running" | "complete" | "failed" = result
    ? result.status === "complete"
      ? "complete"
      : result.status === "failed"
        ? "failed"
        : "running"
    : "inputs";

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
        referenceFields
          .filter((field) => files[field.id] || libraryAssets[field.id]?.url)
          .map(async (field) => {
            const file = files[field.id];
            if (!file) return [field.id, libraryAssets[field.id]!.url];
            const url = await uploadRunInputFile(file);
            void saveLibraryAsset({
              kind: libraryKindForAssetType(undefined),
              url,
              name: file.name,
              metadata: { source: "template_input", input_key: field.id },
            });
            return [field.id, url];
          }),
      ),
    ) as Record<string, string>;

    const texts = Object.fromEntries(
      textFields
        .map((field) => [field.id, textInputs[field.id]?.trim() ?? ""])
        .filter(([, value]) => value.length > 0),
    ) as Record<string, string>;

    return { ...texts, ...uploaded };
  }, [files, libraryAssets, referenceFields, textFields, textInputs]);

  const runNow = useCallback(async () => {
    if (submitting) return;
    if (!configReady) {
      setError("We're still loading this campaign's setup. Try again in a moment.");
      return;
    }
    if (!requiredReady) {
      setError(readinessLine(missingRequired));
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
            ? `Upload failed — no credits were used. ${uploadError.message}`
            : "Upload failed — no credits were used.",
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
    configReady,
    creditCost,
    freeRunAvailable,
    missingRequired,
    privileged,
    profile,
    refreshProfile,
    requiredReady,
    slug,
    submitting,
    templateId,
    templateName,
    versionId,
  ]);

  /** Auth + entitlement behaviour is unchanged; only the copy is calmer. */
  const handleGenerate = () => {
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
    void runNow();
  };

  const costLine = freeRunAvailable
    ? "Free first video — no credits used"
    : creditCost != null
      ? `${creditCost} credits`
      : null;

  const buttonLabel = !user
    ? freePreviewEnabled
      ? "Sign up to generate"
      : "Sign in to generate"
    : shortOnCredits
      ? "Add credits"
      : submitting
        ? "Starting"
        : freeRunAvailable
          ? "Generate free video"
          : "Generate";

  const generateDisabled = submitting || (!!user && !shortOnCredits && (!configReady || !requiredReady));

  const statusLine = !configReady
    ? configState.status === "loading"
      ? "Loading this campaign's setup…"
      : "We couldn't load this campaign's setup."
    : !user
      ? "Create your account to generate this campaign."
      : shortOnCredits
        ? "You need more credits to run this campaign."
        : readinessLine(missingRequired);

  /* ---------- rendering ---------- */

  if (result) {
    const restart = () => {
      setResult(null);
      setJobId(null);
    };
    return (
      <div className={cn("space-y-5", className)}>
        <CampaignResultsStage
          jobId={jobId}
          templateName={templateName}
          onTerminal={() => void refreshProfile()}
          onRunAgain={restart}
        />
        <button
          type="button"
          onClick={restart}
          className="min-h-[44px] rounded-full border border-border px-5 text-[14px] font-medium text-foreground transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Start another
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-8", className)}>
      {configState.status === "loading" ? (
        <section aria-busy className="space-y-4">
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted/60 motion-reduce:animate-none" />
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center gap-4">
              <div className="h-14 w-14 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 animate-pulse rounded-full bg-muted/60 motion-reduce:animate-none" />
                <div className="h-3 w-48 animate-pulse rounded-full bg-muted/40 motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </section>
      ) : configState.status === "error" ? (
        <section className="rounded-[20px] border border-border/70 bg-muted/25 p-6">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-foreground">
            <AlertCircle className="h-4 w-4 text-red-400" aria-hidden />
            We couldn't load this campaign's setup
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">{configState.message}</p>
          {onRetryConfig ? (
            <button
              type="button"
              onClick={onRetryConfig}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border px-5 text-[14px] font-medium text-foreground transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
          ) : null}
        </section>
      ) : referenceFields.length ? (
        <CampaignReferenceList
          fields={referenceFields}
          files={files}
          assets={libraryAssets}
          addedCount={addedRequiredCount}
          requiredCount={requiredReferenceCount}
          onFileChange={(key, file) => {
            setError(null);
            setFiles((current) => ({ ...current, [key]: file }));
            if (file) setLibraryAssets((current) => ({ ...current, [key]: null }));
          }}
          onClear={(key) => {
            setFiles((current) => ({ ...current, [key]: null }));
            setLibraryAssets((current) => ({ ...current, [key]: null }));
          }}
        />
      ) : (
        <section className="rounded-[20px] border border-border/70 bg-muted/25 p-6">
          <h2 className="text-[17px] font-semibold text-foreground">No uploads needed</h2>
          <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
            This campaign runs on its own — just generate it.
          </p>
        </section>
      )}

      {textFields.length ? (
        <section className="space-y-4">
          {textFields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <label htmlFor={`run-text-${field.id}`} className="text-[15px] font-medium text-foreground">
                {field.label}
                {field.required ? null : (
                  <span className="ml-2 text-[13px] font-normal text-muted-foreground">Optional</span>
                )}
              </label>
              <input
                id={`run-text-${field.id}`}
                value={textInputs[field.id] ?? ""}
                onChange={(event) => {
                  setError(null);
                  setTextInputs((current) => ({ ...current, [field.id]: event.target.value }));
                }}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={field.helper}
              />
            </div>
          ))}
        </section>
      ) : null}

      {/* GENERATION SUMMARY */}
      <section
        aria-labelledby="campaign-summary-heading"
        className="rounded-[22px] border border-border/70 bg-muted/20 p-6"
      >
        <h2 id="campaign-summary-heading" className="text-[19px] font-semibold text-foreground">
          Your campaign
        </h2>
        <dl className="mt-4 space-y-2 text-[15px]">
          {deliverables ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">You get</dt>
              <dd className="text-right font-medium text-foreground">{deliverables}</dd>
            </div>
          ) : null}
          {aspectLabel ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Format</dt>
              <dd className="text-right font-medium text-foreground">{aspectLabel}</dd>
            </div>
          ) : null}
          {costLine ? (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="text-right font-medium text-foreground">{costLine}</dd>
            </div>
          ) : null}
        </dl>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-[14px] leading-6 text-red-300"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generateDisabled}
          className={cn(
            "mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full px-6 text-[16px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            generateDisabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {buttonLabel}
          {!submitting && !generateDisabled ? (
            <ArrowRight className="h-4 w-4" aria-hidden />
          ) : null}
        </button>
        <p className="mt-3 text-center text-[13px] leading-5 text-muted-foreground" aria-live="polite">
          {statusLine}
        </p>
      </section>

      <GeneratePaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        templateName={templateName}
        creditsRequired={creditCost ?? 0}
        creditBalance={balance}
      />
    </div>
  );
}
