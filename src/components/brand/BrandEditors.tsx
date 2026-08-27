/**
 * Shared brand-workspace editor primitives (extracted from BrandProfilesPage so
 * the workspace dashboard and the onboarding wizard reuse the exact same logic).
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadRunInputFile } from "@/services/runInputUpload";
import {
  createBrandProfile,
  updateBrandProfile,
  type BrandProfile,
} from "@/services/brandProfiles";
import {
  PROFILE_ASSET_ROLES,
  createProductProfile,
  updateProductProfile,
  type ProductProfile,
  type ProductProfileAsset,
  type ProductProfileType,
} from "@/services/productProfiles";

export const CARD = "rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5";
export const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";

export function useUploader() {
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

export function ImageSlot({
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

/** Brand color chips + picker (same behaviour as the BrandEditor field). */
export function ColorPalette({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  const [colorDraft, setColorDraft] = useState("#22d3ee");
  return (
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
            onClick={() => onChange(colors.filter((entry) => entry !== color))}
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
          onClick={() => onChange(colors.includes(colorDraft) ? colors : [...colors, colorDraft])}
          className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </span>
    </div>
  );
}

export function BrandEditor({
  brand,
  onDone,
  onCreated,
}: {
  brand: BrandProfile | null;
  onDone: () => void;
  onCreated?: (created: BrandProfile) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(brand?.name ?? "");
  const [website, setWebsite] = useState(brand?.website ?? "");
  const [description, setDescription] = useState(brand?.description ?? "");
  const [primaryLogo, setPrimaryLogo] = useState<string | null>(brand?.primary_logo_url ?? null);
  const [secondaryLogo, setSecondaryLogo] = useState<string | null>(brand?.secondary_logo_url ?? null);
  const [colors, setColors] = useState<string[]>(brand?.colors ?? []);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        website: website.trim() || null,
        description: description.trim() || null,
        primary_logo_url: primaryLogo,
        secondary_logo_url: secondaryLogo,
        colors,
        metadata: brand?.metadata ?? {},
      };
      if (!payload.name) throw new Error("Brand name is required.");
      if (brand) {
        await updateBrandProfile(brand.id, payload);
        return null;
      }
      return await createBrandProfile(payload);
    },
    onSuccess: (created) => {
      toast.success(brand ? "Brand updated" : "Brand saved");
      queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
      if (created) onCreated?.(created);
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
        <ColorPalette colors={colors} onChange={setColors} />
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

export function ProductEditor({
  profile,
  brands,
  onDone,
  defaultBrandId,
}: {
  profile: ProductProfile | null;
  brands: BrandProfile[];
  onDone: () => void;
  defaultBrandId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.name ?? "");
  const [type, setType] = useState<ProductProfileType>(profile?.type ?? "garment");
  const [brandId, setBrandId] = useState<string>(profile?.brand_id ?? defaultBrandId ?? "");
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
