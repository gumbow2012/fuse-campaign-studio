import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Film, Image as ImageIcon, Play, Plus, Upload } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type PortType = "prompt" | "image" | "video";

export type GraphCanvasNodeData = {
  title: string;
  nodeNumber?: number | null;
  outputNumber?: number | null;
  kind: "input" | "image" | "video" | "other";
  kindLabel: string;
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
  portIds: string[];
  onAddPort?: (nodeId: string, type: PortType) => void;
};

export type GraphCanvasNode = Node<GraphCanvasNodeData>;

const KIND_ICON = {
  input: Upload,
  image: ImageIcon,
  video: Film,
  other: ImageIcon,
} as const;

const KIND_ACCENT: Record<GraphCanvasNodeData["kind"], string> = {
  input: "border-cyan-300/40 text-cyan-200",
  image: "border-emerald-300/40 text-emerald-200",
  video: "border-primary/50 text-primary",
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

const TemplateFlowNode = ({ id, data, selected }: NodeProps<GraphCanvasNode>) => {
  const Icon = KIND_ICON[data.kind];
  const inputPorts = inputPortsFor(data);
  const outputPort = outputPortFor(data);
  const isModelNode = data.kind === "image" || data.kind === "video";

  return (
    <div
      className={`relative w-[300px] rounded-2xl border bg-card/80 p-4 backdrop-blur-xl transition-all ${
        selected
          ? "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.5),0_18px_50px_-12px_hsl(var(--primary)/0.55)]"
          : "border-border/60 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.85)] hover:border-primary/40"
      }`}
    >
      {!inputPorts.length ? (
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
        <div className="mt-3 flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/50 text-[11px] text-muted-foreground">
          {data.expected ? `Expects ${data.expected}` : "Runtime upload"}
        </div>
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

      <div className="mt-3 rounded-xl border border-border/50 bg-background/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {data.kind === "input" ? "Input" : "Prompt"}
          </p>
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{data.incomingCount} in</span>
        </div>
        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-foreground/85">{data.promptPreview}</p>
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

      {isModelNode ? (
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
            <TooltipContent>coming soon</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  );
};

const nodeTypes = { templateNode: TemplateFlowNode };

type GraphCanvasProps = {
  nodes: GraphCanvasNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onNodeMoved: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectNodes: (sourceNodeId: string, targetNodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  className?: string;
};

const GraphCanvasInner = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onNodeMoved,
  onConnectNodes,
  onDeleteEdge,
  className,
}: GraphCanvasProps) => {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<GraphCanvasNode>(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(edges);

  useEffect(() => {
    setFlowNodes(nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId })));
  }, [nodes, selectedNodeId, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(edges);
  }, [edges, setFlowEdges]);

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
      for (const change of changes) {
        if (change.type === "remove") onDeleteEdge(change.id);
      }
    },
    [onDeleteEdge, onEdgesChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return;
      onConnectNodes(connection.source, connection.target);
    },
    [onConnectNodes],
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      type: "smoothstep" as const,
      animated: true,
      style: { stroke: PORT_COLOR.image, strokeWidth: 1.8, opacity: 0.8 },
    }),
    [],
  );

  return (
    <div className={`w-full min-w-0 overflow-hidden rounded-3xl border border-border/50 bg-background/70 ${className ?? "h-[min(72vh,720px)] min-h-[460px]"}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
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
