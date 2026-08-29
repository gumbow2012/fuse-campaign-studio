/**
 * Customer Campaign Builder — compact asset slot.
 *
 * One slot = one action. The empty state is a small card with the input label,
 * a required/optional tag and a single "+ Add {ROLE}" button. Every asset source
 * (upload / library / brand-product profiles / FUSE Cast) lives behind that one
 * button and still calls the exact same handlers as before — ingestion, payload
 * shape and validation are untouched.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  HelpCircle,
  Images,
  Loader2,
  Plus,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UploadGuide from "@/components/templates/UploadGuide";
import LibraryPickerDialog from "@/components/templates/LibraryPickerDialog";
import ProfileAssetPicker from "@/components/templates/ProfileAssetPicker";
import SaveAssetToBrandPrompt from "@/components/brand/SaveAssetToBrandPrompt";
import { libraryKindForAssetType } from "@/services/libraryAssets";

import { runUploadChecks, type UploadCheckResult, type UploadCheckState } from "@/lib/uploadChecks";
import {
  resolveInputRole,
  resolveInputSources,
  type AssetSourceKind,
} from "@/lib/templateInputSources";
import type { TemplateAssetRequirement } from "@/lib/templateAssetRequirements";
import { cn } from "@/lib/utils";

interface TemplateInputCardProps {
  label: string;
  file: File | null;
  requirement?: TemplateAssetRequirement;
  /** Legacy prop kept for call-site compatibility — never rendered. */
  fallbackPlaceholderSrc?: string;
  onFileChange: (file: File | null) => void;
  /** Asset picked from the reusable library / a profile (already has a URL). */
  libraryAsset?: { url: string; name?: string | null } | null;
  onLibrarySelect?: (asset: { url: string; name?: string | null }) => void;
  /** Clears both a picked file and a library selection. */
  onClear?: () => void;
  /** Whether this input is required (drives the tag only). */
  required?: boolean;
  /** Auto-advance highlight for the next unfilled slot. */
  highlighted?: boolean;
  /** Overrides the visible slot heading (e.g. "Who's in the campaign?"). */
  displayLabel?: string;
  /** Cast-supported templates: the existing cast selector, shown inside the Add dialog. */
  castPanel?: ReactNode;
  /** Phase 10: subtle provenance note when the slot was autofilled ("From ACME"). */
  sourceNote?: string | null;
  /**
   * Mobile inline builder presentation: a ~68px tall row instead of the tall
   * card. Identical state machine, identical source picker — layout only.
   */
  compact?: boolean;
}


const SOURCE_ICONS: Record<AssetSourceKind, typeof Upload> = {
  upload: Upload,
  library: Images,
  profile: Boxes,
  cast: Users,
};

export default function TemplateInputCard({
  label,
  file,
  requirement,
  onFileChange,
  libraryAsset,
  onLibrarySelect,
  onClear,
  required = true,
  highlighted = false,
  displayLabel,
  castPanel,
  sourceNote,
  compact = false,
}: TemplateInputCardProps) {


  const inputRef = useRef<HTMLInputElement>(null);
  /*
   * Local validation state machine: idle → validating → checking → ready|warning|error.
   * "validating" is the silent phase (no overlay); the "checking" overlay only
   * appears if validation lasts longer than ~180ms. Every selection must reach
   * a terminal state — no path may leave the card stuck in checking.
   */
  const [state, setState] = useState<UploadCheckState | "idle" | "validating">("idle");
  const [checks, setChecks] = useState<UploadCheckResult | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);

  /* One stable preview URL per selected file — revoked only when the file is
     replaced/removed or the card unmounts, so the preview never flickers. */
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setState("idle");
      setChecks(null);
      setWarningDismissed(false);
      return;
    }

    setWarningDismissed(false);
    setChecks(null);
    setState("validating");
    const toChecking = window.setTimeout(() => {
      if (!cancelled) setState("checking");
    }, 180);

    /*
     * Terminal-state applier. The 180ms timer is cleared BEFORE the terminal
     * state is applied, in BOTH resolve and reject paths — a fast check can
     * never go ready and then be stomped back to "checking" by a late timer.
     * The cancelled flag guarantees a stale file's completion never updates
     * the card after a newer file was selected.
     */
    const finish = (result: UploadCheckResult) => {
      if (cancelled) return;
      window.clearTimeout(toChecking);
      setChecks(result);
      setState(result.state);
    };

    runUploadChecks(file, { transparencyRecommended: requirement?.transparencyRecommended })
      .then(finish)
      .catch(() =>
        finish({
          state: "error",
          warnings: [],
          error: "We couldn't check this image. Try uploading it again.",
          notChecked: [],
        }),
      );

    return () => {
      cancelled = true;
      window.clearTimeout(toChecking);
    };
  }, [file, requirement?.transparencyRecommended]);

  const role = resolveInputRole(label, requirement?.assetType);
  const heading = displayLabel ?? label;
  const sources = resolveInputSources(label, role, Boolean(castPanel));
  const availableSources = sources.filter((source) =>
    source.kind === "upload"
      ? requirement?.allowUpload !== false
      : source.kind === "cast"
        ? Boolean(castPanel)
        : Boolean(onLibrarySelect),
  );

  const showWarning = state === "warning" && !warningDismissed;
  const filledUrl = previewUrl ?? libraryAsset?.url ?? null;
  const assetName = file?.name ?? libraryAsset?.name ?? null;
  /* Delayed loader: the overlay only exists past the 180ms mark, so fast
     checks never flash a spinner. Local validation is NOT a server upload. */
  const busy = state === "checking";
  const isFilled = Boolean(filledUrl);

  const handleSource = (kind: AssetSourceKind) => {
    setAddOpen(false);
    if (kind === "upload") {
      window.setTimeout(() => inputRef.current?.click(), 60);
      return;
    }
    window.setTimeout(() => {
      if (kind === "library") setLibraryOpen(true);
      if (kind === "profile") setProfileOpen(true);
      if (kind === "cast") setCastOpen(true);
    }, 60);
  };

  /* Source menu + every existing picker, shared by the tall card and the
     compact mobile row so both layouts use the exact same asset sources. */
  const pickers = (
    <>
      {/* ONE action → compact source menu. Sources are never permanently rendered. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm border-white/10 bg-slate-950/95 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-[-0.02em]">{heading}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Choose where this asset comes from.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {availableSources.map((source) => {
              const Icon = SOURCE_ICONS[source.kind];
              return (
                <button
                  key={`${source.kind}-${source.label}`}
                  type="button"
                  onClick={() => handleSource(source.kind)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-cyan-200/45 hover:bg-cyan-300/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-cyan-100">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{source.label}</span>
                    {source.hint ? (
                      <span className="block truncate text-[11px] text-slate-400">{source.hint}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Existing pickers, opened on demand — same handlers as before. */}
      {onLibrarySelect ? (
        <>
          <LibraryPickerDialog
            trigger={null}
            open={libraryOpen}
            onOpenChange={setLibraryOpen}
            kinds={requirement?.assetType ? [libraryKindForAssetType(requirement.assetType)] : []}
            onSelect={(asset) => onLibrarySelect({ url: asset.url, name: asset.name })}
          />
          <ProfileAssetPicker
            trigger={null}
            open={profileOpen}
            onOpenChange={setProfileOpen}
            assetType={requirement?.assetType}
            onSelect={onLibrarySelect}
          />
        </>
      ) : null}

      {castPanel ? (
        <Dialog open={castOpen} onOpenChange={setCastOpen}>
          <DialogContent className="max-w-2xl border-white/10 bg-slate-950/95 text-white">
            <DialogHeader>
              <DialogTitle className="font-display text-xl tracking-[-0.02em]">FUSE Cast</DialogTitle>
              <DialogDescription className="text-slate-400">
                Pick who appears in this campaign.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto pr-1">{castPanel}</div>
          </DialogContent>
        </Dialog>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
    </>
  );

  /*
   * Compact mobile row — LABEL / REQUIRED / [+ ADD], or thumbnail + READY ✓ +
   * Replace once filled. Same state, same picker, ~68px tall.
   */
  if (compact) {
    return (
      <div
        className={cn(
          "flex min-h-[68px] items-center gap-3 rounded-2xl border bg-black/25 px-3 py-2.5",
          state === "error"
            ? "border-rose-300/40"
            : showWarning
              ? "border-amber-300/40"
              : isFilled
                ? "border-emerald-300/25"
                : highlighted
                  ? "border-cyan-300/60"
                  : "border-white/10",
        )}
      >
        {isFilled ? (
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900">
            <img src={filledUrl ?? ""} alt={`${heading} asset`} className="h-full w-full object-cover" />
            {busy ? (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-100" />
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
            {heading}
          </p>
          {isFilled ? (
            <p className="mt-0.5 truncate text-[11px] text-emerald-200">
              Ready ✓{sourceNote ? <span className="text-slate-400"> · {sourceNote}</span> : null}
            </p>
          ) : (
            <p className="mt-0.5 font-display text-[9px] uppercase tracking-[0.18em] text-slate-400">
              {required ? "Required" : "Optional"}
            </p>
          )}
          {state === "error" && checks?.error ? (
            <p className="mt-1 text-[10px] leading-snug text-rose-200">{checks.error}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] transition",
            isFilled
              ? "border-white/15 bg-white/[0.04] text-slate-200 hover:text-white"
              : "border-cyan-300/45 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20",
          )}
        >
          {isFilled ? "Replace" : "+ Add"}
        </button>

        {pickers}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[1.25rem] border bg-black/25 p-3 transition-colors motion-safe:transition-all",
        state === "error"
          ? "border-rose-300/40"
          : showWarning
            ? "border-amber-300/40"
            : highlighted
              ? "border-cyan-300/60 shadow-[0_0_0_3px_rgba(34,211,238,0.12)]"
              : "border-white/10",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
            {heading}
            {isFilled ? <span className="ml-1.5 text-emerald-300">✓</span> : null}
          </p>

          <span
            className={cn(
              "mt-1 inline-block rounded-full border px-2 py-0.5 font-display text-[9px] uppercase tracking-[0.18em]",
              isFilled
                ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                : required
                  ? "border-cyan-300/30 bg-cyan-300/[0.07] text-cyan-100"
                  : "border-white/10 text-slate-400",
            )}
          >
            {isFilled ? "✓ Ready" : required ? "Required" : "Optional"}
          </span>
          {sourceNote && isFilled ? (
            <span className="mt-1 ml-2 inline-block rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-display text-[9px] uppercase tracking-[0.18em] text-slate-400">
              {sourceNote}
            </span>
          ) : null}

        </div>
        <UploadGuide
          slotLabel={heading}
          requirement={requirement}
          trigger={
            <button
              type="button"
              aria-label={`Upload guidance for ${heading}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-cyan-200/40 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          }
        />
      </div>

      {isFilled ? (
        <div className="mt-3">
          <div className="relative h-[104px] overflow-hidden rounded-[0.9rem] border border-white/10 bg-slate-900">
            <img src={filledUrl ?? ""} alt={`${heading} asset`} className="h-full w-full object-cover" />
            {busy ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/70 text-[10px] uppercase tracking-[0.2em] text-cyan-100">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking asset...
              </div>
            ) : null}
          </div>
          <p className="mt-2 truncate text-xs text-slate-300">{assetName ?? "Selected asset"}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="text-[10px] uppercase tracking-[0.18em] text-cyan-200 transition hover:text-cyan-100"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => (onClear ? onClear() : onFileChange(null))}
              className="text-[10px] uppercase tracking-[0.18em] text-slate-500 transition hover:text-white"
            >
              Remove
            </button>
          </div>
          {/* Phase 5 — one-click "remember this asset" after a manual upload. */}
          {file && state !== "error" ? (
            <SaveAssetToBrandPrompt file={file} assetType={requirement?.assetType ?? null} role={role} />
          ) : null}
        </div>

      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer?.files?.[0];
            if (dropped) onFileChange(dropped);
          }}
          className="mt-3 flex h-[76px] w-full items-center justify-center gap-3 rounded-[0.9rem] border border-dashed border-cyan-200/25 bg-white/[0.02] text-center transition hover:border-cyan-200/60 hover:bg-cyan-300/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-200/35 text-cyan-100">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
            Add {heading}
          </span>

        </button>
      )}

      {state === "error" && checks?.error ? (
        <p className="mt-2 text-[11px] leading-relaxed text-rose-200">
          <XCircle className="mr-1 inline h-3.5 w-3.5" />
          {checks.error}
        </p>
      ) : null}

      {showWarning && checks?.warnings.length ? (
        <div className="mt-2 text-[11px] leading-relaxed text-amber-200">
          {checks.warnings.map((warning) => (
            <p key={warning}>
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              {warning}
            </p>
          ))}
          <button
            type="button"
            onClick={() => setWarningDismissed(true)}
            className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-400 hover:text-white"
          >
            Use anyway
          </button>
        </div>
      ) : null}

      {pickers}

    </div>
  );
}
