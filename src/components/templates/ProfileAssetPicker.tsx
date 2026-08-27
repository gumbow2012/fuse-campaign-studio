/**
 * FT5 — "Use assets from ▾": pull an image from a saved Brand or Product /
 * Garment profile straight into a template input. The runner only ever sees a
 * normal asset URL (same as an uploaded or library asset).
 */

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { brandProfileAssets, listBrandProfiles } from "@/services/brandProfiles";
import { listProductProfiles } from "@/services/productProfiles";
import type { TemplateAssetType } from "@/lib/templateAssetRequirements";
import { preferredRoles } from "@/lib/brandAutofill";
import { cn } from "@/lib/utils";


interface ProfileAssetPickerProps {
  assetType?: TemplateAssetType | null;
  onSelect: (asset: { url: string; name?: string | null }) => void;
  /** Pass `null` to render no trigger (controlled usage). */
  trigger?: ReactNode | null;
  /** Optional controlled open state — used by the compact "Add asset" dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
}

/** Roles that best match an FT2 assetType — shared with the brand autofill. */


interface ProfileGroup {
  id: string;
  label: string;
  sublabel: string;
  assets: { role: string; url: string }[];
}

export default function ProfileAssetPicker({
  assetType,
  onSelect,
  trigger,
  open: openProp,
  onOpenChange,
  title,
}: ProfileAssetPickerProps) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const brandsQuery = useQuery({
    queryKey: ["brand-profiles", user?.id ?? "anon"],
    queryFn: () => listBrandProfiles(user?.id ?? ""),
    enabled: !!user?.id && open,
    staleTime: 30_000,
  });
  const productsQuery = useQuery({
    queryKey: ["product-profiles", user?.id ?? "anon"],
    queryFn: () => listProductProfiles(user?.id ?? ""),
    enabled: !!user?.id && open,
    staleTime: 30_000,
  });

  const groups = useMemo<ProfileGroup[]>(() => {
    const roles = preferredRoles(assetType);
    const sortAssets = (assets: { role: string; url: string }[]) =>
      [...assets].sort((a, b) => {
        const rank = (role: string) => {
          const index = roles.findIndex((preferred) => role.toLowerCase().includes(preferred));
          return index === -1 ? roles.length : index;
        };
        return rank(a.role) - rank(b.role);
      });

    const brandGroups: ProfileGroup[] = (brandsQuery.data ?? [])
      .map((brand) => ({
        id: `brand-${brand.id}`,
        label: brand.name,
        sublabel: "Brand",
        assets: sortAssets(brandProfileAssets(brand)),
      }))
      .filter((group) => group.assets.length > 0);

    const productGroups: ProfileGroup[] = (productsQuery.data ?? [])
      .map((profile) => ({
        id: `product-${profile.id}`,
        label: profile.name,
        sublabel: profile.type === "garment" ? "Garment" : "Product",
        assets: sortAssets(profile.assets),
      }))
      .filter((group) => group.assets.length > 0);

    return [...productGroups, ...brandGroups];
  }, [assetType, brandsQuery.data, productsQuery.data]);

  const loading = brandsQuery.isLoading || productsQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200 hover:text-white"
            >
              <Boxes className="h-3.5 w-3.5" />
              Use assets from
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl border-white/10 bg-slate-950/95 text-white">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-0.02em]">{title ?? "Use assets from a profile"}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Pull a saved brand, product or garment image into this slot.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] space-y-6 overflow-y-auto pr-1">
          {!user ? (
            <p className="py-10 text-center text-sm text-slate-400">Sign in to save brand and product profiles.</p>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading profiles
            </div>
          ) : groups.length ? (
            groups.map((group) => (
              <div key={group.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{group.label}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-400">
                    {group.sublabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {group.assets.map((asset) => (
                    <button
                      key={`${group.id}-${asset.url}`}
                      type="button"
                      onClick={() => {
                        onSelect({ url: asset.url, name: `${group.label} · ${asset.role}` });
                        setOpen(false);
                      }}
                      className={cn(
                        "group overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition",
                        "hover:border-cyan-200/50",
                      )}
                    >
                      <div className="aspect-square overflow-hidden bg-slate-900">
                        <img
                          src={asset.url}
                          alt={asset.role}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                      <p className="truncate px-2.5 py-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        {asset.role}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-slate-400">
              No profile images yet — build a brand or product profile to reuse its assets everywhere.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
