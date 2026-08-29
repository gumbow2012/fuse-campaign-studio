/**
 * FUSE Brand Workspace — Phase 3 IDENTITY step (visual redesign).
 *
 * Three large logo slots (primary / secondary / inverted), Phase 2 import
 * candidates that can be assigned to any slot, live light/dark/brand-color
 * previews with soft quality warnings, and a brand-color palette with roles.
 *
 * Persistence contract (no schema migration):
 *  - brand_profiles.primary_logo_url        → PRIMARY
 *  - brand_profiles.secondary_logo_url      → SECONDARY
 *  - brand_profiles.colors (jsonb hex array)
 *  - metadata.invertedLogoUrl               → INVERTED
 *  - metadata.colorRoles { [hex]: 'primary'|'secondary'|'accent' }
 *  - metadata.noLogo / metadata.neutralPalette (Phase 1 opt-outs)
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Images,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import LibraryPickerDialog from "@/components/templates/LibraryPickerDialog";
import { useUploader } from "@/components/brand/BrandEditors";
import type { BrandImportConfirmation } from "@/components/brand/BrandImportPanel";

export type LogoSlot = "primary" | "secondary" | "inverted";
export type ColorRole = "primary" | "secondary" | "accent";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";
const TINY = "font-display text-[10px] uppercase tracking-[0.22em]";

const SLOTS: { slot: LogoSlot; title: string; hint: string }[] = [
  { slot: "primary", title: "Primary logo", hint: "Your default mark on most campaigns." },
  { slot: "secondary", title: "Secondary logo", hint: "Wordmark, lockup or compact variant." },
  { slot: "inverted", title: "Inverted logo", hint: "Best for dark/light alternate backgrounds." },
];

const NEUTRALS = ["#f8fafc", "#94a3b8", "#0f172a"];

interface LogoQuality {
  width: number;
  height: number;
  warnings: string[];
}

/** Soft quality read of a selected logo — never blocks the user. */
function useLogoQuality(url: string | null): LogoQuality | null {
  const [quality, setQuality] = useState<LogoQuality | null>(null);

  useEffect(() => {
    if (!url) {
      setQuality(null);
      return;
    }
    let alive = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!alive) return;
      const warnings: string[] = [];
      const { naturalWidth: width, naturalHeight: height } = image;
      if (width < 200 || height < 200) warnings.push("Very small source — may look soft when scaled.");
      else if (width < 512 && height < 512) warnings.push("Low resolution for large campaign formats.");
      const looksTransparent = /\.(png|svg|webp)(\?|$)/i.test(url);
      if (!looksTransparent) warnings.push("No transparency detected — a PNG/SVG cutout works better.");
      setQuality({ width, height, warnings });
    };
    image.onerror = () => {
      if (alive) setQuality(null);
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  return quality;
}

function LogoCard({
  title,
  hint,
  url,
  brandColor,
  onChange,
}: {
  title: string;
  hint: string;
  url: string | null;
  brandColor: string;
  onChange: (url: string | null) => void;
}) {
  const { busy, upload } = useUploader();
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const quality = useLogoQuality(url);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const uploaded = await upload(file);
    if (uploaded) onChange(uploaded);
  };

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`${TINY} text-cyan-200/80`}>{title}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        {url ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /> : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files?.[0]);
        }}
        className={`mt-3 flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-dashed transition ${
          dragging ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/15 bg-black/40"
        }`}
      >
        {url ? (
          <img src={url} alt={title} className="h-full w-full object-contain p-3" />
        ) : busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
        ) : (
          <p className="px-4 text-center text-[11px] uppercase tracking-[0.16em] text-slate-500">
            Drag &amp; drop
            <br />
            or upload below
          </p>
        )}
      </div>

      {url ? (
        <div className="mt-3">
          <p className={`${TINY} text-slate-500`}>Looks good on</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { key: "light", bg: "#ffffff", label: "Light" },
              { key: "dark", bg: "#080b12", label: "Dark" },
              { key: "brand", bg: brandColor, label: "Brand" },
            ].map((swatch) => (
              <div key={swatch.key} className="overflow-hidden rounded-xl border border-white/10">
                <div
                  className="flex h-14 items-center justify-center"
                  style={{ backgroundColor: swatch.bg }}
                >
                  <img src={url} alt={`${title} on ${swatch.label}`} className="max-h-10 max-w-[80%] object-contain" />
                </div>
                <p className="bg-black/40 px-2 py-1 text-center text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  {swatch.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {quality?.warnings.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200" />
          <div className="text-[11px] leading-5 text-amber-100/90">
            {quality.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p className="text-amber-100/50">
              {quality.width}×{quality.height}px — you can continue anyway.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              await handleFile(file);
            }}
          />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-200 hover:border-cyan-300/40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {url ? "Replace" : "Upload"}
          </span>
        </label>

        <LibraryPickerDialog
          kinds={["logo"]}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(asset) => {
            onChange(asset.url);
            setPickerOpen(false);
          }}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-200 hover:border-cyan-300/40"
            >
              <Images className="h-3.5 w-3.5" /> Library
            </button>
          }
        />

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
  );
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#*/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return null;
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  return `#${full.toLowerCase()}`;
}

export default function BrandIdentityStep({
  imported,
  primaryLogo,
  secondaryLogo,
  invertedLogo,
  colors,
  colorRoles,
  noLogo,
  neutralPalette,
  setPrimaryLogo,
  setSecondaryLogo,
  setInvertedLogo,
  setColors,
  setColorRoles,
  setNoLogo,
  setNeutralPalette,
}: {
  imported: BrandImportConfirmation | null;
  primaryLogo: string | null;
  secondaryLogo: string | null;
  invertedLogo: string | null;
  colors: string[];
  colorRoles: Record<string, ColorRole>;
  noLogo: boolean;
  neutralPalette: boolean;
  setPrimaryLogo: (url: string | null) => void;
  setSecondaryLogo: (url: string | null) => void;
  setInvertedLogo: (url: string | null) => void;
  setColors: (next: string[]) => void;
  setColorRoles: (next: Record<string, ColorRole>) => void;
  setNoLogo: (next: boolean) => void;
  setNeutralPalette: (next: boolean) => void;
}) {
  const [colorDraft, setColorDraft] = useState("#22d3ee");
  const [hexDraft, setHexDraft] = useState<{ index: number; value: string } | null>(null);

  const setters: Record<LogoSlot, (url: string | null) => void> = {
    primary: setPrimaryLogo,
    secondary: setSecondaryLogo,
    inverted: setInvertedLogo,
  };
  const values: Record<LogoSlot, string | null> = {
    primary: primaryLogo,
    secondary: secondaryLogo,
    inverted: invertedLogo,
  };

  const palette = neutralPalette && !colors.length ? NEUTRALS : colors;
  const brandColor = palette[0] ?? "#0f172a";
  const accent = palette[1] ?? palette[0] ?? "#22d3ee";

  const assignColor = (hex: string, role: ColorRole) => {
    const next = { ...colorRoles };
    if (next[hex] === role) delete next[hex];
    else next[hex] = role;
    setColorRoles(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= colors.length) return;
    const next = [...colors];
    [next[index], next[target]] = [next[target], next[index]];
    setColors(next);
  };

  const addColor = (hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    if (colors.includes(normalized)) return;
    setColors([...colors, normalized]);
  };

  const removeColor = (hex: string) => {
    setColors(colors.filter((entry) => entry !== hex));
    const next = { ...colorRoles };
    delete next[hex];
    setColorRoles(next);
  };

  const importedLogos = imported?.logoCandidates ?? [];
  const importedColors = (imported?.colorCandidates ?? []).filter((hex) => !colors.includes(hex));

  return (
    <div className="space-y-5">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
        <p className={LABEL}>Step 2 — Identity</p>
        <h2 className="mt-2 font-display text-2xl uppercase tracking-[-0.01em]">Your identity</h2>
        <p className="mt-2 text-sm text-slate-400">
          These assets follow your brand into every FUSE campaign.
        </p>

        {importedLogos.length ? (
          <div className="mt-5 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.05] p-4">
            <p className={`${TINY} text-cyan-200/90`}>We found these</p>
            <p className="mt-1 text-xs text-slate-400">
              {imported?.label ?? "Imported from your storefront"} — assign one to a slot, or upload your own.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {importedLogos.map((logo) => (
                <div key={logo} className="rounded-2xl border border-white/10 bg-black/40 p-2">
                  <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
                    <img src={logo} alt="Imported logo candidate" className="max-h-16 max-w-[85%] object-contain" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SLOTS.map((entry) => {
                      const active = values[entry.slot] === logo;
                      return (
                        <button
                          key={entry.slot}
                          type="button"
                          onClick={() => setters[entry.slot](active ? null : logo)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] transition ${
                            active
                              ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                              : "border-white/12 text-slate-400 hover:text-white"
                          }`}
                        >
                          {entry.slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {SLOTS.map((entry) => (
            <LogoCard
              key={entry.slot}
              title={entry.title}
              hint={entry.hint}
              url={values[entry.slot]}
              brandColor={brandColor}
              onChange={setters[entry.slot]}
            />
          ))}
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
          <input
            type="checkbox"
            checked={noLogo}
            onChange={(event) => setNoLogo(event.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-300"
          />
          No logo yet
        </label>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
        <p className={LABEL}>Brand colors</p>
        <p className="mt-1 text-xs text-slate-500">
          Order them the way you'd rank them — the first color leads your campaigns.
        </p>

        {importedColors.length ? (
          <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.05] p-4">
            <p className={`${TINY} text-cyan-200/90`}>Colors found on your site</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {importedColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => addColor(hex)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-3 py-1.5 text-[11px] text-slate-200 hover:border-cyan-300/40"
                >
                  <span className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: hex }} />
                  {hex}
                  <Plus className="h-3 w-3 text-cyan-200" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {colors.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colors.map((hex, index) => (
              <div key={`${hex}-${index}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="h-16 w-full" style={{ backgroundColor: hex }} />
                <div className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={hex}
                      onChange={(event) => {
                        const next = [...colors];
                        const normalized = normalizeHex(event.target.value);
                        if (!normalized) return;
                        const role = colorRoles[hex];
                        next[index] = normalized;
                        setColors(next);
                        if (role) {
                          const roles = { ...colorRoles };
                          delete roles[hex];
                          roles[normalized] = role;
                          setColorRoles(roles);
                        }
                      }}
                      className="h-7 w-9 cursor-pointer rounded border border-white/12 bg-black/30"
                      aria-label={`Pick a color for slot ${index + 1}`}
                    />
                    <input
                      value={hexDraft?.index === index ? hexDraft.value : hex}
                      onChange={(event) => setHexDraft({ index, value: event.target.value })}
                      onBlur={() => {
                        if (hexDraft?.index !== index) return;
                        const normalized = normalizeHex(hexDraft.value);
                        setHexDraft(null);
                        if (!normalized || normalized === hex) return;
                        const next = [...colors];
                        next[index] = normalized;
                        setColors(next);
                        const role = colorRoles[hex];
                        if (role) {
                          const roles = { ...colorRoles };
                          delete roles[hex];
                          roles[normalized] = role;
                          setColorRoles(roles);
                        }
                      }}
                      className="h-7 w-full rounded border border-white/12 bg-black/40 px-2 font-mono text-[11px] text-slate-200"
                      aria-label={`Hex value for slot ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      aria-label="Move color up"
                      className="text-slate-500 hover:text-white"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      aria-label="Move color down"
                      className="text-slate-500 hover:text-white"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeColor(hex)}
                      aria-label={`Remove ${hex}`}
                      className="text-slate-500 hover:text-rose-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["primary", "secondary", "accent"] as ColorRole[]).map((role) => {
                      const active = colorRoles[hex] === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => assignColor(hex, role)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] transition ${
                            active
                              ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
                              : "border-white/12 text-slate-400 hover:text-white"
                          }`}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            No colors yet — add one below, or use a neutral palette.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={colorDraft}
            onChange={(event) => setColorDraft(event.target.value)}
            className="h-9 w-11 cursor-pointer rounded border border-white/12 bg-black/30"
            aria-label="Pick a new brand color"
          />
          <input
            value={colorDraft}
            onChange={(event) => setColorDraft(event.target.value)}
            className="h-9 w-28 rounded border border-white/12 bg-black/40 px-2 font-mono text-[11px] text-slate-200"
            aria-label="New brand color hex"
          />
          <button
            type="button"
            onClick={() => addColor(colorDraft)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 text-[11px] uppercase tracking-[0.16em] text-slate-200 hover:border-cyan-300/40"
          >
            <Plus className="h-3.5 w-3.5" /> Add color
          </button>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
          <input
            type="checkbox"
            checked={neutralPalette}
            onChange={(event) => setNeutralPalette(event.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-300"
          />
          Use neutral palette
        </label>

        <div className="mt-5">
          <p className={`${TINY} text-slate-500`}>Live brand preview</p>
          <div
            className="mt-2 overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: brandColor }}
          >
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                {primaryLogo || invertedLogo ? (
                  <img
                    src={invertedLogo ?? primaryLogo ?? ""}
                    alt="Brand preview logo"
                    className="max-h-10 max-w-[160px] object-contain"
                  />
                ) : (
                  <p className="font-display text-lg uppercase tracking-[0.12em] text-white/90">
                    Your brand
                  </p>
                )}
                <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-white/70">
                  Drop campaign · FUSE
                </p>
              </div>
              <span
                className="rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950"
                style={{ backgroundColor: accent }}
              >
                Shop now
              </span>
            </div>
            <div className="flex">
              {palette.map((hex) => (
                <div key={`bar-${hex}`} className="h-2 flex-1" style={{ backgroundColor: hex }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
