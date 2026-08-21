/**
 * CAMPAIGN PHOTOGRAPHY PROFILE — the look/feel reference set and its profile.
 *
 * These references describe HOW the product should be PHOTOGRAPHED and nothing
 * else: they contribute ZERO product geometry, stone layout, setting, components
 * or identity — that stays locked in the Master Product Lock.
 *
 * The profile is analysis only. It is stored with the project and is not wired
 * into generation yet.
 */

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  CAMPAIGN_PHOTOGRAPHY_FIELDS,
  campaignPhotographySummary,
  type CampaignPhotographyProfile,
} from "@/services/campaignPhotography";

export type PhotographyStatus = "idle" | "uploading" | "analyzing" | "ready" | "stale" | "error";

export function CampaignPhotographyPanel({
  referenceUrls,
  profile,
  status,
  error,
  onAdd,
  onRemove,
  onAnalyze,
}: {
  referenceUrls: string[];
  profile: CampaignPhotographyProfile | null;
  status: PhotographyStatus;
  error?: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (url: string) => void;
  onAnalyze: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const busy = status === "uploading" || status === "analyzing";
  const summary = campaignPhotographySummary(profile);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/60">
            Campaign photography look
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">
            Reference images for HOW the product is shot — lens, camera placement, lighting,
            surface, depth of field. They never change the product itself.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) onAdd(files);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="h-7 rounded-lg px-2 text-[10px]"
          >
            {status === "uploading" ? "Uploading…" : "Add look refs"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !referenceUrls.length}
            onClick={onAnalyze}
            className="h-7 rounded-lg px-2 text-[10px]"
          >
            {status === "analyzing" ? "Reading look…" : profile ? "Re-read look" : "Read look"}
          </Button>
        </div>
      </div>

      {referenceUrls.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {referenceUrls.map((url) => (
            <div key={url} className="relative">
              <img
                src={url}
                alt="Campaign photography reference"
                loading="lazy"
                className="h-16 w-16 rounded-lg border border-white/10 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(url)}
                aria-label="Remove photography reference"
                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-white/20 bg-black/80 text-[9px] text-foreground/70"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-foreground/40">
          No look references yet — the campaign look stays whatever the source frame implies.
        </p>
      )}

      {status === "stale" && profile ? (
        <p className="mt-2 text-[10px] text-amber-200/80">
          Look references changed — read the look again to refresh the profile.
        </p>
      ) : null}
      {status === "error" && error ? (
        <p className="mt-2 text-[10px] text-red-300/80">{error}</p>
      ) : null}

      {profile ? (
        <div className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-black/40 p-2">
          <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">
            Photography profile {summary ? `· ${summary}` : ""}
          </p>
          <dl className="grid gap-1 sm:grid-cols-2">
            {CAMPAIGN_PHOTOGRAPHY_FIELDS.map(({ key, label }) => {
              const value = profile[key];
              if (!value) return null;
              return (
                <div key={key} className="rounded-lg bg-white/[0.03] px-2 py-1">
                  <dt className="text-[9px] uppercase tracking-[0.1em] text-foreground/45">
                    {label}
                  </dt>
                  <dd className="text-[10px] leading-relaxed text-foreground/75">{value}</dd>
                </div>
              );
            })}
          </dl>
          <p className="text-[9px] text-foreground/40">
            Photography authority only — no geometry, stone layout, setting or product identity.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default CampaignPhotographyPanel;
