import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  GitBranch,
  Loader2,
  
  Network,
  Sparkles,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
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
import CastSelector, { PRIMARY_CAST_SLOT, type CastSelection } from "@/components/templates/CastSelector";
import { CampaignBuildGraph, type PublicGraph } from "@/components/templates/CampaignBuildGraph";
import CampaignOutputsPanel from "@/components/templates/CampaignOutputsPanel";
import CampaignResults from "@/components/templates/CampaignResults";
import RegenerateOutputDialog from "@/components/templates/RegenerateOutputDialog";
import { useOutputRegeneration } from "@/hooks/useOutputRegeneration";

import { evaluateAndAnnounce } from "@/services/achievements";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { ADMIN_VISUAL_BUDGET_TOTAL, getAdminVisualCreditsRemaining, getAdminVisualCreditsSpent, recordAdminVisualCreditUsage } from "@/lib/adminBudget";
import { cn } from "@/lib/utils";
import { canInitiateFork, resolveCustomizeState } from "@/lib/customizeGating";
import { sortTemplatesForStudio } from "@/lib/templateOrdering";
import { fetchTemplateDetail, fetchTemplates, type ApiTemplate, type RunFeedbackRecord, type TemplateDetail } from "@/services/fuseApi";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { libraryKindForAssetType, saveLibraryAsset } from "@/services/libraryAssets";
import { getStaticInputs } from "@/services/templateInputMap";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { trackEvent } from "@/lib/metaPixel";
import { track } from "@/lib/analytics/track";
import GenerateAuthGateModal from "@/components/auth/GenerateAuthGateModal";
import { setPendingGenerationIntent } from "@/lib/pendingGenerationIntent";
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
import CampaignHistoryDrawer from "@/components/campaigns/CampaignHistoryDrawer";
import { useCampaignHistory } from "@/hooks/useCampaignHistory";

/**
 * Temporary marketplace simplification: hides the output-type tabs, performance
 * filter chips and category dropdown from the customer UI. All filtering logic,
 * metadata and performance data stay intact — flip to `true` to reintroduce.
 */
const SHOW_MARKETPLACE_FILTERS = false;

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

  const templates = useMemo(
    () => sortTemplatesForStudio((templatesQuery.data ?? EMPTY_TEMPLATES).filter((template) => template.is_active)),
    [templatesQuery.data],
  );

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
  const [outputTypeFilter, setOutputTypeFilter] = useState<"all" | "image" | "video">("all");

  const outputTypeCounts = useMemo(() => {
    let image = 0;
    let video = 0;
    for (const template of templates) {
      if ((template.output_type ?? "").toLowerCase() === "video") video += 1;
      else image += 1;
    }
    return { all: templates.length, image, video };
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    if (!activeFilterCount && outputTypeFilter === "all") return templates;
    return templates.filter((template) => {
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
  }, [activeFilterCount, outputTypeFilter, perfFilters, performanceMap, templates]);


  // TR10b — deep-link straight into the running workspace for a specific run
  // (used after launching a personal fork from the workflow editor).
  useEffect(() => {
    const requestedRun = searchParams.get("run");
    if (!requestedRun || requestedRun === jobId) return;
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setJobId(requestedRun);
  }, [searchParams, jobId]);

  useEffect(() => {
    const requestedTemplate = searchParams.get("template");
    if (!requestedTemplate || !templates.length) return;
    const normalizedRequest = requestedTemplate.toLowerCase();
    const match = templates.find((template) =>
      template.id.toLowerCase() === normalizedRequest ||
      template.name.toLowerCase() === normalizedRequest ||
      template.versionId?.toLowerCase() === normalizedRequest,
    );
    if (match && match.id !== selectedTemplateId) {
      setSelectedTemplateId(match.id);
    }
  }, [searchParams, selectedTemplateId, templates]);

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

  // Achievements: a completed campaign is a real signal — evaluate once per run.
  const achievementRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (studioMode !== "complete" || !activeRunId) return;
    if (achievementRunRef.current === activeRunId) return;
    achievementRunRef.current = activeRunId;
    track("campaign_complete", { template_id: selectedTemplateId ?? null });
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


  const creditsRequired = selectedTemplate?.estimated_credits_per_run ?? 0;
  const selectedTemplateOutputCount = getTemplateOutputCount(selectedTemplate);
  const creditBalance = profile?.credits_balance ?? null;
  const displayedCreditBalance = creditBalance ?? 0;
  const profileIsResolving = !!user && !isPrivilegedUser && !profile;
  const hasActiveMembership =
    isPrivilegedUser ||
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";
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
  const costDisplay = isPrivilegedUser ? "Bypassed for team access" : `${creditsRequired} credits`;
  const isPublicTemplateBrowser = !user;
  const selectedTemplateCheckoutPath = selectedTemplate ? buildTemplateCheckoutPath(selectedTemplate) : "/pricing";
  const detailTemplate = templates.find((template) => template.id === detailTemplateId) ?? null;
  const creditShortfall = Math.max(0, creditsRequired - displayedCreditBalance);
  const blockedByCredits = !!user && !isPrivilegedUser && !!profile && creditShortfall > 0;
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



  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setFiles({});
    setLibraryAssets({});
    setTextInputs({});
    setJobId(null);
    setOpenedHistoricalRun(null);
    setInputsExpanded(false);
    setResult(null);
    setCastSelection({});
    setAutofilledKeys({});
    autofillAppliedRef.current = "";

    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.requestAnimationFrame(() => {
        runnerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const openGenerateAuthGate = () => {
    if (selectedTemplate) {
      setPendingGenerationIntent({
        templateId: String(selectedTemplate.id),
        versionId: selectedTemplate.versionId ?? null,
        textInputs: { ...textInputs },
        selectedOptions: {},
        cast: Object.fromEntries(
          Object.entries(castSelection).filter(([, value]) => Boolean(value)),
        ) as Record<string, string>,
        pendingFileKeys: Object.entries(files)
          .filter(([, file]) => Boolean(file))
          .map(([key]) => key),
        returnTo: gateReturnTo,
        capturedAt: Date.now(),
      });
    }
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
      if (!hasActiveMembership) {
        toast({
          title: "Membership required",
          description: "Your billing state is not active yet.",
          variant: "destructive",
        });
        return;
      }
      if (displayedCreditBalance < batchCredits) {
        toast({
          title: "Credits not available",
          description: `These ${batchTemplates.length} runs cost ${batchCredits} credits and your balance is ${displayedCreditBalance}.`,
          variant: "destructive",
        });
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

  const handleRun = async () => {
    if (!selectedTemplate) return;
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

        if (!latestHasActiveMembership) {
          toast({
            title: "Membership required",
            description: "Your billing state is not active yet.",
            variant: "destructive",
          });
          return;
        }

        if (latestBalance < creditsRequired) {
          toast({
            title: "Credits not available",
            description: `This run costs ${creditsRequired} credits and your current balance is ${latestBalance}.`,
            variant: "destructive",
          });
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

  const isRunning = result?.status === "queued" || result?.status === "running" || result?.status === "video_pending";

  return (
    <SiteShell>
      <div
        className={cn(
          "transition-[filter,opacity] duration-200",
          authGateOpen ? "pointer-events-none select-none blur-[2px] opacity-70" : "",
        )}
        aria-hidden={authGateOpen}
      >
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
              {isPublicTemplateBrowser ? "Campaign Builder" : "Post-Purchase Studio"}
            </p>
            <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-4xl">
              {isPublicTemplateBrowser
                ? "Build your campaign. No account needed yet."
                : "Your template is ready. Upload your assets."}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              {isPublicTemplateBrowser
                ? "Pick a template, add your assets and set up the run — you only sign in when you generate."
                : "The selected workflow is loaded. Add the required assets, confirm the run cost, and generate campaign videos."}
            </p>
          </div>
          {isPublicTemplateBrowser ? (
            <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.08] px-5 py-4 text-sm leading-6 text-emerald-50">
              Set everything up free. Sign in only to generate.
            </div>
          ) : (
            <CreditRemainingMeter
              label={isPrivilegedUser ? "Team Credits Remaining" : "Credits Remaining"}
              percent={creditsRemainingPercent}
              value={creditsRemainingValue}
              showTopUp={!!user && !!profile && !isPrivilegedUser && hasActiveMembership && displayedCreditBalance <= 0}
            />
          )}
        </div>

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



        {!hasActiveCampaignWorkspace ? (
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
            "mt-8 grid gap-6 motion-safe:transition-[grid-template-columns] motion-safe:duration-300",
            hasActiveCampaignWorkspace
              ? "xl:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]"
              : "xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]",
          )}
        >
          {!hasActiveCampaignWorkspace ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Templates</p>
              {templatesQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-cyan-100" /> : null}
            </div>

            {/* Phase 5 — contextual activation moment above the grid. */}
            {activeBrand ? (
              <div className="mt-2">
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

              <div className="mt-3 rounded-[1rem] border border-cyan-200/20 bg-cyan-300/[0.05] px-3.5 py-3">
                <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  See which campaigns are ready for your brand
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                  Build your brand once and FUSE can preload compatible inputs.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`${ONBOARDING_ROUTE}?step=1`)}
                  className="mt-2 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Build brand
                </button>
              </div>
            )}

            {templatesQuery.isError ? (
              <div className="mt-5 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                Could not load templates.
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
                No active templates were returned.
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTemplates.map((template) => {
                const selected = template.id === selectedTemplateId;
                const batchSelected = batchSelection.includes(template.id);
                const credits = template.estimated_credits_per_run || 0;
                const inputCount = getTemplateInputCount(template);
                const outputCount = getTemplateOutputCount(template);
                const performance = performanceMap[String(template.id ?? "")];



                return (
                  <div
                    key={template.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectMode ? batchSelected : undefined}
                    onClick={() =>
                      selectMode ? toggleBatchSelection(template.id) : handleTemplateSelect(template.id)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (selectMode) toggleBatchSelection(template.id);
                        else handleTemplateSelect(template.id);
                      }
                    }}
                    className={`group cursor-pointer overflow-hidden rounded-[1.5rem] border text-left transition-colors ${
                      selectMode && batchSelected
                        ? "border-cyan-300 bg-cyan-300/10 ring-2 ring-cyan-300/40"
                        : selected && !selectMode
                          ? "border-cyan-300/50 bg-cyan-300/10"
                          : "border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="relative overflow-hidden bg-black/30">
                      <TemplateVibeMedia
                        template={template}
                        className="aspect-[9/16] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                      <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                        Vibe
                      </div>
                      {selectMode ? (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur",
                            batchSelected
                              ? "border-cyan-300 bg-cyan-300 text-slate-950"
                              : "border-white/25 bg-black/55 text-transparent",
                          )}
                        >
                          <Check className="h-4 w-4" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            track("template_view", { template_id: template.id });
                            setDetailTemplateId(template.id);
                          }}
                          className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/85 backdrop-blur transition-colors hover:bg-black/80"
                        >
                          Details
                        </button>
                      )}
                    </div>


                    <div className="space-y-3 p-4">
                      {performance ? <PerformanceBlock row={performance} compact /> : null}
                      {performance ? <PerformanceBadges row={performance} limit={3} /> : null}
                      <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white">{template.name}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {template.category || "Campaign drop template"}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                          {isPrivilegedUser ? <span className="line-through decoration-cyan-200/90 decoration-2">{credits} cr</span> : `${credits} cr`}
                        </div>
                      </div>

                      {template.description ? (
                        <p className="line-clamp-2 text-sm leading-6 text-slate-300">
                          {template.description}
                        </p>
                      ) : (
                        <p className="text-sm leading-6 text-slate-300">
                          Campaign drop template for ready-to-use vertical videos.
                        </p>
                      )}

                      {activeBrand && templateFitMap[String(template.id)] ? (
                        <TemplateFitBadge
                          fit={templateFitMap[String(template.id)]}
                          brandName={activeBrand.name}
                        />
                      ) : null}

                      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        <span>{formatCount(inputCount, "upload", "uploads")}</span>
                        <span>{formatCount(outputCount, "output", "outputs")}</span>
                      </div>

                      <span className={cn(
                        "inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                        selected
                          ? "bg-cyan-300 text-slate-950"
                          : "border border-white/10 bg-white/[0.04] text-white group-hover:bg-white/[0.08]",
                      )}>
                        {selectMode
                          ? batchSelected
                            ? "Selected for batch"
                            : "Tap to select"
                          : selected
                            ? "Selected"
                            : "Use this template"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {activeFilterCount && templates.length && !visibleTemplates.length ? (
              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
                No templates match these performance filters yet.
              </div>
            ) : null}
            {hasAnyPerformance ? <PerformanceDisclaimer className="mt-4" /> : null}
          </section>
          ) : null}


          <aside
            className={cn(
              "space-y-6",
              hasActiveCampaignWorkspace ? "order-2 xl:order-1" : "xl:sticky xl:top-24 xl:self-start",
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
              className="scroll-mt-24 rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
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
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {formatCount(selectedTemplateOutputCount, "output", "outputs")}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {isPrivilegedUser ? <span className="line-through decoration-cyan-200/90 decoration-2">{creditsRequired} cr</span> : `${creditsRequired} cr`}
                      </span>
                    </div>
                  </div>

                  {/* P1: logged-out visitors see the same expectation summary,
                      then the real (local-only) builder below it. */}
                  {isPublicTemplateBrowser ? (
                    <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                        What this template makes
                      </p>
                      <div className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Your inputs</p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {formatCount(inputFields.length, "input", "inputs")}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Expected output</p>
                          <p className="mt-2 text-2xl font-semibold text-white">
                            {formatCount(selectedTemplateOutputCount, "video", "videos")}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Run cost</p>
                          <p className="mt-2 text-2xl font-semibold text-white">{creditsRequired} credits</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Use case</p>
                          <p className="mt-2 text-base font-semibold text-white">Campaign drop template</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

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
                            : `${readyInputCount} / ${totalInputCount} ready`}
                        </p>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
                            requiredInputsAreReady ? "bg-emerald-300" : "bg-cyan-300",
                          )}
                          style={{ width: `${readinessPercent}%` }}
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

                    {inputFields.map((field) => (
                      field.type === "image" ? (
                        <div
                          key={field.key}
                          ref={(node) => {
                            slotRefs.current[field.key] = node;
                          }}
                          className="scroll-mt-28"
                        >
                          <TemplateInputCard
                            label={field.label}
                            displayLabel={
                              castEnabled && field.key === castSlotFieldKey
                                ? "Who's in the campaign?"
                                : undefined
                            }
                            required={field.required}
                            highlighted={focusedInputKey === field.key}
                            file={files[field.key] ?? null}
                            requirement={field.requirement}
                            sourceNote={
                              autofilledKeys[field.key] ? `From ${autofilledKeys[field.key]}` : null
                            }

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
                              releaseAutofill(field.key);
                            }}
                          />
                        </div>
                      ) : (
                        <div key={field.key} className="rounded-[1.25rem] border border-white/10 bg-black/25 p-3">
                          <p className="mb-2 flex items-center gap-2 truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                            <span className="truncate">{field.label}</span>
                            {autofilledKeys[field.key] ? (
                              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-display text-[9px] tracking-[0.18em] text-slate-400">
                                From {autofilledKeys[field.key]}
                              </span>
                            ) : null}
                          </p>

                          {field.type === "prompt" ? (
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
                      )
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
                          {requiredInputsAreReady ? "✓ Ready" : `${readyInputCount} / ${totalInputCount} ready`}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">{costDisplay}</p>
                      </div>
                      <Button
                        onClick={() => void handleRun()}
                        disabled={submitting || isRunning || (!!user && (!requiredInputsAreReady || blockedByCredits))}
                        className="min-w-[200px] rounded-full bg-cyan-300 font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-950 hover:bg-cyan-200"
                      >
                        {checkingCredits
                          ? "Checking credits..."
                          : runPhase === "uploading"
                            ? "Uploading assets..."
                            : runPhase === "preparing"
                              ? "Preparing campaign..."
                              : submitting || isRunning
                                ? "Generating..."
                                : !user
                                  ? "Generate campaign →"
                                  : isPrivilegedUser
                                    ? "Generate campaign"
                                    : `Generate campaign · ${creditsRequired} cr`}

                      </Button>
                    </div>

                    {!user ? (
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        Configure everything here — your files stay on this device until you generate.
                      </p>
                    ) : profileIsResolving ? (
                      <p className="mt-3 text-sm leading-6 text-cyan-100">
                        Checking your membership and credit balance.
                      </p>
                    ) : !hasActiveMembership ? (
                      <p className="mt-3 text-sm leading-6 text-amber-100">
                        Active membership required before generating campaigns.
                        {" "}
                        <Link to="/pricing" className="underline underline-offset-4">
                          Open membership
                        </Link>
                      </p>
                    ) : null}

                    {blockedByCredits ? (
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
              {result?.status ? (
                <div className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                  result.status === "failed"
                    ? "bg-rose-400/10 text-rose-100"
                    : result.status === "complete"
                      ? "bg-emerald-400/10 text-emerald-100"
                      : "bg-cyan-300/10 text-cyan-100"
                }`}>
                  {result.status.replace("_", " ")}
                </div>
              ) : null}
            </div>

              {/* P0: the workflow graph stays attached for the ENTIRE run lifecycle —
                  queued → running → video_pending → complete / failed. */}
              {result && result.publicGraph && result.publicGraph.nodes.length > 0 ? (
                <div className="mt-6 space-y-4">
                  <CampaignBuildGraph
                    graph={result.publicGraph}
                    runStatus={result.status}
                    statusMessage={result.statusMessage}
                    progress={result.progress}
                    customizeState={customizeState}
                    onCustomizeWorkflow={() => void handleCustomizeWorkflow()}
                    onLockedCustomize={() => setWorkflowUpgradeDialogOpen(true)}
                  />
                  {ACTIVE_RUN_STATUSES.has(result.status) ? (
                    <CampaignOutputsPanel graph={result.publicGraph} outputs={result.outputs} />
                  ) : null}
                </div>
              ) : null}

              {result && !result.publicGraph?.nodes.length && ACTIVE_RUN_STATUSES.has(result.status) ? (
                <div className="mt-6 space-y-4">
                  <RunProgressBeacon progress={result.progress} status={result.status} />
                  <CampaignOutputsPanel graph={result.publicGraph} outputs={result.outputs} />
                </div>
              ) : null}

              {result?.status === "failed" && !result.publicGraph?.nodes.length ? (
                <div className="mt-6 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-5">
                  <p className="text-sm font-semibold text-rose-100">
                    {readPublicFailure(result.publicFailure).title}
                  </p>
                  <p className="mt-1 text-sm text-rose-50/90">
                    {readPublicFailure(result.publicFailure).message}
                  </p>
                </div>
              ) : null}

              {result?.status === "complete" ? (
                <div className="mt-6 space-y-5">
                  <CampaignResults
                    outputs={result.outputs}
                    onDownload={handleDownloadSingleOutput}
                    onRegenerate={(outputNumber) => void regeneration.requestRegenerate(outputNumber)}
                    revisionsByOutput={regeneration.revisionsByOutput}
                  />

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

      {/* P2 — logged-out Generate click: blur the builder, gate on auth. */}
      <GenerateAuthGateModal
        open={authGateOpen}
        templateId={selectedTemplate ? String(selectedTemplate.id) : null}
        returnTo={gateReturnTo}
        onClose={() => {
          setAuthGateOpen(false);
          track("generate_auth_gate_dismissed", {
            templateId: selectedTemplate ? String(selectedTemplate.id) : null,
            has_inputs: gateHasInputs,
          });
        }}
      />
    </SiteShell>


  );
}
