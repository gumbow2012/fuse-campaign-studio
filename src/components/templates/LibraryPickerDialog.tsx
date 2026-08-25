/**
 * FT4 — "Choose From Library" picker. Reads the user's saved brand assets and
 * fills a template input with a normal asset URL (same shape the runner already
 * receives for uploaded assets).
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Images, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  LIBRARY_CATEGORIES,
  listLibraryAssets,
  type LibraryAsset,
  type LibraryAssetKind,
} from "@/services/libraryAssets";
import { cn } from "@/lib/utils";

interface LibraryPickerDialogProps {
  /** Compatible kinds for this input; empty means show everything. */
  kinds?: LibraryAssetKind[];
  onSelect: (asset: LibraryAsset) => void;
  trigger?: ReactNode;
}

export default function LibraryPickerDialog({ kinds = [], onSelect, trigger }: LibraryPickerDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<LibraryAssetKind | "all">(kinds[0] ?? "all");

  const assetsQuery = useQuery({
    queryKey: ["library-assets", user?.id ?? "anon"],
    queryFn: () => listLibraryAssets(user?.id ?? ""),
    enabled: !!user?.id && open,
    staleTime: 30_000,
  });

  const assets = assetsQuery.data ?? [];
  const compatible = useMemo(
    () => (kinds.length ? assets.filter((asset) => kinds.includes(asset.kind)) : assets),
    [assets, kinds],
  );
  const visible = useMemo(
    () => (activeKind === "all" ? compatible : compatible.filter((asset) => asset.kind === activeKind)),
    [compatible, activeKind],
  );

  const categories = LIBRARY_CATEGORIES.filter(
    (category) => !kinds.length || kinds.includes(category.kind),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button type="button" className="text-[11px] uppercase tracking-[0.16em] text-cyan-200">
            Choose From Library
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl border-white/10 bg-slate-950/95 text-white">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-0.02em]">Your asset library</DialogTitle>
          <DialogDescription className="text-slate-400">
            Reuse assets you've already uploaded across any compatible template.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveKind("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition",
              activeKind === "all"
                ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.kind}
              type="button"
              onClick={() => setActiveKind(category.kind)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition",
                activeKind === category.kind
                  ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
              )}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="min-h-[220px]">
          {!user ? (
            <p className="py-10 text-center text-sm text-slate-400">Sign in to build your asset library.</p>
          ) : assetsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading library
            </div>
          ) : visible.length ? (
            <div className="grid max-h-[46vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
              {visible.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    onSelect(asset);
                    setOpen(false);
                  }}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition hover:border-cyan-200/50"
                >
                  <div className="aspect-square overflow-hidden bg-slate-900">
                    <img
                      src={asset.url}
                      alt={asset.name ?? "Library asset"}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[11px] text-slate-200">{asset.name ?? "Untitled asset"}</p>
                    <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{asset.kind}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Images className="h-6 w-6 text-slate-600" />
              <p className="text-sm text-slate-400">Nothing here yet — upload to reuse it later.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
