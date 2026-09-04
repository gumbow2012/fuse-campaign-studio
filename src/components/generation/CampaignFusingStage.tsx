/**
 * THE FUSING STAGE — the live campaign generation screen (G1–G5).
 *
 * Every value shown here comes from `campaign-live-status`. Nothing is timed,
 * simulated or randomised as the authority: microcopy rotates only within the
 * server-reported phase, and progress only moves when the server moves it.
 * Mounting simply reconnects to the server-side job — it never starts one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import FusingProgressBar from "@/components/generation/FusingProgressBar";
import LiveActivityFeed from "@/components/generation/LiveActivityFeed";
import LiveOutputReveal from "@/components/generation/LiveOutputReveal";
import LiveWorkflowGraph from "@/components/generation/LiveWorkflowGraph";
import { usePrefersReducedMotion } from "@/hooks/useAnimatedNumber";
import useCampaignLiveStatus from "@/hooks/useCampaignLiveStatus";
import type { CampaignLiveStatus, LivePhase } from "@/services/campaignLiveStatus";
import { cn } from "@/lib/utils";

/** Restrained, premium, phase-scoped. Presentation only — never the authority. */
const PHASE_MICROCOPY: Record<LivePhase, string[]> = {
  preparing: ["Reading your product", "Locking the campaign setup", "Preparing the scene"],
  images: ["Composing frames", "Matching light and colour", "Refining detail"],
  video: ["Directing motion", "Rendering clip by clip", "Holding your product true"],
  mixed: ["Frames and motion in parallel", "Assembling the campaign", "Keeping every asset consistent"],
  complete: ["Campaign delivered"],
};

const PHASE_HEADLINE: Record<LivePhase, string> = {
  preparing: "Preparing your campaign",
  images: "Fusing your campaign images",
  video: "Fusing your campaign video",
  mixed: "Fusing your campaign",
  complete: "Your campaign is ready",
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

  return lines[index] ?? lines[0] ?? null;
}

export interface CampaignFusingStageProps {
  /** Resolved run id. When null, pass resolveLatest to reconnect. */
  jobId: string | null;
  resolveLatest?: boolean;
  templateName?: string | null;
  /** Called once when the server reports a terminal status. */
  onTerminal?: (status: CampaignLiveStatus) => void;
  onViewAllOutputs?: () => void;
  className?: string;
}

export function CampaignFusingStage({
  jobId,
  resolveLatest = false,
  templateName,
  onTerminal,
  onViewAllOutputs,
  className,
}: CampaignFusingStageProps) {
  const { jobId: liveJobId, status, maxProgress, error } = useCampaignLiveStatus(jobId, {
    resolveLatest,
    onTerminal,
  });

  const job = status?.job;
  const phase = job?.phase ?? "preparing";
  const isComplete = job?.status === "complete";
  const isFailed = job?.status === "failed";
  const isActive = !!job && !isComplete && !isFailed;
  const microcopy = usePhaseMicrocopy(phase, isActive);

  const headline = isComplete
    ? "Your campaign is ready"
    : job?.headline ?? PHASE_HEADLINE[phase];
  const support = job?.support ?? null;

  const etaLabel = useMemo(() => {
    if (!isActive || !status?.eta_seconds) return null;
    const minutes = Math.ceil(status.eta_seconds / 60);
    return `About ${minutes} min remaining`;
  }, [isActive, status?.eta_seconds]);

  /* Polite SR announcements on meaningful changes only. */
  const announceKey = `${job?.status ?? ""}|${headline}|${status?.outputs.ready ?? 0}|${status?.active[0]?.label ?? ""}`;
  const lastAnnounced = useRef("");
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!job || lastAnnounced.current === announceKey) return;
    lastAnnounced.current = announceKey;
    const activeLabel = status?.active[0]?.label;
    setAnnouncement(
      [headline, activeLabel, `${status?.outputs.ready ?? 0} of ${status?.outputs.total ?? 0} ready`]
        .filter(Boolean)
        .join(". "),
    );
  }, [announceKey, headline, job, status]);

  if (!status) {
    return (
      <section
        className={cn("rounded-[1.5rem] border border-white/10 bg-black/30 p-6", className)}
        aria-label="Campaign generation"
      >
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-100">
          Building your campaign
        </p>
        <p className="mt-2 text-sm text-slate-400">
          {error ? "Reconnecting to your campaign…" : "Reconnecting to your campaign…"}
        </p>
        <FusingProgressBar percent={0} className="mt-5" />
      </section>
    );
  }

  return (
    <section
      className={cn("rounded-[1.5rem] border border-white/10 bg-black/30 p-6", className)}
      aria-label="Campaign generation"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
          Building your campaign
          {templateName ? <span className="text-slate-600"> · {templateName}</span> : null}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400 tabular-nums">
          {isComplete ? "Complete" : isFailed ? "Interrupted" : `${Math.round(maxProgress)}%`}
        </p>
      </div>

      {/* G4 — dynamic, truthful headline + support copy */}
      <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
        {headline}
      </h2>
      {support ? <p className="mt-1.5 text-sm leading-6 text-slate-300">{support}</p> : null}
      {isActive && microcopy ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          {microcopy}
        </p>
      ) : null}

      {/* G2 — fusing wire */}
      <FusingProgressBar
        percent={maxProgress}
        complete={isComplete}
        failed={isFailed}
        className="mt-5"
      />
      {etaLabel ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {etaLabel}
        </p>
      ) : null}

      {/* G1 — live activity */}
      {isActive || status.recent.length ? (
        <LiveActivityFeed active={status.active} recent={status.recent} className="mt-5" />
      ) : null}

      {/* G5 — workflow graph */}
      <LiveWorkflowGraph nodes={status.graph} className="mt-6" />

      {/* G3 — output reveal */}
      <LiveOutputReveal
        ready={status.outputs.ready}
        total={status.outputs.total}
        items={status.outputs.items}
        className="mt-6"
      />

      {isFailed ? (
        <p className="mt-6 text-sm leading-6 text-slate-300">
          Some of this campaign didn't finish. You aren't charged for anything that didn't complete.
        </p>
      ) : null}

      {isComplete ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {liveJobId ? (
            <Button
              asChild
              className="rounded-full bg-[hsl(var(--electric-cyan))] text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
            >
              <Link to={`/app/campaigns/${encodeURIComponent(liveJobId)}/edit`}>
                Edit campaign video →
              </Link>
            </Button>
          ) : null}
          {onViewAllOutputs ? (
            <Button
              type="button"
              variant="outline"
              onClick={onViewAllOutputs}
              className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
            >
              View all outputs
            </Button>
          ) : liveJobId ? (
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
            >
              <Link to={`/app/runs/${encodeURIComponent(liveJobId)}`}>View all outputs</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

export default CampaignFusingStage;
