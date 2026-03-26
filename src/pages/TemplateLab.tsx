import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Download, EyeOff, Film, Loader2, LockKeyhole, RefreshCw, Upload } from "lucide-react";
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
  counts: {
    inputs: number;
    imageSteps: number;
    videoSteps: number;
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
  editor: {
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
  isActive: boolean;
  nodes: TemplateDetailNode[];
};

type JobStep = {
  id: string;
  label: string;
  type: string;
  status: string;
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
  versionNumber: number | null;
  outputs: Array<{ label: string; type: "image" | "video"; url: string }>;
};

type EditorDraft = {
  displayLabel: string;
  prompt: string;
  expected: string;
  editorMode: "upload" | "reference" | "workflow";
  slotKey: string;
};

const ACCESS_CODE_STORAGE_KEY = "fuse-lab-access-code";
const MAX_DIMENSION = 2048;

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

const TemplateLab = () => {
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
  const [inspectorTab, setInspectorTab] = useState("map");
  const [selectedInspectorNodeId, setSelectedInspectorNodeId] = useState<string | null>(null);
  const [hiddenInspectorNodeIds, setHiddenInspectorNodeIds] = useState<string[]>([]);
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);
  const [savingNodeEdits, setSavingNodeEdits] = useState(false);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLoadedCodeRef = useRef<string | null>(null);
  const isAuthenticatedLab = !!session?.access_token && hasAppAccess;

  useEffect(() => {
    const savedCode = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
    if (savedCode) setAccessCode(savedCode);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, accessCode);
  }, [accessCode]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.versionId === selectedVersionId) ?? null,
    [templates, selectedVersionId],
  );

  const outputImage = useMemo(
    () => job?.outputs.find((item) => item.type === "image")?.url ?? null,
    [job],
  );
  const outputVideo = useMemo(
    () => job?.outputs.find((item) => item.type === "video")?.url ?? null,
    [job],
  );

  const flowLanes = useMemo(() => {
    if (!templateDetail) return [];

    const lanes = [
      { key: "uploads", title: "Uploads", nodes: [] as TemplateDetailNode[] },
      { key: "references", title: "References", nodes: [] as TemplateDetailNode[] },
      { key: "images", title: "Image Steps", nodes: [] as TemplateDetailNode[] },
      { key: "videos", title: "Video Steps", nodes: [] as TemplateDetailNode[] },
      { key: "other", title: "Other", nodes: [] as TemplateDetailNode[] },
    ];

    if (selectedTemplate) {
      lanes[0].nodes.push(
        ...selectedTemplate.inputs.map((input) => ({
          id: `upload-${input.id}`,
          name: input.name,
          nodeType: "user_input",
          prompt: null,
          expected: input.expected,
          defaultAssetUrl: null,
          defaultAssetType: null,
          incoming: [],
          summary: `${input.name} is a dynamic upload slot. The user must provide this media at run time.`,
        })),
      );
    }

    for (const node of templateDetail.nodes) {
      const summary = node.summary.toLowerCase();
      if (node.nodeType === "user_input") {
        if (summary.includes("built-in reference") || !!node.defaultAssetUrl) {
          lanes[1].nodes.push(node);
        }
        continue;
      }

      if (node.nodeType === "image_gen") {
        lanes[2].nodes.push(node);
        continue;
      }

      if (node.nodeType === "video_gen") {
        lanes[3].nodes.push(node);
        continue;
      }

      lanes[4].nodes.push(node);
    }

    return lanes.filter((lane) => lane.nodes.length > 0);
  }, [selectedTemplate, templateDetail]);

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

  const buildAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };

    if (isAuthenticatedLab) {
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
  }, [accessCode, isAuthenticatedLab, session?.access_token]);

  const loadTemplates = useCallback(async () => {
    if (!isAuthenticatedLab && !accessCode.trim()) {
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
  }, [accessCode, buildAuthHeaders, isAuthenticatedLab]);

  const loadRecentRuns = useCallback(async () => {
    if (!isAuthenticatedLab) {
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
  }, [buildAuthHeaders, isAuthenticatedLab]);

  useEffect(() => {
    const loadKey = isAuthenticatedLab ? `auth:${session?.user.id}` : accessCode.trim();

    if (!loadKey) {
      lastLoadedCodeRef.current = null;
      setTemplates([]);
      setSelectedVersionId("");
      return;
    }

    if (lastLoadedCodeRef.current === loadKey) return;
    lastLoadedCodeRef.current = loadKey;
    void loadTemplates();
  }, [accessCode, isAuthenticatedLab, loadTemplates, session?.user.id]);

  useEffect(() => {
    if (!isAuthenticatedLab) {
      setRecentRuns([]);
      return;
    }

    void loadRecentRuns();
  }, [isAuthenticatedLab, loadRecentRuns, session?.user.id]);

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

    setEditorDraft({
      displayLabel: selectedInspectorNode.editor.label ?? selectedInspectorNode.name,
      prompt: selectedInspectorNode.prompt ?? "",
      expected: selectedInspectorNode.editor.expected ?? selectedInspectorNode.expected ?? "",
      editorMode: selectedInspectorNode.editor.mode,
      slotKey: selectedInspectorNode.editor.slotKey ?? "",
    });
  }, [selectedInspectorNode]);

  const handleFile = useCallback(async (inputId: string, nextFile: File | null) => {
    if (previews[inputId]) {
      URL.revokeObjectURL(previews[inputId]);
    }

    if (!nextFile) {
      setFiles((current) => ({ ...current, [inputId]: null }));
      setPreviews((current) => {
        const next = { ...current };
        delete next[inputId];
        return next;
      });
      return;
    }

    try {
      const normalized = await normalizeFile(nextFile);
      setFiles((current) => ({ ...current, [inputId]: normalized }));
      setPreviews((current) => ({ ...current, [inputId]: URL.createObjectURL(normalized) }));
    } catch (fileError) {
      const message = fileError instanceof Error ? fileError.message : "Could not prepare image";
      toast({ title: "Image error", description: message, variant: "destructive" });
    }
  }, [normalizeFile, previews]);

  const fetchJobStatus = useCallback(async (nextJobId: string) => {
    const headers = await buildAuthHeaders();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${nextJobId}`,
      { headers },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Could not load job status");

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
  }, [buildAuthHeaders]);

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

  useEffect(() => {
    if (!isAuthenticatedLab) return;
    if (phase !== "complete" && phase !== "error") return;
    void loadRecentRuns();
  }, [isAuthenticatedLab, loadRecentRuns, phase]);

  useEffect(() => {
    if (!isAuthenticatedLab) return;
    if (jobId) return;
    if (job) return;

    const activeRun = recentRuns.find((run) => run.status === "running" || run.status === "queued");
    if (!activeRun) return;

    void fetchJobStatus(activeRun.id);
  }, [fetchJobStatus, isAuthenticatedLab, job, jobId, recentRuns]);

  const handleRun = useCallback(async () => {
    if (!selectedTemplate) {
      toast({ title: "Missing template", description: "Load the catalog and choose a template first.", variant: "destructive" });
      return;
    }

    if (!isAuthenticatedLab && !accessCode.trim()) {
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
  }, [accessCode, buildAuthHeaders, files, isAuthenticatedLab, loadRecentRuns, pollJob, selectedTemplate]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-28">
        <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
          <section className="rounded-3xl border border-border/50 bg-card/70 p-8 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Lab</p>
                <h1 className="mt-2 font-display text-4xl font-black tracking-tight">Template Runner</h1>
                <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                  Pick any active template, upload the required inputs, and run the graph against the live Supabase backend.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,auto] md:items-end">
              {isAuthenticatedLab ? (
                <div className="rounded-2xl border border-border/40 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                  Signed in with tester access. The runner is using your Supabase session.
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
                  setSelectedVersionId(event.target.value);
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
                    {template.templateName} · {template.counts.inputs} inputs · {template.counts.imageSteps} image · {template.counts.videoSteps} video
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate ? (
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

            {templateDetail ? (
              <div className="mt-8 rounded-3xl border border-border/40 bg-background/50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Template Wiring</p>
                    <h3 className="mt-2 text-xl font-bold">{templateDetail.templateName}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Audit the real upload slots, fixed references, and generation steps without the current page dumping every detail at once.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hiddenInspectorNodeIds.length ? (
                      <Button type="button" size="sm" variant="outline" onClick={restoreInspectorView}>
                        Reset View
                      </Button>
                    ) : null}
                    {loadingTemplateDetail ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
                  </div>
                </div>

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
                                ? "Use User Upload for media the tester must provide at run time. Use Hidden Reference only for fixed demo/reference media that should stay in the template."
                                : "This edits the stored display label and prompt for the node. It does not change edge wiring yet."}
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <Button type="button" onClick={() => void saveNodeEdits()} disabled={savingNodeEdits}>
                                {savingNodeEdits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Save Node
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  if (!selectedInspectorNode) return;
                                  setEditorDraft({
                                    displayLabel: selectedInspectorNode.editor.label ?? selectedInspectorNode.name,
                                    prompt: selectedInspectorNode.prompt ?? "",
                                    expected: selectedInspectorNode.editor.expected ?? selectedInspectorNode.expected ?? "",
                                    editorMode: selectedInspectorNode.editor.mode,
                                    slotKey: selectedInspectorNode.editor.slotKey ?? "",
                                  });
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
              {isAuthenticatedLab ? (
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
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job?.progress ?? (phase === "complete" ? 100 : 0)}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{jobId ? `Job ${jobId.slice(0, 8)}...` : phase === "running" ? "Starting run..." : "No job started yet"}</span>
                  <span>{job?.progress ?? 0}%</span>
                </div>
              </div>

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

              {outputImage ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Generated Image</p>
                    <Button asChild size="sm" variant="outline">
                      <a href={outputImage} download="template-output.png">
                        <Download className="mr-2 h-4 w-4" />
                        Download Image
                      </a>
                    </Button>
                  </div>
                  <img src={outputImage} alt="Generated output" className="rounded-2xl border border-border/40" />
                </div>
              ) : null}

              {outputVideo ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Generated Video</p>
                    <Button asChild size="sm" variant="outline">
                      <a href={outputVideo} download="template-output.mp4">
                        <Download className="mr-2 h-4 w-4" />
                        Download Video
                      </a>
                    </Button>
                  </div>
                  <video src={outputVideo} controls className="w-full rounded-2xl border border-border/40" />
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
