/**
 * BRAND ACTIVATION — Phase 5: one-click "save this upload to my brand".
 *
 * Shown only after a MANUAL upload succeeds and only when a brand is active.
 * Reuses the existing library-asset save path (no onboarding wizard).
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/BrandContext";
import { saveLibraryAsset, libraryKindForAssetType } from "@/services/libraryAssets";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { track } from "@/lib/analytics/track";
import type { TemplateAssetType } from "@/lib/templateAssetRequirements";

export default function SaveAssetToBrandPrompt({
  file,
  assetType,
  role,
}: {
  file: File;
  assetType?: TemplateAssetType | null;
  role: string;
}) {
  const { activeBrand } = useBrand();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "hidden">("idle");
  const shownRef = useRef<string | null>(null);

  const brandId = activeBrand?.id ?? null;
  const brandName = activeBrand?.name ?? "";

  useEffect(() => {
    setState("idle");
  }, [file]);

  useEffect(() => {
    if (!brandId || state !== "idle") return;
    const key = `${brandId}:${file.name}:${file.size}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    try {
      track("campaign_asset_save_prompt_shown", { asset_role: role, brand_id: brandId });
    } catch {
      /* analytics must never break the flow */
    }
  }, [brandId, file, role, state]);

  if (!brandId || state === "hidden") return null;

  if (state === "saved") {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
        <Check className="h-3 w-3" aria-hidden />
        Saved to {brandName}
      </p>
    );
  }

  const handleSave = async () => {
    setState("saving");
    try {
      const url = await uploadRunInputFile(file);
      await saveLibraryAsset({
        kind: libraryKindForAssetType(assetType ?? null),
        url,
        name: file.name,
        metadata: { brand_id: brandId, asset_role: role, source: "campaign_upload" },
      });
      setState("saved");
      try {
        track("campaign_asset_saved_to_brand", { asset_role: role, brand_id: brandId });
      } catch {
        /* ignore */
      }
    } catch (error) {
      setState("idle");
      toast.error(error instanceof Error ? error.message : "Could not save to your brand.");
    }
  };

  return (
    <div className="mt-2 rounded-[0.9rem] border border-cyan-200/20 bg-cyan-300/[0.05] p-2.5">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
        <Bookmark className="mr-1 inline h-3 w-3" aria-hidden />
        Save this to {brandName}?
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
        Reuse this in future campaigns without uploading again.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={state === "saving"}
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/25 disabled:opacity-60"
        >
          {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          Save to brand
        </button>
        <button
          type="button"
          onClick={() => setState("hidden")}
          className="text-[10px] uppercase tracking-[0.16em] text-slate-500 transition hover:text-white"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
