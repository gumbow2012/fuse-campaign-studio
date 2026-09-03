/**
 * Brand Workspace — BRAND ASSETS (Phase 3).
 *
 * Every tile is derived from buildBrandAssetLibrary(): brand identity,
 * product/garment profiles, cast, and campaign uploads. Nothing is duplicated
 * into library_assets — this view only aggregates authoritative sources.
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Images, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CARD, LABEL } from "@/components/brand/BrandEditors";
import { deleteLibraryAsset, type LibraryAsset } from "@/services/libraryAssets";
import {
  updateProductProfile,
  type ProductProfile,
} from "@/services/productProfiles";
import type { BrandProfile } from "@/services/brandProfiles";
import type { AvatarProfile } from "@/services/avatarProfiles";
import {
import AssetThumbnail from "@/components/studio/AssetThumbnail";
  buildBrandAssetLibrary,
  type BrandAssetCategory,
  type BrandAssetGroup,
  type BrandAssetItem,
  type BrandAssetProductDetail,
} from "@/services/brandAssetLibrary";

const FILTERS: { id: BrandAssetCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "identity", label: "Identity" },
  { id: "products", label: "Products" },
  { id: "garments", label: "Garments" },
  { id: "cast", label: "Cast" },
  { id: "campaign_uploads", label: "Campaign uploads" },
  { id: "references", label: "References" },
];

function AssetTile({
  item,
  onOpen,
  onRemove,
  removing,
}: {
  item: BrandAssetItem;
  onOpen?: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const isSwatch = item.subtype === "color";
  const isVideo = item.subtype === "video";
  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="block w-full cursor-default disabled:cursor-default"
        style={onOpen ? { cursor: "pointer" } : undefined}
        aria-label={onOpen ? `Open ${item.title}` : item.title}
      >
        <div className="aspect-square bg-black/40">
          {isSwatch ? (
            <div className="h-full w-full" style={{ background: item.url }} />
          ) : (
            <AssetThumbnail url={item.url} type={isVideo ? "video" : "image"} />
          )}
        </div>
      </button>
      <div className="space-y-2 p-3">
        <p className="truncate text-xs text-slate-200">{item.title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-400">
            {String(item.meta.kindLabel ?? item.subtype).replace(/_/g, " ")}
          </span>
          {onRemove ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={removing}
              aria-label={`Remove ${item.title}`}
              onClick={onRemove}
              className="h-7 rounded-full px-2 text-slate-400 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className={LABEL}>{title}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

export default function BrandLibraryPanel({
  assets,
  loading,
  activeBrand,
  products,
  avatars,
  onEditProduct,
}: {
  assets: LibraryAsset[];
  loading: boolean;
  activeBrand?: BrandProfile | null;
  products?: ProductProfile[];
  avatars?: AvatarProfile[];
  onEditProduct?: (productId: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<BrandAssetCategory | "all">("all");
  const [openProductId, setOpenProductId] = useState<string | null>(null);

  const library = useMemo(
    () =>
      buildBrandAssetLibrary({
        brand: activeBrand ?? null,
        products: products ?? [],
        avatars: avatars ?? [],
        libraryAssets: assets,
      }),
    [activeBrand, products, avatars, assets],
  );

  const removeLibraryAsset = useMutation({
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

  const assignToBrand = useMutation({
    mutationFn: async (assetId: string) => {
      if (!activeBrand) throw new Error("No active brand");
      const asset = assets.find((entry) => entry.id === assetId);
      if (!asset) throw new Error("Asset missing");
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await (supabase as unknown as {
        from: (name: string) => {
          update: (values: Record<string, unknown>) => { eq: (c: string, v: unknown) => Promise<{ error: unknown }> };
        };
      })
        .from("library_assets")
        .update({ metadata: { ...(asset.metadata ?? {}), brand_id: activeBrand.id } })
        .eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to brand");
      queryClient.invalidateQueries({ queryKey: ["library-assets"] });
    },
    onError: () => toast.error("Could not add that asset to your brand"),
  });

  const removeProductFromBrand = useMutation({
    mutationFn: async (product: ProductProfile) => {
      await updateProductProfile(product.id, {
        name: product.name,
        type: product.type,
        brand_id: null,
        description: product.description,
        attributes: product.attributes,
        assets: product.assets,
      });
    },
    onSuccess: () => {
      toast.success("Removed from this brand");
      setOpenProductId(null);
      queryClient.invalidateQueries({ queryKey: ["my-product-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["product-profiles"] });
    },
    onError: () => toast.error("Could not remove that product"),
  });

  const chip = (value: BrandAssetCategory | "all", label: string, count: number) => (
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
      {label} {count}
    </button>
  );

  const show = (category: BrandAssetCategory) => filter === "all" || filter === category;

  const openProduct = library.products.find((entry) => entry.id === openProductId) ?? null;

  const productGroupBlock = (groups: BrandAssetGroup[]) =>
    groups.map((group) => (
      <div key={group.key} className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{group.label}</p>
        <Grid>
          {group.items.map((item) => (
            <AssetTile key={item.id} item={item} onOpen={() => setOpenProductId(item.sourceId)} />
          ))}
        </Grid>
      </div>
    ));

  const isEmpty =
    !library.counts.all && !library.counts.unassigned && !loading;

  return (
    <div className="space-y-7">
      <div>
        <p className={LABEL}>Brand assets</p>
        <p className="mt-1 text-sm text-slate-400">
          {library.counts.all} asset{library.counts.all === 1 ? "" : "s"} across identity, products, cast and campaign
          uploads — everything your campaigns can use.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((entry) =>
          chip(
            entry.id,
            entry.label,
            entry.id === "all" ? library.counts.all : library.counts[entry.id],
          ),
        )}
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading brand assets…</p> : null}

      {show("identity") && library.identity.length ? (
        <Section title="Identity" hint="Pulled straight from your brand profile — no re-upload needed.">
          <Grid>
            {library.identity.map((item) => (
              <AssetTile key={item.id} item={item} />
            ))}
          </Grid>
        </Section>
      ) : null}

      {show("products") && library.productGroups.length ? (
        <Section title="Products" hint="Grouped by category.">
          <div className="space-y-5">{productGroupBlock(library.productGroups)}</div>
        </Section>
      ) : null}

      {show("garments") && library.garmentGroups.length ? (
        <Section title="Garments" hint="Grouped by category.">
          <div className="space-y-5">{productGroupBlock(library.garmentGroups)}</div>
        </Section>
      ) : null}

      {show("cast") && library.cast.length ? (
        <Section title="Cast">
          <Grid>
            {library.cast.map((item) => (
              <AssetTile key={item.id} item={item} />
            ))}
          </Grid>
        </Section>
      ) : null}

      {show("campaign_uploads") && library.campaignGroups.length ? (
        <Section title="Campaign uploads" hint="Saved automatically from your campaign runs.">
          <div className="space-y-5">
            {library.campaignGroups.map((group) => (
              <div key={group.key} className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{group.label}</p>
                <Grid>
                  {group.items.map((item) => (
                    <AssetTile
                      key={item.id}
                      item={item}
                      removing={removeLibraryAsset.isPending}
                      onRemove={() => removeLibraryAsset.mutate(item.sourceId)}
                    />
                  ))}
                </Grid>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {show("references") && library.references.length ? (
        <Section title="References">
          <Grid>
            {library.references.map((item) => (
              <AssetTile
                key={item.id}
                item={item}
                removing={removeLibraryAsset.isPending}
                onRemove={() => removeLibraryAsset.mutate(item.sourceId)}
              />
            ))}
          </Grid>
        </Section>
      ) : null}

      {library.unassigned.length ? (
        <Section
          title="Unassigned"
          hint="These uploads aren't linked to a brand yet — add them to keep this workspace clean."
        >
          <Grid>
            {library.unassigned.map((item) => (
              <div key={item.id} className="space-y-2">
                <AssetTile item={item} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!activeBrand || assignToBrand.isPending}
                  onClick={() => assignToBrand.mutate(item.sourceId)}
                  className="w-full rounded-full text-[10px] uppercase tracking-[0.16em]"
                >
                  Add to brand
                </Button>
              </div>
            ))}
          </Grid>
        </Section>
      ) : null}

      {isEmpty ? (
        <div className={`${CARD} flex flex-col items-start gap-3`}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-cyan-200">
            <Images className="h-5 w-5" />
          </span>
          <p className="text-sm text-slate-400">
            Nothing here yet. Your logo, colors, products and campaign uploads all show up automatically.
          </p>
        </div>
      ) : null}

      <ProductDetailDialog
        detail={openProduct}
        onClose={() => setOpenProductId(null)}
        onUseInCampaign={() => navigate("/app/templates")}
        onEdit={onEditProduct ? () => onEditProduct(openProduct!.id) : undefined}
        onRemove={() => {
          const product = (products ?? []).find((entry) => entry.id === openProduct?.id);
          if (product) removeProductFromBrand.mutate(product);
        }}
        removing={removeProductFromBrand.isPending}
      />
    </div>
  );
}

function ProductDetailDialog({
  detail,
  onClose,
  onUseInCampaign,
  onEdit,
  onRemove,
  removing,
}: {
  detail: BrandAssetProductDetail | null;
  onClose: () => void;
  onUseInCampaign: () => void;
  onEdit?: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <Dialog open={!!detail} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#0a0c10]">
        {detail ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">{detail.name}</DialogTitle>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {detail.category} · {detail.type}
              </p>
            </DialogHeader>

            {detail.importedFromStore ? (
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-xs text-cyan-100">
                <p className="uppercase tracking-[0.16em]">Imported from store</p>
                <p className="mt-1 text-slate-300">
                  {detail.sourceDomain ?? "store"}
                  {detail.importedAt ? ` · ${new Date(detail.importedAt).toLocaleDateString()}` : ""}
                </p>
                {detail.originalUrl ? (
                  <a
                    href={detail.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-cyan-200 underline"
                  >
                    View original <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}

            {detail.images.length ? (
              <div className="grid grid-cols-3 gap-3">
                {detail.images.map((image) => (
                  <div key={image.url} className="space-y-1">
                    <div className="aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      <img src={image.url} alt={`${detail.name} ${image.role}`} className="h-full w-full object-cover" />
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{image.role}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No images on this product yet.</p>
            )}

            {detail.description ? <p className="text-sm text-slate-400">{detail.description}</p> : null}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="button" onClick={onUseInCampaign} className="rounded-full">
                Use in campaign
              </Button>
              <Button type="button" variant="outline" onClick={onEdit} disabled={!onEdit} className="rounded-full">
                Edit product
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onRemove}
                disabled={removing}
                className="rounded-full text-slate-400 hover:text-rose-300"
              >
                Remove from brand
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
