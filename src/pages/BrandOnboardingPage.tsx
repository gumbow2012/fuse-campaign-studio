/**
 * FUSE Brand Workspace — Phase 2 premium onboarding wizard (+ Phase 6 visual
 * style, Phase 8 resume). Every step autosaves to brand_profiles; progress is
 * mirrored into metadata.onboarding so setup can be resumed at any time.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import {
  CARD,
  LABEL,
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
import { deriveBrandReadiness, readBrandFlags } from "@/lib/brandReadiness";
import BrandImportPanel, { type BrandImportConfirmation } from "@/components/brand/BrandImportPanel";
import BrandIdentityStep, { type ColorRole } from "@/components/brand/BrandIdentityStep";
import BrandProductsStep from "@/components/brand/BrandProductsStep";
import BrandCreativeDnaStep, { type CreativeDnaValue } from "@/components/brand/BrandCreativeDnaStep";
import CastLibrary from "@/components/cast/CastLibrary";
import BrandReviewStep from "@/components/brand/BrandReviewStep";
import { takeBrandImport } from "@/services/brandImport";
import { track } from "@/lib/analytics/track";

const STEPS = [
  { id: 1, label: "Brand basics", optional: false },
  { id: 2, label: "Identity", optional: false },
  { id: 3, label: "Products", optional: true },
  { id: 4, label: "Models", optional: true },
  { id: 5, label: "Creative DNA", optional: true },
  { id: 6, label: "Finish", optional: false },
];

/** Safe non-PII step descriptor for analytics, e.g. "3_products". */
function stepKey(id: number): string {
  const label = STEPS.find((entry) => entry.id === id)?.label ?? "unknown";
  return `${id}_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

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

  // Website importer (Phase 2) — candidate state only, never auto-persisted.
  const handoff = useMemo(() => takeBrandImport<BrandImportConfirmation>(), []);
  const [imported, setImported] = useState<BrandImportConfirmation | null>(handoff);
  const [showImporter, setShowImporter] = useState(!searchParams.get("brand") && !handoff);

  // Step 1
  const [name, setName] = useState(handoff?.name ?? "");
  const [website, setWebsite] = useState(handoff?.website ?? "");
  const [description, setDescription] = useState(handoff?.description ?? "");
  // Step 2
  const [primaryLogo, setPrimaryLogo] = useState<string | null>(null);
  const [secondaryLogo, setSecondaryLogo] = useState<string | null>(null);
  const [invertedLogo, setInvertedLogo] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [colorRoles, setColorRoles] = useState<Record<string, ColorRole>>({});
  const [noLogo, setNoLogo] = useState(false);
  const [neutralPalette, setNeutralPalette] = useState(false);
  // Step 4
  const [modelIds, setModelIds] = useState<string[]>([]);
  // Step 5 — Creative DNA (Phase 6)
  const [dna, setDna] = useState<CreativeDnaValue>({
    styleSignals: [],
    tone: "",
    instagram: null,
    pinterest: null,
    referenceBrands: [],
    referenceImages: [],
    notes: "",
  });
  const patchDna = (patch: Partial<CreativeDnaValue>) =>
    setDna((current) => ({ ...current, ...patch }));


  const hydratedFor = useMemo(() => brand?.id ?? null, [brand?.id]);
  useEffect(() => {
    if (!brand) return;
    setShowImporter(false);
    setName(brand.name ?? "");
    setWebsite(brand.website ?? "");
    setDescription(brand.description ?? "");
    setPrimaryLogo(brand.primary_logo_url ?? null);
    setSecondaryLogo(brand.secondary_logo_url ?? null);
    setColors(brand.colors ?? []);
    const meta = (brand.metadata ?? {}) as Record<string, unknown>;
    setInvertedLogo(typeof meta.invertedLogoUrl === "string" ? meta.invertedLogoUrl : null);
    setColorRoles(
      meta.colorRoles && typeof meta.colorRoles === "object"
        ? (meta.colorRoles as Record<string, ColorRole>)
        : {},
    );
    const flags = readBrandFlags(brand);
    setNoLogo(flags.noLogo);
    setNeutralPalette(flags.neutralPalette);
    setModelIds(readModelIds(brand));
    const style = readVisualStyle(brand);
    setDna({
      styleSignals: style?.styleSignals ?? [],
      tone: style?.tone ?? "",
      instagram: style?.instagram ?? null,
      pinterest: style?.pinterest ?? null,
      referenceBrands: style?.referenceBrands ?? [],
      referenceImages: style?.referenceImages ?? [],
      notes: style?.notes ?? "",
    });

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

  // Esc leaves the wizard; everything is already saved step by step.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigate("/app/brand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Funnel: one started event per step the user actually lands on.
  useEffect(() => {
    track("brand_step_started", { step: stepKey(step) });
  }, [step]);


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
        metaPatch.invertedLogoUrl = invertedLogo;
        // Roles only survive for colors that are still in the palette.
        metaPatch.colorRoles = Object.fromEntries(
          Object.entries(colorRoles).filter(([hex]) => colors.includes(hex)),
        );
      }
      if (step === 4) metaPatch.modelIds = modelIds;
      if (step === 5) {
        // Creative DNA — extends the existing visualStyle object; tags /
        // references stay as legacy mirrors for older readers.
        const existing = readVisualStyle(brand);
        metaPatch.visualStyle = {
          ...(existing ?? {}),
          styleSignals: dna.styleSignals,
          tags: dna.styleSignals,
          tone: dna.tone.trim(),
          instagram: dna.instagram,
          pinterest: dna.pinterest,
          referenceBrands: dna.referenceBrands,
          referenceImages: dna.referenceImages,
          references: dna.referenceImages,
          notes: dna.notes.trim(),
        };
      }

      const metadata = { ...((brand.metadata ?? {}) as Record<string, unknown>), ...metaPatch };
      await patchBrandProfile(brand.id, { ...patch, metadata } as never);
      return nextStep;
    },
    onSuccess: (nextStep) => {
      track("brand_step_completed", { step: stepKey(step) });
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
          <StepRail step={step} maxReachable={maxReachable} onJump={setStep} />
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-300 transition-all"
              style={{ width: `${(step / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-8 flex-1">
          {step === 1 && showImporter ? (
            <BrandImportPanel
              onManual={() => setShowImporter(false)}
              onConfirm={(result) => {
                // Prefill only — persistence stays in the existing step autosave.
                setName(result.name);
                setWebsite(result.website);
                setDescription(result.description);
                setImported(result);
                setShowImporter(false);
                toast.success(result.label);
              }}
            />
          ) : null}

          {step === 1 && !showImporter ? (
            <div className={CARD}>
              <p className={LABEL}>Step 1 — Brand basics</p>
              <h2 className="mt-2 text-2xl">What are we building?</h2>
              {imported ? (
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-cyan-200/80">{imported.label}</p>
              ) : null}
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
                {!imported ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowImporter(true)}
                    className="rounded-full text-[11px] uppercase tracking-[0.16em] text-cyan-200"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Import from my website instead
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}


          {step === 2 ? (
            <BrandIdentityStep
              imported={imported}
              primaryLogo={primaryLogo}
              secondaryLogo={secondaryLogo}
              invertedLogo={invertedLogo}
              colors={colors}
              colorRoles={colorRoles}
              noLogo={noLogo}
              neutralPalette={neutralPalette}
              setPrimaryLogo={setPrimaryLogo}
              setSecondaryLogo={setSecondaryLogo}
              setInvertedLogo={setInvertedLogo}
              setColors={setColors}
              setColorRoles={setColorRoles}
              setNoLogo={setNoLogo}
              setNeutralPalette={setNeutralPalette}
            />
          ) : null}

          {step === 3 ? (
            <BrandProductsStep
              brand={brand}
              imported={imported}
              products={brandProducts}
              onImportedConsumed={() =>
                setImported((current) => (current ? { ...current, products: [] } : current))
              }
            />
          ) : null}


          {step === 4 ? (
            <div className="space-y-4">
              <div className={CARD}>
                <p className={LABEL}>Step 4 — Cast (optional)</p>
                <h2 className="mt-2 text-2xl">CAST YOUR CAMPAIGNS</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Save the people who represent your brand — or use FUSE Cast.
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  {modelIds.length
                    ? `${modelIds.length} cast member${modelIds.length === 1 ? "" : "s"} saved to this brand.`
                    : "Optional — plenty of campaigns need no person at all."}
                </p>
              </div>
              <CastLibrary
                userId={user?.id ?? null}
                mode="multi"
                selectedIds={modelIds}
                onToggle={(avatar) =>
                  setModelIds((current) =>
                    current.includes(avatar.id)
                      ? current.filter((id) => id !== avatar.id)
                      : [...current, avatar.id],
                  )
                }
              />
            </div>
          ) : null}

          {step === 5 ? <BrandCreativeDnaStep value={dna} onChange={patchDna} /> : null}


          {step === 6 ? (
            <BrandReviewStep
              brand={brand}
              products={brandProducts}
              cast={(avatarsQuery.data ?? []).filter((entry) =>
                readModelIds(brand).includes(entry.id),
              )}
              style={readVisualStyle(brand)}
              colorRoles={colorRoles}
              readiness={readiness}
              onJump={setStep}
              onSubmit={() => finish.mutate()}
              submitting={finish.isPending}
            />
          ) : null}

        </div>

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
          {step < 6 ? (

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
          ) : null}
        </div>

      </main>
    </div>
  );
}
