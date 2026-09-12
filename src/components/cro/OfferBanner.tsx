/**
 * One offer only: "20% off your first month", shown in each placement.
 * The free-sample block is a separate, isolated preview and must never share a
 * viewport with the paid offer.
 */
export default function OfferBanner({
  internalLabels = false,
}: {
  internalLabels?: boolean;
}) {
  const placements = [
    { label: "Banner", copy: "20% off your first month" },
    { label: "Campaign page subline", copy: "Included in Starter — 20% off your first month." },
    { label: "Pricing card", copy: "$25/mo · 20% off your first month" },
    { label: "Checkout lead-in", copy: "$20 first month, then $25/mo" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-primary/40 bg-card p-4 text-center text-base font-semibold text-foreground">
        20% off your first month
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {placements.map((placement) => (
          <div key={placement.label} className="rounded-[18px] border border-border/70 bg-card p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {placement.label}
            </dt>
            <dd className="mt-1 text-base text-foreground">{placement.copy}</dd>
          </div>
        ))}
      </dl>

      {internalLabels ? (
        <div className="rounded-[18px] border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Internal note</p>
          <p className="mt-1">
            "250 welcome credits" and "Free first video" are removed from marketing copy in this
            system. Only one offer runs at a time.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Isolated free-sample block — rendered on its own, away from the paid offer. */
export function FreeSampleBlock({ internalLabels = false }: { internalLabels?: boolean }) {
  return (
    <div className="rounded-[18px] border border-border/70 bg-card p-5">
      {internalLabels ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Only if backend supports instant free sample
        </p>
      ) : null}
      <p className="text-lg font-semibold text-foreground">Try FUSE free</p>
      <p className="mt-1 text-base text-muted-foreground">
        Upload one product photo. Get one sample video. No card required.
      </p>
    </div>
  );
}
