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
import { Film, Image as ImageIcon, Upload } from "lucide-react";

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

const handleClass =
  "!h-3 !w-3 !rounded-full !border-2 !border-background !bg-primary !shadow-[0_0_0_3px_hsl(var(--primary)/0.22)]";

const TemplateFlowNode = ({ data, selected }: NodeProps<GraphCanvasNode>) => {
  const Icon = KIND_ICON[data.kind];
  return (
    <div
      className={`w-[272px] rounded-2xl border bg-card/80 p-4 backdrop-blur-xl transition-all ${
        selected
          ? "border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.5),0_18px_50px_-12px_hsl(var(--primary)/0.55)]"
          : "border-border/60 shadow-[0_14px_40px_-24px_rgba(0,0,0,0.85)] hover:border-primary/40"
      }`}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />

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
        {data.outputNumber ? (
          <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
            Out {data.outputNumber}
          </span>
        ) : null}
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

      <p className="mt-2 line-clamp-1 text-[10px] text-muted-foreground">From: {data.sourceSummary}</p>
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
};

const GraphCanvasInner = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onNodeMoved,
  onConnectNodes,
  onDeleteEdge,
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
      style: { stroke: "hsl(var(--primary))", strokeWidth: 1.8, opacity: 0.75 },
    }),
    [],
  );

  return (
    <div className="h-[min(72vh,720px)] min-h-[460px] w-full min-w-0 overflow-hidden rounded-3xl border border-border/50 bg-background/70">
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
