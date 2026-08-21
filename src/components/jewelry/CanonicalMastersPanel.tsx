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
  CanonicalComponentPlanEntry,
  CanonicalMaster,
  CanonicalMasterPlanEntry,
} from "@/lib/canonicalMasterViews";

export function CanonicalMastersPanel({
  plan,
  componentPlan = [],
  masters,
  busy,
  disabledReason,
  onGenerate,
  onGenerateComponent,
  onValidate,
}: {
  plan: CanonicalMasterPlanEntry[];
  /** Components the locked topology actually contains (§24). */
  componentPlan?: CanonicalComponentPlanEntry[];
  masters: Record<string, CanonicalMaster>;
  busy: boolean;
  disabledReason: string | null;
  onGenerate: () => void;
  /** Explicit per-component master generation (§24) — user-triggered only. */
  onGenerateComponent?: (componentId: string) => void;
  /** Analysis-only validation of one master (§23) — never regenerates. */
  onValidate: (key: string) => void;
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
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          master.validated
                            ? "text-[9px] font-semibold tracking-[0.12em] text-emerald-200/90"
                            : "text-[9px] text-foreground/40"
                        }
                      >
                        {master.validated
                          ? "VALIDATED"
                          : master.validationState === "checking"
                            ? "Validating…"
                            : master.validation
                              ? "REJECTED — not validated"
                              : "Not yet validated"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onValidate(entry.key)}
                        disabled={master.validationState === "checking"}
                        className="rounded-md border border-white/12 px-1.5 py-0.5 text-[9px] text-foreground/75 transition-colors hover:border-cyan-200/50 hover:text-cyan-100 disabled:opacity-40"
                      >
                        {master.validation ? "Re-validate" : "Validate"}
                      </button>
                    </div>
                    {master.validationState === "failed" ? (
                      <p className="text-[9px] text-amber-200/80">
                        {master.validationError || "Validation unavailable right now."}
                      </p>
                    ) : null}
                    {master.validationState === "skipped" ? (
                      <p className="text-[9px] text-foreground/40">
                        No locked product details to compare against yet.
                      </p>
                    ) : null}
                    {master.validation ? (
                      <div className="space-y-0.5">
                        {master.validation.rows.map((row) => (
                          <div
                            key={row.dimension}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <span className="text-[9px] text-foreground/45">{row.dimension}</span>
                            <span
                              className={
                                row.verdict === "PASS"
                                  ? "text-[9px] text-emerald-200/90"
                                  : row.verdict === "WARNING"
                                    ? "text-[9px] text-amber-200/90"
                                    : "text-[9px] text-red-300"
                              }
                              title={row.note ?? undefined}
                            >
                              {row.verdict}
                            </span>
                          </div>
                        ))}
                        {master.validation.summary ? (
                          <p className="pt-0.5 text-[9px] leading-relaxed text-foreground/40">
                            {master.validation.summary}
                          </p>
                        ) : null}
                        <p className="text-[9px] text-foreground/30">
                          Analysis only — nothing was regenerated.
                        </p>
                      </div>
                    ) : null}
                  </div>
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

      {componentPlan.length ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/60">
            Component masters
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">
            Only the parts your locked product actually has. Rendering a part once and reusing it
            keeps it identical across every frame.
          </p>
          <div className="mt-2 space-y-1.5">
            {componentPlan.map((entry) => {
              const master = masters[entry.key];
              return (
                <div
                  key={entry.key}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-2"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/5 bg-white/[0.02]">
                    {master?.outputUrl ? (
                      <img
                        src={master.outputUrl}
                        alt={`Component master — ${entry.label}`}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] text-foreground/75">{entry.label}</p>
                    <p className="truncate text-[9px] text-foreground/40">{entry.reason}</p>
                    {master?.status === "failed" && master.error ? (
                      <p className="truncate text-[9px] text-red-300/80">{master.error}</p>
                    ) : null}
                  </div>
                  {master?.status === "complete" ? (
                    <>
                      <span
                        className={
                          master.validated
                            ? "text-[9px] font-semibold tracking-[0.12em] text-emerald-200/90"
                            : "text-[9px] text-foreground/40"
                        }
                      >
                        {master.validated
                          ? "VALIDATED"
                          : master.validationState === "checking"
                            ? "Validating…"
                            : master.validation
                              ? "REJECTED"
                              : "Not validated"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onValidate(entry.key)}
                        disabled={master.validationState === "checking"}
                        className="rounded-md border border-white/12 px-1.5 py-0.5 text-[9px] text-foreground/75 transition-colors hover:border-cyan-200/50 hover:text-cyan-100 disabled:opacity-40"
                      >
                        {master.validation ? "Re-validate" : "Validate"}
                      </button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || !!disabledReason || !onGenerateComponent}
                    onClick={() => onGenerateComponent?.(entry.componentId)}
                    className="h-6 shrink-0 rounded-lg px-2 text-[9px]"
                  >
                    {master?.status === "queued" || master?.status === "running"
                      ? "Rendering…"
                      : master?.outputUrl
                        ? "Re-render"
                        : "Generate"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CanonicalMastersPanel;
