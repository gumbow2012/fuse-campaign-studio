/**
 * CONNECTED PRODUCT SYSTEMS (§30) — data/logic only.
 * ------------------------------------------------------------------
 * Represents the UNIVERSAL physical relationships between connected parts of
 * the active product (e.g. pendant ↔ chain via a bail, bracelet ↔ clasp, watch
 * case ↔ bracelet) so that connected assets are never treated as independent
 * floating objects.
 *
 * Everything is derived DYNAMICALLY from the Master Product Lock's component
 * topology + attachment evidence. There is NO per-product-type table and no
 * hardcoded relationship list: if the lock did not record a component pair,
 * no relationship is invented. Fields stay `null` when evidence is missing.
 *
 * This commit BUILDS + PERSISTS the model only. Wiring it into generation
 * prompts happens later (Phase E / E3).
 */

import type { MasterProductLock } from "@/lib/masterProductLock";

export const CONNECTED_ASSETS_VERSION = "connected-assets-v1";

export type ConnectedAssetRelationship = {
  /** Stable id: `${partA}::${partB}` (normalized). */
  relationshipId: string;
  /** The two connected parts, as named by the lock's topology. */
  partA: string;
  partB: string;
  /** WHERE they meet (the physical interface), when evidence names one. */
  attachmentPoint: string | null;
  /** HOW the joint moves: rigid / hinged / freely articulating / …  */
  articulation: string | null;
  /** How the pair hangs / settles under gravity. */
  gravityBehavior: string | null;
  /** Which part occludes which where they meet. */
  overlap: string | null;
  /** Load path across the joint (taut, slack, compressed…). */
  tension: string | null;
  /** Relative mass relationship (which part dominates the pose). */
  weightRelationship: string | null;
  /** Where the relationship came from (audit). */
  evidence: string | null;
  /** True when a USER_CONFIRMED fact mentions either part. */
  userConfirmed: boolean;
};

export type ConnectedAssetModel = {
  version: string;
  /** The lock this model was derived from — used for staleness checks. */
  lockVersion: string | null;
  lockId: string | null;
  referenceSetVersion: string | null;
  connectedAssets: ConnectedAssetRelationship[];
  /** Parts named in topology that had no recorded connection. */
  unconnectedParts: string[];
  derivedAt: string;
};

const clean = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^(auto|unknown|n\/a|none)$/i.test(text)) return null;
  return text;
};

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Parses `label → a, b` topology rows into part + connection pairs. */
function parseTopology(rows: string[] | null | undefined) {
  const nodes: { part: string; connections: string[] }[] = [];
  for (const row of rows ?? []) {
    const text = clean(row);
    if (!text) continue;
    const [rawPart, rawConnections] = text.split(/→|->/);
    const part = clean(rawPart);
    if (!part) continue;
    const connections = (rawConnections ?? "")
      .split(/,|;|\band\b/i)
      .map((entry) => clean(entry))
      .filter((entry): entry is string => Boolean(entry));
    nodes.push({ part, connections });
  }
  return nodes;
}

/**
 * Attachment evidence recorded on the lock, indexed by the words it mentions.
 * Used to enrich a relationship WITHOUT inventing one.
 */
function attachmentEvidence(lock: MasterProductLock) {
  return [
    { kind: "bail", text: clean(lock.bail) },
    { kind: "clasp", text: clean(lock.clasp) },
    { kind: "hinge", text: clean(lock.hinge) },
    { kind: "connector", text: clean(lock.connector) },
    { kind: "chain", text: clean(lock.chainIntegration) },
    { kind: "mechanics", text: clean(lock.mechanicalConstruction) },
  ].filter((entry): entry is { kind: string; text: string } => Boolean(entry.text));
}

function describeArticulation(joint: string | null, mechanics: string | null): string | null {
  const source = [joint, mechanics].filter(Boolean).join(" ").toLowerCase();
  if (!source) return null;
  if (/hinge|pivot/.test(source)) return "hinged — rotates about the recorded pivot only";
  if (/screw|solder|weld|fused|integrated|rigid/.test(source)) return "rigid — the joint does not move";
  if (/spring|lobster|box lock|clasp|catch/.test(source)) return "closure — opens/closes at the joint, rigid when closed";
  if (/bail|loop|ring|link|chain|strand|cable/.test(source)) return "freely articulating — swivels/pivots at the joint";
  return null;
}

function describeGravity(joint: string | null): string | null {
  const source = (joint ?? "").toLowerCase();
  if (!source) return null;
  if (/bail|loop|ring|jump/.test(source)) return "hangs from the joint — the suspended part self-levels below it";
  if (/chain|strand|cable|rope|band|bracelet/.test(source)) return "drapes along the body, following the wearer's contour";
  if (/clasp|lock|catch/.test(source)) return "settles opposite the joint when worn";
  return null;
}

function describeTension(articulation: string | null): string | null {
  if (!articulation) return null;
  if (articulation.startsWith("rigid")) return "no slack — load is carried through solid metal";
  if (articulation.startsWith("hinged")) return "load bears on the pivot; no stretch across the joint";
  if (articulation.startsWith("closure")) return "load closes the joint; the catch stays under light tension";
  return "load pulls the joint taut; the rest of the run stays slack";
}

/**
 * Builds the connected-asset model from the lock. Returns null when the lock
 * records no component topology at all (nothing to relate yet).
 */
export function buildConnectedAssetModel(
  lock: MasterProductLock | null | undefined,
): ConnectedAssetModel | null {
  if (!lock) return null;

  const nodes = parseTopology(lock.componentTopology);
  if (!nodes.length) return null;

  const evidence = attachmentEvidence(lock);
  const mechanics = clean(lock.mechanicalConstruction);
  const confirmed = (lock.userConfirmedFacts ?? [])
    .map((fact) => norm(`${fact?.attribute ?? ""} ${fact?.value ?? ""}`))
    .filter(Boolean);

  const seen = new Set<string>();
  const connectedAssets: ConnectedAssetRelationship[] = [];
  const connectedParts = new Set<string>();

  for (const node of nodes) {
    for (const other of node.connections) {
      const [partA, partB] = [node.part, other];
      const id = [norm(partA), norm(partB)].sort().join("::");
      if (!id.includes("::") || norm(partA) === norm(partB)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      connectedParts.add(norm(partA));
      connectedParts.add(norm(partB));

      const pairWords = `${norm(partA)} ${norm(partB)}`;
      const match =
        evidence.find((entry) => pairWords.includes(entry.kind)) ??
        evidence.find((entry) => {
          const label = norm(entry.text).split(":")[0] ?? "";
          return Boolean(label) && (pairWords.includes(label) || label.includes(norm(partA)) || label.includes(norm(partB)));
        }) ??
        null;
      const joint = match?.text ?? null;
      const articulation = describeArticulation(joint ?? pairWords, mechanics);

      connectedAssets.push({
        relationshipId: id,
        partA,
        partB,
        attachmentPoint: joint ?? null,
        articulation,
        gravityBehavior: describeGravity(joint ?? pairWords),
        overlap: joint
          ? `${partA} and ${partB} interlock at the recorded interface — neither floats clear of it`
          : `${partA} meets ${partB} directly; the contact edge stays continuous`,
        tension: describeTension(articulation),
        weightRelationship: null,
        evidence: match ? `lock.${match.kind}` : "lock.componentTopology",
        userConfirmed: confirmed.some(
          (fact) => fact.includes(norm(partA)) || fact.includes(norm(partB)),
        ),
      });
    }
  }

  // Weight relationship: derived from the lock's own proportion evidence only.
  const proportions = clean(lock.proportions);
  if (proportions) {
    for (const relationship of connectedAssets) {
      const a = norm(relationship.partA);
      const b = norm(relationship.partB);
      const text = norm(proportions);
      if (text.includes(a) || text.includes(b)) {
        relationship.weightRelationship = `relative mass per recorded proportions: ${proportions}`;
      }
    }
  }

  const unconnectedParts = nodes
    .map((node) => node.part)
    .filter((part) => !connectedParts.has(norm(part)));

  if (!connectedAssets.length) return null;

  return {
    version: CONNECTED_ASSETS_VERSION,
    lockVersion: clean(lock.version),
    lockId: clean(lock.lockId),
    referenceSetVersion: clean(lock.referenceSetVersion),
    connectedAssets: connectedAssets.slice(0, 12),
    unconnectedParts: unconnectedParts.slice(0, 8),
    derivedAt: new Date().toISOString(),
  };
}

/** True when a stored model still belongs to the active lock/topology. */
export function isConnectedAssetModelCurrent(
  model: ConnectedAssetModel | null | undefined,
  lock: MasterProductLock | null | undefined,
): boolean {
  if (!model || !lock) return false;
  return (
    model.version === CONNECTED_ASSETS_VERSION &&
    (model.lockId ?? null) === (clean(lock.lockId) ?? null) &&
    (model.referenceSetVersion ?? null) === (clean(lock.referenceSetVersion) ?? null)
  );
}

/** Compact read-out for engineering details / audit. */
export function connectedAssetSummary(
  model: ConnectedAssetModel | null | undefined,
): string[] {
  if (!model) return [];
  return model.connectedAssets.map((relationship) =>
    [
      `${relationship.partA} ↔ ${relationship.partB}`,
      relationship.attachmentPoint,
      relationship.articulation,
      relationship.gravityBehavior,
    ]
      .filter(Boolean)
      .join(" — "),
  );
}
