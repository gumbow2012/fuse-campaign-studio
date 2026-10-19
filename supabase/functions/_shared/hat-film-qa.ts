/**
 * Hat Brand Film — automatic product checks (pure; node-testable).
 *
 * 1. Reference analysis (once per run): top-brim and underside colors are
 *    recorded as SEPARATE attributes, plus front/back lettering and each
 *    side's identity. Uncertain or incomplete analysis is unusable.
 * 2. Still check (before every animation): a vision report of the generated
 *    still is judged against that profile for the shot's expected angle.
 * 3. Decision: pass → animate; fail/uncertain → one corrective retry, then
 *    Needs review. A missing analyzer or invalid output never passes.
 *
 * These checks catch obvious drift (wrong brim color, swapped sides, lost or
 * unreadable lettering). They do not prove exact fidelity.
 */
import { HAT_FILM_MAX_AUTO_RETRIES, HAT_FILM_SHOTS, type HatFilmShot } from "./hat-film-recipe.ts";

export const HAT_FILM_QA_KEY = "hat_film_qa";
export const HAT_FILM_QA_VERSION = "hat-qa@1";
export const QA_MIN_CONFIDENCE = 0.7;

export type Side = "front" | "wearer_right" | "wearer_left" | "back" | "inside" | "none" | "multiple";

export interface ReferenceProfile {
  top_brim_color: string;
  under_brim_color: string;
  front_text: string;
  back_text: string;
  right_side_identity: string;
  left_side_identity: string;
  confidence: number;
}

export interface StillReport {
  hat_present: boolean;
  hat_count: number;
  side_shown: Side;
  top_brim_color: string | null;
  under_brim_visible: boolean;
  under_brim_color: string | null;
  visible_text: string;
  text_legible: boolean;
  side_identity: string;
  any_text_or_logo: boolean;
  confidence: number;
}

export type Verdict = { verdict: "pass" | "fail" | "uncertain"; issues: string[] };
export type QaDecision = "animate" | "retry" | "needs_review";

export interface ShotQa {
  attempts: number;
  retries: number;
  status: "pending" | "passed" | "retrying" | "needs_review" | "not_applicable";
  last: Verdict | null;
  correction: string | null;
  checked_at: string | null;
}

export interface HatFilmQaState {
  version: string;
  reference: { status: "ok" | "unavailable" | "invalid"; profile: ReferenceProfile | null; error: string | null; analyzed_at: string | null } | null;
  shots: Record<string, ShotQa>;
}

export const emptyQa = (): HatFilmQaState => ({ version: HAT_FILM_QA_VERSION, reference: null, shots: {} });
export const parseQa = (v: unknown): HatFilmQaState => {
  const q = (v ?? {}) as Partial<HatFilmQaState>;
  return { ...emptyQa(), ...q, shots: { ...(q.shots ?? {}) } };
};
export const emptyShotQa = (): ShotQa => ({ attempts: 0, retries: 0, status: "pending", last: null, correction: null, checked_at: null });

/* ------------------------------ colors / text ------------------------------ */

const FAMILIES: Array<[string, RegExp]> = [
  ["black", /\b(black|jet|onyx|ebony)\b/],
  ["gray", /\b(gr[ae]y|charcoal|silver|slate|ash|heather|stone)\b/],
  ["white", /\b(white|ivory|off[- ]?white|cream)\b/],
  ["navy", /\bnavy\b/],
  ["blue", /\b(blue|royal|cobalt|sky)\b/],
  ["red", /\b(red|crimson|scarlet|burgundy|maroon)\b/],
  ["green", /\b(green|olive|forest|camo)\b/],
  ["brown", /\b(brown|tan|khaki|beige|camel|chocolate)\b/],
  ["orange", /\borange\b/],
  ["yellow", /\b(yellow|gold)\b/],
  ["pink", /\bpink\b/],
  ["purple", /\b(purple|violet|lavender)\b/],
];

/** Coarse color family; charcoal counts as gray, so dark-gray vs black is a real difference. */
export function colorFamily(c: string | null | undefined): string | null {
  const s = String(c ?? "").toLowerCase();
  if (/\bdark\s+gr[ae]y\b|\bcharcoal\b/.test(s)) return "gray";
  for (const [name, re] of FAMILIES) if (re.test(s)) return name;
  return null;
}

const tokens = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 1);

/** Share of expected words found in the observed text (0–1). */
export function textOverlap(expected: string, observed: string): number {
  const want = [...new Set(tokens(expected))];
  if (!want.length) return 1;
  const have = new Set(tokens(observed));
  return want.filter((t) => have.has(t)).length / want.length;
}

/* -------------------------------- analysis -------------------------------- */

/** Usable reference profile or a reason it isn't. Uncertain = unusable. */
export function normalizeReferenceProfile(raw: unknown): { ok: true; profile: ReferenceProfile } | { ok: false; reason: string } {
  const r = raw as Partial<ReferenceProfile> | null;
  if (!r || typeof r !== "object") return { ok: false, reason: "analysis returned nothing" };
  const confidence = Number(r.confidence);
  if (!Number.isFinite(confidence) || confidence < QA_MIN_CONFIDENCE) return { ok: false, reason: "reference analysis is uncertain" };
  if (!colorFamily(r.top_brim_color)) return { ok: false, reason: "top brim color not identified" };
  if (!colorFamily(r.under_brim_color)) return { ok: false, reason: "underside color not identified" };
  const profile: ReferenceProfile = {
    top_brim_color: String(r.top_brim_color), under_brim_color: String(r.under_brim_color),
    front_text: String(r.front_text ?? ""), back_text: String(r.back_text ?? ""),
    right_side_identity: String(r.right_side_identity ?? ""), left_side_identity: String(r.left_side_identity ?? ""),
    confidence,
  };
  if (!profile.right_side_identity.trim() || !profile.left_side_identity.trim()) return { ok: false, reason: "side designs not identified" };
  return { ok: true, profile };
}

/** User-entered brim colors (if any) must agree with what the photos show. */
export function brimConflicts(profile: ReferenceProfile, locks: { top_brim_color?: string | null; under_brim_color?: string | null }) {
  const issues: string[] = [];
  if (locks.top_brim_color && colorFamily(locks.top_brim_color) !== colorFamily(profile.top_brim_color)) issues.push(`top brim entered as ${locks.top_brim_color} but photos show ${profile.top_brim_color}`);
  if (locks.under_brim_color && colorFamily(locks.under_brim_color) !== colorFamily(profile.under_brim_color)) issues.push(`underside entered as ${locks.under_brim_color} but photos show ${profile.under_brim_color}`);
  return issues;
}

/* ------------------------------ still judging ------------------------------ */

const SIDE_FOR: Record<string, Side> = { front: "front", right: "wearer_right", left: "wearer_left", back: "back", inside: "inside" };

/** What a shot's still should show. Environment/logo shots must show no hat and no text. */
export function expectationFor(shot: HatFilmShot): { hat: boolean; side: Side | null; count: number } {
  const angles = shot.primary.filter((p) => p in SIDE_FOR);
  if (!angles.length) return { hat: false, side: null, count: 0 };
  if (shot.index === 11) return { hat: true, side: null, count: 3 };
  return { hat: true, side: SIDE_FOR[angles[0]], count: 1 };
}

export function judgeStill(shot: HatFilmShot, profile: ReferenceProfile, report: StillReport | null): Verdict {
  if (!report || typeof report !== "object") return { verdict: "uncertain", issues: ["no inspection result"] };
  const conf = Number(report.confidence);
  if (!Number.isFinite(conf) || conf < QA_MIN_CONFIDENCE) return { verdict: "uncertain", issues: ["inspection was not confident"] };
  const exp = expectationFor(shot);
  const issues: string[] = [];

  if (!exp.hat) {
    if (report.hat_present) issues.push("a hat appears in an environment-only shot");
    if (report.any_text_or_logo) issues.push("generated text or a logo appears; the logo is added later from the original file");
    return { verdict: issues.length ? "fail" : "pass", issues };
  }

  if (!report.hat_present) return { verdict: "fail", issues: ["the hat is missing"] };
  if (exp.count === 3 && report.hat_count !== 3) issues.push(`expected three copies of the hat, saw ${report.hat_count}`);

  const top = colorFamily(report.top_brim_color);
  if (!top) issues.push("top of the brim color not visible");
  else if (top !== colorFamily(profile.top_brim_color)) issues.push(`top of the brim is ${report.top_brim_color}; the photos show ${profile.top_brim_color}`);
  if (report.under_brim_visible) {
    const under = colorFamily(report.under_brim_color);
    if (under && under !== colorFamily(profile.under_brim_color)) issues.push(`underside is ${report.under_brim_color}; the photos show ${profile.under_brim_color}`);
  }

  if (exp.side && exp.side !== "inside") {
    if (report.side_shown !== exp.side) {
      const swapped = (exp.side === "wearer_right" && report.side_shown === "wearer_left") || (exp.side === "wearer_left" && report.side_shown === "wearer_right");
      issues.push(swapped ? "the hat sides are reversed" : `shows the ${report.side_shown} instead of the ${exp.side}`);
    }
    if (exp.side === "wearer_right" || exp.side === "wearer_left") {
      const own = exp.side === "wearer_right" ? profile.right_side_identity : profile.left_side_identity;
      const other = exp.side === "wearer_right" ? profile.left_side_identity : profile.right_side_identity;
      const ownScore = textOverlap(own, report.side_identity), otherScore = textOverlap(other, report.side_identity);
      if (otherScore > ownScore && otherScore >= 0.5) issues.push("the side design belongs to the opposite side (mirrored or swapped)");
      else if (ownScore < 0.4) issues.push("the side design doesn't match the reference");
    }
    const expectedText = exp.side === "front" ? profile.front_text : exp.side === "back" ? profile.back_text : "";
    if (expectedText.trim()) {
      if (!report.text_legible) issues.push("the lettering is unreadable");
      else if (textOverlap(expectedText, report.visible_text) < 0.6) issues.push(`lettering reads "${report.visible_text}"; expected "${expectedText}"`);
    }
  }
  return { verdict: issues.length ? "fail" : "pass", issues };
}

/** Bounded: one corrective retry per shot; uncertain counts as failed; no analyzer → review. */
export function decideAfterCheck(v: Verdict | null, shot: ShotQa, analyzerAvailable: boolean): QaDecision {
  if (!analyzerAvailable || !v) return "needs_review";
  if (v.verdict === "pass") return "animate";
  return shot.retries < HAT_FILM_MAX_AUTO_RETRIES ? "retry" : "needs_review";
}

export function correctionFor(v: Verdict): string {
  return `CORRECTION (previous attempt rejected by product check): ${v.issues.join("; ")}. Match the reference photos exactly for these points.`;
}

/** Applies one check outcome to the persisted shot state. */
export function applyCheck(state: ShotQa, v: Verdict | null, decision: QaDecision, nowIso: string): ShotQa {
  const base = { ...state, attempts: state.attempts + 1, last: v, checked_at: nowIso };
  if (decision === "animate") return { ...base, status: "passed", correction: null };
  if (decision === "retry") return { ...base, status: "retrying", retries: state.retries + 1, correction: v ? correctionFor(v) : null };
  return { ...base, status: "needs_review" };
}

export const HAT_FILM_CHECKED_SHOTS = HAT_FILM_SHOTS.filter((s) => s.kind !== "logo_hold");

/** Analyzer calls per run: 1 reference analysis + 1 check per animated still, doubled for retries in the worst case. */
export function qaCallCount() {
  const checks = HAT_FILM_CHECKED_SHOTS.length;
  return { base: 1 + checks, max: 1 + checks * (1 + HAT_FILM_MAX_AUTO_RETRIES) };
}

/* --------------------------------- schemas --------------------------------- */

export const REFERENCE_PROMPT = `You are inspecting product photos of ONE baseball cap: front, wearer's right side (appears on image-left when facing the hat), wearer's left side, back, inside/underside — in that order.
Report: top_brim_color (the UPPER surface of the bill, from the front photo), under_brim_color (the UNDERSIDE of the bill, from the inside photo) — these are independent; front_text (exact lettering on the front); back_text (exact lettering on the back); right_side_identity (short description of the wearer's right side design, including any text); left_side_identity (same for the wearer's left); confidence 0–1 for the whole analysis. Do not guess; lower confidence instead.`;

export const STILL_PROMPT = `Image 1 is a generated product still. The remaining images are reference photos of the real hat (front, wearer's right, wearer's left, back, inside).
Describe ONLY what Image 1 shows: hat_present, hat_count, side_shown (front | wearer_right | wearer_left | back | inside | none | multiple; wearer's right appears on image-left when the hat faces the camera), top_brim_color, under_brim_visible, under_brim_color, visible_text (exact lettering you can read on the hat), text_legible, side_identity (short description of the visible side design), any_text_or_logo (any text, sign lettering or logo anywhere in the image), confidence 0–1. Do not assume it matches the references.`;

export const REFERENCE_SCHEMA = {
  type: "OBJECT",
  properties: {
    top_brim_color: { type: "STRING" }, under_brim_color: { type: "STRING" },
    front_text: { type: "STRING" }, back_text: { type: "STRING" },
    right_side_identity: { type: "STRING" }, left_side_identity: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["top_brim_color", "under_brim_color", "front_text", "back_text", "right_side_identity", "left_side_identity", "confidence"],
};

export const STILL_SCHEMA = {
  type: "OBJECT",
  properties: {
    hat_present: { type: "BOOLEAN" }, hat_count: { type: "INTEGER" },
    side_shown: { type: "STRING", enum: ["front", "wearer_right", "wearer_left", "back", "inside", "none", "multiple"] },
    top_brim_color: { type: "STRING", nullable: true }, under_brim_visible: { type: "BOOLEAN" }, under_brim_color: { type: "STRING", nullable: true },
    visible_text: { type: "STRING" }, text_legible: { type: "BOOLEAN" }, side_identity: { type: "STRING" },
    any_text_or_logo: { type: "BOOLEAN" }, confidence: { type: "NUMBER" },
  },
  required: ["hat_present", "hat_count", "side_shown", "under_brim_visible", "visible_text", "text_legible", "side_identity", "any_text_or_logo", "confidence"],
};
