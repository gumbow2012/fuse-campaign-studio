/**
 * FUSE Brand Workspace — Phase 2 premium onboarding wizard (+ Phase 6 visual
 * style, Phase 8 resume). Every step autosaves to brand_profiles; progress is
 * mirrored into metadata.onboarding so setup can be resumed at any time.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import {
  CARD,
  ImageSlot,
  LABEL,
  ColorPalette,
  ProductEditor,
  useUploader,
} from "@/components/brand/BrandEditors";
import {
  createBrandProfile,
  patchBrandMetadata,
  patchBrandProfile,
  readModelIds,
  readOnboarding,
  readVisualStyle,
  type BrandProfile,
} from "@/services/brandProfiles";
import { listMyAvatars } from "@/services/avatarProfiles";
import { listProductProfiles } from "@/services/productProfiles";
import { deriveBrandReadiness, readBrandFlags, type ReadinessStatus } from "@/lib/brandReadiness";

const STEPS = [
  { id: 1, label: "Brand basics", optional: false },
  { id: 2, label: "Identity", optional: false },
  { id: 3, label: "Products", optional: true },
  { id: 4, label: "Models", optional: true },
  { id: 5, label: "Visual style", optional: true },
  { id: 6, label: "Finish", optional: false },
];

const STYLE_TAGS = [
  "Streetwear",
  "Editorial",
  "Luxury",
  "Minimal",
  "Grunge",
  "Y2K",
  "Neon night",
  "Studio clean",
  "Film grain",
  "High contrast",
  "Warm daylight",
  "Cinematic",
];

const STATUS_MARK: Record<ReadinessStatus, { mark: string; className: string }> = {
  complete: { mark: "✓ COMPLETE", className: "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" },
  "recommended-missing": { mark: "⚠ RECOMMENDED", className: "border-amber-300/40 bg-amber-300/10 text-amber-100" },
  "optional-missing": { mark: "○ OPTIONAL", className: "border-white/10 bg-white/[0.03] text-slate-400" },
  "required-missing": { mark: "✕ REQUIRED", className: "border-rose-400/40 bg-rose-400/10 text-rose-100" },
};

function StepRail({
  step,
  maxReachable,
  onJump,
}: {
  step: number;
  maxReachable: number;
  onJump: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STEPS.map((entry) => {
        const state = entry.id === step ? "current" : entry.id < step ? "done" : "todo";
        const clickable = entry.id <= Math.max(step, maxReachable);
        return (
          <button
            key={entry.id}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onJump(entry.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
              state === "current"
                ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
                : state === "done"
                  ? "border-white/10 bg-white/[0.04] text-slate-300 hover:text-white"
                  : "border-white/10 text-slate-500"
            } ${clickable ? "cursor-pointer" : "cursor-default"}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            {state === "done" ? <Check className="h-3 w-3" /> : null}
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}


export default function BrandOnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { brands, setActiveBrand } = useBrand();
  const [searchParams] = useSearchParams();

  const initialStep = Math.min(Math.max(Number(searchParams.get("step")) || 1, 1), 6);
  const [step, setStep] = useState(initialStep);
  const [brandId, setBrandId] = useState<string | null>(searchParams.get("brand"));
  const brand = useMemo(
    () => brands.find((entry) => entry.id === brandId) ?? null,
    [brands, brandId],
  );

  // Step 1
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  // Step 2
  const [primaryLogo, setPrimaryLogo] = useState<string | null>(null);
  const [secondaryLogo, setSecondaryLogo] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  // Step 4
  const [modelIds, setModelIds] = useState<string[]>([]);
  // Step 5
  const [tags, setTags] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const { busy: refBusy, upload: uploadRef } = useUploader();

  const hydratedFor = useMemo(() => brand?.id ?? null, [brand?.id]);
  useEffect(() => {
    if (!brand) return;
    setName(brand.name ?? "");
    setWebsite(brand.website ?? "");
    setDescription(brand.description ?? "");
    setPrimaryLogo(brand.primary_logo_url ?? null);
    setSecondaryLogo(brand.secondary_logo_url ?? null);
    setColors(brand.colors ?? []);
    setModelIds(readModelIds(brand));
    const style = readVisualStyle(brand);
    setTags(style?.tags ?? []);
    setTone(style?.tone ?? "");
    setReferences(style?.references ?? []);
    setNotes(style?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydratedFor]);

  const productsQuery = useQuery({
    queryKey: ["product-profiles", user?.id ?? "anon"],
    queryFn: () => listProductProfiles(user?.id ?? ""),
    enabled: !!user?.id,
  });
  const avatarsQuery = useQuery({
    queryKey: ["my-avatars", user?.id ?? "anon"],
    queryFn: () => listMyAvatars(user?.id ?? ""),
    enabled: !!user?.id,
  });
  const brandProducts = (productsQuery.data ?? []).filter((entry) => entry.brand_id === brand?.id);
  const avatars = avatarsQuery.data ?? [];

  // Esc leaves the wizard; everything is already saved step by step.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigate("/app/brand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const refreshBrands = () => {
    queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["active-brand-id"] });
  };

  // Readiness is derived from SAVED data only — never from "step visited".
  const readiness = useMemo(
    () =>
      deriveBrandReadiness(
        brand,
        productsQuery.data ?? [],
        readModelIds(brand),
        readVisualStyle(brand),
      ),
    [brand, productsQuery.data],
  );

  function onboardingPatch(target: BrandProfile | null, nextStep: number) {
    const current = readOnboarding(target);
    const completedSteps = Array.from(new Set(readiness.completedSteps)).sort((a, b) => a - b);
    return {
      onboarding: {
        currentStep: nextStep,
        completedSteps,
        startedAt: current?.startedAt || new Date().toISOString(),
        completedAt: current?.completedAt ?? null,
      },
    };
  }

  const advance = useMutation({
    mutationFn: async (nextStep: number) => {
      // Step 1 creates the brand; every later step updates it (autosave).
      if (!brand) {
        const trimmed = name.trim();
        if (!trimmed) throw new Error("Brand name is required.");
        const created = await createBrandProfile({
          name: trimmed,
          website: website.trim() || null,
          description: description.trim() || null,
          metadata: onboardingPatch(null, nextStep),
        });
        if (!created) throw new Error("Could not create the brand.");
        setBrandId(created.id);
        setActiveBrand(created.id);
        return nextStep;
      }

      const patch: Record<string, unknown> = {};
      if (step === 1) {
        const trimmed = name.trim();
        if (!trimmed) throw new Error("Brand name is required.");
        patch.name = trimmed;
        patch.website = website.trim() || null;
        patch.description = description.trim() || null;
      }
      if (step === 2) {
        patch.primary_logo_url = primaryLogo;
        patch.secondary_logo_url = secondaryLogo;
        patch.colors = colors;
      }
      const metaPatch: Record<string, unknown> = { ...onboardingPatch(brand, nextStep) };
      if (step === 2) {
        metaPatch.noLogo = noLogo;
        metaPatch.neutralPalette = neutralPalette;
      }
      if (step === 4) metaPatch.modelIds = modelIds;
      if (step === 5) {
        metaPatch.visualStyle = {
          tags,
          tone: tone.trim(),
          references,
          notes: notes.trim(),
        };
      }
      const metadata = { ...((brand.metadata ?? {}) as Record<string, unknown>), ...metaPatch };
      await patchBrandProfile(brand.id, { ...patch, metadata } as never);
      return nextStep;
    },
    onSuccess: (nextStep) => {
      refreshBrands();
      setStep(nextStep);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!brand) return;
      if (!readiness.ready) throw new Error("Complete the required items first.");
      const current = readOnboarding(brand);
      await patchBrandMetadata(brand, {
        onboarding: {
          currentStep: 6,
          completedSteps: readiness.completedSteps,
          startedAt: current?.startedAt || new Date().toISOString(),
          // Only stamped when every REQUIRED item is actually satisfied.
          completedAt: current?.completedAt ?? new Date().toISOString(),
        },
      });
    },
    onSuccess: () => {
      refreshBrands();
      navigate("/app/brand");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not finish"),
  });

  const canContinue = step !== 1 || name.trim().length > 0;
  const optional = STEPS.find((entry) => entry.id === step)?.optional ?? false;
  const maxReachable = Math.max(step, ...readiness.completedSteps, 1);


  const style = { tags, tone, references, notes };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 pb-16 pt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">Brand onboarding</p>
            <h1 className="mt-2 font-display text-3xl tracking-[-0.03em] sm:text-4xl">BUILD YOUR BRAND ONCE.</h1>
            <p className="mt-2 text-slate-400">FUSE remembers the rest.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/app/brand")}
            className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-400"
          >
            <X className="h-4 w-4" /> Close
          </Button>
        </div>

        <div className="mt-6">
          <StepRail step={step} />
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-300 transition-all"
              style={{ width: `${(step / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-8 flex-1">
          {step === 1 ? (
            <div className={CARD}>
              <p className={LABEL}>Step 1 — Brand basics</p>
              <h2 className="mt-2 text-2xl">What are we building?</h2>
              <div className="mt-5 space-y-4">
                <div>
                  <p className={LABEL}>Brand name *</p>
                  <Input
                    autoFocus
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
                <div>
                  <p className={LABEL}>Short description</p>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Who it's for, what it stands for."
                    className="mt-2 border-white/10 bg-black/30 text-white"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className={CARD}>
              <p className={LABEL}>Step 2 — Identity</p>
              <h2 className="mt-2 text-2xl">Logos and colors.</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <ImageSlot label="Primary logo" url={primaryLogo} onChange={setPrimaryLogo} />
                <ImageSlot label="Secondary logo" url={secondaryLogo} onChange={setSecondaryLogo} />
              </div>
              <div className="mt-6">
                <p className={LABEL}>Brand colors</p>
                <ColorPalette colors={colors} onChange={setColors} />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className={CARD}>
                <p className={LABEL}>Step 3 — Products &amp; garments</p>
                <h2 className="mt-2 text-2xl">What are we shooting?</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {brandProducts.length} saved for {brand?.name ?? "this brand"}.
                </p>
                {brandProducts.length ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {brandProducts.map((entry) => (
                      <div key={entry.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                        <div className="aspect-square overflow-hidden bg-slate-900">
                          {entry.assets[0] ? (
                            <img src={entry.assets[0].url} alt={entry.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <p className="truncate px-2.5 py-2 text-[11px] text-slate-300">{entry.name}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!addingProduct ? (
                  <Button
                    type="button"
                    onClick={() => setAddingProduct(true)}
                    className="mt-5 rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add product / garment
                  </Button>
                ) : null}
              </div>
              {addingProduct && brand ? (
                <ProductEditor
                  profile={null}
                  brands={brand ? [brand] : []}
                  defaultBrandId={brand.id}
                  onDone={() => setAddingProduct(false)}
                />
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className={CARD}>
              <p className={LABEL}>Step 4 — Models / FUSE Cast</p>
              <h2 className="mt-2 text-2xl">Who wears it?</h2>
              {avatars.length ? (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {avatars.map((avatar) => {
                    const selected = modelIds.includes(avatar.id);
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setModelIds((current) =>
                            current.includes(avatar.id)
                              ? current.filter((id) => id !== avatar.id)
                              : [...current, avatar.id],
                          )
                        }
                        className={`overflow-hidden rounded-2xl border text-left transition ${
                          selected ? "border-cyan-300/60 bg-cyan-300/10" : "border-white/10 bg-black/30"
                        }`}
                      >
                        <div className="aspect-[3/4] overflow-hidden bg-slate-900">
                          {avatar.thumbnail_url ? (
                            <img src={avatar.thumbnail_url} alt={avatar.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <p className="truncate px-2.5 py-2 text-[11px] text-slate-300">{avatar.name}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">No models saved yet.</p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/app/avatars")}
                className="mt-5 rounded-full border-white/12 bg-white/[0.03] px-4 text-[11px] uppercase tracking-[0.16em]"
              >
                Add models
              </Button>
            </div>
          ) : null}

          {step === 5 ? (
            <div className={CARD}>
              <p className={LABEL}>Step 5 — Visual style</p>
              <h2 className="mt-2 text-2xl">How should it look?</h2>

              <div className="mt-5">
                <p className={LABEL}>Style tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from(new Set([...STYLE_TAGS, ...tags])).map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setTags((current) =>
                            current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
                          )
                        }
                        className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                          active
                            ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                            : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder="Add your own tag"
                    className="h-9 max-w-xs border-white/10 bg-black/30 text-white"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const value = tagDraft.trim();
                      if (!value) return;
                      setTags((current) => (current.includes(value) ? current : [...current, value]));
                      setTagDraft("");
                    }}
                    className="h-9 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </div>

              <div className="mt-5">
                <p className={LABEL}>Tone / mood</p>
                <Input
                  value={tone}
                  onChange={(event) => setTone(event.target.value)}
                  placeholder="Cold night streets, hard flash, zero gloss."
                  className="mt-2 border-white/10 bg-black/30 text-white"
                />
              </div>

              <div className="mt-5">
                <p className={LABEL}>Reference images</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {references.map((url, index) => (
                    <span key={`${url}-${index}`} className="relative">
                      <img
                        src={url}
                        alt={`Reference ${index + 1}`}
                        className="h-20 w-20 rounded-xl border border-white/10 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setReferences((current) => current.filter((_, i) => i !== index))}
                        aria-label="Remove reference"
                        className="absolute -right-2 -top-2 rounded-full border border-white/20 bg-slate-950 p-1"
                      >
                        <X className="h-3 w-3 text-slate-300" />
                      </button>
                    </span>
                  ))}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        const url = await uploadRef(file);
                        if (url) setReferences((current) => [...current, url]);
                      }}
                    />
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-200">
                      {refBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Add reference
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-5">
                <p className={LABEL}>Notes</p>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Anything FUSE should always respect."
                  className="mt-2 border-white/10 bg-black/30 text-white"
                />
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <div className={CARD}>
              <p className={LABEL}>Step 6 — Finish</p>
              <h2 className="mt-2 text-2xl">{brand?.name ?? "Your brand"} is ready.</h2>
              <ul className="mt-5 space-y-2 text-sm text-slate-300">
                {[
                  { label: "Brand basics", done: Boolean(brand?.name) },
                  {
                    label: "Identity (logo + colors)",
                    done: Boolean((brand?.primary_logo_url || brand?.secondary_logo_url) && (brand?.colors.length ?? 0) > 0),
                  },
                  { label: `Products (${brandProducts.length})`, done: brandProducts.length > 0 },
                  { label: `Models (${modelIds.length})`, done: modelIds.length > 0 },
                  { label: "Visual style", done: style.tags.length > 0 || style.tone.trim().length > 0 },
                ].map((entry) => (
                  <li key={entry.label} className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                        entry.done ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-200" : "border-white/10 text-slate-500"
                      }`}
                    >
                      {entry.done ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {entry.label}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                onClick={() => finish.mutate()}
                disabled={finish.isPending}
                className="mt-6 rounded-full bg-cyan-300 px-6 py-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
              >
                {finish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Enter your Brand Workspace
              </Button>
            </div>
          ) : null}
        </div>

        {step < 6 ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <div className="flex items-center gap-2">
              {optional ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => advance.mutate(step + 1)}
                  className="rounded-full border-white/12 bg-white/[0.03] px-4 text-[11px] uppercase tracking-[0.16em]"
                >
                  Skip
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => advance.mutate(step + 1)}
                disabled={!canContinue || advance.isPending}
                className="rounded-full bg-cyan-300 px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
              >
                {advance.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Continue <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
