/**
 * Brand Workspace — website / storefront importer entry experience (Phase 2).
 *
 * Deterministic import only: the edge function reads public page markup. Nothing
 * is written to brand_profiles / product_profiles here — candidates are handed to
 * the wizard on confirm and saved by the existing step autosave.
 */
import { useState } from "react";
import { Check, Globe, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CARD, LABEL } from "@/components/brand/BrandEditors";
import {
  importBrandFromWebsite,
  importSourceLabel,
  type BrandImportCandidates,
} from "@/services/brandImport";

export interface BrandImportConfirmation {
  name: string;
  website: string;
  description: string;
  logoCandidates: string[];
  colorCandidates: string[];
  products: BrandImportCandidates["products"];
  source: BrandImportCandidates["source"];
  domain: string;
  label: string;
}

const PILL =
  "inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-200";

export default function BrandImportPanel({
  onConfirm,
  onManual,
}: {
  onConfirm: (result: BrandImportConfirmation) => void;
  onManual: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [found, setFound] = useState<BrandImportCandidates | null>(null);

  // Editable review fields.
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [pickedLogos, setPickedLogos] = useState<string[]>([]);
  const [pickedColors, setPickedColors] = useState<string[]>([]);

  const runImport = async () => {
    setBusy(true);
    setFailure(null);
    setFound(null);
    const result = await importBrandFromWebsite(url);
    setBusy(false);
    if (!result.ok) {
      setFailure("reason" in result ? result.reason : "We couldn't read this store.");
      return;
    }
    setFound(result);
    setName(result.storeName);
    setWebsite(result.url);
    setDescription(result.description);
    setPickedLogos(result.logoCandidates.slice(0, 1));
    setPickedColors(result.colorCandidates.slice(0, 4));
  };

  if (busy) {
    return (
      <div className={CARD}>
        <p className={LABEL}>Analyzing your brand…</p>
        <div className="mt-5 flex items-center gap-3 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          <span className="text-sm">Reading your storefront. No data is saved yet.</span>
        </div>
      </div>
    );
  }

  if (found) {
    const label = importSourceLabel(found);
    return (
      <div className={CARD}>
        <p className={LABEL}>We found your brand</p>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-cyan-200/80">{label}</p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {[
            found.storeName ? "Name" : null,
            `${found.counts.logos} logo${found.counts.logos === 1 ? "" : "s"}`,
            `${found.counts.colors} color${found.counts.colors === 1 ? "" : "s"}`,
            `${found.counts.products} product${found.counts.products === 1 ? "" : "s"}`,
          ]
            .filter(Boolean)
            .map((entry) => (
              <li key={String(entry)} className={PILL}>
                <Check className="h-3.5 w-3.5 text-cyan-300" /> {entry}
              </li>
            ))}
        </ul>

        <div className="mt-6 space-y-4">
          <div>
            <p className={LABEL}>Brand name</p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 border-white/10 bg-black/30 text-white"
            />
          </div>
          <div>
            <p className={LABEL}>Website</p>
            <Input
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              className="mt-2 border-white/10 bg-black/30 text-white"
            />
          </div>
          <div>
            <p className={LABEL}>Description</p>
            <Textarea
              value={description}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 border-white/10 bg-black/30 text-white"
            />
          </div>
        </div>

        {found.logoCandidates.length ? (
          <div className="mt-6">
            <p className={LABEL}>Logos found — pick what's yours</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {found.logoCandidates.map((logo) => {
                const selected = pickedLogos.includes(logo);
                return (
                  <button
                    key={logo}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setPickedLogos((current) =>
                        current.includes(logo)
                          ? current.filter((entry) => entry !== logo)
                          : [...current, logo],
                      )
                    }
                    className={`h-20 w-20 overflow-hidden rounded-xl border bg-black/40 ${
                      selected ? "border-cyan-300" : "border-white/10"
                    }`}
                  >
                    <img src={logo} alt="Logo candidate" className="h-full w-full object-contain" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {found.colorCandidates.length ? (
          <div className="mt-6">
            <p className={LABEL}>Colors found</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {found.colorCandidates.map((color) => {
                const selected = pickedColors.includes(color);
                return (
                  <button
                    key={color}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setPickedColors((current) =>
                        current.includes(color)
                          ? current.filter((entry) => entry !== color)
                          : [...current, color],
                      )
                    }
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] ${
                      selected ? "border-cyan-300 text-white" : "border-white/10 text-slate-400"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: color }}
                    />
                    {color}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-xs text-slate-500">
          Nothing is saved until you continue. You review everything before it's saved.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() =>
              onConfirm({
                name: name.trim(),
                website: website.trim(),
                description: description.trim(),
                logoCandidates: pickedLogos,
                colorCandidates: pickedColors,
                products: found.products,
                source: found.source,
                domain: found.domain,
                label,
              })
            }
            disabled={!name.trim()}
            className="rounded-full bg-cyan-300 px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
          >
            Use this brand
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFound(null)}
            className="rounded-full border-white/12 bg-white/[0.03] px-4 text-[11px] uppercase tracking-[0.16em]"
          >
            Try another URL
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <p className={LABEL}>Import your brand in seconds.</p>
      <h2 className="mt-2 text-2xl">BUILD YOUR BRAND ONCE. FUSE remembers the rest.</h2>
      <p className="mt-2 text-sm text-slate-400">
        We'll find your logo, colors and products. You review everything before it's saved.
      </p>

      <form
        className="mt-5 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) void runImport();
        }}
      >
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="yourstore.com"
            aria-label="Your website or store URL"
            className="border-white/10 bg-black/30 pl-9 text-white"
          />
        </div>
        <Button
          type="submit"
          disabled={!url.trim()}
          className="rounded-full bg-cyan-300 px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          <Sparkles className="h-3.5 w-3.5" /> Import my brand
        </Button>
      </form>

      {failure ? (
        <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/5 px-4 py-3">
          <p className="text-sm text-rose-100">
            We couldn't read this store. Check the URL or build your brand manually.
          </p>
          <p className="mt-1 text-xs text-rose-200/70">{failure}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void runImport()}
              disabled={!url.trim()}
              className="rounded-full border-white/12 bg-white/[0.03] px-4 text-[11px] uppercase tracking-[0.16em]"
            >
              Try again
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onManual}
              className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-300"
            >
              Build manually
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.28em] text-slate-600">— or —</p>
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              onClick={onManual}
              className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-400"
            >
              I don't have a website
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
