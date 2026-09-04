/**
 * R3/R7 — CAMPAIGN WORKFLOW.
 *
 * The identity block of the results experience: the live fusing wire and real
 * activity while the run is executing, and a resolved graph once the server
 * says execution is complete. Never renders a global failure/partial state —
 * missing outputs are handled at the slot level in the sections below (R1).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import FusingProgressBar from "@/components/generation/FusingProgressBar";
import LiveActivityFeed from "@/components/generation/LiveActivityFeed";
import LiveWorkflowGraph from "@/components/generation/LiveWorkflowGraph";
import { usePrefersReducedMotion } from "@/hooks/useAnimatedNumber";
import type { CampaignLiveStatus, LivePhase } from "@/services/campaignLiveStatus";
import type { CustomizeState } from "@/lib/customizeGating";
import { cn } from "@/lib/utils";

const PHASE_MICROCOPY: Partial<Record<LivePhase, string[]>> = {
  preparing: ["Reading your product", "Locking the campaign setup", "Preparing the scene"],
  images: ["Composing frames", "Matching light and colour", "Refining detail"],
  video: ["Directing motion", "Rendering clip by clip", "Holding your product true"],
  mixed: ["Frames and motion in parallel", "Assembling the campaign", "Keeping every asset consistent"],
};

const PHASE_HEADLINE: Record<LivePhase, string> = {
  preparing: "Preparing your campaign",
  images: "Fusing your campaign images",
  video: "Fusing your campaign video",
  mixed: "Fusing your campaign",
  ready: "Your campaign is ready",
  complete: "Your campaign is ready",
  needs_action: "Your campaign is ready",
};

function usePhaseMicrocopy(phase: LivePhase, active: boolean) {
  const reduced = usePrefersReducedMotion();
  const lines = PHASE_MICROCOPY[phase] ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (reduced || !active || lines.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % lines.length), 6000);
    return () => window.clearInterval(timer);
  }, [active, lines.length, phase, reduced]);

  return active ? lines[index] ?? lines[0] ?? null : null;
}

export interface CampaignWorkflowPanelProps {
  status: CampaignLiveStatus;
  maxProgress: number;
  templateName?: string | null;
  /** R7 — the existing private-fork entry point, wired by the parent. */
  customizeState?: CustomizeState;
  onCustomizeWorkflow?: () => void;
  onLockedCustomize?: () => void;
  className?: string;
}

export function CampaignWorkflowPanel({
  status,
  maxProgress,
  templateName,
  customizeState,
  onCustomizeWorkflow,
  onLockedCustomize,
  className,
}: CampaignWorkflowPanelProps) {
  const job = status.job;
  const done = job.execution_complete;
  const running = !done;
  const microcopy = usePhaseMicrocopy(job.phase, running);

  /* R2 — a terminal job never keeps generating copy, ETA or partial progress. */
  const percent = done ? 100 : maxProgress;
  const headline = done
    ? job.headline ?? PHASE_HEADLINE[job.phase]
    : job.headline ?? PHASE_HEADLINE[job.phase];
  const support = job.support ?? null;

  const etaLabel = useMemo(() => {
    if (done || !status.eta_seconds) return null;
    return `About ${Math.ceil(status.eta_seconds / 60)} min remaining`;
  }, [done, status.eta_seconds]);

  const graph = useMemo(
    () =>
      done
        ? status.graph.map((node) => (node.status === "generating" ? { ...node, status: "ready" as const } : node))
        : status.graph,
    [done, status.graph],
  );

  /* Polite SR updates on meaningful changes only. */
  const announceKey = `${job.status}|${headline}|${status.outputs.ready}|${status.active[0]?.label ?? ""}`;
  const lastAnnounced = useRef("");
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (lastAnnounced.current === announceKey) return;
    lastAnnounced.current = announceKey;
    setAnnouncement(
      [headline, running ? status.active[0]?.label : null, `${status.outputs.ready} of ${status.outputs.total} ready`]
        .filter(Boolean)
        .join(". "),
    );
  }, [announceKey, headline, running, status.active, status.outputs.ready, status.outputs.total]);

  const showCustomize = done && !!customizeState;

  return (
    <section
      className={cn("rounded-[1.5rem] border border-white/10 bg-black/30 p-5 sm:p-6", className)}
      aria-label="Campaign workflow"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            Campaign workflow
            {templateName ? <span className="text-slate-600"> · {templateName}</span> : null}
          </p>
          {showCustomize ? (
            customizeState === "active" ? (
              <button
                type="button"
                onClick={onCustomizeWorkflow}
                className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/90 transition-colors hover:text-cyan-100"
              >
                Edit workflow · Pro <span aria-hidden="true">→</span>
              </button>
            ) : customizeState === "creator_locked" ||
              customizeState === "plan_locked_creator_locked" ? null : (
              <button
                type="button"
                onClick={onLockedCustomize}
                className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 transition-colors hover:text-slate-300"
              >
                Edit workflow · Pro
              </button>
            )
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 tabular-nums">
          {done ? "Complete" : `${Math.round(percent)}%`}
        </p>
      </div>

      <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
        {headline}
      </h2>
      {support ? <p className="mt-1.5 text-sm leading-6 text-slate-300">{support}</p> : null}
      {microcopy ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{microcopy}</p>
      ) : null}

      <FusingProgressBar percent={percent} complete={done} className="mt-5" />
      {etaLabel ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{etaLabel}</p>
      ) : null}

      {running && (status.active.length || status.recent.length) ? (
        <LiveActivityFeed active={status.active} recent={status.recent} className="mt-5" />
      ) : null}

      <LiveWorkflowGraph nodes={graph} className="mt-6" />

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

export default CampaignWorkflowPanel;
