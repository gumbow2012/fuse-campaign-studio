import { useEffect, useState } from "react";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  submitTemplateFeedback,
  type RunFeedbackRecord,
} from "@/services/fuseApi";

type VoteValue = "up" | "down" | null;

interface RunFeedbackCardProps {
  jobId: string;
  initialFeedback?: RunFeedbackRecord | null;
  compact?: boolean;
  className?: string;
  onSaved?: (feedback: RunFeedbackRecord) => void;
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RunFeedbackCard({
  jobId,
  initialFeedback = null,
  compact = false,
  className,
  onSaved,
}: RunFeedbackCardProps) {
  const [vote, setVote] = useState<VoteValue>(initialFeedback?.vote ?? null);
  const [feedbackText, setFeedbackText] = useState(initialFeedback?.feedback ?? "");
  const [savedFeedback, setSavedFeedback] = useState<RunFeedbackRecord | null>(initialFeedback);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVote(initialFeedback?.vote ?? null);
    setFeedbackText(initialFeedback?.feedback ?? "");
    setSavedFeedback(initialFeedback);
  }, [initialFeedback, jobId]);

  const trimmedFeedback = feedbackText.trim();
  const savedVote = savedFeedback?.vote ?? null;
  const savedText = savedFeedback?.feedback ?? "";
  const dirty = vote !== savedVote || trimmedFeedback !== savedText;
  const canSubmit = !saving && dirty && (vote !== null || trimmedFeedback.length > 0);

  const handleSave = async () => {
    if (!canSubmit) return;

    setSaving(true);
    try {
      const nextFeedback = await submitTemplateFeedback({
        jobId,
        vote,
        feedback: trimmedFeedback,
      });
      setSavedFeedback(nextFeedback);
      setVote(nextFeedback.vote);
      setFeedbackText(nextFeedback.feedback ?? "");
      onSaved?.(nextFeedback);
      toast({
        title: "Feedback saved",
        description: "Run feedback recorded for this template output.",
      });
    } catch (error) {
      toast({
        title: "Feedback failed",
        description: error instanceof Error ? error.message : "Could not save run feedback.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updatedAtLabel = formatUpdatedAt(savedFeedback?.updatedAt);

  return (
    <section
      className={cn(
        "rounded-[1.5rem] border border-white/10 bg-black/20 p-4",
        compact ? "space-y-3" : "space-y-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Quick feedback
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Thumb the result and drop a fast note if the output was off.
          </p>
        </div>
        {updatedAtLabel ? (
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Saved {updatedAtLabel}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVote(vote === "up" ? null : "up")}
          className={cn(
            "rounded-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-emerald-400/15 hover:text-emerald-50",
            vote === "up" && "border-emerald-300/40 bg-emerald-400/15 text-emerald-50",
          )}
        >
          <ThumbsUp className="mr-2 h-4 w-4" />
          Thumbs up
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVote(vote === "down" ? null : "down")}
          className={cn(
            "rounded-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-rose-400/15 hover:text-rose-50",
            vote === "down" && "border-rose-300/40 bg-rose-400/15 text-rose-50",
          )}
        >
          <ThumbsDown className="mr-2 h-4 w-4" />
          Thumbs down
        </Button>
      </div>

      <Textarea
        value={feedbackText}
        onChange={(event) => setFeedbackText(event.target.value)}
        maxLength={1000}
        placeholder="What was good, what broke, or what should change next?"
        className="min-h-[92px] border-white/10 bg-white/[0.03] text-slate-100 placeholder:text-slate-500"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {trimmedFeedback.length}/1000 characters
        </p>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSubmit}
          className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 disabled:bg-white/10 disabled:text-slate-500"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save feedback
        </Button>
      </div>
    </section>
  );
}
