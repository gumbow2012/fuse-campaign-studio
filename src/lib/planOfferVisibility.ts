/**
 * P6b — tiny in-memory bridge so the builder can wait for the P3 plan-offer
 * popup to be resolved before it restores + auto-starts a pending generation.
 * Sequence: auth success → (plan offer) → free/continue → restore + auto-run.
 */
let active = false;
const listeners = new Set<(value: boolean) => void>();

export function setPlanOfferActive(value: boolean) {
  if (active === value) return;
  active = value;
  for (const listener of listeners) listener(active);
}

export function isPlanOfferActive() {
  return active;
}

export function subscribePlanOffer(listener: (value: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
