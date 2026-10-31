/**
 * One reference row inside the campaign setup list.
 *
 * Presentation + local file validation only. The chosen file is handed straight
 * back to the run panel, which uploads it through the existing
 * `upload-run-input` path under the field's untouched backend key.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { runUploadChecks } from "@/lib/uploadChecks";
import { categoryArtwork, type CampaignField } from "@/lib/campaignFields";
import { cn } from "@/lib/utils";

interface Props {
  field: CampaignField;
  file: File | null;
  /** Reference already living at a URL (library / saved asset). */
  assetUrl?: string | null;
  onFileChange: (file: File | null) => void;
  onClear: () => void;
  showRequirement?: boolean;
  /** Offer to make this missing view from the customer's other hat photos (back, sides, inside). */
  fill?: {
    credits: number;
    /** Why it can't run yet (signed out, no hat photo yet), or null when it can. */
    blocked: string | null;
    generate: () => Promise<string>;
    use: (url: string) => void;
  };
}

export default function CampaignReferenceRow({
  field,
  file,
  assetUrl,
  onFileChange,
  onClear,
  showRequirement = false,
  fill,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** AI fill: idle -> working -> a preview to approve, or an error. Nothing is used until "Use it". */
  const [fillState, setFillState] = useState<"idle" | "working" | { url: string } | { error: string }>("idle");
  /** A missing artwork file must never render as a broken image. */
  const [artOk, setArtOk] = useState(true);


  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const fillPreview = typeof fillState === "object" && "url" in fillState ? fillState.url : null;
  const thumbnail = previewUrl ?? assetUrl ?? fillPreview ?? null;
  const artwork = categoryArtwork(field.category);
  const filled = !!(previewUrl ?? assetUrl);

  /** Validates before accepting; a rejected file keeps any previous valid one. */
  const accept = useCallback(
    async (next: File | null) => {
      if (!next) return;
      setError(null);
      if (field.kind === "video") {
        onFileChange(next);
        return;
      }
      setChecking(true);
      try {
        const result = await runUploadChecks(next);
        if (result.state === "error") {
          setError(result.error ?? "We couldn't use that image. Try another one.");
          return;
        }
        onFileChange(next);
      } catch {
        setError("We couldn't check that image. Try again.");
      } finally {
        setChecking(false);
      }
    },
    [field.kind, onFileChange],
  );

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void accept(event.dataTransfer.files?.[0] ?? null);
      }}
      // An empty row is one big drop zone: drag a file onto it or click anywhere on it.
      onClick={filled || checking ? undefined : openPicker}
      className={cn(
        "flex items-center gap-4 transition-colors",
        filled
          ? cn("px-1 py-4", dragging && "rounded-2xl bg-primary/10")
          : cn(
              "my-2 cursor-pointer rounded-2xl border-2 border-dashed px-4 py-5",
              dragging ? "border-primary bg-primary/10" : "border-border/80 hover:border-primary/60 hover:bg-primary/[0.04]",
            ),
      )}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/40">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={`${field.label} reference`}
            className="h-full w-full object-cover"
          />
        ) : artwork && artOk ? (
          <img
            src={artwork}
            alt=""
            aria-hidden
            onError={() => setArtOk(false)}
            className="h-11 w-11 object-contain p-0.5"
          />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" aria-hidden />
        )}

      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-6 text-foreground">
          {field.label}
          {showRequirement && !field.required ? (
            <span className="ml-2 text-[13px] font-normal text-muted-foreground">Optional</span>
          ) : null}
        </p>
        {error ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-5 text-[hsl(var(--status-negative))]">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            <span>{error}</span>
          </p>
        ) : filled ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-5 text-[hsl(var(--status-positive))]">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Image added.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{field.helper}</p>
            <p className="mt-1 text-[13px] font-medium leading-5 text-foreground/80">
              {dragging ? "Drop to add" : `Drag ${field.kind === "video" ? "a video" : "an image"} here, or click to add`}
            </p>
            {fill ? (
              // Buttons inside the clickable row must not also open the file picker.
              <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                {fillState === "working" ? (
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Making the {field.label.toLowerCase()} view from your hat…
                  </span>
                ) : fillPreview ? (
                  <>
                    <span className="text-[13px] text-muted-foreground">AI-made from your photos ({fill.credits} credits used). Check it matches your hat.</span>
                    <button type="button" className="min-h-[36px] rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground" onClick={() => { fill.use(fillPreview); setFillState("idle"); }}>
                      Use it
                    </button>
                    <button type="button" className="min-h-[36px] rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground" onClick={() => setFillState("idle")}>
                      Discard
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!!fill.blocked}
                      title={fill.blocked ?? undefined}
                      onClick={async () => {
                        setFillState("working");
                        try {
                          setFillState({ url: await fill.generate() });
                        } catch (fillError) {
                          setFillState({ error: fillError instanceof Error ? fillError.message : "The view could not be made." });
                        }
                      }}
                      className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-primary/40 px-3 text-[13px] font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden /> Generate from your hat · {fill.credits} credits
                    </button>
                    {fill.blocked ? <span className="text-[12px] text-muted-foreground">{fill.blocked}</span> : null}
                    {typeof fillState === "object" && "error" in fillState ? (
                      <span className="text-[12px] text-[hsl(var(--status-negative))]">{fillState.error}</span>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </>
        )}

      </div>

      <input
        ref={inputRef}
        type="file"
        accept={field.accept}
        className="sr-only"
        aria-label={`Add ${field.label}`}
        onChange={(event) => {
          const next = event.target.files?.[0] ?? null;
          event.target.value = "";
          void accept(next);
        }}
      />

      <div className="flex shrink-0 items-center gap-1">
        {checking ? (
          <span className="flex min-h-[44px] items-center gap-2 px-3 text-[14px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Checking
          </span>
        ) : filled ? (
          <>
            <button
              type="button"
              onClick={openPicker}
              className="min-h-[44px] rounded-full px-3 text-[14px] font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                onClear();
              }}
              className="min-h-[44px] rounded-full px-3 text-[14px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation(); // the row itself also opens the picker
              openPicker();
            }}
            className="min-h-[44px] rounded-full border border-border px-4 text-[14px] font-medium text-foreground transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {error ? "Try again" : "Add image"}
          </button>
        )}
      </div>
    </div>
  );
}
