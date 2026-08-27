/**
 * FUSE Brand Workspace — active brand, completion dashboard and the existing
 * brand / product editors (shared with the onboarding wizard).
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Images,
  Palette,
  Plus,
  Shirt,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { listMyAvatars } from "@/services/avatarProfiles";
import { listLibraryAssets } from "@/services/libraryAssets";
import { BrandEditor, CARD, LABEL, ProductEditor } from "@/components/brand/BrandEditors";
import BrandImportPanel from "@/components/brand/BrandImportPanel";
import { deriveBrandReadiness } from "@/lib/brandReadiness";
import { stashBrandImport } from "@/services/brandImport";
import BrandModelsPanel from "@/components/brand/BrandModelsPanel";
import BrandLibraryPanel from "@/components/brand/BrandLibraryPanel";
import {
  deleteBrandProfile,
  readModelIds,
  readOnboarding,
  readVisualStyle,
  type BrandProfile,
} from "@/services/brandProfiles";
import {
  deleteProductProfile,
  listProductProfiles,
  type ProductProfile,
} from "@/services/productProfiles";


/**
 * Single truth: onboarding is either done (no REQUIRED items missing) or not.
 * The percent shown is enrichment depth from RECOMMENDED items only — it is
 * never presented as required onboarding progress.
 */
function BrandStatusRing({ ready, depthPct }: { ready: boolean; depthPct: number }) {
  const pct = ready ? depthPct : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-16 w-16 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(#22d3ee ${pct * 3.6}deg, rgba(255,255,255,0.08) ${pct * 3.6}deg)`,
        }}
        role="img"
        aria-label={ready ? `Brand set up. Profile depth ${depthPct} percent` : "Brand identity not set up yet"}
      >
        <div className="absolute inset-[6px] flex items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
          {ready ? <Check className="h-5 w-5 text-cyan-200" /> : <span className="text-[11px]">SET UP</span>}
        </div>
      </div>
      <div>
        <p className={LABEL}>{ready ? "Brand set up ✓" : "Brand setup"}</p>
        <p className="mt-1 text-sm text-slate-300">
          {ready
            ? `Identity ready · Profile depth ${depthPct}% (optional enrichment)`
            : "Add your brand name, logo and colors to finish setup."}
        </p>
      </div>
    </div>
  );
}

function DashboardCard({
  icon,
  title,
  done,
  detail,
  cta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  done: boolean;
  detail: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD} group text-left transition hover:border-cyan-300/40 hover:bg-white/[0.05]`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-cyan-200">
          {icon}
        </span>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
            <Check className="h-3 w-3" /> Done
          </span>
        ) : (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-400">
            To do
          </span>
        )}
      </div>
      <p className="mt-4 font-display text-lg tracking-[-0.01em]">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-cyan-200">
        {cta} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function BrandSwitcher({
  brands,
  activeBrand,
  onSelect,
  onCreate,
}: {
  brands: BrandProfile[];
  activeBrand: BrandProfile | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const initials = (activeBrand?.name ?? "?")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-2 pl-2 pr-4">
        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/50 text-xs font-semibold text-cyan-100">
          {activeBrand?.primary_logo_url ? (
            <img src={activeBrand.primary_logo_url} alt={activeBrand.name} className="h-full w-full object-contain" />
          ) : (
            initials
          )}
        </span>
        <span className="min-w-0">
          <span className={`${LABEL} block`}>Active brand</span>
          <span className="block truncate text-sm font-semibold text-white">{activeBrand?.name ?? "None"}</span>
        </span>
      </div>

      {brands.length > 1 ? (
        <select
          value={activeBrand?.id ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          aria-label="Switch active brand"
          className="h-10 rounded-full border border-white/10 bg-black/30 px-4 text-sm text-white"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={onCreate}
        className="h-10 rounded-full border-white/12 bg-white/[0.03] px-4 text-[11px] uppercase tracking-[0.16em]"
      >
        <Plus className="h-3.5 w-3.5" /> New brand
      </Button>
    </div>
  );
}

export default function BrandProfilesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { brands, activeBrand, setActiveBrand, loading: brandLoading } = useBrand();
  const [tab, setTab] = useState("dashboard");
  const [showImporter, setShowImporter] = useState(false);

  const [editingBrand, setEditingBrand] = useState<BrandProfile | null | undefined>(undefined);
  const [editingProduct, setEditingProduct] = useState<ProductProfile | null | undefined>(undefined);

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
  const libraryQuery = useQuery({
    queryKey: ["library-assets", user?.id ?? "anon"],
    queryFn: () => listLibraryAssets(user?.id ?? ""),
    enabled: !!user?.id,
  });

  const products = productsQuery.data ?? [];
  const avatars = avatarsQuery.data ?? [];
  const libraryAssets = libraryQuery.data ?? [];

  const brandProducts = useMemo(
    () => (activeBrand ? products.filter((profile) => profile.brand_id === activeBrand.id) : []),
    [products, activeBrand],
  );

  // Every card below is derived from real rows only — nothing is assumed.
  const onboarding = useMemo(() => readOnboarding(activeBrand), [activeBrand]);
  const visualStyle = useMemo(() => readVisualStyle(activeBrand), [activeBrand]);
  const brandModelIds = useMemo(() => readModelIds(activeBrand), [activeBrand]);
  const brandModelCount = useMemo(
    () => avatars.filter((avatar) => brandModelIds.includes(avatar.id)).length,
    [avatars, brandModelIds],
  );
  // ONE readiness truth for setup state (required vs enrichment).
  const readiness = useMemo(
    () => deriveBrandReadiness(activeBrand, products, brandModelIds, visualStyle),
    [activeBrand, products, brandModelIds, visualStyle],
  );

  // "Profile depth" = recommended items satisfied. Purely enrichment.
  const depthPct = useMemo(() => {
    const recommended = readiness.sections
      .flatMap((section) => section.items)
      .filter((item) => item.level === "recommended");
    if (recommended.length === 0) return 100;
    const done = recommended.filter((item) => item.done).length;
    return Math.round((done / recommended.length) * 100);
  }, [readiness]);

  // Non-blocking enhancement state — labeled optional everywhere in the UI.
  const identityReady = readiness.ready;
  const enhancements = useMemo(
    () => ({
      products: brandProducts.length > 0,
      models: avatars.length > 0,
      visualStyle: Boolean(visualStyle && (visualStyle.tags.length > 0 || visualStyle.tone.trim().length > 0)),
      assets: libraryAssets.length > 0,
    }),
    [brandProducts.length, avatars.length, libraryAssets.length, visualStyle],
  );


  const removeBrand = useMutation({
    mutationFn: (id: string) => deleteBrandProfile(id),
    onSuccess: () => {
      toast.success("Brand deleted");
      queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["active-brand-id"] });
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

  const hero = (
    <>
      <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">Brand workspace</p>
      <h1 className="mt-2 font-display text-4xl tracking-[-0.03em] sm:text-5xl">BUILD YOUR BRAND ONCE.</h1>
      <p className="mt-3 max-w-2xl text-lg text-slate-400">FUSE remembers the rest.</p>
    </>
  );

  const resumeBanner =
    activeBrand && onboarding && !onboarding.completedAt ? (
      <div className="mt-7 flex flex-col gap-3 rounded-[1.5rem] border border-cyan-300/30 bg-cyan-300/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={LABEL}>Setup in progress</p>
          <p className="mt-1 text-sm text-slate-200">
            {activeBrand.name} — you stopped at step {onboarding.currentStep} of 6.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => navigate(`/app/brand/onboarding?brand=${activeBrand.id}&step=${onboarding.currentStep}`)}
          className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          Resume brand setup <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    ) : null;

  if (!brandLoading && brands.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <main className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 pb-24 pt-32">
          <div
            className={`${CARD} w-full text-center`}
            style={{
              background:
                "radial-gradient(120% 100% at 50% 0%, rgba(34,211,238,0.10) 0%, rgba(255,255,255,0.02) 55%)",
            }}
          >
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">Brand workspace</p>
            <h1 className="mt-3 font-display text-3xl tracking-[-0.03em] sm:text-4xl">Set up your brand</h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
              Add your brand once — FUSE reuses it across every campaign.
            </p>
            <Button
              type="button"
              onClick={() => navigate("/app/brand/onboarding")}
              className="mt-7 h-11 rounded-full bg-cyan-300 px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              Add your brand <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowImporter((value) => !value)}
                className="text-[11px] uppercase tracking-[0.16em] text-slate-400 underline decoration-white/20 underline-offset-4 transition hover:text-cyan-200"
              >
                Import from website
              </button>
            </div>
          </div>

          {showImporter ? (
            <div className="mt-6 w-full">
              <BrandImportPanel
                onManual={() => navigate("/app/brand/onboarding")}
                onConfirm={(result) => {
                  stashBrandImport(result);
                  navigate("/app/brand/onboarding");
                }}
              />
            </div>
          ) : null}
        </main>

      </div>
    );
  }


  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-28">
        {hero}
        {resumeBanner}


        <div className="mt-7 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <BrandSwitcher
            brands={brands}
            activeBrand={activeBrand}
            onSelect={(id) => {
              setActiveBrand(id);
              setTab("dashboard");
            }}
            onCreate={() => {
              setTab("brands");
              setEditingBrand(null);
            }}
          />
          <CompletionRing done={doneCount} total={5} />
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 border border-white/10 bg-white/[0.03]">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="products">Products &amp; garments</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            {!readiness.ready ? (
              <div className={`${CARD} mb-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={LABEL}>Brand readiness</p>
                  <span className="text-[11px] uppercase tracking-[0.16em] text-amber-200">
                    {readiness.requiredMissing} required left
                  </span>
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {readiness.sections.map((section) => (
                    <li key={section.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-300">{section.label}</span>
                      {section.status === "complete" ? (
                        <Check className="h-4 w-4 shrink-0 text-cyan-200" />
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              activeBrand
                                ? `/app/brand/onboarding?brand=${activeBrand.id}&step=${section.step}`
                                : "/app/brand/onboarding",
                            )
                          }
                          className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-cyan-200 hover:text-cyan-100"
                        >
                          {section.status === "required-missing" ? "Complete" : "Improve"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DashboardCard
                icon={<Palette className="h-5 w-5" />}
                title="Identity"
                done={completion.identity}
                detail={
                  completion.identity
                    ? `${activeBrand?.name} — logo and ${activeBrand?.colors.length} color${activeBrand?.colors.length === 1 ? "" : "s"} saved.`
                    : "Name, a logo and at least one brand color."
                }
                cta={completion.identity ? "Edit identity" : "Add your logo & colors"}
                onClick={() => {
                  setTab("brands");
                  setEditingBrand(activeBrand ?? null);
                }}
              />
              <DashboardCard
                icon={<Shirt className="h-5 w-5" />}
                title="Products & garments"
                done={completion.products}
                detail={`${brandProducts.length} saved for this brand.`}
                cta={completion.products ? "Manage products" : "Add products"}
                onClick={() => {
                  setTab("products");
                  setEditingProduct(brandProducts.length ? undefined : null);
                }}
              />
              <DashboardCard
                icon={<Users className="h-5 w-5" />}
                title="Models / FUSE Cast"
                done={completion.models}
                detail={
                  brandModelCount
                    ? `${brandModelCount} model${brandModelCount === 1 ? "" : "s"} linked to this brand.`
                    : `${avatars.length} model${avatars.length === 1 ? "" : "s"} saved — none linked to this brand yet.`
                }
                cta={completion.models ? "Manage models" : "Add models"}
                onClick={() => setTab("models")}
              />
              <DashboardCard
                icon={<Wand2 className="h-5 w-5" />}
                title="Visual style"
                done={completion.visualStyle}
                detail={
                  completion.visualStyle
                    ? [visualStyle?.tags.slice(0, 3).join(", "), visualStyle?.tone].filter(Boolean).join(" · ")
                    : "Tags, tone and references FUSE should always respect."
                }
                cta={completion.visualStyle ? "Edit your style" : "Set your style"}
                onClick={() =>
                  activeBrand
                    ? navigate(`/app/brand/onboarding?brand=${activeBrand.id}&step=5`)
                    : navigate("/app/brand/onboarding")
                }
              />

              <DashboardCard
                icon={<Images className="h-5 w-5" />}
                title="Saved assets"
                done={completion.assets}
                detail={`${libraryAssets.length} asset${libraryAssets.length === 1 ? "" : "s"} in your library.`}
                cta="Open library"
                onClick={() => setTab("library")}
              />
            </div>
          </TabsContent>

          <TabsContent value="brands" className="mt-6 space-y-5">
            {editingBrand !== undefined ? (
              <BrandEditor
                brand={editingBrand}
                onDone={() => setEditingBrand(undefined)}
                onCreated={(created) => setActiveBrand(created.id)}
              />
            ) : (
              <Button
                type="button"
                onClick={() => setEditingBrand(null)}
                className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
              >
                <Plus className="h-3.5 w-3.5" /> New brand
              </Button>
            )}

            {brandLoading ? (
              <p className="text-sm text-slate-400">Loading brands…</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {brands.map((brand) => (
                  <div
                    key={brand.id}
                    className={`${CARD} ${brand.id === activeBrand?.id ? "border-cyan-300/40" : ""}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        {brand.primary_logo_url ? (
                          <img src={brand.primary_logo_url} alt={brand.name} className="h-full w-full object-contain" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-semibold">{brand.name}</p>
                        {brand.website ? <p className="truncate text-xs text-slate-500">{brand.website}</p> : null}
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
                    <div className="mt-4 flex flex-wrap gap-2">
                      {brand.id === activeBrand?.id ? (
                        <span className="inline-flex h-8 items-center rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 text-[11px] uppercase tracking-[0.16em] text-cyan-100">
                          Active
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveBrand(brand.id)}
                          className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
                        >
                          Set active
                        </Button>
                      )}
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

          <TabsContent value="models" className="mt-6">
            <BrandModelsPanel
              avatars={avatars}
              loading={avatarsQuery.isLoading}
              activeBrand={activeBrand}
            />
          </TabsContent>

          <TabsContent value="library" className="mt-6">
            <BrandLibraryPanel assets={libraryAssets} loading={libraryQuery.isLoading} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

