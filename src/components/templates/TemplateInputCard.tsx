/**
 * FT3 — Empty input card treatment + lightweight upload checks.
 *
 * Additive UI only: reuses FT2 requirement metadata when present and falls
 * back to the legacy label-derived placeholder when it isn't.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Images, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import UploadGuide from "@/components/templates/UploadGuide";
import { getUploadGuide } from "@/lib/uploadGuides";
import { runUploadChecks, type UploadCheckResult, type UploadCheckState } from "@/lib/uploadChecks";
import {
  formatAssetTypeLabel,
  type TemplateAssetRequirement,
  type TemplateAssetType,
} from "@/lib/templateAssetRequirements";
import { cn } from "@/lib/utils";

const ASSET_TYPE_PLACEHOLDERS: Partial<Record<TemplateAssetType, string>> = {
  "garment-front": "/template-placeholders/shirt.png?v=20260520",
  "garment-back": "/template-placeholders/shirt.png?v=20260520",
  logo: "/template-placeholders/logo.png?v=20260520",
  product: "/template-placeholders/accessory.png?v=20260520",
  jewelry: "/template-placeholders/chain.png?v=20260520",
  packaging: "/template-placeholders/accessory.png?v=20260520",
  avatar: "/template-placeholders/face.png?v=20260520",
  reference: "/template-placeholders/model.png?v=20260520",
};

interface TemplateInputCardProps {
  label: string;
  file: File | null;
  requirement?: TemplateAssetRequirement;
  /** Legacy label-derived placeholder — last-resort fallback only. */
  fallbackPlaceholderSrc: string;
  onFileChange: (file: File | null) => void;
  /** FT4: asset picked from the reusable library (already stored, has a URL). */
  libraryAsset?: { url: string; name?: string | null } | null;
  onLibrarySelect?: (asset: { url: string; name?: string | null }) => void;
}

export default function TemplateInputCard({
  label,
  file,
  requirement,
  fallbackPlaceholderSrc,
  onFileChange,
  libraryAsset,
  onLibrarySelect,
}: TemplateInputCardProps) {

  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadCheckState | "idle">("idle");
  const [checks, setChecks] = useState<UploadCheckResult | null>(null);
  const [warningDismissed, setWarningDismissed] = useState(false);

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
    setState("uploading");
    const toChecking = window.setTimeout(() => {
      if (!cancelled) setState("checking");
    }, 180);

    void runUploadChecks(file, { transparencyRecommended: requirement?.transparencyRecommended }).then(
      (result) => {
        if (cancelled) return;
        setChecks(result);
        setState(result.state);
      },
    );

    return () => {
      cancelled = true;
      window.clearTimeout(toChecking);
    };
  }, [file, requirement?.transparencyRecommended]);

  const guide = getUploadGuide(requirement?.assetType);
  const bestResults = requirement?.shortInstruction ?? guide.bestResults;
  const exampleSrc =
    requirement?.guidePreview ??
    requirement?.goodExamples?.[0] ??
    (requirement?.assetType ? ASSET_TYPE_PLACEHOLDERS[requirement.assetType] : undefined) ??
    fallbackPlaceholderSrc;

  const notes: string[] = [];
  if (requirement && requirement.maxFiles > 1) notes.push(`${requirement.minFiles}-${requirement.maxFiles} files`);
  if (requirement?.recommendedAspect) notes.push(requirement.recommendedAspect);
  if (requirement?.recommendedResolution) notes.push(requirement.recommendedResolution);
  if (requirement?.transparencyRecommended) notes.push("transparent PNG preferred");

  const showWarning = state === "warning" && !warningDismissed;

  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
      <div
        className={cn(
          "group/upload flex aspect-[9/16] flex-col overflow-hidden rounded-[1.25rem] border border-dashed bg-white/[0.03] transition",
          state === "error"
            ? "border-rose-300/45"
            : showWarning
              ? "border-amber-300/45"
              : "border-white/14 hover:border-cyan-200/45",
        )}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {previewUrl ? (
            <img src={previewUrl} alt={`${label} preview`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.1),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.6),rgba(2,6,23,0.92))]">
              <img
                src={exampleSrc}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-full w-full object-contain opacity-80 transition duration-300 group-hover/upload:scale-[1.02] group-hover/upload:opacity-95"
              />
            </div>
          )}
          {(state === "uploading" || state === "checking") && previewUrl ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/70 text-xs uppercase tracking-[0.2em] text-cyan-100">
              <Loader2 className="h-4 w-4 animate-spin" />
              {state === "uploading" ? "Uploading" : "Checking"}
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 bg-black/30 p-3">
          <div className="flex items-center gap-2">
            <span className="block min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
              {label}
            </span>
            {requirement?.assetType ? (
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-400">
                {formatAssetTypeLabel(requirement.assetType)}
              </span>
            ) : null}
          </div>

          {file ? (
            <p className="mt-2 flex min-w-0 items-center gap-2 text-sm font-medium text-white">
              {state === "ready" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              ) : state === "error" ? (
                <XCircle className="h-4 w-4 shrink-0 text-rose-300" />
              ) : showWarning ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
              ) : (
                <Upload className="h-4 w-4 shrink-0 text-cyan-100" />
              )}
              <span className="truncate">{file.name}</span>
            </p>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              <span className="text-slate-300">Best results:</span> {bestResults}
            </p>
          )}

          {notes.length ? (
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{notes.join(" · ")}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => inputRef.current?.click()}
              className="h-8 rounded-full bg-cyan-300 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              <Upload className="h-3.5 w-3.5" />
              {file ? "Replace" : "Upload New"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              title="Coming soon"
              className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"
            >
              <Images className="h-3.5 w-3.5" />
              Library · Soon
            </Button>
            <UploadGuide slotLabel={label} requirement={requirement} />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {state === "error" && checks?.error ? (
        <div className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-300/[0.07] p-3 text-xs text-rose-100">
          <p>{checks.error}</p>
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="mt-2 text-[11px] uppercase tracking-[0.16em] text-rose-200 hover:text-white"
          >
            Remove file
          </button>
        </div>
      ) : null}

      {showWarning && checks?.warnings.length ? (
        <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.07] p-3 text-xs text-amber-100">
          {checks.warnings.map((warning) => (
            <p key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[11px] uppercase tracking-[0.16em] text-amber-200 hover:text-white"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => setWarningDismissed(true)}
              className="text-[11px] uppercase tracking-[0.16em] text-slate-400 hover:text-white"
            >
              Use Anyway
            </button>
          </div>
        </div>
      ) : null}

      {file ? (
        <button
          type="button"
          onClick={() => onFileChange(null)}
          className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500 hover:text-white"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
