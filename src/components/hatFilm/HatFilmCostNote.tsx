import { hatFilmCostDisclosure } from "@/lib/hatFilmCost";

/** Plain-language cost disclosure for Hat Brand Film; nothing is hidden or invented. */
export default function HatFilmCostNote({ credits }: { credits: number }) {
  const d = hatFilmCostDisclosure(credits);
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-xs text-muted-foreground space-y-1">
      <p className="text-sm font-medium text-foreground">What this film may cost</p>
      <p>Estimate: about {d.baseCredits} credits for 12 shots. Final provider prices may differ.</p>
      <p>
        If a shot fails the automatic product check, it's remade once (at most {d.maxRetriesPerShot} retry per shot).
        Worst case: up to about {d.maxCredits} credits (estimate).
      </p>
      <p>
        Product checks: {d.checks.base}–{d.checks.max} checks per film. Their price isn't available yet, so it isn't included above.
      </p>
    </div>
  );
}
