/**
 * FUSE Cinema — dev/admin readout of the VISUAL PROOF preview manifest (CV1).
 *
 * Counts only. Renders nothing in production builds and never generates media.
 */

import { useMemo, useState } from "react";
import { buildPreviewManifest } from "@/lib/cinema/previewManifest";

export default function PreviewManifestReadout() {
  const [open, setOpen] = useState(false);
  const manifest = useMemo(() => buildPreviewManifest(), []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
      >
        Preview manifest · {manifest.totalMissing}/{manifest.totalRequired} assets missing
      </button>
      {open ? (
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground/80 sm:grid-cols-3">
          {manifest.counts.map((count) => (
            <li key={count.category}>
              {count.category}: {count.required} {count.kind} · {count.missing} missing
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
