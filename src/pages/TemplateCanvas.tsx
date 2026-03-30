import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, Move, RefreshCw, Save, Wand2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

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
    outputExposed?: boolean | null;
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
  edges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    targetParam: string | null;
  }>;
};

type JobStep = {
  id: string;
  label: string;
  type: string;
  status: string;
  prompt: string | null;
  outputUrl: string | null;
  error: string | null;
  executionTimeMs: number | null;
};

type JobStatus = {
  status: string;
  progress: number;
  error: string | null;
  outputs: Array<{ label: string; type: "image" | "video"; url: string }>;
  steps: JobStep[];
};

type NodeDraft = {
  displayLabel: string;
  expected: string;
  prompt: string;
  editorMode: "upload" | "reference" | "workflow";
  slotKey: string;
  outputExposed: boolean | null;
};

type Point = { x: number; y: number };

const NODE_WIDTH = 240;
const NODE_HEIGHT = 162;
const LAYOUT_KEY_PREFIX = "fuse-template-canvas-layout-v1";
const LANE_ORDER = ["uploads", "references", "internals", "images", "videos", "other"] as const;
const LANE_LABELS: Record<(typeof LANE_ORDER)[number], string> = {
  uploads: "User Uploads",
  references: "Hidden References",
  internals: "Internal Scene Locks",
  images: "Image Steps",
  videos: "Video Steps",
  other: "Other",
};

function getLaneKey(node: TemplateDetailNode): (typeof LANE_ORDER)[number] {
  if (node.nodeType === "user_input") {
    if (node.editor?.mode === "upload") return "uploads";
    if (node.editor?.mode === "reference") return "references";
    return "internals";
  }
  if (node.nodeType === "image_gen") return "images";
  if (node.nodeType === "video_gen") return "videos";
  return "other";
}

function storageKeyForVersion(versionId: string) {
  return `${LAYOUT_KEY_PREFIX}:${versionId}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "Pending";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function bezierPath(from: Point, to: Point) {
  const delta = Math.max(90, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + delta} ${from.y}, ${to.x - delta} ${to.y}, ${to.x} ${to.y}`;
}

const TemplateCanvas = () => {
  const { session, hasAppAccess } = useAuth();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [savingNode, setSavingNode] = useState(false);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [startingRun, setStartingRun] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragRef = useRef<{ nodeId: string; origin: Point; pointerStart: Point } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const buildAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const loadTemplates = useCallback(async () => {
    if (!hasAppAccess) return;
    setLoadingTemplates(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lab-template-catalog`, {
        headers: await buildAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load templates");
      setTemplates(data.templates ?? []);
      setSelectedVersionId((current) => current || data.templates?.[0]?.versionId || "");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Could not load templates";
      toast({ title: "Canvas error", description: message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  }, [buildAuthHeaders, hasAppAccess]);

  const loadTemplateDetail = useCallback(async (versionId: string) => {
    if (!versionId) {
      setTemplateDetail(null);
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
      setTemplateDetail(data);
      setSelectedNodeId((current) => current && data.nodes.some((node: TemplateDetailNode) => node.id === current) ? current : data.nodes?.[0]?.id ?? null);
    } catch (detailError) {
      const message = detailError instanceof Error ? detailError.message : "Could not load template detail";
      setTemplateDetail(null);
      toast({ title: "Canvas error", description: message, variant: "destructive" });
    } finally {
      setLoadingDetail(false);
    }
  }, [buildAuthHeaders]);

  const fetchJobStatus = useCallback(async (nextJobId: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${encodeURIComponent(nextJobId)}`,
      { headers: await buildAuthHeaders() },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "Could not load job status");
    setJobId(nextJobId);
    setJob(data);
    setPhase(data.status === "complete" ? "complete" : data.status === "failed" ? "error" : "running");
    setError(data.error ?? null);
    return data as JobStatus;
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
    void loadTemplateDetail(selectedVersionId);
  }, [loadTemplateDetail, selectedVersionId]);

  useEffect(() => {
    if (!templateDetail?.versionId) return;
    const raw = window.localStorage.getItem(storageKeyForVersion(templateDetail.versionId));
    if (!raw) {
      setPositions({});
      return;
    }

    try {
      setPositions(JSON.parse(raw));
    } catch {
      setPositions({});
    }
  }, [templateDetail?.versionId]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.versionId === selectedVersionId) ?? null,
    [selectedVersionId, templates],
  );

  const selectedNode = useMemo(
    () => templateDetail?.nodes.find((node) => node.id === selectedNodeId) ?? templateDetail?.nodes[0] ?? null,
    [selectedNodeId, templateDetail?.nodes],
  );

  useEffect(() => {
    if (!selectedNode) {
      setNodeDraft(null);
      return;
    }

    setNodeDraft({
      displayLabel: selectedNode.editor?.label ?? selectedNode.name,
      expected: selectedNode.editor?.expected ?? selectedNode.expected ?? "",
      prompt: selectedNode.prompt ?? "",
      editorMode: selectedNode.editor?.mode ?? (selectedNode.nodeType === "user_input" ? "upload" : "workflow"),
      slotKey: selectedNode.editor?.slotKey ?? "",
      outputExposed: typeof selectedNode.editor?.outputExposed === "boolean" ? selectedNode.editor.outputExposed : null,
    });
  }, [selectedNode]);

  const graphNodes = useMemo(() => {
    if (!templateDetail) return [];

    const laneBuckets = new Map<(typeof LANE_ORDER)[number], TemplateDetailNode[]>();
    for (const lane of LANE_ORDER) laneBuckets.set(lane, []);

    for (const node of templateDetail.nodes) {
      laneBuckets.get(getLaneKey(node))?.push(node);
    }

    const next: Array<TemplateDetailNode & { position: Point; lane: string }> = [];
    LANE_ORDER.forEach((laneKey, laneIndex) => {
      const laneNodes = (laneBuckets.get(laneKey) ?? []).sort((a, b) => a.name.localeCompare(b.name));
      laneNodes.forEach((node, index) => {
        next.push({
          ...node,
          lane: laneKey,
          position: positions[node.id] ?? {
            x: 80 + laneIndex * 300,
            y: 72 + index * 210,
          },
        });
      });
    });

    return next;
  }, [positions, templateDetail]);

  const graphNodeMap = useMemo(
    () => new Map(graphNodes.map((node) => [node.id, node])),
    [graphNodes],
  );

  const canvasSize = useMemo(() => {
    if (!graphNodes.length) return { width: 1600, height: 960 };
    const maxX = Math.max(...graphNodes.map((node) => node.position.x + NODE_WIDTH));
    const maxY = Math.max(...graphNodes.map((node) => node.position.y + NODE_HEIGHT));
    return {
      width: Math.max(1600, maxX + 120),
      height: Math.max(960, maxY + 120),
    };
  }, [graphNodes]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!dragRef.current || !templateDetail?.versionId) return;

    const deltaX = event.clientX - dragRef.current.pointerStart.x;
    const deltaY = event.clientY - dragRef.current.pointerStart.y;
    const nextPosition = {
      x: Math.max(24, dragRef.current.origin.x + deltaX),
      y: Math.max(24, dragRef.current.origin.y + deltaY),
    };

    setPositions((current) => ({
      ...current,
      [dragRef.current!.nodeId]: nextPosition,
    }));
  }, [templateDetail?.versionId]);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current || !templateDetail?.versionId) return;
    window.localStorage.setItem(storageKeyForVersion(templateDetail.versionId), JSON.stringify({
      ...positions,
      [dragRef.current.nodeId]: positions[dragRef.current.nodeId] ?? dragRef.current.origin,
    }));
    dragRef.current = null;
    setDraggingNodeId(null);
  }, [positions, templateDetail?.versionId]);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const startDragging = useCallback((nodeId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    const node = graphNodeMap.get(nodeId);
    if (!node) return;
    dragRef.current = {
      nodeId,
      origin: node.position,
      pointerStart: { x: event.clientX, y: event.clientY },
    };
    setDraggingNodeId(nodeId);
  }, [graphNodeMap]);

  const saveLayout = useCallback(() => {
    if (!templateDetail?.versionId) return;
    window.localStorage.setItem(storageKeyForVersion(templateDetail.versionId), JSON.stringify(positions));
    toast({ title: "Layout saved", description: "Canvas positions stored locally for this template." });
  }, [positions, templateDetail?.versionId]);

  const resetLayout = useCallback(() => {
    if (!templateDetail?.versionId) return;
    window.localStorage.removeItem(storageKeyForVersion(templateDetail.versionId));
    setPositions({});
  }, [templateDetail?.versionId]);

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
    if (!selectedTemplate) return;

    const missing = selectedTemplate.inputs.find((input) => !input.defaultAssetUrl && !files[input.id]);
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
          selectedTemplate.inputs
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
          versionId: selectedTemplate.versionId,
          inputFiles,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not start template");

      setJobId(data.jobId);
      void fetchJobStatus(data.jobId);
      pollJob(data.jobId);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Could not start template";
      setPhase("error");
      setError(message);
      toast({ title: "Canvas run failed", description: message, variant: "destructive" });
    } finally {
      setStartingRun(false);
    }
  }, [buildAuthHeaders, fetchJobStatus, files, pollJob, selectedTemplate]);

  const saveNode = useCallback(async () => {
    if (!templateDetail || !selectedNode || !nodeDraft) return;
    setSavingNode(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-template-editor`, {
        method: "POST",
        headers: {
          ...(await buildAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          versionId: templateDetail.versionId,
          nodeId: selectedNode.id,
          displayLabel: nodeDraft.displayLabel,
          prompt: nodeDraft.prompt,
          expected: nodeDraft.expected,
          editorMode: selectedNode.nodeType === "user_input" ? nodeDraft.editorMode : null,
          slotKey: selectedNode.nodeType === "user_input" ? nodeDraft.slotKey : null,
          outputExposed: selectedNode.nodeType === "image_gen" || selectedNode.nodeType === "video_gen"
            ? nodeDraft.outputExposed
            : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not save node");
      await loadTemplateDetail(templateDetail.versionId);
      await loadTemplates();
      toast({ title: "Node saved", description: "Template metadata updated." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save node";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSavingNode(false);
    }
  }, [buildAuthHeaders, loadTemplateDetail, loadTemplates, nodeDraft, selectedNode, templateDetail]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto flex max-w-[1900px] gap-6 px-5 pb-12 pt-24 xl:px-8">
        <section className="w-[340px] shrink-0 rounded-3xl border border-border/50 bg-card/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Canvas</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Template Canvas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Internal-only graph view for inspecting, editing, and running the live Supabase templates.
          </p>

          <div className="mt-6 space-y-3">
            <Label className="text-xs uppercase tracking-[0.15em]">Template</Label>
            <select
              value={selectedVersionId}
              onChange={(event) => setSelectedVersionId(event.target.value)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={loadingTemplates || !templates.length}
            >
              {templates.map((template) => (
                <option key={template.versionId} value={template.versionId}>
                  {template.templateName} · {template.counts.inputs} inputs · {template.counts.imageOutputs} image · {template.counts.videoOutputs} video
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadTemplates()} disabled={loadingTemplates}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingTemplates ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={saveLayout} disabled={!templateDetail}>
                <Save className="mr-2 h-4 w-4" />
                Save Layout
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={resetLayout} disabled={!templateDetail}>
                Reset
              </Button>
            </div>
          </div>

          {selectedTemplate ? (
            <div className="mt-6 rounded-2xl border border-border/40 bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Run Selected Template</p>
              <div className="mt-4 space-y-4">
                {selectedTemplate.inputs.map((input) => (
                  <div key={input.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-medium">{input.name}</Label>
                      <span className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                        {input.expected}
                      </span>
                    </div>
                    {previews[input.id] ? (
                      <img src={previews[input.id]} alt={input.name} className="h-28 w-full rounded-2xl border border-border/30 object-contain bg-background/80" />
                    ) : input.defaultAssetUrl ? (
                      <img src={input.defaultAssetUrl} alt={`${input.name} default`} className="h-28 w-full rounded-2xl border border-border/30 object-contain bg-background/80" />
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-border/40 bg-background/60 text-sm text-muted-foreground">
                        Upload required
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input type="file" accept="image/*" onChange={(event) => handleFile(input.id, event.target.files?.[0] ?? null)} />
                      <Button type="button" variant="outline" size="sm" onClick={() => handleFile(input.id, null)}>
                        Clear
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" className="w-full" onClick={() => void handleRun()} disabled={startingRun}>
                  {startingRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                  Run From Canvas
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-border/40 bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Run State</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium uppercase">{phase}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Job</span>
                <span className="font-mono text-xs">{jobId ? jobId.slice(0, 8) : "none"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Outputs</span>
                <span className="font-medium">{job?.outputs.length ?? 0}</span>
              </div>
              {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
            </div>
          </div>
        </section>

        <section className="min-w-0 flex-1 rounded-3xl border border-border/50 bg-card/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 px-2 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Canvas</p>
              <h2 className="mt-2 text-2xl font-bold">{templateDetail?.templateName ?? "Loading..."}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANE_ORDER.map((lane) => (
                <span key={lane} className="rounded-full border border-border/40 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  {LANE_LABELS[lane]}
                </span>
              ))}
            </div>
          </div>

          <div ref={canvasRef} className="overflow-auto rounded-3xl border border-border/40 bg-background/60">
            <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
              <svg className="absolute inset-0 h-full w-full" width={canvasSize.width} height={canvasSize.height}>
                {graphNodes.map((node) => {
                  return node.incoming.map((incoming) => {
                    const source = graphNodeMap.get(incoming.sourceNodeId);
                    if (!source) return null;
                    const from = { x: source.position.x + NODE_WIDTH, y: source.position.y + NODE_HEIGHT / 2 };
                    const to = { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
                    return (
                      <g key={`${source.id}-${node.id}-${incoming.targetParam ?? "none"}`}>
                        <path d={bezierPath(from, to)} fill="none" stroke="rgba(117,185,255,0.36)" strokeWidth="2" />
                        {incoming.targetParam ? (
                          <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} fill="rgba(189,204,220,0.9)" fontSize="11">
                            {incoming.targetParam}
                          </text>
                        ) : null}
                      </g>
                    );
                  });
                })}
              </svg>

              {graphNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isDragging = draggingNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    className={`absolute rounded-3xl border p-4 shadow-lg transition ${
                      isSelected ? "border-primary/70 bg-primary/10" : "border-border/40 bg-card/95"
                    } ${isDragging ? "cursor-grabbing shadow-primary/20" : "cursor-default"}`}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: NODE_WIDTH,
                      minHeight: NODE_HEIGHT,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedNodeId(node.id)}>
                        <p className="line-clamp-2 font-semibold leading-tight">{node.name}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{node.nodeType}</p>
                      </button>
                      <button
                        type="button"
                        onPointerDown={(event) => startDragging(node.id, event)}
                        className="rounded-full border border-border/40 p-2 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                        aria-label={`Move ${node.name}`}
                      >
                        <Move className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {node.defaultAssetUrl ? (
                      <img src={node.defaultAssetUrl} alt={node.name} className="mt-3 h-24 w-full rounded-2xl border border-border/30 object-contain bg-background/80" />
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {node.editor?.mode ? (
                        <span className="rounded-full border border-border/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {node.editor.mode}
                        </span>
                      ) : null}
                      {typeof node.editor?.outputExposed === "boolean" ? (
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${node.editor.outputExposed ? "border-primary/40 text-primary" : "border-border/40 text-muted-foreground"}`}>
                          {node.editor.outputExposed ? "Deliverable" : "Internal"}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{node.summary}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="w-[380px] shrink-0 rounded-3xl border border-border/50 bg-card/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Inspector</p>
          {selectedNode && nodeDraft ? (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-xl font-bold">{selectedNode.name}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-muted-foreground">{selectedNode.nodeType}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.15em]">Display Label</Label>
                <Input value={nodeDraft.displayLabel} onChange={(event) => setNodeDraft((current) => current ? { ...current, displayLabel: event.target.value } : current)} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.15em]">Expected Media</Label>
                <Input value={nodeDraft.expected} onChange={(event) => setNodeDraft((current) => current ? { ...current, expected: event.target.value } : current)} />
              </div>

              {selectedNode.nodeType === "user_input" ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.15em]">Input Mode</Label>
                    <select
                      value={nodeDraft.editorMode}
                      onChange={(event) => setNodeDraft((current) => current ? { ...current, editorMode: event.target.value as NodeDraft["editorMode"] } : current)}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="upload">User Upload</option>
                      <option value="reference">Hidden Reference</option>
                      <option value="workflow">Internal Scene Lock</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.15em]">Slot Key</Label>
                    <Input value={nodeDraft.slotKey} onChange={(event) => setNodeDraft((current) => current ? { ...current, slotKey: event.target.value } : current)} />
                  </div>
                </>
              ) : (
                <label className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/70 px-3 py-3">
                  <span className="text-sm text-foreground">Expose as final deliverable</span>
                  <input
                    type="checkbox"
                    checked={nodeDraft.outputExposed === true}
                    onChange={(event) =>
                      setNodeDraft((current) =>
                        current
                          ? { ...current, outputExposed: event.target.checked }
                          : current
                      )}
                  />
                </label>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.15em]">Prompt</Label>
                <Textarea
                  value={nodeDraft.prompt}
                  onChange={(event) => setNodeDraft((current) => current ? { ...current, prompt: event.target.value } : current)}
                  rows={10}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.15em]">Incoming</Label>
                <div className="rounded-2xl border border-border/40 bg-background/70 p-3 text-sm text-muted-foreground">
                  {selectedNode.incoming.length ? selectedNode.incoming.map((incoming) => (
                    <div key={`${incoming.sourceNodeId}-${incoming.targetParam ?? "none"}`} className="py-1">
                      {incoming.sourceName}
                      {incoming.targetParam ? ` -> ${incoming.targetParam}` : ""}
                    </div>
                  )) : "No upstream mappings"}
                </div>
              </div>

              <Button type="button" className="w-full" onClick={() => void saveNode()} disabled={savingNode}>
                {savingNode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Save Node
              </Button>

              {job ? (
                <div className="rounded-2xl border border-border/40 bg-background/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Latest Run</p>
                    <span className="text-sm font-medium uppercase">{job.status}</span>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {job.outputs.map((output) => (
                      <div key={`${output.label}-${output.url}`} className="rounded-2xl border border-border/30 bg-background/80 p-3">
                        <p className="text-sm font-medium">{output.label}</p>
                        {output.type === "video" ? (
                          <video src={output.url} controls className="mt-2 w-full rounded-xl border border-border/30" />
                        ) : (
                          <img src={output.url} alt={output.label} className="mt-2 w-full rounded-xl border border-border/30 object-cover" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-border/40 bg-background/70 p-4 text-sm text-muted-foreground">
              Pick a node on the canvas to inspect and edit it.
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};

export default TemplateCanvas;
