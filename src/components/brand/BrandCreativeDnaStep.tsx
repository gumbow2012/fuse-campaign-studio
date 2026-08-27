/**
 * Phase 6 — CREATIVE DNA (onboarding step 5).
 *
 * Frontend-only. Everything here is persisted by the parent into
 * brand_profiles.metadata.visualStyle. Taste references (Instagram, Pinterest,
 * uploaded images, reference brands) lead; style signals and tone support them.
 *
 * Rules honoured here:
 * - IG / Pinterest links are only VALIDATED (domain + URL shape) and stored.
 *   We never fetch behind a login, never fabricate a thumbnail, and never claim
 *   a private page was imported.
 * - Tone suggestions APPEND to the user's text — they never overwrite it.
 */

import { useMemo, useState } from "react";
import { Check, Images, Instagram, Loader2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CARD, LABEL, useUploader } from "@/components/brand/BrandEditors";
import { cn } from "@/lib/utils";

export interface CreativeDnaValue {
  styleSignals: string[];
  tone: string;
  instagram: string | null;
  pinterest: string | null;
  referenceBrands: string[];
  referenceImages: string[];
  notes: string;
}

const STYLE_SIGNALS: { label: string; swatch: string }[] = [
  { label: "Streetwear", swatch: "from-zinc-700 via-zinc-900 to-black" },
  { label: "Editorial", swatch: "from-stone-200 via-stone-400 to-stone-700" },
  { label: "High Fashion", swatch: "from-neutral-100 via-neutral-500 to-neutral-900" },
  { label: "Luxury", swatch: "from-amber-200 via-amber-600 to-yellow-900" },
  { label: "Grunge", swatch: "from-stone-600 via-stone-800 to-neutral-950" },
  { label: "Y2K", swatch: "from-fuchsia-300 via-sky-300 to-indigo-500" },
  { label: "Hard Flash", swatch: "from-white via-slate-300 to-slate-800" },
  { label: "Film Grain", swatch: "from-orange-200 via-stone-500 to-stone-900" },
  { label: "CCTV", swatch: "from-emerald-300 via-emerald-800 to-black" },
  { label: "Camcorder", swatch: "from-cyan-200 via-teal-700 to-slate-900" },
  { label: "Paparazzi", swatch: "from-yellow-100 via-slate-400 to-slate-950" },
  { label: "Studio Clean", swatch: "from-white via-slate-200 to-slate-500" },
  { label: "Cinematic", swatch: "from-orange-300 via-rose-700 to-slate-900" },
  { label: "Night Exterior", swatch: "from-indigo-400 via-blue-900 to-black" },
  { label: "Industrial", swatch: "from-slate-400 via-slate-700 to-zinc-950" },
  { label: "Minimal", swatch: "from-slate-100 via-slate-300 to-slate-600" },
  { label: "Surreal", swatch: "from-violet-300 via-purple-700 to-slate-950" },
];

const REFERENCE_BRANDS = [
  "Hellstar",
  "Godspeed",
  "Denim Tears",
  "Supreme",
  "Chrome Hearts",
  "Broken Planet",
  "Balenciaga",
  "Rick Owens",
  "Stüssy",
  "ERL",
  "Gallery Dept.",
  "Corteiz",
];

/** Tone phrases suggested from the chosen signals / brands. */
const TONE_HINTS: Record<string, string> = {
  Streetwear: "street-cast energy, worn-in textures",
  Editorial: "editorial framing, confident negative space",
  "High Fashion": "sharp tailoring, cold elegance",
  Luxury: "quiet luxury, deep blacks and metal",
  Grunge: "grain, dust, imperfect edges",
  Y2K: "early-2000s digital shine, chrome text",
  "Hard Flash": "hard direct flash, blown highlights",
  "Film Grain": "35mm grain, soft halation",
  CCTV: "surveillance angles, timestamp overlay",
  Camcorder: "handheld camcorder feel, scan lines",
  Paparazzi: "caught-off-guard paparazzi moment",
  "Studio Clean": "clean studio sweep, controlled light",
  Cinematic: "widescreen cinematic grade",
  "Night Exterior": "cold night streets, wet asphalt reflections",
  Industrial: "concrete, steel, utilitarian space",
  Minimal: "minimal set, one subject, nothing extra",
  Surreal: "dreamlike scale, impossible light",
  "Chrome Hearts": "chrome details, gothic hardware",
  "Denim Tears": "heritage denim, americana weight",
  "Rick Owens": "brutalist silhouettes, monochrome",
  Corteiz: "raw guerrilla street documentation",
  Hellstar: "hot flash, distressed graphics",
};

const IG_HOSTS = ["instagram.com", "www.instagram.com", "instagr.am", "www.instagr.am"];
const PIN_HOSTS = [
  "pinterest.com",
  "www.pinterest.com",
  "pin.it",
  "www.pin.it",
];

export type LinkValidation =
  | { ok: true; url: string; label: string }
  | { ok: false; message: string };

/** Domain + URL-structure validation only — no fetching, no login bypass. */
export function validateSocialLink(raw: string, kind: "instagram" | "pinterest"): LinkValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "Paste a link first." };
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: "That doesn't look like a valid URL." };
  }
  const host = url.hostname.toLowerCase();
  const hosts = kind === "instagram" ? IG_HOSTS : PIN_HOSTS;
  const allowed =
    hosts.includes(host) ||
    (kind === "pinterest" && /(^|\.)pinterest\.[a-z.]{2,6}$/.test(host));
  if (!allowed) {
    return {
      ok: false,
      message: kind === "instagram" ? "Use an instagram.com link." : "Use a pinterest.com link.",
    };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") {
    return { ok: false, message: "Link to a profile, board or post — not just the homepage." };
  }
  const label = kind === "instagram" && /^\/[^/]+$/.test(path) ? `@${path.slice(1)}` : path;
  return { ok: true, url: `${url.origin}${path}${url.search ? "" : ""}`, label };
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition",
        active
          ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

function LinkField({
  kind,
  value,
  onChange,
  icon,
  label,
  placeholder,
}: {
  kind: "instagram" | "pinterest";
  value: string | null;
  onChange: (next: string | null) => void;
  icon: React.ReactNode;
  label: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chip = value ? validateSocialLink(value, kind) : null;

  const save = () => {
    const result = validateSocialLink(draft, kind);
    if (result.ok === false) {
      setError(result.message);
      return;
    }

    setError(null);
    setDraft("");
    onChange(result.url);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
        {icon} {label}
      </p>
      {value && chip?.ok ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 text-[11px] text-cyan-100">
            <Check className="h-3.5 w-3.5" />
            {chip.label}
          </span>
          <a
            href={value}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] uppercase tracking-[0.16em] text-slate-400 underline-offset-4 hover:text-white hover:underline"
          >
            Open
          </a>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] uppercase tracking-[0.16em] text-slate-500 hover:text-rose-200"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
            }}
            placeholder={placeholder}
            className="h-9 min-w-[220px] flex-1 border-white/10 bg-black/40 text-white"
          />
          <Button
            type="button"
            variant="outline"
            onClick={save}
            className="h-9 rounded-full border-white/12 bg-white/[0.04] px-4 text-[11px] uppercase tracking-[0.16em]"
          >
            Save link
          </Button>
        </div>
      )}
      {error ? <p className="mt-2 text-[11px] text-rose-300">{error}</p> : null}
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        We store the link as a taste reference. Private or login-gated pages are never fetched.
      </p>
    </div>
  );
}

export default function BrandCreativeDnaStep({
  value,
  onChange,
}: {
  value: CreativeDnaValue;
  onChange: (patch: Partial<CreativeDnaValue>) => void;
}) {
  const { busy, upload } = useUploader();
  const [brandDraft, setBrandDraft] = useState("");

  const toggleSignal = (signal: string) =>
    onChange({
      styleSignals: value.styleSignals.includes(signal)
        ? value.styleSignals.filter((entry) => entry !== signal)
        : [...value.styleSignals, signal],
    });

  const toggleBrand = (name: string) =>
    onChange({
      referenceBrands: value.referenceBrands.includes(name)
        ? value.referenceBrands.filter((entry) => entry !== name)
        : [...value.referenceBrands, name],
    });

  /** Suggestions derived from the current selection; APPEND only. */
  const suggestions = useMemo(() => {
    const source = [...value.referenceBrands, ...value.styleSignals];
    const phrases = source.map((key) => TONE_HINTS[key]).filter(Boolean) as string[];
    const lower = value.tone.toLowerCase();
    return Array.from(new Set(phrases)).filter((phrase) => !lower.includes(phrase.toLowerCase())).slice(0, 6);
  }, [value.referenceBrands, value.styleSignals, value.tone]);

  const appendTone = (phrase: string) => {
    const current = value.tone.trimEnd();
    const joiner = !current ? "" : /[,.;]$/.test(current) ? " " : ", ";
    onChange({ tone: `${current}${joiner}${phrase}` });
  };

  const brandOptions = Array.from(new Set([...REFERENCE_BRANDS, ...value.referenceBrands]));

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className={LABEL}>Step 5 — Creative DNA (recommended)</p>
        <h2 className="mt-2 font-display text-2xl tracking-[-0.02em]">CREATIVE DNA</h2>
        <p className="mt-2 text-sm text-slate-400">Show FUSE what your brand should feel like.</p>
      </div>

      {/* 1 — TASTE REFERENCES (primary) */}
      <div className={CARD}>
        <p className={LABEL}>Taste references</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <LinkField
            kind="instagram"
            label="Instagram"
            icon={<Instagram className="h-3.5 w-3.5 text-cyan-200" />}
            placeholder="instagram.com/yourbrand"
            value={value.instagram}
            onChange={(next) => onChange({ instagram: next })}
          />
          <LinkField
            kind="pinterest"
            label="Pinterest"
            icon={<Images className="h-3.5 w-3.5 text-cyan-200" />}
            placeholder="pinterest.com/you/board"
            value={value.pinterest}
            onChange={(next) => onChange({ pinterest: next })}
          />
        </div>

        <div className="mt-4">
          <p className={LABEL}>Visual references</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {value.referenceImages.map((url, index) => (
              <span key={`${url}-${index}`} className="relative">
                <img
                  src={url}
                  alt={`Visual reference ${index + 1}`}
                  loading="lazy"
                  className="h-20 w-20 rounded-xl border border-white/10 object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove reference"
                  onClick={() =>
                    onChange({ referenceImages: value.referenceImages.filter((_, i) => i !== index) })
                  }
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
                multiple
                className="hidden"
                onChange={async (event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  const urls: string[] = [];
                  for (const file of files) {
                    const url = await upload(file);
                    if (url) urls.push(url);
                  }
                  if (urls.length) onChange({ referenceImages: [...value.referenceImages, ...urls] });
                }}
              />
              <span className="inline-flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-[9px] uppercase tracking-[0.16em] text-slate-400">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Add images
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4">
          <p className={LABEL}>Reference brands</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Inspiration signals only — FUSE never copies another brand's logos or artwork.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {brandOptions.map((name) => (
              <Chip
                key={name}
                active={value.referenceBrands.includes(name)}
                onClick={() => toggleBrand(name)}
              >
                {name}
              </Chip>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={brandDraft}
              onChange={(event) => setBrandDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const name = brandDraft.trim();
                if (!name) return;
                if (!value.referenceBrands.includes(name)) {
                  onChange({ referenceBrands: [...value.referenceBrands, name] });
                }
                setBrandDraft("");
              }}
              placeholder="Add another brand"
              className="h-9 max-w-xs border-white/10 bg-black/30 text-white"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const name = brandDraft.trim();
                if (!name) return;
                if (!value.referenceBrands.includes(name)) {
                  onChange({ referenceBrands: [...value.referenceBrands, name] });
                }
                setBrandDraft("");
              }}
              className="h-9 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* 2 — STYLE SIGNALS */}
      <div className={CARD}>
        <p className={LABEL}>Style signals</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {STYLE_SIGNALS.map((signal) => {
            const active = value.styleSignals.includes(signal.label);
            return (
              <button
                key={signal.label}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSignal(signal.label)}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border p-2 text-left transition",
                  active
                    ? "border-cyan-300/50 bg-cyan-300/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25",
                )}
              >
                <span
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br",
                    signal.swatch,
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-[0.14em]",
                    active ? "text-cyan-100" : "text-slate-300",
                  )}
                >
                  {signal.label}
                </span>
                {active ? <Check className="ml-auto h-3.5 w-3.5 text-cyan-200" /> : null}
              </button>
            );
          })}
        </div>
        {value.styleSignals.filter((entry) => !STYLE_SIGNALS.some((s) => s.label === entry)).length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {value.styleSignals
              .filter((entry) => !STYLE_SIGNALS.some((s) => s.label === entry))
              .map((entry) => (
                <Chip key={entry} active onClick={() => toggleSignal(entry)}>
                  {entry} <X className="h-3 w-3" />
                </Chip>
              ))}
          </div>
        ) : null}
      </div>

      {/* 3 — TONE / MOOD */}
      <div className={CARD}>
        <p className={LABEL}>Describe your world</p>
        <Textarea
          value={value.tone}
          onChange={(event) => onChange({ tone: event.target.value })}
          rows={3}
          placeholder="Cold night streets, hard flash, chrome details, no polished studio feel…"
          className="mt-2 border-white/10 bg-black/30 text-white"
        />
        {suggestions.length ? (
          <>
            <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              Tap to add — your words stay
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((phrase) => (
                <Chip key={phrase} onClick={() => appendTone(phrase)}>
                  <Plus className="h-3 w-3" /> {phrase}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        <div className="mt-4">
          <p className={LABEL}>Notes</p>
          <Textarea
            value={value.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            rows={2}
            placeholder="Anything FUSE should always respect."
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
        </div>
      </div>
    </div>
  );
}
