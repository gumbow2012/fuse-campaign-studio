import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Film, Image as ImageIcon, Loader2, Maximize2, Play, Plus, Type, Upload, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type PortType = "prompt" | "image" | "video";

export type GraphCanvasNodeData = {
  title: string;
  nodeNumber?: number | null;
  outputNumber?: number | null;
  kind: "input" | "image" | "video" | "prompt" | "other";
  kindLabel: string;
  /** Creator-mode plain-language explanation shown behind the node "?" badge. */
  helpText?: string | null;
  laneLabel: string;
  modelBadge: string | null;
  detailLine: string | null;
  promptPreview: string;
  incomingCount: number;
  sourceSummary: string;
  refLabels: string[];
  assetUrl: string | null;
  expected: string | null;
  deliverable: boolean | null;
  promptValue?: string;
  portIds: string[];
  /** Presentation-only persisted artifacts (private fork editor). */
  media?: {
    output: { url: string; type: "image" | "video" } | null;
    references: Array<{
      url: string;
      type: "image" | "video";
      role?: "start" | "end";
      label?: string;
    }>;
    unavailable?: boolean;
  } | null;
  onOpenMedia?: (url: string, type: "image" | "video") => void;
  isReference?: boolean;

  uploadingReference?: boolean;
  onAddPort?: (nodeId: string, type: PortType) => void;
  onPromptCommit?: (nodeId: string, prompt: string) => void;
  onUploadReference?: (nodeId: string, file: File) => void;
  run?: NodeRunState | null;
  onRunNode?: (nodeId: string) => void;
};

export type NodeRunState = {
  status: "queued" | "running" | "complete" | "failed";
  outputUrl?: string | null;
  outputType?: string | null;
  error?: string | null;
  estimatedCredits?: number | null;
  startedAt?: number | null;
};

export type GraphCanvasNode = Node<GraphCanvasNodeData>;

const KIND_ICON = {
  input: Upload,
  image: ImageIcon,
  video: Film,
  prompt: Type,
  other: ImageIcon,
} as const;

const KIND_ACCENT: Record<GraphCanvasNodeData["kind"], string> = {
  input: "border-cyan-300/40 text-cyan-200",
  image: "border-emerald-300/40 text-emerald-200",
  video: "border-primary/50 text-primary",
  prompt: "border-fuchsia-300/40 text-fuchsia-200",
  other: "border-border/60 text-muted-foreground",
};

export const PORT_COLOR: Record<PortType, string> = {
  prompt: "hsl(280 90% 68%)",
  image: "hsl(165 80% 55%)",
  video: "hsl(205 95% 62%)",
};

type Port = { id: string; label: string; type: PortType };

export function portTypeForId(portId: string): PortType {
  const id = portId.toLowerCase();
  if (id.includes("prompt")) return "prompt";
  if (id.includes("video")) return "video";
  return "image";
}

export function portLabelForId(portId: string): string {
  const known: Record<string, string> = {
    prompt: "Prompt",
    negative_prompt: "Negative Prompt",
    start_frame_image: "First Frame",
    end_frame_image: "Last Frame",
    image: "Image",
    video: "Video",
  };
  if (known[portId]) return known[portId];
  const match = /^(image|video|ref)_(\d+)$/.exec(portId);
  if (match) {
    const base = match[1] === "ref" ? "Ref" : match[1] === "video" ? "Video" : "Image";
    return `${base} ${match[2]}`;
  }
  return portId.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function inputPortsFor(data: GraphCanvasNodeData): Port[] {
  return data.portIds.map((id) => ({ id, label: portLabelForId(id), type: portTypeForId(id) }));
}

function outputPortFor(data: GraphCanvasNodeData): Port {
  if (data.kind === "prompt") return { id: "prompt", label: "Prompt", type: "prompt" };
  if (data.kind === "video") return { id: "video", label: "Video", type: "video" };
  return { id: "image", label: "Image", type: "image" };
}

const PortDot = ({ type }: { type: PortType }) => (
  <span
    className="h-2.5 w-2.5 shrink-0 rounded-full"
    style={{ background: PORT_COLOR[type], boxShadow: `0 0 0 3px ${PORT_COLOR[type]}33` }}
  />
);

const handleBase = "!h-4 !w-4 !rounded-full !border-2 !border-background !opacity-100 transition-transform hover:!scale-125";

type NodeMedia = NonNullable<GraphCanvasNodeData["media"]>;

const MediaThumb = ({
  url,
  type,
  caption,
  onOpen,
}: {
  url: string;
  type: "image" | "video";
  caption: string;
  onOpen?: (url: string, type: "image" | "video") => void;
}) => (
  <button
    type="button"
    className="nodrag group w-16 shrink-0 text-left"
    onClick={(event) => {
      event.stopPropagation();
      onOpen?.(url, type);
    }}
  >
    {type === "video" ? (
      <video
        src={url}
        muted
        loop
        playsInline
        preload="metadata"
        className="h-16 w-16 rounded-lg border border-border/50 bg-background/70 object-cover"
        onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
        onMouseLeave={(event) => event.currentTarget.pause()}
      />
    ) : (
      <img
        src={url}
        alt={caption}
        loading="lazy"
        className="h-16 w-16 rounded-lg border border-border/50 bg-background/70 object-cover"
      />
    )}
    <span className="mt-1 block truncate text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
      {caption}
    </span>
  </button>
);

/** Compact references/output strip. Media only — never prompt text. */
const NodeMediaStrip = ({
  media,
  onOpen,
}: {
  media: NodeMedia;
  onOpen?: (url: string, type: "image" | "video") => void;
}) => {
  if (media.unavailable && !media.output && !media.references.length) {
    return (
      <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        Reference unavailable
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {media.references.length ? (
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            References / Inputs
          </p>
          <div className="nowheel mt-1 flex gap-1.5 overflow-x-auto pb-1">
            {media.references.slice(0, 6).map((ref, index) => (
              <MediaThumb
                key={`${ref.url}-${index}`}
                url={ref.url}
                type={ref.type}
                caption={ref.role ? ref.role.toUpperCase() : ref.label ?? `Ref ${index + 1}`}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ) : null}
      {media.output ? (
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Output</p>
          <div className="mt-1 flex gap-1.5">
            <MediaThumb url={media.output.url} type={media.output.type} caption="Result" onOpen={onOpen} />
          </div>
        </div>
      ) : null}
    </div>
  );
};

const TemplateFlowNode = ({ id, data, selected }: NodeProps<GraphCanvasNode>) => {

  const Icon = KIND_ICON[data.kind];
  const inputPorts = inputPortsFor(data);
  const outputPort = outputPortFor(data);
  const isModelNode = data.kind === "image" || data.kind === "video";
  const isPromptBlock = data.kind === "prompt";
  const promptEditable = (isModelNode || isPromptBlock) && typeof data.onPromptCommit === "function";
  const [editingPrompt, setEditingPrompt] = useState(false);
  const promptRaw = data.promptValue ?? data.promptPreview;
  const [promptDraft, setPromptDraft] = useState(promptRaw);

  const run = data.run ?? null;
  const running = run?.status === "queued" || run?.status === "running";
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running || !run?.startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - (run.startedAt ?? Date.now())) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [running, run?.startedAt]);

  const progressPct = running ? Math.min(94, 8 + elapsed * 2.4) : run?.status === "complete" ? 100 : 0;

  const commitPrompt = () => {
    setEditingPrompt(false);
    const next = promptDraft.trim();
    if (next !== promptRaw.trim()) data.onPromptCommit?.(id, promptDraft);
  };

  return (
    <div
      className={`relative w-[300px] rounded-2xl border bg-card/80 p-4 backdrop-blur-xl transition-all ${
        selected
          ? "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.5),0_18px_50px_-12px_hsl(var(--primary)/0.55)]"
          : "border-border/60 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.85)] hover:border-primary/40"
      }`}
    >
      {!inputPorts.length && !isPromptBlock ? (
        <Handle
          type="target"
          position={Position.Left}
          className={handleBase}
          style={{ background: PORT_COLOR.image, top: 28 }}
        />
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id={outputPort.id}
        className={handleBase}
        style={{ background: PORT_COLOR[outputPort.type], top: 28 }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
            {data.nodeNumber ?? "?"}
          </span>
          <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${KIND_ACCENT[data.kind]}`}>
            <Icon className="h-3 w-3" />
            {data.kindLabel}
          </span>
          {data.helpText ? (
            <span
              title={data.helpText}
              aria-label={data.helpText}
              className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border/70 bg-background/70 text-[9px] font-bold text-muted-foreground"
            >
              ?
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {data.outputNumber ? (
            <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
              Out {data.outputNumber}
            </span>
          ) : null}
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <PortDot type={outputPort.type} />
            {outputPort.label}
          </span>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight text-foreground">{data.title}</p>

      {data.modelBadge ? (
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.14em] text-primary/80">{data.modelBadge}</p>
      ) : null}

      {data.assetUrl ? (
        <img
          src={data.assetUrl}
          alt={data.title}
          className="mt-3 h-24 w-full rounded-xl border border-border/50 bg-background/70 object-contain"
        />
      ) : data.kind === "input" ? (
        <div className="mt-3 flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/50 text-center text-[11px] text-muted-foreground">
          {data.isReference
            ? "No fixed image yet — upload one"
            : data.expected ? `Expects ${data.expected}` : "Runtime upload"}
        </div>
      ) : null}

      {data.isReference && data.onUploadReference ? (
        <label className="nodrag mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary transition hover:bg-primary/20">
          {data.uploadingReference ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {data.assetUrl ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={data.uploadingReference}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) data.onUploadReference?.(id, file);
            }}
          />
        </label>
      ) : null}

      {isModelNode ? (
        <div className="mt-3 space-y-1.5">
          {inputPorts.map((port) => (
            <div key={port.id} className="relative flex items-center gap-2">
              <Handle
                type="target"
                id={port.id}
                position={Position.Left}
                className={handleBase}
                style={{ background: PORT_COLOR[port.type], left: -24, top: "50%" }}
              />
              <PortDot type={port.type} />
              <span className="text-[11px] font-medium text-muted-foreground">{port.label}</span>
            </div>
          ))}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {([
              { type: "image" as PortType, label: "Image" },
              { type: "video" as PortType, label: "Video" },
              { type: "prompt" as PortType, label: "Prompt" },
            ]).map((option) => (
              <button
                key={option.type}
                type="button"
                title={`Add ${option.label.toLowerCase()} input`}
                className="nodrag inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onAddPort?.(id, option.type);
                }}
              >
                <Plus className="h-3 w-3" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {data.detailLine ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{data.detailLine}</p>
      ) : null}

      {data.media ? <NodeMediaStrip media={data.media} onOpen={data.onOpenMedia} /> : null}



      <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {data.kind === "input" ? "Input" : "Prompt"}
          </p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{data.incomingCount} in</span>
        </div>
        {editingPrompt ? (
          <textarea
            autoFocus
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={commitPrompt}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commitPrompt();
              }
              if (event.key === "Escape") {
                setPromptDraft(promptRaw);
                setEditingPrompt(false);
              }
            }}
            className="nodrag nowheel mt-1 min-h-[92px] w-full resize-y rounded-lg border border-primary/50 bg-background/90 p-2 text-[11px] leading-relaxed text-foreground outline-none"
          />
        ) : (
          <p
            title={promptEditable ? "Double-click to edit the prompt" : undefined}
            onDoubleClick={promptEditable ? (event) => {
              event.stopPropagation();
              setPromptDraft(promptRaw);
              setEditingPrompt(true);
            } : undefined}
            className={`mt-1 line-clamp-3 text-[11px] leading-relaxed text-foreground/85 ${promptEditable ? "nodrag cursor-text rounded-lg px-1 py-0.5 transition hover:bg-primary/10" : ""}`}
          >
            {data.promptPreview}
          </p>
        )}
      </div>

      {data.refLabels.length ? (
        <div className="mt-2 space-y-1">
          {data.refLabels.map((label, index) => (
            <p key={`${label}-${index}`} className="line-clamp-1 text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground/80">Ref {index + 1}</span> · {label}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 line-clamp-1 text-[10px] text-muted-foreground">From: {data.sourceSummary}</p>
      )}

      {isModelNode && (running || run?.status === "complete" || run?.status === "failed") ? (
        <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {running ? "Generating" : run?.status === "complete" ? "Result" : "Failed"}
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              {running ? `${elapsed}s` : null}
              {run?.estimatedCredits ? `${running ? " · " : ""}≈ ${run.estimatedCredits} credits` : null}
            </span>
          </div>

          {running ? (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-cyan-300 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          ) : null}

          {run?.status === "complete" && run.outputUrl ? (
            run.outputType === "video" ? (
              <video
                src={run.outputUrl}
                controls
                loop
                muted
                playsInline
                className="nodrag mt-2 max-h-56 w-full rounded-lg border border-border/50 bg-background/80 object-contain"
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <img
                src={run.outputUrl}
                alt={`${data.title} result`}
                className="mt-2 max-h-56 w-full rounded-lg border border-border/50 bg-background/80 object-contain"
              />
            )
          ) : null}

          {run?.status === "failed" && run.error ? (
            <p className="nowheel mt-2 max-h-24 overflow-y-auto text-[10px] leading-relaxed text-destructive">{run.error}</p>
          ) : null}
        </div>
      ) : null}

      {isModelNode ? (
        data.onRunNode ? (
          <button
            type="button"
            disabled={running}
            onClick={(event) => {
              event.stopPropagation();
              data.onRunNode?.(id);
            }}
            className="nodrag mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/50 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary transition hover:bg-primary/20 disabled:cursor-wait disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {running ? "Generating…" : run?.status === "complete" ? "Run again" : "Run step"}
          </button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled
                  className="nodrag mt-3 inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground opacity-70"
                >
                  <Play className="h-3 w-3" />
                  Run step
                </button>
              </TooltipTrigger>
              <TooltipContent>Save the step first</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      ) : null}

    </div>
  );
};

const nodeTypes = { templateNode: TemplateFlowNode };

type DeletableEdgeData = { onDelete?: (edgeId: string) => void; refLabel?: string; edgeId?: string | null };

const DeletableEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
  data,
}: EdgeProps<Edge<DeletableEdgeData>>) => {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const [hovered, setHovered] = useState(false);
  const stroke = (style as { stroke?: string } | undefined)?.stroke ?? PORT_COLOR.image;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={26}
        style={{
          ...style,
          stroke,
          strokeWidth: selected ? 3.2 : (style as { strokeWidth?: number } | undefined)?.strokeWidth ?? 1.8,
          opacity: selected ? 1 : (style as { opacity?: number } | undefined)?.opacity ?? 0.85,
          filter: selected ? `drop-shadow(0 0 6px ${stroke})` : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {data?.refLabel ? (
            <span
              className="rounded-full border bg-card/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] backdrop-blur"
              style={{ borderColor: `${stroke}66`, color: stroke }}
            >
              {data.refLabel}
            </span>
          ) : null}
          {hovered || selected ? (
            <button
              type="button"
              aria-label="Remove connection"
              onClick={(event) => {
                event.stopPropagation();
                const realId = data?.edgeId ?? null;
                if (realId) data?.onDelete?.(realId);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-destructive/60 bg-background/95 text-destructive shadow-lg transition hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = { deletable: DeletableEdge };


type GraphCanvasProps = {
  nodes: GraphCanvasNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onNodeMoved: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectNodes: (sourceNodeId: string, targetNodeId: string, targetHandleId?: string | null) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  className?: string;
  focusNodeId?: string | null;
  onViewportApiReady?: (api: { getCenter: () => { x: number; y: number } }) => void;
};

const GraphCanvasInner = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onNodeMoved,
  onConnectNodes,
  onDeleteEdge,
  onDeleteNode,
  className,
  focusNodeId,
  onViewportApiReady,
}: GraphCanvasProps) => {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphCanvasNode>(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(edges);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();

  const recenter = useCallback(() => {
    void fitView({ duration: 450, padding: 0.22 });
  }, [fitView]);

  useEffect(() => {
    onViewportApiReady?.({
      getCenter: () => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return { x: 240, y: 200 };
        return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      },
    });
  }, [onViewportApiReady, screenToFlowPosition]);

  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNodeId || focusedRef.current === focusNodeId) return;
    if (!nodes.some((node) => node.id === focusNodeId)) return;
    focusedRef.current = focusNodeId;
    const timer = window.setTimeout(() => {
      void fitView({ nodes: [{ id: focusNodeId }], duration: 500, padding: 0.6, maxZoom: 1.1, minZoom: 0.4 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [fitView, focusNodeId, nodes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      if (event.key === "f" || event.key === "F") recenter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recenter]);

  useEffect(() => {
    setFlowNodes(nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
  }, [nodes, selectedNodeId, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(
      edges.map((edge) => {
        const { label, labelStyle, ...rest } = edge as Edge & { labelStyle?: unknown };
        return {
          ...rest,
          type: "deletable",
          selectable: true,
          focusable: true,
          data: {
            ...(edge.data ?? {}),
            refLabel: typeof label === "string" ? label : undefined,
            onDelete: onDeleteEdge,
          },
        } as Edge;
      }),
    );
  }, [edges, onDeleteEdge, setFlowEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<GraphCanvasNode>[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === "position" && change.dragging === false && change.position) {
          onNodeMoved(change.id, change.position);
        }
      }
    },
    [onNodeMoved, onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );



  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      setFlowEdges((current) => [
        ...current,
        {
          id: `pending-${connection.source}-${connection.target}-${connection.targetHandle ?? "auto"}`,
          source: connection.source,
          target: connection.target,
          targetHandle: connection.targetHandle,
          sourceHandle: connection.sourceHandle,
          style: { stroke: PORT_COLOR[portTypeForId(connection.targetHandle ?? "image")], strokeWidth: 1.8, opacity: 0.6 },
        } as Edge,
      ]);
      onConnectNodes(connection.source, connection.target, connection.targetHandle);
    },
    [onConnectNodes, setFlowEdges],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "deletable" as const,
      animated: true,
      selectable: true,
      focusable: true,
      interactionWidth: 26,
      style: { stroke: PORT_COLOR.image, strokeWidth: 1.8, opacity: 0.8 },
    }),
    [],
  );

  return (
    <div ref={wrapperRef} className={`w-full min-w-0 overflow-hidden rounded-3xl border border-border/50 bg-background/70 ${className ?? "h-[min(72vh,720px)] min-h-[460px]"}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onEdgeClick={(event, edge) => {
          event.stopPropagation();
          setFlowEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })));
        }}
        onEdgesDelete={(deleted) => {
          for (const edge of deleted) {
            if (edge.id.startsWith("pending-")) continue;
            const realId = (edge.data as { edgeId?: string | null } | undefined)?.edgeId ?? null;
            if (realId) onDeleteEdge(realId);
          }
        }}
        onNodesDelete={(deleted) => {
          if (!onDeleteNode) return;
          for (const node of deleted) {
            if (node.deletable === false) continue;
            onDeleteNode(node.id);
          }
        }}
        elementsSelectable
        edgesFocusable
        deleteKeyCode={["Delete", "Backspace"]}
        connectionRadius={34}
        connectOnClick
        defaultEdgeOptions={defaultEdgeOptions}

        fitView
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right" className="!m-3">
          <button
            type="button"
            onClick={recenter}
            title="Fit all steps in view (F)"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/50 bg-card/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary shadow-lg backdrop-blur transition hover:bg-primary/15"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Recenter
          </button>
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="hsl(var(--primary) / 0.22)" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="!rounded-xl !border !border-border/60 !bg-card/80"
          maskColor="hsl(var(--background) / 0.7)"
          nodeColor="hsl(var(--primary) / 0.55)"
        />
      </ReactFlow>
    </div>
  );
};

const GraphCanvas = (props: GraphCanvasProps) => (
  <ReactFlowProvider>
    <GraphCanvasInner {...props} />
  </ReactFlowProvider>
);

export default GraphCanvas;
