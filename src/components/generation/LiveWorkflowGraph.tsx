/**
 * G5 — the live workflow graph. Each node reflects its REAL server status and
 * exposes only customer-safe copy ("Video 03 · Generating · Kling 3.0 Pro").
 * Status is conveyed in text as well as colour.
 */
import { useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/useAnimatedNumber";
import type { LiveGraphNode, LiveNodeStatus } from "@/services/campaignLiveStatus";
import { cn } from "@/lib/utils";

const STATUS_WORD: Record<LiveNodeStatus, string> = {
  waiting: "Queued",
  generating: "Generating",
  ready: "Ready",
  failed: "Didn't finish",
};

function nodeTitle(node: LiveGraphNode) {
  const kind = node.media_type === "video" ? "Video" : "Campaign image";
  const number = node.output_number ? ` ${String(node.output_number).padStart(2, "0")}` : "";
  const model = node.status === "generating" && node.model ? ` · ${node.model}` : "";
  return `${kind}${number} · ${STATUS_WORD[node.status]}${model}`;
}

export interface LiveWorkflowGraphProps {
  nodes: LiveGraphNode[];
  className?: string;
}

export function LiveWorkflowGraph({ nodes, className }: LiveWorkflowGraphProps) {
  const reduced = usePrefersReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!nodes.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">Workflow</p>
      <ul className="flex flex-wrap items-center gap-x-1.5 gap-y-3">
        {nodes.map((node, index) => {
          const label = nodeTitle(node);
          const open = openId === node.id;
          return (
            <li key={node.id} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-4",
                    node.status === "waiting" ? "bg-white/12" : "bg-[hsl(186_100%_62%)]/45",
                  )}
                />
              ) : null}
              <span className="relative">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : node.id)}
                  onMouseEnter={() => setOpenId(node.id)}
                  onMouseLeave={() => setOpenId((current) => (current === node.id ? null : current))}
                  aria-label={label}
                  className={cn(
                    "block h-3 w-3 rounded-full border transition-colors",
                    node.status === "ready" &&
                      "border-[hsl(186_100%_72%)] bg-[hsl(186_100%_62%)] shadow-[0_0_10px_-1px_hsl(186_100%_62%/0.8)]",
                    node.status === "generating" &&
                      cn(
                        "border-[hsl(186_100%_72%)] bg-[hsl(186_100%_62%)]/35",
                        reduced ? "" : "animate-pulse",
                      ),
                    node.status === "failed" && "border-slate-400/40 bg-slate-500/25",
                    node.status === "waiting" && "border-white/20 bg-white/[0.06]",
                  )}
                />
                {open ? (
                  <span className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/12 bg-slate-950/95 px-2 py-1 text-[11px] text-slate-200 shadow-lg">
                    {label}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default LiveWorkflowGraph;
