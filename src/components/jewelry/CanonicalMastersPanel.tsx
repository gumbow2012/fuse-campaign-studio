/**
 * CANONICAL MASTER REFERENCE SET (§22) — UI.
 *
 * Turns the messy client evidence into a clean master reference library. The
 * planned view set is derived from the Master Product Lock's topology, never
 * from a hardcoded per-product list.
 *
 * Generating masters runs the EXISTING Nano path and therefore spends credits,
 * so it is behind an explicit button and never fires on its own.
 */

import { Button } from "@/components/ui/button";
import type {
  CanonicalMaster,
  CanonicalMasterPlanEntry,
} from "@/lib/canonicalMasterViews";

export function CanonicalMastersPanel({
  plan,
  masters,
  busy,
  disabledReason,
  onGenerate,
}: {
  plan: CanonicalMasterPlanEntry[];
  masters: Record<string, CanonicalMaster>;
  busy: boolean;
  disabledReason: string | null;
  onGenerate: () => void;
}) {
  const entries = Object.values(masters);
  const running = entries.filter((m) => m.status === "queued" || m.status === "running").length;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/60">
            Canonical product masters
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">
            Clean, neutral studio plates of this exact product, rendered from the locked product
            identity. The view set below comes from your product's own topology.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={busy || !plan.length || !!disabledReason}
          onClick={onGenerate}
          className="h-7 shrink-0 rounded-lg px-2 text-[10px]"
        >
          {busy
            ? running
              ? `Generating ${running}…`
              : "Generating…"
            : `Generate ${plan.length || ""} masters`.trim()}
        </Button>
      </div>

      {disabledReason ? (
        <p className="mt-2 text-[10px] text-amber-200/80">{disabledReason}</p>
      ) : (
        <p className="mt-2 text-[10px] text-foreground/40">
          Uses your image generation the same as a frame — it spends credits, so it only runs when
          you press the button.
        </p>
      )}

      {plan.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.map((entry) => {
            const master = masters[entry.key];
            return (
              <div
                key={entry.key}
                className="rounded-xl border border-white/10 bg-black/40 p-2"
              >
                <div className="aspect-square overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]">
                  {master?.outputUrl ? (
                    <img
                      src={master.outputUrl}
                      alt={`Canonical master — ${entry.label}`}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[9px] uppercase tracking-[0.12em] text-foreground/35">
                      {master?.status === "failed"
                        ? "Failed"
                        : master
                          ? "Rendering…"
                          : "Not generated"}
                    </div>
                  )}
                </div>
                <p className="mt-1.5 truncate text-[10px] text-foreground/75">{entry.label}</p>
                <p className="truncate text-[9px] text-foreground/40">{entry.reason}</p>
                {master?.status === "failed" && master.error ? (
                  <p className="mt-1 line-clamp-2 text-[9px] text-red-300/80">{master.error}</p>
                ) : null}
                {master?.status === "complete" ? (
                  <p className="mt-1 text-[9px] text-foreground/35">Not yet validated</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-foreground/40">
          Confirm the product first — the master views are derived from the locked product topology.
        </p>
      )}
    </div>
  );
}

export default CanonicalMastersPanel;
