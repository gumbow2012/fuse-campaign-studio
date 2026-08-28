/**
 * Madden Media Studio — M6 prompt preview.
 *
 * Compile + preview only. Nothing here calls a provider or spends credits: the
 * "generate" action reveals the compiled payload and is explicitly marked
 * LIVE GENERATION VERIFICATION PENDING.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Copy, PlayCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { resolveMaddenPrompt } from "@/lib/madden-media/promptCompiler";
import type { MaddenProjectState } from "@/lib/madden-media/types";

type Props = {
  state: MaddenProjectState;
  onPromptChange: (value: string) => void;
  onResetPrompt: () => void;
  /** M9: raw prompt editing + payload inspection are Advanced-only. */
  advanced?: boolean;
};

export default function MaddenPromptPreview({
  state,
  onPromptChange,
  onResetPrompt,
  advanced = false,
}: Props) {
  const [showPayload, setShowPayload] = useState(false);
  const { autoPrompt, finalPrompt, userEdited, compiled } = useMemo(
    () => resolveMaddenPrompt(state),
    [state],
  );

  const draft = state.settings.promptUserEdited ? (state.settings.promptOverride ?? "") : autoPrompt;

  const payload = useMemo(
    () =>
      JSON.stringify(
        {
          aspectRatio: state.settings.aspectRatio,
          prompt: finalPrompt,
          promptSource: userEdited ? "user" : "auto",
          referenceUrls: compiled.referenceUrls,
          shots: state.shots.map((shot) => ({
            title: shot.title,
            durationSeconds: shot.durationSeconds,
          })),
        },
        null,
        2,
      ),
    [compiled.referenceUrls, finalPrompt, state.settings.aspectRatio, state.shots, userEdited],
  );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Prompt</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Compiled from your locked subject, wardrobe, jewelry and presets. Reference images stay
            the visual authority — no names are ever injected.
          </p>
        </div>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {userEdited ? "Using your edit" : "Using auto prompt"}
        </span>
      </header>

      {compiled.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1.5 rounded-xl border border-border/60 bg-muted/30 p-3">
          {compiled.warnings.map((warning) => (
            <li
              key={warning.code}
              className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={`mt-4 grid gap-4 ${advanced ? "lg:grid-cols-2" : ""}`}>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Auto prompt
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => void copy(autoPrompt)}
            >
              <Copy className="mr-1 h-3 w-3" />
              Copy
            </Button>
          </div>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
            {autoPrompt || "Bind a subject and pick presets to compile a prompt."}
          </pre>
        </div>

        {advanced ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Final prompt
              </p>
              {userEdited ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={onResetPrompt}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset to auto
                </Button>
              ) : null}
            </div>
            <Textarea
              value={draft}
              onChange={(event) => onPromptChange(event.target.value)}
              rows={12}
              className="mt-2 font-mono text-[11px] leading-relaxed"
              placeholder="Edit the compiled prompt to take over from the compiler"
            />
          </div>
        ) : null}
      </div>

      {!advanced ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Turn on Advanced to edit this prompt by hand or inspect the compiled payload.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/60 p-3">
        {advanced ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowPayload((prev) => !prev)}
          >
            <PlayCircle className="mr-1 h-3.5 w-3.5" />
            {showPayload ? "Hide compiled payload" : "Preview compiled payload"}
          </Button>
        ) : null}
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Live generation verification pending
        </span>
      </div>

      {advanced && showPayload ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {payload}
        </pre>
      ) : null}
    </section>
  );
}
