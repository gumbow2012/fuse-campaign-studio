import { useEffect, useState } from "react";
import { Check, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { submitTemplateFeedback, type RunFeedbackRecord } from "@/services/fuseApi";

/**
 * P0 — tiny, visually-subordinate run-level feedback control.
 * Replaces the giant RunFeedbackCard: 👍 saves immediately, 👎 opens a small
 * "What was off?" popover with structured reasons + an optional note.
 */
export function RunFeedbackInline({
  jobId,
  initialFeedback,
  onSaved,
  className,
}: {
  jobId: string;
  initialFeedback: RunFeedbackRecord | null;
  onSaved: (record: RunFeedbackRecord) => void;
  className?: string;
}) {
  const [saved, setSaved] = useState<RunFeedbackRecord | null>(initialFeedback);
  const [busy, setBusy] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    setSaved(initialFeedback);
    setThanked(false);
    setReason(null);
    setNote("");
    setPopoverOpen(false);
  }, [jobId, initialFeedback]);

  const save = async (vote: "up" | "down", feedback: string) => {
    setBusy(true);
    const record = await submitTemplateFeedback({ jobId, vote, feedback });
    setBusy(false);
    if (!record) return;
    setSaved(record);
    onSaved(record);
  };

  if (saved) {
    return (
      <p className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
        <Check className="h-3.5 w-3.5 text-cyan-200/80" aria-hidden="true" />
        {thanked ? "Thanks — this helps improve FUSE." : "✓ Feedback sent"}
      </p>
    );
  }

  const sendDown = async () => {
    const feedback = [reason, note.trim() ? `— ${note.trim()}` : null].filter(Boolean).join(" ");
    await save("down", feedback);
    setPopoverOpen(false);
    setThanked(true);
  };

  return (
    <div className={`inline-flex flex-wrap items-center gap-2.5 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">How did this campaign turn out?</span>
      <button
        type="button"
        disabled={busy}
        aria-label="Thumbs up"
        onClick={async () => {
          await save("up", "");
          setThanked(true);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-cyan-200/40 hover:text-cyan-100 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
      </button>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label="Thumbs down"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:border-rose-200/40 hover:text-rose-100 disabled:opacity-50"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 rounded-xl border-white/10 bg-[#0c101c] p-3.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]"
        >
          <p className="text-xs font-semibold tracking-[0.08em] text-slate-200">What was off?</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {DOWN_REASONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReason((current) => (current === option ? null : option))}
                aria-pressed={reason === option}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  reason === option
                    ? "border-cyan-200/60 bg-cyan-200/10 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Optional note"
            className="mt-2.5 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-200/40"
          />
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              disabled={busy || !reason}
              onClick={() => void sendDown()}
              className="inline-flex items-center gap-1.5 rounded-full bg-cyan-200/90 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#062a33] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Send
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const DOWN_REASONS = [
  "Product accuracy",
  "Subject",
  "Cast",
  "Motion",
  "Composition",
  "Output quality",
  "Something else",
] as const;

export default RunFeedbackInline;
