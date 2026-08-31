/**
 * Creator builder HELP panel (presentation only).
 * Always reachable from the creator-mode builder header so the education
 * survives onboarding. Replay walkthrough restarts the interactive coachmark
 * tutorial over the real builder controls.
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREATOR_HELP_TOPICS, CREATOR_NODE_HELP } from "@/lib/creatorBuilderCopy";
import { CREATOR_PORT_LEGEND } from "@/lib/creatorTutorial";

const NODE_ORDER = ["input", "reference", "prompt", "image", "video", "connection"] as const;

export default function CreatorBuilderHelpPanel({
  open,
  onClose,
  onReplayWalkthrough,
}: {
  open: boolean;
  onClose: () => void;
  onReplayWalkthrough?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <button type="button" aria-label="Close help" className="flex-1" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border/60 bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Builder help
            </p>
            <h2 className="mt-1 font-display text-xl font-black uppercase tracking-tight">
              How FUSE templates work
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close help" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-5 w-full rounded-full"
          onClick={onReplayWalkthrough}
          disabled={!onReplayWalkthrough}
        >
          Replay walkthrough
        </Button>
        {!onReplayWalkthrough ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Open a template draft to replay the guided walkthrough.
          </p>
        ) : null}

        <section className="mt-6">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
            Port legend
          </h3>
          <ul className="mt-2 space-y-1.5">
            {CREATOR_PORT_LEGEND.map((item) => (
              <li key={item.label} className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{item.label}</span> — {item.body}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
            Node guide
          </h3>
          <ul className="mt-3 space-y-2.5">
            {NODE_ORDER.map((key) => (
              <li key={key} className="rounded-xl border border-border/50 bg-background/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  {CREATOR_NODE_HELP[key].title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {CREATOR_NODE_HELP[key].body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {CREATOR_HELP_TOPICS.map((topic) => (
          <section key={topic.title} className="mt-6">
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
              {topic.title}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {topic.points.map((point) => (
                <li key={point} className="text-sm leading-relaxed text-muted-foreground">
                  · {point}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
    </div>
  );
}
