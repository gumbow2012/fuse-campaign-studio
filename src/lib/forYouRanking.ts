/**
 * RETENTION P3 — deterministic "For you" ordering.
 *
 * No ML, no fabricated affinity. Every point comes from a real signal:
 *   A  brand compatibility (existing TemplateFit resolver)   ready +6, nearly +3
 *   B  favorite affinity (shared category / tags)            category +4, per tag +2 (max +4)
 *   C  popularity (public_template_popularity RPC runs)      +0..3, log-scaled
 *   D  recency (created_at)                                  <=14d +2, <=45d +1
 * Ties keep catalog order (stable sort on the incoming index).
 *
 * Personalization is only claimed when signal A or B actually contributed —
 * otherwise the caller must label the row "Popular on FUSE" (C + D only).
 */

import type { ApiTemplate } from "@/services/fuseApi";
import type { TemplateFit } from "@/lib/brandTemplateFit";

export type ForYouMode = "personalized" | "popular";

export interface ForYouInputs {
  templates: ApiTemplate[];
  /** template_id -> compatibility for the ACTIVE brand (empty when no brand). */
  fitMap: Record<string, TemplateFit>;
  /** template ids the user favorited. */
  favoriteIds: Set<string>;
  /** template_id -> completed runs in the popularity window (empty when unavailable). */
  popularity: Record<string, number>;
  /** template ids already shown in "Continue creating". */
  excludeIds?: Set<string>;
  limit?: number;
}

export interface ForYouEntry {
  template: ApiTemplate;
  score: number;
  personalized: boolean;
}

function tokensOf(template: ApiTemplate): string[] {
  return [...(template.tags ?? [])].map((tag) => String(tag).toLowerCase().trim()).filter(Boolean);
}

function categoryOf(template: ApiTemplate): string {
  return String(template.category ?? "").toLowerCase().trim();
}

function recencyBoost(template: ApiTemplate): number {
  const raw = (template as { created_at?: string | null }).created_at;
  if (!raw) return 0;
  const created = Date.parse(raw);
  if (!Number.isFinite(created)) return 0;
  const days = (Date.now() - created) / 86_400_000;
  if (days < 0) return 0;
  if (days <= 14) return 2;
  if (days <= 45) return 1;
  return 0;
}

export function rankForYou(inputs: ForYouInputs): { mode: ForYouMode; entries: ForYouEntry[] } {
  const { templates, fitMap, favoriteIds, popularity, excludeIds, limit = 8 } = inputs;

  /* Signal B reference set: the categories/tags of what the user already saved. */
  const favoriteCategories = new Set<string>();
  const favoriteTags = new Set<string>();
  for (const template of templates) {
    if (!favoriteIds.has(String(template.id))) continue;
    const category = categoryOf(template);
    if (category) favoriteCategories.add(category);
    for (const tag of tokensOf(template)) favoriteTags.add(tag);
  }

  const scored = templates.map((template, index) => {
    const id = String(template.id);
    let score = 0;
    let personalized = false;

    const fit = fitMap[id];
    if (fit?.status === "ready") {
      score += 6;
      personalized = true;
    } else if (fit?.status === "nearly") {
      score += 3;
      personalized = true;
    }

    if (!favoriteIds.has(id)) {
      const category = categoryOf(template);
      if (category && favoriteCategories.has(category)) {
        score += 4;
        personalized = true;
      }
      const tagMatches = tokensOf(template).filter((tag) => favoriteTags.has(tag)).length;
      if (tagMatches > 0) {
        score += Math.min(4, tagMatches * 2);
        personalized = true;
      }
    }

    const runs = Number(popularity[id] ?? 0);
    if (runs > 0) score += Math.min(3, Math.log10(runs + 1) * 1.5);

    score += recencyBoost(template);

    return { template, index, score, personalized };
  });

  const mode: ForYouMode = scored.some((row) => row.personalized) ? "personalized" : "popular";

  const entries = scored
    .filter((row) => !excludeIds?.has(String(row.template.id)))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ template, score, personalized }) => ({ template, score, personalized }));

  return { mode, entries };
}
