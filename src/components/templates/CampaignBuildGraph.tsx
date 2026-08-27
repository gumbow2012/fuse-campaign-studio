import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * TR3 — live campaign build graph.
 *
 * Renders the customer-safe `publicGraph` returned by get-job-status as a
 * compact left-to-right miniature of the FUSE node system. Node visuals are
 * driven exclusively by the REAL per-node status coming from the backend —
 * never by a timer. No prompts, provider names or template internals are used;
 * the component only reads the generic `type`, `label` and `status` fields.
 */

export type PublicGraphNodeType =
  | "INPUT"
  | "PREPARE"
  | "IMAGE"
  | "VIDEO"
  | "OUTPUT"
  | "PROCESS";

export type PublicGraphNodeStatus = "waiting" | "active" | "complete" | "failed";

export interface PublicGraphNode {
  id: string;
  type: PublicGraphNodeType;
  label: string;
  stage: number;
  deps: string[];
  status: PublicGraphNodeStatus;
  outputNumber: number | null;
}

export interface PublicGraph {
  nodes: PublicGraphNode[];
  links: Array<{ source: string; target: string }>;
}

/** Short, generic stage names — derived from node types, never template data. */
const STAGE_NAME_BY_TYPE: Record<PublicGraphNodeType, string> = {
  INPUT: "ASSETS",
  PREPARE: "PREP",
  IMAGE: "FRAMES",
  VIDEO: "VIDEO",
  OUTPUT: "FINAL",
  PROCESS: "PROCESS",
};

const STATUS_WORD: Record<PublicGraphNodeStatus, string> = {
  waiting: "waiting",
  active: "in progress",
  complete: "complete",
  failed: "failed",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

interface StageColumn {
  stage: number;
  name: string;
  status: PublicGraphNodeStatus;
  nodes: PublicGraphNode[];
}

/**
 * Nodes are grouped into columns by their backend-provided `stage` (topological
 * depth). Each column is named after the dominant node type in that stage, and
 * its rolled-up status is: failed > active > complete (all) > waiting.
 */
export function buildStageColumns(nodes: PublicGraphNode[]): StageColumn[] {
  const byStage = new Map<number, PublicGraphNode[]>();

  for (const node of nodes) {
    const stage = Number.isFinite(node.stage) ? node.stage : 0;
    const bucket = byStage.get(stage);
    if (bucket) bucket.push(node);
    else byStage.set(stage, [node]);
  }

  return [...byStage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stage, stageNodes]) => {
      const counts = new Map<PublicGraphNodeType, number>();
      for (const node of stageNodes) {
        counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
      }
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "PROCESS";

      let status: PublicGraphNodeStatus = "waiting";
      if (stageNodes.some((node) => node.status === "failed")) status = "failed";
      else if (stageNodes.some((node) => node.status === "active")) status = "active";
      else if (stageNodes.every((node) => node.status === "complete")) status = "complete";

      return {
        stage,
        name: STAGE_NAME_BY_TYPE[dominant],
        status,
        nodes: stageNodes,
      };
    });
}

const NODE_FILL: Record<PublicGraphNodeStatus, string> = {
  waiting: "rgba(148,163,184,0.14)",
  active: "rgba(103,232,249,0.22)",
  complete: "rgba(103,232,249,0.85)",
  failed: "rgba(244,63,94,0.35)",
};

const NODE_STROKE: Record<PublicGraphNodeStatus, string> = {
  waiting: "rgba(148,163,184,0.28)",
  active: "rgba(103,232,249,0.95)",
  complete: "rgba(165,243,252,0.95)",
  failed: "rgba(253,164,175,0.95)",
};

const COL_WIDTH = 78;
const ROW_HEIGHT = 34;
const PAD_X = 26;
const PAD_Y = 22;
const NODE_R = 8;

function MiniGraph({
  graph,
  reducedMotion,
}: {
  graph: PublicGraph;
  reducedMotion: boolean;
}) {
  const columns = useMemo(() => buildStageColumns(graph.nodes), [graph.nodes]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const tallest = Math.max(1, ...columns.map((column) => column.nodes.length));

    columns.forEach((column, columnIndex) => {
      const x = PAD_X + columnIndex * COL_WIDTH;
      const columnHeight = (column.nodes.length - 1) * ROW_HEIGHT;
      const top = PAD_Y + ((tallest - 1) * ROW_HEIGHT - columnHeight) / 2;
      column.nodes.forEach((node, rowIndex) => {
        map.set(node.id, { x, y: top + rowIndex * ROW_HEIGHT });
      });
    });

    return map;
  }, [columns]);

  const statusById = useMemo(() => {
    const map = new Map<string, PublicGraphNodeStatus>();
    for (const node of graph.nodes) map.set(node.id, node.status);
    return map;
  }, [graph.nodes]);

  const tallest = Math.max(1, ...columns.map((column) => column.nodes.length));
  const width = PAD_X * 2 + Math.max(0, columns.length - 1) * COL_WIDTH;
  const height = PAD_Y * 2 + (tallest - 1) * ROW_HEIGHT + 18;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      style={{ maxHeight: 220 }}
      role="presentation"
      focusable="false"
    >
      {graph.links.map((link, index) => {
        const from = positions.get(link.source);
        const to = positions.get(link.target);
        if (!from || !to) return null;

        const sourceStatus = statusById.get(link.source);
        const lit = sourceStatus === "complete";
        const failed = sourceStatus === "failed";
        const midX = (from.x + to.x) / 2;

        return (
          <path
            key={`${link.source}-${link.target}-${index}`}
            d={`M ${from.x + NODE_R} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x - NODE_R} ${to.y}`}
            fill="none"
            stroke={
              failed
                ? "rgba(244,63,94,0.55)"
                : lit
                  ? "rgba(103,232,249,0.75)"
                  : "rgba(148,163,184,0.2)"
            }
            strokeWidth={lit ? 1.4 : 1}
            style={reducedMotion ? undefined : { transition: "stroke 400ms ease" }}
          />
        );
      })}

      {columns.map((column, columnIndex) => (
        <text
          key={`stage-${column.stage}`}
          x={PAD_X + columnIndex * COL_WIDTH}
          y={height - 4}
          textAnchor="middle"
          fontSize={7}
          letterSpacing={1.2}
          fill={
            column.status === "waiting"
              ? "rgba(148,163,184,0.5)"
              : column.status === "failed"
                ? "rgba(253,164,175,0.9)"
                : "rgba(165,243,252,0.9)"
          }
        >
          {column.name}
        </text>
      ))}

      {graph.nodes.map((node) => {
        const point = positions.get(node.id);
        if (!point) return null;
        const pulse = node.status === "active" && !reducedMotion;

        return (
          <g key={node.id}>
            {node.status === "active" || node.status === "complete" ? (
              <circle
                cx={point.x}
                cy={point.y}
                r={NODE_R + 5}
                fill="rgba(103,232,249,0.12)"
                className={pulse ? "animate-pulse" : undefined}
              />
            ) : null}
            <circle
              cx={point.x}
              cy={point.y}
              r={NODE_R}
              fill={NODE_FILL[node.status]}
              stroke={NODE_STROKE[node.status]}
              strokeWidth={1.2}
              style={reducedMotion ? undefined : { transition: "fill 400ms ease, stroke 400ms ease" }}
            />
            {node.outputNumber ? (
              <text
                x={point.x}
                y={point.y + 2.6}
                textAnchor="middle"
                fontSize={7.5}
                fill={node.status === "complete" ? "rgba(2,6,23,0.9)" : "rgba(226,232,240,0.85)"}
              >
                {node.outputNumber}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function StageDot({ status, reducedMotion }: { status: PublicGraphNodeStatus; reducedMotion: boolean }) {
  if (status === "complete") return <span className="text-cyan-200">✓</span>;
  if (status === "failed") return <span className="text-rose-300">✕</span>;
  if (status === "active") {
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)] ${
          reducedMotion ? "" : "animate-pulse"
        }`}
      />
    );
  }
  return <span className="inline-block h-2 w-2 rounded-full border border-white/25" />;
}

function StageList({
  columns,
  reducedMotion,
}: {
  columns: StageColumn[];
  reducedMotion: boolean;
}) {
  return (
    <ol className="space-y-2">
      {columns.map((column) => (
        <li key={column.stage} className="flex items-center gap-3">
          <span className="flex h-4 w-4 items-center justify-center text-xs">
            <StageDot status={column.status} reducedMotion={reducedMotion} />
          </span>
          <span
            className={`text-[11px] uppercase tracking-[0.22em] ${
              column.status === "waiting"
                ? "text-slate-500"
                : column.status === "failed"
                  ? "text-rose-200"
                  : "text-slate-100"
            }`}
          >
            {column.name}
          </span>
          <span className="sr-only">{STATUS_WORD[column.status]}</span>
        </li>
      ))}
    </ol>
  );
}

import { canInitiateFork, isCreatorLockedState, type CustomizeState } from "@/lib/customizeGating";

export type PublicGraphRunStatus = "queued" | "running" | "video_pending" | "complete" | "failed";

export interface CampaignBuildGraphProps {
  graph: PublicGraph;
  /** Friendly stage copy from get-job-status; shown while the run is active. */
  statusMessage?: string;
  progress?: number;
  /** Real run status — the graph stays mounted for the entire lifecycle (P0). */
  runStatus?: PublicGraphRunStatus;
  /** Server-truthful gating state (plan + template permission) resolved by the page. */
  customizeState?: CustomizeState;
  /** P0: clearly-named handler — swapping in the private-fork editor is a one-line change. */
  onCustomizeWorkflow?: () => void;
  /** Starter / Plus / Free: locked affordance opens the upgrade modal. */
  onLockedCustomize?: () => void;
  className?: string;
}

export function CampaignBuildGraph({
  graph,
  statusMessage,
  progress,
  runStatus = "running",
  customizeState = "plan_locked_creator_locked",
  onCustomizeWorkflow,
  onLockedCustomize,
  className,
}: CampaignBuildGraphProps) {
  const reducedMotion = useReducedMotion();
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const columns = useMemo(() => buildStageColumns(graph.nodes), [graph.nodes]);
  const isComplete = runStatus === "complete";
  const isFailed = runStatus === "failed";
  const isActive = !isComplete && !isFailed;
  const canCustomize = canInitiateFork(customizeState);
  const creatorLocked = isCreatorLockedState(customizeState);
  const interactive = isComplete && canCustomize && !!onCustomizeWorkflow;

  const summary = useMemo(
    () => columns.map((column) => `${column.name} ${STATUS_WORD[column.status]}`).join(", "),
    [columns],
  );

  if (!graph.nodes.length) return null;

  const safeProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, Math.round(progress)))
      : null;

  return (
    <section
      className={`rounded-[1.5rem] border bg-black/25 p-5 transition-colors ${
        interactive
          ? "cursor-pointer border-white/8 hover:border-cyan-200/40 hover:shadow-[0_0_0_1px_rgba(165,243,252,0.18)]"
          : "border-white/8"
      } ${className ?? ""}`}
      aria-label="Campaign build progress"
      onClick={interactive ? onCustomizeWorkflow : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold tracking-[0.18em] text-slate-100">
            {isActive ? "BUILDING YOUR CAMPAIGN" : "CAMPAIGN WORKFLOW"}
          </p>
          {isComplete ? (
            canCustomize ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCustomizeWorkflow?.();
                }}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] tracking-[0.14em] text-cyan-200/90 transition-colors hover:text-cyan-100"
              >
                Customize workflow <span aria-hidden="true">→</span>
              </button>
            ) : creatorLocked ? (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] tracking-[0.14em] text-slate-500">
                <span aria-hidden="true">🔒</span> Locked by creator
              </p>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onLockedCustomize?.();
                }}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] tracking-[0.14em] text-slate-400 transition-colors hover:text-slate-200"
              >
                <span aria-hidden="true">🔒</span> Customize workflow · PRO
              </button>
            )
          ) : null}
        </div>
        <p className={`shrink-0 text-[11px] tabular-nums ${isFailed ? "text-rose-200/90" : "text-cyan-100/90"}`}>
          {isComplete ? "✓ COMPLETE" : isFailed ? "✕ INTERRUPTED" : safeProgress !== null ? `${safeProgress}%` : ""}
        </p>
      </div>

      {/* Desktop / tablet: condensed left-to-right node diagram. */}
      <div className="mt-3 hidden sm:block">
        <MiniGraph graph={graph} reducedMotion={reducedMotion} />
      </div>

      {/* Mobile: clean vertical stage list, with an opt-in miniature graph. */}
      <div className="mt-3 sm:hidden">
        <StageList columns={columns} reducedMotion={reducedMotion} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMobileExpanded((value) => !value);
          }}
          aria-expanded={mobileExpanded}
          className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200/80"
        >
          View build
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${mobileExpanded ? "rotate-180" : ""}`}
          />
        </button>
        {mobileExpanded ? (
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[320px]">
              <MiniGraph graph={graph} reducedMotion={reducedMotion} />
            </div>
          </div>
        ) : null}
      </div>

      {isActive ? (
        <p className="mt-4 text-sm text-slate-200" aria-live="polite">
          {statusMessage || "Working on your campaign"}
        </p>
      ) : null}
      {isFailed ? (
        <p className="mt-4 text-sm text-rose-100/80" aria-live="polite">
          Generation interrupted — try again.
        </p>
      ) : null}
      <p className="sr-only">{summary}</p>
    </section>
  );
}

export default CampaignBuildGraph;
