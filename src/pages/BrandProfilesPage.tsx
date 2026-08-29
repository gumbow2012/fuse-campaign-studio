/**
 * FT5 — Brand + Product/Garment profile manager. Lightweight CRUD over the
 * existing brand_profiles / product_profiles tables, reusing the existing
 * upload flow for images.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { uploadRunInputFile } from "@/services/runInputUpload";
import {
  createBrandProfile,
  deleteBrandProfile,
  listBrandProfiles,
  updateBrandProfile,
  type BrandProfile,
} from "@/services/brandProfiles";
import {
  PROFILE_ASSET_ROLES,
  createProductProfile,
  deleteProductProfile,
  listProductProfiles,
  updateProductProfile,
  type ProductProfile,
  type ProductProfileAsset,
  type ProductProfileType,
} from "@/services/productProfiles";

const CARD = "rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";

function useUploader() {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      return await uploadRunInputFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, upload };
}

function ImageSlot({
  label,
  url,
  onChange,
}: {
  label: string;
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const { busy, upload } = useUploader();
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/40">
          {url ? <img src={url} alt={label} className="h-full w-full object-contain" /> : null}
        </div>
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const uploaded = await upload(file);
                if (uploaded) onChange(uploaded);
              }}
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-200">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {url ? "Replace" : "Upload"}
            </span>
          </label>
          {url ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-rose-300"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BrandEditor({
  brand,
  onDone,
}: {
  brand: BrandProfile | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(brand?.name ?? "");
  const [website, setWebsite] = useState(brand?.website ?? "");
  const [description, setDescription] = useState(brand?.description ?? "");
  const [primaryLogo, setPrimaryLogo] = useState<string | null>(brand?.primary_logo_url ?? null);
  const [secondaryLogo, setSecondaryLogo] = useState<string | null>(brand?.secondary_logo_url ?? null);
  const [colors, setColors] = useState<string[]>(brand?.colors ?? []);
  const [colorDraft, setColorDraft] = useState("#22d3ee");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        website: website.trim() || null,
        description: description.trim() || null,
        primary_logo_url: primaryLogo,
        secondary_logo_url: secondaryLogo,
        colors,
      };
      if (!payload.name) throw new Error("Brand name is required.");
      if (brand) await updateBrandProfile(brand.id, payload);
      else await createBrandProfile(payload);
    },
    onSuccess: () => {
      toast.success(brand ? "Brand updated" : "Brand saved");
      queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save brand"),
  });

  return (
    <div className={CARD}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className={LABEL}>Brand name</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="FUSE"
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
        </div>
        <div>
          <p className={LABEL}>Website</p>
          <Input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://"
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
        </div>
      </div>

      <div className="mt-4">
        <p className={LABEL}>Description</p>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Tone, market, what the brand stands for."
          className="mt-2 border-white/10 bg-black/30 text-white"
        />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <ImageSlot label="Primary logo" url={primaryLogo} onChange={setPrimaryLogo} />
        <ImageSlot label="Secondary logo" url={secondaryLogo} onChange={setSecondaryLogo} />
      </div>

      <div className="mt-5">
        <p className={LABEL}>Brand colors</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {colors.map((color) => (
            <span
              key={color}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-2.5 py-1 text-xs text-slate-200"
            >
              <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: color }} />
              {color}
              <button
                type="button"
                onClick={() => setColors((current) => current.filter((entry) => entry !== color))}
                aria-label={`Remove ${color}`}
              >
                <X className="h-3 w-3 text-slate-500 hover:text-rose-300" />
              </button>
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <input
              type="color"
              value={colorDraft}
              onChange={(event) => setColorDraft(event.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-white/12 bg-black/30"
              aria-label="Pick a brand color"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setColors((current) => (current.includes(colorDraft) ? current : [...current, colorDraft]))
              }
              className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </span>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {brand ? "Save changes" : "Create brand"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-400"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProductEditor({
  profile,
  brands,
  onDone,
}: {
  profile: ProductProfile | null;
  brands: BrandProfile[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.name ?? "");
  const [type, setType] = useState<ProductProfileType>(profile?.type ?? "garment");
  const [brandId, setBrandId] = useState<string>(profile?.brand_id ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [assets, setAssets] = useState<ProductProfileAsset[]>(profile?.assets ?? []);
  const [role, setRole] = useState<string>(PROFILE_ASSET_ROLES[profile?.type ?? "garment"][0]);
  const { busy, upload } = useUploader();

  const roles = PROFILE_ASSET_ROLES[type];

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        type,
        brand_id: brandId || null,
        description: description.trim() || null,
        assets,
      };
      if (!payload.name) throw new Error("Name is required.");
      if (profile) await updateProductProfile(profile.id, payload);
      else await createProductProfile(payload);
    },
    onSuccess: () => {
      toast.success(profile ? "Profile updated" : "Profile saved");
      queryClient.invalidateQueries({ queryKey: ["product-profiles"] });
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save profile"),
  });

  return (
    <div className={CARD}>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className={LABEL}>Name</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Heavyweight hoodie"
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
        </div>
        <div>
          <p className={LABEL}>Type</p>
          <div className="mt-2 flex gap-2">
            {(["garment", "product"] as ProductProfileType[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setType(option);
                  setRole(PROFILE_ASSET_ROLES[option][0]);
                }}
                className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                  type === option
                    ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={LABEL}>Brand (optional)</p>
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white"
          >
            <option value="">No brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <p className={LABEL}>Description</p>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Fabric, fit, colorway, key details."
          className="mt-2 border-white/10 bg-black/30 text-white"
        />
      </div>

      <div className="mt-5">
        <p className={LABEL}>Images</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="h-9 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white"
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const url = await upload(file);
                if (url) setAssets((current) => [...current, { role, url }]);
              }}
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-200">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Add {role}
            </span>
          </label>
        </div>

        {assets.length ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {assets.map((asset, index) => (
              <div key={`${asset.url}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="aspect-square overflow-hidden bg-slate-900">
                  <img src={asset.url} alt={asset.role} className="h-full w-full object-cover" />
                </div>
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="truncate text-[10px] uppercase tracking-[0.16em] text-slate-400">{asset.role}</span>
                  <button
                    type="button"
                    onClick={() => setAssets((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove ${asset.role}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-slate-500 hover:text-rose-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Nothing here yet — add images so this profile is reusable.</p>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <Button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {profile ? "Save changes" : "Create profile"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-400"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function BrandProfilesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingBrand, setEditingBrand] = useState<BrandProfile | null | undefined>(undefined);
  const [editingProduct, setEditingProduct] = useState<ProductProfile | null | undefined>(undefined);

  const brandsQuery = useQuery({
    queryKey: ["brand-profiles", user?.id ?? "anon"],
    queryFn: () => listBrandProfiles(user?.id ?? ""),
    enabled: !!user?.id,
  });
  const productsQuery = useQuery({
    queryKey: ["product-profiles", user?.id ?? "anon"],
    queryFn: () => listProductProfiles(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const brands = useMemo(() => brandsQuery.data ?? [], [brandsQuery.data]);
  const products = productsQuery.data ?? [];

  const removeBrand = useMutation({
    mutationFn: (id: string) => deleteBrandProfile(id),
    onSuccess: () => {
      toast.success("Brand deleted");
      queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
    },
    onError: () => toast.error("Could not delete brand"),
  });
  const removeProduct = useMutation({
    mutationFn: (id: string) => deleteProductProfile(id),
    onSuccess: () => {
      toast.success("Profile deleted");
      queryClient.invalidateQueries({ queryKey: ["product-profiles"] });
    },
    onError: () => toast.error("Could not delete profile"),
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-28">
        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">Brand kit</p>
        <h1 className="mt-2 font-display text-4xl tracking-[-0.03em]">Brand &amp; product profiles</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Set up your brand once and your garments and products once. Every campaign template can pull these assets
          straight into its inputs.
        </p>

        <Tabs defaultValue="brands" className="mt-8">
          <TabsList className="border border-white/10 bg-white/[0.03]">
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="products">Products &amp; garments</TabsTrigger>
          </TabsList>

          <TabsContent value="brands" className="mt-6 space-y-5">
            {editingBrand !== undefined ? (
              <BrandEditor brand={editingBrand} onDone={() => setEditingBrand(undefined)} />
            ) : (
              <Button
                type="button"
                onClick={() => setEditingBrand(null)}
                className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
              >
                <Plus className="h-3.5 w-3.5" /> New brand
              </Button>
            )}

            {brandsQuery.isLoading ? (
              <p className="text-sm text-slate-400">Loading brands…</p>
            ) : brands.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {brands.map((brand) => (
                  <div key={brand.id} className={CARD}>
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        {brand.primary_logo_url ? (
                          <img src={brand.primary_logo_url} alt={brand.name} className="h-full w-full object-contain" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold">{brand.name}</p>
                        {brand.website ? (
                          <p className="truncate text-xs text-slate-500">{brand.website}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {brand.colors.map((color) => (
                            <span
                              key={color}
                              className="h-4 w-4 rounded-full border border-white/20"
                              style={{ background: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingBrand(brand)}
                        className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeBrand.mutate(brand.id)}
                        className="h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.16em] text-slate-400 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nothing here yet — create a brand to reuse it later.</p>
            )}
          </TabsContent>

          <TabsContent value="products" className="mt-6 space-y-5">
            {editingProduct !== undefined ? (
              <ProductEditor
                profile={editingProduct}
                brands={brands}
                onDone={() => setEditingProduct(undefined)}
              />
            ) : (
              <Button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
              >
                <Plus className="h-3.5 w-3.5" /> New product / garment
              </Button>
            )}

            {productsQuery.isLoading ? (
              <p className="text-sm text-slate-400">Loading profiles…</p>
            ) : products.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {products.map((profile) => (
                  <div key={profile.id} className={CARD}>
                    <div className="flex items-center gap-2">
                      <p className="truncate text-lg font-semibold">{profile.name}</p>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        {profile.type}
                      </span>
                    </div>
                    {profile.assets.length ? (
                      <div className="mt-3 flex gap-2 overflow-x-auto">
                        {profile.assets.map((asset, index) => (
                          <img
                            key={`${asset.url}-${index}`}
                            src={asset.url}
                            alt={asset.role}
                            className="h-16 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
                            title={asset.role}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">No images yet.</p>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingProduct(profile)}
                        className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeProduct.mutate(profile.id)}
                        className="h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.16em] text-slate-400 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nothing here yet — add a garment or product to reuse it later.</p>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
