import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  GitBranch,
  Heart,
  Info,
  Loader2,
  
  Network,
  Search,
  Sparkles,
  X,

} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import BrandActivationBanner from "@/components/brand/BrandActivationBanner";
import TemplateFitBadge from "@/components/brand/TemplateFitBadge";
import BuildBrandAfterRunCard from "@/components/brand/BuildBrandAfterRunCard";
import { useBrandFitAssets } from "@/hooks/useBrandFitAssets";
import { deriveTemplateFit, type TemplateFit } from "@/lib/brandTemplateFit";
import { ONBOARDING_ROUTE } from "@/lib/brandActivation";
import RunFeedbackInline from "@/components/mvp/RunFeedbackInline";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CreditPackDialog from "@/components/mvp/CreditPackDialog";
import TemplateDetailDialog, { readTemplateAspectRatio } from "@/components/mvp/TemplateDetailDialog";
import TemplateInputCard from "@/components/templates/TemplateInputCard";
import {
  CampaignAssetGroupCard,
  CampaignAssetGroupModal,
} from "@/components/templates/CampaignAssetGroup";
import { campaignInputGroups } from "@/lib/campaignInputGroups";
import InlineCampaignBuilder from "@/components/templates/InlineCampaignBuilder";
import CastSelector, { PRIMARY_CAST_SLOT, type CastSelection } from "@/components/templates/CastSelector";
import CampaignResultsStage from "@/components/results/CampaignResultsStage";
import { CampaignBuildGraph, type PublicGraph } from "@/components/templates/CampaignBuildGraph";
import CampaignResults from "@/components/templates/CampaignResults";
import CampaignReadyBanner from "@/components/editor/CampaignReadyBanner";
import RecoveredCampaignResults from "@/components/templates/RecoveredCampaignResults";
import { useCampaignRecovery } from "@/hooks/useCampaignRecovery";

import RegenerateOutputDialog from "@/components/templates/RegenerateOutputDialog";
import { useOutputRegeneration } from "@/hooks/useOutputRegeneration";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { evaluateAndAnnounce } from "@/services/achievements";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useTemplateFavorites } from "@/hooks/useTemplateFavorites";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { ADMIN_VISUAL_BUDGET_TOTAL, getAdminVisualCreditsRemaining, getAdminVisualCreditsSpent, recordAdminVisualCreditUsage } from "@/lib/adminBudget";
import { cn } from "@/lib/utils";
import { canInitiateFork, resolveCustomizeState } from "@/lib/customizeGating";
import { sortTemplatesForStudio } from "@/lib/templateOrdering";
import { rankForYou } from "@/lib/forYouRanking";
import ForYouRow from "@/components/templates/ForYouRow";
import { fetchTemplateDetail, fetchTemplates, type ApiTemplate, type RunFeedbackRecord, type TemplateDetail } from "@/services/fuseApi";
import { uploadAnonymousRunInput, uploadRunInputFile } from "@/services/runInputUpload";
import { libraryKindForAssetType, saveLibraryAsset } from "@/services/libraryAssets";
import { getStaticInputs } from "@/services/templateInputMap";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { trackEvent } from "@/lib/metaPixel";
import { track } from "@/lib/analytics/track";
import GeneratePaywallModal from "@/components/mvp/GeneratePaywallModal";
import TemplateUnlockModal from "@/components/mvp/TemplateUnlockModal";
import PlanActivationNotice from "@/components/mvp/PlanActivationNotice";
import KeepCreatingPanel from "@/components/mvp/KeepCreatingPanel";
import { fetchMyFreeVideoEntitlement, startFreeVideoRun } from "@/services/freeVideoRun";
import { trackFreeVideo } from "@/lib/analytics/freeVideoEvents";

import {
  clearPendingGenerationIntent,
  getPendingGenerationIntent,
  intentSignature,
  markPendingGenerationConsumed,
  pendingGenerationConsumed,
  setPendingGenerationIntent,
  type PendingGenerationIntent,
} from "@/lib/pendingGenerationIntent";
import { isPlanOfferActive, subscribePlanOffer } from "@/lib/planOfferVisibility";
import { loadTemplatePerformance, type TemplatePerformanceMap } from "@/services/templatePerformance";
import { PerformanceBlock, PerformanceBadges, PerformanceDisclaimer } from "@/components/TemplatePerformance";
import FilterDropdown, { type FilterOption } from "@/components/templates/FilterDropdown";
import {
  AOV_FILTERS,
  ROAS_FILTERS,
  SPEND_FILTERS,
  matchesAovFilter,
  matchesRoasFilter,
  matchesSpendFilter,
} from "@/services/templatePerformance";

import { type TemplateAssetRequirement } from "@/lib/templateAssetRequirements";
import { resolveInputRole } from "@/lib/templateInputSources";
import { useBrand } from "@/contexts/BrandContext";
import { planBrandAutofill } from "@/lib/brandAutofill";
import { listProductProfiles } from "@/services/productProfiles";
import { listMyAvatars, listFuseAvatars } from "@/services/avatarProfiles";
import { readModelIds } from "@/services/brandProfiles";

import { readPublicFailure, type PublicGenerationFailure } from "@/lib/generationFailure";
import { createFork } from "@/services/templateForks";
import CampaignHistoryLauncher from "@/components/campaigns/CampaignHistoryLauncher";
import ContinueCreatingStrip from "@/components/campaigns/ContinueCreatingStrip";
import StreakChip from "@/components/StreakChip";

import CampaignHistoryDrawer from "@/components/campaigns/CampaignHistoryDrawer";
import { useCampaignHistory } from "@/hooks/useCampaignHistory";
import { formatCampaignOutputs, formatCampaignOutputsLong } from "@/lib/campaignOutputs";
import { campaignDisplayName } from "@/lib/campaignDisplayName";
import CampaignTile from "@/components/mvp/CampaignTile";
import { templateDetailPath } from "@/lib/templateSlug";


/**
 * Temporary marketplace simplification: hides the output-type tabs, performance
 * filter chips and category dropdown from the customer UI. All filtering logic,
 * metadata and performance data stay intact — flip to `true` to reintroduce.
 */
const SHOW_MARKETPLACE_FILTERS = false;

/** Customer-facing feed chips (presentation filter only). */
type FeedChip = "all" | "for_you" | "new" | "fashion" | "jewelry" | "product" | "video";

/**
 * Explore view state (filters + scroll) kept for the session so returning from
 * a template product page lands the user exactly where they left off.
 */
const EXPLORE_STATE_KEY = "fuse.explore.viewstate.v1";

type ExploreViewState = {
  feedSearch?: string;
  feedChip?: string;
  outputTypeFilter?: string;
  favoritesOnly?: boolean;
  scrollY?: number;
};

function readExploreState(): ExploreViewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(EXPLORE_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExploreViewState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeExploreState(next: ExploreViewState) {
  if (typeof window === "undefined") return;
  try {
    const current = readExploreState() ?? {};
    window.sessionStorage.setItem(EXPLORE_STATE_KEY, JSON.stringify({ ...current, ...next }));
  } catch {
    /* session storage unavailable — continuity is best-effort. */
  }
}
const FEED_CHIPS: Array<{ key: FeedChip; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "for_you", label: "For you" },
  { key: "video", label: "Video" },
  { key: "fashion", label: "Fashion" },
  { key: "jewelry", label: "Jewelry" },
  { key: "product", label: "Product" },
];




type RunnerStatus = "queued" | "running" | "video_pending" | "complete" | "failed";




interface InputField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
  /** FT2: optional rich metadata authored on the template input. */
  requirement?: TemplateAssetRequirement;
}


interface RunnerOutput {
  type: string;
  url: string;
  label?: string;
  key?: string;
  /** TR4: numbered deliverable slot from the job-status payload. */
  outputNumber?: number;
}

interface RunnerResult {
  status: RunnerStatus;
  progress: number;
  outputs: RunnerOutput[];
  /** Privileged callers only — raw provider diagnostics. */
  error?: string;
  /** P0: polished, customer-safe failure (never raw provider text). */
  publicFailure?: PublicGenerationFailure | null;
  /** TR3: customer-safe live execution graph (no prompts/provider internals). */
  publicGraph?: PublicGraph;
  statusMessage?: string;
  /** Privileged callers only — present when the payload includes raw steps. */
  hasPrivilegedSteps?: boolean;
}

interface RecentRun {
  id: string;
  status: RunnerStatus;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  /** Privileged callers only (admin/dev) — raw provider diagnostics. */
  error?: string | null;
  /** P0: polished, customer-safe failure copy. */
  publicFailure?: PublicGenerationFailure | null;
  templateName: string;
  outputs: RunnerOutput[];
  feedback: RunFeedbackRecord | null;
}

const EMPTY_TEMPLATES: ApiTemplate[] = [];

const TEMPLATE_CACHE_KEY = "fuse.templateStudio.templates.v4";
const TEMPLATE_DETAIL_CACHE_KEY = "fuse.templateStudio.templateDetails.v4";
const TEMPLATE_SELECTION_KEY = "fuse.templateStudio.selectedTemplateId";
const ACTIVE_RUN_STATUSES = new Set<RunnerStatus>(["queued", "running", "video_pending"]);
/** Authoritative layout mode for the studio: compact browse/setup vs expanded campaign workspace. */
type CampaignStudioMode = "browse" | "setup" | "running" | "complete" | "failed";


function getOutputDownloadName(templateName: string, index: number, output: RunnerOutput) {
  const safeTemplateName = templateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "fuse-run";
  const extension = output.type === "video" ? "mp4" : "jpg";
  return `${safeTemplateName}-output-${index + 1}.${extension}`;
}

function readCachedJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadCachedTemplates() {
  const parsed = readCachedJson<unknown>(TEMPLATE_CACHE_KEY, []);
  return Array.isArray(parsed) ? (parsed as ApiTemplate[]) : [];
}

function getTemplateDetailCacheId(template: Pick<ApiTemplate, "id" | "versionId">) {
  return template.versionId ?? template.id;
}

function loadCachedTemplateDetail(cacheId: string) {
  const cached = readCachedJson<Record<string, TemplateDetail | null>>(TEMPLATE_DETAIL_CACHE_KEY, {});
  const detail = cached[cacheId];
  return detail ?? null;
}

function storeCachedTemplateDetail(cacheId: string, detail: TemplateDetail | null) {
  if (typeof window === "undefined") return;
  const cached = readCachedJson<Record<string, TemplateDetail | null>>(TEMPLATE_DETAIL_CACHE_KEY, {});
  cached[cacheId] = detail;
  window.localStorage.setItem(TEMPLATE_DETAIL_CACHE_KEY, JSON.stringify(cached));
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing authenticated session.");
  }

  return session.access_token;
}

async function fetchJobStatus(jobId: string) {
  const token = await getAccessToken();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/get-job-status?jobId=${encodeURIComponent(jobId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load run status.");
  }

  return data as {
    status: RunnerStatus;
    progress?: number;
    outputs?: RunnerOutput[];
    error?: string | null;
    publicFailure?: PublicGenerationFailure | null;
    publicGraph?: PublicGraph;
    statusMessage?: string;
    steps?: unknown[];
  };
}

async function startTemplateRun(versionId: string, inputs: Record<string, string>) {
  const token = await getAccessToken();
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
    throw new Error(data?.error ?? `Could not start the template run (${response.status}).`);
  }

  const result = data as { jobId?: string; error?: string };
  track("template_run", { version_id: versionId, ok: true });
  if (result.jobId) track("campaign_created", { version_id: versionId });
  return result;
}

function formatRunTimestamp(value: string | null | undefined) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRunDuration(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) return "In progress";

  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(durationMs) || durationMs <= 0) return "Pending";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function isVideoPreview(template: Pick<ApiTemplate, "preview_url" | "preview_asset_type">) {
  if (template.preview_asset_type === "video") return true;
  return /\.(mp4|mov|webm)(\?|$)/i.test(template.preview_url ?? "");
}

function getTemplateInputCount(template: ApiTemplate) {
  return Number(template.counts?.inputs ?? template.input_schema?.length ?? 0);
}

function getTemplateOutputCount(template: Pick<ApiTemplate, "counts" | "output_type"> | null | undefined) {
  const countedOutputs = Number(template?.counts?.imageOutputs ?? 0) + Number(template?.counts?.videoOutputs ?? 0);
  if (countedOutputs > 0) return countedOutputs;
  return template?.output_type ? 1 : 0;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildTemplateCheckoutPath(template: ApiTemplate) {
  const params = new URLSearchParams({
    template: template.id,
    templateName: template.name,
    credits: String(template.estimated_credits_per_run ?? 0),
    outputs: String(getTemplateOutputCount(template)),
  });
  return `/pricing?${params.toString()}`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatCredits(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString();
}


function CreditRemainingMeter({
  label,
  percent,
  value,
  showTopUp,
}: {
  label: string;
  percent: number;
  value: string;
  showTopUp?: boolean;
}) {
  return (
    <div className="min-w-[230px] rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-5xl font-semibold tracking-[-0.06em] text-white">{percent}%</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
        </div>
        <p className="pb-1 text-sm font-medium text-cyan-100">{value}</p>
      </div>
      {showTopUp ? (
        <CreditPackDialog
          trigger={
            <Button className="mt-4 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              Get credits
            </Button>
          }
        />
      ) : null}
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.65)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function RunProgressBeacon({
  progress,
  status,
}: {
  progress: number;
  status: RunnerStatus;
}) {
  const safeProgress = clampPercent(progress);
  const message = status === "video_pending"
    ? "Video render in progress"
    : "Template run in progress";

  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
      <div className="flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/10 text-cyan-100">
          <span className="absolute inset-0 rounded-full bg-cyan-300/15 blur-md" />
          <Loader2 className="relative h-5 w-5 animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{message}</p>
          <p className="mt-1 text-xs text-slate-500">{safeProgress}% complete</p>
        </div>
      </div>
      <div className="relative mt-5 h-8">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-cyan-200/18" />
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.8)]"
          style={{ width: `${safeProgress}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.9)]"
          style={{ left: `${safeProgress}%` }}
        />
      </div>
      <Progress value={safeProgress} className="h-2" />
    </div>
  );
}

function TemplateVibeMedia({
  template,
  className,
}: {
  template: ApiTemplate;
  className: string;
}) {
  if (!template.preview_url) {
    return (
      <div className={`${className} flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]`}>
        <Sparkles className="h-8 w-8 text-cyan-100/60" />
      </div>
    );
  }

  if (isVideoPreview(template)) {
    return (
      <video
        src={template.preview_url}
        className={className}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={template.preview_url}
      alt={`${template.name} vibe preview`}
      className={className}
      loading="lazy"
    />
  );
}

export default function TemplateStudioPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, hasAppAccess, profile, refreshProfile } = useAuth();
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(TEMPLATE_SELECTION_KEY) ?? "";
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  /** P6a: logged-out temp uploads — local preview + temp URL survive OAuth. */
  const [anonUploads, setAnonUploads] = useState<
    Record<string, { status: "uploading" | "ready" | "error"; url?: string; error?: string }>
  >({});
  /** FT4: assets picked from the reusable library (already stored URLs). */
  const [libraryAssets, setLibraryAssets] = useState<Record<string, { url: string; name?: string | null } | null>>({});

  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  /** Phase 10: keys filled by brand autofill → the brand they came from. */
  const [autofilledKeys, setAutofilledKeys] = useState<Record<string, string>>({});
  const autofillAppliedRef = useRef<string>("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [creatingFork, setCreatingFork] = useState(false);
  const [workflowUpgradeDialogOpen, setWorkflowUpgradeDialogOpen] = useState(false);
  /** P2 — generate auth gate for logged-out visitors (never auto-opens). */
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  /** ACQUISITION — guest UNLOCK confirmation → checkout (no uploads before pay). */
  const [unlockOpen, setUnlockOpen] = useState(false);

  const [result, setResult] = useState<RunnerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingCredits, setCheckingCredits] = useState(false);
  const [runPhase, setRunPhase] = useState<"idle" | "uploading" | "preparing">("idle");

  const [adminVisualSpent, setAdminVisualSpent] = useState(() => getAdminVisualCreditsSpent());
  /** A previously completed/failed run reopened into the workspace. */
  const [openedHistoricalRun, setOpenedHistoricalRun] = useState<RecentRun | null>(null);
  /** Post-run: whether the full asset-input controls are re-expanded (Edit Inputs). */
  const [inputsExpanded, setInputsExpanded] = useState(false);
  const [feedbackOverrides, setFeedbackOverrides] = useState<Record<string, RunFeedbackRecord | null>>({});
  /** Campaign history drawer (replaces the old always-visible run list). */
  const [historyOpen, setHistoryOpen] = useState(false);

  const [detailTemplateId, setDetailTemplateId] = useState<string | null>(null);
  const runnerSectionRef = useRef<HTMLElement | null>(null);
  const workspaceSectionRef = useRef<HTMLElement | null>(null);
  /** Auto-advance: the next unfilled slot gets a subtle highlight + scroll focus. */
  const [focusedInputKey, setFocusedInputKey] = useState<string | null>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const appliedTemplateParamRef = useRef<string | null>(null);
  /** Presentation only: brief ring emphasis so a template switch is obvious on desktop. */
  const [builderJustSwitched, setBuilderJustSwitched] = useState(false);

  /*
   * MOBILE / TABLET (<lg) inline builder placement.
   * `gridColumns` mirrors the rendered grid (2 cols <640px, 3 cols at sm) so the
   * inline builder can be injected right after the selected card's ACTUAL row.
   * `isCompactLayout` is true below the lg breakpoint, where the desktop
   * side-by-side builder is not rendered at all (one instance at a time).
   */
  const [gridColumns, setGridColumns] = useState(2);
  /** <lg only: whether the inline builder is expanded (one open at a time). */
  const [inlineBuilderOpen, setInlineBuilderOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const inlineBuilderRef = useRef<HTMLDivElement | null>(null);
  /** Session cache of pending local inputs per campaign (no upload, no spend). */
  const inputDraftsRef = useRef<
    Record<
      string,
      {
        files: Record<string, File | null>;
        libraryAssets: Record<string, { url: string; name?: string | null } | null>;
        textInputs: Record<string, string>;
        castSelection: CastSelection;
        anonUploads: Record<string, { status: "uploading" | "ready" | "error"; url?: string; error?: string }>;
      }
    >
  >({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const compact = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => {
      setIsCompactLayout(compact.matches);
      // Dense feed: exactly TWO columns below lg, so the inline builder is
      // inserted after the selected card's real visual row.
      setGridColumns(2);
    };
    sync();
    compact.addEventListener("change", sync);
    return () => {
      compact.removeEventListener("change", sync);
    };
  }, []);


  /** Feed view analytics — fires once per mount (no PII). */
  useEffect(() => {
    track("marketplace_view", {});
  }, []);





  const isPrivilegedUser = hasAppAccess;

  /* Phase 10 — the remembered brand + its saved assets (read-only sources). */
  const { activeBrand, activeBrandId } = useBrand();
  const brandProductsQuery = useQuery({
    queryKey: ["product-profiles", user?.id ?? "anon"],
    queryFn: () => listProductProfiles(user?.id ?? ""),
    enabled: !!user?.id && !!activeBrandId,
    staleTime: 30_000,
  });
  const brandModelIds = useMemo(() => readModelIds(activeBrand), [activeBrand]);
  const brandModelsQuery = useQuery({
    queryKey: ["autofill-avatars", user?.id ?? "anon"],
    queryFn: async () => {
      const [mine, fuse] = await Promise.all([listMyAvatars(user?.id ?? ""), listFuseAvatars()]);
      return [...mine, ...fuse];
    },
    enabled: !!user?.id && !!activeBrandId && brandModelIds.length > 0,
    staleTime: 30_000,
  });

  const brandProducts = useMemo(
    () => (brandProductsQuery.data ?? []).filter((profile) => profile.brand_id === activeBrandId),
    [brandProductsQuery.data, activeBrandId],
  );
  /** Associated models, kept in metadata.modelIds order. */
  const brandModels = useMemo(() => {
    const pool = brandModelsQuery.data ?? [];
    return brandModelIds
      .map((id) => pool.find((avatar) => avatar.id === id))
      .filter((avatar): avatar is NonNullable<typeof avatar> => !!avatar);
  }, [brandModelsQuery.data, brandModelIds]);


  /* Phase 5 — truthful per-template compatibility for the active brand. */
  const { assets: brandFitAssets } = useBrandFitAssets();

  const templatesQuery = useQuery<ApiTemplate[]>({
    queryKey: ["mvp-templates"],
    queryFn: () => fetchTemplates(""),
    placeholderData: loadCachedTemplates,
    staleTime: 60_000,
  });

  /* Admin-curated "Featured" shelf leads the grid (same source as HomePage). */
  const shelvesQuery = useQuery({
    queryKey: ["studio-marketplace-shelves"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_marketplace_shelves" as never);
      return (data ?? []) as unknown[];
    },
    staleTime: 300_000,
    retry: false,
  });

  const featuredIdsInOrder = useMemo<string[]>(() => {
    const shelves = (shelvesQuery.data ?? []) as Array<{
      slug?: string;
      templates?: Array<{ name?: string | null; template_id?: string | null }> | null;
    }>;
    const featured = shelves.find((shelf) => shelf?.slug === "featured");
    return (featured?.templates ?? [])
      .map((template) => (template?.name ? String(template.name).toLowerCase() : ""))
      .filter(Boolean);
  }, [shelvesQuery.data]);

  const templates = useMemo(() => {
    const active = (templatesQuery.data ?? EMPTY_TEMPLATES).filter((template) => template.is_active);
    if (!featuredIdsInOrder.length) return sortTemplatesForStudio(active);

    const byName = new Map(active.map((template) => [String(template.name).toLowerCase(), template]));
    const featured: typeof active = [];
    const seen = new Set<string>();
    for (const name of featuredIdsInOrder) {
      const template = byName.get(name);
      if (!template || seen.has(name)) continue;
      seen.add(name);
      featured.push(template);
    }
    const rest = sortTemplatesForStudio(
      active.filter((template) => !seen.has(String(template.name).toLowerCase())),
    );
    return [...featured, ...rest];
  }, [templatesQuery.data, featuredIdsInOrder]);



  const templateFitMap = useMemo<Record<string, TemplateFit>>(() => {
    if (!brandFitAssets) return {};
    const map: Record<string, TemplateFit> = {};
    for (const template of templates) {
      map[String(template.id)] = deriveTemplateFit(template, brandFitAssets);
    }
    return map;
  }, [templates, brandFitAssets]);

  const readyForBrandCount = useMemo(
    () => Object.values(templateFitMap).filter((fit) => fit.status === "ready").length,
    [templateFitMap],
  );

  const performanceIds = useMemo(
    () => templates.map((template) => String(template.id ?? "")).filter(Boolean),
    [templates],
  );

  const { data: performanceMap = {} as TemplatePerformanceMap } = useQuery({
    queryKey: ["studio-template-performance", performanceIds.slice().sort().join(",")],
    queryFn: () => loadTemplatePerformance(performanceIds),
    enabled: performanceIds.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const hasAnyPerformance = Object.keys(performanceMap).length > 0;

  /** Perf filters only ever match templates that already have a real row. */
  const [perfFilters, setPerfFilters] = useState<Record<string, string | null>>({
    roas: null,
    aov: null,
    spend: null,
    category: null,
  });

  const categoryOptions = useMemo(() => {
    const preferred = ["Streetwear", "Jewelry", "Product", "Artist", "Cinematic"];
    const present = new Set(
      templates.map((template) => (template.category ?? "").trim()).filter(Boolean),
    );
    const ordered = preferred.filter((option) =>
      Array.from(present).some((value) => value.toLowerCase() === option.toLowerCase()),
    );
    const extras = Array.from(present).filter(
      (value) => !preferred.some((option) => option.toLowerCase() === value.toLowerCase()),
    );
    return [...ordered, ...extras];
  }, [templates]);

  const filterDefinitions = useMemo<FilterOption[]>(() => {
    const definitions: FilterOption[] = [
      { key: "roas", label: "ROAS", icon: "📈", options: [...ROAS_FILTERS] },
      { key: "aov", label: "AOV", icon: "🧾", options: [...AOV_FILTERS] },
      { key: "spend", label: "Tested spend", icon: "💳", options: [...SPEND_FILTERS] },
    ];
    if (categoryOptions.length) {
      definitions.push({ key: "category", label: "Category", icon: "✦", options: categoryOptions });
    }
    return definitions;
  }, [categoryOptions]);

  const activeFilterCount = Object.values(perfFilters).filter(Boolean).length;

  /** Output-type segment — reads the existing template output_type, no new engine. */
  const [outputTypeFilter, setOutputTypeFilter] = useState<"all" | "image" | "video">(
    () => (readExploreState()?.outputTypeFilter as "all" | "image" | "video") ?? "all",
  );

  const outputTypeCounts = useMemo(() => {
    let image = 0;
    let video = 0;
    for (const template of templates) {
      if ((template.output_type ?? "").toLowerCase() === "video") video += 1;
      else image += 1;
    }
    return { all: templates.length, image, video };
  }, [templates]);

  /** RETENTION P1 — favorites (separate from the hidden filter block). */
  const { canFavorite, isFavorite, toggleFavorite, favoriteCount, favoriteIds } = useTemplateFavorites();
  const [favoritesOnly, setFavoritesOnly] = useState(() => readExploreState()?.favoritesOnly === true);
  useEffect(() => {
    if (!canFavorite && favoritesOnly) setFavoritesOnly(false);
  }, [canFavorite, favoritesOnly]);

  /**
   * Feed chips + search — PRESENTATION ONLY. They narrow what is rendered and
   * never reorder the merchandised catalog or touch identifiers.
   */
  const [feedSearch, setFeedSearch] = useState(() => readExploreState()?.feedSearch ?? "");
  const [feedChip, setFeedChip] = useState<FeedChip>(
    () => (readExploreState()?.feedChip as FeedChip) ?? "all",
  );

  /**
   * EXPLORE CONTINUITY — filters + scroll survive a trip to a template product
   * page and back. Presentation only: nothing here touches the catalog order.
   */
  useEffect(() => {
    writeExploreState({ feedSearch, feedChip, outputTypeFilter, favoritesOnly });
  }, [feedSearch, feedChip, outputTypeFilter, favoritesOnly]);

  useEffect(() => {
    const saved = readExploreState()?.scrollY;
    if (typeof saved !== "number" || saved <= 0) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: saved }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const persist = () => {
      const current = readExploreState() ?? {};
      writeExploreState({ ...current, scrollY: window.scrollY });
    };
    window.addEventListener("scroll", persist, { passive: true });
    return () => {
      persist();
      window.removeEventListener("scroll", persist);
    };
  }, []);

  const matchesFeedChip = useCallback(
    (template: ApiTemplate) => {
      if (feedChip === "all") return true;
      if (feedChip === "for_you") return canFavorite ? isFavorite(String(template.id)) : true;
      if (feedChip === "video") return (template.output_type ?? "").toLowerCase() === "video";
      if (feedChip === "new") {
        const created = template.created_at ? Date.parse(template.created_at) : NaN;
        if (Number.isNaN(created)) return true;
        return Date.now() - created <= 30 * 24 * 60 * 60 * 1000;
      }
      const haystack = `${template.category ?? ""} ${template.tags?.join(" ") ?? ""}`.toLowerCase();
      return haystack.includes(feedChip);
    },
    [feedChip, canFavorite, isFavorite],
  );

  const visibleTemplates = useMemo(() => {
    const query = feedSearch.trim().toLowerCase();
    let base = favoritesOnly ? templates.filter((template) => isFavorite(String(template.id))) : templates;
    if (query) base = base.filter((template) => (template.name ?? "").toLowerCase().includes(query));
    if (feedChip !== "all") {
      const narrowed = base.filter(matchesFeedChip);
      // Never strand the customer on an empty feed from a presentation chip.
      if (narrowed.length) base = narrowed;
    }
    if (!activeFilterCount && outputTypeFilter === "all") return base;
    return base.filter((template) => {
      if (outputTypeFilter !== "all") {
        const isVideo = (template.output_type ?? "").toLowerCase() === "video";
        if (outputTypeFilter === "video" ? !isVideo : isVideo) return false;
      }
      const row = performanceMap[String(template.id ?? "")] ?? null;
      if (perfFilters.roas && !matchesRoasFilter(row, perfFilters.roas)) return false;
      if (perfFilters.aov && !matchesAovFilter(row, perfFilters.aov)) return false;
      if (perfFilters.spend && !matchesSpendFilter(row, perfFilters.spend)) return false;
      if (
        perfFilters.category &&
        (template.category ?? "").trim().toLowerCase() !== perfFilters.category.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [
    activeFilterCount,
    favoritesOnly,
    feedChip,
    feedSearch,
    isFavorite,
    matchesFeedChip,
    outputTypeFilter,
    perfFilters,
    performanceMap,
    templates,
  ]);






  // TR10b — deep-link straight into the running workspace for a specific run
  // (used after launching a personal fork from the workflow editor).
  useEffect(() => {
    const requestedRun = searchParams.get("run");
    if (!requestedRun || requestedRun === jobId) return;
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setJobId(requestedRun);
  }, [searchParams, jobId]);

  /** Resolves ?template=<id|name|version> against the live catalog. */
  const requestedTemplateParam = searchParams.get("template");
  const deepLinkTemplateId = useMemo(() => {
    if (!requestedTemplateParam || !templates.length) return null;
    const normalizedRequest = requestedTemplateParam.trim().toLowerCase();
    const match = templates.find((template) =>
      template.id.toLowerCase() === normalizedRequest ||
      template.name.toLowerCase() === normalizedRequest ||
      template.versionId?.toLowerCase() === normalizedRequest,
    );
    return match?.id ?? null;
  }, [requestedTemplateParam, templates]);

  /*
   * The deep link wins until it has actually landed: an early catalog snapshot
   * can reset the selection to the first campaign, so this keeps re-applying
   * until the requested campaign is the selected one, then stops (the visitor
   * stays free to pick another campaign afterwards).
   */
  const deepLinkLandedRef = useRef(false);
  useEffect(() => {
    if (!deepLinkTemplateId || deepLinkLandedRef.current) return;
    if (selectedTemplateId === deepLinkTemplateId) {
      deepLinkLandedRef.current = true;
      appliedTemplateParamRef.current = requestedTemplateParam ?? "";
      return;
    }
    setSelectedTemplateId(deepLinkTemplateId);
  }, [requestedTemplateParam, deepLinkTemplateId, selectedTemplateId]);

  /*
   * Deep link (?template=<name>) on mobile/tablet: the grid renders, the card is
   * selected, the inline builder mounts under its actual row — and only THEN do
   * we make a small position adjustment, once columns/dimensions are known.
   * UTM params in the URL are untouched.
   */
  const deepLinkRevealedRef = useRef(false);
  useEffect(() => {
    if (deepLinkRevealedRef.current) return;
    if (!isCompactLayout || !deepLinkTemplateId) return;
    if (deepLinkTemplateId !== selectedTemplateId) return;
    deepLinkRevealedRef.current = true;
    setInlineBuilderOpen(true);
    const timer = window.setTimeout(() => revealInlineBuilder(), 120);
    return () => window.clearTimeout(timer);
  }, [isCompactLayout, deepLinkTemplateId, selectedTemplateId, user]);

  /* Deep links only SELECT + open the builder — never checkout. Purchase stays
     behind the builder's explicit "Unlock access →" CTA. */







  useEffect(() => {
    if (!templates.length) return;
    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (typeof window === "undefined" || !templates.length) return;
    window.localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedTemplateId) return;
    window.localStorage.setItem(TEMPLATE_SELECTION_KEY, selectedTemplateId);
  }, [selectedTemplateId]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  /** FT7 — in-progress cast selection. Not sent to the runner in this phase. */
  const [castSelection, setCastSelection] = useState<CastSelection>({});

  useEffect(() => {
    if (!selectedTemplate) return;
    trackEvent("ViewContent", { content_name: selectedTemplate.name, content_type: "product" });
  }, [selectedTemplate?.id]);
  const selectedTemplateDetailCacheId = selectedTemplate
    ? getTemplateDetailCacheId(selectedTemplate)
    : null;

  const templateDetailQuery = useQuery<TemplateDetail | null>({
    // P1: the detail is public via lab-template-detail, so logged-out visitors
    // can open and configure the builder. Anonymous visitors need a live
    // version id (the legacy token path is authenticated-only).
    enabled: !!selectedTemplate && (!!user || !!selectedTemplate.versionId),
    queryKey: ["mvp-template-detail", selectedTemplateDetailCacheId],
    placeholderData: selectedTemplateDetailCacheId
      ? loadCachedTemplateDetail(selectedTemplateDetailCacheId)
      : null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!selectedTemplate || !selectedTemplateDetailCacheId) return null;
      const token = user ? await getAccessToken() : "";
      const detail = await fetchTemplateDetail(token, selectedTemplate);
      storeCachedTemplateDetail(selectedTemplateDetailCacheId, detail);
      return detail;
    },
  });

  /**
   * Campaign history now lives in dedicated components (launcher + drawer +
   * /app/campaigns) and shares one paginated query via useCampaignHistory.
   */
  const { query: recentRunsQuery, campaigns: recentRuns } = useCampaignHistory({
    hasOpenWorkspace: Boolean(jobId) || Boolean(openedHistoricalRun),
  });
  const refetchRecentRuns = recentRunsQuery.refetch;

  /**
   * RETENTION P3 — deterministic "For you" row. Popularity is optional: when the
   * RPC is unavailable the signal is simply absent (never fabricated).
   */
  const { data: templatePopularity = {} as Record<string, number> } = useQuery({
    queryKey: ["public-template-popularity", 90],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_template_popularity" as never, { days: 90 } as never);
      if (error) return {} as Record<string, number>;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { template_id?: string; runs?: number }[]) {
        if (row?.template_id) map[String(row.template_id)] = Number(row.runs ?? 0);
      }
      return map;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const forYou = useMemo(() => {
    if (!templates.length) return { mode: "popular" as const, entries: [] };
    const continueNames = new Set(
      recentRuns.slice(0, 5).map((run) => (run.templateName ?? "").toLowerCase()).filter(Boolean),
    );
    const excludeIds = new Set(
      templates
        .filter((template) => continueNames.has(template.name.toLowerCase()))
        .map((template) => String(template.id)),
    );
    return rankForYou({
      templates,
      fitMap: activeBrand ? templateFitMap : {},
      favoriteIds,
      popularity: templatePopularity,
      excludeIds,
      limit: 8,
    });
  }, [activeBrand, favoriteIds, recentRuns, templateFitMap, templatePopularity, templates]);


  // ---- Campaign studio layout state machine (single authoritative condition) ----
  const openedHistoricalRunId = openedHistoricalRun?.id ?? null;
  const activeRunId = jobId ?? openedHistoricalRunId;
  const hasActiveCampaignWorkspace = Boolean(jobId) || Boolean(openedHistoricalRunId);
  const studioMode: CampaignStudioMode = !hasActiveCampaignWorkspace
    ? selectedTemplateId
      ? "setup"
      : "browse"
    : result?.status === "complete"
      ? "complete"
      : result?.status === "failed"
        ? "failed"
        : "running";
  const workspaceTemplateName = openedHistoricalRun?.templateName ?? selectedTemplate?.name ?? null;

  // Editor entry point: how many video deliverables actually landed.
  const outputsGridRef = useRef<HTMLDivElement | null>(null);
  const isVideoOutput = (output: RunnerOutput) =>
    String(output.type ?? "").toLowerCase().includes("video") || /\.(mp4|mov|webm)(\?|$)/i.test(output.url ?? "");
  const completedVideoOutputCount = (result?.outputs ?? []).filter(isVideoOutput).length;
  const expectedVideoOutputCount = Math.max(
    completedVideoOutputCount,
    (result?.publicGraph?.nodes ?? []).filter((node) =>
      String((node as { kind?: string; type?: string }).kind ?? (node as { type?: string }).type ?? "")
        .toLowerCase()
        .includes("video"),
    ).length,
  );


  // Achievements: a completed campaign is a real signal — evaluate once per run.
  const achievementRunRef = useRef<string | null>(null);
  // P7 — set when a restored/first run auto-starts, consumed on completion.
  const firstGenerationPendingRef = useRef(false);
  useEffect(() => {
    if (studioMode !== "complete" || !activeRunId) return;
    if (achievementRunRef.current === activeRunId) return;
    achievementRunRef.current = activeRunId;
    track("campaign_complete", { template_id: selectedTemplateId ?? null });
    if (firstGenerationPendingRef.current) {
      firstGenerationPendingRef.current = false;
      track("first_generation_completed", { template_id: selectedTemplateId ?? null });
    }
    void evaluateAndAnnounce();
  }, [studioMode, activeRunId]);

  // ---- TR7: per-output regeneration (server-priced, confirm-gated) ----
  const [pollNonce, setPollNonce] = useState(0);
  const regeneration = useOutputRegeneration({
    jobId: activeRunId,
    enabled: result?.status === "complete",
    onCharged: () => {
      void refreshProfile();
    },
    onStarted: (outputNumber) => {
      // Re-enter the running workspace; polling picks up the new running status.
      setResult((prev) =>
        prev ? { ...prev, status: "running", outputs: prev.outputs, progress: prev.progress } : prev,
      );
      setPollNonce((current) => current + 1);
      void refetchRecentRuns();
      toast({
        title: `Regenerating output ${outputNumber}`,
        description: "Only this deliverable is being rebuilt — the rest is reused.",
      });
    },
  });



  /**
   * URGENT recovery — once a run is terminal (or a stored run is opened), always ask
   * the server for the durable successful outputs with signed, downloadable URLs.
   * result_payload is empty for failed jobs, so this is the authoritative source.
   */
  const recoveryEnabled = Boolean(activeRunId) && !!result && !ACTIVE_RUN_STATUSES.has(result.status);
  const campaignRecovery = useCampaignRecovery(activeRunId, recoveryEnabled);
  const recovered = campaignRecovery.recovery;
  const hasRecoveredOutputs = (recovered?.ready_outputs.length ?? 0) > 0;
  const showRecoveryView =
    hasRecoveredOutputs && (recovered?.status === "partial" || result?.status === "failed");
  /** Signed URLs win over any stored public URL (the bucket is private). */
  const displayOutputs: RunnerOutput[] = hasRecoveredOutputs
    ? (recovered?.ready_outputs ?? []).map((output, index) => ({
        type: output.type,
        url: output.url,
        label: output.label,
        outputNumber: output.outputNumber ?? index + 1,
      }))
    : (result?.outputs ?? []);
  const handleRecoveredDownload = (output: { node_id: string; type: "video" | "image"; url: string }, index: number) => {
    void campaignRecovery.download(output as never, index, workspaceTemplateName);
  };

  const currentResultFeedback: RunFeedbackRecord | null = activeRunId
    ? feedbackOverrides[activeRunId]
      ?? ((recentRuns.find((run) => run.id === activeRunId)?.feedback as RunFeedbackRecord | null | undefined) ?? null)
    : null;


  const resolveFeedback = (runId: string, fallback: RunFeedbackRecord | null) =>
    feedbackOverrides[runId] ?? fallback ?? null;

  const handleFeedbackSaved = (runId: string, feedback: RunFeedbackRecord) => {
    setFeedbackOverrides((current) => ({
      ...current,
      [runId]: feedback,
    }));
  };

  const handleDownloadSingleOutput = (output: RunnerOutput, index: number) => {
    const link = document.createElement("a");
    link.href = output.url;
    link.download = getOutputDownloadName(selectedTemplate?.name ?? "fuse-run", index, output);
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  /** Campaign history: download every deliverable of a past campaign. */
  const handleDownloadCampaign = (run: RecentRun) => {
    (Array.isArray(run.outputs) ? run.outputs : []).forEach((output, index) => {
      const link = document.createElement("a");
      link.href = output.url;
      link.download = getOutputDownloadName(run.templateName ?? "fuse-campaign", index, output);
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  };

  /** Campaign history: remix = reload that campaign's template into the builder. */
  const handleRemixCampaign = (run: RecentRun) => {
    const match = templates.find(
      (template) => template.name.toLowerCase() === (run.templateName ?? "").toLowerCase(),
    );
    setJobId(null);
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setResult(null);
    if (match) setSelectedTemplateId(match.id);
    setHistoryOpen(false);
    window.requestAnimationFrame(() => {
      runnerSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const previewUrlForTemplate = (templateName: string) =>
    templates.find((template) => template.name.toLowerCase() === (templateName ?? "").toLowerCase())
      ?.preview_url ?? null;


  /** Open a previous run directly into the expanded campaign workspace. */
  const handleOpenHistoricalRun = (run: RecentRun) => {
    // Terminal runs with usable outputs open the calm Results view in place;
    // only a run with nothing usable falls back to the recovery/results route.
    const usableOutputs = (Array.isArray(run.outputs) ? run.outputs : []).filter((output) => !!output?.url);
    if (run.status === "failed" && !usableOutputs.length) {
      navigate(`/app/runs/${encodeURIComponent(run.id)}`);
      return;
    }
    setJobId(null);
    setInputsExpanded(false);
    setOpenedHistoricalRun(run);
    setResult({
      status: run.status,
      progress: run.progress ?? 0,
      outputs: Array.isArray(run.outputs) ? run.outputs : [],
      error: run.error ?? undefined,
      publicFailure: run.publicFailure ?? null,
    });
    window.requestAnimationFrame(() => {
      workspaceSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  /** Return from workspace mode to the compact browse/setup layout. */
  const handleBackToTemplates = () => {
    setJobId(null);
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setResult(null);
  };



  useEffect(() => {
    if (!activeRunId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const status = await fetchJobStatus(activeRunId);
        if (cancelled) return;

        // P0: never lose the graph — if a later poll omits publicGraph/statusMessage,
        // keep the previously fetched snapshot (pinned to the run's template version).
        setResult((prev) => ({
          status: status.status,
          progress: status.progress ?? 0,
          outputs: Array.isArray(status.outputs) ? status.outputs : [],
          error: status.error ?? undefined,
          // Keep the classified failure if a later poll omits it.
          publicFailure: status.publicFailure ?? prev?.publicFailure ?? null,
          publicGraph: status.publicGraph ?? prev?.publicGraph,
          statusMessage: status.statusMessage ?? prev?.statusMessage,
          hasPrivilegedSteps: Array.isArray(status.steps),
        }));

        if (!ACTIVE_RUN_STATUSES.has(status.status)) {
          void refetchRecentRuns();
        }

        if (ACTIVE_RUN_STATUSES.has(status.status)) {
          timeoutId = window.setTimeout(poll, 3000);
        }
      } catch (error) {
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, 6000);
        }
        console.error("Job polling failed:", error);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeRunId, refetchRecentRuns, pollNonce]);

  const inputFields: InputField[] = (() => {
    if (templateDetailQuery.data?.user_inputs?.length) {
      return templateDetailQuery.data.user_inputs.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type || "image",
        required: field.required ?? true,
        hint: field.hint,
        requirement: field.requirement,
      }));
    }


    if (selectedTemplate?.input_schema?.length) {
      return selectedTemplate.input_schema.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type || "image",
        required: field.required ?? true,
        hint: field.hint,
      }));
    }

    const staticInputs = selectedTemplate ? getStaticInputs(selectedTemplate.name) : null;
    if (staticInputs?.length) return staticInputs;

    return selectedTemplate
      ? [{ key: "product_image", label: "Product image", type: "image", required: true }]
      : [];
  })();

  const requiredInputsAreReady = inputFields
    .filter((field) => field.required)
    .every((field) =>
      field.type === "image"
        ? !!files[field.key] || !!libraryAssets[field.key]?.url
        : !!textInputs[field.key]?.trim(),
    );

  /** Presentation only: readiness counter for the compact builder header. */
  const isFieldFilled = (field: InputField) =>
    field.type === "image"
      ? !!files[field.key] || !!libraryAssets[field.key]?.url
      : !!textInputs[field.key]?.trim();
  const readyInputCount = inputFields.filter(isFieldFilled).length;
  const totalInputCount = inputFields.length;
  const readinessPercent = totalInputCount ? Math.round((readyInputCount / totalInputCount) * 100) : 0;

  /*
   * PRESENTATION-ONLY grouping: customers see product-level cards ("Top
   * garment") instead of individual backend reference slots. Grouping never
   * changes the input keys, ordering or the generation payload — the run gate
   * below still uses `requiredInputsAreReady` over the real inputs.
   */
  const inputGroupsSignature = inputFields.map((field) => field.key).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inputGroups = useMemo(() => campaignInputGroups(inputFields), [inputGroupsSignature]);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const openGroup = inputGroups.find((group) => group.id === openGroupId) ?? null;

  /*
   * P6b leak fix (presentation only): after a restored post-signup intent the
   * run may only be missing user input. We keep the intent alive and tell the
   * customer exactly what to add — the auto-run effect fires the moment the
   * last required input lands.
   */
  const [finishRunPrompt, setFinishRunPrompt] = useState<string[] | null>(null);
  const [highlightGroupId, setHighlightGroupId] = useState<string | null>(null);
  const finishPromptRef = useRef<string | null>(null);


  const groupFilledCount = (groupId: string) => {
    const group = inputGroups.find((item) => item.id === groupId);
    if (!group) return 0;
    return group.members.filter((member) => isFieldFilled(member.input)).length;
  };
  /** READY only when every REQUIRED backend input under the group is satisfied. */
  const groupIsReady = (groupId: string) => {
    const group = inputGroups.find((item) => item.id === groupId);
    if (!group) return false;
    const requiredMembers = group.members.filter((member) => member.required);
    const scope = requiredMembers.length ? requiredMembers : group.members;
    return scope.every((member) => isFieldFilled(member.input));
  };
  const groupPreview = (groupId: string): File | string | null => {
    const group = inputGroups.find((item) => item.id === groupId);
    if (!group) return null;
    for (const member of group.members) {
      const key = member.input.key;
      const file = files[key];
      if (file) return file;
      const library = libraryAssets[key]?.url;
      if (library) return library;
    }
    return null;
  };

  /** Readiness is counted per real-world group, not per backend slot. */
  const readyGroupCount = inputGroups.filter((group) => groupIsReady(group.id)).length;
  const totalGroupCount = inputGroups.length;
  const groupReadinessPercent = totalGroupCount
    ? Math.round((readyGroupCount / totalGroupCount) * 100)
    : 0;

  /** One card per group; single-slot groups keep the existing simple input. */
  const renderInputGroup = (groupId: string, compact = false) => {
    const group = inputGroups.find((item) => item.id === groupId);
    if (!group) return null;
    const inner = !group.multi ? (
      renderInputField(
        group.members[0].input,
        compact,
        group.members[0].label !== group.members[0].input.label ? group.members[0].label : undefined,
      )
    ) : (
      <CampaignAssetGroupCard
        group={group}
        compact={compact}
        filledCount={groupFilledCount(group.id)}
        totalCount={group.members.length}
        ready={groupIsReady(group.id)}
        preview={groupPreview(group.id)}
        onOpen={() => setOpenGroupId(group.id)}
      />
    );
    return (
      <div
        id={`campaign-input-group-${group.id}`}
        className={cn(
          "rounded-[1.5rem] transition-shadow",
          highlightGroupId === group.id &&
            "ring-2 ring-cyan-300/70 ring-offset-2 ring-offset-slate-950 motion-safe:animate-pulse",
        )}
      >
        {inner}
      </div>
    );
  };


  const groupModalNode = (
    <CampaignAssetGroupModal
      group={openGroup}
      open={!!openGroup}
      onClose={() => setOpenGroupId(null)}
      filledCount={openGroup ? groupFilledCount(openGroup.id) : 0}
      totalCount={openGroup?.members.length ?? 0}
      renderMember={(key, displayLabel) => {
        const field = inputFields.find((item) => item.key === key);
        return field ? renderInputField(field, true, displayLabel) : null;
      }}
    />
  );

  /** Auto-advance to the next unfilled slot after one is satisfied. */
  const advanceFromInput = (filledKey: string) => {
    const order = inputFields.map((field) => field.key);
    const startIndex = order.indexOf(filledKey);
    const next = inputFields
      .slice(startIndex + 1)
      .concat(inputFields.slice(0, Math.max(startIndex, 0)))
      .find((field) => field.key !== filledKey && !isFieldFilled(field));
    if (!next) {
      setFocusedInputKey(null);
      return;
    }
    setFocusedInputKey(next.key);
    window.requestAnimationFrame(() => {
      slotRefs.current[next.key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  /*
   * Phase 10 — deterministic brand autofill.
   * Pre-populates ONLY empty slots with assets already saved on the active
   * brand, writing the exact same `libraryAssets` / `textInputs` state the
   * customer would produce through the pickers. The submit/charge path,
   * validation and cost display are untouched.
   */
  const autofillSignature = `${selectedTemplateId}|${activeBrandId ?? ""}`;
  const autofillFieldKeys = inputFields.map((field) => field.key).join(",");

  useEffect(() => {
    if (!activeBrand || !inputFields.length) return;
    if (brandProductsQuery.isLoading || brandModelsQuery.isLoading) return;
    if (autofillAppliedRef.current === autofillSignature) return;
    autofillAppliedRef.current = autofillSignature;

    const plan = planBrandAutofill(
      inputFields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        assetType: field.requirement?.assetType ?? null,
      })),
      { brand: activeBrand, products: brandProducts, models: brandModels },
    );

    const applied: string[] = [];

    setLibraryAssets((current) => {
      const next = { ...current };
      for (const [key, asset] of Object.entries(plan.images)) {
        if (files[key] || current[key]?.url) continue;
        next[key] = asset;
        applied.push(key);
      }
      return next;
    });

    setTextInputs((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(plan.texts)) {
        if (current[key]?.trim()) continue;
        next[key] = value;
        applied.push(key);
      }
      return next;
    });

    if (applied.length) {
      setAutofilledKeys((current) => {
        const next = { ...current };
        for (const key of applied) next[key] = activeBrand.name;
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autofillSignature,
    autofillFieldKeys,
    activeBrand,
    brandProducts,
    brandModels,
    brandProductsQuery.isLoading,
    brandModelsQuery.isLoading,
  ]);

  /** Clears every slot autofilled from the brand — user values are never touched. */
  /** Once the user touches a slot it is theirs — drop the autofill marker. */
  const releaseAutofill = (key: string) =>
    setAutofilledKeys((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const clearAutofilled = () => {

    const keys = Object.keys(autofilledKeys);
    if (!keys.length) return;
    setLibraryAssets((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = null;
      return next;
    });
    setTextInputs((current) => {
      const next = { ...current };
      for (const key of keys) next[key] = "";
      return next;
    });
    setAutofilledKeys({});
  };


  // P5C — `estimated_credits_per_run` is the authoritative TOTAL from the
  // server (base tier + creator marketplace surcharge). Never recompute it here.
  const creditsRequired = selectedTemplate?.estimated_credits_per_run ?? 0;
  const marketplaceSurcharge = Math.max(0, selectedTemplate?.marketplace_surcharge_credits ?? 0);
  const baseRunCredits = selectedTemplate?.base_credits_per_run ?? Math.max(0, creditsRequired - marketplaceSurcharge);
  const selectedTemplateOutputCount = getTemplateOutputCount(selectedTemplate);
  const [outputSplitOpen, setOutputSplitOpen] = useState(false);
  const outputSplit = useMemo(() => {
    const images = Number(selectedTemplate?.counts?.imageOutputs ?? 0);
    const videos = Number(selectedTemplate?.counts?.videoOutputs ?? 0);
    if (!images && !videos) return null;
    if (!images || !videos) return null;
    return `${images} images · ${videos} videos`;
  }, [selectedTemplate]);
  const creditBalance = profile?.credits_balance ?? null;
  const displayedCreditBalance = creditBalance ?? 0;
  const profileIsResolving = !!user && !isPrivilegedUser && !profile;
  // FREEMIUM: generation is gated on credits, not on membership status.

  const adminVisualRemaining = getAdminVisualCreditsRemaining();
  const creditCycleTotal = isPrivilegedUser
    ? ADMIN_VISUAL_BUDGET_TOTAL
    : Math.max(profile?.subscription_cycle_credits ?? 0, displayedCreditBalance);
  const creditsRemaining = isPrivilegedUser ? adminVisualRemaining : displayedCreditBalance;
  const creditsRemainingPercent = creditCycleTotal > 0
    ? clampPercent((creditsRemaining / creditCycleTotal) * 100)
    : 0;
  const creditsRemainingValue = isPrivilegedUser
    ? `${formatCredits(adminVisualRemaining)} / ${formatCredits(ADMIN_VISUAL_BUDGET_TOTAL)}`
    : !user
      ? "Sign in"
    : profileIsResolving
      ? "Checking"
      : `${formatCredits(displayedCreditBalance)} cr`;
  const costDisplayBase = isPrivilegedUser ? "Bypassed for team access" : `${creditsRequired} credits`;
  const isPublicTemplateBrowser = !user;
  const selectedTemplateCheckoutPath = selectedTemplate ? buildTemplateCheckoutPath(selectedTemplate) : "/pricing";
  const detailTemplate = templates.find((template) => template.id === detailTemplateId) ?? null;
  const creditShortfall = Math.max(0, creditsRequired - displayedCreditBalance);
  const blockedByCredits = !!user && !isPrivilegedUser && !!profile && creditShortfall > 0;
  /**
   * ENTITLEMENT — drives the builder CTA only. A locked visitor can still inspect
   * requirements, counts, cost and description; they simply cannot generate.
   * Purchase is never triggered by selection, only by the explicit CTA below.
   */
  const entitlementLocked = !isPrivilegedUser && (!user || blockedByCredits);

  /* ------------------------------------------------------------------
   * F5/F6 — FREE FIRST VIDEO. Additive: everything below is inert unless the
   * template is free-enabled and the viewer is free-eligible.
   * ------------------------------------------------------------------ */
  const freeEntitlementQuery = useQuery({
    queryKey: ["free-video-entitlement", user?.id ?? "anon"],
    queryFn: fetchMyFreeVideoEntitlement,
    enabled: !!user,
    staleTime: 60 * 1000,
    retry: false,
  });
  const freeEntitlement = freeEntitlementQuery.data ?? null;
  const templateOffersFreeVideo = selectedTemplate?.free_preview_enabled === true;
  const hasActivePaidPlan =
    profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  /** Logged out, or signed in with no plan, no credits and an unused free video. */
  const freeVideoEligible =
    templateOffersFreeVideo &&
    !isPrivilegedUser &&
    (!user ||
      (!hasActivePaidPlan && displayedCreditBalance <= 0 && freeEntitlement?.status !== "consumed"));
  /** FREE MODE builder: this user holds an available entitlement for THIS template. */
  const freeModeActive =
    !!user &&
    templateOffersFreeVideo &&
    freeEntitlement?.status === "available" &&
    (!freeEntitlement.selectedTemplateId ||
      freeEntitlement.selectedTemplateId === String(selectedTemplate?.templateId ?? ""));
  const [freeRunJobId, setFreeRunJobId] = useState<string | null>(null);
  const costDisplay = freeModeActive ? "FREE GENERATION · First video $0" : costDisplayBase;

  /* F7 — free funnel telemetry (safe descriptors only). */
  const freeBuilderTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!freeModeActive || !selectedTemplate) return;
    const key = String(selectedTemplate.templateId);
    if (freeBuilderTrackedRef.current === key) return;
    freeBuilderTrackedRef.current = key;
    trackFreeVideo("free_video_builder_opened", {
      template_id: key,
      campaign_slug: selectedTemplate.name ?? null,
    });
  }, [freeModeActive, selectedTemplate]);

  const freeTerminalTrackedRef = useRef<string | null>(null);

  // FT8 — cast metadata comes from the template version's cast_config.
  // Absent config (every legacy template) keeps the Cast step hidden.
  const castConfig = selectedTemplate?.castConfig ?? null;
  const castEnabled = castConfig?.supported === true;
  const castRequired = castEnabled && castConfig?.required === true;
  /** First face-style image input hosts the cast picker (presentation only). */
  const castSlotFieldKey =
    inputFields.find(
      (field) => field.type === "image" && resolveInputRole(field.label, field.requirement?.assetType) === "face",
    )?.key ?? null;

  /*
   * Anonymous temp upload for one slot. Wrapped so a failure/timeout always
   * lands the slot in a retryable "error" state — never an endless spinner.
   */
  const startAnonUpload = (key: string, file: File) => {
    setAnonUploads((current) => ({ ...current, [key]: { status: "uploading" } }));
    void uploadAnonymousRunInput(file)
      .then((url) => setAnonUploads((current) => ({ ...current, [key]: { status: "ready", url } })))
      .catch((error) => {
        const message =
          error instanceof Error && error.message ? error.message : "Upload failed — tap to retry.";
        setAnonUploads((current) => ({ ...current, [key]: { status: "error", error: message } }));
        toast({ title: "Upload failed", description: message, variant: "destructive" });
      });
  };

  /*
   * Single source of truth for an input slot's UI. Rendered by the desktop
   * builder (compact = false) AND the mobile inline builder (compact = true).
   * Handlers, upload path, autofill release and validation are identical.
   */

  const renderInputField = (field: InputField, compact = false, displayLabelOverride?: string) =>
    field.type === "image" ? (
      <div
        key={field.key}
        ref={compact ? undefined : (node) => {
          slotRefs.current[field.key] = node;
        }}
        className={compact ? undefined : "scroll-mt-28"}
      >
        <TemplateInputCard
          compact={compact}
          label={field.label}
          displayLabel={
            castEnabled && field.key === castSlotFieldKey
              ? "Who's in the campaign?"
              : displayLabelOverride
          }
          required={field.required}
          highlighted={!compact && focusedInputKey === field.key}
          file={files[field.key] ?? null}
          requirement={field.requirement}
          sourceNote={autofilledKeys[field.key] ? `From ${autofilledKeys[field.key]}` : null}
          castPanel={
            castEnabled && field.key === castSlotFieldKey ? (
              <CastSelector
                required={castRequired}
                userId={user?.id ?? null}
                selection={castSelection}
                onSelectionChange={setCastSelection}
              />
            ) : undefined
          }
          onFileChange={(nextFile) => {
            setFiles((current) => ({ ...current, [field.key]: nextFile }));
            setLibraryAssets((current) => ({ ...current, [field.key]: null }));
            releaseAutofill(field.key);
            if (nextFile) advanceFromInput(field.key);
            // P6a: logged-out uploads go to temporary storage so the
            // asset survives an OAuth redirect. No generation starts.
            if (!user) {
              if (!nextFile) {
                setAnonUploads((current) => {
                  const next = { ...current };
                  delete next[field.key];
                  return next;
                });
                return;
              }
              startAnonUpload(field.key, nextFile);

            }
          }}
          libraryAsset={libraryAssets[field.key] ?? null}
          // P1: saved-library / brand pickers are account features.
          // Logged-out visitors configure with local files only.
          onLibrarySelect={
            user
              ? (asset) => {
                  setFiles((current) => ({ ...current, [field.key]: null }));
                  setLibraryAssets((current) => ({ ...current, [field.key]: asset }));
                  releaseAutofill(field.key);
                  advanceFromInput(field.key);
                }
              : undefined
          }
          onClear={() => {
            setFiles((current) => ({ ...current, [field.key]: null }));
            setLibraryAssets((current) => ({ ...current, [field.key]: null }));
            setAnonUploads((current) => {
              const next = { ...current };
              delete next[field.key];
              return next;
            });
            releaseAutofill(field.key);
          }}
        />
        {!user && anonUploads[field.key] ? (
          anonUploads[field.key]?.status === "error" ? (
            <button
              type="button"
              onClick={() => {
                const pending = files[field.key];
                if (pending) startAnonUpload(field.key, pending);
              }}
              className="mt-2 text-left text-[11px] font-semibold leading-relaxed text-rose-200 underline decoration-rose-300/50 underline-offset-2 hover:text-rose-100"
            >
              {anonUploads[field.key]?.error ?? "Upload failed"} — tap to retry
            </button>
          ) : (
            <p
              className={cn(
                "mt-2 text-[11px] leading-relaxed",
                anonUploads[field.key]?.status === "ready" ? "text-emerald-200" : "text-cyan-100",
              )}
            >
              {anonUploads[field.key]?.status === "uploading"
                ? "Saving upload for this session..."
                : "Upload saved — it will still be here after you sign in."}
            </p>
          )
        ) : null}

      </div>
    ) : (
      <div
        key={field.key}
        className={cn(
          "rounded-[1.25rem] border border-white/10 bg-black/25",
          compact ? "rounded-2xl p-2.5" : "p-3",
        )}
      >
        <p className="mb-2 flex items-center gap-2 truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
          <span className="truncate">{field.label}</span>
          {autofilledKeys[field.key] ? (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-display text-[9px] tracking-[0.18em] text-slate-400">
              From {autofilledKeys[field.key]}
            </span>
          ) : null}
        </p>

        {field.type === "prompt" && !compact ? (
          <Textarea
            value={textInputs[field.key] ?? ""}
            onChange={(event) => {
              releaseAutofill(field.key);
              setTextInputs((current) => ({ ...current, [field.key]: event.target.value }));
            }}
            rows={3}
            placeholder={field.label}
            className="min-h-[92px] rounded-[0.9rem] border-white/10 bg-white/[0.03] text-white"
          />
        ) : (
          <Input
            value={textInputs[field.key] ?? ""}
            onChange={(event) => {
              releaseAutofill(field.key);
              setTextInputs((current) => ({ ...current, [field.key]: event.target.value }));
            }}
            placeholder={field.label}
            className="h-11 rounded-[0.9rem] border-white/10 bg-white/[0.03] text-white"
          />
        )}
      </div>
    );


  // P0 — plan tier gate for the "Customize workflow" entry point.
  // Tier comes from profile.plan (billing-owned), matching the plan ladder keys
  // (free / starter / plus / pro / studio / team); admin/dev always qualify.
  const planKey = (profile?.plan ?? "free").toLowerCase();
  const planCanCustomize =
    isPrivilegedUser || planKey === "pro" || planKey === "studio" || planKey === "team";
  // Server-authoritative template permission (lab-template-detail mirrors template-fork).
  const templateCanCustomize = (templateDetailQuery.data as any)?.canCustomize === true;
  const customizeState = resolveCustomizeState({ planCanCustomize, templateCanCustomize });

  /** TR9: Pro entry point — creates a private fork and opens the personal editor. */
  const handleCustomizeWorkflow = async () => {
    // Defense in depth: only the fully-unlocked state may hit the fork endpoint.
    if (!canInitiateFork(customizeState)) return;
    const sourceTemplateId = selectedTemplate?.templateId ?? null;
    if (!sourceTemplateId) {
      toast({ title: "This template can't be customized yet", variant: "destructive" });
      return;
    }
    if (creatingFork) return;
    setCreatingFork(true);
    try {
      // TR10b — remember the run this fork came from so "RUN MY VERSION" can
      // reuse the assets already uploaded for it.
      const { forkId } = await createFork(sourceTemplateId, { sourceJobId: activeRunId });
      navigate(`/app/templates/customize/${forkId}`);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code === "PRO_REQUIRED") {
        setWorkflowUpgradeDialogOpen(true);
      } else if (code === "CUSTOMIZATION_NOT_ALLOWED") {
        toast({
          title: "This template can't be customized",
          description: "The creator has kept this workflow locked.",
        });
      } else {
        toast({ title: "Couldn't create your private version", variant: "destructive" });
      }
    } finally {
      setCreatingFork(false);
    }
  };



  /* Presentation-only emphasis when the builder swaps to another campaign. */
  useEffect(() => {
    if (!selectedTemplateId) return;
    setBuilderJustSwitched(true);
    const timer = window.setTimeout(() => setBuilderJustSwitched(false), 900);
    return () => window.clearTimeout(timer);
  }, [selectedTemplateId]);

  /*
   * Small, natural position adjustment for the inline (<lg) builder. Runs only
   * after layout/columns exist, and only when the panel top is below the fold —
   * never a jump to a global anchor, never centering.
   */
  const revealInlineBuilder = () => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const node = inlineBuilderRef.current;
        if (!node) return;
        const { top } = node.getBoundingClientRect();
        const limit = window.innerHeight - 140;
        if (top <= limit) return;
        window.scrollBy({ top: top - limit, behavior: reduce ? "auto" : "smooth" });
      });
    });
  };

  const handleTemplateSelect = (templateId: string, options?: { alwaysReveal?: boolean }) => {
    /* Cache the outgoing campaign's pending local inputs for this session, then
       restore anything previously configured for the incoming campaign.
       Caching only touches local state — nothing is uploaded and nothing spends. */
    if (selectedTemplateId && selectedTemplateId !== templateId) {
      inputDraftsRef.current[selectedTemplateId] = {
        files,
        libraryAssets,
        textInputs,
        castSelection,
        anonUploads,
      };
    }
    const draft = inputDraftsRef.current[templateId];

    setSelectedTemplateId(templateId);
    setFiles(draft?.files ?? {});
    setAnonUploads(draft?.anonUploads ?? {});
    setLibraryAssets(draft?.libraryAssets ?? {});

    setTextInputs(draft?.textInputs ?? {});
    setJobId(null);
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setResult(null);
    setCastSelection(draft?.castSelection ?? {});
    setAutofilledKeys({});
    autofillAppliedRef.current = "";

    /* SELECT = INSPECT ONLY. Clicking a campaign never starts checkout and never
       opens an account screen — it highlights the card and opens its builder so
       the visitor can read requirements, counts and cost before paying. Purchase
       happens exclusively from the builder's explicit "Unlock access →" CTA. */
    track("studio_opened", { template_id: templateId });




    if (isCompactLayout) {

      setInlineBuilderOpen(true);
      // Inline expansion: no teleporting. Only nudge if the panel top would sit
      // below the viewport, and only after layout exists.
      revealInlineBuilder();
      return;
    }

    // Cards far from the builder (e.g. the "For you" row at the top of the page)
    // must always scroll the builder into view, otherwise a click looks inert.
    if (options?.alwaysReveal) {
      // Defer past the re-render/paint of the newly selected template, then only
      // scroll if the builder isn't already comfortably in view (desktop side-by-side).
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const node = runnerSectionRef.current;
          if (!node) return;
          const { top } = node.getBoundingClientRect();
          if (top >= 0 && top < window.innerHeight * 0.5) return;
          node.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

  };



  /*
   * Phase 4 — marketplace multi-select batch run.
   * Reuses the existing single-run path (startTemplateRun) once per selected
   * template. No new runner, no new billing: the same credit confirm modal
   * gates the combined cost before anything is enqueued.
   */
  const [selectMode, setSelectMode] = useState(false);
  const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  const batchTemplates = useMemo(
    () => batchSelection
      .map((id) => templates.find((template) => template.id === id))
      .filter((template): template is ApiTemplate => !!template),
    [batchSelection, templates],
  );
  const batchCredits = batchTemplates.reduce(
    (total, template) => total + (template.estimated_credits_per_run || 0),
    0,
  );

  const exitSelectMode = () => {
    setSelectMode(false);
    setBatchSelection([]);
  };

  const toggleBatchSelection = (templateId: string) =>
    setBatchSelection((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId],
    );

  /** Derives a template's inputs the same way the single-run builder does. */
  const batchInputFieldsFor = (template: ApiTemplate): InputField[] => {
    if (template.input_schema?.length) {
      return template.input_schema.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type || "image",
        required: field.required ?? true,
        hint: field.hint,
      }));
    }
    const staticInputs = getStaticInputs(template.name);
    if (staticInputs?.length) return staticInputs;
    return [{ key: "product_image", label: "Product image", type: "image", required: true }];
  };

  /** Fills a template from the active brand; reports anything still missing. */
  const buildBatchRunInputs = (template: ApiTemplate) => {
    const fields = batchInputFieldsFor(template);
    const plan = planBrandAutofill(
      fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        assetType: field.requirement?.assetType ?? null,
      })),
      { brand: activeBrand!, products: brandProducts, models: brandModels },
    );

    const inputs: Record<string, string> = {};
    const missing: string[] = [];

    for (const field of fields) {
      const value = field.type === "image" ? plan.images[field.key]?.url ?? "" : plan.texts[field.key] ?? "";
      if (value) {
        inputs[field.key] = value;
      } else if (field.required) {
        missing.push(field.label);
      }
    }

    return { inputs, missing };
  };

  /**
   * P2 — freeze the builder and gate on auth instead of navigating away.
   * The configuration is captured in memory so P3/P4 can replay it.
   */
  const gateReturnTo = selectedTemplate
    ? `/app/templates?template=${encodeURIComponent(String(selectedTemplate.id))}`
    : "/app/templates";

  const gateHasInputs = useMemo(
    () =>
      Object.values(files).some(Boolean) ||
      Object.values(textInputs).some((value) => Boolean(value && value.trim())) ||
      Object.values(castSelection).some(Boolean),
    [castSelection, files, textInputs],
  );

  // ---- P7: logged-out conversion funnel (instrumentation only, once per moment) ----
  const anonViewedRef = useRef<string | null>(null);
  const anonBuilderStartedRef = useRef<string | null>(null);
  const anonInputKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (user || !selectedTemplateId) return;
    if (anonViewedRef.current === selectedTemplateId) return;
    anonViewedRef.current = selectedTemplateId;
    track("anonymous_template_view", { template_id: selectedTemplateId });
  }, [selectedTemplateId, user]);

  useEffect(() => {
    if (user || !selectedTemplateId) return;
    const filled: string[] = [
      ...Object.entries(files).filter(([, value]) => Boolean(value)).map(([key]) => `file:${key}`),
      ...Object.entries(anonUploads)
        .filter(([, entry]) => entry.status === "ready")
        .map(([key]) => `file:${key}`),
      ...Object.entries(textInputs)
        .filter(([, value]) => Boolean(value && String(value).trim()))
        .map(([key]) => `text:${key}`),
      ...Object.entries(castSelection).filter(([, value]) => Boolean(value)).map(([key]) => `cast:${key}`),
    ];
    if (!filled.length) return;
    if (anonBuilderStartedRef.current !== selectedTemplateId) {
      anonBuilderStartedRef.current = selectedTemplateId;
      track("anonymous_builder_started", { template_id: selectedTemplateId });
    }
    for (const key of filled) {
      const scoped = `${selectedTemplateId}:${key}`;
      if (anonInputKeysRef.current.has(scoped)) continue;
      anonInputKeysRef.current.add(scoped);
      track("anonymous_input_added", { template_id: selectedTemplateId, kind: key.split(":")[0] });
    }
  }, [anonUploads, castSelection, files, selectedTemplateId, textInputs, user]);

  /* Funnel step: first asset added to a campaign by a signed-in user. */
  const firstAssetTrackedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user || !selectedTemplateId) return;
    if (firstAssetTrackedRef.current.has(selectedTemplateId)) return;
    const hasAsset =
      Object.values(files).some(Boolean) ||
      Object.values(libraryAssets).some(Boolean) ||
      Object.values(textInputs).some((value) => Boolean(value && String(value).trim()));
    if (!hasAsset) return;
    firstAssetTrackedRef.current.add(selectedTemplateId);
    track("first_asset_added", { template_id: selectedTemplateId });
  }, [files, libraryAssets, textInputs, selectedTemplateId, user]);

  /**
   * The ONE explicit purchase entry point on this page ("Unlock access →").
   * Guests get the payment-first split modal (selection + local setup preserved
   * through checkout); signed-in unfunded users get the contextual offer.
   */
  const openUnlockCheckout = () => {
    if (!selectedTemplate) return;
    track("template_unlock_click", {
      template_id: String(selectedTemplate.id),
      surface: "builder",
      credits_required: creditsRequired,
    });
    if (!user) {
      openGenerateAuthGate();
      return;
    }
    track("no_plan_generate_attempt", {
      template_id: String(selectedTemplate.id),
      credits_required: creditsRequired,
      credit_balance: displayedCreditBalance,
      surface: "builder_unlock",
    });
    setPaywallOpen(true);
  };

  const openGenerateAuthGate = () => {

    if (selectedTemplate) {
      setPendingGenerationIntent({
        templateId: String(selectedTemplate.id),
        versionId: selectedTemplate.versionId ?? null,
        // P6a temp public URLs — the uploads survive the OAuth round-trip.
        inputs: Object.entries(anonUploads)
          .filter(([, entry]) => entry.status === "ready" && entry.url)
          .map(([slotKey, entry]) => ({ slotKey, tempUrl: String(entry.url) })),
        textOverrides: { ...textInputs },
        selectedOptions: {},
        selectedCast: Object.fromEntries(
          Object.entries(castSelection).filter(([, value]) => Boolean(value)),
        ) as Record<string, string>,
        returnTo: gateReturnTo,
        creditCost: isPrivilegedUser ? 0 : creditsRequired,
      });

    }
    track("anonymous_generate_clicked", {
      template_id: selectedTemplate ? String(selectedTemplate.id) : null,
      has_inputs: gateHasInputs,
    });
    track("generate_auth_gate_shown", {
      templateId: selectedTemplate ? String(selectedTemplate.id) : null,
      has_inputs: gateHasInputs,
    });
    setAuthGateOpen(true);
  };

  const requestBatchRun = async () => {
    if (!batchTemplates.length) return;
    if (!user) {
      openGenerateAuthGate();
      return;
    }
    if (!activeBrand) {
      toast({
        title: "Choose a brand first",
        description: "Batch runs use your active brand's saved assets.",
        variant: "destructive",
      });
      return;
    }
    if (!isPrivilegedUser) {
      if (displayedCreditBalance < batchCredits) {
        setPaywallOpen(true);
        return;
      }
    }
    setBatchConfirmOpen(true);
  };

  const confirmBatchRun = async () => {
    setBatchConfirmOpen(false);
    if (!batchTemplates.length || !activeBrand) return;

    setBatchRunning(true);
    const skipped: string[] = [];
    let queued = 0;

    try {
      for (const template of batchTemplates) {
        if (!template.versionId) {
          skipped.push(`${template.name} — no live version`);
          continue;
        }

        const { inputs, missing } = buildBatchRunInputs(template);
        if (missing.length) {
          skipped.push(`${template.name} — needs ${missing.join(", ")}`);
          continue;
        }

        try {
          const data = await startTemplateRun(template.versionId, inputs);
          if (data?.error) throw new Error(String(data.error));
          if (!data?.jobId) throw new Error("no job id returned");
          queued += 1;
          if (isPrivilegedUser) {
            recordAdminVisualCreditUsage(template.estimated_credits_per_run || 0);
          }
        } catch (error) {
          skipped.push(
            `${template.name} — ${error instanceof Error ? error.message : "could not start"}`,
          );
        }
      }

      if (isPrivilegedUser) setAdminVisualSpent(getAdminVisualCreditsSpent());
      void refetchRecentRuns();
      void refreshProfile();

      if (queued) {
        toast({
          title: `${queued} ${queued === 1 ? "campaign" : "campaigns"} queued`,
          description: skipped.length
            ? `Skipped ${skipped.length}: ${skipped.join(" · ")}`
            : "Track them in your campaign history.",
        });
      } else {
        toast({
          title: "Nothing was queued",
          description: skipped.join(" · ") || "No runnable templates in the selection.",
          variant: "destructive",
        });
      }

      if (queued) exitSelectMode();
    } finally {
      setBatchRunning(false);
    }
  };

  /** F5 — FREE FIRST VIDEO run. Server waives credits and runs one video only. */
  const handleFreeRun = async () => {
    if (!selectedTemplate?.templateId) return;
    if (!requiredInputsAreReady) {
      toast({
        title: "Missing inputs",
        description: "Add your product assets before generating.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setJobId(null);
    setFreeRunJobId(null);
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setResult(null);

    try {
      setRunPhase("uploading");
      const uploadedImageInputs = Object.fromEntries(
        await Promise.all(
          inputFields
            .filter((field) => field.type === "image" && (files[field.key] || libraryAssets[field.key]?.url))
            .map(async (field) => {
              const file = files[field.key];
              if (!file) return [field.key, libraryAssets[field.key]!.url];
              const url = await uploadRunInputFile(file);
              return [field.key, url];
            }),
        ),
      );

      setRunPhase("preparing");
      const textOnlyInputs = Object.fromEntries(
        inputFields
          .filter((field) => field.type !== "image")
          .map((field) => [field.key, textInputs[field.key]?.trim() ?? ""])
          .filter(([, value]) => value.length > 0),
      );

      track("free_video_run_started", { template_id: String(selectedTemplate.id) });
      trackFreeVideo("free_video_generation_started", {
        template_id: String(selectedTemplate.templateId),
        campaign_slug: selectedTemplate.name ?? null,
      });
      const { jobId: freeJobId } = await startFreeVideoRun({
        templateId: String(selectedTemplate.templateId),
        inputs: { ...textOnlyInputs, ...uploadedImageInputs },
      });

      setJobId(freeJobId);
      setFreeRunJobId(freeJobId);
      setResult({ status: "queued", progress: 0, outputs: [] });
      void refetchRecentRuns();
      void freeEntitlementQuery.refetch();
      toast({ title: "Your free video is generating", description: "This takes a few minutes." });
    } catch (error) {
      trackFreeVideo("free_video_generation_failed", {
        template_id: selectedTemplate ? String(selectedTemplate.templateId) : null,
        stage: "start",
      });
      toast({
        title: "Free generation failed",
        description: error instanceof Error ? error.message : "Could not start your free video.",
        variant: "destructive",
      });
    } finally {
      setRunPhase("idle");
      setSubmitting(false);
    }
  };

  const handleRun = async () => {
    if (!selectedTemplate) return;
    track("run_template_clicked", {
      template_id: String(selectedTemplate.id),
      credits_required: creditsRequired,
      base_credits: baseRunCredits,
      marketplace_surcharge_credits: marketplaceSurcharge,
      monetized: marketplaceSurcharge > 0,
    });
    if (!user) {
      openGenerateAuthGate();
      return;
    }
    if (!selectedTemplate.versionId) {
      toast({
        title: "Template unavailable",
        description: "This template is missing a live version.",
        variant: "destructive",
      });
      return;
    }
    if (!requiredInputsAreReady) {
      toast({
        title: "Missing inputs",
        description: "Fill every required field before running the template.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setCheckingCredits(true);
    setJobId(null);
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setResult(null);

    try {
      if (!isPrivilegedUser) {
        const freshProfile = await refreshProfile();
        const latestProfile = freshProfile ?? profile;
        const latestStatus = latestProfile?.subscription_status;
        const latestBalance = latestProfile?.credits_balance ?? 0;
        const latestHasActiveMembership = latestStatus === "active" || latestStatus === "trialing";

        if (latestBalance < creditsRequired && freeVideoEligible) {
          setUnlockOpen(true);
          return;
        }

        if (latestBalance < creditsRequired) {
          track("no_plan_generate_attempt", {
            template_id: String(selectedTemplate.id),
            credits_required: creditsRequired,
            credit_balance: latestBalance,
            has_paid_plan: latestHasActiveMembership,
          });
          setPaywallOpen(true);
          return;
        }

        if (!latestHasActiveMembership && latestBalance <= 0) {
          track("no_plan_generate_attempt", {
            template_id: String(selectedTemplate.id),
            credits_required: creditsRequired,
            credit_balance: latestBalance,
            has_paid_plan: false,
          });
          setPaywallOpen(true);
          return;
        }
      }

      setCheckingCredits(false);
      setRunPhase("uploading");

      let uploadedImageInputs: Record<string, string>;
      try {
        uploadedImageInputs = Object.fromEntries(
          await Promise.all(
            inputFields
              .filter((field) => field.type === "image" && (files[field.key] || libraryAssets[field.key]?.url))
              .map(async (field) => {
                const file = files[field.key];
                if (!file) {
                  // FT4: reuse an asset already stored in the user's library.
                  return [field.key, libraryAssets[field.key]!.url];
                }
                const url = await uploadRunInputFile(file);
                // FT4: best-effort save so this asset is reusable later.
                void saveLibraryAsset({
                  kind: libraryKindForAssetType(field.requirement?.assetType),
                  url,
                  name: file.name,
                  metadata: { source: "template_input", input_key: field.key },
                });
                return [field.key, url];
              }),
          ),
        );
      } catch (uploadError) {
        // Never start a paid run when an asset failed to upload.
        throw new Error(
          uploadError instanceof Error
            ? `Asset upload failed — no credits were used. ${uploadError.message}`
            : "Asset upload failed — no credits were used.",
        );
      }

      setRunPhase("preparing");
      track("inputs_ready", { template_id: selectedTemplate.id });
      track("generate", { template_id: selectedTemplate.id });


      const inputs = Object.fromEntries(
        inputFields
          .filter((field) => field.type !== "image")
          .map((field) => [field.key, textInputs[field.key]?.trim() ?? ""])
          .filter(([, value]) => value.length > 0),
      );

      const data = await startTemplateRun(selectedTemplate.versionId, {
        ...inputs,
        ...uploadedImageInputs,
      });

      if (data?.error) throw new Error(String(data.error));
      if (!data?.jobId) throw new Error("Template run did not return a job id.");

      if (isPrivilegedUser) {
        recordAdminVisualCreditUsage(creditsRequired);
        setAdminVisualSpent(getAdminVisualCreditsSpent());
      }

      setJobId(String(data.jobId));
      setResult({
        status: "queued",
        progress: 0,
        outputs: [],
      });
      void refetchRecentRuns();
      void refreshProfile();
      toast({
        title: `${selectedTemplate.name} queued`,
        description: `${selectedTemplate.name} is running.`,
      });
    } catch (error) {
      toast({
        title: "Run failed",
        description: error instanceof Error ? error.message : "Could not start the template run.",
        variant: "destructive",
      });
    } finally {
      setCheckingCredits(false);
      setRunPhase("idle");
      setSubmitting(false);
    }

  };

  /* ------------------------------------------------------------------
   * P6b — post-auth restoration + auto-run.
   * The intent captured at gate-open is rehydrated into the builder, then the
   * run starts through the normal authenticated path (once, if affordable).
   * ------------------------------------------------------------------ */
  const restoredIntentRef = useRef<string | null>(null);
  const [autoRunIntent, setAutoRunIntent] = useState<PendingGenerationIntent | null>(null);
  const [restoreAfford, setRestoreAfford] = useState<{ required: number; available: number } | null>(null);
  const [planOfferOpen, setPlanOfferOpen] = useState(() => isPlanOfferActive());

  useEffect(() => {
    const unsubscribe = subscribePlanOffer(setPlanOfferOpen);
    return () => {
      unsubscribe();
    };
  }, []);

  /*
   * While a restored generation is still unfinished, Brand Setup must not
   * divert the customer away from their first run.
   */
  const [pendingIntentInProgress, setPendingIntentInProgress] = useState(false);
  useEffect(() => {
    const intent = getPendingGenerationIntent();
    setPendingIntentInProgress(!!intent && !pendingGenerationConsumed(intent));
  }, [autoRunIntent, finishRunPrompt, jobId, requiredInputsAreReady, user]);


  useEffect(() => {
    if (!user || !templates.length) return;
    const intent = getPendingGenerationIntent();
    if (!intent) return;
    const signature = intentSignature(intent);
    if (restoredIntentRef.current === signature) return;
    if (pendingGenerationConsumed(intent)) {
      restoredIntentRef.current = signature;
      return;
    }
    const match = templates.find(
      (template) => template.id.toLowerCase() === intent.templateId.toLowerCase(),
    );
    if (!match) return;

    restoredIntentRef.current = signature;
    setSelectedTemplateId(match.id);
    if (Object.keys(intent.textOverrides).length) {
      setTextInputs((current) => ({ ...current, ...intent.textOverrides }));
    }
    if (Object.keys(intent.selectedOptions).length) {
      setTextInputs((current) => ({ ...current, ...intent.selectedOptions }));
    }
    if (Object.keys(intent.selectedCast).length) {
      setCastSelection((current) => ({ ...current, ...intent.selectedCast }) as CastSelection);
    }
    if (intent.inputs.length) {
      // The anon-temp assets are public URLs the authenticated run can read —
      // they slot in exactly like a saved library asset (no re-upload needed).
      setLibraryAssets((current) => {
        const next = { ...current };
        for (const input of intent.inputs) next[input.slotKey] = { url: input.tempUrl, name: "Saved upload" };
        return next;
      });
      setFiles({});
      setAnonUploads({});
    }
    track("pending_generation_restored", {
      template_id: match.id,
      assets: intent.inputs.length,
    });
    setAutoRunIntent(intent);
  }, [templates, user]);

  useEffect(() => {
    if (!autoRunIntent || !user) return;
    // Sequence: auth → (plan offer) → restore + auto-run.
    if (planOfferOpen) return;
    if (!selectedTemplate || selectedTemplate.id.toLowerCase() !== autoRunIntent.templateId.toLowerCase()) return;
    if (!isPrivilegedUser && !profile) return;
    if (submitting || jobId) return;

    const consume = () => {
      markPendingGenerationConsumed(autoRunIntent);
      setAutoRunIntent(null);
    };

    if (!selectedTemplate.versionId) {
      // Template genuinely not runnable — drop the intent as before.
      consume();
      return;
    }

    if (!requiredInputsAreReady) {
      /*
       * Keep the intent ALIVE: the only blocker is user input, so this effect
       * re-runs and generates automatically once the last required asset lands.
       */
      const signature = intentSignature(autoRunIntent);
      if (finishPromptRef.current !== signature) {
        finishPromptRef.current = signature;
        const missing = inputFields.filter((field) => field.required && !isFieldFilled(field));
        setFinishRunPrompt(missing.map((field) => field.label).filter(Boolean));
        const firstMissing = missing[0];
        const targetGroup = firstMissing
          ? inputGroups.find((group) =>
              group.members.some((member) => member.input.key === firstMissing.key),
            )
          : null;
        if (targetGroup) {
          setHighlightGroupId(targetGroup.id);
          window.setTimeout(() => {
            document
              .getElementById(`campaign-input-group-${targetGroup.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 220);
        }
      }
      return;
    }

    setFinishRunPrompt(null);
    setHighlightGroupId(null);


    const required = isPrivilegedUser ? 0 : creditsRequired;
    const available = isPrivilegedUser ? required : displayedCreditBalance;
    if (required > available) {
      consume();
      setRestoreAfford({ required, available });
      return;
    }

    consume();
    clearPendingGenerationIntent();
    toast({
      title: "✓ Account ready — Generating your campaign…",
      description: `${selectedTemplate.name} is starting now.`,
    });
    track("first_generation_started", { template_id: selectedTemplate.id, credits: required });
    firstGenerationPendingRef.current = true;
    void handleRun();
  }, [
    autoRunIntent,
    creditsRequired,
    displayedCreditBalance,
    isPrivilegedUser,
    jobId,
    planOfferOpen,
    profile,
    requiredInputsAreReady,
    selectedTemplate,
    submitting,
    user,
  ]);



  const isRunning = result?.status === "queued" || result?.status === "running" || result?.status === "video_pending";

  useEffect(() => {
    if (!freeRunJobId || activeRunId !== freeRunJobId) return;
    const status = result?.status;
    if (status !== "complete" && status !== "failed") return;
    const key = `${freeRunJobId}:${status}`;
    if (freeTerminalTrackedRef.current === key) return;
    freeTerminalTrackedRef.current = key;
    trackFreeVideo(
      status === "complete" ? "free_video_generation_completed" : "free_video_generation_failed",
      { template_id: selectedTemplate ? String(selectedTemplate.templateId) : null, stage: "run" },
    );
  }, [freeRunJobId, activeRunId, result?.status, selectedTemplate]);

  /* Rows matching the ACTUAL rendered column count (2 <640px, 3 at sm). */
  const templateRows = useMemo(() => {
    const columns = Math.max(1, gridColumns);
    const rows: ApiTemplate[][] = [];
    for (let index = 0; index < visibleTemplates.length; index += columns) {
      rows.push(visibleTemplates.slice(index, index + columns));
    }
    return rows;
  }, [gridColumns, visibleTemplates]);

  const selectedRowIndex = templateRows.findIndex((row) =>
    row.some((entry) => entry.id === selectedTemplateId),
  );

  /*
   * MOBILE / TABLET inline builder. Only ONE instance exists at a time: below lg
   * the desktop aside is not rendered, above lg this node is null. All state is
   * the page's own, so switching breakpoints keeps files / cast / readiness.
   */
  const missingAssetCount = Math.max(1, totalGroupCount - readyGroupCount);
  const missingAssetLabel = `Add ${missingAssetCount} more asset${missingAssetCount === 1 ? "" : "s"}`;
  /** Contextual builder CTA: unlock (locked) → add assets (incomplete) → run. */
  const inlineGenerateLabel = freeModeActive
    ? submitting || isRunning
      ? "Generating your free video..."
      : !requiredInputsAreReady
        ? missingAssetLabel
        : "Generate my free video →"
    : entitlementLocked
    ? "Unlock access →"
    : !requiredInputsAreReady
      ? missingAssetLabel
      : checkingCredits
        ? "Checking credits..."
        : runPhase === "uploading"
          ? "Uploading assets..."
          : runPhase === "preparing"
            ? "Preparing campaign..."
            : submitting || isRunning
              ? "Generating..."
              : isPrivilegedUser
                ? "Run template →"
                : `Run template → ${creditsRequired} cr`;


  const inlineBuilderNode =
    isCompactLayout && inlineBuilderOpen && selectedTemplate && !selectMode && !hasActiveCampaignWorkspace ? (
      <InlineCampaignBuilder
        key={selectedTemplate.id}
        ref={inlineBuilderRef}
        templateName={selectedTemplate.name}
        metaLine={`${formatCount(inputFields.length, "input", "inputs")} · ${formatCampaignOutputs(selectedTemplate.counts)} · ${creditsRequired} cr`}
        readyCount={readyGroupCount}
        totalCount={totalGroupCount}
        creditsLabel={costDisplay}
        topSlot={
          castEnabled && !castSlotFieldKey ? (
            <CastSelector
              required={castRequired}
              userId={user?.id ?? null}
              selection={castSelection}
              onSelectionChange={setCastSelection}
            />
          ) : undefined
        }
        generateDisabled={
          submitting ||
          isRunning ||
          ((freeModeActive || !entitlementLocked) && !requiredInputsAreReady)
        }
        generateLabel={inlineGenerateLabel}
        onGenerate={() =>
          freeModeActive ? void handleFreeRun() : entitlementLocked ? openUnlockCheckout() : void handleRun()
        }

        onClose={() => setInlineBuilderOpen(false)}
        footer={
          freeModeActive ? (
            <p className="text-[11px] leading-relaxed text-emerald-100">
              Your first video is free — no card required.
            </p>
          ) : blockedByCredits ? (
            <p className="text-[11px] leading-relaxed text-amber-100">
              You need {creditShortfall} more credit{creditShortfall === 1 ? "" : "s"} —{" "}
              <Link to="/membership?tab=credits" className="underline underline-offset-4">
                buy credits
              </Link>
            </p>
          ) : !user ? (
            <p className="text-[11px] leading-relaxed text-slate-400">
              Your files stay on this device until you generate.
            </p>
          ) : null
        }
      >
        {inputGroups.map((group) => (
          <div key={group.id}>{renderInputGroup(group.id, true)}</div>
        ))}
      </InlineCampaignBuilder>
    ) : null;



  return (
    <SiteShell>
      {/* Dynamic template detail meta — real name/description/preview only. */}
      <PageMeta
        title={
          selectedTemplate?.name
            ? `${selectedTemplate.name} · FUSE`
            : "Campaign Template Marketplace · FUSE"
        }
        description={
          selectedTemplate?.description?.trim().slice(0, 155) ||
          "Browse FUSE campaign templates, add your brand assets, and generate a full campaign."
        }
        path={
          selectedTemplate?.id
            ? `/app/templates?template=${encodeURIComponent(String(selectedTemplate.id))}`
            : "/app/templates"
        }
        image={selectedTemplate?.preview_url ?? null}
      />

      <div
        className={cn(
          "transition-[filter,opacity] duration-200",
          authGateOpen ? "pointer-events-none select-none blur-[2px] opacity-70" : "",
        )}
        aria-hidden={authGateOpen}
      >
      <section className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-4 md:py-10 lg:px-5">
        <PlanActivationNotice />

        {/* RETENTION P5 — light personalized greeting anchoring the logged-in home. */}
        {user && !hasActiveCampaignWorkspace ? (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-[0.18em] text-white sm:text-xl">
              Welcome back
              {activeBrand?.name ? (
                <span className="text-cyan-200"> — {activeBrand.name}</span>
              ) : null}
            </h2>
            <StreakChip />
          </div>
        ) : null}

        {/* Guest marketplace leads with campaign media — the compact CAMPAIGNS
            bar is the top of the page. Only the post-purchase studio keeps a heading. */}
        {!isPublicTemplateBrowser ? (
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
                Post-Purchase Studio
              </p>
              <h1 className="mt-2 font-display text-xl font-bold leading-tight text-white sm:mt-3 sm:text-4xl">
                Your campaign is ready. Upload your assets.
              </h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-300 sm:mt-3 sm:text-sm sm:leading-6 md:text-base">
                The selected workflow is loaded. Add the required assets, confirm the run cost, and generate campaign videos.
              </p>
            </div>
            <CreditRemainingMeter
              label={isPrivilegedUser ? "Team Credits Remaining" : "Credits Remaining"}
              percent={creditsRemainingPercent}
              value={creditsRemainingValue}
              showTopUp={!!user && !!profile && !isPrivilegedUser && displayedCreditBalance <= 0}
            />
          </div>
        ) : null}

        {/* Quiet history affordance — the builder stays dominant. */}
        {user ? (
          <div className="mt-6 flex justify-start">
            <CampaignHistoryLauncher
              campaigns={recentRuns}
              onOpenDrawer={() => setHistoryOpen(true)}
              onOpenCampaign={handleOpenHistoricalRun}
              isError={recentRunsQuery.isError}
              onRetry={() => void refetchRecentRuns()}
              previewUrlForTemplate={previewUrlForTemplate}
            />
          </div>
        ) : null}

        {/* RETENTION P2 — continue creating (real runs only; hidden when none). */}
        {user && !hasActiveCampaignWorkspace ? (
          <ContinueCreatingStrip
            className="mt-6"
            campaigns={recentRuns}
            previewUrlForTemplate={previewUrlForTemplate}
            templateIdForRun={(run) =>
              templates.find(
                (template) => template.name.toLowerCase() === (run.templateName ?? "").toLowerCase(),
              )?.id ?? null
            }
            onOpenRun={handleOpenHistoricalRun}
            onRunAgain={handleRemixCampaign}
          />
        ) : null}

        {/* RETENTION P3 — deterministic personalized (or honestly "popular") row. */}
        {user && !hasActiveCampaignWorkspace ? (
          <ForYouRow
            className="mt-8"
            mode={forYou.mode}
            entries={forYou.entries}
            brandName={forYou.mode === "personalized" ? activeBrand?.name ?? null : null}
            renderMedia={(template) => (
              <TemplateVibeMedia template={template} className="aspect-[9/16] w-full object-cover" />
            )}
            fitFor={(template) => (activeBrand ? templateFitMap[String(template.id)] ?? null : null)}
            canFavorite={canFavorite}
            isFavorite={(id) => isFavorite(id)}
            onToggleFavorite={(id) => toggleFavorite(id)}
            onSelect={(template) => {
              track("for_you_template_clicked", { template_id: template.id });
              navigate(templateDetailPath(template));
            }}

            onShown={(mode, count) => track("for_you_shown", { mode, count })}
          />
        ) : null}





        {/* P6b — truthful affordability state after a restored pending run. */}
        {restoreAfford ? (
          <div className="mt-6 rounded-[1.5rem] border border-amber-300/25 bg-amber-300/[0.07] p-5">
            <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-amber-100">
              Your account is ready
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-50/90">
              {restoreAfford.available.toLocaleString()} credits available. This campaign requires{" "}
              {restoreAfford.required.toLocaleString()} credits. Your uploads and setup are saved.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-cyan-300 px-5 font-semibold text-slate-950 hover:bg-cyan-200">
                <Link to="/membership">View Starter</Link>
              </Button>
            </div>

          </div>
        ) : null}

        {/* P6b — signed in, but the run still needs assets. Never a dead end. */}
        {finishRunPrompt ? (
          <div className="mt-6 rounded-[1.5rem] border border-cyan-300/30 bg-cyan-300/[0.08] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-cyan-100">
                  ✓ You're signed in
                </p>
                <p className="mt-2 text-sm leading-6 text-cyan-50/90">
                  {finishRunPrompt.length
                    ? `Add ${finishRunPrompt.join(", ")} and your campaign will generate automatically.`
                    : "Add the remaining required assets and your campaign will generate automatically."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  setFinishRunPrompt(null);
                  setHighlightGroupId(null);
                }}
                className="rounded-full p-1.5 text-cyan-100/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        {!hasActiveCampaignWorkspace && !pendingIntentInProgress ? (
          <BrandActivationBanner surface="marketplace" className="mt-6" />
        ) : null}


        {isPrivilegedUser ? (
          <section className="mt-6 rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                  Admin Template Operations
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Use the node workbench for graph editing, template creation, cloning, version activation, node numbering, output numbering, and canvas test runs.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                  <Link to="/app/lab/canvas">
                    <Network className="mr-2 h-4 w-4" />
                    Open Node Workbench
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10">
                  <Link to="/admin/templates">
                    <GitBranch className="mr-2 h-4 w-4" />
                    Versions
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10">
                  <Link to="/admin/audits">
                    <Film className="mr-2 h-4 w-4" />
                    Test Runs
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <div
          data-studio-mode={studioMode}
          className={cn(
            "grid gap-6 motion-safe:transition-[grid-template-columns] motion-safe:duration-300",
            isPublicTemplateBrowser ? "mt-3" : "mt-8",
            hasActiveCampaignWorkspace
              ? "xl:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]"
              : "xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]",
          )}
        >
          {!hasActiveCampaignWorkspace ? (
          <section className="min-w-0">
            {/* Header — mobile keeps the approved block. lg+ collapses to one
                compact, subtle toolbar so campaigns enter the viewport fast. */}
            <div className="flex min-w-0 flex-wrap items-center gap-3 lg:gap-2">
              <h2 className="font-display text-base font-bold uppercase tracking-[0.16em] text-white sm:text-lg lg:text-[11px] lg:font-semibold lg:tracking-[0.22em] lg:text-slate-400">
                Campaigns
              </h2>
              {templatesQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-cyan-100" /> : null}

              {/* lg+ only — filters tucked into the toolbar line. */}
              <div className="hidden min-w-0 flex-wrap gap-1.5 lg:flex">
                {FEED_CHIPS.map((chip) => {
                  const active = feedChip === chip.key;
                  return (
                    <button
                      key={`toolbar-${chip.key}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFeedChip(active ? "all" : chip.key)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] transition-colors",
                        active
                          ? "border-cyan-300/50 bg-cyan-300/12 text-cyan-100"
                          : "border-white/8 bg-white/[0.03] text-slate-400 hover:text-white",
                      )}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              <label className="ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 sm:max-w-[220px] sm:flex-none lg:max-w-[180px] lg:py-1">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <input
                  value={feedSearch}
                  onChange={(event) => setFeedSearch(event.target.value)}
                  placeholder="Search"
                  aria-label="Search campaigns"
                  className="w-full bg-transparent text-[12.5px] text-white placeholder:text-slate-500 focus:outline-none lg:text-[11.5px]"
                />
              </label>
            </div>

            <p className="mt-1 text-[11.5px] leading-4 text-slate-400 lg:hidden">
              Pick one. Add your products. Hit run.
            </p>


            {/* Presentation-only chips — scrollable on mobile (<lg only) */}
            <div className="-mx-1 mt-3 flex min-w-0 max-w-full gap-2 overflow-x-auto px-1 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FEED_CHIPS.map((chip) => {
                const active = feedChip === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFeedChip(active ? "all" : chip.key)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors",
                      active
                        ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Phase 5 — contextual activation moment above the grid (<lg). */}
            {activeBrand ? (
              <div className="mt-2 lg:hidden">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  Recommended for {activeBrand.name}
                  {readyForBrandCount > 0 ? (
                    <span className="ml-2 text-slate-400">
                      {readyForBrandCount} ready to run with your saved assets
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Based on your saved products and brand assets.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile: compact inline link so templates stay above the fold. */}
                <button
                  type="button"
                  onClick={() => navigate(`${ONBOARDING_ROUTE}?step=1`)}
                  className="mt-2 inline-flex text-xs font-semibold text-cyan-200 underline underline-offset-4 transition-colors hover:text-cyan-100 lg:hidden"
                >
                  Build your brand →
                </button>
              </>
            )}



            {templatesQuery.isError ? (
              <div className="mt-5 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                Could not load campaigns.
              </div>
            ) : null}

            {/* Temporarily hidden (SHOW_MARKETPLACE_FILTERS): output-type tabs,
                performance chips and category dropdown. Infra + data kept intact. */}
            {SHOW_MARKETPLACE_FILTERS ? (
              <>
                <div
                  role="group"
                  aria-label="Filter by output type"
                  className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1"
                >
                  {([
                    { key: "all", label: "All" },
                    { key: "image", label: "Image" },
                    { key: "video", label: "Video" },
                  ] as const).map((segment) => (
                    <button
                      key={segment.key}
                      type="button"
                      onClick={() => setOutputTypeFilter(segment.key)}
                      aria-pressed={outputTypeFilter === segment.key}
                      className={cn(
                        "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors motion-reduce:transition-none",
                        outputTypeFilter === segment.key
                          ? "bg-cyan-300 text-slate-950"
                          : "text-slate-300 hover:text-white",
                      )}
                    >
                      {segment.label}
                      <span className="ml-1 opacity-60">{outputTypeCounts[segment.key]}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {filterDefinitions.map((filter) => (
                    <FilterDropdown
                      key={filter.key}
                      filter={filter}
                      value={perfFilters[filter.key] ?? null}
                      onChange={(value) =>
                        setPerfFilters((previous) => ({ ...previous, [filter.key]: value }))
                      }
                    />
                  ))}
                  {activeFilterCount ? (
                    <button
                      type="button"
                      onClick={() => setPerfFilters({ roas: null, aov: null, spend: null, category: null })}
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-white"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canFavorite ? (
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((previous) => !previous)}
                  aria-pressed={favoritesOnly}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
                    favoritesOnly
                      ? "border-rose-300/50 bg-rose-400/15 text-rose-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white",
                  )}
                >
                  <Heart className={cn("h-3.5 w-3.5", favoritesOnly && "fill-current")} />
                  Favorites
                  <span className="opacity-60">{favoriteCount}</span>
                </button>
              ) : null}
              <button

                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-pressed={selectMode}
                className={cn(
                  "ml-auto rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
                  selectMode
                    ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white",
                )}
              >
                {selectMode ? "Done" : "Select"}
              </button>
            </div>


            {!templatesQuery.isFetching && !templates.length ? (
              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
                No active campaigns were returned.
              </div>
            ) : null}

            {/* <lg: exactly 2 columns (the inline builder is injected after the
                selected card's real row) — untouched. lg+: tall 9:16 portrait
                cards, auto-fill so a normal desktop shows 4–5 across and
                ultrawide shows more. */}
            <div
              className={cn("mt-3 grid items-start", isCompactLayout ? "grid-cols-2 gap-2.5" : "gap-3")}
              style={
                isCompactLayout
                  ? undefined
                  : { gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }
              }
            >


              {templateRows.map((row, rowIndex) => (
                <Fragment key={`template-row-${rowIndex}`}>
                  {row.map((template, columnIndex) => {
                const selected = template.id === selectedTemplateId;
                const batchSelected = batchSelection.includes(template.id);
                const isNewDrop = (() => {
                  const created = template.created_at ? new Date(template.created_at).getTime() : NaN;
                  if (Number.isNaN(created)) return false;
                  return Date.now() - created < 21 * 24 * 60 * 60 * 1000;
                })();

                return (
                  <CampaignTile
                    key={template.id}
                    templateId={String(template.id)}
                    displayName={campaignDisplayName(template.name)}
                    fullName={template.name}
                    outputsLabel={formatCampaignOutputs(template.counts)}
                    previewUrl={template.preview_url}
                    isVideo={isVideoPreview(template)}
                    selected={selectMode ? batchSelected : selected}
                    eager={rowIndex === 0 && columnIndex < 2}
                    statusPill={isNewDrop ? "new" : null}
                    freeVideo={template.free_preview_enabled === true}
                    /* <lg unchanged (4:5); lg+ true 9:16 portrait. */
                    mediaAspectClassName="aspect-[4/5] lg:aspect-[9/16]"
                    onSelect={() => {
                      if (selectMode) {
                        toggleBatchSelection(template.id);
                        return;
                      }
                      track("template_view", { template_id: template.id });
                      navigate(templateDetailPath(template));
                    }}
                    onDetails={
                      selectMode
                        ? undefined
                        : () => {
                            track("template_view", { template_id: template.id });
                            navigate(templateDetailPath(template));
                          }
                    }
                    onImpression={() => {
                      track("marketplace_card_impression", { template_id: template.id });
                    }}
                    overlay={
                      <>
                        {canFavorite && !selectMode ? (
                          <FavoriteTemplateButton
                            favorite={isFavorite(String(template.id))}
                            onToggle={() => toggleFavorite(String(template.id))}
                            className="absolute right-1.5 top-1.5"
                          />
                        ) : null}
                        {selectMode ? (
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur",
                              batchSelected
                                ? "border-cyan-300 bg-cyan-300 text-slate-950"
                                : "border-white/25 bg-black/55 text-transparent",
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </>
                    }
                  />
                );

                  })}
                  {/* <lg: the builder expands directly beneath the selected
                      card's ACTUAL visual row (column count is measured).
                      Only the first matching row renders it, so a catalog that
                      lists a campaign twice still opens exactly one builder. */}
                  {inlineBuilderNode && rowIndex === selectedRowIndex ? inlineBuilderNode : null}
                </Fragment>
              ))}
            </div>

            {favoritesOnly && !visibleTemplates.length ? (
              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
                No favorites yet — tap the heart on any campaign to save it here.
              </div>
            ) : null}

            {activeFilterCount && templates.length && !visibleTemplates.length ? (
              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
                No campaigns match these filters yet.
              </div>
            ) : null}
            {hasAnyPerformance ? <PerformanceDisclaimer className="mt-4" /> : null}
          </section>
          ) : null}


          <aside
            className={cn(
              "space-y-6",
              // Below lg the builder lives inline in the grid, so the desktop
              // column is not rendered at all — exactly one active instance.
              hasActiveCampaignWorkspace ? "order-2 xl:order-1" : "hidden lg:block xl:sticky xl:top-24 xl:self-start",
            )}
          >
            {/* Post-run: the setup panel collapses into a compact summary. */}
            {hasActiveCampaignWorkspace && !inputsExpanded ? (
              <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                {jobId ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-white">Campaign inputs</p>
                      <button
                        type="button"
                        onClick={() => setInputsExpanded(true)}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10"
                      >
                        Edit Inputs
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {inputFields.map((field) => {
                        const filled = field.type === "text"
                          ? Boolean(textInputs[field.key]?.trim())
                          : Boolean(files[field.key] || libraryAssets[field.key]);
                        return (
                          <span
                            key={field.key}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] tracking-wide",
                              filled
                                ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                                : "border-white/10 bg-black/20 text-slate-500",
                            )}
                          >
                            {filled ? "✓" : "○"} {field.label}
                          </span>
                        );
                      })}
                      {Object.values(castSelection).some(Boolean) ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[10px] tracking-wide text-emerald-100">
                          ✓ Cast
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-white">Viewing past run</p>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-100">{openedHistoricalRun?.templateName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatRunTimestamp(openedHistoricalRun?.startedAt)} · {openedHistoricalRun?.outputs.length ?? 0} deliverable(s)
                    </p>
                  </>
                )}
              </section>
            ) : null}

            {/* Full builder: always pre-run; post-run only while Edit Inputs is active. */}
            {(!hasActiveCampaignWorkspace || inputsExpanded) ? (
            <>
            <section
              ref={runnerSectionRef}
              className={cn(
                "scroll-mt-24 rounded-[2rem] border bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-[box-shadow,border-color] duration-500 motion-reduce:transition-none",
                builderJustSwitched
                  ? "border-cyan-300/50 shadow-[0_0_0_3px_rgba(34,211,238,0.14),0_24px_80px_rgba(0,0,0,0.35)]"
                  : "border-white/10",
              )}

            >
              {!selectedTemplate ? (
                <div className="flex min-h-[220px] items-center justify-center text-slate-400">Select a template to begin.</div>
              ) : (
                <div className="space-y-5">

                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Campaign Builder</p>
                      <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-white">
                        {selectedTemplate.name}
                      </h2>
                      {selectedTemplate.description ? (
                        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                          {selectedTemplate.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {formatCount(inputFields.length, "input", "inputs")}
                      </span>
                      {outputSplit ? (
                        <button
                          type="button"
                          onClick={() => setOutputSplitOpen((prev) => !prev)}
                          aria-expanded={outputSplitOpen}
                          className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:border-white/25 hover:text-slate-200"
                        >
                          {formatCampaignOutputsLong(selectedTemplate?.counts)}
                          <span aria-hidden className="ml-1">{outputSplitOpen ? "▴" : "▾"}</span>
                          {outputSplitOpen ? <span className="ml-2 normal-case tracking-normal text-slate-300">{outputSplit}</span> : null}
                        </button>
                      ) : (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {formatCampaignOutputsLong(selectedTemplate?.counts)}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {isPrivilegedUser ? <span className="line-through decoration-cyan-200/90 decoration-2">{creditsRequired} cr</span> : `${creditsRequired} cr`}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="Run cost info" className="text-slate-400 transition-colors hover:text-slate-200">
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {marketplaceSurcharge > 0 ? (
                              <span>
                                {baseRunCredits} cr campaign + {marketplaceSurcharge} cr creator marketplace fee
                                = {creditsRequired} cr total.
                              </span>
                            ) : (
                              "Estimated run cost for this template."
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </div>
                  </div>


                  {(
                    <>
                  {/* Compact readiness header — replaces the old requirements panel. */}
                  {inputFields.length ? (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-display text-[12px] font-semibold uppercase tracking-[0.22em] text-white">
                          Add your campaign assets
                        </p>
                        <p
                          className={cn(
                            "font-display text-[11px] font-semibold uppercase tracking-[0.2em]",
                            requiredInputsAreReady ? "text-emerald-200" : "text-cyan-100",
                          )}
                        >
                          {requiredInputsAreReady
                            ? "✓ All assets ready"
                            : `${readyGroupCount} / ${totalGroupCount} ready`}
                        </p>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
                            requiredInputsAreReady ? "bg-emerald-300" : "bg-cyan-300",
                          )}
                          style={{ width: `${groupReadinessPercent}%` }}
                        />
                      </div>
                      {Object.keys(autofilledKeys).length ? (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-400">
                            Pre-filled from{" "}
                            <span className="text-slate-200">{activeBrand?.name}</span> — change or
                            remove any slot as usual.
                          </p>
                          <button
                            type="button"
                            onClick={clearAutofilled}
                            className="font-display text-[10px] uppercase tracking-[0.18em] text-slate-400 transition hover:text-white"
                          >
                            Clear autofilled
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}


                  {/* Cast lives inside the face slot when a face slot exists. */}
                  {castEnabled && !castSlotFieldKey ? (
                    <CastSelector
                      required={castRequired}
                      userId={user?.id ?? null}
                      selection={castSelection}
                      onSelectionChange={setCastSelection}
                    />
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">

                    {inputGroups.map((group) => (
                      <div key={group.id}>{renderInputGroup(group.id)}</div>
                    ))}


                  </div>

                  {/* Sticky generate bar — same validation, same action, same cost. */}
                  <div className="sticky bottom-0 z-20 -mx-6 mt-2 border-t border-white/10 bg-slate-950/95 px-6 py-4 backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "font-display text-[11px] font-semibold uppercase tracking-[0.2em]",
                            requiredInputsAreReady ? "text-emerald-200" : "text-slate-400",
                          )}
                        >
                          {requiredInputsAreReady ? "✓ Ready" : `${readyGroupCount} / ${totalGroupCount} ready`}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">{costDisplay}</p>
                      </div>
                      <Button
                        onClick={() =>
                          freeModeActive
                            ? void handleFreeRun()
                            : entitlementLocked
                              ? openUnlockCheckout()
                              : void handleRun()
                        }
                        disabled={
                          submitting ||
                          isRunning ||
                          ((freeModeActive || !entitlementLocked) && !requiredInputsAreReady)
                        }
                        className="min-w-[200px] rounded-full bg-cyan-300 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
                      >
                        {inlineGenerateLabel}
                      </Button>

                    </div>

                    {!user ? (
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        Configure everything here — your files stay on this device until you generate.
                      </p>
                    ) : profileIsResolving ? (
                      <p className="mt-3 text-sm leading-6 text-cyan-100">
                        Checking your credit balance.
                      </p>
                    ) : freeModeActive ? (
                      <p className="mt-3 text-sm leading-6 text-emerald-100">
                        Your first video is free — no card required.
                      </p>
                    ) : blockedByCredits ? (
                      <p className="mt-3 text-sm leading-6 text-amber-100">
                        Not enough credits — buy credits or{" "}
                        <Link to="/membership?tab=upgrade" className="underline underline-offset-4">
                          upgrade your plan
                        </Link>
                      </p>
                    ) : null}

                    {blockedByCredits && !freeModeActive ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm leading-6 text-rose-100">
                        <span>
                          You need {creditShortfall} more credit{creditShortfall === 1 ? "" : "s"}
                        </span>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="rounded-full border-white/15 bg-white/5 text-xs text-foreground hover:bg-white/10"
                        >
                          <Link to="/membership?tab=credits">Buy Credits</Link>
                        </Button>
                      </div>
                    ) : null}

                  </div>

                    </>
                  )}
                </div>
              )}
            </section>

            {submitting && !hasActiveCampaignWorkspace ? (
              <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <RunProgressBeacon progress={3} status="queued" />
              </div>
            ) : null}
            </>
            ) : null}

            {hasActiveCampaignWorkspace && inputsExpanded ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInputsExpanded(false)}
                  className="rounded-full border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                >
                  Done editing inputs
                </Button>
              </div>
            ) : null}

            {/* Campaign history moved out of the Studio into the quiet
                launcher + CampaignHistoryDrawer + /app/campaigns. */}

          </aside>

          {/* Campaign workspace — rendered for the entire lifecycle once a real run exists. */}
          {hasActiveCampaignWorkspace ? (
          <section
            ref={workspaceSectionRef}
            className="order-1 scroll-mt-24 rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl xl:order-2"
          >
            <button
              type="button"
              onClick={handleBackToTemplates}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to templates
            </button>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  Result{workspaceTemplateName ? ` · ${workspaceTemplateName}` : ""}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Current run {activeRunId ? <span className="font-mono text-slate-100">{activeRunId}</span> : "has not started yet"}.
                </p>
              </div>

            </div>

              {/* Canonical customer Results experience — workflow, video edit,
                  photoshoot — server-truthful for the whole run lifecycle. */}
              {result ? (
                <CampaignResultsStage
                  jobId={activeRunId ?? null}
                  resolveLatest={!activeRunId}
                  templateName={workspaceTemplateName}
                  customizeState={customizeState}
                  onCustomizeWorkflow={() => void handleCustomizeWorkflow()}
                  onLockedCustomize={() => setWorkflowUpgradeDialogOpen(true)}
                  className="mt-6"
                />
              ) : null}

              {result?.status === "complete" ? (
                <div className="mt-6 space-y-5">
                  {freeRunJobId && activeRunId === freeRunJobId ? (
                    <KeepCreatingPanel templateId={selectedTemplate ? String(selectedTemplate.id) : null} />
                  ) : null}

                  <BuildBrandAfterRunCard runId={activeRunId} />

                  {activeRunId ? (
                    <RunFeedbackInline
                      jobId={activeRunId}
                      initialFeedback={currentResultFeedback}
                      onSaved={(feedback) => handleFeedbackSaved(activeRunId, feedback)}
                    />
                  ) : null}
                </div>
              ) : null}

          </section>
          ) : null}
        </div>
      </section>

      <TemplateDetailDialog
        template={detailTemplate}
        open={!!detailTemplate}
        onOpenChange={(next) => {
          if (!next) setDetailTemplateId(null);
        }}
        facts={{
          inputCount: detailTemplate ? getTemplateInputCount(detailTemplate) : 0,
          outputCount: getTemplateOutputCount(detailTemplate),
          aspectRatio: readTemplateAspectRatio(detailTemplate),
          costLabel: isPrivilegedUser
            ? "Bypassed for team access"
            : `${detailTemplate?.estimated_credits_per_run ?? 0} credits`,
        }}
        performance={detailTemplate ? performanceMap[String(detailTemplate.id ?? "")] ?? null : null}
        onUseTemplate={() => {
          if (detailTemplate) handleTemplateSelect(detailTemplate.id);
        }}
      />

      {/* TR7: explicit confirm before any regeneration spend. */}
      <RegenerateOutputDialog
        open={regeneration.dialogOpen}
        onOpenChange={regeneration.setDialogOpen}
        outputNumber={regeneration.outputNumber}
        estimate={regeneration.estimate}
        loadingEstimate={regeneration.loadingEstimate}
        errorMessage={regeneration.errorMessage}
        insufficientCredits={regeneration.insufficientCredits}
        submitting={regeneration.submitting}
        onConfirm={() => void regeneration.confirmRegenerate()}
      />






      {/* P0: locked upsell for Starter / Plus / Free — the graph itself is never hidden. */}
      <Dialog open={workflowUpgradeDialogOpen} onOpenChange={setWorkflowUpgradeDialogOpen}>
        <DialogContent className="border-white/10 bg-[#0c101c] text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-[0.12em]">MAKE THIS WORKFLOW YOURS</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">
              Pro members can create a private version of this campaign and customize its workflow.
              Your changes never affect the original template.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-cyan-200/90 px-4 py-2 text-xs font-semibold tracking-[0.12em] text-[#062a33] transition-opacity hover:opacity-90"
            >
              Upgrade to Pro
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      {selectMode && batchSelection.length ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 backdrop-blur-xl">
          <div className="container flex flex-wrap items-center gap-3 py-4">
            <p className="text-sm font-semibold text-white">
              {batchSelection.length} {batchSelection.length === 1 ? "template" : "templates"} selected
            </p>
            <p className="text-xs text-slate-400">
              {isPrivilegedUser ? "Bypassed for team access" : `${formatCredits(batchCredits)} credits total`}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setBatchSelection([])}
                className="rounded-full text-slate-300 hover:text-white"
              >
                Clear
              </Button>
              <Button
                onClick={() => void requestBatchRun()}
                disabled={batchRunning}
                className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                {batchRunning ? "Queueing..." : "Run selected"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CreditConfirmModal
        open={batchConfirmOpen}
        onOpenChange={setBatchConfirmOpen}
        creditCost={isPrivilegedUser ? 0 : batchCredits}
        currentBalance={isPrivilegedUser ? batchCredits : displayedCreditBalance}
        actionLabel={`Run ${batchTemplates.length} ${batchTemplates.length === 1 ? "campaign" : "campaigns"}`}
        onConfirm={() => void confirmBatchRun()}
      />

      <CampaignHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        campaigns={recentRuns}
        activeRunId={activeRunId}
        isLoading={recentRunsQuery.isLoading}
        isError={recentRunsQuery.isError}
        hasNextPage={recentRunsQuery.hasNextPage}
        isFetchingNextPage={recentRunsQuery.isFetchingNextPage}
        onLoadMore={() => void recentRunsQuery.fetchNextPage()}
        onRetry={() => void refetchRecentRuns()}
        previewUrlForTemplate={previewUrlForTemplate}
        onOpen={handleOpenHistoricalRun}
        onDownload={handleDownloadCampaign}
        onRemix={handleRemixCampaign}
      />
      </div>

      {/* ACQUISITION — payment-first ACCESS modal (guest unlock + generate gate). */}
      {groupModalNode}

      <TemplateUnlockModal
        open={(unlockOpen || authGateOpen) && (!user || freeVideoEligible) && !!selectedTemplate}
        onOpenChange={(next) => {
          setUnlockOpen(next);
          if (!next && authGateOpen) {
            setAuthGateOpen(false);
            track("generate_auth_gate_dismissed", {
              templateId: selectedTemplate ? String(selectedTemplate.id) : null,
              has_inputs: gateHasInputs,
            });
          }
        }}
        templateId={selectedTemplate ? String(selectedTemplate.id) : null}
        displayName={campaignDisplayName(selectedTemplate?.name ?? "")}
        fullName={selectedTemplate?.name ?? ""}
        previewUrl={selectedTemplate?.preview_url ?? null}
        isVideo={selectedTemplate ? isVideoPreview(selectedTemplate) : false}
        outputsLabel={formatCampaignOutputs(selectedTemplate?.counts)}
        assetCount={inputFields.length}
        assetLabels={inputFields.map((field) => field.label).filter(Boolean)}
        creditsRequired={creditsRequired}
        freeVideoOffer={freeVideoEligible}
        returnPath={
          selectedTemplate
            ? `/app/templates?template=${encodeURIComponent(String(selectedTemplate.name))}`
            : "/app/templates"
        }
      />

      <GeneratePaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        templateName={selectedTemplate?.name ?? null}
        creditsRequired={creditsRequired}
        creditBalance={displayedCreditBalance}
      />

    </SiteShell>


  );
}
