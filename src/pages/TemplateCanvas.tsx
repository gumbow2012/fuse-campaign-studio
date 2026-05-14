import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Film, GitBranch, Loader2, Maximize2, Minus, Move, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  MAX_TEMPLATE_BRANCHES,
  MAX_TEMPLATE_INPUTS,
  canAdvanceTemplateBuilder,
  clampTemplateBranchCount,
  clampTemplateInputCount,
  resolveTemplateBranchInputIndex,
} from "@/lib/templateBuilder";

type TemplateInput = {
  id: string;
  name: string;
  expected: string;
  defaultAssetUrl: string | null;
};

type ActivationGate = {
  publishable: boolean;
  reasons: string[];
  completedRunCount: number;
  approvedAuditCount: number;
  blockingOutputReportCount: number;
  latestCompletedJobId: string | null;
  latestApprovedJobId: string | null;
  latestApprovedAt: string | null;
};

type TemplateOption = {
  templateId: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  reviewStatus: string;
  isActive: boolean;
  counts: {
    inputs: number;
    imageOutputs: number;
    videoOutputs: number;
    edges?: number;
    total?: number;
  };
  inputs: TemplateInput[];
  activationGate?: ActivationGate | null;
};

type WorkbenchCatalogVersion = {
  id: string;
  version_number: number;
  review_status?: string | null;
  is_active?: boolean | null;
  counts?: {
    inputs?: number;
    images?: number;
    videos?: number;
    edges?: number;
    total?: number;
  };
  activationGate?: ActivationGate | null;
};

type WorkbenchCatalogTemplate = {
  id: string;
  name: string;
  versions?: WorkbenchCatalogVersion[];
};

type LabCatalogTemplate = {
  templateId: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  reviewStatus?: string | null;
  counts?: {
    inputs?: number;
    imageOutputs?: number;
    videoOutputs?: number;
    edges?: number;
  };
};

type TemplateDetailNode = {
  id: string;
  nodeNumber?: number;
  outputNumber?: number | null;
  rawName: string;
  name: string;
  nodeType: string;
  prompt: string | null;
  expected: string | null;
  defaultAssetId: string | null;
  defaultAssetUrl: string | null;
  incoming: Array<{
    edgeId?: string;
    sourceNodeId: string;
    sourceName: string;
    sourceType: string;
    targetParam: string | null;
  }>;
  summary: string;
  editor?: {
    mode: "upload" | "reference";
    slotKey: string | null;
    label: string | null;
    expected: string | null;
    outputExposed?: boolean | null;
    sampleUrl?: string | null;
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
  edges: Array<{
    id?: string;
    sourceNodeId: string;
    targetNodeId: string;
    targetParam: string | null;
  }>;
};

type JobStatus = {
  status: string;
  progress: number;
  error: string | null;
  outputs: Array<{ label: string; type: "image" | "video"; url: string; outputNumber?: number }>;
};

type RecentRun = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  templateId: string | null;
  outputs: JobStatus["outputs"];
};

type Point = { x: number; y: number };
type NodeDraft = {
  displayLabel: string;
  expected: string;
  prompt: string;
  editorMode: "upload" | "reference";
  slotKey: string;
  sampleUrl: string;
  outputExposed: boolean | null;
};

type NewNodeKind = NodeDraft["editorMode"] | "image_gen" | "video_gen";
type TemplateWizardStep = "setup" | "branches";

type TemplateInputSlotDraft = {
  id: string;
  slotKey: string;
};

type TemplateInputSlotOption = {
  key: string;
  label: string;
  targetParam: string;
  expected: string;
};

type TemplateReferenceDraft = {
  id: string;
  inputSlotId: string;
  inputSlotKey: string;
  label: string;
  prompt: string;
  imagePrompt: string;
  videoPrompt: string;
  file: File | null;
  previewUrl: string | null;
};

const NODE_WIDTH = 288;
const NODE_HEIGHT = 188;
const DEFAULT_CANVAS_ZOOM = 0.9;
const MIN_CANVAS_ZOOM = 0.45;
const MAX_CANVAS_ZOOM = 1.5;
const CANVAS_PADDING_X = 96;
const CANVAS_PADDING_Y = 104;
const LANE_GAP = 430;
const ROW_GAP = 258;
const LANE_WIDTH = 340;
const LANE_HEADER_HEIGHT = 62;
const LAYOUT_PREFIX = "fuse-template-canvas-layout-v1";
const LANE_KEYS = ["uploads", "references", "images", "videos", "other"] as const;
const LANE_LABELS: Record<(typeof LANE_KEYS)[number], string> = {
  uploads: "User Uploads",
  references: "Hidden References",
  images: "Image Steps",
  videos: "Video Steps",
  other: "Other",
};
const LANE_DESCRIPTIONS: Record<(typeof LANE_KEYS)[number], string> = {
  uploads: "Customer supplied assets",
  references: "Admin-only guide assets",
  images: "Generated image steps",
  videos: "Generated video steps",
  other: "Unclassified graph nodes",
};
const LANE_STYLES: Record<(typeof LANE_KEYS)[number], string> = {
  uploads: "border-cyan-300/20 bg-cyan-300/[0.035]",
  references: "border-amber-300/20 bg-amber-300/[0.035]",
  images: "border-emerald-300/20 bg-emerald-300/[0.035]",
  videos: "border-rose-300/20 bg-rose-300/[0.035]",
  other: "border-slate-300/15 bg-slate-300/[0.025]",
};

const TEMPLATE_INPUT_SLOT_OPTIONS: TemplateInputSlotOption[] = [
  { key: "top_garment", label: "Top Garment", targetParam: "top_garment_image", expected: "image" },
  { key: "bottom_garment", label: "Bottom Garment", targetParam: "bottom_garment_image", expected: "image" },
  { key: "logo", label: "Logo", targetParam: "logo_image", expected: "image" },
  { key: "head_accessory", label: "Head Accessory", targetParam: "head_accessory_image", expected: "image" },
  { key: "footwear", label: "Footwear", targetParam: "footwear_image", expected: "image" },
  { key: "model_reference", label: "Model Reference", targetParam: "model_reference_image", expected: "image" },
  { key: "scene_reference", label: "Scene Reference", targetParam: "scene_reference_image", expected: "image" },
  { key: "product_image", label: "Product Image", targetParam: "product_image", expected: "image" },
];

const DEFAULT_TEMPLATE_INPUT_SLOT_KEYS = ["top_garment", "bottom_garment", "logo"];

function inputSlotOption(slotKey: string) {
  return TEMPLATE_INPUT_SLOT_OPTIONS.find((option) => option.key === slotKey) ?? TEMPLATE_INPUT_SLOT_OPTIONS[0];
}

function imagePromptForInput(label: string, hasGuide = false) {
  return `Create a polished campaign image using the uploaded ${label.toLowerCase()}${hasGuide ? " and the hidden guide image" : ""}.`;
}

function compactText(value: string | null | undefined, maxLength = 150) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No prompt captured.";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function nodeKindLabel(node: TemplateDetailNode) {
  if (node.nodeType === "video_gen") return "Video model";
  if (node.nodeType === "image_gen") return "Image model";
  if (node.editor?.mode === "upload") return "Upload input";
  if (node.editor?.mode === "reference") return "Reference asset";
  return node.nodeType.replace("_", " ");
}

function sourcePreview(node: TemplateDetailNode) {
  if (!node.incoming.length) return "No upstream source";
  return compactText(
    node.incoming
      .map((edge) => edge.targetParam ? `${edge.sourceName} -> ${edge.targetParam}` : edge.sourceName)
      .join(", "),
    96,
  );
}

function promptPreview(node: TemplateDetailNode) {
  if (node.prompt) return compactText(node.prompt, 170);
  if (node.nodeType === "user_input") return compactText(node.editor?.expected || node.expected || "Runtime image input", 110);
  return compactText(node.summary, 140);
}

function layoutKey(versionId: string) {
  return `${LAYOUT_PREFIX}:${versionId}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function createTemplateReferenceDraft(index: number, inputSlot?: TemplateInputSlotDraft): TemplateReferenceDraft {
  const slot = inputSlot ? inputSlotOption(inputSlot.slotKey) : TEMPLATE_INPUT_SLOT_OPTIONS[index % TEMPLATE_INPUT_SLOT_OPTIONS.length];
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    inputSlotId: inputSlot?.id ?? `input-${index}`,
    inputSlotKey: slot.key,
    label: `${slot.label} Guide`,
    prompt: "",
    imagePrompt: imagePromptForInput(slot.label),
    videoPrompt: "Animate this image into a short fashion ad with natural motion and premium pacing.",
    file: null,
    previewUrl: null,
  };
}

function createTemplateInputSlotDraft(index: number): TemplateInputSlotDraft {
  return {
    id: `${Date.now()}-input-${index}-${Math.random().toString(36).slice(2)}`,
    slotKey: DEFAULT_TEMPLATE_INPUT_SLOT_KEYS[index] ?? TEMPLATE_INPUT_SLOT_OPTIONS[index % TEMPLATE_INPUT_SLOT_OPTIONS.length].key,
  };
}

function createDefaultTemplateInputSlots() {
  return DEFAULT_TEMPLATE_INPUT_SLOT_KEYS.map((_, index) => createTemplateInputSlotDraft(index));
}

function laneForNode(node: TemplateDetailNode): (typeof LANE_KEYS)[number] {
  if (node.nodeType === "user_input") {
    if (node.editor?.mode === "upload") return "uploads";
    if (node.editor?.mode === "reference") return "references";
    return "other";
  }
  if (node.nodeType === "image_gen") return "images";
  if (node.nodeType === "video_gen") return "videos";
  return "other";
}

function curve(from: Point, to: Point) {
  const delta = Math.max(120, Math.abs(to.x - from.x) * 0.42);
  return `M ${from.x} ${from.y} C ${from.x + delta} ${from.y}, ${to.x - delta} ${to.y}, ${to.x} ${to.y}`;
}

function defaultPosition(laneIndex: number, nodeIndex: number): Point {
  return {
    x: CANVAS_PADDING_X + laneIndex * LANE_GAP,
    y: CANVAS_PADDING_Y + nodeIndex * ROW_GAP,
  };
}

const TemplateCanvas = () => {
  const { session, hasAppAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NodeDraft | null>(null);
  const [savingNode, setSavingNode] = useState(false);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadingLatestOutputs, setLoadingLatestOutputs] = useState(false);
  const [startingRun, setStartingRun] = useState(false);
  const [mutating, setMutating] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [templateWizardStep, setTemplateWizardStep] = useState<TemplateWizardStep>("setup");
  const [newTemplateInputSlots, setNewTemplateInputSlots] = useState<TemplateInputSlotDraft[]>(createDefaultTemplateInputSlots);
  const [newTemplateReferences, setNewTemplateReferences] = useState<TemplateReferenceDraft[]>(() => {
    const slots = createDefaultTemplateInputSlots();
    return slots.map((slot, index) => createTemplateReferenceDraft(index, slot));
  });
  const [cloneTemplateName, setCloneTemplateName] = useState("");
  const [addNodeType, setAddNodeType] = useState<NewNodeKind>("upload");
  const [addNodeName, setAddNodeName] = useState("");
  const [addNodeExpected, setAddNodeExpected] = useState("image");
  const [addNodePrompt, setAddNodePrompt] = useState("");
  const [edgeDraft, setEdgeDraft] = useState({ sourceNodeId: "", targetNodeId: "", targetParam: "" });
  const [referenceUploadFile, setReferenceUploadFile] = useState<File | null>(null);
  const [referenceUploadPreview, setReferenceUploadPreview] = useState<string | null>(null);
  const [uploadingReference, setUploadingReference] = useState(false);
  const dragRef = useRef<{ nodeId: string; origin: Point; start: Point } | null>(null);
  const positionsRef = useRef<Record<string, Point>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [isPanning, setIsPanning] = useState(false);
  const [showInternalNodes, setShowInternalNodes] = useState(false);
  const [showRunnerPanel, setShowRunnerPanel] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const invokeWorkbench = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-template-workbench`, {
      method: "POST",
      headers: {
        ...(await buildAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Template workbench request failed");
    return data;
  }, [buildAuthHeaders]);

  const loadCatalogFallback = useCallback(async () => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lab-template-catalog`, {
      headers: await buildAuthHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Could not load template catalog");

    return {
      templates: ((data.templates ?? []) as LabCatalogTemplate[]).map((template) => ({
        id: template.templateId,
        name: template.templateName,
        versions: [{
          id: template.versionId,
          version_number: template.versionNumber,
          review_status: template.reviewStatus ?? "Unreviewed",
          is_active: true,
          counts: {
            inputs: template.counts?.inputs ?? 0,
            images: template.counts?.imageOutputs ?? 0,
            videos: template.counts?.videoOutputs ?? 0,
            edges: template.counts?.edges ?? 0,
            total:
              Number(template.counts?.inputs ?? 0) +
              Number(template.counts?.imageOutputs ?? 0) +
              Number(template.counts?.videoOutputs ?? 0),
          },
          activationGate: null,
        }],
      })),
    };
  }, [buildAuthHeaders]);

  const loadTemplates = useCallback(async () => {
    if (!hasAppAccess) return;
    setLoadingTemplates(true);
    try {
      let data;
      try {
        data = await invokeWorkbench({ action: "catalog" });
      } catch {
        data = await loadCatalogFallback();
      }
      const catalog = data as { templates?: WorkbenchCatalogTemplate[] };
      const nextTemplates = (catalog.templates ?? []).flatMap((template) =>
        (template.versions ?? []).map((version) => ({
          templateId: template.id,
          templateName: template.name,
          versionId: version.id,
          versionNumber: version.version_number,
          reviewStatus: version.review_status ?? "Unreviewed",
          isActive: version.is_active === true,
          counts: {
            inputs: Number(version.counts?.inputs ?? 0),
            imageOutputs: Number(version.counts?.images ?? 0),
            videoOutputs: Number(version.counts?.videos ?? 0),
            edges: Number(version.counts?.edges ?? 0),
            total: Number(version.counts?.total ?? 0),
          },
          inputs: [],
          activationGate: version.activationGate ?? null,
        })),
      );
      setTemplates(nextTemplates);
      const urlVersionId = searchParams.get("versionId");
      setSelectedVersionId((current) =>
        (urlVersionId && nextTemplates.some((template: TemplateOption) => template.versionId === urlVersionId))
          ? urlVersionId
          : current || nextTemplates.find((template: TemplateOption) => template.isActive)?.versionId || nextTemplates[0]?.versionId || ""
      );
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load templates";
      toast({ title: "Canvas error", description: message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  }, [hasAppAccess, invokeWorkbench, loadCatalogFallback, searchParams]);

  const loadDetail = useCallback(async (versionId: string) => {
    if (!versionId) {
      setDetail(null);
      return;
    }

    setLoadingDetail(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lab-template-detail?versionId=${encodeURIComponent(versionId)}`,
        { headers: await buildAuthHeaders() },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load template detail");
      setDetail(data);
      setSelectedNodeId((current) => current && data.nodes.some((node: TemplateDetailNode) => node.id === current) ? current : data.nodes?.[0]?.id ?? null);
    } catch (detailError) {
      const message = detailError instanceof Error ? detailError.message : "Could not load template detail";
      toast({ title: "Canvas error", description: message, variant: "destructive" });
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [buildAuthHeaders]);

  const fetchJobStatus = useCallback(async (nextJobId: string, runVersionId?: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${encodeURIComponent(nextJobId)}`,
      { headers: await buildAuthHeaders() },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Could not load job status");
    setJobId(nextJobId);
    setJob(data);
    setPhase(data.status === "complete" ? "complete" : data.status === "failed" ? "error" : "running");
    if (data.status === "complete" && runVersionId) void loadTemplates();
    setError(data.error ?? null);
    return data as JobStatus;
  }, [buildAuthHeaders, loadTemplates]);

  const loadLatestOutputsForVersion = useCallback(async (versionId: string) => {
    if (!versionId || !session?.access_token) return;
    setLoadingLatestOutputs(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-recent-runs?limit=20`,
        { headers: await buildAuthHeaders() },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load recent outputs");

      const latest = (data.jobs ?? []).find((run: RecentRun) => run.templateId === versionId) as RecentRun | undefined;
      if (!latest) return;

      setJobId(latest.id);
      setJob({
        status: latest.status,
        progress: latest.progress ?? 0,
        error: latest.error ?? null,
        outputs: latest.outputs ?? [],
      });
      setPhase(latest.status === "complete" ? "complete" : latest.status === "failed" ? "error" : "running");
      setError(latest.error ?? null);
    } catch (latestError) {
      const message = latestError instanceof Error ? latestError.message : "Could not load recent outputs";
      toast({ title: "Output history error", description: message, variant: "destructive" });
    } finally {
      setLoadingLatestOutputs(false);
    }
  }, [buildAuthHeaders, session?.access_token]);

  const pollJob = useCallback((nextJobId: string, runVersionId?: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchJobStatus(nextJobId, runVersionId);
        if (data.status === "complete" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (pollError) {
        const message = pollError instanceof Error ? pollError.message : "Could not refresh run";
        setPhase("error");
        setError(message);
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  }, [fetchJobStatus]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void loadDetail(selectedVersionId);
  }, [loadDetail, selectedVersionId]);

  useEffect(() => {
    void loadLatestOutputsForVersion(selectedVersionId);
  }, [loadLatestOutputsForVersion, selectedVersionId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    const current = searchParams.get("versionId");
    if (current === selectedVersionId) return;
    const next = new URLSearchParams(searchParams);
    next.set("versionId", selectedVersionId);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedVersionId, setSearchParams]);

  useEffect(() => {
    if (!detail?.versionId) return;
    const raw = window.localStorage.getItem(layoutKey(detail.versionId));
    if (!raw) {
      setPositions({});
      return;
    }
    try {
      setPositions(JSON.parse(raw));
    } catch {
      setPositions({});
    }
  }, [detail?.versionId]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    setCanvasZoom(DEFAULT_CANVAS_ZOOM);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      scrollRef.current.scrollTop = 0;
    }
  }, [detail?.versionId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.versionId === selectedVersionId) ?? null,
    [selectedVersionId, templates],
  );

  const versionOptions = useMemo(() => {
    if (!selectedTemplate) return [];
    return templates
      .filter((template) => template.templateId === selectedTemplate.templateId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }, [selectedTemplate, templates]);

  const primaryTemplateOptions = useMemo(() => {
    const primaryByTemplate = new Map<string, TemplateOption>();
    for (const template of templates) {
      const current = primaryByTemplate.get(template.templateId);
      const shouldReplace = !current ||
        (template.isActive && (!current.isActive || template.versionNumber > current.versionNumber)) ||
        (!current.isActive && !template.isActive && template.versionNumber > current.versionNumber);

      if (shouldReplace) {
        primaryByTemplate.set(template.templateId, template);
      }
    }
    return [...primaryByTemplate.values()].sort((a, b) => a.templateName.localeCompare(b.templateName));
  }, [templates]);

  const validationQueue = primaryTemplateOptions;

  const queueIndex = useMemo(
    () => validationQueue.findIndex((template) => template.templateId === selectedTemplate?.templateId),
    [selectedTemplate?.templateId, validationQueue],
  );

  const handlePrimaryTemplateSelect = useCallback((templateId: string) => {
    const primary = primaryTemplateOptions.find((template) => template.templateId === templateId);
    if (primary) setSelectedVersionId(primary.versionId);
  }, [primaryTemplateOptions]);

  const goToQueueTemplate = useCallback((direction: -1 | 1) => {
    if (!validationQueue.length) return;
    const currentIndex = queueIndex >= 0 ? queueIndex : 0;
    const nextIndex = (currentIndex + direction + validationQueue.length) % validationQueue.length;
    setSelectedVersionId(validationQueue[nextIndex].versionId);
  }, [queueIndex, validationQueue]);

  const runInputs = useMemo(() => {
    if (!detail) return [];
    const slots = new Map<string, TemplateInput>();
    detail.nodes
      .filter((node) => node.nodeType === "user_input" && node.editor?.mode === "upload")
      .forEach((node) => {
        const id = node.editor?.slotKey || node.id;
        if (slots.has(id)) return;
        slots.set(id, {
          id,
          name: node.editor?.label || node.name,
          expected: node.editor?.expected || node.expected || "image",
          defaultAssetUrl: node.defaultAssetUrl,
        });
      });
    return [...slots.values()];
  }, [detail]);

  const selectedNode = useMemo(
    () => detail?.nodes.find((node) => node.id === selectedNodeId) ?? detail?.nodes[0] ?? null,
    [detail?.nodes, selectedNodeId],
  );

  useEffect(() => {
    if (!selectedNode) {
      setDraft(null);
      return;
    }
    setDraft({
      displayLabel: selectedNode.editor?.label ?? selectedNode.name,
      expected: selectedNode.editor?.expected ?? selectedNode.expected ?? "",
      prompt: selectedNode.prompt ?? "",
      editorMode: selectedNode.editor?.mode ?? "upload",
      slotKey: selectedNode.editor?.slotKey ?? "",
      sampleUrl: selectedNode.editor?.sampleUrl ?? selectedNode.defaultAssetUrl ?? "",
      outputExposed: typeof selectedNode.editor?.outputExposed === "boolean" ? selectedNode.editor.outputExposed : null,
    });
  }, [selectedNode]);

  useEffect(() => {
    setReferenceUploadFile(null);
    setReferenceUploadPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
  }, [selectedNode?.id]);

  const graphNodes = useMemo(() => {
    if (!detail) return [];
    const visibleLanes = showInternalNodes
      ? LANE_KEYS
      : LANE_KEYS.filter((lane) => lane !== "references");
    const buckets = new Map<(typeof LANE_KEYS)[number], TemplateDetailNode[]>();
    for (const lane of visibleLanes) buckets.set(lane, []);
    for (const node of detail.nodes) {
      if (!showInternalNodes && laneForNode(node) === "references") continue;
      buckets.get(laneForNode(node))?.push(node);
    }

    const next: Array<TemplateDetailNode & { lane: string; position: Point }> = [];
    visibleLanes.forEach((lane, laneIndex) => {
      const laneNodes = (buckets.get(lane) ?? []).sort((a, b) => {
        const numberDelta = Number(a.nodeNumber ?? 9999) - Number(b.nodeNumber ?? 9999);
        if (numberDelta !== 0) return numberDelta;
        return a.name.localeCompare(b.name);
      });
      laneNodes.forEach((node, index) => {
        next.push({
          ...node,
          lane,
          position: positions[node.id] ?? defaultPosition(laneIndex, index),
        });
      });
    });
    return next;
  }, [detail, positions, showInternalNodes]);

  const nodeMap = useMemo(() => new Map(graphNodes.map((node) => [node.id, node])), [graphNodes]);

  const laneStats = useMemo(() => {
    const stats = new Map<(typeof LANE_KEYS)[number], number>();
    for (const lane of LANE_KEYS) stats.set(lane, 0);
    for (const node of graphNodes) {
      stats.set(node.lane as (typeof LANE_KEYS)[number], (stats.get(node.lane as (typeof LANE_KEYS)[number]) ?? 0) + 1);
    }
    return stats;
  }, [graphNodes]);

  const canvasSize = useMemo(() => {
    const visibleLaneCount = showInternalNodes ? LANE_KEYS.length : LANE_KEYS.length - 1;
    const laneWidth = CANVAS_PADDING_X * 2 + (visibleLaneCount - 1) * LANE_GAP + Math.max(LANE_WIDTH, NODE_WIDTH);
    if (!graphNodes.length) return { width: Math.max(2200, laneWidth), height: 980 };
    const maxX = Math.max(...graphNodes.map((node) => node.position.x + NODE_WIDTH));
    const maxY = Math.max(...graphNodes.map((node) => node.position.y + NODE_HEIGHT));
    return {
      width: Math.max(2200, laneWidth, maxX + CANVAS_PADDING_X),
      height: Math.max(980, maxY + 160),
    };
  }, [graphNodes, showInternalNodes]);

  const graphSummary = useMemo(() => {
    const allNodes = detail?.nodes ?? [];
    const outputs = allNodes.filter((node) => node.outputNumber).length;
    return {
      nodes: allNodes.length,
      edges: detail?.edges.length ?? 0,
      outputs,
      uploads: allNodes.filter((node) => node.nodeType === "user_input" && node.editor?.mode === "upload").length,
      references: allNodes.filter((node) => node.nodeType === "user_input" && node.editor?.mode === "reference").length,
    };
  }, [detail?.edges.length, detail?.nodes]);

  const graphValidation = useMemo(() => {
    const allNodes = detail?.nodes ?? [];
    const missingReferenceAssets = allNodes.filter((node) =>
      node.nodeType === "user_input" &&
      node.editor?.mode === "reference" &&
      !node.defaultAssetUrl
    );
    const missingPrompts = allNodes.filter((node) =>
      (node.nodeType === "image_gen" || node.nodeType === "video_gen") &&
      !node.prompt
    );
    const disconnectedSteps = allNodes.filter((node) =>
      (node.nodeType === "image_gen" || node.nodeType === "video_gen") &&
      !node.incoming.length
    );
    const issues = [
      ...missingReferenceAssets.map((node) => `Node ${node.nodeNumber ?? "?"}: add reference/sample image URL`),
      ...missingPrompts.map((node) => `Node ${node.nodeNumber ?? "?"}: prompt is empty`),
      ...disconnectedSteps.map((node) => `Node ${node.nodeNumber ?? "?"}: no incoming source`),
    ];
    if (!allNodes.length) {
      issues.push("No nodes in this version yet");
    }
    if (allNodes.length && !allNodes.some((node) => node.outputNumber)) {
      issues.push("No final deliverable output is exposed");
    }
    return {
      issues,
      ready: issues.length === 0 && allNodes.length > 0,
    };
  }, [detail?.nodes]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!dragRef.current) return;
    const deltaX = (event.clientX - dragRef.current.start.x) / canvasZoom;
    const deltaY = (event.clientY - dragRef.current.start.y) / canvasZoom;
    setPositions((current) => {
      const next = {
        ...current,
        [dragRef.current!.nodeId]: {
          x: Math.max(32, dragRef.current!.origin.x + deltaX),
          y: Math.max(76, dragRef.current!.origin.y + deltaY),
        },
      };
      positionsRef.current = next;
      return next;
    });
  }, [canvasZoom]);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current || !detail?.versionId) return;
    window.localStorage.setItem(layoutKey(detail.versionId), JSON.stringify(positionsRef.current));
    dragRef.current = null;
    setDraggingId(null);
  }, [detail?.versionId]);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const startDrag = useCallback((nodeId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    event.preventDefault();
    dragRef.current = {
      nodeId,
      origin: node.position,
      start: { x: event.clientX, y: event.clientY },
    };
    setDraggingId(nodeId);
  }, [nodeMap]);

  const zoomCanvas = useCallback((delta: number) => {
    setCanvasZoom((current) => Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number((current + delta).toFixed(2)))));
  }, []);

  const resetZoom = useCallback(() => {
    setCanvasZoom(DEFAULT_CANVAS_ZOOM);
  }, []);

  const fitCanvas = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      setCanvasZoom(MIN_CANVAS_ZOOM);
      return;
    }
    const widthZoom = (scrollEl.clientWidth - 32) / canvasSize.width;
    const heightZoom = (scrollEl.clientHeight - 32) / canvasSize.height;
    setCanvasZoom(Math.max(MIN_CANVAS_ZOOM, Math.min(1, Number(Math.min(widthZoom, heightZoom).toFixed(2)))));
    scrollEl.scrollLeft = 0;
    scrollEl.scrollTop = 0;
  }, [canvasSize.height, canvasSize.width]);

  const startCanvasPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-node-card], button, input, textarea, select, a")) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
    };
    setIsPanning(true);
    scrollEl.setPointerCapture(event.pointerId);
  }, []);

  const moveCanvasPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.x);
    scrollRef.current.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.y);
  }, []);

  const endCanvasPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    setIsPanning(false);
    if (scrollRef.current?.hasPointerCapture(event.pointerId)) {
      scrollRef.current.releasePointerCapture(event.pointerId);
    }
  }, []);

  const saveLayout = useCallback(() => {
    if (!detail?.versionId) return;
    window.localStorage.setItem(layoutKey(detail.versionId), JSON.stringify(positions));
    toast({ title: "Layout saved", description: "Canvas positions stored locally." });
  }, [detail?.versionId, positions]);

  const resetLayout = useCallback(() => {
    if (!detail?.versionId) return;
    window.localStorage.removeItem(layoutKey(detail.versionId));
    setPositions({});
    positionsRef.current = {};
    toast({ title: "Auto layout restored", description: "Nodes are back in spaced lanes." });
  }, [detail?.versionId]);

  const setTemplateInputCount = useCallback((nextValue: number) => {
    const nextCount = clampTemplateInputCount(nextValue);
    setNewTemplateInputSlots((current) => {
      const next = current.slice(0, nextCount);
      while (next.length < nextCount) {
        next.push(createTemplateInputSlotDraft(next.length));
      }
      setNewTemplateReferences((currentReferences) => {
        return currentReferences.map((reference, index) => {
          const existingSlot = next.find((slot) => slot.id === reference.inputSlotId);
          if (existingSlot) return { ...reference, inputSlotKey: existingSlot.slotKey };

          const fallbackSlot = next[index % next.length] ?? next[0];
          const fallbackOption = inputSlotOption(fallbackSlot.slotKey);
          return {
            ...reference,
            inputSlotId: fallbackSlot.id,
            inputSlotKey: fallbackOption.key,
          };
        });
      });
      return next;
    });
  }, []);

  const setTemplateBranchCount = useCallback((nextValue: number) => {
    const nextCount = clampTemplateBranchCount(nextValue);
    setNewTemplateReferences((current) => {
      const next = current.slice(0, nextCount);
      current.slice(nextCount).forEach((reference) => {
        if (reference.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(reference.previewUrl);
      });
      while (next.length < nextCount) {
        const slot = newTemplateInputSlots[next.length % newTemplateInputSlots.length] ?? newTemplateInputSlots[0];
        next.push(createTemplateReferenceDraft(next.length, slot));
      }
      return next;
    });
  }, [newTemplateInputSlots]);

  const setTemplateInputSlot = useCallback((slotId: string, slotKey: string) => {
    setNewTemplateInputSlots((current) =>
      current.map((slot) => slot.id === slotId ? { ...slot, slotKey } : slot),
    );
    const option = inputSlotOption(slotKey);
    setNewTemplateReferences((current) =>
      current.map((reference) => reference.inputSlotId === slotId
        ? {
            ...reference,
            inputSlotKey: option.key,
            label: `${option.label} Guide`,
            imagePrompt: imagePromptForInput(option.label, Boolean(reference.file)),
          }
        : reference,
      ),
    );
  }, []);

  const setTemplateBranchInput = useCallback((referenceId: string, slotId: string) => {
    const slot = newTemplateInputSlots.find((item) => item.id === slotId);
    if (!slot) return;
    const option = inputSlotOption(slot.slotKey);
    setNewTemplateReferences((current) =>
      current.map((reference) => {
        if (reference.id !== referenceId) return reference;
        const shouldRefreshLabel = !reference.label.trim() || reference.label.endsWith(" Guide");
        return {
          ...reference,
          inputSlotId: slot.id,
          inputSlotKey: option.key,
          label: shouldRefreshLabel ? `${option.label} Guide` : reference.label,
          imagePrompt: reference.imagePrompt.trim()
            ? reference.imagePrompt
            : imagePromptForInput(option.label, Boolean(reference.file)),
        };
      }),
    );
  }, [newTemplateInputSlots]);

  const handleNewTemplateReferenceFile = useCallback((referenceId: string, file: File | null) => {
    setNewTemplateReferences((current) =>
      current.map((reference) => {
        if (reference.id !== referenceId) return reference;
        if (reference.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(reference.previewUrl);
        return {
          ...reference,
          file,
          previewUrl: file ? URL.createObjectURL(file) : null,
        };
      }),
    );
  }, []);

  const handleReferenceUploadFile = useCallback((file: File | null) => {
    if (referenceUploadPreview?.startsWith("blob:")) URL.revokeObjectURL(referenceUploadPreview);
    setReferenceUploadFile(file);
    setReferenceUploadPreview(file ? URL.createObjectURL(file) : null);
  }, [referenceUploadPreview]);

  const handleFile = useCallback((inputId: string, nextFile: File | null) => {
    setFiles((current) => ({ ...current, [inputId]: nextFile }));
    setPreviews((current) => {
      const next = { ...current };
      if (next[inputId]?.startsWith("blob:")) URL.revokeObjectURL(next[inputId]);
      if (nextFile) next[inputId] = URL.createObjectURL(nextFile);
      else delete next[inputId];
      return next;
    });
  }, []);

  const handleRun = useCallback(async () => {
    if (!detail) return;

    const missing = runInputs.find((input) => !input.defaultAssetUrl && !files[input.id]);
    if (missing) {
      toast({ title: "Missing input", description: `${missing.name} still needs an image.`, variant: "destructive" });
      return;
    }

    setStartingRun(true);
    setPhase("running");
    setJob(null);
    setJobId(null);
    setError(null);

    try {
      const inputFiles = Object.fromEntries(
        await Promise.all(
          runInputs
            .filter((input) => files[input.id])
            .map(async (input) => {
              const file = files[input.id]!;
              return [
                input.name,
                {
                  filename: file.name,
                  dataUrl: await fileToDataUrl(file),
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
          versionId: detail.versionId,
          inputFiles,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not start template");
      setJobId(data.jobId);
      void fetchJobStatus(data.jobId, detail.versionId);
      pollJob(data.jobId, detail.versionId);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Could not start template";
      setPhase("error");
      setError(message);
      toast({ title: "Run failed", description: message, variant: "destructive" });
    } finally {
      setStartingRun(false);
    }
  }, [buildAuthHeaders, detail, fetchJobStatus, files, pollJob, runInputs]);

  const saveNode = useCallback(async () => {
    if (!detail || !selectedNode || !draft) return;
    setSavingNode(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: detail.versionId,
          nodeId: selectedNode.id,
          displayLabel: draft.displayLabel,
          expected: draft.expected,
          prompt: draft.prompt,
          editorMode: selectedNode.nodeType === "user_input" ? draft.editorMode : null,
          slotKey: selectedNode.nodeType === "user_input" ? draft.slotKey : null,
          sampleUrl: selectedNode.nodeType === "user_input" ? draft.sampleUrl : null,
          outputExposed: selectedNode.nodeType === "image_gen" || selectedNode.nodeType === "video_gen" ? draft.outputExposed : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not save node");
      await loadDetail(detail.versionId);
      await loadTemplates();
      toast({ title: "Node saved", description: "Template metadata updated." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save node";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSavingNode(false);
    }
  }, [buildAuthHeaders, detail, draft, loadDetail, loadTemplates, selectedNode]);

  const uploadReferenceAsset = useCallback(async () => {
    if (!detail || !selectedNode || !draft || !referenceUploadFile) return;
    if (selectedNode.nodeType !== "user_input" || draft.editorMode !== "reference") {
      toast({ title: "Pick a hidden reference input first", variant: "destructive" });
      return;
    }

    setUploadingReference(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: detail.versionId,
          nodeId: selectedNode.id,
          displayLabel: draft.displayLabel,
          expected: draft.expected,
          editorMode: "reference",
          slotKey: draft.slotKey,
          referenceFile: {
            filename: referenceUploadFile.name,
            dataUrl: await fileToDataUrl(referenceUploadFile),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not upload reference");
      handleReferenceUploadFile(null);
      await loadDetail(detail.versionId);
      await loadTemplates();
      toast({
        title: "Reference attached",
        description: data?.asset?.id ? `Asset ${String(data.asset.id).slice(0, 8)} saved to the template.` : "Hidden asset saved to the template.",
      });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Could not upload reference";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploadingReference(false);
    }
  }, [buildAuthHeaders, detail, draft, handleReferenceUploadFile, loadDetail, loadTemplates, referenceUploadFile, selectedNode]);

  const refreshAfterMutation = useCallback(async (versionId?: string) => {
    await loadTemplates();
    if (versionId) setSelectedVersionId(versionId);
    await loadDetail(versionId ?? selectedVersionId);
  }, [loadDetail, loadTemplates, selectedVersionId]);

  const createTemplate = useCallback(async () => {
    const name = newTemplateName.trim();
    if (!name) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    setMutating("create-template");
    try {
      const inputSlotIds = newTemplateInputSlots.map((slot) => slot.id);
      const referenceAssets = await Promise.all(newTemplateReferences.map(async (reference, index) => {
        const inputSlotIndex = resolveTemplateBranchInputIndex(inputSlotIds, reference.inputSlotId, index);
        const resolvedSlot = newTemplateInputSlots[inputSlotIndex] ?? newTemplateInputSlots[0];
        const resolvedOption = inputSlotOption(resolvedSlot?.slotKey ?? reference.inputSlotKey);
        return {
          label: reference.label,
          prompt: reference.prompt,
          inputSlotKey: resolvedOption.key,
          inputSlotIndex,
          imagePrompt: reference.imagePrompt,
          videoPrompt: reference.videoPrompt,
          file: reference.file
            ? {
                filename: reference.file.name,
                dataUrl: await fileToDataUrl(reference.file),
              }
            : null,
        };
      }));
      const inputSlots = newTemplateInputSlots.map((slot) => {
        const option = inputSlotOption(slot.slotKey);
        return {
          key: option.key,
          label: option.label,
          expected: option.expected,
          targetParam: option.targetParam,
        };
      });
      const data = await invokeWorkbench({
        action: "create_template",
        name,
        description: newTemplateDescription,
        withStarterGraph: true,
        starterPreset: "reference",
        inputSlots,
        outputCount: newTemplateReferences.length,
        referenceAssets,
      });
      setNewTemplateName("");
      setNewTemplateDescription("");
      setTemplateWizardStep("setup");
      const resetSlots = createDefaultTemplateInputSlots();
      setNewTemplateInputSlots(resetSlots);
      setNewTemplateReferences((current) => {
        current.forEach((reference) => {
          if (reference.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(reference.previewUrl);
        });
        return resetSlots.map((slot, index) => createTemplateReferenceDraft(index, slot));
      });
      setShowRunnerPanel(true);
      setPhase("idle");
      setJob(null);
      setJobId(null);
      setError(null);
      await refreshAfterMutation(data.versionId);
      toast({ title: "Template created", description: `${name} v1 is in testing. Run it once before publishing.` });
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Could not create template";
      toast({ title: "Create failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [
    invokeWorkbench,
    newTemplateDescription,
    newTemplateInputSlots,
    newTemplateName,
    newTemplateReferences,
    refreshAfterMutation,
  ]);

  const cloneCurrentVersion = useCallback(async (asNewTemplate: boolean) => {
    if (!detail) return;
    const newName = cloneTemplateName.trim();
    if (asNewTemplate && !newName) {
      toast({ title: "New template name required", variant: "destructive" });
      return;
    }
    setMutating(asNewTemplate ? "clone-template" : "clone-version");
    try {
      const data = await invokeWorkbench({
        action: "clone_version",
        sourceVersionId: detail.versionId,
        targetTemplateId: asNewTemplate ? undefined : detail.templateId,
        newTemplateName: asNewTemplate ? newName : undefined,
        newTemplateDescription: asNewTemplate ? `Copied from ${detail.templateName} v${detail.versionNumber}` : undefined,
        makeActive: false,
      });
      setCloneTemplateName("");
      await refreshAfterMutation(data.versionId);
      toast({
        title: asNewTemplate ? "Template copied as draft" : "Draft version cloned",
        description: `Now editing v${data.versionNumber}. Publish it after validation.`,
      });
    } catch (cloneError) {
      const message = cloneError instanceof Error ? cloneError.message : "Could not clone template";
      toast({ title: "Clone failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [cloneTemplateName, detail, invokeWorkbench, refreshAfterMutation]);

  const activateCurrentVersion = useCallback(async () => {
    if (!detail) return;
    const gate = selectedTemplate?.activationGate ?? null;
    if (gate && !gate.publishable) {
      setShowRunnerPanel(true);
      toast({
        title: "Publish gate blocked",
        description: gate.reasons[0] ?? "Complete a run and save an approved output audit before publishing.",
        variant: "destructive",
      });
      return;
    }
    setMutating("activate-version");
    try {
      await invokeWorkbench({ action: "activate_version", versionId: detail.versionId });
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Version activated", description: `${detail.templateName} v${detail.versionNumber} is now live.` });
    } catch (activateError) {
      const message = activateError instanceof Error ? activateError.message : "Could not activate version";
      toast({ title: "Activate failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation, selectedTemplate?.activationGate]);

  const addNode = useCallback(async () => {
    if (!detail) return;
    const isInput = addNodeType === "upload" || addNodeType === "reference";
    setMutating("add-node");
    try {
      await invokeWorkbench({
        action: "add_node",
        versionId: detail.versionId,
        nodeType: isInput ? "user_input" : addNodeType,
        editorMode: isInput ? addNodeType : undefined,
        name: addNodeName || undefined,
        expected: addNodeExpected,
        prompt: addNodePrompt,
        outputExposed: addNodeType === "image_gen" || addNodeType === "video_gen",
      });
      setAddNodeName("");
      setAddNodeExpected("image");
      setAddNodePrompt("");
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Node added" });
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : "Could not add node";
      toast({ title: "Add node failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [addNodeExpected, addNodeName, addNodePrompt, addNodeType, detail, invokeWorkbench, refreshAfterMutation]);

  const deleteSelectedNode = useCallback(async () => {
    if (!selectedNode || !detail) return;
    const confirmed = window.confirm(`Delete node ${selectedNode.nodeNumber ?? ""} "${selectedNode.name}" and its connected edges?`);
    if (!confirmed) return;
    setMutating("delete-node");
    try {
      await invokeWorkbench({ action: "delete_node", nodeId: selectedNode.id });
      setSelectedNodeId(null);
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Node deleted" });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Could not delete node";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation, selectedNode]);

  const addEdge = useCallback(async (targetNodeId?: string) => {
    const resolvedTargetNodeId = targetNodeId || edgeDraft.targetNodeId;
    if (!detail || !edgeDraft.sourceNodeId || !resolvedTargetNodeId) {
      toast({ title: "Pick source and target nodes", variant: "destructive" });
      return;
    }
    setMutating("add-edge");
    try {
      await invokeWorkbench({
        action: "add_edge",
        versionId: detail.versionId,
        sourceNodeId: edgeDraft.sourceNodeId,
        targetNodeId: resolvedTargetNodeId,
        targetParam: edgeDraft.targetParam,
      });
      setEdgeDraft({ sourceNodeId: "", targetNodeId: "", targetParam: "" });
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Edge added" });
    } catch (edgeError) {
      const message = edgeError instanceof Error ? edgeError.message : "Could not add edge";
      toast({ title: "Add edge failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, edgeDraft, invokeWorkbench, refreshAfterMutation]);

  const deleteEdge = useCallback(async (edgeId: string | undefined) => {
    if (!edgeId || !detail) return;
    setMutating(`delete-edge:${edgeId}`);
    try {
      await invokeWorkbench({ action: "delete_edge", edgeId });
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Edge deleted" });
    } catch (edgeError) {
      const message = edgeError instanceof Error ? edgeError.message : "Could not delete edge";
      toast({ title: "Delete edge failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation]);

  const wizardSteps: Array<{ id: TemplateWizardStep; label: string }> = [
    { id: "setup", label: "Setup" },
    { id: "branches", label: "Branches" },
  ];
  const wizardStepIndex = wizardSteps.findIndex((step) => step.id === templateWizardStep);
  const wizardProgress = ((wizardStepIndex + 1) / wizardSteps.length) * 100;
  const hasTemplateName = canAdvanceTemplateBuilder("setup", newTemplateName);
  const selectedPublishGate = selectedTemplate?.activationGate ?? null;
  const testingGateActive = !!detail && !detail.isActive;
  const testingGateSatisfied = !testingGateActive || selectedPublishGate?.publishable === true;
  const publishGateReasons = selectedPublishGate?.reasons?.length
    ? selectedPublishGate.reasons
    : ["Complete a run and save an approved audit before publishing."];
  const publishRunComplete = (selectedPublishGate?.completedRunCount ?? 0) > 0;
  const publishAuditApproved = (selectedPublishGate?.approvedAuditCount ?? 0) > 0;
  const publishBlockingOutputCount = selectedPublishGate?.blockingOutputReportCount ?? 0;
  const publishAuditHref = selectedPublishGate?.latestCompletedJobId
    ? `/admin/audits?jobId=${selectedPublishGate.latestCompletedJobId}`
    : detail
    ? `/admin/audits?versionId=${detail.versionId}`
    : "/admin/audits";
  const publishSteps = [
    {
      label: "1",
      title: "Run test inputs",
      complete: publishRunComplete,
      active: !publishRunComplete,
      detail: publishRunComplete
        ? `${selectedPublishGate?.completedRunCount ?? 0} completed test run${(selectedPublishGate?.completedRunCount ?? 0) === 1 ? "" : "s"}.`
        : "Upload real inputs and run this draft once.",
    },
    {
      label: "2",
      title: "Review outputs",
      complete: publishRunComplete && publishBlockingOutputCount === 0,
      active: publishRunComplete && publishBlockingOutputCount > 0,
      detail: publishBlockingOutputCount
        ? `${publishBlockingOutputCount} open or bad output report${publishBlockingOutputCount === 1 ? "" : "s"} left.`
        : "No blocking output issues are attached.",
    },
    {
      label: "3",
      title: "Approve audit",
      complete: publishAuditApproved,
      active: publishRunComplete && publishBlockingOutputCount === 0 && !publishAuditApproved,
      detail: publishAuditApproved
        ? `${selectedPublishGate?.approvedAuditCount ?? 0} approved audit${(selectedPublishGate?.approvedAuditCount ?? 0) === 1 ? "" : "s"} saved.`
        : "Save a Good audit with score 75+.",
    },
    {
      label: "4",
      title: "Publish live",
      complete: testingGateSatisfied,
      active: testingGateActive && !detail?.isActive && selectedPublishGate?.publishable === true,
      detail: testingGateSatisfied
        ? "This draft can be pushed live."
        : "Unlocks after testing and approval.",
    },
  ];
  const goWizard = (direction: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min(wizardSteps.length - 1, wizardStepIndex + direction));
    setTemplateWizardStep(wizardSteps[nextIndex].id);
  };
  const goNextWizard = () => {
    if (!canAdvanceTemplateBuilder(templateWizardStep, newTemplateName)) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    goWizard(1);
  };
  const selectWizardStep = (stepId: TemplateWizardStep) => {
    if (stepId === "branches" && !hasTemplateName) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    setTemplateWizardStep(stepId);
  };

  return (
    <SiteShell>
      <div className="mx-auto flex w-full max-w-[1900px] flex-col gap-5 px-4 py-6 sm:px-5 xl:px-8">
        <section className="w-full">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Canvas</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Template Canvas</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Internal-only graph surface for live template creation, edits, validation, and testing.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:flex">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadTemplates()} disabled={loadingTemplates}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingTemplates ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={saveLayout} disabled={!detail}>
                <Save className="mr-2 h-4 w-4" />
                Save Layout
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={resetLayout} disabled={!detail}>
                Auto Layout
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-border/50 bg-card/70 p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Create New Template</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">Draft Builder</h2>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1">{newTemplateInputSlots.length} inputs</span>
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1">{newTemplateReferences.length} branches</span>
                <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1">{newTemplateReferences.filter((reference) => reference.file).length} guide images</span>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span>Step {wizardStepIndex + 1} / {wizardSteps.length}</span>
                <span>{wizardSteps[wizardStepIndex]?.label}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${wizardProgress}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {wizardSteps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => selectWizardStep(step.id)}
                    className={`h-10 rounded-xl border px-3 text-center text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      templateWizardStep === step.id
                        ? "border-primary/50 bg-primary text-primary-foreground"
                        : index < wizardStepIndex
                        ? "border-border/60 bg-background/70 text-foreground"
                        : "border-border/50 bg-background/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="mr-2 text-[10px] opacity-70">{index + 1}</span>
                    {step.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="min-h-[320px] rounded-3xl border border-border/50 bg-background/45 p-4">
                {templateWizardStep === "setup" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                      <div className="space-y-2">
                        <Label>Template Name</Label>
                        <Input
                          value={newTemplateName}
                          onChange={(event) => setNewTemplateName(event.target.value)}
                          placeholder="Template name"
                          className="h-12 rounded-2xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          value={newTemplateDescription}
                          onChange={(event) => setNewTemplateDescription(event.target.value)}
                          placeholder="Optional"
                          className="h-12 rounded-2xl"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 rounded-2xl border border-border/50 bg-card/70 p-4 md:grid-cols-2">
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                        <div>
                          <Label>Inputs</Label>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{newTemplateInputSlots.length} user upload slot{newTemplateInputSlots.length === 1 ? "" : "s"}</p>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_TEMPLATE_INPUTS}
                          value={newTemplateInputSlots.length}
                          onChange={(event) => setTemplateInputCount(Number(event.target.value))}
                          className="h-11 w-20 rounded-xl"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border/50 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                        <div>
                          <Label>Branches</Label>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">{newTemplateReferences.length} output path{newTemplateReferences.length === 1 ? "" : "s"}</p>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_TEMPLATE_BRANCHES}
                          value={newTemplateReferences.length}
                          onChange={(event) => setTemplateBranchCount(Number(event.target.value))}
                          className="h-11 w-20 rounded-xl"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {newTemplateInputSlots.map((slot, index) => (
                        <div key={slot.id} className="rounded-2xl border border-border/50 bg-card/70 p-3">
                          <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Input {index + 1}</Label>
                          <select
                            value={slot.slotKey}
                            onChange={(event) => setTemplateInputSlot(slot.id, event.target.value)}
                            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                          >
                            {TEMPLATE_INPUT_SLOT_OPTIONS.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {templateWizardStep === "branches" ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-card/70 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <Label>Output Branches</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Branches are outputs. Pick a source upload for each branch; hidden guide images are optional.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Horizontal snap
                        </span>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_TEMPLATE_BRANCHES}
                          value={newTemplateReferences.length}
                          onChange={(event) => setTemplateBranchCount(Number(event.target.value))}
                          className="h-9 w-20 rounded-xl"
                          aria-label="Branch count"
                        />
                      </div>
                    </div>
                    <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3">
                    {newTemplateReferences.map((reference, index) => (
                      <div key={reference.id} className="w-[min(86vw,540px)] shrink-0 snap-start rounded-2xl border border-border/50 bg-card/70 p-3 md:w-[520px] xl:w-[560px]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Branch {index + 1}</p>
                            <h3 className="mt-1 font-semibold">{inputSlotOption(reference.inputSlotKey).label}</h3>
                          </div>
                          <div className="flex shrink-0 gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            <span className="rounded-md border border-cyan-300/30 px-1.5 py-1">Input</span>
                            <span className="rounded-md border border-amber-300/30 px-1.5 py-1">Guide</span>
                            <span className="rounded-md border border-emerald-300/30 px-1.5 py-1">Image</span>
                            <span className="rounded-md border border-rose-300/30 px-1.5 py-1">Video</span>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 rounded-xl border border-border/50 bg-background/45 p-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                          <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Source upload</Label>
                          <select
                            value={reference.inputSlotId}
                            onChange={(event) => setTemplateBranchInput(reference.id, event.target.value)}
                            className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm"
                          >
                            {newTemplateInputSlots.map((slot, slotIndex) => (
                              <option key={slot.id} value={slot.id}>
                                {slotIndex + 1}. {inputSlotOption(slot.slotKey).label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                          <div className="min-w-0">
                            {reference.previewUrl ? (
                              <img src={reference.previewUrl} alt={reference.label} className="aspect-[9/16] max-h-[250px] w-full rounded-xl border border-border/50 bg-background object-contain" />
                            ) : (
                              <div className="flex aspect-[9/16] max-h-[250px] w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/50 px-3 text-center text-xs text-muted-foreground">
                                Optional guide image
                              </div>
                            )}
                            <div className="mt-2 flex gap-2">
                              <label className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-2 text-xs font-medium transition hover:border-primary/50 hover:text-foreground">
                                <Upload className="h-4 w-4" />
                                {reference.file ? "Replace" : "Add guide"}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(event) => handleNewTemplateReferenceFile(reference.id, event.target.files?.[0] ?? null)}
                                />
                              </label>
                              <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => handleNewTemplateReferenceFile(reference.id, null)} title="Clear guide">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid min-w-0 gap-2">
                            <Input
                              value={reference.label}
                              onChange={(event) =>
                                setNewTemplateReferences((current) =>
                                  current.map((item) => item.id === reference.id ? { ...item, label: event.target.value } : item),
                                )
                              }
                              className="h-9 rounded-xl"
                              placeholder={`${inputSlotOption(reference.inputSlotKey).label} guide label`}
                            />
                            <Textarea
                              value={reference.prompt}
                              onChange={(event) =>
                                setNewTemplateReferences((current) =>
                                  current.map((item) => item.id === reference.id ? { ...item, prompt: event.target.value } : item),
                                )
                              }
                              placeholder="Hidden guide instruction for this branch"
                              className="min-h-[58px] rounded-xl text-xs"
                            />
                            <Textarea
                              value={reference.imagePrompt}
                              onChange={(event) =>
                                setNewTemplateReferences((current) =>
                                  current.map((item) => item.id === reference.id ? { ...item, imagePrompt: event.target.value } : item),
                                )
                              }
                              placeholder="Image generation prompt for this input branch"
                              className="min-h-[76px] rounded-xl text-xs"
                            />
                            <Textarea
                              value={reference.videoPrompt}
                              onChange={(event) =>
                                setNewTemplateReferences((current) =>
                                  current.map((item) => item.id === reference.id ? { ...item, videoPrompt: event.target.value } : item),
                                )
                              }
                              placeholder="Video generation prompt from this image output"
                              className="min-h-[76px] rounded-xl text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex gap-2">
                  <Button type="button" variant="outline" onClick={() => goWizard(-1)} disabled={wizardStepIndex <= 0 || !!mutating}>
                    Back
                  </Button>
                  {templateWizardStep === "branches" ? (
                    <Button type="button" className="flex-1" onClick={() => void createTemplate()} disabled={!!mutating || !hasTemplateName}>
                      {mutating === "create-template" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Create Draft
                    </Button>
                  ) : (
                    <Button type="button" className="flex-1" onClick={goNextWizard} disabled={!!mutating || !hasTemplateName}>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {testingGateActive ? (
            <div className={`mt-5 rounded-3xl border p-5 shadow-sm ${
              testingGateSatisfied
                ? "border-emerald-400/30 bg-emerald-400/[0.08]"
                : "border-amber-300/30 bg-amber-300/[0.08]"
            }`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Testing Phase</p>
                  <p className="mt-2 text-base font-semibold text-foreground">
                    Validate this draft before it can go live.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {testingGateSatisfied
                      ? "The publish gate is clear. You can publish this version live now."
                      : publishGateReasons[0]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowRunnerPanel(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Run Test Inputs
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to={publishAuditHref}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Open Output Audit
                    </Link>
                  </Button>
                  {testingGateSatisfied && detail && !detail.isActive ? (
                    <Button type="button" size="sm" onClick={() => void activateCurrentVersion()} disabled={!!mutating}>
                      {mutating === "activate-version" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Publish Live
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                {publishSteps.map((step) => (
                  <div
                    key={step.title}
                    className={`rounded-2xl border bg-background/45 p-3 ${
                      step.complete
                        ? "border-emerald-400/30"
                        : step.active
                        ? "border-cyan-300/35"
                        : "border-border/50 opacity-75"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black ${
                        step.complete
                          ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
                          : step.active
                          ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                          : "border-border/60 bg-card/70 text-muted-foreground"
                      }`}>
                        {step.complete ? <CheckCircle2 className="h-4 w-4" /> : step.label}
                      </span>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {step.complete ? "Done" : step.active ? "Current" : "Locked"}
                      </p>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-3xl border border-border/50 bg-card/70 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Manage Templates</p>
            <div className="mt-4 grid gap-4 xl:grid-cols-12">
            <div className="rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm xl:col-span-5">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Manage Existing Template</p>
              <div className="mt-3 space-y-3">
            <Label>Template</Label>
            <select
              value={selectedTemplate?.templateId ?? ""}
              onChange={(event) => handlePrimaryTemplateSelect(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm"
              disabled={loadingTemplates || !primaryTemplateOptions.length}
            >
              {primaryTemplateOptions.map((template) => (
                <option key={template.templateId} value={template.templateId}>
                  {template.templateName} · v{template.versionNumber}{template.isActive ? " live" : " draft"} · {template.counts.inputs} in · {template.counts.imageOutputs + template.counts.videoOutputs} outputs
                </option>
              ))}
            </select>
            {versionOptions.length > 1 ? (
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Version</Label>
                <select
                  value={selectedVersionId}
                  onChange={(event) => setSelectedVersionId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm"
                >
                  {versionOptions.map((version) => (
                    <option key={version.versionId} value={version.versionId}>
                      v{version.versionNumber}{version.isActive ? " live" : " draft"} · {version.counts.inputs} in · {version.counts.imageOutputs} image · {version.counts.videoOutputs} video
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {validationQueue.length ? (
              <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Validation Queue</p>
                    <p className="mt-1 text-sm font-medium">
                      {queueIndex >= 0 ? `${queueIndex + 1} of ${validationQueue.length}` : `${validationQueue.length} templates`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToQueueTemplate(-1)} disabled={validationQueue.length < 2}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToQueueTemplate(1)} disabled={validationQueue.length < 2}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-border/40 bg-card/60 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Selected version</span>
                  <span className="font-semibold">
                    v{detail?.versionNumber ?? selectedTemplate?.versionNumber ?? "?"}{detail?.isActive || selectedTemplate?.isActive ? " live" : " draft"}
                  </span>
                </div>
              </div>
            ) : null}
              </div>
            </div>

          <div className="rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm xl:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Version Control</p>
            <div className="mt-3 grid gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void cloneCurrentVersion(false)} disabled={!detail || !!mutating}>
                <GitBranch className="mr-2 h-4 w-4" />
                Clone as New Version
              </Button>
              <div className="flex gap-2">
                <Input
                  value={cloneTemplateName}
                  onChange={(event) => setCloneTemplateName(event.target.value)}
                  placeholder="New template name"
                  className="h-9"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => void cloneCurrentVersion(true)} disabled={!detail || !!mutating}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {detail && !detail.isActive ? (
                <Button type="button" size="sm" onClick={() => void activateCurrentVersion()} disabled={!!mutating || !testingGateSatisfied}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Publish Version Live
                </Button>
              ) : null}
              {testingGateActive && !testingGateSatisfied ? (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100">
                  {publishGateReasons.join(" ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm xl:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Add Node</p>
            <div className="mt-3 grid gap-2">
              <select
                value={addNodeType}
                onChange={(event) => setAddNodeType(event.target.value as NewNodeKind)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="upload">User Upload</option>
                <option value="reference">Hidden Reference</option>
                <option value="image_gen">Image Step</option>
                <option value="video_gen">Video Step</option>
              </select>
              <div className="flex gap-2">
                <Input value={addNodeName} onChange={(event) => setAddNodeName(event.target.value)} placeholder="Node name" />
                <Button type="button" variant="outline" onClick={() => void addNode()} disabled={!detail || !!mutating}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Input value={addNodeExpected} onChange={(event) => setAddNodeExpected(event.target.value)} placeholder="Expected media / notes" />
              {(addNodeType === "image_gen" || addNodeType === "video_gen") ? (
                <Textarea
                  value={addNodePrompt}
                  onChange={(event) => setAddNodePrompt(event.target.value)}
                  placeholder="Plain English prompt for this generation step"
                  className="min-h-[86px]"
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/70 p-4 text-sm shadow-sm xl:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Readiness</p>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${graphValidation.ready ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200"}`}>
                {graphValidation.ready ? "Ready" : `${graphValidation.issues.length} issue${graphValidation.issues.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {graphValidation.issues.length ? graphValidation.issues.slice(0, 4).map((issue) => (
                <p key={issue} className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100/90">
                  {issue}
                </p>
              )) : (
                <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100/90">
                  Version has inputs, prompts, source edges, and exposed deliverables.
                </p>
              )}
            </div>
          </div>

          {detail ? (
            <div className="rounded-2xl border border-border/50 bg-card/70 p-4 shadow-sm xl:col-span-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Run Selected Template</p>
                  <p className="mt-1 text-xs text-muted-foreground">{runInputs.length} upload input{runInputs.length === 1 ? "" : "s"} required</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowRunnerPanel((current) => !current)}>
                  {showRunnerPanel ? "Hide" : "Open"}
                </Button>
              </div>
              {showRunnerPanel ? (
              <div className="mt-4 space-y-4">
                {runInputs.map((input) => (
                  <div key={input.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>{input.name}</Label>
                      <span className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{input.expected}</span>
                    </div>
                    {previews[input.id] ? (
                      <img src={previews[input.id]} alt={input.name} className="h-28 w-full rounded-2xl border border-border/50 bg-background object-contain" />
                    ) : input.defaultAssetUrl ? (
                      <img src={input.defaultAssetUrl} alt={`${input.name} default`} className="h-28 w-full rounded-2xl border border-border/50 bg-background object-contain" />
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-background/50 text-sm text-muted-foreground">
                        Upload image
                      </div>
                    )}
                    <div className="flex gap-2">
                      <label className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium transition hover:border-primary/50 hover:text-foreground">
                        <Upload className="h-4 w-4" />
                        {files[input.id] ? "Replace image" : "Upload image"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => handleFile(input.id, event.target.files?.[0] ?? null)}
                        />
                      </label>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleFile(input.id, null)}>Clear</Button>
                    </div>
                  </div>
                ))}
                {!runInputs.length ? (
                  <div className="rounded-xl border border-border/50 bg-background/60 p-3 text-sm text-muted-foreground">
                    This version has no user upload nodes.
                  </div>
                ) : null}
                <Button type="button" className="w-full" onClick={() => void handleRun()} disabled={startingRun}>
                  {startingRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                  Run From Canvas
                </Button>
              </div>
              ) : (
                <div className="mt-4 rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Keep this closed while editing the graph. Open it only when testing a live template run.
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground">Status</p>
                  <p className="mt-1 font-semibold uppercase text-foreground">{phase}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground">Job</p>
                  <p className="mt-1 font-mono text-foreground">{jobId ? jobId.slice(0, 8) : "none"}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                  <p className="text-muted-foreground">Outputs</p>
                  <p className="mt-1 font-semibold text-foreground">{job?.outputs.length ?? 0}</p>
                </div>
              </div>
              {error ? <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
              <div className="mt-4 rounded-2xl border border-border/50 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Latest Job Outputs</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {jobId ? `Job ${jobId.slice(0, 8)}` : "No job loaded"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadLatestOutputsForVersion(detail.versionId)}
                    disabled={loadingLatestOutputs}
                  >
                    {loadingLatestOutputs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                  {jobId ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/admin/audits?jobId=${jobId}`}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Audit
                      </Link>
                    </Button>
                  ) : null}
                </div>
                {job?.outputs.length ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {job.outputs.map((output) => (
                      <a
                        key={`${output.label}-${output.url}`}
                        href={output.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-2xl border border-border/50 bg-card/70 transition hover:border-primary/50"
                      >
                        <div className="aspect-[9/16] bg-background">
                          {output.type === "video" ? (
                            <video src={output.url} controls className="h-full w-full object-cover" />
                          ) : (
                            <img src={output.url} alt={output.label} className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {output.type} {output.outputNumber ? `#${output.outputNumber}` : ""}
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">{output.label}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-border/40 bg-background/50 p-3 text-xs text-muted-foreground">
                    No outputs loaded for this version yet. Click refresh after a run completes.
                  </div>
                )}
              </div>
            </div>
          ) : null}
          </div>
          </div>
        </section>

        <section className="min-w-0 rounded-3xl border border-border/50 bg-card/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 px-2 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Canvas</p>
              <h2 className="mt-2 text-2xl font-bold">{detail?.templateName ?? "Loading..."}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                ["Nodes", graphSummary.nodes],
                ["Edges", graphSummary.edges],
                ["Inputs", graphSummary.uploads],
                ["Refs", graphSummary.references],
                ["Outputs", graphSummary.outputs],
              ].map(([label, value]) => (
                <span key={label} className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{value}</span> {label}
                </span>
              ))}
              <div className="flex items-center rounded-full border border-border/60 bg-background/70 p-1">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => zoomCanvas(-0.1)} title="Zoom out">
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full px-2 text-xs" onClick={resetZoom} title="Reset zoom">
                  {Math.round(canvasZoom * 100)}%
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => zoomCanvas(0.1)} title="Zoom in">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={fitCanvas} title="Fit view">
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                type="button"
                variant={showInternalNodes ? "default" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setShowInternalNodes((current) => !current)}
              >
                {showInternalNodes ? "Hide Internals" : "Show Internals"}
              </Button>
              {loadingDetail ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
            </div>
          </div>
          <div
            ref={scrollRef}
            className={`h-[min(72vh,760px)] min-h-[520px] overflow-auto rounded-3xl border border-border/50 bg-background/60 ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={startCanvasPan}
            onPointerMove={moveCanvasPan}
            onPointerUp={endCanvasPan}
            onPointerCancel={endCanvasPan}
            onPointerLeave={endCanvasPan}
          >
            <div className="relative" style={{ width: canvasSize.width * canvasZoom, height: canvasSize.height * canvasZoom }}>
              <div
                className="absolute left-0 top-0"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `scale(${canvasZoom})`,
                  transformOrigin: "top left",
                }}
              >
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              {(showInternalNodes ? LANE_KEYS : LANE_KEYS.filter((lane) => lane !== "references")).map((lane, laneIndex) => {
                const left = CANVAS_PADDING_X + laneIndex * LANE_GAP - 28;
                return (
                  <div
                    key={lane}
                    className={`pointer-events-none absolute top-6 rounded-3xl border ${LANE_STYLES[lane]}`}
                    style={{
                      left,
                      width: LANE_WIDTH,
                      height: canvasSize.height - 56,
                    }}
                  >
                    <div className="sticky top-0 z-10 rounded-t-3xl border-b border-white/10 bg-background/85 px-4 py-3 backdrop-blur">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
                          {LANE_LABELS[lane]}
                        </p>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {laneStats.get(lane) ?? 0}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{LANE_DESCRIPTIONS[lane]}</p>
                    </div>
                  </div>
                );
              })}

              <svg className="pointer-events-none absolute inset-0 h-full w-full" width={canvasSize.width} height={canvasSize.height}>
                {graphNodes.map((node) =>
                  node.incoming.map((incoming) => {
                    const source = nodeMap.get(incoming.sourceNodeId);
                    if (!source) return null;
                    const from = { x: source.position.x + NODE_WIDTH, y: source.position.y + NODE_HEIGHT / 2 };
                    const to = { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
                    const midX = (from.x + to.x) / 2;
                    const midY = (from.y + to.y) / 2;
                    return (
                      <g key={`${incoming.sourceNodeId}-${node.id}-${incoming.targetParam ?? "flow"}`}>
                        <path d={curve(from, to)} fill="none" stroke="rgba(34,211,238,0.18)" strokeWidth="8" strokeLinecap="round" />
                        <path d={curve(from, to)} fill="none" stroke="rgba(125,211,252,0.62)" strokeWidth="2.5" strokeLinecap="round" />
                        {incoming.targetParam ? (
                          <text x={midX} y={midY - 8} fill="rgba(226,232,240,0.95)" fontSize="11" textAnchor="middle">
                            {incoming.targetParam}
                          </text>
                        ) : null}
                      </g>
                    );
                  }),
                )}
              </svg>

              {graphNodes.map((node) => (
                <div
                  data-node-card
                  key={node.id}
                  className={`absolute rounded-2xl border p-4 shadow-xl transition ${
                    selectedNode?.id === node.id
                      ? "border-cyan-300/70 bg-cyan-300/[0.12] shadow-cyan-950/30"
                      : "border-border/60 bg-card/95 shadow-black/20"
                  } ${draggingId === node.id ? "scale-[1.01] shadow-primary/30" : ""}`}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: NODE_WIDTH,
                    minHeight: NODE_HEIGHT,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedNodeId(node.id)}>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-1.5 text-xs font-bold text-primary">
                          {node.nodeNumber ?? "?"}
                        </span>
                        {node.outputNumber ? (
                          <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
                            Out {node.outputNumber}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 line-clamp-2 font-semibold leading-tight">{node.name}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{LANE_LABELS[laneForNode(node)]}</p>
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => startDrag(node.id, event)}
                      className="cursor-grab rounded-full border border-border/40 p-2 text-muted-foreground transition hover:border-primary/50 hover:text-foreground active:cursor-grabbing"
                      aria-label={`Move ${node.name}`}
                    >
                      <Move className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {node.defaultAssetUrl ? (
                    <img src={node.defaultAssetUrl} alt={node.name} className="mt-3 h-24 w-full rounded-2xl border border-border/50 bg-background object-contain" />
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-border/50 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {nodeKindLabel(node)}
                    </span>
                    {typeof node.editor?.outputExposed === "boolean" ? (
                      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${node.editor.outputExposed ? "border-primary/40 text-primary" : "border-border/50 text-muted-foreground"}`}>
                        {node.editor.outputExposed ? "Deliverable" : "Internal"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-xl border border-border/50 bg-background/65 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prompt</p>
                      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{node.incoming.length} in</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-foreground/85">{promptPreview(node)}</p>
                  </div>
                  <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">Source: {sourcePreview(node)}</p>
                </div>
              ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="w-full rounded-3xl border border-border/50 bg-card/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Inspector</p>
          {selectedNode && draft ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                      Node {selectedNode.nodeNumber ?? "?"}
                    </span>
                    {selectedNode.outputNumber ? (
                      <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-200">
                        Output {selectedNode.outputNumber}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 text-xl font-bold">{selectedNode.name}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.15em] text-muted-foreground">{selectedNode.rawName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border/60 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {selectedNode.nodeType.replace("_", " ")}
                  </span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => void deleteSelectedNode()} disabled={!!mutating} title="Delete node">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Display Label</Label>
                <Input value={draft.displayLabel} onChange={(event) => setDraft((current) => current ? { ...current, displayLabel: event.target.value } : current)} />
              </div>

              {selectedNode.nodeType === "user_input" ? (
                <>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <select
                      value={draft.editorMode}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                editorMode: event.target.value as NodeDraft["editorMode"],
                              }
                            : current,
                        )
                      }
                      className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm"
                    >
                      <option value="upload">User Upload</option>
                      <option value="reference">Hidden Reference</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Slot Key</Label>
                    <Input value={draft.slotKey} onChange={(event) => setDraft((current) => current ? { ...current, slotKey: event.target.value } : current)} />
                  </div>
                  {draft.editorMode === "reference" ? (
                    <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Hidden Reference Asset</Label>
                        {selectedNode.defaultAssetId ? (
                          <span className="font-mono text-[10px] text-muted-foreground">{selectedNode.defaultAssetId.slice(0, 8)}</span>
                        ) : null}
                      </div>
                      {referenceUploadPreview ? (
                        <img src={referenceUploadPreview} alt="Reference upload preview" className="h-32 w-full rounded-xl border border-border/50 bg-background object-contain" />
                      ) : selectedNode.defaultAssetUrl ? (
                        <img src={selectedNode.defaultAssetUrl} alt={selectedNode.name} className="h-32 w-full rounded-xl border border-border/50 bg-background object-contain" />
                      ) : (
                        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/50 text-xs text-muted-foreground">
                          No hidden asset attached
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input type="file" accept="image/*" onChange={(event) => handleReferenceUploadFile(event.target.files?.[0] ?? null)} />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => void uploadReferenceAsset()}
                          disabled={!referenceUploadFile || uploadingReference}
                          title="Upload hidden reference"
                        >
                          {uploadingReference ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Input
                        value={draft.sampleUrl}
                        onChange={(event) => setDraft((current) => current ? { ...current, sampleUrl: event.target.value } : current)}
                        placeholder="Fallback URL"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="space-y-2">
                <Label>Expected Media / Notes</Label>
                <Input value={draft.expected} onChange={(event) => setDraft((current) => current ? { ...current, expected: event.target.value } : current)} />
              </div>

              {selectedNode.nodeType !== "user_input" ? (
                <div className="space-y-2">
                  <Label>Prompt</Label>
                  <Textarea
                    value={draft.prompt}
                    onChange={(event) => setDraft((current) => current ? { ...current, prompt: event.target.value } : current)}
                    className="min-h-[180px]"
                  />
                </div>
              ) : null}

              {(selectedNode.nodeType === "image_gen" || selectedNode.nodeType === "video_gen") ? (
                <label className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.outputExposed === true}
                    onChange={(event) => setDraft((current) => current ? { ...current, outputExposed: event.target.checked } : current)}
                  />
                  Expose as final deliverable
                </label>
              ) : null}

              {selectedNode.defaultAssetUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Built-in Asset</Label>
                    {selectedNode.defaultAssetId ? (
                      <span className="font-mono text-[10px] text-muted-foreground">{selectedNode.defaultAssetId}</span>
                    ) : null}
                  </div>
                  <img src={selectedNode.defaultAssetUrl} alt={selectedNode.name} className="h-44 w-full rounded-2xl border border-border/50 object-cover" />
                </div>
              ) : null}

              {selectedNode.incoming.length ? (
                <div className="space-y-2">
                  <Label>Incoming</Label>
                  <div className="space-y-2">
                    {selectedNode.incoming.map((edge) => (
                      <div key={`${edge.edgeId ?? edge.sourceNodeId}-${edge.targetParam ?? "image"}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/50 px-4 py-3 text-sm">
                        <span>
                          {edge.sourceName}
                          {edge.targetParam ? ` -> ${edge.targetParam}` : ""}
                        </span>
                        <Button type="button" variant="ghost" size="icon" onClick={() => void deleteEdge(edge.edgeId)} disabled={!edge.edgeId || !!mutating} title="Delete edge">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail?.nodes.length ? (
                <div className="space-y-2">
                  <Label>Add Incoming Edge</Label>
                  <select
                    value={edgeDraft.sourceNodeId}
                    onChange={(event) => setEdgeDraft((current) => ({ ...current, sourceNodeId: event.target.value }))}
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Source node</option>
                    {detail.nodes
                      .filter((node) => node.id !== selectedNode.id)
                      .map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.nodeNumber ?? "?"}. {node.name}
                        </option>
                      ))}
                  </select>
                  <Input
                    value={edgeDraft.targetParam}
                    onChange={(event) => setEdgeDraft((current) => ({ ...current, targetParam: event.target.value }))}
                    placeholder="target param: image_1, start_frame_image"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void addEdge(selectedNode.id)}
                    disabled={!edgeDraft.sourceNodeId || !!mutating}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Connect to This Node
                  </Button>
                </div>
              ) : null}

              <Button type="button" className="w-full" onClick={() => void saveNode()} disabled={savingNode}>
                {savingNode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Node
              </Button>

              {job ? (
                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Latest Outputs</p>
                    <span className="text-sm font-medium uppercase">{job.status}</span>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {job.outputs.map((output) => (
                      <div key={`${output.label}-${output.url}`} className="rounded-2xl border border-border/50 bg-background/70 p-3">
                        <p className="text-sm font-medium">
                          Output {output.outputNumber ?? "?"}: {output.label}
                        </p>
                        {output.type === "video" ? (
                          <video src={output.url} controls className="mt-2 aspect-[9/16] w-full rounded-xl border border-border/50 bg-black object-cover" />
                        ) : (
                          <img src={output.url} alt={output.label} className="mt-2 aspect-[9/16] w-full rounded-xl border border-border/50 object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-border/50 bg-background/60 p-4 text-sm text-muted-foreground">
              Pick a node to inspect and edit it.
            </div>
          )}
        </aside>
      </div>
    </SiteShell>
  );
};

export default TemplateCanvas;
