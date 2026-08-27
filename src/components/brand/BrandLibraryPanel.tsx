/**
 * Brand Workspace — saved assets library (Phase 7).
 * Read + remove only; assets are saved from the campaign flows as before.
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Images, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CARD, LABEL } from "@/components/brand/BrandEditors";
import {
  deleteLibraryAsset,
  LIBRARY_CATEGORIES,
  type LibraryAsset,
  type LibraryAssetKind,
} from "@/services/libraryAssets";

const KIND_LABELS: Record<string, string> = {
  ...Object.fromEntries(LIBRARY_CATEGORIES.map((entry) => [entry.kind, entry.label])),
  image: "Images",
  video: "Videos",
};

export default function BrandLibraryPanel({
  assets,
  loading,
}: {
  assets: LibraryAsset[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<LibraryAssetKind | "all">("all");

  const kinds = useMemo(() => {
    const present = new Set(assets.map((asset) => asset.kind));
    return Array.from(present);
  }, [assets]);

  const visible = useMemo(
    () => (filter === "all" ? assets : assets.filter((asset) => asset.kind === filter)),
    [assets, filter],
  );

  const remove = useMutation({
    mutationFn: (id: string) => deleteLibraryAsset(id),
    onSuccess: (ok) => {
      if (!ok) {
        toast.error("Could not remove that asset");
        return;
      }
      toast.success("Asset removed");
      queryClient.invalidateQueries({ queryKey: ["library-assets"] });
    },
    onError: () => toast.error("Could not remove that asset"),
  });

  const chip = (value: LibraryAssetKind | "all", label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`h-8 rounded-full border px-3 text-[11px] uppercase tracking-[0.16em] transition ${
        filter === value
          ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL}>Saved assets</p>
        <p className="mt-1 text-sm text-slate-400">
          {assets.length} asset{assets.length === 1 ? "" : "s"} saved from your campaigns — reuse them anywhere.
        </p>
      </div>

      {assets.length ? (
        <div className="flex flex-wrap gap-2">
          {chip("all", `All ${assets.length}`)}
          {kinds.map((kind) => chip(kind, KIND_LABELS[kind] ?? kind))}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">Loading library…</p>
      ) : visible.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03]">
              <div className="aspect-square bg-black/40">
                {asset.kind === "video" ? (
                  <video src={asset.url} muted playsInline className="h-full w-full object-cover" />
                ) : (
                  <img
                    src={asset.url}
                    alt={asset.name ?? asset.kind}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-xs text-slate-200">{asset.name ?? "Untitled"}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-400">
                    {asset.kind}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    aria-label={`Remove ${asset.name ?? "asset"}`}
                    onClick={() => remove.mutate(asset.id)}
                    className="h-7 rounded-full px-2 text-slate-400 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${CARD} flex flex-col items-start gap-3`}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-cyan-200">
            <Images className="h-5 w-5" />
          </span>
          <p className="text-sm text-slate-400">
            Nothing saved yet. Assets you upload in a campaign are kept here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
