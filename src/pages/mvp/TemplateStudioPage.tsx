import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Film,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Network,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import RunFeedbackCard from "@/components/mvp/RunFeedbackCard";
import CreditPackDialog from "@/components/mvp/CreditPackDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { ADMIN_VISUAL_BUDGET_TOTAL, getAdminVisualCreditsRemaining, getAdminVisualCreditsSpent, recordAdminVisualCreditUsage } from "@/lib/adminBudget";
import { cn } from "@/lib/utils";
import { sortTemplatesForStudio } from "@/lib/templateOrdering";
import { fetchTemplateDetail, fetchTemplates, type ApiTemplate, type RunFeedbackRecord, type TemplateDetail } from "@/services/fuseApi";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { getStaticInputs } from "@/services/templateInputMap";
import { trackEvent } from "@/lib/metaPixel";

type RunnerStatus = "queued" | "running" | "video_pending" | "complete" | "failed";

interface InputField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
}

interface RunnerOutput {
  type: string;
  url: string;
  label?: string;
  key?: string;
}

interface RunnerResult {
  status: RunnerStatus;
  progress: number;
  outputs: RunnerOutput[];
  error?: string;
}

interface RecentRun {
  id: string;
  status: RunnerStatus;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  error: string | null;
  templateName: string;
  outputs: RunnerOutput[];
  feedback: RunFeedbackRecord | null;
}

type RecentRunsPage = {
  jobs: RecentRun[];
  hasMore: boolean;
  nextOffset: number | null;
};

const EMPTY_TEMPLATES: ApiTemplate[] = [];
const EMPTY_RECENT_RUNS: RecentRun[] = [];

const TEMPLATE_CACHE_KEY = "fuse.templateStudio.templates.v4";
const TEMPLATE_DETAIL_CACHE_KEY = "fuse.templateStudio.templateDetails.v4";
const TEMPLATE_SELECTION_KEY = "fuse.templateStudio.selectedTemplateId";
const ACTIVE_RUN_STATUSES = new Set<RunnerStatus>(["queued", "running", "video_pending"]);
const RUN_CATALOG_PAGE_SIZE = 8;
const RECENT_RUNS_REFRESH_COOLDOWN_SECONDS = 10;

function formatPublicOutputLabel(index: number) {
  return `Output ${index + 1}`;
}

function getOutputDownloadName(templateName: string, index: number, output: RunnerOutput) {
  const safeTemplateName = templateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "fuse-run";
  const extension = output.type === "video" ? "mp4" : "jpg";
  return `${safeTemplateName}-output-${index + 1}.${extension}`;
}

const UPLOAD_PLACEHOLDER_ASSETS: Record<string, string> = {
  accessory: "/template-placeholders/accessory.png?v=20260520",
  car: "/template-placeholders/car.png?v=20260520",
  chain: "/template-placeholders/chain.png?v=20260520",
  face: "/template-placeholders/face.png?v=20260520",
  grillz: "/template-placeholders/grillz.png?v=20260520",
  logo: "/template-placeholders/logo.png?v=20260520",
  model: "/template-placeholders/model.png?v=20260520",
  pants: "/template-placeholders/pants.png?v=20260520",
  shirt: "/template-placeholders/shirt.png?v=20260520",
  shoe: "/template-placeholders/accessory.png?v=20260520",
};

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
  };
}

async function fetchRecentRuns(limit: number, offset: number): Promise<RecentRunsPage> {
  const token = await getAccessToken();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/list-recent-runs?limit=${limit}&offset=${offset}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load recent runs.");
  }

  return {
    jobs: Array.isArray(data?.jobs) ? (data.jobs as RecentRun[]) : [],
    hasMore: Boolean(data?.hasMore),
    nextOffset: typeof data?.nextOffset === "number" ? data.nextOffset : null,
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
    throw new Error(data?.error ?? `Could not start the template run (${response.status}).`);
  }

  return data as { jobId?: string; error?: string };
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

function getUploadIllustrationKind(label: string) {
  const normalized = label.toLowerCase();
  if (/(face|headshot|portrait|artist)/.test(normalized)) return "face";
  if (/(grill|grillz|teeth|tooth|dental)/.test(normalized)) return "grillz";
  if (/(chain|necklace|pendant)/.test(normalized)) return "chain";
  if (/(car|vehicle|auto|automotive)/.test(normalized)) return "car";
  if (/(logo|brand|mark)/.test(normalized)) return "logo";
  if (/(bottom|pant|trouser|short|jean)/.test(normalized)) return "pants";
  if (/(hat|cap|head|accessory|accessories|watch|bag|jewel)/.test(normalized)) return "accessory";
  if (/(shoe|sneaker|boot|footwear)/.test(normalized)) return "shoe";
  if (/(model|person|human|reference)/.test(normalized)) return "model";
  return "shirt";
}

function UploadPlaceholderIllustration({
  file,
  label,
}: {
  file: File | null;
  label: string;
}) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={`${label} preview`}
        className="h-full w-full object-cover"
      />
    );
  }

  const kind = getUploadIllustrationKind(label);
  const assetUrl = UPLOAD_PLACEHOLDER_ASSETS[kind] ?? UPLOAD_PLACEHOLDER_ASSETS.shirt;

  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.6),rgba(2,6,23,0.92))]">
      <img
        src={assetUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-contain opacity-80 saturate-125 transition duration-300 group-hover/upload:scale-[1.02] group-hover/upload:opacity-95"
        loading="lazy"
      />
    </div>
  );
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
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<RunnerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingCredits, setCheckingCredits] = useState(false);
  const [adminVisualSpent, setAdminVisualSpent] = useState(() => getAdminVisualCreditsSpent());
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const [feedbackOverrides, setFeedbackOverrides] = useState<Record<string, RunFeedbackRecord | null>>({});
  const [recentRefreshCooldown, setRecentRefreshCooldown] = useState(0);
  const runnerSectionRef = useRef<HTMLElement | null>(null);
  const isPrivilegedUser = hasAppAccess;

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

  useEffect(() => {
    if (!selectedTemplate) return;
    trackEvent("ViewContent", { content_name: selectedTemplate.name, content_type: "product" });
  }, [selectedTemplate?.id]);
  const selectedTemplateDetailCacheId = selectedTemplate
    ? getTemplateDetailCacheId(selectedTemplate)
    : null;

  const templateDetailQuery = useQuery<TemplateDetail | null>({
    queryKey: ["mvp-template-detail", selectedTemplateDetailCacheId],
    enabled: !!selectedTemplate && !!user,
    placeholderData: selectedTemplateDetailCacheId
      ? loadCachedTemplateDetail(selectedTemplateDetailCacheId)
      : null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!selectedTemplate || !selectedTemplateDetailCacheId) return null;
      const token = await getAccessToken();
      const detail = await fetchTemplateDetail(token, selectedTemplate);
      storeCachedTemplateDetail(selectedTemplateDetailCacheId, detail);
      return detail;
    },
  });

  const recentRunsQuery = useInfiniteQuery<RecentRunsPage>({
    queryKey: ["mvp-run-catalog"],
    queryFn: ({ pageParam }) => fetchRecentRuns(RUN_CATALOG_PAGE_SIZE, Number(pageParam ?? 0)),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: !!user,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const runs = query.state.data?.pages.flatMap((page) => page.jobs) ?? [];
      return jobId || runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status)) ? 5_000 : false;
    },
  });

  const recentRuns = useMemo(
    () => recentRunsQuery.data?.pages.flatMap((page) => page.jobs) ?? EMPTY_RECENT_RUNS,
    [recentRunsQuery.data],
  );
  const refetchRecentRuns = recentRunsQuery.refetch;
  const hasExpandedRecentRun = recentRuns.some((run) => expandedRuns[run.id]);
  const canLoadMoreRuns = !!recentRunsQuery.hasNextPage;
  const currentResultFeedback = jobId
    ? feedbackOverrides[jobId]
      ?? recentRuns.find((run) => run.id === jobId)?.feedback
      ?? null
    : null;

  const resolveFeedback = (runId: string, fallback: RunFeedbackRecord | null) =>
    feedbackOverrides[runId] ?? fallback ?? null;

  const handleFeedbackSaved = (runId: string, feedback: RunFeedbackRecord) => {
    setFeedbackOverrides((current) => ({
      ...current,
      [runId]: feedback,
    }));
  };

  const handleRefreshRecentRuns = () => {
    if (!user || recentRunsQuery.isFetching || recentRefreshCooldown > 0) return;
    setRecentRefreshCooldown(RECENT_RUNS_REFRESH_COOLDOWN_SECONDS);
    void refetchRecentRuns();
  };

  const handleLoadMoreRuns = () => {
    void recentRunsQuery.fetchNextPage();
  };

  const handleDownloadRunOutputs = (run: RecentRun) => {
    if (!run.outputs.length) return;

    run.outputs.forEach((output, index) => {
      const link = document.createElement("a");
      link.href = output.url;
      link.download = getOutputDownloadName(run.templateName, index, output);
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  };

  useEffect(() => {
    if (recentRefreshCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setRecentRefreshCooldown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [recentRefreshCooldown]);

  useEffect(() => {
    if (!recentRuns.length) {
      setExpandedRuns((current) => (Object.keys(current).length ? {} : current));
      return;
    }

    setExpandedRuns((current) => {
      const next: Record<string, boolean> = {};
      for (const run of recentRuns) {
        if (run.id in current) {
          next[run.id] = current[run.id];
          continue;
        }
        next[run.id] = !isPrivilegedUser && recentRuns[0]?.id === run.id;
      }
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }
      return next;
    });
  }, [isPrivilegedUser, recentRuns]);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const status = await fetchJobStatus(jobId);
        if (cancelled) return;

        setResult({
          status: status.status,
          progress: status.progress ?? 0,
          outputs: Array.isArray(status.outputs) ? status.outputs : [],
          error: status.error ?? undefined,
        });

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
  }, [jobId, refetchRecentRuns]);

  const inputFields: InputField[] = (() => {
    if (templateDetailQuery.data?.user_inputs?.length) {
      return templateDetailQuery.data.user_inputs.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type || "image",
        required: field.required ?? true,
        hint: field.hint,
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
    .every((field) => (field.type === "image" ? !!files[field.key] : !!textInputs[field.key]?.trim()));

  const creditsRequired = selectedTemplate?.estimated_credits_per_run ?? 0;
  const selectedTemplateOutputCount = getTemplateOutputCount(selectedTemplate);
  const creditBalance = profile?.credits_balance ?? null;
  const displayedCreditBalance = creditBalance ?? 0;
  const profileIsResolving = !!user && !isPrivilegedUser && !profile;
  const canAfford = isPrivilegedUser || (!!profile && displayedCreditBalance >= creditsRequired);
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

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setFiles({});
    setTextInputs({});
    setJobId(null);
    setResult(null);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.requestAnimationFrame(() => {
        runnerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleRun = async () => {
    if (!selectedTemplate) return;
    if (!user) {
      navigate("/auth?mode=signup", { state: { redirectTo: "/app/templates" } });
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

      const uploadedImageInputs = Object.fromEntries(
        await Promise.all(
          inputFields
            .filter((field) => field.type === "image" && files[field.key])
            .map(async (field) => {
              const file = files[field.key]!;
              const url = await uploadRunInputFile(file);
              return [field.key, url];
            }),
        ),
      );

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
      setSubmitting(false);
    }
  };

  const isRunning = result?.status === "queued" || result?.status === "running" || result?.status === "video_pending";

  return (
    <SiteShell>
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
              {isPublicTemplateBrowser ? "Template Page" : "Post-Purchase Studio"}
            </p>
            <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-4xl">
              {isPublicTemplateBrowser
                ? "Choose a campaign template."
                : "Your template is ready. Upload your assets."}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              {isPublicTemplateBrowser
                ? "Each template turns your brand assets into ready-to-use vertical videos. Browse before checkout."
                : "The selected workflow is loaded. Add the required assets, confirm the run cost, and generate campaign videos."}
            </p>
          </div>
          {isPublicTemplateBrowser ? (
            <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.08] px-5 py-4 text-sm leading-6 text-emerald-50">
              Browse first. Unlock only after you choose a template.
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
          className={cn(
            "mt-8 grid gap-6 transition-[grid-template-columns] duration-300",
            hasExpandedRecentRun
              ? "xl:grid-cols-[minmax(260px,0.58fr)_minmax(0,1.42fr)] 2xl:grid-cols-[minmax(300px,0.56fr)_minmax(0,1.44fr)]"
              : "xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]",
          )}
        >
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Templates</p>
              {templatesQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-cyan-100" /> : null}
            </div>

            {templatesQuery.isError ? (
              <div className="mt-5 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                Could not load templates.
              </div>
            ) : null}

            {!templatesQuery.isFetching && !templates.length ? (
              <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
                No active templates were returned.
              </div>
            ) : null}

            <div className={cn("mt-5 grid gap-4 sm:grid-cols-2", hasExpandedRecentRun ? "2xl:grid-cols-2" : "lg:grid-cols-3")}>
              {templates.map((template) => {
                const selected = template.id === selectedTemplateId;
                const credits = template.estimated_credits_per_run || 0;
                const inputCount = getTemplateInputCount(template);
                const outputCount = getTemplateOutputCount(template);

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template.id)}
                    className={`group overflow-hidden rounded-[1.5rem] border text-left transition-colors ${
                      selected
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
                    </div>

                    <div className="space-y-3 p-4">
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
                        {selected ? "Selected" : "Use this template"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <section
              ref={runnerSectionRef}
              className="scroll-mt-24 rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
            >
              {!selectedTemplate ? (
                <div className="flex min-h-[220px] items-center justify-center text-slate-400">Select a template to begin.</div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Selected Template</p>
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

                  {isPublicTemplateBrowser ? (
                    <div className="space-y-5">
                      <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-300/[0.07] p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                          Confirm before checkout
                        </p>
                        <div className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Required uploads</p>
                            <p className="mt-2 text-2xl font-semibold text-white">
                              {formatCount(inputFields.length, "upload", "uploads")}
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

                      <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Upload slots</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {inputFields.map((field) => (
                            <span key={field.key} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200">
                              {field.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <Button asChild className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                        <Link to={selectedTemplateCheckoutPath}>
                          Use this template
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {inputFields.map((field) => (
                      <div key={field.key} className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                        {field.type === "image" ? (
                          <label className="group/upload flex aspect-[9/16] cursor-pointer flex-col overflow-hidden rounded-[1.25rem] border border-dashed border-white/14 bg-white/[0.03] transition hover:border-cyan-200/45 hover:bg-cyan-300/[0.06]">
                            <div className="min-h-0 flex-1 overflow-hidden">
                              <UploadPlaceholderIllustration file={files[field.key] ?? null} label={field.label} />
                            </div>
                            <div className="border-t border-white/10 bg-black/30 p-3">
                              <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">{field.label}</span>
                              <span className="mt-2 flex min-w-0 items-center gap-2 text-sm font-medium text-white">
                                <Upload className="h-4 w-4 shrink-0 text-cyan-100" />
                                <span className="truncate">
                                  {files[field.key] ? files[field.key]?.name : "Upload image"}
                                </span>
                              </span>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(event) =>
                                setFiles((current) => ({
                                  ...current,
                                  [field.key]: event.target.files?.[0] ?? null,
                                }))
                              }
                            />
                          </label>
                        ) : field.type === "prompt" ? (
                          <Textarea
                            value={textInputs[field.key] ?? ""}
                            onChange={(event) =>
                              setTextInputs((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                            rows={5}
                            placeholder={field.label}
                            className="min-h-[180px] rounded-[1.25rem] border-white/10 bg-white/[0.03] text-white"
                          />
                        ) : (
                          <Input
                            value={textInputs[field.key] ?? ""}
                            onChange={(event) =>
                              setTextInputs((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                            placeholder={field.label}
                            className="h-14 rounded-[1.25rem] border-white/10 bg-white/[0.03] text-white"
                          />
                        )}

                        {files[field.key] ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((current) => ({
                                ...current,
                                [field.key]: null,
                              }))
                            }
                            className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500 hover:text-white"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Run cost</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{costDisplay}</p>
                        {isPrivilegedUser ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Visual team spend {adminVisualSpent}. Runs stay unblocked.
                          </p>
                        ) : null}
                      </div>
                      <Button
                        onClick={() => void handleRun()}
                        disabled={submitting || isRunning || (!!user && !requiredInputsAreReady)}
                        className="min-w-[180px] rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                      >
                        {checkingCredits ? "Checking credits..." : submitting || isRunning ? "Running..." : user ? "Run template" : "Sign in to run"}
                      </Button>
                    </div>

                    {!user ? (
                      <p className="mt-3 text-sm leading-6 text-cyan-100">
                        Sign in or create an account before running templates or buying credits.
                        {" "}
                        <Link to="/auth?mode=signup" className="underline underline-offset-4">
                          Create account
                        </Link>
                      </p>
                    ) : profileIsResolving ? (
                      <p className="mt-3 text-sm leading-6 text-cyan-100">
                        Checking your membership and credit balance.
                      </p>
                    ) : !hasActiveMembership ? (
                      <p className="mt-3 text-sm leading-6 text-amber-100">
                        Active membership required before running templates.
                        {" "}
                        <Link to="/pricing" className="underline underline-offset-4">
                          Open membership
                        </Link>
                      </p>
                    ) : null}

                    {!isPrivilegedUser && hasActiveMembership && !canAfford ? (
                      <p className="mt-3 text-sm leading-6 text-rose-100">
                        This run costs {creditsRequired} credits and your balance is {displayedCreditBalance}.
                      </p>
                    ) : null}
                  </div>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Result</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Current run {jobId ? <span className="font-mono text-slate-100">{jobId}</span> : "has not started yet"}.
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

              {!result && !submitting ? (
                <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 text-slate-400">
                  Output will appear here after you run a template.
                </div>
              ) : null}

              {submitting && !result ? (
                <div className="mt-6">
                  <RunProgressBeacon progress={3} status="queued" />
                </div>
              ) : null}

              {result && ACTIVE_RUN_STATUSES.has(result.status) ? (
                <div className="mt-6">
                  <RunProgressBeacon progress={result.progress} status={result.status} />
                </div>
              ) : null}

              {result?.status === "failed" ? (
                <div className="mt-6 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-100" />
                    <p className="text-sm text-rose-50">{result.error || "The run failed."}</p>
                  </div>
                </div>
              ) : null}

              {result?.status === "complete" ? (
                <div className="mt-6 space-y-5">
                  <div className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-100" />
                    <p className="text-sm text-emerald-50">The template completed successfully.</p>
                  </div>

                  {jobId ? (
                    <RunFeedbackCard
                      jobId={jobId}
                      initialFeedback={currentResultFeedback}
                      onSaved={(feedback) => handleFeedbackSaved(jobId, feedback)}
                    />
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    {result.outputs.map((output, index) => (
                      <article key={`${output.url}-${index}`} className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-black/20">
                        {output.type === "video" ? (
                          <video src={output.url} controls className="aspect-[9/16] w-full bg-black object-cover" />
                        ) : (
                          <img src={output.url} alt={formatPublicOutputLabel(index)} className="aspect-[9/16] w-full object-cover" />
                        )}
                        <div className="flex items-center justify-between gap-3 p-4">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            {output.type === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                            <span>{formatPublicOutputLabel(index)}</span>
                          </div>
                          <a
                            href={output.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-300 hover:bg-white/[0.06]"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 border-t border-white/8 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Recent runs</p>
                  <p className="mt-2 text-sm text-slate-300">
                    {isPrivilegedUser
                      ? "Run memory bank for this account. Expand a run to inspect every deliverable."
                      : user
                        ? "Run memory bank for this account. Load more to reach older generations."
                        : "Sign in to save and review your completed runs."}
                  </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshRecentRuns}
                    disabled={!user || recentRunsQuery.isFetching || recentRefreshCooldown > 0}
                    className="rounded-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"
                  >
                    {recentRunsQuery.isFetching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {recentRefreshCooldown > 0 ? `Refresh in ${recentRefreshCooldown}s` : "Refresh"}
                  </Button>
                </div>

                {recentRunsQuery.isError ? (
                  <div className="mt-4 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                    Could not load recent runs.
                  </div>
                ) : null}

                {!recentRunsQuery.isError && !recentRuns.length ? (
                  <div className="mt-4 rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                    No saved runs yet for this account.
                  </div>
                ) : null}

                <div className="mt-4 space-y-4">
                  {recentRuns.map((run) => {
                    const isExpanded = !!expandedRuns[run.id];

                    return (
                    <Collapsible
                        key={run.id}
                        open={isExpanded}
                        onOpenChange={(open) =>
                          setExpandedRuns((current) => ({
                            ...current,
                            [run.id]: open,
                          }))
                        }
                      >
                        <div
                          className={cn(
                            "overflow-hidden rounded-[1.5rem] border bg-black/20 transition-colors",
                            isExpanded ? "border-cyan-300/35 bg-cyan-300/[0.04]" : "border-white/8",
                          )}
                        >
                        <CollapsibleTrigger asChild>
                          <button type="button" className="flex w-full items-start justify-between gap-3 p-4 text-left">
                            <div className="min-w-0">
                              <p className={cn("truncate font-semibold text-white", isExpanded ? "text-base" : "text-sm")}>{run.templateName}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatRunTimestamp(run.startedAt)} · {formatRunDuration(run.startedAt, run.completedAt)}
                              </p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                                {run.outputs.length} deliverable{run.outputs.length === 1 ? "" : "s"}
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className={`text-[10px] uppercase tracking-[0.2em] ${
                                  run.status === "failed"
                                    ? "text-rose-200"
                                    : run.status === "complete"
                                      ? "text-emerald-200"
                                      : "text-cyan-100"
                                }`}>
                                  {run.status.replace("_", " ")}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">{run.progress}%</p>
                              </div>
                              {expandedRuns[run.id] ? (
                                <ChevronDown className="mt-0.5 h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 text-slate-400" />
                              )}
                            </div>
                          </button>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="border-t border-white/8 px-4 pb-5 pt-4">
                          {run.outputs.length ? (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                              {run.outputs.map((output, index) => (
                                <a
                                  key={`${run.id}-${output.url}-${index}`}
                                  href={output.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group overflow-hidden rounded-[1.25rem] border border-white/8 bg-black/30 transition-colors hover:border-cyan-200/35"
                                >
                                  <div className="relative aspect-[9/16] overflow-hidden">
                                    {output.type === "video" ? (
                                      <video src={output.url} className="h-full w-full bg-black object-cover transition-transform duration-500 group-hover:scale-[1.03]" muted playsInline />
                                    ) : (
                                      <img src={output.url} alt={formatPublicOutputLabel(index)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                                    )}
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
                                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                                        {output.type === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                                        {formatPublicOutputLabel(index)}
                                      </div>
                                    </div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400">No deliverables attached yet.</p>
                          )}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {run.outputs[0] ? (
                              <a
                                href={run.outputs[0].url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-300 hover:bg-white/[0.06]"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View first
                              </a>
                            ) : null}
                            {run.outputs.length ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadRunOutputs(run)}
                                className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-cyan-100 hover:bg-cyan-300/15"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download all
                              </button>
                            ) : null}
                          </div>

                          {!ACTIVE_RUN_STATUSES.has(run.status) ? (
                            <RunFeedbackCard
                              jobId={run.id}
                              compact
                              initialFeedback={resolveFeedback(run.id, run.feedback)}
                              onSaved={(feedback) => handleFeedbackSaved(run.id, feedback)}
                              className="mt-4"
                            />
                          ) : null}

                          {run.error ? <p className="mt-3 text-sm text-rose-200">{run.error}</p> : null}
                        </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>

                {canLoadMoreRuns ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleLoadMoreRuns}
                      disabled={recentRunsQuery.isFetchingNextPage}
                      className="rounded-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]"
                    >
                      {recentRunsQuery.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Load more runs
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </SiteShell>
  );
}
