/**
 * FUSE Brand Workspace — Phase 7 review screen.
 * Pure presentation: every value comes from SAVED brand/product/avatar data and
 * the checklist is driven entirely by the existing deriveBrandReadiness result.
 * No readiness rules, billing or generation logic live here.
 */

import { Check, Globe, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD, LABEL } from "@/components/brand/BrandEditors";
import { CastPortrait } from "@/components/cast/CastLibrary";
import type { BrandProfile, BrandVisualStyle } from "@/services/brandProfiles";
import type { ProductProfile } from "@/services/productProfiles";
import type { AvatarProfile } from "@/services/avatarProfiles";
import type { BrandReadiness, ReadinessStatus } from "@/lib/brandReadiness";

type ColorRole = string;

export const STATUS_MARK: Record<ReadinessStatus, { mark: string; className: string }> = {
  complete: { mark: "✓ COMPLETE", className: "border-cyan-300/50 bg-cyan-300/10 text-cyan-100" },
  "recommended-missing": { mark: "⚠ RECOMMENDED", className: "border-amber-300/40 bg-amber-300/10 text-amber-100" },
  "optional-missing": { mark: "○ OPTIONAL", className: "border-white/10 bg-white/[0.03] text-slate-400" },
  "required-missing": { mark: "✕ REQUIRED", className: "border-rose-400/40 bg-rose-400/10 text-rose-100" },
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "FU"
  );
}

function Block({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>{title}</p>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-[10px] uppercase tracking-[0.16em] text-cyan-200 hover:text-cyan-100"
          >
            {action}
          </button>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Thumb({ url, alt }: { url: string; alt: string }) {
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="h-16 w-16 rounded-xl border border-white/10 bg-black/40 object-cover"
    />
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default function BrandReviewStep({
  brand,
  products,
  cast,
  style,
  colorRoles,
  readiness,
  onJump,
  onSubmit,
  submitting,
}: {
  brand: BrandProfile | null;
  products: ProductProfile[];
  cast: AvatarProfile[];
  style: BrandVisualStyle | null;
  colorRoles: Record<string, ColorRole>;
  readiness: BrandReadiness;
  onJump: (step: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const name = brand?.name?.trim() || "Your brand";
  const logo = brand?.primary_logo_url ?? null;
  const colors = brand?.colors ?? [];
  const productThumbs = products
    .map((entry) => ({ id: entry.id, name: entry.name, url: entry.assets?.[0]?.url ?? null }))
    .filter((entry) => !!entry.url)
    .slice(0, 4);
  const signals = style?.styleSignals?.length ? style.styleSignals : (style?.tags ?? []);
  const tone = style?.tone?.trim() ?? "";
  const referenceBrands = style?.referenceBrands ?? [];
  const hasLinks = !!style?.instagram || !!style?.pinterest;

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className={LABEL}>Step 6 — Review</p>
        <h2 className="mt-2 font-display text-2xl tracking-[-0.02em]">REVIEW YOUR BRAND</h2>
        <p className="mt-2 text-sm text-slate-400">This is what FUSE will remember for every campaign.</p>

        {/* Identity header */}
        <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-cyan-300/10 to-transparent p-4">
          {logo ? (
            <img
              src={logo}
              alt={`${name} logo`}
              className="h-16 w-16 rounded-2xl border border-white/10 bg-black/40 object-contain p-1.5"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/40 font-display text-xl text-cyan-100">
              {initials(name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-xl tracking-[-0.02em]">{name}</p>
            {brand?.website ? (
              <a
                href={brand.website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-cyan-200 hover:text-cyan-100"
              >
                <Globe className="h-3.5 w-3.5" /> {brand.website.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onJump(1)}
                className="mt-1 text-xs text-slate-500 hover:text-slate-300"
              >
                Add a website
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {/* Colors */}
          <Block
            title="Colors"
            action={colors.length ? undefined : "Add colors"}
            onAction={colors.length ? undefined : () => onJump(2)}
          >
            {colors.length ? (
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <div key={color} className="flex items-center gap-2">
                    <span
                      className="h-8 w-8 rounded-lg border border-white/15"
                      style={{ backgroundColor: color }}
                      aria-label={color}
                    />
                    <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                      {colorRoles[color] ? colorRoles[color] : color}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No palette saved yet.</p>
            )}
          </Block>

          {/* Products */}
          <Block
            title={products.length ? `Products · ${products.length}` : "Products"}
            action={products.length ? undefined : "Add products"}
            onAction={products.length ? undefined : () => onJump(3)}
          >
            {products.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {productThumbs.map((entry) => (
                  <Thumb key={entry.id} url={entry.url as string} alt={entry.name} />
                ))}
                {products.length > productThumbs.length ? (
                  <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300">
                    +{products.length - productThumbs.length}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No products saved yet.</p>
            )}
          </Block>

          {/* Cast */}
          <Block
            title={cast.length ? `Cast · ${cast.length}` : "Cast"}
            action={cast.length ? undefined : "Add cast"}
            onAction={cast.length ? undefined : () => onJump(4)}
          >
            {cast.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {cast.slice(0, 2).map((avatar) => (
                  <div key={avatar.id} className="w-20">
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <CastPortrait avatar={avatar} />
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-400">{avatar.name}</p>
                  </div>
                ))}
                {cast.length > 2 ? (
                  <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-xs text-slate-300">
                    +{cast.length - 2}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No cast saved — plenty of campaigns need no person.</p>
            )}
          </Block>

          {/* Creative DNA */}
          <Block
            title="Creative DNA"
            action={signals.length || tone || referenceBrands.length ? undefined : "Add creative DNA"}
            onAction={signals.length || tone || referenceBrands.length ? undefined : () => onJump(5)}
          >
            {signals.length || tone || referenceBrands.length ? (
              <div className="space-y-2">
                {signals.length ? <Chips items={signals.slice(0, 8)} /> : null}
                {tone ? <p className="line-clamp-3 text-xs text-slate-400">{tone}</p> : null}
                {referenceBrands.length ? (
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                    Inspiration · {referenceBrands.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No style signals saved yet.</p>
            )}
          </Block>

          {/* References */}
          {hasLinks || (style?.referenceImages?.length ?? 0) > 0 ? (
            <Block title="References">
              <div className="flex flex-wrap items-center gap-2">
                {style?.instagram ? (
                  <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100">
                    Instagram ✓
                  </span>
                ) : null}
                {style?.pinterest ? (
                  <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100">
                    Pinterest ✓
                  </span>
                ) : null}
                {(style?.referenceImages ?? []).slice(0, 3).map((url) => (
                  <Thumb key={url} url={url} alt="Visual reference" />
                ))}
              </div>
            </Block>
          ) : null}
        </div>
      </div>

      {/* FINISH — required-only gate, optional enhancements never block */}
      <div className={CARD}>
        {readiness.ready ? (
          <>
            <h3 className="font-display text-2xl tracking-[-0.02em]">{name.toUpperCase()} IS SET UP.</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-cyan-300" /> Brand name
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-cyan-300" /> Identity
              </li>
            </ul>
          </>
        ) : (
          <>
            <h3 className="font-display text-2xl tracking-[-0.02em]">ALMOST THERE.</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {readiness.sections
                .flatMap((section) => section.items.map((item) => ({ item, step: section.step })))
                .filter((entry) => entry.item.level === "required" && !entry.item.done)
                .map((entry) => (
                  <li key={entry.item.key} className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">✕ {entry.item.label}</span>
                    <button
                      type="button"
                      onClick={() => onJump(entry.step)}
                      className="text-[10px] uppercase tracking-[0.16em] text-cyan-200 hover:text-cyan-100"
                    >
                      Complete
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}

        <p className={`${LABEL} mt-6`}>Optional enhancements</p>
        <ul className="mt-3 space-y-2 text-sm">
          {OPTIONAL_ROWS.map((row) => {
            const done = row.done({ products, cast, signals, tone, referenceBrands });
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="text-slate-300">
                    {done ? "✓" : "○"} {row.label}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">{row.why}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onJump(row.step)}
                  className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-cyan-200 hover:text-cyan-100"
                >
                  {done ? "Edit" : row.cta}
                </button>
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !readiness.ready}
          className="mt-6 rounded-full bg-cyan-300 px-6 py-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {readiness.ready
            ? "Enter FUSE"
            : `Complete ${readiness.requiredMissing} required item${readiness.requiredMissing === 1 ? "" : "s"}`}
        </Button>
        <p className="mt-3 text-xs text-slate-500">Optional enhancements can be added any time — they never block you.</p>
      </div>
    </div>
  );
}

const OPTIONAL_ROWS: {
  key: string;
  label: string;
  why: string;
  cta: string;
  step: number;
  done: (ctx: {
    products: ProductProfile[];
    cast: AvatarProfile[];
    signals: string[];
    tone: string;
    referenceBrands: string[];
  }) => boolean;
}[] = [
  {
    key: "products",
    label: "Add products",
    why: "Makes compatible campaigns one-click.",
    cta: "Add products",
    step: 3,
    done: (ctx) => ctx.products.length > 0,
  },
  {
    key: "cast",
    label: "Choose cast",
    why: "Lets people-based campaigns preload a model.",
    cta: "Choose cast",
    step: 4,
    done: (ctx) => ctx.cast.length > 0,
  },
  {
    key: "dna",
    label: "Add Creative DNA",
    why: "Personalizes recommendations.",
    cta: "Add references",
    step: 5,
    done: (ctx) => ctx.signals.length > 0 || ctx.tone.trim().length > 0 || ctx.referenceBrands.length > 0,
  },
];

