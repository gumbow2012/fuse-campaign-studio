/**
 * FT8 — cast metadata for template versions.
 *
 * Stored additively in `template_versions.cast_config` (jsonb, nullable).
 * NULL / absent means "no casting" — exact legacy behavior.
 */

export type CastIdentityStrength = "STRICT" | "STRONG" | "FLEXIBLE";

export type CastSlotConfig = {
  id: string;
  label: string;
  /** Explicitly chosen by an admin — never auto-guessed. */
  nodeId: string;
  preservePose?: boolean;
  preserveComposition?: boolean;
  preserveEnvironment?: boolean;
  identityStrength?: CastIdentityStrength;
};

export type CastConfig = {
  supported: boolean;
  required: boolean;
  slots: CastSlotConfig[];
};

/** One slot today; ids are reserved so cast_b / cast_c can be added later. */
export const CAST_SLOT_IDS = ["cast_a", "cast_b", "cast_c"] as const;
export const PRIMARY_CAST_SLOT_ID = CAST_SLOT_IDS[0];
export const IDENTITY_STRENGTHS: CastIdentityStrength[] = ["STRICT", "STRONG", "FLEXIBLE"];
export const DEFAULT_IDENTITY_STRENGTH: CastIdentityStrength = "STRONG";

function readIdentityStrength(value: unknown): CastIdentityStrength {
  const next = typeof value === "string" ? value.toUpperCase() : "";
  return (IDENTITY_STRENGTHS as string[]).includes(next)
    ? (next as CastIdentityStrength)
    : DEFAULT_IDENTITY_STRENGTH;
}

/** Tolerant reader: anything unexpected collapses to null (legacy behavior). */
export function parseCastConfig(value: unknown): CastConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.supported !== true) return null;

  const rawSlots = Array.isArray(record.slots) ? record.slots : [];
  const slots: CastSlotConfig[] = [];
  rawSlots.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const slot = raw as Record<string, unknown>;
    const nodeId = typeof slot.nodeId === "string" ? slot.nodeId.trim() : "";
    if (!nodeId) return;
    const id = typeof slot.id === "string" && slot.id.trim()
      ? slot.id.trim()
      : CAST_SLOT_IDS[Math.min(index, CAST_SLOT_IDS.length - 1)];
    slots.push({
      id,
      label: typeof slot.label === "string" && slot.label.trim() ? slot.label.trim() : "Cast A",
      nodeId,
      preservePose: slot.preservePose === true,
      preserveComposition: slot.preserveComposition === true,
      preserveEnvironment: slot.preserveEnvironment === true,
      identityStrength: readIdentityStrength(slot.identityStrength),
    });
  });

  if (!slots.length) return null;
  return { supported: true, required: record.required === true, slots };
}
