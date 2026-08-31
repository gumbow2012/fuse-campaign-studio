import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Copy, EyeOff, Film, GitBranch, HelpCircle, Image as ImageIcon, Loader2, Maximize2, Minus, ImageDown, Layers, Move, Play, Plus, RefreshCw, Save, Search, Trash2, Type, Upload, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import TemplateGallery from "@/components/lab/TemplateGallery";
import GraphCanvas, { PORT_COLOR, type GraphCanvasNode, type GraphCanvasNodeData, type NodeRunState, type PortType } from "@/components/lab/GraphCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CANONICAL_REQUIRED_LABEL, isCanonicalReady } from "@/lib/canonicalPortrait";
import { useAuth } from "@/contexts/AuthContext";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { listFuseAvatars, listMyAvatars, type AvatarProfile } from "@/services/avatarProfiles";
import {
  MAX_TEMPLATE_BRANCHES,
  MAX_TEMPLATE_INPUTS,
  canAdvanceTemplateBuilder,
  clampTemplateBranchCount,
  clampTemplateInputCount,
  resolveTemplateBranchInputIndex,
} from "@/lib/templateBuilder";
import CastConfigPanel from "@/components/lab/CastConfigPanel";
import QuickPublishButton from "@/components/lab/QuickPublishButton";
import CreatorBuilderHelpPanel from "@/components/creator/CreatorBuilderHelpPanel";
import CreatorTutorialOverlay from "@/components/creator/CreatorTutorialOverlay";
import CreatorCustomerPreviewModal from "@/components/creator/CreatorCustomerPreviewModal";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { useCreatorTutorial } from "@/hooks/useCreatorTutorial";
import { track } from "@/lib/analytics/track";
import {
  CREATOR_NODE_HELP,
  CREATOR_PALETTE_LABELS,
  type CreatorNodeHelpKey,
} from "@/lib/creatorBuilderCopy";
import { parseCastConfig, type CastConfig } from "@/lib/castConfig";


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
  description: string | null;
  previewUrl: string | null;
  previewAssetType: "image" | "video" | null;
  versionId: string;
  versionNumber: number;
  reviewStatus: string;
  isActive: boolean;
  updatedAt: string | null;
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
  description?: string | null;
  preview_url?: string | null;
  preview_asset_type?: "image" | "video" | null;
  updated_at?: string | null;
  versions?: WorkbenchCatalogVersion[];
};

type WorkbenchResponse = Record<string, unknown> & {
  error?: string;
  activationGate?: ActivationGate | null;
};

type LabCatalogTemplate = {
  templateId: string;
  templateName: string;
  description?: string | null;
  previewUrl?: string | null;
  previewAssetType?: "image" | "video" | null;
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
    sortOrder?: number | null;
  }>;
  summary: string;
  editor?: {
    mode: "upload" | "reference";
    slotKey: string | null;
    label: string | null;
    expected: string | null;
    outputExposed?: boolean | null;
    videoModel?: string | null;
    duration?: number | null;
    resolution?: string | null;
    aspectRatio?: string | null;
    generateAudio?: boolean | null;
    sampleUrl?: string | null;
    isUserFacingInput?: boolean;
    isReferenceInput?: boolean;
    required?: boolean | null;
  };
};

type TemplateDetail = {
  templateId: string;
  templateName: string;
  versionId: string;
  versionNumber: number;
  reviewStatus: string;
  isActive: boolean;
  /** FT8 — additive cast metadata; null/absent = no casting (legacy). */
  castConfig?: CastConfig | null;
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
  required: boolean;
  sampleUrl: string;
  outputExposed: boolean | null;
  videoModel: VideoModelKey;
  duration: number;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
};

type VideoModelKey =
  | "kling-3.0-pro"
  | "kling-3.0-standard"
  | "kling-2.5"
  | "seedance-2.0"
  | "seedance-2.0-fast";

const VIDEO_MODEL_OPTIONS: Array<{
  key: VideoModelKey;
  label: string;
  family: "kling" | "kling3" | "seedance";
  usdPerSecond: number;
  usdPerSecondAudio?: number;
  resolutionMultiplier?: Record<string, number>;
}> = [
  {
    key: "kling-3.0-pro",
    label: "Kling 3.0 Pro",
    family: "kling3",
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
  },
  {
    key: "kling-3.0-standard",
    label: "Kling 3.0 Standard",
    family: "kling3",
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
  },
  { key: "kling-2.5", label: "Kling 2.5", family: "kling", usdPerSecond: 0.07 },
  {
    key: "seedance-2.0",
    label: "Seedance 2.0",
    family: "seedance",
    usdPerSecond: 0.3024,
    resolutionMultiplier: { "480p": 0.5, "720p": 1, "1080p": 1.8, "4k": 3.5 },
  },
  {
    key: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    family: "seedance",
    usdPerSecond: 0.2419,
    resolutionMultiplier: { "480p": 0.5, "720p": 1, "1080p": 1.8, "4k": 3.5 },
  },
];

const SEEDANCE_RESOLUTION_OPTIONS = ["480p", "720p", "1080p", "4k"];
const SEEDANCE_ASPECT_OPTIONS = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"];
const USD_PER_CREDIT = 0.098;

function resolveVideoModelOption(key: string | null | undefined) {
  return VIDEO_MODEL_OPTIONS.find((option) => option.key === key) ?? VIDEO_MODEL_OPTIONS[0];
}

function estimateVideoCredits(draft: {
  videoModel: VideoModelKey;
  duration: number;
  resolution: string;
  generateAudio: boolean;
}) {
  const option = resolveVideoModelOption(draft.videoModel);
  if (option.family === "kling") return Math.ceil((option.usdPerSecond * 5) / USD_PER_CREDIT);
  if (option.family === "kling3") {
    const perSecond = draft.generateAudio ? (option.usdPerSecondAudio ?? option.usdPerSecond) : option.usdPerSecond;
    const seconds = Math.min(15, Math.max(3, Number(draft.duration) || 5));
    return Math.ceil((perSecond * seconds) / USD_PER_CREDIT);
  }
  const multiplier = option.resolutionMultiplier?.[draft.resolution] ?? 1;
  const seconds = Math.min(15, Math.max(4, Number(draft.duration) || 4));
  return Math.ceil((option.usdPerSecond * multiplier * seconds) / USD_PER_CREDIT);
}

type RunNodeResult = {
  runId: string;
  nodeId: string;
  status: "queued" | "running" | "complete" | "failed";
  outputUrl?: string | null;
  outputType?: string | null;
  error?: string | null;
  estimatedCredits?: number | null;
  startedAt?: string | null;
};

type NewNodeKind = NodeDraft["editorMode"] | "image_gen" | "video_gen" | "prompt";
type TemplateWizardStep = "setup" | "branches";
type EdgeMoveDirection = -1 | 1;

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
const MAX_VISIBLE_CANVAS_EDGES = 24;
const LAYOUT_PREFIX = "fuse-template-canvas-layout-v1";
const LANE_KEYS = ["uploads", "references", "images", "videos", "other"] as const;
function portIdsForNode(
  nodeId: string,
  kind: GraphCanvasNodeData["kind"],
  incomingParams: Array<string | null | undefined>,
  extras: string[],
): string[] {
  if (kind !== "image" && kind !== "video") return [];
  const base = kind === "video" ? ["prompt", "start_frame_image"] : ["prompt", "image_1"];
  const ordered: string[] = [];
  for (const id of [...base, ...incomingParams.map((param) => (param ?? "").trim().toLowerCase()).filter(Boolean), ...extras]) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

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
  { key: "face", label: "Face", targetParam: "face_image", expected: "image" },
  { key: "grillz", label: "Grillz", targetParam: "grillz_image", expected: "image" },
  { key: "chain", label: "Chain", targetParam: "chain_image", expected: "image" },
  { key: "car", label: "Car", targetParam: "car_image", expected: "image" },
];

const DEFAULT_TEMPLATE_INPUT_SLOT_KEYS = ["top_garment", "bottom_garment", "logo"];

/** Slugify a label into a usable editor_slot_key. */
function slugifySlotKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Build a slot key that does not collide with any existing input slot key. */
function uniqueSlotKey(base: string, taken: Iterable<string>) {
  const used = new Set(Array.from(taken).map((key) => key.trim().toLowerCase()).filter(Boolean));
  const root = slugifySlotKey(base) || "input";
  if (!used.has(root)) return root;
  let index = 2;
  while (used.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
}

function inputSlotOption(slotKey: string) {
  return TEMPLATE_INPUT_SLOT_OPTIONS.find((option) => option.key === slotKey) ?? TEMPLATE_INPUT_SLOT_OPTIONS[0];
}

function toParamKey(value: string | null | undefined, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function imageParamFromSlot(slotKey: string | null | undefined, fallback: string) {
  const key = toParamKey(slotKey, fallback);
  return key.endsWith("_image") ? key : `${key}_image`;
}

function inferEdgeTargetParam(
  sourceNode: TemplateDetailNode | undefined,
  targetNode: TemplateDetailNode | undefined,
  incomingCount: number,
) {
  if (sourceNode?.nodeType === "prompt") return "prompt";
  if (targetNode?.nodeType === "video_gen") return "start_frame_image";
  if (targetNode?.nodeType !== "image_gen") return "image";

  const isHiddenReference = sourceNode?.nodeType === "user_input" &&
    (sourceNode.editor?.mode === "reference" || sourceNode.editor?.isReferenceInput === true);

  if (isHiddenReference) return "reference_image";
  if (sourceNode?.nodeType === "user_input") {
    return imageParamFromSlot(sourceNode.editor?.slotKey, `image_${incomingCount + 1}`);
  }

  return `image_${Math.max(1, incomingCount + 1)}`;
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

function nodeKind(node: { nodeType: string }): GraphCanvasNodeData["kind"] {
  if (node.nodeType === "user_input") return "input";
  if (node.nodeType === "prompt") return "prompt";
  if (node.nodeType === "image_gen") return "image";
  if (node.nodeType === "video_gen") return "video";
  return "other";
}

function nodeKindLabel(node: TemplateDetailNode) {
  if (node.nodeType === "prompt") return "Prompt block";
  if (node.nodeType === "video_gen") return "Video model";
  if (node.nodeType === "image_gen") return "Image model";
  if (node.editor?.mode === "upload") return "Upload input";
  if (node.editor?.mode === "reference") return "Reference asset";
  return node.nodeType.replace("_", " ");
}

/** Creator-mode helpers: friendly node names + plain-language help. */
function creatorNodeHelpKey(node: TemplateDetailNode): CreatorNodeHelpKey {
  if (node.nodeType === "prompt") return "prompt";
  if (node.nodeType === "video_gen") return "video";
  if (node.nodeType === "image_gen") return "image";
  if (node.editor?.mode === "reference") return "reference";
  return "input";
}

function creatorKindLabel(node: TemplateDetailNode) {
  const key = creatorNodeHelpKey(node);
  if (key === "input") return "Customer input";
  if (key === "reference") return "Reference asset";
  if (key === "prompt") return "Prompt";
  if (key === "image") return "Image step";
  return "Video step";
}

function creatorNodeHelpText(node: TemplateDetailNode) {
  return CREATOR_NODE_HELP[creatorNodeHelpKey(node)].body;
}

function sourcePreview(node: TemplateDetailNode) {
  if (!node.incoming.length) return "No upstream source";
  return compactText(
    [...new Set(node.incoming.map((edge) => edge.sourceName))].join(", "),
    96,
  );
}

function promptPreview(node: TemplateDetailNode) {
  if (node.prompt) return compactText(node.prompt, 170);
  if (node.nodeType === "prompt") return "Double-click to write this prompt";
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

/** Default name for a creator's auto-created first draft (renamed in Template Basics). */
const CREATOR_DEFAULT_TEMPLATE_NAME = "My First Template";



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
  const { session, hasAppAccess, isCreator, canUseBuilder, user, profile } = useAuth();
  const canPublishTemplates = hasAppAccess;
  /** Presentation switch only — every action stays server-authorized. */
  const isCreatorOnly = isCreator && !hasAppAccess;
  const [showCreatorHelp, setShowCreatorHelp] = useState(false);
  const [showCreatorOverflow, setShowCreatorOverflow] = useState(false);
  const [showTestCostConfirm, setShowTestCostConfirm] = useState(false);
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);
  const tutorial = useCreatorTutorial(isCreatorOnly);
  const tutorialRef = useRef(tutorial);
  tutorialRef.current = tutorial;
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
  const [castAvatars, setCastAvatars] = useState<AvatarProfile[]>([]);
  const [castLoading, setCastLoading] = useState(false);
  const [selectedCastAvatarId, setSelectedCastAvatarId] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [newTemplateCoverFile, setNewTemplateCoverFile] = useState<File | null>(null);
  const [newTemplateCoverPreview, setNewTemplateCoverPreview] = useState<string | null>(null);
  const [templateWizardStep, setTemplateWizardStep] = useState<TemplateWizardStep>("setup");
  const [newTemplateInputSlots, setNewTemplateInputSlots] = useState<TemplateInputSlotDraft[]>(createDefaultTemplateInputSlots);
  const [newTemplateReferences, setNewTemplateReferences] = useState<TemplateReferenceDraft[]>(() => {
    const slots = createDefaultTemplateInputSlots();
    return slots.map((slot, index) => createTemplateReferenceDraft(index, slot));
  });
  const [templateMetaName, setTemplateMetaName] = useState("");
  const [templateMetaDescription, setTemplateMetaDescription] = useState("");
  const [templateMetaPreviewUrl, setTemplateMetaPreviewUrl] = useState<string | null>(null);
  const [templateMetaPreviewAssetType, setTemplateMetaPreviewAssetType] = useState<"image" | "video" | null>(null);
  const [templateMetaCoverFile, setTemplateMetaCoverFile] = useState<File | null>(null);
  const [templateMetaCoverPreview, setTemplateMetaCoverPreview] = useState<string | null>(null);
  const [selectedActivationGate, setSelectedActivationGate] = useState<ActivationGate | null>(null);
  const [loadingActivationGate, setLoadingActivationGate] = useState(false);
  const [cloneTemplateName, setCloneTemplateName] = useState("");
  
  const [paletteVideoModel, setPaletteVideoModel] = useState<VideoModelKey>("kling-3.0-pro");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [extraPorts, setExtraPorts] = useState<Record<string, string[]>>({});
  const [showGallery, setShowGallery] = useState(false);
  const [referenceUploadNodeId, setReferenceUploadNodeId] = useState<string | null>(null);
  const [nodeRuns, setNodeRuns] = useState<Record<string, NodeRunState & { runId: string }>>({});
  const handleAddPort = useCallback((nodeId: string, type: PortType) => {
    setExtraPorts((current) => {
      const existing = current[nodeId] ?? [];
      const graphNode = detail?.nodes.find((node) => node.id === nodeId);
      const used = new Set<string>([
        ...existing,
        ...(graphNode?.incoming ?? []).map((incoming) => (incoming.targetParam ?? "").toLowerCase()),
        ...(graphNode?.nodeType === "video_gen" ? ["prompt", "start_frame_image"] : ["prompt", "image_1"]),
      ]);
      let nextId = "";
      if (type === "prompt") {
        nextId = used.has("negative_prompt") ? "" : "negative_prompt";
      } else if (type === "image") {
        if (graphNode?.nodeType === "video_gen" && !used.has("end_frame_image")) {
          nextId = "end_frame_image";
        } else {
          for (let index = 1; index <= 12; index += 1) {
            if (!used.has(`image_${index}`)) { nextId = `image_${index}`; break; }
          }
        }
      } else {
        for (let index = 1; index <= 12; index += 1) {
          if (!used.has(`video_${index}`)) { nextId = `video_${index}`; break; }
        }
      }
      if (!nextId) return current;
      return { ...current, [nodeId]: [...existing, nextId] };
    });
  }, [detail]);
  const [draggingEdgeIndex, setDraggingEdgeIndex] = useState<number | null>(null);
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
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const viewportApiRef = useRef<{ getCenter: () => Point } | null>(null);
  const [showRunnerPanel, setShowRunnerPanel] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      headers.apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    }
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
    const rawBody = await response.text();
    let data: WorkbenchResponse = {};
    if (rawBody) {
      try {
        data = JSON.parse(rawBody) as WorkbenchResponse;
      } catch {
        data = { error: rawBody };
      }
    }
    if (!response.ok) {
      const fallback = response.status === 546
        ? "Template workbench rejected the request before it could finish. Large uploaded images are the usual cause; retry with smaller files if this persists."
        : `Template workbench request failed (${response.status})`;
      throw new Error(data?.error ?? fallback);
    }
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
        description: template.description ?? null,
        preview_url: template.previewUrl ?? null,
        preview_asset_type: template.previewAssetType ?? null,
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
    if (!canUseBuilder) return;
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
          description: template.description ?? null,
          previewUrl: template.preview_url ?? null,
          previewAssetType: template.preview_asset_type ?? null,
          versionId: version.id,
          versionNumber: version.version_number,
          reviewStatus: version.review_status ?? "Unreviewed",
          isActive: version.is_active === true,
          updatedAt: template.updated_at ?? null,
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
  }, [canUseBuilder, invokeWorkbench, loadCatalogFallback, searchParams]);

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
    if (data.status === "complete") {
      tutorialRef.current?.signal("test_completed");
      track("creator_test_completed", { status: "complete" });
      track("creator_outputs_reviewed", { status: "complete" });
    }
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
    let isCancelled = false;
    if (!detail?.versionId) {
      setSelectedActivationGate(null);
      setLoadingActivationGate(false);
      return () => {
        isCancelled = true;
      };
    }

    setLoadingActivationGate(true);
    void invokeWorkbench({ action: "publish_gate", versionId: detail.versionId })
      .then((data) => {
        if (!isCancelled) setSelectedActivationGate(data.activationGate ?? null);
      })
      .catch((gateError) => {
        console.error("Failed to load publish gate:", gateError);
        if (!isCancelled) setSelectedActivationGate(null);
      })
      .finally(() => {
        if (!isCancelled) setLoadingActivationGate(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [detail?.versionId, invokeWorkbench]);

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

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateMetaName("");
      setTemplateMetaDescription("");
      setTemplateMetaPreviewUrl(null);
      setTemplateMetaPreviewAssetType(null);
      setTemplateMetaCoverFile(null);
      setTemplateMetaCoverPreview(null);
      return;
    }

    setTemplateMetaName(selectedTemplate.templateName);
    setTemplateMetaDescription(selectedTemplate.description ?? "");
    setTemplateMetaPreviewUrl(selectedTemplate.previewUrl ?? null);
    setTemplateMetaPreviewAssetType(selectedTemplate.previewAssetType ?? null);
    setTemplateMetaCoverFile(null);
    setTemplateMetaCoverPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
  }, [selectedTemplate]);

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

  useEffect(() => {
    const castConfig = parseCastConfig(detail?.castConfig);
    if (!castConfig || !user) {
      setCastAvatars([]);
      setSelectedCastAvatarId(null);
      setCastLoading(false);
      return;
    }
    let cancelled = false;
    setCastLoading(true);
    Promise.all([listFuseAvatars(), listMyAvatars(user.id)])
      .then(([fuse, mine]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const next: AvatarProfile[] = [];
        for (const avatar of [...mine, ...fuse]) {
          if (!seen.has(avatar.id)) {
            seen.add(avatar.id);
            next.push(avatar);
          }
        }
        setCastAvatars(next);
        setSelectedCastAvatarId(null);
      })
      .catch(() => {
        if (!cancelled) setCastAvatars([]);
      })
      .finally(() => {
        if (!cancelled) setCastLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.castConfig, user]);

  const selectedNode = useMemo(
    () => detail?.nodes.find((node) => node.id === selectedNodeId) ?? detail?.nodes[0] ?? null,
    [detail?.nodes, selectedNodeId],
  );

  const inputSlotKeys = useMemo(
    () =>
      (detail?.nodes ?? [])
        .filter((node) => node.nodeType === "user_input")
        .map((node) => ({ id: node.id, slotKey: (node.editor?.slotKey ?? "").trim() })),
    [detail?.nodes],
  );

  const duplicateSlotKey = useMemo(() => {
    if (!selectedNode || selectedNode.nodeType !== "user_input" || !draft) return false;
    const current = draft.slotKey.trim().toLowerCase();
    if (!current) return false;
    return inputSlotKeys.some(
      (entry) => entry.id !== selectedNode.id && entry.slotKey.toLowerCase() === current,
    );
  }, [draft, inputSlotKeys, selectedNode]);

  const optionalWithoutDefault = useMemo(() => {
    if (!selectedNode || selectedNode.nodeType !== "user_input" || !draft) return false;
    return !draft.required && !selectedNode.defaultAssetId && !draft.sampleUrl.trim();
  }, [draft, selectedNode]);

  const edgeDraftSourceNode = useMemo(
    () => detail?.nodes.find((node) => node.id === edgeDraft.sourceNodeId),
    [detail?.nodes, edgeDraft.sourceNodeId],
  );
  const inferredIncomingTargetParam = useMemo(
    () => inferEdgeTargetParam(edgeDraftSourceNode, selectedNode ?? undefined, selectedNode?.incoming.length ?? 0),
    [edgeDraftSourceNode, selectedNode],
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
      required: selectedNode.editor?.required !== false,
      sampleUrl: selectedNode.editor?.sampleUrl ?? selectedNode.defaultAssetUrl ?? "",
      outputExposed: typeof selectedNode.editor?.outputExposed === "boolean" ? selectedNode.editor.outputExposed : null,
      videoModel: resolveVideoModelOption(selectedNode.editor?.videoModel).key,
      duration: Number(selectedNode.editor?.duration ?? 5) || 5,
      resolution: selectedNode.editor?.resolution ?? "720p",
      aspectRatio: selectedNode.editor?.aspectRatio ?? "9:16",
      generateAudio: selectedNode.editor?.generateAudio !== false,
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

  const canvasEdgeVisibility = useMemo(() => {
    const focusedNodeId = selectedNodeId ?? selectedNode?.id ?? null;
    const canvasEdges = graphNodes.flatMap((target) =>
      target.incoming.flatMap((incoming, index) => {
        const source = nodeMap.get(incoming.sourceNodeId);
        if (!source) return [];
        return [{
          key: incoming.edgeId ?? `${incoming.sourceNodeId}-${target.id}-${incoming.targetParam ?? index}`,
          source,
          target,
          isFocused: focusedNodeId ? source.id === focusedNodeId || target.id === focusedNodeId : false,
        }];
      }),
    );
    const focusedEdges = focusedNodeId ? canvasEdges.filter((edge) => edge.isFocused) : [];
    const primaryEdges = focusedEdges.length ? focusedEdges : canvasEdges;
    const visibleEdges = primaryEdges.slice(0, MAX_VISIBLE_CANVAS_EDGES);

    return {
      edges: visibleEdges,
      hiddenCount: Math.max(0, canvasEdges.length - visibleEdges.length),
      total: canvasEdges.length,
    };
  }, [graphNodes, nodeMap, selectedNode?.id, selectedNodeId]);

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

  /** Real per-run credit estimate for the creator test-run confirmation. */
  const estimatedTestCredits = useMemo(() => {
    const allNodes = detail?.nodes ?? [];
    return allNodes.reduce((total, node) => {
      if (node.nodeType === "image_gen") return total + 1;
      if (node.nodeType === "video_gen") {
        return total + estimateVideoCredits({
          videoModel: resolveVideoModelOption(node.editor?.videoModel).key,
          duration: Number(node.editor?.duration) || 5,
          resolution: String(node.editor?.resolution ?? "720p"),
          generateAudio: Boolean(node.editor?.generateAudio),
        });
      }
      return total;
    }, 0);
  }, [detail?.nodes]);

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
    const activeDrag = dragRef.current;
    if (!activeDrag) return;
    const deltaX = (event.clientX - activeDrag.start.x) / canvasZoom;
    const deltaY = (event.clientY - activeDrag.start.y) / canvasZoom;
    setPositions((current) => {
      const next = {
        ...current,
        [activeDrag.nodeId]: {
          x: Math.max(32, activeDrag.origin.x + deltaX),
          y: Math.max(76, activeDrag.origin.y + deltaY),
        },
      };
      positionsRef.current = next;
      return next;
    });
  }, [canvasZoom]);

  const onPointerUp = useCallback(() => {
    const activeDrag = dragRef.current;
    if (!activeDrag) return;
    if (detail?.versionId) {
      window.localStorage.setItem(layoutKey(detail.versionId), JSON.stringify(positionsRef.current));
    }
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
    if (event.button !== 1 && !(event.button === 0 && event.shiftKey)) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-node-card], button, input, textarea, select, a")) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    event.preventDefault();
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

  const moveTemplateBranch = useCallback((referenceId: string, direction: -1 | 1) => {
    setNewTemplateReferences((current) => {
      const index = current.findIndex((reference) => reference.id === referenceId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }, []);

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

  const handleNewTemplateCoverFile = useCallback((file: File | null) => {
    setNewTemplateCoverPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setNewTemplateCoverFile(file);
  }, []);

  const handleTemplateMetaCoverFile = useCallback((file: File | null) => {
    setTemplateMetaCoverPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setTemplateMetaCoverFile(file);
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
      const uploadedInputs = Object.fromEntries(
        await Promise.all(
          runInputs
            .filter((input) => files[input.id])
            .map(async (input) => {
              const file = files[input.id]!;
              return [input.id, await uploadRunInputFile(file)];
            }),
        ),
      );

      const castConfig = parseCastConfig(detail.castConfig);
      const firstSlotId = castConfig?.slots[0]?.id;
      const castBody = selectedCastAvatarId && firstSlotId
        ? { cast: { [firstSlotId]: selectedCastAvatarId } }
        : undefined;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-template-run`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: detail.versionId,
          inputs: uploadedInputs,
          ...castBody,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not start template");
      setJobId(data.jobId);
      void fetchJobStatus(data.jobId, detail.versionId);
      pollJob(data.jobId, detail.versionId);
    } catch (runError) {
      const rawMessage = runError instanceof Error ? runError.message : "Could not start template";
      const isCastError = rawMessage.includes("CAST_CONFIGURATION_INVALID");
      const message = isCastError ? rawMessage.replace(/^CAST_CONFIGURATION_INVALID:\s*/, "") : rawMessage;
      setPhase("error");
      setError(rawMessage);
      toast({
        title: isCastError ? "Cast configuration invalid" : "Run failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setStartingRun(false);
    }
  }, [buildAuthHeaders, detail, fetchJobStatus, files, pollJob, runInputs, selectedCastAvatarId]);

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
          ...(selectedNode.nodeType === "user_input" ? { required: draft.required } : {}),
          sampleUrl: selectedNode.nodeType === "user_input" ? draft.sampleUrl : null,
          outputExposed: selectedNode.nodeType === "image_gen" || selectedNode.nodeType === "video_gen" ? draft.outputExposed : null,
          ...(selectedNode.nodeType === "video_gen"
            ? {
              videoModel: draft.videoModel,
              duration: draft.duration,
              resolution: draft.resolution,
              aspectRatio: draft.aspectRatio,
              generateAudio: draft.generateAudio,
            }
            : {}),
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
    if (selectedNode.nodeType !== "user_input") {
      toast({ title: "Pick an input node first", variant: "destructive" });
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
          editorMode: draft.editorMode,
          keepEditorMode: draft.editorMode === "upload",
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

  const savePromptInline = useCallback(async (nodeId: string, prompt: string) => {
    if (!detail) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
        method: "POST",
        headers: { ...(await buildAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: detail.versionId, nodeId, prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not save prompt");
      await loadDetail(detail.versionId);
      toast({ title: "Prompt saved" });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save prompt";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    }
  }, [buildAuthHeaders, detail, loadDetail]);

  const uploadReferenceForNode = useCallback(async (nodeId: string, file: File) => {
    if (!detail) return;
    const node = detail.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    setReferenceUploadNodeId(nodeId);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
        method: "POST",
        headers: { ...(await buildAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: detail.versionId,
          nodeId,
          displayLabel: node.editor?.label || node.name,
          expected: node.editor?.expected ?? node.expected ?? "image",
          editorMode: "reference",
          slotKey: node.editor?.slotKey ?? null,
          referenceFile: {
            filename: file.name,
            dataUrl: await fileToDataUrl(file),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not upload reference image");
      await loadDetail(detail.versionId);
      await loadTemplates();
      toast({ title: "Reference image attached", description: "This fixed image is now part of the template." });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Could not upload reference image";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setReferenceUploadNodeId(null);
    }
  }, [buildAuthHeaders, detail, loadDetail, loadTemplates]);

  const autoDraftStartedRef = useRef(false);

  const createTemplate = useCallback(async (overrides?: { name?: string; description?: string }) => {
    // `overrides` lets programmatic entry points (creator START BUILDING, gallery
    // create) pass the name directly instead of relying on freshly-set state,
    // which used to read a stale empty value and hard-fail with "name required".
    const overrideName = overrides?.name?.trim();
    const name = overrideName || newTemplateName.trim() || (overrides ? CREATOR_DEFAULT_TEMPLATE_NAME : "");
    if (!name) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    setMutating("create-template");
    try {
      const data = await invokeWorkbench({
        action: "create_template",
        name,
        description: overrides?.description ?? newTemplateDescription,
        previewFile: null,
        withStarterGraph: false,
      });

      const versionId = typeof data.versionId === "string" ? data.versionId : null;
      if (!versionId) throw new Error("Template created but the workbench did not return a version id");

      setNewTemplateName("");
      setNewTemplateDescription("");
      handleNewTemplateCoverFile(null);
      setSelectedNodeId(null);
      setShowRunnerPanel(true);
      setPhase("idle");
      setJob(null);
      setJobId(null);
      setError(null);
      await refreshAfterMutation(versionId);
      toast({ title: "Blank canvas created", description: `${name} v1 is empty. Add steps from the palette.` });
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Could not create template";
      toast({ title: "Create failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [
    invokeWorkbench,
    handleNewTemplateCoverFile,
    newTemplateDescription,
    newTemplateName,
    refreshAfterMutation,
  ]);



  // Creator Studio "START BUILDING" entry also launches the guided walkthrough.
  const tutorialLaunchedRef = useRef(false);
  useEffect(() => {
    if (tutorialLaunchedRef.current) return;
    if (!isCreatorOnly || !detail) return;
    if (searchParams.get("tutorial") !== "1") return;
    tutorialLaunchedRef.current = true;
    tutorial.start();
  }, [detail, isCreatorOnly, searchParams, tutorial]);

  // Creator Studio "START BUILDING" entry: open the real builder on a fresh
  // creator-owned draft (created_by = self, enforced server-side).
  useEffect(() => {
    if (autoDraftStartedRef.current) return;
    if (!canUseBuilder || !session) return;
    if (searchParams.get("newTemplate") !== "1") return;
    autoDraftStartedRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("newTemplate");
    setSearchParams(next, { replace: true });
    const draftName = isCreatorOnly
      ? CREATOR_DEFAULT_TEMPLATE_NAME
      : `Untitled template ${new Date().toLocaleDateString()}`;
    setNewTemplateName(draftName);
    void createTemplate({ name: draftName });
  }, [canUseBuilder, createTemplate, isCreatorOnly, searchParams, session, setSearchParams]);


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
      await refreshAfterMutation(String(data.versionId));
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
    const gate = selectedActivationGate ?? selectedTemplate?.activationGate ?? null;
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
  }, [detail, invokeWorkbench, refreshAfterMutation, selectedActivationGate, selectedTemplate?.activationGate]);

  const submitForReview = useCallback(async () => {
    if (!detail) return;
    setMutating("submit-for-review");
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-for-review`, {
        method: "POST",
        headers: { ...(await buildAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: detail.versionId }),
      });
      const raw = await response.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string };
        } catch {
          data = { error: raw };
        }
      }
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
      await refreshAfterMutation(detail.versionId);
      tutorial.signal("submitted");
      toast({
        title: "Template submitted ✓",
        description: "We'll notify you when it's approved.",
      });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not submit for review";
      toast({ title: "Submit failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [buildAuthHeaders, detail, refreshAfterMutation, tutorial]);



  const saveTemplateMetadata = useCallback(async () => {
    if (!selectedTemplate) return;
    // Creators never get hard-blocked on an unnamed draft — fall back to a default.
    const name = templateMetaName.trim() || (isCreatorOnly ? CREATOR_DEFAULT_TEMPLATE_NAME : "");
    if (!name) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }


    setMutating("save-template-meta");
    try {
      await invokeWorkbench({
        action: "update_template",
        templateId: selectedTemplate.templateId,
        name,
        description: templateMetaDescription,
        previewUrl: templateMetaPreviewUrl,
        previewAssetType: templateMetaPreviewAssetType ?? "image",
        previewFile: templateMetaCoverFile
          ? {
              filename: templateMetaCoverFile.name,
              dataUrl: await fileToDataUrl(templateMetaCoverFile),
            }
          : null,
      });
      await refreshAfterMutation(selectedTemplate.versionId);
      handleTemplateMetaCoverFile(null);
      toast({ title: "Template updated", description: "Name, description, and cover are saved." });
    } catch (metadataError) {
      const message = metadataError instanceof Error ? metadataError.message : "Could not update template";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [
    handleTemplateMetaCoverFile,
    invokeWorkbench,
    isCreatorOnly,

    refreshAfterMutation,
    selectedTemplate,
    templateMetaCoverFile,
    templateMetaDescription,
    templateMetaName,
    templateMetaPreviewAssetType,
    templateMetaPreviewUrl,
  ]);

  const saveCastConfig = useCallback(async (nextCastConfig: CastConfig | null) => {
    if (!detail?.versionId) return;
    setMutating("save-cast-config");
    try {
      await invokeWorkbench({
        action: "update_cast_config",
        versionId: detail.versionId,
        castConfig: nextCastConfig,
      });
      await refreshAfterMutation(detail.versionId);
      toast({
        title: nextCastConfig ? "Cast configuration saved" : "Casting disabled",
        description: nextCastConfig
          ? "Cast metadata is stored on this version. Generation is unchanged."
          : "This version behaves exactly as before.",
      });
    } catch (castError) {
      const message = castError instanceof Error ? castError.message : "Could not save cast configuration";
      toast({ title: "Cast save failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail?.versionId, invokeWorkbench, refreshAfterMutation]);

  /** FT9 — clone the (protected) current version into a draft and seed cast on the draft only. */
  const cloneVersionForCast = useCallback(async (nextCastConfig: CastConfig) => {
    if (!detail?.versionId) return;
    setMutating("clone-version-for-cast");
    try {
      const data = await invokeWorkbench({
        action: "clone_version",
        sourceVersionId: detail.versionId,
        targetTemplateId: detail.templateId,
        makeActive: false,
        castConfig: nextCastConfig,
      });
      await refreshAfterMutation(String(data.versionId));
      toast({
        title: "Cast draft created",
        description: `Draft v${data.versionNumber} has cast enabled. The live version is untouched.`,
      });
    } catch (cloneError) {
      const message = cloneError instanceof Error ? cloneError.message : "Could not clone version for cast";
      toast({ title: "Clone failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail?.templateId, detail?.versionId, invokeWorkbench, refreshAfterMutation]);


  const clearTemplateCover = useCallback(async () => {
    if (!selectedTemplate) return;
    setMutating("clear-template-cover");
    try {
      await invokeWorkbench({
        action: "update_template",
        templateId: selectedTemplate.templateId,
        clearPreview: true,
      });
      setTemplateMetaPreviewUrl(null);
      handleTemplateMetaCoverFile(null);
      await refreshAfterMutation(selectedTemplate.versionId);
      toast({ title: "Template cover cleared" });
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : "Could not clear template cover";
      toast({ title: "Clear failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [handleTemplateMetaCoverFile, invokeWorkbench, refreshAfterMutation, selectedTemplate]);

  const unpublishCurrentTemplate = useCallback(async () => {
    if (!selectedTemplate) return;
    setMutating("unpublish-template");
    try {
      await invokeWorkbench({
        action: "unpublish_template",
        templateId: selectedTemplate.templateId,
      });
      await refreshAfterMutation(selectedTemplate.versionId);
      toast({ title: "Template unpublished", description: "It no longer appears in the live template grid." });
    } catch (unpublishError) {
      const message = unpublishError instanceof Error ? unpublishError.message : "Could not unpublish template";
      toast({ title: "Unpublish failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [invokeWorkbench, refreshAfterMutation, selectedTemplate]);

  const addNode = useCallback(async (kind: NewNodeKind, videoModelOverride?: VideoModelKey) => {
    if (!detail) return;
    const isInput = kind === "upload" || kind === "reference";
    const isPromptBlock = kind === "prompt";
    setMutating("add-node");
    try {
      const created = await invokeWorkbench({
        action: "add_node",
        versionId: detail.versionId,
        nodeType: isInput ? "user_input" : kind,
        editorMode: isInput ? kind : undefined,
        // Every new input gets its own slot key; identical keys merge into a
        // single customer input in the builder.
        slotKey: isInput
          ? uniqueSlotKey(
              kind === "reference" ? "reference" : `input-${(detail.nodes ?? []).filter((node) => node.nodeType === "user_input").length + 1}`,
              (detail.nodes ?? [])
                .filter((node) => node.nodeType === "user_input")
                .map((node) => node.editor?.slotKey ?? ""),
            )
          : undefined,
        expected: isPromptBlock ? undefined : kind === "video_gen" ? "video" : "image",
        prompt: "",
        outputExposed: kind === "image_gen" || kind === "video_gen",
      });
      const createdNodeId = typeof created.nodeId === "string" ? created.nodeId : null;
      if (kind === "video_gen" && createdNodeId && videoModelOverride) {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
          method: "POST",
          headers: { ...(await buildAuthHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({
            versionId: detail.versionId,
            nodeId: createdNodeId,
            videoModel: videoModelOverride,
          }),
        }).catch(() => undefined);
      }

      if (kind === "reference") setShowInternalNodes(true);

      if (createdNodeId) {
        const center = viewportApiRef.current?.getCenter() ?? { x: 320, y: 240 };
        const spawn = {
          x: Math.round(center.x - NODE_WIDTH / 2 + (Math.random() * 60 - 30)),
          y: Math.round(center.y - 90 + (Math.random() * 60 - 30)),
        };
        setPositions((current) => ({ ...current, [createdNodeId]: spawn }));
      }

      await refreshAfterMutation(detail.versionId);
      tutorial.signal(
        kind === "upload"
          ? "input_added"
          : kind === "reference"
            ? "reference_added"
            : kind === "prompt"
              ? "prompt_added"
              : kind === "image_gen"
                ? "image_added"
                : "video_added",
      );
      if (createdNodeId) {
        setSelectedNodeId(createdNodeId);
        setFocusNodeId(createdNodeId);
      }
      toast({
        title: isPromptBlock ? "Prompt block added" : "Step added",
        description: isPromptBlock
          ? "Double-click it to write the prompt, then connect it to a model step."
          : "Rename it and set the prompt in the inspector.",
      });
    } catch (addError) {
      const message = addError instanceof Error ? addError.message : "Could not add node";
      toast({ title: "Add step failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [buildAuthHeaders, detail, invokeWorkbench, refreshAfterMutation, tutorial]);

  const deletingNodeIdsRef = useRef<Set<string>>(new Set());

  const deleteNodeById = useCallback(async (nodeId: string) => {
    if (!detail || !nodeId) return;
    if (deletingNodeIdsRef.current.has(nodeId)) return;
    deletingNodeIdsRef.current.add(nodeId);
    setMutating("delete-node");
    try {
      await invokeWorkbench({ action: "delete_node", nodeId });
      setSelectedNodeId((current) => (current === nodeId ? null : current));
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Node deleted" });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Could not delete node";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    } finally {
      deletingNodeIdsRef.current.delete(nodeId);
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation]);

  const deleteSelectedNode = useCallback(async () => {
    if (!selectedNode || !detail) return;
    const confirmed = window.confirm(`Delete node ${selectedNode.nodeNumber ?? ""} "${selectedNode.name}" and its connected edges?`);
    if (!confirmed) return;
    await deleteNodeById(selectedNode.id);
  }, [deleteNodeById, detail, selectedNode]);

  const nodeClipboardRef = useRef<{
    nodeType: string;
    editorMode?: "upload" | "reference";
    expected?: string;
    prompt: string;
    outputExposed: boolean | null;
    position: { x: number; y: number } | null;
  } | null>(null);

  const pasteClipboardNode = useCallback(async () => {
    const clip = nodeClipboardRef.current;
    if (!clip || !detail) return;
    setMutating("add-node");
    try {
      const created = await invokeWorkbench({
        action: "add_node",
        versionId: detail.versionId,
        nodeType: clip.nodeType,
        editorMode: clip.editorMode,
        expected: clip.expected,
        prompt: clip.prompt,
        outputExposed: clip.outputExposed ?? false,
      });
      const createdNodeId = typeof created.nodeId === "string" ? created.nodeId : null;
      if (createdNodeId) {
        const base = clip.position ?? viewportApiRef.current?.getCenter() ?? { x: 320, y: 240 };
        setPositions((current) => ({
          ...current,
          [createdNodeId]: { x: Math.round(base.x + 48), y: Math.round(base.y + 48) },
        }));
      }
      await refreshAfterMutation(detail.versionId);
      if (createdNodeId) {
        setSelectedNodeId(createdNodeId);
        setFocusNodeId(createdNodeId);
      }
      toast({ title: "Block pasted" });
    } catch (pasteError) {
      const message = pasteError instanceof Error ? pasteError.message : "Could not paste block";
      toast({ title: "Paste failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "c" && key !== "v") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      if (key === "c") {
        if (!selectedNode) return;
        nodeClipboardRef.current = {
          nodeType: selectedNode.nodeType,
          editorMode: selectedNode.nodeType === "user_input" ? selectedNode.editor?.mode ?? "upload" : undefined,
          expected:
            selectedNode.nodeType === "prompt"
              ? undefined
              : selectedNode.editor?.expected ?? selectedNode.expected ?? undefined,
          prompt: selectedNode.prompt ?? "",
          outputExposed:
            typeof selectedNode.editor?.outputExposed === "boolean" ? selectedNode.editor.outputExposed : null,
          position: positions[selectedNode.id] ?? null,
        };
        event.preventDefault();
        toast({ title: "Block copied" });
        return;
      }
      if (!nodeClipboardRef.current) return;
      event.preventDefault();
      void pasteClipboardNode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pasteClipboardNode, positions, selectedNode]);


  const addEdge = useCallback(async (targetNodeId?: string) => {
    const resolvedTargetNodeId = targetNodeId || edgeDraft.targetNodeId;
    if (!detail || !edgeDraft.sourceNodeId || !resolvedTargetNodeId) {
      toast({ title: "Pick source and target nodes", variant: "destructive" });
      return;
    }
    const sourceNode = detail.nodes.find((node) => node.id === edgeDraft.sourceNodeId);
    const targetNode = detail.nodes.find((node) => node.id === resolvedTargetNodeId);
    const targetParam = edgeDraft.targetParam.trim() ||
      inferEdgeTargetParam(sourceNode, targetNode, targetNode?.incoming.length ?? 0);
    setMutating("add-edge");
    try {
      await invokeWorkbench({
        action: "add_edge",
        versionId: detail.versionId,
        sourceNodeId: edgeDraft.sourceNodeId,
        targetNodeId: resolvedTargetNodeId,
        targetParam,
      });
      setEdgeDraft({ sourceNodeId: "", targetNodeId: "", targetParam: "" });
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Edge added", description: `Mapped to ${targetParam}.` });
    } catch (edgeError) {
      const message = edgeError instanceof Error ? edgeError.message : "Could not add edge";
      toast({ title: "Add edge failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, edgeDraft, invokeWorkbench, refreshAfterMutation]);

  const reorderEdge = useCallback(async (edgeId: string | undefined, direction: EdgeMoveDirection) => {
    if (!edgeId || !detail) return;
    setMutating(`reorder-edge:${edgeId}:${direction}`);
    try {
      await invokeWorkbench({ action: "reorder_edge", edgeId, direction });
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Incoming priority updated" });
    } catch (edgeError) {
      const message = edgeError instanceof Error ? edgeError.message : "Could not reorder edge";
      toast({ title: "Reorder edge failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation]);

  const moveIncomingEdgeToIndex = useCallback(async (fromIndex: number, toIndex: number) => {
    if (!detail || !selectedNode || fromIndex === toIndex) return;
    const edgeId = selectedNode.incoming[fromIndex]?.edgeId;
    if (!edgeId) return;
    const direction: EdgeMoveDirection = toIndex > fromIndex ? 1 : -1;
    const steps = Math.abs(toIndex - fromIndex);
    setMutating(`reorder-edge:${edgeId}:${direction}`);
    try {
      for (let step = 0; step < steps; step += 1) {
        await invokeWorkbench({ action: "reorder_edge", edgeId, direction });
      }
      await refreshAfterMutation(detail.versionId);
      toast({ title: "Reference order updated" });
    } catch (edgeError) {
      const message = edgeError instanceof Error ? edgeError.message : "Could not reorder references";
      toast({ title: "Reorder failed", description: message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, refreshAfterMutation, selectedNode]);


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

  const connectNodesOnCanvas = useCallback(async (sourceNodeId: string, targetNodeId: string, targetHandleId?: string | null) => {
    if (!detail) return;
    const sourceNode = detail.nodes.find((node) => node.id === sourceNodeId);
    const targetNode = detail.nodes.find((node) => node.id === targetNodeId);
    const handleParam = (targetHandleId ?? "").trim().toLowerCase();
    const targetParam = handleParam || inferEdgeTargetParam(sourceNode, targetNode, targetNode?.incoming.length ?? 0);
    setMutating("add-edge");
    try {
      await invokeWorkbench({
        action: "add_edge",
        versionId: detail.versionId,
        sourceNodeId,
        targetNodeId,
        targetParam,
      });
      await refreshAfterMutation(detail.versionId);
      tutorial.signal("connection_made");
      toast({ title: "Steps connected", description: "Nice — that step now receives the customer's asset automatically." });
    } catch (edgeError) {
      const message = edgeError instanceof Error ? edgeError.message : "Could not connect steps";
      toast({
        title: "Connect failed",
        description: isCreatorOnly
          ? `${message} — this input may expect a different type. Try connecting an image output to an image input.`
          : message,
        variant: "destructive",
      });
    } finally {
      setMutating(null);
    }
  }, [detail, invokeWorkbench, isCreatorOnly, refreshAfterMutation, tutorial]);

  const handleCanvasNodeMoved = useCallback((nodeId: string, position: Point) => {
    setPositions((current) => {
      const next = { ...current, [nodeId]: position };
      positionsRef.current = next;
      if (detail?.versionId) {
        window.localStorage.setItem(layoutKey(detail.versionId), JSON.stringify(next));
      }
      return next;
    });
  }, [detail?.versionId]);

  const invokeRunNode = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-node`, {
      method: "POST",
      headers: { ...(await buildAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error ?? "Could not run this step");
    return data as { run?: RunNodeResult; runs?: RunNodeResult[] };
  }, [buildAuthHeaders]);

  const applyNodeRun = useCallback((run: RunNodeResult) => {
    setNodeRuns((current) => ({
      ...current,
      [run.nodeId]: {
        runId: run.runId,
        status: run.status,
        outputUrl: run.outputUrl ?? null,
        outputType: run.outputType ?? null,
        error: run.error ?? null,
        estimatedCredits: run.estimatedCredits ?? null,
        startedAt: run.startedAt ? new Date(run.startedAt).getTime() : Date.now(),
      },
    }));
  }, []);

  const runSingleNode = useCallback(async (nodeId: string) => {
    if (!detail) return;
    setNodeRuns((current) => ({
      ...current,
      [nodeId]: {
        ...(current[nodeId] ?? { runId: "" }),
        status: "queued",
        error: null,
        outputUrl: null,
        outputType: null,
        startedAt: Date.now(),
      },
    }));
    try {
      const data = await invokeRunNode({ action: "start", versionId: detail.versionId, nodeId });
      if (data.run) applyNodeRun(data.run);
      toast({ title: "Step generating", description: "This can take 10–60 seconds." });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Could not run this step";
      setNodeRuns((current) => ({
        ...current,
        [nodeId]: { ...(current[nodeId] ?? { runId: "" }), status: "failed", error: message, startedAt: null },
      }));
      toast({ title: "Run failed", description: message, variant: "destructive" });
    }
  }, [applyNodeRun, detail, invokeRunNode]);

  useEffect(() => {
    const pending = Object.values(nodeRuns).filter((run) => run.runId && (run.status === "queued" || run.status === "running"));
    if (!pending.length || !detail) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const data = await invokeRunNode({ action: "status", versionId: detail.versionId });
        if (cancelled) return;
        for (const run of data.runs ?? []) applyNodeRun(run);
      } catch {
        // keep polling; transient failures are expected while a job is queued
      }
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyNodeRun, detail, invokeRunNode, nodeRuns]);

  const flowNodes = useMemo<GraphCanvasNode[]>(() => graphNodes.map((node) => {
    const kind: GraphCanvasNodeData["kind"] = node.nodeType === "user_input"
      ? "input"
      : node.nodeType === "image_gen"
      ? "image"
      : node.nodeType === "video_gen"
      ? "video"
      : "other";

    let modelBadge: string | null = null;
    let detailLine: string | null = null;
    if (kind === "image") {
      modelBadge = "nano-banana-pro";
    } else if (kind === "video") {
      const option = resolveVideoModelOption(node.editor?.videoModel);
      modelBadge = option.label;
      const seconds = Number(node.editor?.duration ?? (option.family === "kling" ? 5 : 5)) || 5;
      const audio = node.editor?.generateAudio !== false;
      detailLine = option.family === "kling"
        ? "5s · 9:16 · locked"
        : `${seconds}s · ${audio ? "audio on" : "no audio"}${option.family === "seedance" ? ` · ${node.editor?.resolution ?? "720p"}` : ""}`;
    } else if (kind === "input") {
      detailLine = node.editor?.mode === "reference" ? "Hidden guide asset" : "Customer upload";
    }

    return {
      id: node.id,
      type: "templateNode",
      position: node.position,
      data: {
        title: node.editor?.label || node.name,
        nodeNumber: node.nodeNumber ?? null,
        outputNumber: node.outputNumber ?? null,
        kind,
        kindLabel: isCreatorOnly ? creatorKindLabel(node) : nodeKindLabel(node),
        helpText: isCreatorOnly ? creatorNodeHelpText(node) : null,
        laneLabel: LANE_LABELS[laneForNode(node)],
        modelBadge,
        detailLine,
        promptPreview: promptPreview(node),
        incomingCount: node.incoming.length,
        sourceSummary: sourcePreview(node),
        refLabels: node.incoming.map((incoming) => incoming.sourceName),
        assetUrl: node.defaultAssetUrl,
        expected: node.editor?.expected ?? node.expected ?? null,
        deliverable: typeof node.editor?.outputExposed === "boolean" ? node.editor.outputExposed : null,
        promptValue: node.prompt ?? "",
        portIds: portIdsForNode(node.id, kind, node.incoming.map((incoming) => incoming.targetParam), extraPorts[node.id] ?? []),
        isReference: kind === "input" && node.editor?.mode === "reference",
        uploadingReference: referenceUploadNodeId === node.id,
        onAddPort: handleAddPort,
        onPromptCommit: (nodeId: string, prompt: string) => void savePromptInline(nodeId, prompt),
        onUploadReference: (nodeId: string, file: File) => void uploadReferenceForNode(nodeId, file),
        run: nodeRuns[node.id] ?? null,
        onRunNode: kind === "image" || kind === "video"
          ? (nodeId: string) => void runSingleNode(nodeId)
          : undefined,
      },
    };
  }), [graphNodes, extraPorts, handleAddPort, isCreatorOnly, nodeRuns, referenceUploadNodeId, runSingleNode, savePromptInline, uploadReferenceForNode]);

  const selectedNodeRun = selectedNodeId ? nodeRuns[selectedNodeId] ?? null : null;

  const flowEdges = useMemo(() => graphNodes.flatMap((target) => {
    const targetKind = nodeKind(target);
    const targetPorts = portIdsForNode(
      target.id,
      targetKind,
      target.incoming.map((incoming) => incoming.targetParam),
      extraPorts[target.id] ?? [],
    );
    const spareImagePorts = targetPorts.filter((port) => !port.includes("prompt"));
    let spareCursor = 0;

    return target.incoming.flatMap((incoming, index) => {
      if (!nodeMap.has(incoming.sourceNodeId)) return [];
      const sourceNode = nodeMap.get(incoming.sourceNodeId);
      const param = (incoming.targetParam ?? "").trim().toLowerCase();
      const portType: PortType = param.includes("prompt") || sourceNode?.nodeType === "prompt"
        ? "prompt"
        : sourceNode?.nodeType === "video_gen"
        ? "video"
        : "image";
      const stroke = PORT_COLOR[portType];
      let targetHandle: string | undefined;
      if (targetPorts.length) {
        if (param && targetPorts.includes(param)) targetHandle = param;
        else if (portType !== "prompt") {
          targetHandle = spareImagePorts[spareCursor] ?? spareImagePorts[spareImagePorts.length - 1];
          spareCursor += 1;
        } else {
          targetHandle = targetPorts.find((port) => port.includes("prompt")) ?? targetPorts[0];
        }
      }
      const sourceHandle = sourceNode?.nodeType === "prompt"
        ? "prompt"
        : sourceNode?.nodeType === "video_gen"
        ? "video"
        : "image";
      return [{
        id: `${incoming.edgeId ?? `${incoming.sourceNodeId}-${target.id}`}-${index}`,
        source: incoming.sourceNodeId,
        target: target.id,
        sourceHandle,
        targetHandle,
        label: `Ref ${index + 1}`,
        style: { stroke, strokeWidth: 1.8, opacity: 0.85 },
        labelStyle: { fill: stroke, fontSize: 10, fontWeight: 700 },
        data: { edgeId: incoming.edgeId ?? null },
      }];
    });
  }), [graphNodes, nodeMap, extraPorts]);



  const wizardSteps: Array<{ id: TemplateWizardStep; label: string }> = [
    { id: "setup", label: "Setup" },
    { id: "branches", label: "Steps" },
  ];
  const wizardStepIndex = wizardSteps.findIndex((step) => step.id === templateWizardStep);
  const wizardProgress = ((wizardStepIndex + 1) / wizardSteps.length) * 100;
  const hasTemplateName = canAdvanceTemplateBuilder("setup", newTemplateName);
  const selectedPublishGate = selectedActivationGate ?? selectedTemplate?.activationGate ?? null;
  const testingGateActive = !!detail && !detail.isActive;
  const testingGateSatisfied = !testingGateActive || (!loadingActivationGate && selectedPublishGate?.publishable === true);
  const publishGateReasons = selectedPublishGate?.reasons?.length
    ? selectedPublishGate.reasons
    : [loadingActivationGate ? "Checking publish requirements..." : "Complete a run and save an approved audit before publishing."];
  const publishRunComplete = (selectedPublishGate?.completedRunCount ?? 0) > 0;
  const publishAuditApproved = (selectedPublishGate?.approvedAuditCount ?? 0) > 0;
  const publishBlockingOutputCount = selectedPublishGate?.blockingOutputReportCount ?? 0;
  const publishAuditHref = selectedPublishGate?.latestCompletedJobId
    ? `/admin/audits?jobId=${selectedPublishGate.latestCompletedJobId}`
    : detail
    ? `/admin/audits?versionId=${detail.versionId}`
    : "/admin/audits";
  const selectedTemplateHasLiveVersion = selectedTemplate
    ? templates.some((template) => template.templateId === selectedTemplate.templateId && template.isActive)
    : false;
  const templateCoverPreviewUrl = templateMetaCoverPreview ?? templateMetaPreviewUrl;
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
      <TemplateGallery
        open={showGallery}
        templates={primaryTemplateOptions}
        loading={loadingTemplates}
        activeVersionId={selectedVersionId}
        creating={mutating === "create-template"}
        onClose={() => setShowGallery(false)}
        onRefresh={() => void loadTemplates()}
        onOpenTemplate={(versionId) => {
          setSelectedNodeId(null);
          setSelectedVersionId(versionId);
          setShowGallery(false);
        }}
        onCreateTemplate={(name) => {
          const draftName = name.trim() || CREATOR_DEFAULT_TEMPLATE_NAME;
          setNewTemplateName(draftName);
          setShowGallery(false);
          void createTemplate({ name: draftName });
        }}

      />
      {isCreatorOnly ? (
        <CreatorBuilderHelpPanel
          open={showCreatorHelp}
          onClose={() => setShowCreatorHelp(false)}
          onReplayWalkthrough={() => {
            setShowCreatorHelp(false);
            tutorial.start();
          }}
        />
      ) : null}
      {isCreatorOnly && tutorial.active && tutorial.lesson ? (
        <CreatorTutorialOverlay
          lesson={tutorial.lesson}
          index={tutorial.index}
          total={tutorial.total}
          completedIds={tutorial.completedIds}
          milestoneId={tutorial.milestoneId}
          onNext={tutorial.next}
          onBack={tutorial.back}
          onSkip={tutorial.skip}
        />
      ) : null}
      {isCreatorOnly && detail ? (
        <CreatorCustomerPreviewModal
          open={showCustomerPreview}
          onClose={() => setShowCustomerPreview(false)}
          templateName={detail.templateName}
          coverUrl={selectedTemplate?.previewUrl ?? null}
          inputs={runInputs.map((input) => ({ key: input.id, label: input.name, type: input.expected }))}
          imageCount={(detail.nodes ?? []).filter((node) => node.nodeType === "image_gen").length}
          videoCount={(detail.nodes ?? []).filter((node) => node.nodeType === "video_gen").length}
          runCredits={estimatedTestCredits}
        />
      ) : null}
      {isCreatorOnly ? (
        <CreditConfirmModal
          open={showTestCostConfirm}
          onOpenChange={setShowTestCostConfirm}
          creditCost={estimatedTestCredits}
          currentBalance={profile?.credits_balance ?? 0}
          actionLabel="Run test"
          onConfirm={() => {
            setShowTestCostConfirm(false);
            track("creator_test_started", { steps: graphSummary.nodes });
            void handleRun();
          }}
        />
      ) : null}
      <div className="mx-auto flex w-full min-w-0 max-w-[2100px] flex-col gap-3 overflow-x-hidden px-3 py-3 sm:px-4">
        {isCreatorOnly ? (
          <p className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 text-xs text-amber-100 xl:hidden">
            Building workflows works best on desktop — continue there for the full visual builder.
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/70 px-4 py-2.5 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {isCreatorOnly ? "Template Builder" : "Canvas"}
              </p>
              <h1 className="truncate text-lg font-bold">{detail?.templateName ?? "Loading..."}</h1>
              {isCreatorOnly ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  Build the workflow customers will run.
                </p>
              ) : null}
            </div>
            {loadingDetail ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
            <span className="hidden items-center gap-2 md:flex">
              {[
                ["Steps", graphSummary.nodes],
                ["Links", graphSummary.edges],
                ["Inputs", graphSummary.uploads],
                ["Results", graphSummary.outputs],
              ].map(([label, value]) => (
                <span key={label} className="rounded-full border border-border/60 bg-background/70 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{value}</span> {label}
                </span>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button data-tutorial="templates" type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setShowGallery(true)}>
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              {isCreatorOnly ? "My templates" : "Templates"}
            </Button>
            <Button data-tutorial="auto-layout" type="button" variant="ghost" size="sm" className="rounded-full" disabled={!detail} onClick={resetLayout}>
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
              Auto-layout
            </Button>
            <Button data-tutorial="save" type="button" variant="ghost" size="sm" className="rounded-full" disabled={!detail} onClick={() => { tutorial.signal("saved"); void saveLayout(); }}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
            {isCreatorOnly ? (
              <>
                <Button
                  data-tutorial="customer-preview"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  disabled={!detail}
                  onClick={() => {
                    track("creator_customer_previewed", { template_id: detail?.templateId ?? null });
                    setShowCustomerPreview(true);
                  }}
                >
                  Preview as customer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setShowCreatorHelp(true)}
                >
                  <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                  Help
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  aria-label="More builder controls"
                  onClick={() => setShowCreatorOverflow((current) => !current)}
                >
                  •••
                </Button>
              </>
            ) : null}
            {isCreatorOnly && !showCreatorOverflow ? null : (
            <>
            <Button
              type="button"
              variant={showInternalNodes ? "default" : "ghost"}
              size="sm"
              className="rounded-full"
              onClick={() => setShowInternalNodes((current) => !current)}
            >
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              {showInternalNodes ? "Hide guides" : "Show guides"}
            </Button>
            <Button
              data-tutorial="settings"
              type="button"
              variant={showSettingsPanel ? "default" : "ghost"}
              size="sm"
              className="rounded-full"
              onClick={() => setShowSettingsPanel((current) => !current)}
            >
              {showSettingsPanel ? "Hide settings" : "Settings"}
            </Button>
            </>
            )}
            <Button
              data-tutorial="test"
              type="button"
              size="sm"
              className="rounded-full"
              disabled={!detail || startingRun}
              onClick={() => {
                setShowSettingsPanel(true);
                setShowRunnerPanel(true);
                if (isCreatorOnly) {
                  // Credit safety: creators always confirm the estimate first.
                  setShowTestCostConfirm(true);
                  return;
                }
                void handleRun();
              }}
            >
              {startingRun ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {isCreatorOnly ? "Test" : "Test run"}
            </Button>
          </div>
        </div>

        <div className={`grid min-w-0 grid-cols-1 gap-3 ${selectedNode ? "xl:grid-cols-[184px_minmax(0,1fr)_390px]" : "xl:grid-cols-[184px_minmax(0,1fr)]"}`}>
          <aside className="flex min-w-0 flex-col gap-3 rounded-3xl border border-border/50 bg-card/70 p-3 shadow-sm xl:self-start">
            <div className="space-y-2">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Add step</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={paletteSearch}
                  onChange={(event) => setPaletteSearch(event.target.value)}
                  placeholder="Search"
                  className="h-9 rounded-xl pl-8 text-xs"
                  aria-label="Search nodes"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              {[
                { key: "input", label: "Input", icon: Upload, onClick: () => void addNode("upload"), disabled: !detail || !!mutating, hint: "Uploaded or reference image" },
                { key: "reference", label: "Image Reference", icon: ImageDown, onClick: () => void addNode("reference"), disabled: !detail || !!mutating, hint: "Fixed image you upload now" },
                { key: "image", label: "Image", icon: ImageIcon, onClick: () => void addNode("image_gen"), disabled: !detail || !!mutating, hint: "nano-banana-pro image step" },
                { key: "video", label: "Video", icon: Film, onClick: () => void addNode("video_gen", paletteVideoModel), disabled: !detail || !!mutating, hint: `${resolveVideoModelOption(paletteVideoModel).label} step` },
                { key: "prompt", label: "Prompt", icon: Type, onClick: () => void addNode("prompt"), disabled: !detail || !!mutating, hint: "Reusable prompt text block" },
              ]
                .map((item) =>
                  isCreatorOnly && CREATOR_PALETTE_LABELS[item.key]
                    ? { ...item, ...CREATOR_PALETTE_LABELS[item.key] }
                    : item,
                )
                .filter((item) => item.label.toLowerCase().includes(paletteSearch.trim().toLowerCase()))
                .map((item) => (
                  <button
                    key={item.key}
                    data-tutorial={`palette-${item.key}`}
                    type="button"
                    title={item.hint}
                    disabled={item.disabled}
                    onClick={item.onClick}
                    className="group flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/60 bg-background/60 px-3 py-2.5 text-left transition hover:border-primary/60 hover:bg-primary/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card/70 text-muted-foreground transition group-hover:border-primary/50 group-hover:text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">{item.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{item.hint}</span>
                    </span>
                  </button>
                ))}
            </div>
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">New video model</p>
              <select
                value={paletteVideoModel}
                onChange={(event) => {
                  setPaletteVideoModel(event.target.value as VideoModelKey);
                  track("creator_video_model_selected", { model: event.target.value, surface: "palette" });
                }}
                className="h-9 w-full truncate rounded-xl border border-border bg-background px-2 text-[11px]"
                aria-label="Video model for new video steps"
              >
                {VIDEO_MODEL_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </div>
          </aside>

          <section className="min-w-0" data-tutorial="canvas">
            <GraphCanvas
              nodes={flowNodes}
              edges={flowEdges}
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNodeId}
              onNodeMoved={handleCanvasNodeMoved}
              onConnectNodes={(source, target, targetHandle) => void connectNodesOnCanvas(source, target, targetHandle)}
              onDeleteEdge={(edgeId) => void deleteEdge(edgeId)}
              onDeleteNode={(nodeId) => void deleteNodeById(nodeId)}
              focusNodeId={focusNodeId}
              onViewportApiReady={(api) => {
                viewportApiRef.current = api;
              }}
              className="h-[calc(100vh-9.5rem)] min-h-[520px]"
            />
          </section>


        {selectedNode ? (
        <aside className="w-full min-w-0 self-start rounded-3xl border border-border/50 bg-card/70 p-5 shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
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
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/50 bg-background/40 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Identity</p>
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
                      className="h-11 w-full max-w-full truncate rounded-xl border border-border bg-background px-4 text-sm"
                    >
                      <option value="upload">User Upload</option>
                      <option value="reference">Hidden Reference</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Slot Key</Label>
                    <Input value={draft.slotKey} onChange={(event) => setDraft((current) => current ? { ...current, slotKey: event.target.value } : current)} />
                    {duplicateSlotKey ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <span>Duplicate slot key — inputs with the same key merge into one. Make it unique.</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    slotKey: uniqueSlotKey(
                                      current.slotKey || current.displayLabel || "input",
                                      inputSlotKeys
                                        .filter((entry) => entry.id !== selectedNode.id)
                                        .map((entry) => entry.slotKey),
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          Make unique
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {draft.editorMode === "upload" ? (
                    <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label>Required input</Label>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {draft.required ? "Customers must upload this." : "Customers may skip this — the default asset is used instead."}
                          </p>
                        </div>
                        <Switch
                          checked={draft.required}
                          onCheckedChange={(checked) => setDraft((current) => current ? { ...current, required: checked } : current)}
                        />
                      </div>
                      {!draft.required ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Default asset (fallback)</Label>
                            {selectedNode.defaultAssetId ? (
                              <span className="font-mono text-[10px] text-muted-foreground">{selectedNode.defaultAssetId.slice(0, 8)}</span>
                            ) : null}
                          </div>
                          {referenceUploadPreview ? (
                            <img src={referenceUploadPreview} alt="Default asset preview" className="h-32 w-full rounded-xl border border-border/50 bg-background object-contain" />
                          ) : selectedNode.defaultAssetUrl ? (
                            <img src={selectedNode.defaultAssetUrl} alt={selectedNode.name} className="h-32 w-full rounded-xl border border-border/50 bg-background object-contain" />
                          ) : (
                            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/50 text-xs text-muted-foreground">
                              No default asset attached
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
                              title="Upload default asset"
                            >
                              {uploadingReference ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            </Button>
                          </div>
                          {optionalWithoutDefault ? (
                            <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                              Optional inputs need a default asset — without one, generation fails when a customer skips this input.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
              </div>

              {selectedNode.nodeType !== "user_input" ? (
                <div className="space-y-2 rounded-2xl border border-border/50 bg-background/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Prompt</p>
                  <Textarea
                    value={draft.prompt}
                    onChange={(event) => setDraft((current) => current ? { ...current, prompt: event.target.value } : current)}
                    className="min-h-[180px]"
                  />
                </div>
              ) : null}

              {selectedNode.nodeType === "video_gen" ? (
                <div className="space-y-3 rounded-2xl border border-border/50 bg-background/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Model</p>
                  <div className="space-y-2">
                    <Label>Video model</Label>
                    <select
                      value={draft.videoModel}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, videoModel: event.target.value as VideoModelKey }
                            : current,
                        )
                      }
                      className="h-11 w-full max-w-full truncate rounded-xl border border-border bg-background px-4 text-sm"
                    >
                      {VIDEO_MODEL_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {resolveVideoModelOption(draft.videoModel).family === "seedance" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Duration (seconds)</Label>
                        <Input
                          type="number"
                          min={4}
                          max={15}
                          value={draft.duration}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, duration: Math.min(15, Math.max(4, Number(event.target.value) || 4)) }
                                : current,
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Resolution</Label>
                        <select
                          value={draft.resolution}
                          onChange={(event) =>
                            setDraft((current) => current ? { ...current, resolution: event.target.value } : current)
                          }
                          className="h-11 w-full max-w-full truncate rounded-xl border border-border bg-background px-4 text-sm"
                        >
                          {SEEDANCE_RESOLUTION_OPTIONS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Aspect ratio</Label>
                        <select
                          value={draft.aspectRatio}
                          onChange={(event) =>
                            setDraft((current) => current ? { ...current, aspectRatio: event.target.value } : current)
                          }
                          className="h-11 w-full max-w-full truncate rounded-xl border border-border bg-background px-4 text-sm"
                        >
                          {SEEDANCE_ASPECT_OPTIONS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-3 self-end rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.generateAudio}
                          onChange={(event) =>
                            setDraft((current) => current ? { ...current, generateAudio: event.target.checked } : current)
                          }
                        />
                        Generate audio
                      </label>
                    </div>
                  ) : resolveVideoModelOption(draft.videoModel).family === "kling3" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Duration (seconds)</Label>
                        <Input
                          type="number"
                          min={3}
                          max={15}
                          value={draft.duration}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, duration: Math.min(15, Math.max(3, Number(event.target.value) || 5)) }
                                : current,
                            )
                          }
                        />
                      </div>
                      <label className="flex items-center gap-3 self-end rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.generateAudio}
                          onChange={(event) =>
                            setDraft((current) => current ? { ...current, generateAudio: event.target.checked } : current)
                          }
                        />
                        Generate audio
                      </label>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Locked to vertical 9:16 at 5 seconds.</p>
                  )}

                  <p className="text-[11px] uppercase tracking-[0.16em] text-primary">
                    ≈ {estimateVideoCredits(draft)} credits per video
                  </p>
                </div>
              ) : null}


              {(selectedNode.nodeType === "image_gen" || selectedNode.nodeType === "video_gen") ? (
                <div className="space-y-2 rounded-2xl border border-border/50 bg-background/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Output</p>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.outputExposed === true}
                      onChange={(event) => setDraft((current) => current ? { ...current, outputExposed: event.target.checked } : current)}
                    />
                    Expose as final deliverable
                  </label>
                </div>
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
                <div className="space-y-2 rounded-2xl border border-border/50 bg-background/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Inputs</p>
                  <div className="flex items-center justify-between gap-3">
                    <Label>Connection order</Label>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-foreground/70">Drag to reorder · Ref 1 first</span>
                  </div>
                  <div className="space-y-2">
                    {selectedNode.incoming.map((edge, index) => (
                      <div
                        key={`${edge.edgeId ?? edge.sourceNodeId}-${edge.sortOrder ?? index}`}
                        draggable={!!edge.edgeId && !mutating}
                        onDragStart={() => setDraggingEdgeIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggingEdgeIndex === null) return;
                          const from = draggingEdgeIndex;
                          setDraggingEdgeIndex(null);
                          void moveIncomingEdgeToIndex(from, index);
                        }}
                        onDragEnd={() => setDraggingEdgeIndex(null)}
                        className={`flex flex-col gap-3 rounded-2xl border bg-background/60 px-4 py-3 text-sm ${
                          draggingEdgeIndex === index ? "border-primary/60 opacity-70" : "border-border/60"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Move className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-primary/80" />
                          <div className="min-w-0 flex-1">
                            <span className="mr-2 inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                              Ref {index + 1}
                            </span>
                            <span className="break-words font-semibold text-foreground">{edge.sourceName}</span>
                            <p className="mt-1 text-[11px] text-foreground/60">Reference position {index + 1}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="border-border text-foreground hover:bg-primary/15 hover:text-primary"
                            onClick={() => void reorderEdge(edge.edgeId, -1)}
                            disabled={!edge.edgeId || index === 0 || !!mutating}
                            title="Move incoming earlier"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="border-border text-foreground hover:bg-primary/15 hover:text-primary"
                            onClick={() => void reorderEdge(edge.edgeId, 1)}
                            disabled={!edge.edgeId || index === selectedNode.incoming.length - 1 || !!mutating}
                            title="Move incoming later"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="ml-auto border-destructive/60 bg-destructive/10 font-semibold text-destructive-foreground hover:bg-destructive/25 hover:text-destructive-foreground"
                            onClick={() => void deleteEdge(edge.edgeId)}
                            disabled={!edge.edgeId || !!mutating}
                            title="Delete incoming connection"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail?.nodes.length ? (
                <details className="space-y-2 rounded-2xl border border-border/50 bg-background/40 p-4">
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Add connection manually
                  </summary>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Drag from a step's output handle to an input handle on the canvas — this is the fallback.
                  </p>
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
                    placeholder={`auto: ${inferredIncomingTargetParam}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to auto-map this connection to <span className="font-mono text-foreground/80">{inferredIncomingTargetParam}</span>.
                  </p>
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
                </details>
              ) : null}

              <div className="space-y-2 rounded-2xl border border-border/50 bg-background/40 p-4">
                {(selectedNode.nodeType === "image_gen" || selectedNode.nodeType === "video_gen") ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void runSingleNode(selectedNode.id)}
                    disabled={selectedNodeRun?.status === "queued" || selectedNodeRun?.status === "running"}
                  >
                    {selectedNodeRun?.status === "queued" || selectedNodeRun?.status === "running" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {selectedNodeRun?.status === "queued" || selectedNodeRun?.status === "running"
                      ? "Generating this step…"
                      : "Run this step"}
                    {selectedNodeRun?.estimatedCredits ? ` · ≈ ${selectedNodeRun.estimatedCredits} credits` : ""}
                  </Button>
                ) : null}
                <Button type="button" className="w-full" onClick={() => void saveNode()} disabled={savingNode}>
                  {savingNode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Step
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void deleteSelectedNode()}
                  disabled={!!mutating}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete step and connections
                </Button>
              </div>

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
              Pick a step on the canvas to edit it.
            </div>
          )}
        </aside>
        ) : null}
        </div>
        {showSettingsPanel ? (
        <section className="w-full">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Canvas</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Template Canvas</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Create, edit, and test your campaign templates.
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 text-xs sm:w-auto">
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

          <div className="mt-5 rounded-3xl border border-primary/25 bg-card/80 p-5 shadow-[0_18px_50px_-30px_hsl(var(--primary)/0.55)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Start here</p>
                <p className="mt-1 text-base font-semibold text-foreground">Create a new canvas or open an existing template</p>
              </div>
              <Button type="button" variant="outline" className="h-10 rounded-2xl border-primary/40 bg-primary/10 font-semibold text-foreground hover:bg-primary/20" onClick={() => setShowGallery(true)}>
                <Layers className="mr-2 h-4 w-4 text-primary" />
                Browse Gallery
              </Button>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.16em] text-foreground/75">New canvas name</Label>
                <Input
                  value={newTemplateName}
                  onChange={(event) => setNewTemplateName(event.target.value)}
                  placeholder="Template name"
                  className="h-11 rounded-2xl"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.16em] text-foreground/75">Description</Label>
                <Input
                  value={newTemplateDescription}
                  onChange={(event) => setNewTemplateDescription(event.target.value)}
                  placeholder="Optional short description"
                  className="h-11 rounded-2xl"
                />
              </div>
              <Button
                type="button"
                className="h-11 rounded-2xl font-semibold lg:w-auto"
                onClick={() => void createTemplate()}
                disabled={!!mutating || !hasTemplateName}
              >
                {mutating === "create-template" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Blank canvas
              </Button>
            </div>
            <p className="mt-2 text-xs text-foreground/65">
              Starts an empty graph. Build it by adding steps from the palette and dragging connections.
            </p>
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
                  {hasAppAccess && detail && !detail.isActive ? (
                    <QuickPublishButton
                      versionId={detail.versionId}
                      templateName={detail.templateName}
                      versionNumber={detail.versionNumber}
                      building={phase === "running"}
                      onRunTest={() => setShowRunnerPanel(true)}
                      onPublished={() => refreshAfterMutation(detail.versionId)}
                    />
                  ) : null}

                  {canPublishTemplates && testingGateSatisfied && detail && !detail.isActive ? (
                    <Button type="button" size="sm" onClick={() => void activateCurrentVersion()} disabled={!!mutating}>
                      {mutating === "activate-version" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Publish Live
                    </Button>
                  ) : null}
                  {!canPublishTemplates && detail ? (
                    detail.reviewStatus === "Submitted" ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/[0.08] px-3 py-1.5 text-xs font-semibold text-amber-100">
                        <Clock3 className="h-3.5 w-3.5" />
                        Submitted — pending review
                      </span>
                    ) : (
                      <Button data-tutorial="submit-for-review" type="button" size="sm" onClick={() => void submitForReview()} disabled={!!mutating}>
                        {mutating === "submit-for-review" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Submit for review
                      </Button>
                    )
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

          <div className="mt-5 rounded-3xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80">Manage Templates</p>
                <p className="mt-1 truncate text-sm text-foreground/65">
                  {selectedTemplate ? `${selectedTemplate.templateName} · v${selectedTemplate.versionNumber}` : "No template selected yet"}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
                selectedTemplateHasLiveVersion
                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-100"
                  : "border-amber-300/50 bg-amber-300/15 text-amber-100"
              }`}>
                {selectedTemplateHasLiveVersion ? "Live on site" : "Draft"}
              </span>
            </div>
            <div className="mt-4 grid gap-4 rounded-2xl border border-border/50 bg-background/45 p-4 lg:grid-cols-[190px_minmax(0,1fr)_auto]">
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/70">
                <div className="aspect-[9/16] bg-background">
                  {templateCoverPreviewUrl ? (
                    templateMetaPreviewAssetType === "video" && !templateMetaCoverPreview ? (
                      <video src={templateCoverPreviewUrl} className="h-full w-full object-cover" muted loop playsInline autoPlay />
                    ) : (
                      <img src={templateCoverPreviewUrl} alt="Template thumbnail preview" className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_42%)] px-4 text-center text-foreground/70">
                      <ImageIcon className="h-9 w-9 text-cyan-100/55" />
                      <span className="text-xs leading-5">No thumbnail set</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid min-w-0 content-start gap-3" data-tutorial="template-basics">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input
                      value={templateMetaName}
                      onChange={(event) => setTemplateMetaName(event.target.value)}
                      className="h-11 rounded-xl"
                      disabled={!selectedTemplate}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <div className={`flex h-11 items-center rounded-xl border px-3 text-sm ${
                      selectedTemplateHasLiveVersion
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-300/30 bg-amber-400/10 text-amber-100"
                    }`}>
                      {selectedTemplateHasLiveVersion ? "Live on site" : "Unpublished"}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={templateMetaDescription}
                    onChange={(event) => setTemplateMetaDescription(event.target.value)}
                    placeholder="Short card and selected-template description"
                    className="min-h-[86px] rounded-xl"
                    disabled={!selectedTemplate}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition ${
                    selectedTemplate ? "cursor-pointer hover:border-primary/50 hover:text-foreground" : "cursor-not-allowed opacity-60"
                  }`}>
                    <Upload className="h-4 w-4" />
                    {templateMetaCoverFile ? "Replace pending cover" : "Upload cover"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!selectedTemplate}
                      onChange={(event) => handleTemplateMetaCoverFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {templateMetaCoverFile ? (
                    <Button type="button" variant="outline" onClick={() => handleTemplateMetaCoverFile(null)}>
                      Clear Pending
                    </Button>
                  ) : null}
                  {templateMetaPreviewUrl ? (
                    <Button type="button" variant="outline" onClick={() => void clearTemplateCover()} disabled={!!mutating || !selectedTemplate}>
                      Clear Saved Cover
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col justify-between gap-3 lg:w-[200px]">
                <Button type="button" onClick={() => void saveTemplateMetadata()} disabled={!selectedTemplate || !!mutating || !templateMetaName.trim()}>
                  {mutating === "save-template-meta" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Details
                </Button>
                {canPublishTemplates ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-amber-300/30 bg-amber-300/[0.06] text-amber-100 hover:bg-amber-300/10"
                  onClick={() => void unpublishCurrentTemplate()}
                  disabled={!selectedTemplate || !!mutating || !selectedTemplateHasLiveVersion}
                >
                  {mutating === "unpublish-template" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <EyeOff className="mr-2 h-4 w-4" />}
                  Unpublish Live
                </Button>
                ) : null}
              </div>
            </div>
            {selectedTemplate ? (
              <div className="mt-4">
                <CreatorRoyaltyPanel
                  templateId={selectedTemplate.templateId}
                  outputCount={
                    Number(selectedTemplate.counts?.imageOutputs ?? 0) +
                    Number(selectedTemplate.counts?.videoOutputs ?? 0)
                  }
                  invoke={invokeWorkbench}
                />
              </div>
            ) : null}
            {canPublishTemplates && detail ? (

              <div className="mt-4">
                <CastConfigPanel
                  nodes={detail.nodes.map((node) => ({ id: node.id, name: node.name, nodeType: node.nodeType }))}
                  castConfig={parseCastConfig(detail.castConfig)}
                  saving={mutating === "save-cast-config"}
                  cloning={mutating === "clone-version-for-cast"}
                  isActiveVersion={detail.isActive}
                  disabled={!!mutating && mutating !== "save-cast-config" && mutating !== "clone-version-for-cast"}
                  onSave={saveCastConfig}
                  onCloneForCast={cloneVersionForCast}
                />

              </div>
            ) : null}
            <div className="mt-4 grid gap-4 xl:grid-cols-12">

            <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-4 shadow-sm xl:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/80">Manage Existing Template</p>
              <div className="mt-3 space-y-3">
            <Label className="text-foreground/80">Template</Label>
            <button
              type="button"
              onClick={() => setShowGallery(true)}
              className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 text-left text-sm transition hover:border-primary/50"
            >
              <span className="truncate">
                {selectedTemplate ? `${selectedTemplate.templateName} · v${selectedTemplate.versionNumber}` : "Browse templates"}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                <Layers className="h-3.5 w-3.5" />
                Gallery
              </span>
            </button>
            {versionOptions.length > 1 ? (
              <div className="grid gap-2">
                <Label className="text-xs text-foreground/80">Version</Label>
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
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/70">Validation Queue</p>
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
                  <span className="text-foreground/70">Selected version</span>
                  <span className="font-semibold">
                    v{detail?.versionNumber ?? selectedTemplate?.versionNumber ?? "?"}{detail?.isActive || selectedTemplate?.isActive ? " live" : " draft"}
                  </span>
                </div>
              </div>
            ) : null}
              </div>
            </div>

          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm xl:col-span-6">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/80">Version Control</span>
                <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/70 group-open:hidden">Show</span>
                <span className="hidden rounded-full border border-border/70 bg-background/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/70 group-open:inline">Hide</span>
              </summary>
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
              {canPublishTemplates && detail && !detail.isActive ? (
                <Button type="button" size="sm" onClick={() => void activateCurrentVersion()} disabled={!!mutating || !testingGateSatisfied}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Publish Version Live
                </Button>
              ) : null}
              {hasAppAccess && detail && !detail.isActive ? (
                <QuickPublishButton
                  versionId={detail.versionId}
                  templateName={detail.templateName}
                  versionNumber={detail.versionNumber}
                  building={phase === "running"}
                  variant="outline"
                  onRunTest={() => setShowRunnerPanel(true)}
                  onPublished={() => refreshAfterMutation(detail.versionId)}
                />
              ) : null}

              {!canPublishTemplates && detail ? (
                detail.reviewStatus === "Submitted" ? (
                  <p className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs font-medium text-amber-100">
                    Template submitted ✓ — We'll notify you when it's approved.
                  </p>
                ) : (
                  <Button type="button" size="sm" onClick={() => void submitForReview()} disabled={!!mutating}>
                    {mutating === "submit-for-review" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Submit for review →
                  </Button>
                )
              ) : null}
              {testingGateActive && !testingGateSatisfied ? (
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100">
                  {publishGateReasons.join(" ")}
                </p>
              ) : null}
            </div>
            </details>
          </div>


          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 text-sm shadow-sm xl:col-span-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/80">Readiness</p>
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
            <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm xl:col-span-12">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/80">Run Selected Template</p>
                  <p className="mt-1 text-xs text-foreground/65">{runInputs.length} upload input{runInputs.length === 1 ? "" : "s"} required · secondary to editing</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="border-border font-semibold text-foreground hover:bg-primary/15" onClick={() => setShowRunnerPanel((current) => !current)}>
                  {showRunnerPanel ? "Hide" : "Open"}
                </Button>
              </div>
              {showRunnerPanel ? (
              <div className="mt-4 space-y-4">
                {runInputs.map((input) => (
                  <div key={input.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>{input.name}</Label>
                      <span className="text-[11px] uppercase tracking-[0.15em] text-foreground/70">{input.expected}</span>
                    </div>
                    {previews[input.id] ? (
                      <img src={previews[input.id]} alt={input.name} className="h-28 w-full rounded-2xl border border-border/50 bg-background object-contain" />
                    ) : input.defaultAssetUrl ? (
                      <img src={input.defaultAssetUrl} alt={`${input.name} default`} className="h-28 w-full rounded-2xl border border-border/50 bg-background object-contain" />
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-background/50 text-sm text-foreground/70">
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
                  <div className="rounded-xl border border-border/50 bg-background/60 p-3 text-sm text-foreground/70">
                    This version has no user upload nodes.
                  </div>
                ) : null}
                {parseCastConfig(detail.castConfig) ? (
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-100">Cast (test)</p>
                      {selectedCastAvatarId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-foreground/70 hover:text-foreground"
                          onClick={() => setSelectedCastAvatarId(null)}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {castLoading ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-foreground/70">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading avatars…
                      </p>
                    ) : castAvatars.length === 0 ? (
                      <p className="mt-2 text-xs text-foreground/70">
                        No avatars yet — create one in My Avatars first.
                      </p>
                    ) : (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {castAvatars.map((avatar) => {
                          // FT14b — a FUSE avatar without an approved master portrait
                          // stays visible to admins but is not selectable to run.
                          const needsCanonical =
                            avatar.source_type === "FUSE" && !isCanonicalReady(avatar);
                          return (
                          <button
                            key={avatar.id}
                            type="button"
                            disabled={needsCanonical}
                            title={needsCanonical ? CANONICAL_REQUIRED_LABEL : avatar.name}
                            onClick={() => setSelectedCastAvatarId(avatar.id)}
                            className={cn(
                              "group relative overflow-hidden rounded-xl border bg-background text-left transition-colors",
                              needsCanonical
                                ? "cursor-not-allowed border-amber-300/40 opacity-60"
                                : selectedCastAvatarId === avatar.id
                                ? "border-cyan-300/70"
                                : "border-border/50 hover:border-white/25",
                            )}
                          >
                            <div className="relative aspect-square bg-black/40">
                              {avatar.thumbnail_url ? (
                                <img
                                  src={avatar.thumbnail_url}
                                  alt={avatar.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.12em] text-foreground/50">
                                  No image
                                </div>
                              )}
                            </div>
                            <p className="truncate p-1.5 text-[10px] font-medium text-foreground">{avatar.name}</p>
                            {needsCanonical ? (
                              <p className="px-1.5 pb-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-200">
                                {CANONICAL_REQUIRED_LABEL}
                              </p>
                            ) : null}
                          </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
                <Button type="button" className="w-full" onClick={() => void handleRun()} disabled={startingRun}>
                  {startingRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                  Run From Canvas
                </Button>
              </div>
              ) : (
                <div className="mt-4 rounded-xl border border-border/50 bg-background/60 px-3 py-2 text-xs text-foreground/70">
                  Keep this closed while editing the graph. Open it only when testing a live template run.
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                  <p className="text-foreground/70">Status</p>
                  <p className="mt-1 font-semibold uppercase text-foreground">{phase}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                  <p className="text-foreground/70">Job</p>
                  <p className="mt-1 font-mono text-foreground">{jobId ? jobId.slice(0, 8) : "none"}</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2">
                  <p className="text-foreground/70">Outputs</p>
                  <p className="mt-1 font-semibold text-foreground">{job?.outputs.length ?? 0}</p>
                </div>
              </div>
              {error ? <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
              <div className="mt-4 rounded-2xl border border-border/50 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/70">Latest Job Outputs</p>
                    <p className="mt-1 text-xs text-foreground/70">
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
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
                            {output.type} {output.outputNumber ? `#${output.outputNumber}` : ""}
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">{output.label}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-border/40 bg-background/50 p-3 text-xs text-foreground/70">
                    No outputs loaded for this version yet. Click refresh after a run completes.
                  </div>
                )}
              </div>
            </div>
          ) : null}
          </div>
          </div>
        </section>
        ) : null}
      </div>
    </SiteShell>
  );
};

export default TemplateCanvas;
