/**
 * CONNECTED PRODUCT SYSTEMS (§30) — consumption side (edge, §E3).
 *
 * The model itself is DERIVED on the client from the Master Product Lock's
 * component topology (`src/lib/connectedAssets.ts`). This module only:
 * - normalizes whatever the client sent (never invents a relationship),
 * - turns present relationships into concise PHYSICAL prompt lines.
 *
 * No product classification, no provider routing, no raw JSON in the prompt.
 */

export type ConnectedAssetRelationship = {
  relationshipId?: string | null;
  partA?: string | null;
  partB?: string | null;
  attachmentPoint?: string | null;
  articulation?: string | null;
  gravityBehavior?: string | null;
  overlap?: string | null;
  tension?: string | null;
  weightRelationship?: string | null;
  evidence?: string | null;
  userConfirmed?: boolean;
};

export type ConnectedAssetModel = {
  version?: string | null;
  connectedAssets: ConnectedAssetRelationship[];
};

const text = (value: unknown, max = 160): string | null => {
  const next = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!next || /^(auto|unknown|n\/a|none|null)$/i.test(next)) return null;
  return next.slice(0, max);
};

/** Keeps only relationships that name BOTH parts. Missing fields stay null. */
export function normalizeConnectedAssets(raw: unknown): ConnectedAssetModel | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const list = Array.isArray(source.connectedAssets) ? source.connectedAssets : [];
  const relationships: ConnectedAssetRelationship[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const partA = text(row.partA, 60);
    const partB = text(row.partB, 60);
    if (!partA || !partB) continue;
    relationships.push({
      relationshipId: text(row.relationshipId, 140),
      partA,
      partB,
      attachmentPoint: text(row.attachmentPoint),
      articulation: text(row.articulation),
      gravityBehavior: text(row.gravityBehavior),
      overlap: text(row.overlap),
      tension: text(row.tension),
      weightRelationship: text(row.weightRelationship),
      evidence: text(row.evidence, 120),
      userConfirmed: row.userConfirmed === true,
    });
    if (relationships.length >= 8) break;
  }
  if (!relationships.length) return null;
  return { version: text(source.version, 60), connectedAssets: relationships };
}

/**
 * Concise physical rules so connected parts stay physically attached and never
 * float, detach or intersect. Empty array when there is no model — callers then
 * append nothing and behaviour is unchanged.
 */
export function connectedAssetPromptLines(
  model: ConnectedAssetModel | null | undefined,
): string[] {
  const relationships = model?.connectedAssets ?? [];
  if (!relationships.length) return [];

  const rows = relationships.map((relationship) => {
    const facts = [
      relationship.attachmentPoint ? `joined at ${relationship.attachmentPoint}` : null,
      relationship.articulation ? `movement ${relationship.articulation}` : null,
      relationship.gravityBehavior ? `under gravity ${relationship.gravityBehavior}` : null,
      relationship.overlap ? `overlap ${relationship.overlap}` : null,
      relationship.tension ? `load ${relationship.tension}` : null,
      relationship.weightRelationship ? `mass ${relationship.weightRelationship}` : null,
    ].filter(Boolean).join("; ");
    const confirmed = relationship.userConfirmed ? " [USER_CONFIRMED]" : "";
    return `- ${relationship.partA} ↔ ${relationship.partB}${facts ? `: ${facts}` : ""}${confirmed}`;
  });

  return [
    "CONNECTED PARTS — PHYSICAL ATTACHMENT RULES. The parts below are ONE physical assembly, not separate floating objects. Each pair must stay engaged at its real interface, with correct occlusion order and a continuous, load-bearing connection: no gaps, no hovering, no detached or duplicated links, no part passing through another, no connection hidden by a convenient crop.",
    ...rows,
    "Where a relationship field is unstated, follow the reference images rather than inventing a joint. Attachment is geometry — it may never be relaxed for styling, lighting or composition.",
  ];
}
