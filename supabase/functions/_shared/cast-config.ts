/**
 * FT8 — cast metadata normalizer for template_versions.cast_config.
 * Additive: null means "no casting" and keeps legacy behavior everywhere.
 * Nothing here is consumed by the executor/runner.
 */

const CAST_SLOT_IDS = ["cast_a", "cast_b", "cast_c"];
const IDENTITY_STRENGTHS = ["STRICT", "STRONG", "FLEXIBLE"];
const DEFAULT_IDENTITY_STRENGTH = "STRONG";

export type CastSlotConfig = {
  id: string;
  label: string;
  nodeId: string;
  /** FT10 — admin-designated input key on the target node (MODE A). */
  targetInputKey?: string;
  preservePose: boolean;
  preserveComposition: boolean;
  preserveEnvironment: boolean;
  identityStrength: string;
};

export type CastConfig = {
  supported: boolean;
  required: boolean;
  slots: CastSlotConfig[];
};

function readIdentityStrength(value: unknown) {
  const next = typeof value === "string" ? value.toUpperCase() : "";
  return IDENTITY_STRENGTHS.includes(next) ? next : DEFAULT_IDENTITY_STRENGTH;
}

/**
 * Returns a validated cast config or null (NO_CASTING).
 * `allowedNodeIds` — when provided, the cast subject node must belong to the version.
 */
export function normalizeCastConfig(value: unknown, allowedNodeIds?: Set<string>): CastConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.supported !== true) return null;

  const rawSlots = Array.isArray(record.slots) ? record.slots : [];
  const slots: CastSlotConfig[] = [];
  rawSlots.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const slot = raw as Record<string, unknown>;
    const nodeId = typeof slot.nodeId === "string" ? slot.nodeId.trim() : "";
    if (!nodeId) throw new Error("Select the cast subject node before enabling casting");
    if (allowedNodeIds && !allowedNodeIds.has(nodeId)) {
      throw new Error("The cast subject node must belong to this template version");
    }
    const id = typeof slot.id === "string" && slot.id.trim()
      ? slot.id.trim()
      : CAST_SLOT_IDS[Math.min(index, CAST_SLOT_IDS.length - 1)];
    slots.push({
      id,
      label: typeof slot.label === "string" && slot.label.trim() ? slot.label.trim() : "Cast A",
      nodeId,
      ...(typeof slot.targetInputKey === "string" && slot.targetInputKey.trim()
        ? { targetInputKey: slot.targetInputKey.trim() }
        : {}),
      preservePose: slot.preservePose === true,
      preserveComposition: slot.preserveComposition === true,
      preserveEnvironment: slot.preserveEnvironment === true,
      identityStrength: readIdentityStrength(slot.identityStrength),
    });
  });

  if (!slots.length) throw new Error("Cast configuration needs at least one cast slot");
  return { supported: true, required: record.required === true, slots };
}

/** Tolerant read of a stored value for API responses. */
export function readCastConfig(value: unknown): CastConfig | null {
  try {
    return normalizeCastConfig(value);
  } catch {
    return null;
  }
}
