/**
 * TR9 — Pro personal workflow editor, rebuilt on the real Lab node canvas.
 *
 * Reuses src/components/lab/GraphCanvas.tsx in a READ-ONLY topology
 * configuration: no add/delete nodes, no port connect wiring, no publish /
 * submit / activate / metadata / admin tools. Hidden creator prompts never
 * arrive here (server strips them for prompt-hidden forks) and are never
 * rendered or previewed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Edge } from "@xyflow/react";
import {
  Check,
  Copy,
  Layers,
  Loader2,
  Maximize2,
  Play,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import GraphCanvas, {
  PORT_COLOR,
  portTypeForId,
  type GraphCanvasNode,
  type GraphCanvasNodeData,
} from "@/components/lab/GraphCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  createFork,
  estimateForkRun,
  getFork,
  resetFork,
  runFork,
  updateFork,
  type ForkNodeMediaItem,
  type PersonalGraph,
  type PersonalGraphNode,
  type TemplateFork,
} from "@/services/templateForks";


const PROMPTABLE = ["prompt", "image_gen", "video_gen"];

/** Only these settings are editable in a private fork. */
const SETTING_LABELS: Record<string, string> = {
  model: "Model",
  aspect_ratio: "Aspect ratio",
  aspectRatio: "Aspect ratio",
  resolution: "Resolution",
  duration: "Duration",
  duration_seconds: "Duration (seconds)",
};

type CategoryKey = "all" | "user_input" | "prompt" | "image_gen" | "video_gen" | "output";

const CATEGORIES: Array<{ key: CategoryKey; label: string }> = [
  { key: "all", label: "All steps" },
  { key: "user_input", label: "Your assets" },
  { key: "prompt", label: "Direction" },
  { key: "image_gen", label: "Image steps" },
  { key: "video_gen", label: "Motion steps" },
  { key: "output", label: "Final outputs" },
];

function canvasKind(nodeType: string): GraphCanvasNodeData["kind"] {
  if (nodeType === "user_input") return "input";
  if (nodeType === "image_gen") return "image";
  if (nodeType === "video_gen") return "video";
  if (nodeType === "prompt") return "prompt";
  return "other";
}

function kindLabel(nodeType: string): string {
  if (nodeType === "user_input") return "Input";
  if (nodeType === "image_gen") return "Image";
  if (nodeType === "video_gen") return "Video";
  if (nodeType === "prompt") return "Direction";
  if (nodeType === "output") return "Output";
  return nodeType.replace(/_/g, " ");
}

const LANE_INDEX: Record<string, number> = {
  user_input: 0,
  prompt: 1,
  image_gen: 2,
  video_gen: 3,
  output: 4,
};

function laneFor(nodeType: string) {
  return LANE_INDEX[nodeType] ?? 3;
}

function settingKeysFor(node: PersonalGraphNode): string[] {
  return Object.keys(node.settings ?? {}).filter((key) => key in SETTING_LABELS);
}

function settingValue(node: PersonalGraphNode, key: string): string {
  const value = node.settings?.[key];
  return value === undefined || value === null ? "" : String(value);
}

/** Safe, never-leaking summary line for a node card. */
function safeDetailLine(node: PersonalGraphNode): string | null {
  const seconds = settingValue(node, "duration") || settingValue(node, "duration_seconds");
  const ratio = settingValue(node, "aspect_ratio") || settingValue(node, "aspectRatio");
  const resolution = settingValue(node, "resolution");
  const parts = [
    seconds ? `${seconds} sec` : null,
    ratio || null,
    resolution || null,
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(" · ");
  if (node.node_type === "user_input") return "User asset";
  return null;
}

export default function CustomizeWorkflowPage() {
  const { forkId } = useParams<{ forkId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [fork, setFork] = useState<TemplateFork | null>(null);
  const [graph, setGraph] = useState<PersonalGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [running, setRunning] = useState(false);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryKey>("all");
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [lightbox, setLightbox] = useState<{ url: string; type: "image" | "video" } | null>(null);

  const runKeyRef = useRef<string | null>(null);
  const graphRef = useRef<PersonalGraph | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const fitRef = useRef<{ getCenter: () => { x: number; y: number } } | null>(null);

  graphRef.current = graph;

  /** TR10b — server-authoritative dry-run cost (no charge, no job). */
  const refreshEstimate = useCallback(async () => {
    if (!forkId) return;
    setEstimating(true);
    try {
      const { estimatedCredits: credits } = await estimateForkRun(forkId);
      setEstimatedCredits(credits);
    } catch {
      setEstimatedCredits(null);
    } finally {
      setEstimating(false);
    }
  }, [forkId]);

  useEffect(() => {
    if (!forkId || accessDenied) return;
    void refreshEstimate();
  }, [forkId, accessDenied, refreshEstimate]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true, state: { redirectTo: `/app/templates/customize/${forkId ?? ""}` } });
      return;
    }
    if (!forkId) return;
    let cancelled = false;
    setLoading(true);
    getFork(forkId)
      .then((data) => {
        if (cancelled) return;
        setFork(data);
        setGraph(data.personalGraph);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const code = (error as { code?: string })?.code ?? "";
        if (code === "FORBIDDEN" || code === "HTTP_403") setAccessDenied(true);
        else toast({ title: "Couldn't load your private version", variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forkId, user, authLoading, navigate]);

  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);

  const numbering = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((node, index) => map.set(node.id, index + 1));
    return map;
  }, [nodes]);

  const outputNumbering = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 0;
    for (const node of nodes) {
      if (node.node_type === "output") map.set(node.id, ++counter);
    }
    return map;
  }, [nodes]);

  const incomingByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graph?.edges ?? []) {
      const bucket = map.get(edge.target_node_id) ?? [];
      bucket.push(edge.source_node_id);
      map.set(edge.target_node_id, bucket);
    }
    return map;
  }, [graph]);

  /** Presentational auto-layout by lane; drag positions are never persisted. */
  const layout = useMemo(() => {
    const laneCounts: Record<number, number> = {};
    const map: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
      const lane = laneFor(node.node_type);
      const row = laneCounts[lane] ?? 0;
      laneCounts[lane] = row + 1;
      map[node.id] = { x: lane * 400, y: row * 300 };
    }
    return map;
  }, [nodes]);

  /** Human-readable provenance for a reference thumbnail. Media only. */
  const provenanceLabel = useCallback(
    (ref: ForkNodeMediaItem) => {
      if (ref.role) return ref.role === "start" ? "Start" : "End";
      if (ref.sourceNodeId) {
        const upstream = nodes.find((node) => node.id === ref.sourceNodeId);
        const number = numbering.get(ref.sourceNodeId);
        return `#${number ?? "?"} · ${kindLabel(upstream?.node_type ?? "").toUpperCase()}`;
      }
      return "Brand asset";
    },
    [nodes, numbering],
  );

  const decoratedMedia = useCallback(
    (node: PersonalGraphNode) => {
      const media = node.media;
      if (!media) return null;
      return {
        output: media.output,
        unavailable: media.unavailable,
        references: media.references.map((ref) => ({
          url: ref.url,
          type: ref.type,
          role: ref.role,
          label: provenanceLabel(ref),
        })),
      };
    },
    [provenanceLabel],
  );

  const flowNodes = useMemo<GraphCanvasNode[]>(
    () =>
      nodes.map((node) => {
        const kind = canvasKind(node.node_type);
        const incoming = incomingByNode.get(node.id) ?? [];
        const promptable = PROMPTABLE.includes(node.node_type);
        const showPrompt = promptable && fork?.promptVisibility === true;
        const model = settingValue(node, "model");
        const outNumber = outputNumbering.get(node.id) ?? null;
        return {
          id: node.id,
          type: "templateNode",
          position: positions[node.id] ?? layout[node.id] ?? { x: 0, y: 0 },
          data: {
            title: node.name || kindLabel(node.node_type),
            nodeNumber: numbering.get(node.id) ?? null,
            outputNumber: outNumber,
            kind,
            kindLabel: kindLabel(node.node_type).toUpperCase(),
            laneLabel: kindLabel(node.node_type),
            modelBadge: model || null,
            detailLine: safeDetailLine(node),
            // Never leak hidden creator prompts into the card preview.
            promptPreview: showPrompt
              ? node.prompt || "No prompt set"
              : promptable
                ? node.directionOverride
                  ? `Your direction: ${node.directionOverride}`
                  : "Creator direction (hidden) — add your own direction"
                : node.node_type === "user_input"
                  ? "Runtime asset from the run you customized"
                  : "Runs automatically",
            promptValue: showPrompt ? node.prompt ?? "" : "",
            incomingCount: incoming.length,
            sourceSummary: incoming.length
              ? incoming
                  .map((id) => `#${numbering.get(id) ?? "?"}`)
                  .join(", ")
              : "Start of workflow",
            refLabels: [],
            assetUrl: null,
            expected: null,
            deliverable: node.node_type === "output" ? true : null,
            portIds: [],
            media: decoratedMedia(node),
            onOpenMedia: (url: string, type: "image" | "video") => setLightbox({ url, type }),
            // READ-ONLY: no onAddPort / onPromptCommit / onUploadReference / onRunNode.
          },
        };
      }),
    [nodes, incomingByNode, fork?.promptVisibility, positions, layout, numbering, outputNumbering, decoratedMedia],
  );


  const flowEdges = useMemo<Edge[]>(
    () =>
      (graph?.edges ?? []).map((edge, index) => {
        const target = nodes.find((node) => node.id === edge.target_node_id);
        const type = portTypeForId(target?.node_type === "video_gen" ? "video" : "image");
        return {
          id: `edge-${index}-${edge.source_node_id}-${edge.target_node_id}`,
          source: edge.source_node_id,
          target: edge.target_node_id,
          type: "deletable",
          animated: true,
          selectable: false,
          focusable: false,
          deletable: false,
          reconnectable: false,
          style: { stroke: PORT_COLOR[type], strokeWidth: 1.8, opacity: 0.85 },
        } as Edge;
      }),
    [graph?.edges, nodes],
  );

  const counts = useMemo(() => {
    const map: Record<CategoryKey, number> = {
      all: nodes.length,
      user_input: 0,
      prompt: 0,
      image_gen: 0,
      video_gen: 0,
      output: 0,
    };
    for (const node of nodes) {
      const key = node.node_type as CategoryKey;
      if (key in map && key !== "all") map[key] += 1;
    }
    return map;
  }, [nodes]);

  const categoryNodes = useMemo(
    () => (category === "all" ? nodes : nodes.filter((node) => node.node_type === category)),
    [category, nodes],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const saveGraph = useCallback(
    async (next: PersonalGraph | null, options?: { silent?: boolean }) => {
      if (!forkId || !next) return;
      setSaving(true);
      try {
        await updateFork(forkId, next);
        setDirty(false);
        if (!options?.silent) toast({ title: "Saved", description: "Your private version is up to date." });
        await refreshEstimate();
      } catch {
        toast({ title: "Couldn't save your changes", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [forkId, refreshEstimate],
  );

  /** Debounced autosave for inspector edits. Never auto-runs. */
  const scheduleAutosave = useCallback(() => {
    setDirty(true);
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      void saveGraph(graphRef.current, { silent: true });
    }, 1200);
  }, [saveGraph]);

  useEffect(
    () => () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const patchNode = (id: string, patch: Partial<PersonalGraphNode>) => {
    setGraph((current) =>
      current
        ? { ...current, nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) }
        : current,
    );
    scheduleAutosave();
  };

  const patchSetting = (id: string, key: string, value: string) => {
    setGraph((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) =>
              node.id === id ? { ...node, settings: { ...node.settings, [key]: value } } : node,
            ),
          }
        : current,
    );
    scheduleAutosave();
  };

  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setInspectorOpen(true);
  }, []);

  const focusCategory = (key: CategoryKey) => {
    setCategory(key);
    const first = key === "all" ? nodes[0] : nodes.find((node) => node.node_type === key);
    if (first) {
      setSelectedNodeId(first.id);
      setFocusNodeId(first.id);
      window.setTimeout(() => setFocusNodeId(null), 800);
    }
    setRailOpen(false);
  };

  const focusNode = (nodeId: string) => {
    selectNode(nodeId);
    setFocusNodeId(nodeId);
    window.setTimeout(() => setFocusNodeId(null), 800);
    setRailOpen(false);
  };

  /**
   * TR10b — auto-save, then run the private fork. Inputs are omitted so the
   * server reuses the originating run's assets (owner-scoped, server-priced).
   */
  const handleRun = async () => {
    if (!forkId || running) return;
    setRunning(true);
    setNeedsCredits(false);
    try {
      if (graph) await updateFork(forkId, graph);
      setDirty(false);
      // One key per fork run attempt — a double-click can never double-charge.
      if (!runKeyRef.current) runKeyRef.current = crypto.randomUUID();
      const { jobId } = await runFork(forkId, runKeyRef.current);
      runKeyRef.current = null;
      navigate(`/app/templates?run=${jobId}`);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (code === "INSUFFICIENT_CREDITS" || code === "HTTP_402" || code === "MEMBERSHIP_REQUIRED") {
        setNeedsCredits(true);
      } else if (code === "PRO_REQUIRED" || code === "FORBIDDEN" || code === "HTTP_403") {
        toast({
          title: "Pro membership required",
          description: "Personal versions run on Pro and above.",
        });
      } else {
        toast({
          title: "Couldn't start your run",
          description: (error as Error)?.message ?? undefined,
          variant: "destructive",
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const handleReset = async () => {
    if (!forkId) return;
    setResetting(true);
    try {
      await resetFork(forkId);
      const refreshed = await getFork(forkId);
      setFork(refreshed);
      setGraph(refreshed.personalGraph);
      setPositions({});
      setDirty(false);
      toast({ title: "Reset", description: "Back to the original template." });
      await refreshEstimate();
    } catch {
      toast({ title: "Couldn't reset this version", variant: "destructive" });
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!fork) return;
    setDuplicating(true);
    try {
      const created = await createFork(fork.sourceTemplateId);
      navigate(`/app/templates/customize/${created.forkId}`);
    } catch {
      toast({ title: "Couldn't duplicate this version", variant: "destructive" });
    } finally {
      setDuplicating(false);
    }
  };

  if (accessDenied) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="font-display text-2xl tracking-[0.14em] text-slate-100">YOU DON'T HAVE ACCESS</h1>
          <p className="mt-3 text-sm text-slate-400">This private version belongs to another account.</p>
          <Button className="mt-6" onClick={() => navigate("/app/templates")}>
            Back to templates
          </Button>
        </div>
      </SiteShell>
    );
  }

  if (loading || !graph || !fork) {
    return (
      <SiteShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-200 motion-reduce:animate-none" />
        </div>
      </SiteShell>
    );
  }

  const saveStatus = saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved";

  const rail = (
    <nav className="space-y-4">
      <div>
        <p className="font-display text-[10px] tracking-[0.22em] text-slate-500">WORKFLOW</p>
        <div className="mt-2 space-y-1">
          {CATEGORIES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => focusCategory(item.key)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs tracking-[0.08em] transition ${
                category === item.key
                  ? "bg-primary/15 text-primary"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <span className="uppercase">{item.label}</span>
              <span className="text-[10px] tabular-nums text-slate-500">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-3">
        <p className="font-display text-[10px] tracking-[0.22em] text-slate-500">STEPS</p>
        <div className="mt-2 space-y-1">
          {categoryNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => focusNode(node.id)}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                selectedNodeId === node.id
                  ? "bg-white/10 text-slate-100"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <span className="tabular-nums text-slate-500">
                [{String(numbering.get(node.id) ?? 0).padStart(2, "0")}]
              </span>{" "}
              {node.name || kindLabel(node.node_type)}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );

  const inspector = selectedNode ? (
    <div className="space-y-4">
      <div>
        <p className="font-display text-[10px] tracking-[0.22em] text-slate-500">INSPECTOR</p>
        <h2 className="mt-1 text-sm font-semibold tracking-[0.06em] text-slate-100">
          {selectedNode.name || kindLabel(selectedNode.node_type)}
        </h2>
        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
          {kindLabel(selectedNode.node_type)}
          {outputNumbering.get(selectedNode.id) ? ` · Final ${outputNumbering.get(selectedNode.id)}` : ""}
        </p>
      </div>

      {(() => {
        const media = selectedNode.media;
        if (!media) return null;
        if (media.unavailable && !media.output && !media.references.length) {
          return (
            <p className="text-xs text-slate-500">
              Reference unavailable · #{numbering.get(selectedNode.id) ?? "?"}
            </p>
          );
        }
        const renderThumb = (
          url: string,
          type: "image" | "video",
          caption: string,
          key: string,
        ) => (
          <button
            key={key}
            type="button"
            className="w-20 text-left"
            onClick={() => setLightbox({ url, type })}
          >
            {type === "video" ? (
              <video
                src={url}
                muted
                loop
                playsInline
                preload="metadata"
                className="h-20 w-20 rounded-lg border border-white/10 bg-black/40 object-cover"
                onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                onMouseLeave={(event) => event.currentTarget.pause()}
              />
            ) : (
              <img
                src={url}
                alt={caption}
                loading="lazy"
                className="h-20 w-20 rounded-lg border border-white/10 bg-black/40 object-cover"
              />
            )}
            <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {caption}
            </span>
          </button>
        );
        return (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
            {media.references.length ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">References / inputs</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {media.references.map((ref, index) =>
                    renderThumb(
                      ref.url,
                      ref.type,
                      ref.role ? (ref.role === "start" ? "Start" : "End") : provenanceLabel(ref),
                      `${ref.url}-${index}`,
                    ),
                  )}
                </div>
              </div>
            ) : null}
            {media.output ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Output</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {renderThumb(media.output.url, media.output.type, "Result", "output")}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Reference unavailable · #{numbering.get(selectedNode.id) ?? "?"}
              </p>
            )}
          </div>
        );
      })()}



      {selectedNode.node_type === "user_input" && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Your asset</p>
          <p className="mt-2">
            This slot uses the asset from the run you customized. Nothing to change here.
          </p>
        </div>
      )}

      {PROMPTABLE.includes(selectedNode.node_type) && fork.promptVisibility && (
        <div>
          <label
            className="text-xs uppercase tracking-[0.16em] text-slate-400"
            htmlFor={`prompt-${selectedNode.id}`}
          >
            Prompt
          </label>
          <Textarea
            id={`prompt-${selectedNode.id}`}
            className="mt-2 min-h-40 bg-black/30"
            value={selectedNode.prompt ?? ""}
            onChange={(event) => patchNode(selectedNode.id, { prompt: event.target.value })}
          />
        </div>
      )}

      {PROMPTABLE.includes(selectedNode.node_type) && !fork.promptVisibility && (
        <div>
          <label
            className="text-xs uppercase tracking-[0.16em] text-slate-400"
            htmlFor={`direction-${selectedNode.id}`}
          >
            Your direction
          </label>
          <Textarea
            id={`direction-${selectedNode.id}`}
            className="mt-2 min-h-40 bg-black/30"
            placeholder="e.g. colder lighting, tighter framing"
            value={selectedNode.directionOverride ?? ""}
            onChange={(event) => patchNode(selectedNode.id, { directionOverride: event.target.value })}
          />
          <p className="mt-2 text-xs text-slate-500">
            Added on top of the creator's built-in direction.
          </p>
        </div>
      )}

      {settingKeysFor(selectedNode).length > 0 && (
        <div className="space-y-3 border-t border-white/10 pt-4">
          {settingKeysFor(selectedNode).map((key) => (
            <div key={key}>
              <label
                className="text-xs uppercase tracking-[0.16em] text-slate-400"
                htmlFor={`setting-${selectedNode.id}-${key}`}
              >
                {SETTING_LABELS[key]}
              </label>
              <Input
                id={`setting-${selectedNode.id}-${key}`}
                className="mt-2 bg-black/30"
                value={settingValue(selectedNode, key)}
                onChange={(event) => patchSetting(selectedNode.id, key, event.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {!PROMPTABLE.includes(selectedNode.node_type) && settingKeysFor(selectedNode).length === 0 && selectedNode.node_type !== "user_input" && (
        <p className="text-xs text-slate-500">This step runs automatically — nothing to adjust.</p>
      )}
    </div>
  ) : (
    <div className="text-xs text-slate-500">
      <p className="font-display text-[10px] tracking-[0.22em] text-slate-500">INSPECTOR</p>
      <p className="mt-3">Select a step on the canvas to edit it.</p>
    </div>
  );

  return (
    <SiteShell>
      <div className="w-full px-3 pb-4 pt-3 sm:px-4">
        {/* Compact toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={railOpen} onOpenChange={setRailOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open workflow navigator">
                  <Layers className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto border-white/10 bg-[#0c101c] text-slate-100">
                <div className="mt-6">{rail}</div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="font-display text-[10px] tracking-[0.22em] text-slate-500">PRIVATE WORKFLOW</p>
              <p className="truncate text-sm font-semibold tracking-[0.08em] text-slate-100">{fork.basedOn}</p>
              <p className="truncate text-[11px] text-slate-500">Only you can see this version</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-400">
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : dirty ? null : (
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              )}
              {saveStatus}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void saveGraph(graph)} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setResetOpen(true)} disabled={resetting}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleDuplicate()} disabled={duplicating}>
              {duplicating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const first = nodes[0];
                if (first) {
                  setFocusNodeId(first.id);
                  window.setTimeout(() => setFocusNodeId(null), 800);
                }
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fit
            </Button>
            <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="xl:hidden" aria-label="Open step inspector">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto border-white/10 bg-[#0c101c] text-slate-100">
                <div className="mt-4">{inspector}</div>
              </SheetContent>
            </Sheet>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void handleRun()}
              disabled={running || saving || estimatedCredits === null}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span className="font-display tracking-[0.12em]">
                RUN MY VERSION
                {estimatedCredits !== null
                  ? ` · ${estimatedCredits.toLocaleString()} CR`
                  : estimating
                    ? " · …"
                    : ""}
              </span>
            </Button>
          </div>
        </header>

        {needsCredits && (
          <p className="mt-2 text-sm text-amber-200">
            You don't have enough credits for this run.{" "}
            <Link to="/membership" className="underline">
              Top up your credits
            </Link>{" "}
            and try again.
          </p>
        )}

        {/* 3 panes: rail | canvas | inspector */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
          <aside className="hidden self-start rounded-2xl border border-white/10 bg-white/[0.02] p-3 lg:block lg:sticky lg:top-3 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            {rail}
          </aside>

          <section className="min-w-0">
            <GraphCanvas
              nodes={flowNodes}
              edges={flowEdges}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              // Layout only — positions are presentational and never persisted as topology.
              onNodeMoved={(nodeId, position) =>
                setPositions((current) => ({ ...current, [nodeId]: position }))
              }
              // READ-ONLY topology: connect/delete handlers intentionally do nothing.
              onConnectNodes={() => undefined}
              onDeleteEdge={() => undefined}
              focusNodeId={focusNodeId}
              onViewportApiReady={(api) => {
                fitRef.current = api;
              }}
              className="h-[calc(100vh-11rem)] min-h-[420px]"
            />
          </section>

          <aside className="hidden self-start rounded-2xl border border-white/10 bg-white/[0.02] p-4 xl:block xl:sticky xl:top-3 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
            {inspector}
          </aside>
        </div>
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl border-white/10 bg-[#0c101c] p-3">
          {lightbox?.type === "video" ? (
            <video src={lightbox.url} controls autoPlay muted loop className="max-h-[75vh] w-full rounded-lg" />
          ) : lightbox ? (
            <img src={lightbox.url} alt="Workflow media" className="max-h-[75vh] w-full rounded-lg object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>

        <AlertDialogContent className="border-white/10 bg-[#0c101c] text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-[0.12em]">RESET TO ORIGINAL?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This discards your edits and restores the original template settings for this private version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my edits</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReset()}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SiteShell>
  );
}
