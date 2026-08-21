/**
 * VALIDATED CANONICAL MASTERS AS REFERENCES (§E2) — candidate collection only.
 *
 * D1/D3 render clean canonical / component masters of the active product and D2
 * validates them. This module turns the VALIDATED ones (and only those) into
 * reference candidates for the EXISTING frame reference selector.
 *
 * Authority is unchanged: a master is a clean *derived* plate, so it always sits
 * BELOW user-confirmed facts, the original direct evidence photos and CAD. It
 * only helps where the originals left the frame thin or ambiguous.
 */

/** Shape of a candidate the frame selector understands. */
export type MasterReferenceCandidate = {
  url: string;
  role: string | null;
  cad: false;
  /** Marks the ref as a derived master (never original evidence). */
  master: true;
};

const text = (value: unknown, max = 80): string | null => {
  const out = String(value ?? "").trim().replace(/\s+/g, " ");
  return out ? out.slice(0, max) : null;
};

/** A stored master counts only when it rendered AND passed D2 validation. */
function isEligible(entry: any): boolean {
  if (!entry || typeof entry !== "object") return false;
  if (entry.status !== "complete") return false;
  if (!text(entry.outputUrl, 2000)) return false;
  return entry.validated === true;
}

/**
 * VALIDATED masters from a project's persisted `canonicalMasters` record, in a
 * stable order (canonical views first, then components — components are narrower
 * answers and should not crowd out a whole-product view).
 */
export function collectValidatedMasterRefs(canonicalMasters: unknown): MasterReferenceCandidate[] {
  if (!canonicalMasters || typeof canonicalMasters !== "object") return [];
  const entries = Object.values(canonicalMasters as Record<string, any>).filter(isEligible);

  const rank = (entry: any) => (entry?.view === "component" ? 1 : 0);
  entries.sort((a, b) => rank(a) - rank(b));

  const seen = new Set<string>();
  const refs: MasterReferenceCandidate[] = [];
  for (const entry of entries) {
    const url = text(entry.outputUrl, 2000) as string;
    if (seen.has(url)) continue;
    seen.add(url);
    const label = text(entry.componentLabel) ?? text(entry.label) ?? text(entry.view) ?? "master";
    refs.push({ url, role: `Master ${label}`, cad: false, master: true });
  }
  return refs;
}
