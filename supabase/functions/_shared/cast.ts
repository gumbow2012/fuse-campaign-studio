/**
 * FT10 — cast pre-execution layer (MODE A: DIRECT_CONDITIONING).
 *
 * ALL cast decision logic lives here. The executor makes exactly ONE call
 * (`resolveTemplateCast`) at the point a node's inputs are assembled.
 *
 * OFF BY DEFAULT: with no cast_config, cast_config.supported !== true, or no
 * selected avatar, `resolveTemplateCast` returns the inputs it was given —
 * the same array instance — so legacy runs are byte-for-byte identical.
 *
 * COST: MODE A swaps ONE already-existing reference-conditioning input for the
 * avatar identity image. It adds 0 provider calls, 0 extra steps and 0 extra
 * credits; run-cost calculation is untouched.
 */

import { readCastConfig, type CastConfig, type CastSlotConfig } from "./cast-config.ts";

export const CAST_CONFIGURATION_INVALID = "CAST_CONFIGURATION_INVALID";
export const CAST_MODE_DIRECT_CONDITIONING = "DIRECT_CONDITIONING";

export class CastConfigurationError extends Error {
  code = CAST_CONFIGURATION_INVALID;
  constructor(detail?: string) {
    super(detail ? `${CAST_CONFIGURATION_INVALID}: ${detail}` : CAST_CONFIGURATION_INVALID);
    this.name = "CastConfigurationError";
  }
}

/** Resolved, run-time cast state persisted with the job (survives webhook resume). */
export type CastRuntime = {
  slotId: string;
  avatarId: string;
  /** Identity reference image (thumbnail_url or first reference_assets entry). */
  avatarImageUrl: string;
  mode: typeof CAST_MODE_DIRECT_CONDITIONING;
};

/** Key inside execution_jobs.input_payload holding the cast runtime (never a node id). */
export const CAST_RUNTIME_KEY = "__cast";

/** The admin-designated target input key for a slot; defaults to the graph default param. */
export function castTargetInputKey(slot: CastSlotConfig | { targetInputKey?: unknown }): string {
  const raw = (slot as { targetInputKey?: unknown }).targetInputKey;
  const key = typeof raw === "string" ? raw.trim() : "";
  return key || "image";
}

/** The admin-designated target node id for a slot (FT8 stores it as `nodeId`). */
export function castTargetNodeId(slot: CastSlotConfig | { nodeId?: unknown; targetNodeId?: unknown }): string {
  const record = slot as { nodeId?: unknown; targetNodeId?: unknown };
  const raw = typeof record.nodeId === "string" && record.nodeId.trim()
    ? record.nodeId
    : typeof record.targetNodeId === "string"
    ? record.targetNodeId
    : "";
  return raw.trim();
}

export function parseCastRuntime(value: unknown): CastRuntime | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const slotId = typeof record.slotId === "string" ? record.slotId.trim() : "";
  const avatarId = typeof record.avatarId === "string" ? record.avatarId.trim() : "";
  const avatarImageUrl = typeof record.avatarImageUrl === "string" ? record.avatarImageUrl.trim() : "";
  if (!slotId || !avatarId || !avatarImageUrl) return null;
  return { slotId, avatarId, avatarImageUrl, mode: CAST_MODE_DIRECT_CONDITIONING };
}

/**
 * Picks the identity reference image off an avatar_profiles row. Never guesses.
 * PREFERS the canonical identity master, then thumbnail_url, then the first
 * reference_assets entry (unchanged legacy fallback). Still ONE image.
 */
export function avatarIdentityImage(row: unknown): string | null {
  return canonicalMasterUrl(row);
}


/**
 * Pre-flight validation used BEFORE credits are charged.
 * Returns the runtime to persist, or null when cast is not applicable (legacy).
 * Throws CastConfigurationError when the request is a cast run but unusable.
 */
export function validateCastSelection(args: {
  castConfigValue: unknown;
  /** { cast_a: avatarId } */
  selection: Record<string, string> | null | undefined;
  /** Resolved identity image per avatar id (loaded via admin client). */
  avatarImages: Record<string, string | null>;
  /** Node ids belonging to the running version. */
  versionNodeIds: Set<string>;
}): CastRuntime | null {
  const castConfig = readCastConfig(args.castConfigValue);
  const rawSelection = args.selection ?? {};
  const selectedSlotIds = Object.keys(rawSelection).filter((key) => !!String(rawSelection[key] ?? "").trim());

  // Legacy: template does not support cast.
  if (!castConfig || castConfig.supported !== true) {
    if (selectedSlotIds.length) {
      throw new CastConfigurationError("this template does not support cast");
    }
    return null;
  }

  if (!selectedSlotIds.length) {
    // Optional cast with nothing selected → exact legacy path.
    if (!castConfig.required) return null;
    throw new CastConfigurationError("this template requires a cast selection");
  }
  if (selectedSlotIds.length > 1) {
    throw new CastConfigurationError("only one cast slot is supported");
  }

  const slotId = selectedSlotIds[0];
  const slot = castConfig.slots.find((entry) => entry.id === slotId);
  if (!slot) throw new CastConfigurationError("unknown cast slot");

  const targetNodeId = castTargetNodeId(slot);
  if (!targetNodeId || !args.versionNodeIds.has(targetNodeId)) {
    throw new CastConfigurationError("cast target node is missing from this version");
  }

  const avatarId = String(rawSelection[slotId]).trim();
  const avatarImageUrl = (args.avatarImages[avatarId] ?? "").trim();
  if (!avatarImageUrl) {
    throw new CastConfigurationError("avatar identity reference unavailable");
  }

  return { slotId, avatarId, avatarImageUrl, mode: CAST_MODE_DIRECT_CONDITIONING };
}

export type CastApplication = {
  castEnabled: true;
  castSlotId: string;
  avatarId: string;
  castMode: typeof CAST_MODE_DIRECT_CONDITIONING;
  targetNodeId: string;
  targetInputKey: string;
};

/**
 * MODE A executor hook. Identity no-op unless this exact node is the
 * admin-designated cast target AND an avatar is selected.
 *
 * AVATAR = IDENTITY AUTHORITY ONLY: exactly one input key is replaced.
 * Garment / logo / product / jewelry / environment / camera / lighting /
 * composition / all other refs stay template-authoritative and untouched.
 */
export function resolveTemplateCast<T extends { url: string }>(args: {
  nodeId: string;
  /** Already-resolved, ordered inputs for this node. */
  inputs: Array<[string, T]>;
  castConfigValue: unknown;
  runtime: CastRuntime | null | undefined;
  /** Builds the replacement value, preserving the executor's value shape. */
  makeValue: (url: string, previous: T) => T;
}): { inputs: Array<[string, T]>; applied: CastApplication | null } {
  const runtime = args.runtime ?? null;
  if (!runtime) return { inputs: args.inputs, applied: null };

  const castConfig: CastConfig | null = readCastConfig(args.castConfigValue);
  if (!castConfig || castConfig.supported !== true) {
    // A runtime selection with no supporting config must never silently run.
    throw new CastConfigurationError("cast runtime present without cast support");
  }

  const slot = castConfig.slots.find((entry) => entry.id === runtime.slotId);
  if (!slot) throw new CastConfigurationError("unknown cast slot");

  const targetNodeId = castTargetNodeId(slot);
  if (!targetNodeId) throw new CastConfigurationError("cast target node not configured");
  if (targetNodeId !== args.nodeId) return { inputs: args.inputs, applied: null };

  if (!runtime.avatarImageUrl) throw new CastConfigurationError("avatar identity reference unavailable");

  const targetInputKey = castTargetInputKey(slot);
  const index = args.inputs.findIndex(([key]) => key === targetInputKey);
  if (index < 0) {
    // Fail closed: never inject the avatar into an arbitrary reference slot.
    throw new CastConfigurationError(`cast target input "${targetInputKey}" is not present on this node`);
  }

  const nextInputs = args.inputs.map((entry, entryIndex) => {
    if (entryIndex !== index) return entry;
    const [key, previous] = entry;
    return [key, args.makeValue(runtime.avatarImageUrl, previous)] as [string, T];
  });

  return {
    inputs: nextInputs,
    applied: {
      castEnabled: true,
      castSlotId: runtime.slotId,
      avatarId: runtime.avatarId,
      castMode: CAST_MODE_DIRECT_CONDITIONING,
      targetNodeId,
      targetInputKey,
    },
  };
}

/** Analytics payload — identity/reference metadata is deliberately excluded. */
export function castAuditMetadata(applied: CastApplication | null) {
  if (!applied) return {};
  return {
    cast_enabled: true,
    cast_slot_id: applied.castSlotId,
    avatar_id: applied.avatarId,
    cast_mode: applied.castMode,
    target_node_id: applied.targetNodeId,
  };
}
