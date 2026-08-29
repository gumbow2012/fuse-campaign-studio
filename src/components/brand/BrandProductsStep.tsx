/**
 * FUSE Brand Workspace — Phase 4 PRODUCTS step (visual Product Library).
 *
 * - Imported catalog (Phase 2 candidates, client state only) → searchable /
 *   filterable / selectable / reorderable grid, saved as real product_profiles
 *   rows on confirm.
 * - Saved product cards with Front/Back status badges + [ EDIT ] (ProductEditor).
 * - Manual add via visual product-type tiles → expected asset slots
 *   (Front required, "Includes back design" reveals Back, optional
 *   Side / Detail / Logo / Packaging with progressive disclosure).
 *
 * Persistence uses existing columns only (no migration):
 *   product_profiles.type ('garment' | 'product'),
 *   attributes.productType (specific tile), attributes.sourceUrl,
 *   attributes.includesBackDesign, assets:[{ role, url }].
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Backpack,
  Check,
  Footprints,
  Gem,
  Loader2,
  Package,
  Plus,
  Shirt,
  ShoppingBag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploader } from "@/components/brand/BrandEditors";
import { ProductEditor } from "@/components/brand/BrandEditors";
import type { BrandProfile } from "@/services/brandProfiles";
import {
  createProductProfile,
  type ProductProfile,
  type ProductProfileAsset,
  type ProductProfileType,
} from "@/services/productProfiles";
import type { BrandImportConfirmation } from "@/components/brand/BrandImportPanel";
import {
  classifyProduct,
  PRODUCT_FILTERS,
  type ProductFilterId,
} from "@/lib/productCategories";


const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";
const TINY = "font-display text-[10px] uppercase tracking-[0.22em]";
const CARD = "rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6";

/** Product-type tiles → base profile type + expected asset slots. */
type TileId =
  | "tee"
  | "hoodie"
  | "jacket"
  | "pants"
  | "shorts"
  | "hat"
  | "shoes"
  | "jewelry"
  | "bag"
  | "other";

const TILES: {
  id: TileId;
  label: string;
  base: ProductProfileType;
  icon: typeof Shirt;
  optional: string[];
}[] = [
  { id: "tee", label: "Tee", base: "garment", icon: Shirt, optional: ["Detail", "Logo"] },
  { id: "hoodie", label: "Hoodie", base: "garment", icon: Shirt, optional: ["Detail", "Logo"] },
  { id: "jacket", label: "Jacket", base: "garment", icon: Shirt, optional: ["Side", "Detail", "Logo"] },
  { id: "pants", label: "Pants", base: "garment", icon: Shirt, optional: ["Side", "Detail"] },
  { id: "shorts", label: "Shorts", base: "garment", icon: Shirt, optional: ["Side", "Detail"] },
  { id: "hat", label: "Hat", base: "product", icon: Package, optional: ["Side", "Detail", "Logo"] },
  { id: "shoes", label: "Shoes", base: "product", icon: Footprints, optional: ["Side", "Detail", "Packaging"] },
  { id: "jewelry", label: "Jewelry", base: "product", icon: Gem, optional: ["Detail", "Packaging"] },
  { id: "bag", label: "Bag", base: "product", icon: Backpack, optional: ["Side", "Detail", "Packaging"] },
  { id: "other", label: "Other", base: "product", icon: ShoppingBag, optional: ["Side", "Detail", "Logo", "Packaging"] },
];

/** Category filter for the imported catalog (shared classifier). */
const FILTERS = PRODUCT_FILTERS;
type FilterId = ProductFilterId;

const classifyImported = classifyProduct;


type ImportedItem = {
  key: string;
  title: string;
  imageUrl: string | null;
  url: string | null;
  filter: FilterId;
  base: ProductProfileType;
  productType: string;
};

/** Soft image quality inspection — never blocks a save. */
async function inspectImage(file: File): Promise<{ warning: string | null }> {
  if (!file.type.startsWith("image/")) {
    return { warning: `Unsupported file type (${file.type || "unknown"}). Use PNG, JPG or WebP.` };
  }
  const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
  if (dims && Math.min(dims.w, dims.h) < 512) {
    return { warning: `Low resolution (${dims.w}×${dims.h}). 1024px or larger looks best in campaigns.` };
  }
  return { warning: null };
}

function AssetSlot({
  role,
  required,
  url,
  warning,
  onPick,
  onClear,
}: {
  role: string;
  required?: boolean;
  url: string | null;
  warning: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <p className={LABEL}>
        {role}
        {required ? <span className="ml-1 text-rose-300">*</span> : null}
      </p>
      <div className="mt-2 aspect-square overflow-hidden rounded-xl border border-white/10 bg-slate-900">
        {url ? <img src={url} alt={role} className="h-full w-full object-cover" /> : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onPick(file);
            }}
          />
          <span className={`inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 ${TINY} text-slate-200`}>
            <Upload className="h-3 w-3" /> {url ? "Replace" : "Upload"}
          </span>
        </label>
        {url ? (
          <button
            type="button"
            onClick={onClear}
            className={`inline-flex items-center gap-1 rounded-full border border-white/12 px-2.5 py-1 ${TINY} text-slate-400 hover:text-white`}
          >
            <X className="h-3 w-3" /> Remove
          </button>
        ) : null}
      </div>
      {warning ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {warning}
        </p>
      ) : null}
    </div>
  );
}

export default function BrandProductsStep({
  brand,
  imported,
  products,
  onImportedConsumed,
}: {
  brand: BrandProfile | null;
  imported: BrandImportConfirmation | null;
  products: ProductProfile[];
  onImportedConsumed: () => void;
}) {
  const queryClient = useQueryClient();
  const { busy: uploadBusy, upload } = useUploader();

  const importedItems = useMemo<ImportedItem[]>(() => {
    const list = imported?.products ?? [];
    return list.map((entry, index) => {
      const cls = classifyImported(entry.title, entry.type ?? "");
      return {
        key: `${index}-${entry.title}`,
        title: entry.title,
        imageUrl: entry.imageUrl ?? null,
        url: entry.url ?? null,
        ...cls,
      };
    });
  }, [imported]);

  const [order, setOrder] = useState<string[]>(() => importedItems.map((item) => item.key));
  const [removed, setRemoved] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(() => importedItems.map((item) => item.key));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("All");

  const orderedImported = useMemo(() => {
    const byKey = new Map(importedItems.map((item) => [item.key, item]));
    const seq = order.length ? order : importedItems.map((item) => item.key);
    return seq
      .map((key) => byKey.get(key))
      .filter((item): item is ImportedItem => !!item && !removed.includes(item.key));
  }, [importedItems, order, removed]);

  const visibleImported = orderedImported.filter((item) => {
    const matchesFilter = filter === "All" || item.filter === filter;
    const matchesSearch = !search.trim() || item.title.toLowerCase().includes(search.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });

  function moveImported(key: string, direction: -1 | 1) {
    setOrder((current) => {
      const seq = current.length ? [...current] : importedItems.map((item) => item.key);
      const index = seq.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= seq.length) return seq;
      [seq[index], seq[target]] = [seq[target], seq[index]];
      return seq;
    });
  }

  const saveImported = useMutation({
    mutationFn: async () => {
      const chosen = orderedImported.filter((item) => selected.includes(item.key));
      if (!chosen.length) throw new Error("Select at least one product to keep.");
      let created = 0;
      for (const [index, item] of chosen.entries()) {
        const assets: ProductProfileAsset[] = item.imageUrl ? [{ role: "Front", url: item.imageUrl }] : [];
        await createProductProfile({
          name: item.title,
          type: item.base,
          brand_id: brand?.id ?? null,
          description: null,
          attributes: {
            productType: item.productType,
            sourceUrl: item.url,
            importOrder: index,
            source: "brand-import",
          },
          assets,
        });
        created += 1;
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(`${created} product${created === 1 ? "" : "s"} added to your library`);
      queryClient.invalidateQueries({ queryKey: ["product-profiles"] });
      onImportedConsumed();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save products"),
  });

  // ---- Manual add -----------------------------------------------------------
  const [adding, setAdding] = useState(false);
  const [tile, setTile] = useState<TileId | null>(null);
  const [manualName, setManualName] = useState("");
  const [includesBack, setIncludesBack] = useState(false);
  const [openOptional, setOpenOptional] = useState<string[]>([]);
  const [slotUrls, setSlotUrls] = useState<Record<string, string>>({});
  const [slotWarnings, setSlotWarnings] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<ProductProfile | null>(null);

  const activeTile = TILES.find((entry) => entry.id === tile) ?? null;

  function resetManual() {
    setAdding(false);
    setTile(null);
    setManualName("");
    setIncludesBack(false);
    setOpenOptional([]);
    setSlotUrls({});
    setSlotWarnings({});
  }

  async function pickSlot(role: string, file: File) {
    const { warning } = await inspectImage(file);
    const uploaded = await upload(file);
    if (!uploaded) return;
    const duplicate = Object.entries(slotUrls).some(([key, value]) => key !== role && value === uploaded);
    setSlotUrls((current) => ({ ...current, [role]: uploaded }));
    setSlotWarnings((current) => ({
      ...current,
      [role]: duplicate ? "Same image as another slot — campaigns look better with distinct angles." : warning,
    }));
  }

  const manualWarnings = useMemo(() => {
    const list: string[] = [];
    if (!slotUrls.Front) list.push("Front image is missing — FUSE needs it for every campaign.");
    if (includesBack && !slotUrls.Back) list.push("“Includes back design” is on but no Back image is uploaded.");
    return list;
  }, [slotUrls, includesBack]);

  const saveManual = useMutation({
    mutationFn: async () => {
      if (!activeTile) throw new Error("Pick a product type.");
      const name = manualName.trim();
      if (!name) throw new Error("Give the product a name.");
      if (!slotUrls.Front) throw new Error("Upload the Front image.");
      const assets: ProductProfileAsset[] = Object.entries(slotUrls)
        .filter(([, url]) => !!url)
        .map(([role, url]) => ({ role, url }));
      await createProductProfile({
        name,
        type: activeTile.base,
        brand_id: brand?.id ?? null,
        description: null,
        attributes: {
          productType: activeTile.id,
          includesBackDesign: includesBack,
          source: "manual",
        },
        assets,
      });
    },
    onSuccess: () => {
      toast.success("Product added");
      queryClient.invalidateQueries({ queryKey: ["product-profiles"] });
      resetManual();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save product"),
  });

  const showImportedBlock = !!orderedImported.length;

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className={LABEL}>Step 3 — Products</p>
        <h2 className="mt-2 text-2xl">YOUR PRODUCTS</h2>
        <p className="mt-2 text-sm text-slate-400">Choose what FUSE can use across campaigns.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${TINY} ${
              products.length
                ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                : "border-rose-400/40 bg-rose-400/10 text-rose-100"
            }`}
          >
            {products.length ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {products.length} in library
          </span>
          {!products.length ? (
            <span className="text-xs text-slate-500">At least one product is required for campaign-ready.</span>
          ) : null}
        </div>
      </div>

      {showImportedBlock ? (
        <div className="rounded-3xl border border-cyan-300/25 bg-cyan-300/[0.04] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`${TINY} text-cyan-200/90`}>
              {orderedImported.length} product{orderedImported.length === 1 ? "" : "s"} found
              {imported?.domain ? ` · ${imported.domain}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(orderedImported.map((item) => item.key))}
                className={`rounded-full border border-white/12 px-3 py-1 ${TINY} text-slate-200 hover:text-white`}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className={`rounded-full border border-white/12 px-3 py-1 ${TINY} text-slate-400 hover:text-white`}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="border-white/10 bg-black/30 text-white sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setFilter(entry)}
                  className={`rounded-full border px-3 py-1 ${TINY} transition ${
                    filter === entry
                      ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleImported.map((item) => {
              const isSelected = selected.includes(item.key);
              return (
                <div
                  key={item.key}
                  className={`overflow-hidden rounded-2xl border bg-black/30 transition ${
                    isSelected ? "border-cyan-300/50" : "border-white/10"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelected((current) =>
                        current.includes(item.key)
                          ? current.filter((key) => key !== item.key)
                          : [...current, item.key],
                      )
                    }
                    className="block w-full text-left"
                  >
                    <div className="relative aspect-square overflow-hidden bg-slate-900">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-600">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                      {isSelected ? (
                        <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-300 text-slate-950">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="truncate text-[12px] text-slate-200">{item.title}</p>
                      <p className={`${TINY} mt-0.5 text-slate-500`}>{item.filter}</p>
                    </div>
                  </button>
                  <div className="flex items-center justify-between border-t border-white/5 px-2 py-1.5">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label="Move earlier"
                        onClick={() => moveImported(item.key, -1)}
                        className="rounded-full border border-white/10 p-1 text-slate-400 hover:text-white"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move later"
                        onClick={() => moveImported(item.key, 1)}
                        className="rounded-full border border-white/10 p-1 text-slate-400 hover:text-white"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label="Remove candidate"
                      onClick={() => {
                        setRemoved((current) => [...current, item.key]);
                        setSelected((current) => current.filter((key) => key !== item.key));
                      }}
                      className="rounded-full border border-white/10 p-1 text-slate-400 hover:text-rose-200"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            {!visibleImported.length ? (
              <p className="col-span-full text-sm text-slate-500">No imported products match that search.</p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={saveImported.isPending || !selected.length}
              onClick={() => saveImported.mutate()}
              className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              {saveImported.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Keep {selected.length} product{selected.length === 1 ? "" : "s"}
            </Button>
            <button
              type="button"
              onClick={onImportedConsumed}
              className="text-[11px] uppercase tracking-[0.16em] text-slate-400 hover:text-white"
            >
              Skip import
            </button>
          </div>
        </div>
      ) : null}

      {products.length ? (
        <div className={CARD}>
          <p className={LABEL}>Product library</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((entry) => {
              const front = entry.assets.find((asset) => asset.role === "Front") ?? entry.assets[0] ?? null;
              const hasBack = entry.assets.some((asset) => asset.role === "Back");
              const productType = String((entry.attributes ?? {}).productType ?? entry.type);
              return (
                <div key={entry.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <div className="aspect-square overflow-hidden bg-slate-900">
                    {front ? (
                      <img src={front.url} alt={entry.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-600">
                        <Package className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 px-2.5 py-2.5">
                    <p className="truncate text-[12px] text-slate-200">{entry.name}</p>
                    <p className={`${TINY} text-slate-500`}>{productType}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 ${TINY} ${
                          front
                            ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                            : "border-amber-300/40 bg-amber-300/10 text-amber-100"
                        }`}
                      >
                        Front {front ? "✓" : "—"}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 ${TINY} ${
                          hasBack
                            ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                            : "border-white/10 text-slate-500"
                        }`}
                      >
                        Back {hasBack ? "✓" : "—"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(entry)}
                      className={`w-full rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 ${TINY} text-slate-200 hover:text-white`}
                    >
                      [ Edit ]
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {editing ? (
        <ProductEditor
          profile={editing}
          brands={brand ? [brand] : []}
          defaultBrandId={brand?.id ?? null}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {!adding ? (
        <Button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          <Plus className="h-3.5 w-3.5" /> Add a product
        </Button>
      ) : (
        <div className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={LABEL}>Add a product</p>
              <h3 className="mt-1 text-lg text-white">What are we shooting?</h3>
            </div>
            <button
              type="button"
              onClick={resetManual}
              className="rounded-full border border-white/12 p-1.5 text-slate-400 hover:text-white"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TILES.map((entry) => {
              const Icon = entry.icon;
              const active = tile === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTile(entry.id);
                    setOpenOptional([]);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition ${
                    active
                      ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className={TINY}>{entry.label}</span>
                </button>
              );
            })}
          </div>

          {activeTile ? (
            <div className="mt-5 space-y-4">
              <div>
                <p className={LABEL}>Name</p>
                <Input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder={`${activeTile.label} — name it`}
                  className="mt-2 border-white/10 bg-black/30 text-white sm:max-w-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <AssetSlot
                  role="Front"
                  required
                  url={slotUrls.Front ?? null}
                  warning={slotWarnings.Front ?? null}
                  onPick={(file) => pickSlot("Front", file)}
                  onClear={() => {
                    setSlotUrls(({ Front, ...rest }) => rest);
                    setSlotWarnings(({ Front, ...rest }) => rest);
                  }}
                />
                {includesBack ? (
                  <AssetSlot
                    role="Back"
                    required
                    url={slotUrls.Back ?? null}
                    warning={slotWarnings.Back ?? null}
                    onPick={(file) => pickSlot("Back", file)}
                    onClear={() => {
                      setSlotUrls(({ Back, ...rest }) => rest);
                      setSlotWarnings(({ Back, ...rest }) => rest);
                    }}
                  />
                ) : null}
                {openOptional.map((role) => (
                  <AssetSlot
                    key={role}
                    role={role}
                    url={slotUrls[role] ?? null}
                    warning={slotWarnings[role] ?? null}
                    onPick={(file) => pickSlot(role, file)}
                    onClear={() => {
                      setSlotUrls((current) => {
                        const next = { ...current };
                        delete next[role];
                        return next;
                      });
                      setSlotWarnings((current) => {
                        const next = { ...current };
                        delete next[role];
                        return next;
                      });
                    }}
                  />
                ))}
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={includesBack}
                  onChange={(event) => setIncludesBack(event.target.checked)}
                  className="h-3.5 w-3.5 accent-cyan-300"
                />
                Includes back design
              </label>

              <div className="flex flex-wrap gap-2">
                {activeTile.optional
                  .filter((role) => !openOptional.includes(role))
                  .map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setOpenOptional((current) => [...current, role])}
                      className={`inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 ${TINY} text-slate-300 hover:text-white`}
                    >
                      <Plus className="h-3 w-3" /> {role === "Logo" ? "Logo / graphic" : role}
                    </button>
                  ))}
              </div>

              {manualWarnings.length ? (
                <ul className="space-y-1.5 rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-3">
                  {manualWarnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-1.5 text-[11px] text-amber-100/90">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={saveManual.isPending || uploadBusy}
                  onClick={() => saveManual.mutate()}
                  className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
                >
                  {saveManual.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save product
                </Button>
                {uploadBusy ? <span className="text-[11px] text-slate-400">Uploading…</span> : null}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Pick a product type to see the images FUSE needs.</p>
          )}
        </div>
      )}
    </div>
  );
}
