import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, EyeOff, Film, Loader2, LockKeyhole, RefreshCw, Upload } from "lucide-react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Phase = "idle" | "running" | "complete" | "error";
type RunnerMode = "single" | "bulk";

type TemplateInput = {
  id: string;
  name: string;
  expected: string;
  defaultAssetUrl: string | null;
};

type TemplateOption = {
  templateId: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  reviewStatus: string;
  counts: {
    inputs: number;
    imageOutputs: number;
    videoOutputs: number;
  };
  inputs: TemplateInput[];
};

type TemplateDetailNode = {
  id: string;
  rawName: string;
  name: string;
  nodeType: string;
  prompt: string | null;
  expected: string | null;
  defaultAssetUrl: string | null;
  defaultAssetType: string | null;
  incoming: Array<{
    sourceNodeId: string;
    sourceName: string;
    sourceType: string;
    targetParam: string | null;
  }>;
  summary: string;
  editor?: {
    mode: "upload" | "reference" | "workflow";
    slotKey: string | null;
    label: string | null;
    expected: string | null;
    isUserFacingInput: boolean;
    isReferenceInput: boolean;
    sampleUrl: string | null;
  };
};

type TemplateDetail = {
  templateId: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  reviewStatus: string;
  isActive: boolean;
  nodes: TemplateDetailNode[];
};

type JobStep = {
  id: string;
  label: string;
  type: string;
  status: string;
  prompt: string | null;
  inputPayload: Record<string, string>;
  sourceInputs: Array<{
    sourceNodeId: string;
    sourceName: string;
    sourceType: string;
    targetParam: string | null;
    sourceUrl: string | null;
    isHiddenReference: boolean;
  }>;
  outputUrl: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  executionTimeMs: number | null;
  telemetry: {
    estimatedCostUsd?: number | null;
    billingUnit?: string | null;
    billingQuantity?: number | null;
    unitPriceUsd?: number | null;
    currency?: string | null;
    falDurationSeconds?: number | null;
  } | null;
};

type JobStatus = {
  status: string;
  progress: number;
  error: string | null;
  template?: {
    templateId: string;
    templateName: string;
    versionId: string;
    versionNumber: number | null;
    reviewStatus: string;
    inputs: Array<{
      id: string;
      name: string;
      expected: string;
      nodeIds: string[];
    }>;
    hiddenRefs: Array<{
      nodeId: string;
      name: string;
      mode: string | null;
      assetUrl: string | null;
    }>;
  };
  outputs: Array<{ label: string; type: "image" | "video"; url: string }>;
  steps: JobStep[];
};

type RecentRun = {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  error: string | null;
  templateName: string;
  templateId: string | null;
  versionNumber: number | null;
  reviewStatus: string;
  outputs: Array<{ label: string; type: "image" | "video"; url: string }>;
};

type EditorDraft = {
  displayLabel: string;
  prompt: string;
  expected: string;
  editorMode: "upload" | "reference" | "workflow";
  slotKey: string;
};

type SharedInputKey =
  | "logo"
  | "garment"
  | "top-garment"
  | "bottom-garment"
  | "accessory"
  | "garments-front"
  | "garments-back";

type SharedInputSlot = {
  key: SharedInputKey;
  label: string;
  description: string;
};

type BulkRunState = "idle" | "starting" | "queued" | "running" | "complete" | "failed" | "skipped";

type BulkRunRow = {
  templateId: string;
  templateName: string;
  versionId: string;
  reviewStatus: string;
  requiredInputs: string[];
  expectedImageOutputs: number;
  expectedVideoOutputs: number;
  status: BulkRunState;
  jobId: string | null;
  actualImageOutputs: number;
  actualVideoOutputs: number;
  progress: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  usedSharedSlots: string[];
};

const ACCESS_CODE_STORAGE_KEY = "fuse-lab-access-code";
const MAX_DIMENSION = 2048;
const BULK_SHARED_INPUTS: SharedInputSlot[] = [
  { key: "logo", label: "Logo", description: "Brand mark or placement asset." },
  { key: "garment", label: "Garment", description: "Single garment fallback when a template only needs one product image." },
  { key: "top-garment", label: "Top Garment", description: "Upper-body product shot." },
  { key: "bottom-garment", label: "Bottom Garment", description: "Lower-body product shot." },
  { key: "accessory", label: "Accessory", description: "Hat, bag, sunglasses, or other add-on product." },
  { key: "garments-front", label: "Garments Front", description: "Front set shot for mirror/UGC templates." },
  { key: "garments-back", label: "Garments Back", description: "Back set shot for mirror/UGC templates." },
];
const REVIEW_STATUSES = [
  "Unreviewed",
  "Structurally Correct",
  "Prompt Drift",
  "Blocked by Provider",
  "Approved",
] as const;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "Pending";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatUsd(value: number | null | undefined) {
  if (value == null) return "Pending";
  return `$${value.toFixed(4)}`;
}

function formatTimestamp(value: string | null | undefined) {
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
  return formatDuration(durationMs);
}

function getNodeEditorDefaults(node: TemplateDetailNode) {
  return {
    displayLabel: node.editor?.label ?? node.name,
    prompt: node.prompt ?? "",
    expected: node.editor?.expected ?? node.expected ?? "",
    editorMode: node.editor?.mode ?? (node.nodeType === "user_input" ? "upload" : "workflow"),
    slotKey: node.editor?.slotKey ?? "",
  } satisfies EditorDraft;
}

function normalizeTemplateKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeInputLabel(value: string | null | undefined) {
  return normalizeTemplateKey(value);
}

function getSharedInputCandidates(label: string): SharedInputKey[] {
  const normalized = normalizeInputLabel(label);

  if (normalized === "logo") return ["logo"];
  if (normalized === "garment") return ["garment", "top-garment", "bottom-garment"];
  if (normalized === "top-garment") return ["top-garment", "garment"];
  if (normalized === "bottom-garment") return ["bottom-garment", "garment"];
  if (normalized === "accessory") return ["accessory"];
  if (normalized === "garment-1") return ["garment", "top-garment", "bottom-garment"];
  if (normalized === "garment-2") return ["bottom-garment", "top-garment", "garment"];
  if (normalized === "garments-front") return ["garments-front", "garment", "top-garment"];
  if (normalized === "garments-back") return ["garments-back", "garment", "bottom-garment"];

  return ["garment"];
}

function buildBulkInputFilesForTemplate(
  template: TemplateOption,
  sharedFiles: Record<string, File | null>,
) {
  const missing: string[] = [];
  const usedSlots = new Set<string>();
  const resolved: Array<{ inputName: string; file: File }> = [];

  for (const input of template.inputs) {
    const candidates = getSharedInputCandidates(input.name);
    const matchedKey = candidates.find((candidate) => sharedFiles[candidate]);
    const file = matchedKey ? sharedFiles[matchedKey] : null;

    if (!file) {
      missing.push(input.name);
      continue;
    }

    usedSlots.add(matchedKey!);
    resolved.push({ inputName: input.name, file });
  }

  return { missing, usedSlots: [...usedSlots], resolved };
}

function buildBulkRows(templates: TemplateOption[], selection: Record<string, boolean>) {
  return templates
    .filter((template) => selection[template.versionId] !== false)
    .map((template) => ({
      templateId: template.templateId,
      templateName: template.templateName,
      versionId: template.versionId,
      reviewStatus: template.reviewStatus,
      requiredInputs: template.inputs.map((input) => input.name),
      expectedImageOutputs: template.counts.imageOutputs,
      expectedVideoOutputs: template.counts.videoOutputs,
      status: "idle" as BulkRunState,
      jobId: null,
      actualImageOutputs: 0,
      actualVideoOutputs: 0,
      progress: 0,
      error: null,
      startedAt: null,
      completedAt: null,
      usedSharedSlots: [],
    }));
}

const TemplateLab = () => {
  const location = useLocation();
  const params = useParams<{ slug?: string; jobId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, hasAppAccess } = useAuth();
  const [accessCode, setAccessCode] = useState("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null);
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState(false);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loadingRecentRuns, setLoadingRecentRuns] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const [runnerMode, setRunnerMode] = useState<RunnerMode>("single");
  const [inspectorTab, setInspectorTab] = useState("map");
  const [selectedInspectorNodeId, setSelectedInspectorNodeId] = useState<string | null>(null);
  const [hiddenInspectorNodeIds, setHiddenInspectorNodeIds] = useState<string[]>([]);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [savingNodeEdits, setSavingNodeEdits] = useState(false);
  const [reviewStatusDraft, setReviewStatusDraft] = useState<string>("Unreviewed");
  const [savingReviewStatus, setSavingReviewStatus] = useState(false);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [bulkFiles, setBulkFiles] = useState<Record<string, File | null>>({});
  const [bulkPreviews, setBulkPreviews] = useState<Record<string, string>>({});
  const [bulkSelection, setBulkSelection] = useState<Record<string, boolean>>({});
  const [bulkRows, setBulkRows] = useState<BulkRunRow[]>([]);
  const [bulkDispatching, setBulkDispatching] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bulkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bulkRowsRef = useRef<BulkRunRow[]>([]);
  const lastLoadedCodeRef = useRef<string | null>(null);
  const hasSessionRunner = !!session?.access_token;
  const canManageTemplates = hasAppAccess;
  const isAdminSurface = location.pathname.startsWith("/app/lab/");
  const requestedTemplate = searchParams.get("templateId") || params.slug || "";
  const requestedJobId = params.jobId || searchParams.get("jobId") || "";

  useEffect(() => {
    const savedCode = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
    if (savedCode) setAccessCode(savedCode);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, accessCode);
  }, [accessCode]);

  useEffect(() => {
    bulkRowsRef.current = bulkRows;
  }, [bulkRows]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (bulkPollRef.current) clearInterval(bulkPollRef.current);
      Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
      Object.values(bulkPreviews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [bulkPreviews, previews]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.versionId === selectedVersionId) ?? null,
    [templates, selectedVersionId],
  );

  useEffect(() => {
    setBulkSelection((current) => {
      const next = { ...current };
      let changed = false;

      for (const template of templates) {
        if (!(template.versionId in next)) {
          next[template.versionId] = true;
          changed = true;
        }
      }

      for (const versionId of Object.keys(next)) {
        if (!templates.some((template) => template.versionId === versionId)) {
          delete next[versionId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [templates]);

  const outputImages = useMemo(
    () => job?.outputs.filter((item) => item.type === "image") ?? [],
    [job],
  );
  const outputVideos = useMemo(
    () => job?.outputs.filter((item) => item.type === "video") ?? [],
    [job],
  );

  const flowLanes = useMemo(() => {
    if (!templateDetail || !canManageTemplates) return [];

    const lanes = [
      { key: "uploads", title: "Uploads", nodes: [] as TemplateDetailNode[] },
      { key: "references", title: "References", nodes: [] as TemplateDetailNode[] },
      { key: "internals", title: "Internal Scene Locks", nodes: [] as TemplateDetailNode[] },
      { key: "images", title: "Image Steps", nodes: [] as TemplateDetailNode[] },
      { key: "videos", title: "Video Steps", nodes: [] as TemplateDetailNode[] },
      { key: "other", title: "Other", nodes: [] as TemplateDetailNode[] },
    ];

    if (selectedTemplate) {
      lanes[0].nodes.push(
        ...selectedTemplate.inputs.map((input) => ({
          id: `upload-${input.id}`,
          rawName: input.name,
          name: input.name,
          nodeType: "user_input",
          prompt: null,
          expected: input.expected,
          defaultAssetUrl: null,
          defaultAssetType: null,
          incoming: [],
          summary: `${input.name} is a dynamic upload slot. The user must provide this media at run time.`,
          editor: {
            mode: "upload" as const,
            slotKey: input.id,
            label: input.name,
            expected: input.expected,
            isUserFacingInput: true,
            isReferenceInput: false,
            sampleUrl: null,
          },
        })),
      );
    }

    for (const node of templateDetail.nodes) {
      const summary = node.summary.toLowerCase();
      if (node.nodeType === "user_input") {
        if (node.editor?.mode === "workflow") {
          lanes[2].nodes.push(node);
          continue;
        }

        if (summary.includes("built-in reference") || !!node.defaultAssetUrl) {
          lanes[1].nodes.push(node);
        }
        continue;
      }

      if (node.nodeType === "image_gen") {
        lanes[3].nodes.push(node);
        continue;
      }

      if (node.nodeType === "video_gen") {
        lanes[4].nodes.push(node);
        continue;
      }

      lanes[5].nodes.push(node);
    }

    return lanes.filter((lane) => lane.nodes.length > 0);
  }, [canManageTemplates, selectedTemplate, templateDetail]);

  const visibleFlowLanes = useMemo(
    () =>
      flowLanes
        .map((lane) => ({
          ...lane,
          nodes: lane.nodes.filter((node) => !hiddenInspectorNodeIds.includes(node.id)),
        }))
        .filter((lane) => lane.nodes.length > 0),
    [flowLanes, hiddenInspectorNodeIds],
  );

  const inspectorNodes = useMemo(
    () => visibleFlowLanes.flatMap((lane) => lane.nodes),
    [visibleFlowLanes],
  );

  const selectedInspectorNode = useMemo(
    () => inspectorNodes.find((node) => node.id === selectedInspectorNodeId) ?? inspectorNodes[0] ?? null,
    [inspectorNodes, selectedInspectorNodeId],
  );

  const normalizeFile = useCallback((sourceFile: File) => {
    return new Promise<File>((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(sourceFile);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        if (img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
          resolve(sourceFile);
          return;
        }

        const scale = Math.min(MAX_DIMENSION / img.width, MAX_DIMENSION / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Could not resize image"));
            return;
          }

          resolve(new File([blob], sourceFile.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        }, "image/jpeg", 0.9);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not load image"));
      };

      img.src = objectUrl;
    });
  }, []);

  const setPreviewFile = useCallback(
    async (
      inputId: string,
      nextFile: File | null,
      fileSetter: Dispatch<SetStateAction<Record<string, File | null>>>,
      previewSetter: Dispatch<SetStateAction<Record<string, string>>>,
      previewStore: Record<string, string>,
    ) => {
      if (previewStore[inputId]) {
        URL.revokeObjectURL(previewStore[inputId]);
      }

      if (!nextFile) {
        fileSetter((current) => ({ ...current, [inputId]: null }));
        previewSetter((current) => {
          const next = { ...current };
          delete next[inputId];
          return next;
        });
        return;
      }

      try {
        const normalized = await normalizeFile(nextFile);
        fileSetter((current) => ({ ...current, [inputId]: normalized }));
        previewSetter((current) => ({ ...current, [inputId]: URL.createObjectURL(normalized) }));
      } catch (fileError) {
        const message = fileError instanceof Error ? fileError.message : "Could not prepare image";
        toast({ title: "Image error", description: message, variant: "destructive" });
      }
    },
    [normalizeFile],
  );

  const buildAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };

    if (hasSessionRunner) {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const accessToken = currentSession?.access_token ?? session?.access_token;
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      return headers;
    }

    const runnerCode = accessCode.trim();
    if (!runnerCode) throw new Error("Enter the lab access code first.");
    headers["x-runner-code"] = runnerCode;
    return headers;
  }, [accessCode, hasSessionRunner, session?.access_token]);

  const loadTemplates = useCallback(async () => {
    if (!hasSessionRunner && !accessCode.trim()) {
      toast({ title: "Missing access code", description: "Enter the lab access code first.", variant: "destructive" });
      return;
    }

    setLoadingTemplates(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lab-template-catalog`, {
        headers: await buildAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load template catalog");

      setTemplates(data.templates ?? []);
      setSelectedVersionId((current) => current || data.templates?.[0]?.versionId || "");
    } catch (catalogError) {
      const message = catalogError instanceof Error ? catalogError.message : "Could not load templates";
      setTemplates([]);
      setSelectedVersionId("");
      setError(message);
      toast({ title: "Catalog error", description: message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  }, [accessCode, buildAuthHeaders, hasSessionRunner]);

  const loadRecentRuns = useCallback(async () => {
    if (!hasSessionRunner) {
      setRecentRuns([]);
      return;
    }

    setLoadingRecentRuns(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-recent-runs?limit=8`,
        { headers: await buildAuthHeaders() },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load recent runs");
      setRecentRuns(data.jobs ?? []);
    } catch (historyError) {
      const message = historyError instanceof Error ? historyError.message : "Could not load recent runs";
      toast({ title: "Run history error", description: message, variant: "destructive" });
    } finally {
      setLoadingRecentRuns(false);
    }
  }, [buildAuthHeaders, hasSessionRunner]);

  useEffect(() => {
    const loadKey = hasSessionRunner ? `auth:${session?.user.id}` : accessCode.trim();

    if (!loadKey) {
      lastLoadedCodeRef.current = null;
      setTemplates([]);
      setSelectedVersionId("");
      return;
    }

    if (lastLoadedCodeRef.current === loadKey) return;
    lastLoadedCodeRef.current = loadKey;
    void loadTemplates();
  }, [accessCode, hasSessionRunner, loadTemplates, session?.user.id]);

  useEffect(() => {
    if (!templates.length || selectedVersionId) return;

    const requested = normalizeTemplateKey(requestedTemplate);
    if (!requested) return;

    const match = templates.find((template) =>
      normalizeTemplateKey(template.templateName) === requested ||
      normalizeTemplateKey(template.templateId) === requested ||
      normalizeTemplateKey(template.versionId) === requested,
    );

    if (match) {
      setSelectedVersionId(match.versionId);
    }
  }, [requestedTemplate, selectedVersionId, templates]);

  useEffect(() => {
    if (!hasSessionRunner) {
      setRecentRuns([]);
      return;
    }

    void loadRecentRuns();
  }, [hasSessionRunner, loadRecentRuns, session?.user.id]);

  const resetTemplateInputs = useCallback(() => {
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    setFiles({});
    setPreviews({});
  }, [previews]);

  const loadTemplateDetail = useCallback(async (versionId: string) => {
    if (!versionId) {
      setTemplateDetail(null);
      return;
    }

    setLoadingTemplateDetail(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lab-template-detail?versionId=${encodeURIComponent(versionId)}`,
        {
          headers: await buildAuthHeaders(),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load template detail");
      setTemplateDetail(data);
      setReviewStatusDraft(data.reviewStatus ?? "Unreviewed");
    } catch (detailError) {
      const message = detailError instanceof Error ? detailError.message : "Could not load template detail";
      setTemplateDetail(null);
      toast({ title: "Template detail error", description: message, variant: "destructive" });
    } finally {
      setLoadingTemplateDetail(false);
    }
  }, [buildAuthHeaders]);

  useEffect(() => {
    if (!selectedVersionId) {
      setTemplateDetail(null);
      setReviewStatusDraft("Unreviewed");
      return;
    }

    void loadTemplateDetail(selectedVersionId);
  }, [loadTemplateDetail, selectedVersionId]);

  useEffect(() => {
    setHiddenInspectorNodeIds([]);
    setSelectedInspectorNodeId(null);
    setInspectorTab("map");
  }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedInspectorNodeId && inspectorNodes[0]) {
      setSelectedInspectorNodeId(inspectorNodes[0].id);
      return;
    }

    if (selectedInspectorNodeId && !inspectorNodes.some((node) => node.id === selectedInspectorNodeId)) {
      setSelectedInspectorNodeId(inspectorNodes[0]?.id ?? null);
    }
  }, [inspectorNodes, selectedInspectorNodeId]);

  useEffect(() => {
    if (!selectedInspectorNode) {
      setEditorDraft(null);
      return;
    }

    setEditorDraft(getNodeEditorDefaults(selectedInspectorNode));
  }, [selectedInspectorNode]);

  const handleFile = useCallback(async (inputId: string, nextFile: File | null) => {
    await setPreviewFile(inputId, nextFile, setFiles, setPreviews, previews);
  }, [previews, setPreviewFile]);

  const handleBulkFile = useCallback(async (inputId: string, nextFile: File | null) => {
    await setPreviewFile(inputId, nextFile, setBulkFiles, setBulkPreviews, bulkPreviews);
  }, [bulkPreviews, setPreviewFile]);

  const fetchJobStatusRaw = useCallback(async (nextJobId: string) => {
    const headers = await buildAuthHeaders();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${nextJobId}`,
      { headers },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Could not load job status");

    return data as JobStatus;
  }, [buildAuthHeaders]);

  const fetchJobStatus = useCallback(async (nextJobId: string) => {
    const data = await fetchJobStatusRaw(nextJobId);

    setJobId(nextJobId);
    setJob(data);

    if (data.status === "complete") {
      setPhase("complete");
      setError(null);
    } else if (data.status === "failed") {
      setPhase("error");
      setError(data.error ?? "Template run failed");
    } else {
      setPhase("running");
      setError(null);
    }

    return data;
  }, [fetchJobStatusRaw]);

  const pollJob = useCallback((nextJobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchJobStatus(nextJobId);

        if (data.status === "complete" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (pollError) {
        const message = pollError instanceof Error ? pollError.message : "Polling failed";
        setPhase("error");
        setError(message);
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  }, [fetchJobStatus]);

  const startTemplateRun = useCallback(async (template: TemplateOption, inputFiles: Record<string, { dataUrl: string; filename?: string }>) => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-template-run`, {
      method: "POST",
      headers: {
        ...(await buildAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        versionId: template.versionId,
        inputFiles,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Could not start template");
    return data as { jobId: string; status: string };
  }, [buildAuthHeaders]);

  const pollBulkRuns = useCallback(() => {
    if (bulkPollRef.current) clearInterval(bulkPollRef.current);

    bulkPollRef.current = setInterval(async () => {
      const rowsToCheck = [...bulkRowsRef.current].filter((row) => row.jobId && (row.status === "queued" || row.status === "running" || row.status === "starting"));
      if (!rowsToCheck.length) {
        if (bulkPollRef.current) clearInterval(bulkPollRef.current);
        bulkPollRef.current = null;
        return;
      }

      try {
        const updates = await Promise.all(
          rowsToCheck.map(async (row) => {
            try {
              const status = await fetchJobStatusRaw(row.jobId!);
              return {
                versionId: row.versionId,
                jobId: row.jobId,
                status: status.status === "queued" ? "queued" : status.status === "failed" ? "failed" : status.status === "complete" ? "complete" : "running",
                progress: status.progress ?? 0,
                actualImageOutputs: status.outputs.filter((output) => output.type === "image").length,
                actualVideoOutputs: status.outputs.filter((output) => output.type === "video").length,
                error: status.error ?? null,
                startedAt: status.steps.find((step) => step.startedAt)?.startedAt ?? null,
                completedAt:
                  status.steps
                    .map((step) => step.completedAt)
                    .filter(Boolean)
                    .sort()
                    .at(-1) ?? null,
              } as const;
            } catch (bulkError) {
              return {
                versionId: row.versionId,
                jobId: row.jobId,
                status: "failed",
                progress: row.progress,
                actualImageOutputs: row.actualImageOutputs,
                actualVideoOutputs: row.actualVideoOutputs,
                error: bulkError instanceof Error ? bulkError.message : "Could not refresh job",
                startedAt: row.startedAt,
                completedAt: row.completedAt,
              } as const;
            }
          }),
        );

        setBulkRows((current) =>
          current.map((row) => {
            const next = updates.find((update) => update.versionId === row.versionId && update.jobId === row.jobId);
            return next
              ? {
                  ...row,
                  status: next.status as BulkRunState,
                  progress: next.progress,
                  actualImageOutputs: next.actualImageOutputs,
                  actualVideoOutputs: next.actualVideoOutputs,
                  error: next.error,
                  startedAt: next.startedAt,
                  completedAt: next.completedAt,
                }
              : row;
          }),
        );
      } catch {
        // Keep the existing state. Individual row failures are captured above.
      }
    }, 3000);
  }, [fetchJobStatusRaw]);

  useEffect(() => {
    if (!hasSessionRunner) return;
    if (phase !== "complete" && phase !== "error") return;
    void loadRecentRuns();
  }, [hasSessionRunner, loadRecentRuns, phase]);

  useEffect(() => {
    const hasActiveBulkRuns = bulkRows.some((row) => row.status === "queued" || row.status === "running" || row.status === "starting");

    if (hasActiveBulkRuns) {
      pollBulkRuns();
      return;
    }

    if (bulkPollRef.current) {
      clearInterval(bulkPollRef.current);
      bulkPollRef.current = null;
    }
  }, [bulkRows, pollBulkRuns]);

  useEffect(() => {
    if (!hasSessionRunner) return;
    if (jobId) return;
    if (job) return;

    const activeRun = recentRuns.find((run) => run.status === "running" || run.status === "queued");
    if (!activeRun) return;

    void fetchJobStatus(activeRun.id);
  }, [fetchJobStatus, hasSessionRunner, job, jobId, recentRuns]);

  useEffect(() => {
    if (!requestedJobId) return;
    if (jobId === requestedJobId) return;
    void fetchJobStatus(requestedJobId);
  }, [fetchJobStatus, jobId, requestedJobId]);

  const handleRun = useCallback(async () => {
    if (!selectedTemplate) {
      toast({ title: "Missing template", description: "Load the catalog and choose a template first.", variant: "destructive" });
      return;
    }

    if (!hasSessionRunner && !accessCode.trim()) {
      toast({ title: "Missing access code", description: "Enter the lab access code first.", variant: "destructive" });
      return;
    }

    const requiredInputs = selectedTemplate.inputs.filter((input) => !input.defaultAssetUrl);
    const missingInput = requiredInputs.find((input) => !files[input.id]);
    if (missingInput) {
      toast({ title: "Missing input", description: `${missingInput.name} still needs an image.`, variant: "destructive" });
      return;
    }

    setError(null);
    setJob(null);
    setJobId(null);
    setPhase("running");

    try {
      const inputFiles = Object.fromEntries(
        await Promise.all(
          selectedTemplate.inputs
            .filter((input) => files[input.id])
            .map(async (input) => {
              const file = files[input.id]!;
              const dataUrl = await fileToDataUrl(file);
              return [
                input.name,
                {
                  dataUrl,
                  filename: file.name,
                },
              ];
            }),
        ),
      );

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-template-run`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: selectedTemplate.versionId,
          inputFiles,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not start template");

      setJobId(data.jobId);
      void loadRecentRuns();
      pollJob(data.jobId);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Could not start template";
      setPhase("error");
      setError(message);
      toast({ title: "Run failed", description: message, variant: "destructive" });
    }
  }, [accessCode, buildAuthHeaders, files, hasSessionRunner, loadRecentRuns, pollJob, selectedTemplate]);

  const canRun = !!selectedTemplate && selectedTemplate.inputs.every((input) => input.defaultAssetUrl || files[input.id]);

  const setRunExpanded = useCallback((runId: string, open: boolean) => {
    setExpandedRuns((current) => ({ ...current, [runId]: open }));
  }, []);

  const hideInspectorNode = useCallback((nodeId: string) => {
    setHiddenInspectorNodeIds((current) => (current.includes(nodeId) ? current : [...current, nodeId]));
  }, []);

  const restoreInspectorView = useCallback(() => {
    setHiddenInspectorNodeIds([]);
  }, []);

  const saveNodeEdits = useCallback(async () => {
    if (!selectedTemplate || !selectedInspectorNode || !editorDraft) return;

    setSavingNodeEdits(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: selectedTemplate.versionId,
          nodeId: selectedInspectorNode.id,
          displayLabel: editorDraft.displayLabel,
          prompt: editorDraft.prompt,
          expected: editorDraft.expected,
          editorMode: selectedInspectorNode.nodeType === "user_input" ? editorDraft.editorMode : null,
          slotKey: selectedInspectorNode.nodeType === "user_input" ? editorDraft.slotKey : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not save node edits");

      await loadTemplateDetail(selectedTemplate.versionId);
      await loadTemplates();
      toast({ title: "Saved", description: "Template node updated." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save node edits";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSavingNodeEdits(false);
    }
  }, [buildAuthHeaders, editorDraft, loadTemplateDetail, loadTemplates, selectedInspectorNode, selectedTemplate]);

  const saveReviewStatus = useCallback(async () => {
    if (!selectedTemplate) return;

    setSavingReviewStatus(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-review-status`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: selectedTemplate.versionId,
          reviewStatus: reviewStatusDraft,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not save review status");

      await loadTemplateDetail(selectedTemplate.versionId);
      await loadTemplates();
      toast({ title: "Saved", description: "Template review status updated." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save review status";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSavingReviewStatus(false);
    }
  }, [buildAuthHeaders, loadTemplateDetail, loadTemplates, reviewStatusDraft, selectedTemplate]);

  const resetBulkSelection = useCallback((nextValue: boolean) => {
    setBulkSelection(Object.fromEntries(templates.map((template) => [template.versionId, nextValue])));
  }, [templates]);

  const keepOnlyBulkFailures = useCallback(() => {
    setBulkSelection(
      Object.fromEntries(
        templates.map((template) => [
          template.versionId,
          bulkRows.find((row) => row.versionId === template.versionId)?.status === "failed",
        ]),
      ),
    );
  }, [bulkRows, templates]);

  const openBulkRun = useCallback(async (row: BulkRunRow) => {
    setSelectedVersionId(row.versionId);
    if (row.jobId) {
      await fetchJobStatus(row.jobId);
    }
  }, [fetchJobStatus]);

  const handleRunAll = useCallback(async () => {
    if (!templates.length) {
      toast({ title: "Missing templates", description: "Load the template catalog first.", variant: "destructive" });
      return;
    }

    const targetTemplates = templates.filter((template) => bulkSelection[template.versionId] !== false);
    if (!targetTemplates.length) {
      toast({ title: "Nothing selected", description: "Pick at least one template for the batch run.", variant: "destructive" });
      return;
    }

    const initialRows = buildBulkRows(templates, bulkSelection);
    setBulkRows(initialRows);
    setBulkDispatching(true);

    try {
      for (const template of targetTemplates) {
        const { missing, usedSlots, resolved } = buildBulkInputFilesForTemplate(template, bulkFiles);

        if (missing.length) {
          setBulkRows((current) =>
            current.map((row) =>
              row.versionId === template.versionId
                ? {
                    ...row,
                    status: "skipped",
                    error: `Missing shared inputs: ${missing.join(", ")}`,
                    usedSharedSlots: usedSlots,
                  }
                : row,
            ),
          );
          continue;
        }

        setBulkRows((current) =>
          current.map((row) =>
            row.versionId === template.versionId
              ? { ...row, status: "starting", error: null, usedSharedSlots: usedSlots }
              : row,
          ),
        );

        try {
          const inputFiles = Object.fromEntries(
            await Promise.all(
              resolved.map(async ({ inputName, file }) => [
                inputName,
                {
                  dataUrl: await fileToDataUrl(file),
                  filename: file.name,
                },
              ]),
            ),
          );

          const data = await startTemplateRun(template, inputFiles);

          setBulkRows((current) =>
            current.map((row) =>
              row.versionId === template.versionId
                ? {
                    ...row,
                    status: "queued",
                    jobId: data.jobId,
                    progress: 0,
                    error: null,
                  }
                : row,
            ),
          );
        } catch (batchRunError) {
          const message = batchRunError instanceof Error ? batchRunError.message : "Could not start template";
          setBulkRows((current) =>
            current.map((row) =>
              row.versionId === template.versionId
                ? {
                    ...row,
                    status: "failed",
                    error: message,
                  }
                : row,
            ),
          );
        }
      }
    } finally {
      setBulkDispatching(false);
      void loadRecentRuns();
      pollBulkRuns();
    }
  }, [bulkFiles, bulkSelection, loadRecentRuns, pollBulkRuns, startTemplateRun, templates]);

  const canRunBulk = useMemo(() => {
    const targetTemplates = templates.filter((template) => bulkSelection[template.versionId] !== false);
    if (!targetTemplates.length) return false;
    return targetTemplates.some((template) => buildBulkInputFilesForTemplate(template, bulkFiles).missing.length === 0);
  }, [bulkFiles, bulkSelection, templates]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-28">
        <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
          <section className="rounded-3xl border border-border/50 bg-card/70 p-8 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {isAdminSurface ? "Admin Lab" : hasSessionRunner ? "Customer Runner" : "Public Lab"}
                </p>
                <h1 className="mt-2 font-display text-4xl font-black tracking-tight">Template Runner</h1>
                <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                  {canManageTemplates
                    ? "Pick any active template, upload the required inputs, and run the graph against the live Supabase backend."
                    : "Pick a template, upload the required inputs, and run it against the live Supabase backend."}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,auto] md:items-end">
              {hasSessionRunner ? (
                <div className="rounded-2xl border border-border/40 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                  {canManageTemplates
                    ? "Signed in with admin/dev access. The runner is using your Supabase session."
                    : "Signed in with your customer account. Runs, history, and results are tied to your session."}
                </div>
              ) : (
                <div>
                  <Label htmlFor="runner-code" className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.15em]">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    Lab Access Code
                  </Label>
                  <Input
                    id="runner-code"
                    value={accessCode}
                    onChange={(event) => {
                      lastLoadedCodeRef.current = null;
                      setAccessCode(event.target.value);
                    }}
                    placeholder="Enter the private runner code"
                  />
                </div>
              )}
              <Button type="button" onClick={() => void loadTemplates()} disabled={loadingTemplates}>
                {loadingTemplates ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh Templates
              </Button>
            </div>

            <div className="mt-6">
              <Label htmlFor="template-select" className="mb-2 block text-xs uppercase tracking-[0.15em]">
                Template
              </Label>
              <select
                id="template-select"
                value={selectedVersionId}
                onChange={(event) => {
                  const nextVersionId = event.target.value;
                  setSelectedVersionId(nextVersionId);
                  if (location.pathname.includes("/templates")) {
                    setSearchParams((current) => {
                      const next = new URLSearchParams(current);
                      if (nextVersionId) {
                        next.set("templateId", nextVersionId);
                      } else {
                        next.delete("templateId");
                      }
                      return next;
                    }, { replace: true });
                  }
                  resetTemplateInputs();
                  setJob(null);
                  setJobId(null);
                  setPhase("idle");
                  setError(null);
                }}
                disabled={loadingTemplates || templates.length === 0}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {templates.length === 0 ? (
                  <option value="" disabled>
                    {loadingTemplates ? "Loading templates..." : "No templates loaded yet"}
                  </option>
                ) : null}
                {templates.map((template) => (
                  <option key={template.versionId} value={template.versionId}>
                    {template.templateName} · {template.counts.inputs} inputs · {template.counts.imageOutputs} image output · {template.counts.videoOutputs} video output{canManageTemplates ? ` · ${template.reviewStatus}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {canManageTemplates ? (
              <Tabs value={runnerMode} onValueChange={(value) => setRunnerMode(value as RunnerMode)} className="mt-8">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="single">Single Run</TabsTrigger>
                  <TabsTrigger value="bulk">Run All Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="mt-4">
                  {selectedTemplate ? (
                    <div className="space-y-4">
                      {selectedTemplate.inputs.map((input) => {
                        const previewUrl = previews[input.id];
                        const selectedFile = files[input.id];

                        return (
                          <div key={input.id} className="rounded-3xl border border-border/40 bg-background/60 p-5">
                            <div className="mb-4 flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium">{input.name}</p>
                                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{input.expected}</p>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                {input.defaultAssetUrl ? "Built-in reference available" : "Upload required"}
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-2xl border border-dashed border-border/60 p-4">
                                <p className="mb-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">Uploaded Override</p>
                                {previewUrl ? (
                                  <img src={previewUrl} alt={input.name} className="max-h-64 rounded-2xl object-contain" />
                                ) : (
                                  <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-border/30 bg-muted/20 text-center text-sm text-muted-foreground">
                                    <Upload className="mb-3 h-8 w-8" />
                                    No uploaded image yet
                                  </div>
                                )}

                                <div className="mt-4 flex flex-wrap gap-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      const chooser = document.createElement("input");
                                      chooser.type = "file";
                                      chooser.accept = "image/png,image/jpeg,image/webp";
                                      chooser.onchange = (event) => {
                                        const nextFile = (event.target as HTMLInputElement).files?.[0];
                                        if (nextFile) void handleFile(input.id, nextFile);
                                      };
                                      chooser.click();
                                    }}
                                  >
                                    Choose Image
                                  </Button>
                                  {selectedFile ? (
                                    <Button type="button" variant="ghost" onClick={() => void handleFile(input.id, null)}>
                                      Clear
                                    </Button>
                                  ) : null}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border/30 bg-background/70 p-4">
                                <p className="mb-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">Template Default</p>
                                {input.defaultAssetUrl ? (
                                  <img src={input.defaultAssetUrl} alt={`${input.name} default`} className="max-h-64 rounded-2xl object-contain" />
                                ) : (
                                  <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/30 bg-muted/20 text-sm text-muted-foreground">
                                    No default asset
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <Button type="button" onClick={() => void handleRun()} disabled={!canRun || phase === "running"}>
                        {phase === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                        Run Template
                      </Button>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="bulk" className="mt-4 space-y-4">
                  <div className="rounded-3xl border border-border/40 bg-background/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Bulk Audit</p>
                        <h3 className="mt-2 text-xl font-bold">Run Every Selected Template</h3>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                          Upload one shared input bank, dispatch all selected templates, and compare expected vs actual outputs without clicking through 13 separate runs.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => resetBulkSelection(true)}>
                          Select All
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => resetBulkSelection(false)}>
                          Clear All
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={keepOnlyBulkFailures}>
                          Keep Only Failures
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {BULK_SHARED_INPUTS.map((slot) => {
                        const previewUrl = bulkPreviews[slot.key];
                        const selectedFile = bulkFiles[slot.key];

                        return (
                          <div key={slot.key} className="rounded-2xl border border-border/30 bg-background/80 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{slot.label}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{slot.description}</p>
                              </div>
                              <span className="rounded-full border border-border/30 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                                Shared
                              </span>
                            </div>

                            <div className="mt-4">
                              {previewUrl ? (
                                <img src={previewUrl} alt={slot.label} className="max-h-48 rounded-2xl object-contain" />
                              ) : (
                                <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-border/30 bg-muted/20 text-center text-sm text-muted-foreground">
                                  <Upload className="mb-3 h-8 w-8" />
                                  No shared image yet
                                </div>
                              )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const chooser = document.createElement("input");
                                  chooser.type = "file";
                                  chooser.accept = "image/png,image/jpeg,image/webp";
                                  chooser.onchange = (event) => {
                                    const nextFile = (event.target as HTMLInputElement).files?.[0];
                                    if (nextFile) void handleBulkFile(slot.key, nextFile);
                                  };
                                  chooser.click();
                                }}
                              >
                                Choose Image
                              </Button>
                              {selectedFile ? (
                                <Button type="button" variant="ghost" onClick={() => void handleBulkFile(slot.key, null)}>
                                  Clear
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button type="button" onClick={() => void handleRunAll()} disabled={bulkDispatching || !canRunBulk}>
                        {bulkDispatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                        Run All Selected
                      </Button>
                      <div className="rounded-2xl border border-border/30 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                        Selected templates: {templates.filter((template) => bulkSelection[template.versionId] !== false).length}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border/40 bg-background/60 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Batch Matrix</p>
                        <p className="mt-2 text-sm text-muted-foreground">Expected outputs are the current template counts. Actual outputs come from the finished job payload. Click any row to load it into the run-state panel.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => pollBulkRuns()} disabled={!bulkRows.some((row) => row.jobId)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh Batch
                      </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {(bulkRows.length ? bulkRows : buildBulkRows(templates, bulkSelection)).map((row) => {
                        const selected = bulkSelection[row.versionId] !== false;
                        const expectedTotal = row.expectedImageOutputs + row.expectedVideoOutputs;
                        const actualTotal = row.actualImageOutputs + row.actualVideoOutputs;

                        return (
                          <div key={row.versionId} className={`rounded-2xl border p-4 ${selected ? "border-border/40 bg-background/80" : "border-border/20 bg-background/40 opacity-60"}`}>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <label className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(event) =>
                                        setBulkSelection((current) => ({ ...current, [row.versionId]: event.target.checked }))
                                      }
                                    />
                                    <span className="font-medium">{row.templateName}</span>
                                  </label>
                                  <span className="rounded-full border border-border/30 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                                    {row.reviewStatus}
                                  </span>
                                  <span className="rounded-full border border-border/30 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                                    {row.status}
                                  </span>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Inputs: {row.requiredInputs.join(", ")} {row.usedSharedSlots.length ? `· using ${row.usedSharedSlots.join(", ")}` : ""}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Expected: {row.expectedImageOutputs} image + {row.expectedVideoOutputs} video ({expectedTotal} total)
                                  {" · "}
                                  Actual: {row.actualImageOutputs} image + {row.actualVideoOutputs} video ({actualTotal} total)
                                </p>
                                {row.jobId ? (
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    Job {row.jobId.slice(0, 8)}... · {row.progress}%
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {row.jobId ? (
                                  <Button type="button" size="sm" variant="outline" onClick={() => void openBulkRun(row)}>
                                    Open
                                  </Button>
                                ) : null}
                                {row.error ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(row.error ?? "");
                                      toast({ title: "Copied", description: "Batch error copied to clipboard." });
                                    }}
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy Error
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            {row.error ? (
                              <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {row.error}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : selectedTemplate ? (
              <div className="mt-8 space-y-4">
                {selectedTemplate.inputs.map((input) => {
                  const previewUrl = previews[input.id];
                  const selectedFile = files[input.id];

                  return (
                    <div key={input.id} className="rounded-3xl border border-border/40 bg-background/60 p-5">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium">{input.name}</p>
                          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{input.expected}</p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {input.defaultAssetUrl ? "Built-in reference available" : "Upload required"}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-dashed border-border/60 p-4">
                          <p className="mb-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">Uploaded Override</p>
                          {previewUrl ? (
                            <img src={previewUrl} alt={input.name} className="max-h-64 rounded-2xl object-contain" />
                          ) : (
                            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-border/30 bg-muted/20 text-center text-sm text-muted-foreground">
                              <Upload className="mb-3 h-8 w-8" />
                              No uploaded image yet
                            </div>
                          )}

                          <div className="mt-4 flex flex-wrap gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const chooser = document.createElement("input");
                                chooser.type = "file";
                                chooser.accept = "image/png,image/jpeg,image/webp";
                                chooser.onchange = (event) => {
                                  const nextFile = (event.target as HTMLInputElement).files?.[0];
                                  if (nextFile) void handleFile(input.id, nextFile);
                                };
                                chooser.click();
                              }}
                            >
                              Choose Image
                            </Button>
                            {selectedFile ? (
                              <Button type="button" variant="ghost" onClick={() => void handleFile(input.id, null)}>
                                Clear
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/30 bg-background/70 p-4">
                          <p className="mb-3 text-xs uppercase tracking-[0.15em] text-muted-foreground">Template Default</p>
                          {input.defaultAssetUrl ? (
                            <img src={input.defaultAssetUrl} alt={`${input.name} default`} className="max-h-64 rounded-2xl object-contain" />
                          ) : (
                            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/30 bg-muted/20 text-sm text-muted-foreground">
                              No default asset
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <Button type="button" onClick={() => void handleRun()} disabled={!canRun || phase === "running"}>
                  {phase === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                  Run Template
                </Button>
              </div>
            ) : null}

            {templateDetail && canManageTemplates ? (
              <div className="mt-8 rounded-3xl border border-border/40 bg-background/50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Template Wiring</p>
                    <h3 className="mt-2 text-xl font-bold">{templateDetail.templateName}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Audit the real upload slots, fixed references, and generation steps without the current page dumping every detail at once.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                        {templateDetail.reviewStatus}
                      </span>
                      {hiddenInspectorNodeIds.length ? (
                        <Button type="button" size="sm" variant="outline" onClick={restoreInspectorView}>
                          Reset View
                        </Button>
                      ) : null}
                      {loadingTemplateDetail ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
                    </div>
                    {canManageTemplates ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void saveReviewStatus()}
                        disabled={savingReviewStatus || !selectedTemplate}
                      >
                        {savingReviewStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Review
                      </Button>
                    ) : null}
                  </div>
                </div>

                {canManageTemplates ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr,auto] md:items-end">
                    <div>
                      <Label className="mb-2 block text-xs uppercase tracking-[0.15em]">Template Review Status</Label>
                      <select
                        value={reviewStatusDraft}
                        onChange={(event) => setReviewStatusDraft(event.target.value)}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm md:max-w-sm"
                      >
                        {REVIEW_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-2xl border border-border/30 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                      Stored on the active template version for admin QA and future builder reuse.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-border/30 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                    Sign in as admin or dev to edit review status.
                  </div>
                )}

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  {visibleFlowLanes.map((lane) => (
                    <div key={`summary-${lane.key}`} className="rounded-2xl border border-border/30 bg-background/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{lane.title}</p>
                      <p className="mt-2 text-2xl font-black tracking-tight">{lane.nodes.length}</p>
                    </div>
                  ))}
                </div>

                <Tabs value={inspectorTab} onValueChange={setInspectorTab} className="mt-5">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="map">Map</TabsTrigger>
                    <TabsTrigger value="inspect">Inspect</TabsTrigger>
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                  </TabsList>

                  <TabsContent value="map" className="mt-4">
                    {visibleFlowLanes.length ? (
                      <div className="overflow-x-auto pb-2">
                        <div className="grid min-w-[980px] gap-4 xl:grid-cols-4">
                          {visibleFlowLanes.map((lane) => (
                            <div key={lane.key} className="rounded-2xl border border-border/30 bg-background/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{lane.title}</p>
                                <span className="text-xs text-muted-foreground">{lane.nodes.length}</span>
                              </div>
                              <div className="mt-4 space-y-3">
                                {lane.nodes.map((node) => (
                                  <div
                                    key={`${lane.key}-${node.id}`}
                                    className="rounded-2xl border border-border/30 bg-background/90 p-3 transition hover:border-primary/50 hover:bg-background"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedInspectorNodeId(node.id);
                                          setInspectorTab("inspect");
                                        }}
                                        className="min-w-0 flex-1 text-left"
                                      >
                                        <p className="font-medium leading-tight">{node.name}</p>
                                        <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{node.nodeType}</p>
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={`Hide ${node.name}`}
                                        onClick={() => hideInspectorNode(node.id)}
                                        className="rounded-full border border-border/40 p-1 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                                      >
                                        <EyeOff className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    {node.defaultAssetUrl ? (
                                      <img src={node.defaultAssetUrl} alt={`${node.name} reference`} className="mt-3 max-h-36 rounded-xl border border-border/30 object-contain" />
                                    ) : null}
                                    {node.incoming.length ? (
                                      <div className="mt-3 space-y-1">
                                        {node.incoming.slice(0, 3).map((incoming) => (
                                          <p key={`${node.id}-${incoming.sourceNodeId}-${incoming.targetParam ?? "none"}`} className="text-xs text-muted-foreground">
                                            {incoming.sourceName}
                                            {incoming.targetParam ? ` -> ${incoming.targetParam}` : ""}
                                          </p>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/30 bg-background/70 p-6 text-sm text-muted-foreground">
                        Everything is hidden from the current review. Reset the view to bring the nodes back.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="inspect" className="mt-4">
                    <div className="grid gap-4 xl:grid-cols-[0.78fr,1.22fr]">
                      <div className="rounded-2xl border border-border/30 bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Review Queue</p>
                          <span className="text-xs text-muted-foreground">{inspectorNodes.length} visible</span>
                        </div>
                        <div className="mt-4 space-y-2">
                          {inspectorNodes.map((node) => (
                            <div
                              key={`inspect-list-${node.id}`}
                              className={`rounded-2xl border p-3 ${
                                selectedInspectorNode?.id === node.id
                                  ? "border-primary/60 bg-primary/5"
                                  : "border-border/30 bg-background/80"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedInspectorNodeId(node.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate font-medium">{node.name}</p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{node.nodeType}</p>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Hide ${node.name}`}
                                  onClick={() => hideInspectorNode(node.id)}
                                  className="rounded-full border border-border/40 p-1 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                                >
                                  <EyeOff className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/30 bg-background/70 p-4">
                        {selectedInspectorNode ? (
                          <>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium">{selectedInspectorNode.name}</p>
                                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{selectedInspectorNode.nodeType}</p>
                              </div>
                              {selectedInspectorNode.defaultAssetType ? (
                                <div className="text-right text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                                  {selectedInspectorNode.defaultAssetType}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div className="rounded-2xl border border-border/30 bg-background/80 p-4">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">What This Node Does</p>
                                <p className="mt-2 text-sm text-muted-foreground">{selectedInspectorNode.summary}</p>
                              </div>
                              <div className="rounded-2xl border border-border/30 bg-background/80 p-4">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Expected Media</p>
                                <p className="mt-2 text-sm text-foreground">{selectedInspectorNode.expected ?? "No explicit media contract stored."}</p>
                              </div>
                            </div>

                            {selectedInspectorNode.prompt ? (
                              <div className="mt-4 rounded-2xl border border-border/30 bg-background/80 p-4">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Prompt</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{selectedInspectorNode.prompt}</p>
                              </div>
                            ) : null}

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div className="rounded-2xl border border-border/30 bg-background/80 p-4">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Incoming Sources</p>
                                {selectedInspectorNode.incoming.length ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedInspectorNode.incoming.map((incoming) => (
                                      <span key={`${selectedInspectorNode.id}-${incoming.sourceNodeId}-${incoming.targetParam ?? "none"}`} className="rounded-full border border-border/40 px-2 py-1 text-xs text-foreground/80">
                                        {incoming.sourceName}
                                        {incoming.targetParam ? ` -> ${incoming.targetParam}` : ""}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-sm text-muted-foreground">No upstream mappings on this node.</p>
                                )}
                              </div>

                              <div className="rounded-2xl border border-border/30 bg-background/80 p-4">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Reference Asset</p>
                                {selectedInspectorNode.defaultAssetUrl ? (
                                  <img
                                    src={selectedInspectorNode.defaultAssetUrl}
                                    alt={`${selectedInspectorNode.name} reference`}
                                    className="mt-3 max-h-80 rounded-2xl border border-border/30 object-contain"
                                  />
                                ) : (
                                  <p className="mt-2 text-sm text-muted-foreground">No built-in reference asset on this node.</p>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-2xl border border-border/30 bg-background/80 p-6 text-sm text-muted-foreground">
                            Pick a node from the review queue to inspect it in detail.
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="edit" className="mt-4">
                    <div className="grid gap-4 xl:grid-cols-[0.78fr,1.22fr]">
                      <div className="rounded-2xl border border-border/30 bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Editable Nodes</p>
                          <span className="text-xs text-muted-foreground">{inspectorNodes.length} visible</span>
                        </div>
                        <div className="mt-4 space-y-2">
                          {inspectorNodes.map((node) => (
                            <button
                              key={`edit-list-${node.id}`}
                              type="button"
                              onClick={() => setSelectedInspectorNodeId(node.id)}
                              className={`w-full rounded-2xl border p-3 text-left ${
                                selectedInspectorNode?.id === node.id
                                  ? "border-primary/60 bg-primary/5"
                                  : "border-border/30 bg-background/80"
                              }`}
                            >
                              <p className="truncate font-medium">{node.name}</p>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{node.nodeType}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/30 bg-background/70 p-4">
                        {selectedInspectorNode && editorDraft ? (
                          <div className="space-y-4">
                            <div>
                              <p className="font-medium">{selectedInspectorNode.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Backend name: {selectedInspectorNode.rawName}
                              </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label className="mb-2 block text-xs uppercase tracking-[0.15em]">Display Label</Label>
                                <Input
                                  value={editorDraft.displayLabel}
                                  onChange={(event) => setEditorDraft((current) => current ? { ...current, displayLabel: event.target.value } : current)}
                                />
                              </div>
                              <div>
                                <Label className="mb-2 block text-xs uppercase tracking-[0.15em]">Expected Media</Label>
                                <Input
                                  value={editorDraft.expected}
                                  onChange={(event) => setEditorDraft((current) => current ? { ...current, expected: event.target.value } : current)}
                                  placeholder="image"
                                />
                              </div>
                            </div>

                            {selectedInspectorNode.nodeType === "user_input" ? (
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <Label className="mb-2 block text-xs uppercase tracking-[0.15em]">Input Mode</Label>
                                  <select
                                    value={editorDraft.editorMode}
                                    onChange={(event) =>
                                      setEditorDraft((current) =>
                                        current
                                          ? { ...current, editorMode: event.target.value as EditorDraft["editorMode"] }
                                          : current
                                      )}
                                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  >
                                    <option value="upload">User Upload</option>
                                    <option value="reference">Hidden Reference</option>
                                    <option value="workflow">Internal Scene Lock</option>
                                  </select>
                                </div>
                                <div>
                                  <Label className="mb-2 block text-xs uppercase tracking-[0.15em]">Slot Key</Label>
                                  <Input
                                    value={editorDraft.slotKey}
                                    onChange={(event) => setEditorDraft((current) => current ? { ...current, slotKey: event.target.value } : current)}
                                    placeholder="logo"
                                  />
                                </div>
                              </div>
                            ) : null}

                            <div>
                              <Label className="mb-2 block text-xs uppercase tracking-[0.15em]">Prompt</Label>
                              <Textarea
                                value={editorDraft.prompt}
                                onChange={(event) => setEditorDraft((current) => current ? { ...current, prompt: event.target.value } : current)}
                                rows={8}
                                placeholder="Prompt for this node"
                              />
                            </div>

                            <div className="rounded-2xl border border-border/30 bg-background/80 p-4 text-sm text-muted-foreground">
                              {selectedInspectorNode.nodeType === "user_input"
                                ? "Use User Upload for media the tester must provide at run time. Use Hidden Reference only for true fixed scene refs. Use Internal Scene Lock for baked demo assets the graph still depends on but the tester should not treat as a real reference."
                                : "This edits the stored display label and prompt for the node. It does not change edge wiring yet."}
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <Button
                                type="button"
                                onClick={() => void saveNodeEdits()}
                                disabled={savingNodeEdits || selectedInspectorNode.id.startsWith("upload-")}
                              >
                                {savingNodeEdits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Save Node
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  if (!selectedInspectorNode) return;
                                  setEditorDraft(getNodeEditorDefaults(selectedInspectorNode));
                                }}
                              >
                                Reset Draft
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-border/30 bg-background/80 p-6 text-sm text-muted-foreground">
                            Pick a node to edit its label, prompt, and upload/reference behavior.
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border/50 bg-card/70 p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Run State</p>
                <h2 className="mt-2 text-2xl font-bold">Execution</h2>
              </div>
              {phase === "running" ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
            </div>

            <div className="mt-6 space-y-4">
              {hasSessionRunner ? (
                <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent Runs</p>
                      <p className="mt-1 text-sm text-muted-foreground">Compact history. Expand only the runs you actually want to inspect.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadRecentRuns()} disabled={loadingRecentRuns}>
                      {loadingRecentRuns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Refresh
                    </Button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recentRuns.length === 0 ? (
                      <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-4 text-sm text-muted-foreground">
                        No saved runs yet for this account.
                      </div>
                    ) : (
                      recentRuns.map((run) => (
                        <Collapsible key={run.id} open={!!expandedRuns[run.id]} onOpenChange={(open) => setRunExpanded(run.id, open)}>
                          <div className="rounded-2xl border border-border/30 bg-background/70">
                            <CollapsibleTrigger asChild>
                              <button type="button" className="flex w-full items-start justify-between gap-3 p-3 text-left">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {run.templateName}
                                    {run.versionNumber ? ` v${run.versionNumber}` : ""}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatTimestamp(run.startedAt)} · {formatRunDuration(run.startedAt, run.completedAt)}
                                  </p>
                                  <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                                    {run.reviewStatus}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{run.status}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{run.outputs.length} outputs</p>
                                  </div>
                                  {expandedRuns[run.id] ? (
                                    <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </button>
                            </CollapsibleTrigger>

                            <CollapsibleContent className="border-t border-border/20 px-3 pb-3 pt-3">
                              {run.outputs.length ? (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                  {run.outputs.slice(0, 4).map((output) => (
                                    <a
                                      key={`${run.id}-${output.url}`}
                                      href={output.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 rounded-xl border border-border/30 bg-background/80 p-2"
                                    >
                                      {output.type === "image" ? (
                                        <img src={output.url} alt={output.label} className="h-20 w-16 rounded-lg object-cover" />
                                      ) : (
                                        <video src={output.url} className="h-20 w-16 rounded-lg object-cover" muted />
                                      )}
                                    </a>
                                  ))}
                                </div>
                              ) : null}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => void fetchJobStatus(run.id)}>
                                  Open Results
                                </Button>
                                {run.outputs[0] ? (
                                  <Button asChild type="button" size="sm" variant="ghost">
                                    <a href={run.outputs[0].url} target="_blank" rel="noreferrer">
                                      Open First Output
                                    </a>
                                  </Button>
                                ) : null}
                              </div>

                              {run.error ? <p className="mt-2 text-xs text-destructive">{run.error}</p> : null}
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium uppercase tracking-wide">{job?.status ?? phase}</span>
                </div>
                {job?.template && canManageTemplates ? (
                  <div className="mt-3 rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Run Detail</p>
                    <p className="mt-1 text-sm font-medium">{job.template.templateName} v{job.template.versionNumber ?? "?"}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                      {job.template.reviewStatus}
                    </p>
                  </div>
                ) : null}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job?.progress ?? (phase === "complete" ? 100 : 0)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{jobId ? `Job ${jobId.slice(0, 8)}...` : phase === "running" ? "Starting run..." : "No job started yet"}</span>
                  <span>{job?.progress ?? 0}%</span>
                </div>
              </div>

              {job?.template && canManageTemplates ? (
                <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Template Contract</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">User Uploads</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {job.template.inputs.map((input) => (
                          <span key={input.id} className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-foreground/80">
                            {input.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Hidden Refs</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {job.template.hiddenRefs.length ? (
                          job.template.hiddenRefs.map((ref) => (
                            <span key={ref.nodeId} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100">
                              {ref.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <span>{error}</span>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {(job?.steps ?? []).map((step) => (
                  <div key={step.id} className="rounded-2xl border border-border/40 bg-background/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{step.label}</p>
                        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{step.type}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {step.status === "complete" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                        {step.status === "running" ? <RefreshCw className="h-4 w-4 animate-spin text-primary" /> : null}
                        {step.status === "failed" ? <AlertCircle className="h-4 w-4 text-destructive" /> : null}
                        <span className="uppercase tracking-wide">{step.status}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="uppercase tracking-[0.15em]">Elapsed</p>
                        <p className="mt-1 text-sm text-foreground">{formatDuration(step.executionTimeMs)}</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="uppercase tracking-[0.15em]">Est. Cost</p>
                        <p className="mt-1 text-sm text-foreground">{formatUsd(step.telemetry?.estimatedCostUsd)}</p>
                      </div>
                    </div>
                    {canManageTemplates && step.prompt ? (
                      <div className="mt-3 rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Prompt</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{step.prompt}</p>
                      </div>
                    ) : null}
                    {canManageTemplates && step.sourceInputs.length ? (
                      <div className="mt-3 rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Sources</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {step.sourceInputs.map((source) => (
                            <span
                              key={`${step.id}-${source.sourceNodeId}-${source.targetParam ?? "none"}`}
                              className={`rounded-full border px-2 py-1 text-[11px] ${
                                source.isHiddenReference ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-border/40 text-foreground/80"
                              }`}
                            >
                              {source.sourceName}
                              {source.targetParam ? ` -> ${source.targetParam}` : ""}
                              {source.isHiddenReference ? " · hidden" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {canManageTemplates && Object.keys(step.inputPayload ?? {}).length ? (
                      <div className="mt-3 rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Step Inputs</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(step.inputPayload).map(([key, value]) => (
                            <span key={`${step.id}-${key}`} className="rounded-full border border-border/40 px-2 py-1 text-[11px] text-foreground/80">
                              {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {step.telemetry?.billingUnit ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Billing: {step.telemetry.billingQuantity ?? 1} {step.telemetry.billingUnit}
                        {step.telemetry.unitPriceUsd != null ? ` at $${step.telemetry.unitPriceUsd.toFixed(4)} each` : ""}
                      </p>
                    ) : null}
                    {step.telemetry?.falDurationSeconds != null ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Provider runtime: {step.telemetry.falDurationSeconds.toFixed(2)} s
                      </p>
                    ) : null}
                    {step.error ? <p className="mt-2 text-xs text-destructive">{step.error}</p> : null}
                  </div>
                ))}
              </div>

              {outputImages.length ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Generated Images · {outputImages.length}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {outputImages.map((output, index) => (
                      <div key={`${output.url}-${index}`} className="space-y-2 rounded-2xl border border-border/40 bg-background/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">{output.label || `Image ${index + 1}`}</p>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                              9:16
                            </span>
                            <Button asChild size="sm" variant="outline">
                              <a href={output.url} download={`template-output-${index + 1}.png`}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </a>
                            </Button>
                          </div>
                        </div>
                        <div className="mx-auto max-w-[280px] rounded-[28px] border border-border/40 bg-background/80 p-2 shadow-sm">
                          <img
                            src={output.url}
                            alt={output.label || `Generated image ${index + 1}`}
                            className="w-full rounded-[22px] border border-border/40"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {outputVideos.length ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Generated Videos · {outputVideos.length}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {outputVideos.map((output, index) => (
                      <div key={`${output.url}-${index}`} className="space-y-2 rounded-2xl border border-border/40 bg-background/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">{output.label || `Video ${index + 1}`}</p>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                              9:16
                            </span>
                            <Button asChild size="sm" variant="outline">
                              <a href={output.url} download={`template-output-${index + 1}.mp4`}>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </a>
                            </Button>
                          </div>
                        </div>
                        <div className="mx-auto max-w-[280px] rounded-[28px] border border-border/40 bg-background/80 p-2 shadow-sm">
                          <video src={output.url} controls playsInline className="w-full rounded-[22px] border border-border/40" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TemplateLab;
