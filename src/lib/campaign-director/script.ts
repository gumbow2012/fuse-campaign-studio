import { CAMERA_KINDS, type DirectorProduct, type DirectorShot } from "./types";
import { newId, normalizeShot } from "./state";

/**
 * Turns the script writer's JSON into shots, and audits the result against the
 * production rules before any image is paid for.
 */

export interface ScriptIssue {
  level: "error" | "warning";
  shot?: number;
  message: string;
}

/** Max share of shots allowed to carry a product (reveal rhythm: story, action, payoff). */
export const MAX_PRODUCT_SHOT_SHARE = 0.6;
export const MAX_PRODUCTS_PER_SHOT = 3;

export function shotsFromScript(raw: unknown, products: DirectorProduct[]): DirectorShot[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { shots?: unknown })?.shots) ? (raw as { shots: unknown[] }).shots : [];
  const known = new Set(products.map((p) => p.id));
  return list.map((item, i) => {
    const entry = (item ?? {}) as Record<string, unknown>;
    const ids = (arr: unknown) =>
      Array.isArray(arr) ? (arr as unknown[]).filter((v): v is string => typeof v === "string" && known.has(v)) : [];
    const productIds = ids(entry.productIds);
    const shot = normalizeShot(
      {
        ...entry,
        id: newId("shot"),
        index: i + 1,
        productIds,
        artistProductIds: ids(entry.artistProductIds).filter((id) => productIds.includes(id) || known.has(id)),
        status: "draft",
      },
      i,
    );
    return shot;
  });
}

export function validateScript(shots: DirectorShot[], products: DirectorProduct[], targetCount?: number): ScriptIssue[] {
  const issues: ScriptIssue[] = [];
  if (shots.length === 0) {
    issues.push({ level: "error", message: "The script has no shots." });
    return issues;
  }
  if (targetCount && Math.abs(shots.length - targetCount) > 2) {
    issues.push({ level: "warning", message: `Asked for ${targetCount} shots, got ${shots.length}.` });
  }

  const ids = new Set(products.map((p) => p.id));
  for (const shot of shots) {
    if (!shot.action.trim()) issues.push({ level: "error", shot: shot.index, message: "Missing the action (one frozen moment)." });
    if (!shot.setting.trim()) issues.push({ level: "warning", shot: shot.index, message: "Missing a specific setting." });
    if (!shot.motion.trim()) issues.push({ level: "warning", shot: shot.index, message: "Missing the one movement for the clip." });
    if (shot.productIds.length > MAX_PRODUCTS_PER_SHOT) {
      issues.push({ level: "error", shot: shot.index, message: `More than ${MAX_PRODUCTS_PER_SHOT} products in one shot.` });
    }
    for (const id of [...shot.productIds, ...shot.artistProductIds]) {
      if (!ids.has(id)) issues.push({ level: "error", shot: shot.index, message: `Unknown product id ${id}.` });
    }
    if (/\b(and then|then he|, then )/i.test(shot.action)) {
      issues.push({ level: "warning", shot: shot.index, message: "Looks like more than one moment. One still = one frozen moment." });
    }
    if (!CAMERA_KINDS.includes(shot.camera)) {
      issues.push({ level: "warning", shot: shot.index, message: `Unrecognized camera "${shot.camera}".` });
    }
  }

  // Every product needs one clear hero shot.
  for (const product of products) {
    const heroes = shots.filter((s) => s.productRole === "hero" && s.productIds.includes(product.id));
    if (heroes.length === 0) {
      issues.push({ level: "error", message: `${product.name} has no hero shot.` });
    }
  }

  // Reveal rhythm: do not put a product in every frame.
  const withProduct = shots.filter((s) => s.productIds.length > 0).length;
  if (withProduct / shots.length > MAX_PRODUCT_SHOT_SHARE) {
    issues.push({
      level: "warning",
      message: `${withProduct} of ${shots.length} shots show a product. Aim for under ${Math.round(MAX_PRODUCT_SHOT_SHARE * 100)}% so reveals land.`,
    });
  }

  // Camera variety: no three identical cameras in a row, and no single camera over 35%.
  for (let i = 2; i < shots.length; i++) {
    if (shots[i].camera === shots[i - 1].camera && shots[i].camera === shots[i - 2].camera) {
      issues.push({ level: "warning", shot: shots[i].index, message: `Three "${shots[i].camera}" shots in a row.` });
    }
  }
  const counts = new Map<string, number>();
  for (const s of shots) counts.set(s.camera, (counts.get(s.camera) ?? 0) + 1);
  for (const [camera, n] of counts) {
    if (shots.length >= 8 && n / shots.length > 0.35) {
      issues.push({ level: "warning", message: `"${camera}" is ${n} of ${shots.length} shots. Mix the camera language.` });
    }
  }

  return issues;
}

export function issueSummary(issues: ScriptIssue[]) {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
  };
}
