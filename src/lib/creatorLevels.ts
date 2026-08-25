/**
 * Creator level ladder (STATIC, READ-ONLY).
 *
 * Levels are derived purely from the creator's real approved/published template
 * count. No new tables, no writes, no reward promises.
 */

export type CreatorLevel = {
  name: string;
  minApproved: number;
};

export const CREATOR_LEVELS: CreatorLevel[] = [
  { name: "Creator", minApproved: 0 },
  { name: "Contributor", minApproved: 1 },
  { name: "Featured", minApproved: 5 },
  { name: "Signature", minApproved: 15 },
];

export type CreatorLevelResult = {
  current: CreatorLevel;
  next: CreatorLevel | null;
  /** Approved templates still needed to reach `next` (0 when maxed out). */
  toNext: number;
};

export function getCreatorLevel(approvedCount: number): CreatorLevelResult {
  const approved = Number.isFinite(approvedCount) ? Math.max(0, Math.floor(approvedCount)) : 0;

  let current = CREATOR_LEVELS[0];
  for (const level of CREATOR_LEVELS) {
    if (approved >= level.minApproved) current = level;
  }

  const next = CREATOR_LEVELS.find((level) => level.minApproved > approved) ?? null;

  return {
    current,
    next,
    toNext: next ? next.minApproved - approved : 0,
  };
}
