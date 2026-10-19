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
  /** Interior lining / underside / label description from the inside photo. */
  inside_identity: string;
  confidence: number;
}

export interface StillReport {
  hat_present: boolean;
  hat_count: number;
  side_shown: Side;
  /** Upper surface of the bill visible in frame. Older reports: inferred from top_brim_color. */
  top_brim_visible?: boolean;
  top_brim_color: string | null;
  /** Multi-hat shots: the UPPER bill color of EACH visible hat, left to right (null = not visible). */
  top_brim_colors_per_hat?: (string | null)[] | null;
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
  /** Exclusive in-flight check (serialized; expires so a crash can't wedge the shot). */
  claim?: { id: string; expires_at: string } | null;
  /** Provider request ids of rejected stills; their late callbacks must be ignored. */
  superseded_requests?: string[];
  /** Set once when a worker is told to animate; every later gate returns "skip" (no double clip charge). */
  clip_submitted_by?: string | null;
}

export interface HatFilmQaState {
  version: string;
  /** Optimistic-concurrency revision; every write is a compare-and-set on it. */
  rev?: number;
  reference: {
    status: "ok" | "unavailable" | "invalid" | "analyzing";
    profile: ReferenceProfile | null; error: string | null; analyzed_at: string | null;
    claim?: { id: string; expires_at: string } | null;
  } | null;
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
    inside_identity: String(r.inside_identity ?? ""),
    confidence,
  };
  if (!profile.right_side_identity.trim() || !profile.left_side_identity.trim()) return { ok: false, reason: "side designs not identified" };
  if (!profile.inside_identity.trim()) return { ok: false, reason: "interior not identified" };
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

/**
 * What a shot's still must show. Brim requirements are shot-specific and only
 * cover areas the shot necessarily frames: the upper bill on the front hero and
 * three-hat shot; the underside on the interior reveal. Elsewhere a brim surface
 * is checked only if the inspector reports it visible.
 */
export type BrimRule = "required" | "if_visible";
export interface ShotExpectation { hat: boolean; side: Side | null; count: number; top: BrimRule; under: BrimRule; interior: boolean }
const NO_HAT: ShotExpectation = { hat: false, side: null, count: 0, top: "if_visible", under: "if_visible", interior: false };
const RULES: Record<number, Pick<ShotExpectation, "top" | "under">> = {
  1: { top: "required", under: "if_visible" },
  8: { top: "if_visible", under: "required" },
  11: { top: "required", under: "if_visible" },
};

export function expectationFor(shot: HatFilmShot): ShotExpectation {
  const angles = shot.primary.filter((p) => p in SIDE_FOR);
  if (!angles.length) return NO_HAT;
  const rule = RULES[shot.index] ?? { top: "if_visible", under: "if_visible" };
  if (shot.index === 11) return { hat: true, side: null, count: 3, ...rule, interior: false };
  const side = SIDE_FOR[angles[0]];
  return { hat: true, side, count: 1, ...rule, interior: side === "inside" };
}

function checkBrim(issues: string[], label: string, rule: BrimRule, visible: boolean, observed: string | null | undefined, expected: string) {
  if (!visible) { if (rule === "required") issues.push(`${label} not visible`); return; }
  const fam = colorFamily(observed);
  if (!fam) { if (rule === "required") issues.push(`${label} color not identifiable`); return; }
  if (fam !== colorFamily(expected)) issues.push(`${label} is ${observed}; the photos show ${expected}`);
}

export function judgeStill(shot: HatFilmShot, profile: ReferenceProfile, report: StillReport | null): Verdict {
  if (!report || typeof report !== "object") return { verdict: "uncertain", issues: ["no inspection result"] };
  const conf = Number(report.confidence);
  if (!Number.isFinite(conf) || conf < QA_MIN_CONFIDENCE) return { verdict: "uncertain", issues: ["inspection was not confident"] };
  const exp = expectationFor(shot);
  const issues: string[] = [];

  if (!exp.hat) {
    if (report.hat_present) issues.push("a hat appears in an environment-only shot");
    if (report.any_text_or_logo) issues.push("generated text, a sign or a logo appears; the logo is added later from the original file");
    return { verdict: issues.length ? "fail" : "pass", issues };
  }

  if (!report.hat_present) return { verdict: "fail", issues: ["the hat is missing"] };
  if (exp.count === 3 && report.hat_count !== 3) issues.push(`expected three copies of the hat, saw ${report.hat_count}`);
  if (exp.count > 1) {
    // Every hat is checked on its own; one aggregate color must never hide a wrong bill.
    const perHat = Array.isArray(report.top_brim_colors_per_hat) ? report.top_brim_colors_per_hat : [];
    if (perHat.length < exp.count) issues.push(`upper bill color not reported for each of the ${exp.count} hats`);
    perHat.slice(0, exp.count).forEach((color, i) => {
      if (exp.top === "required") checkBrim(issues, `top of the brim on hat ${i + 1}`, "required", color != null, color, profile.top_brim_color);
    });
  }

  const topVisible = typeof report.top_brim_visible === "boolean" ? report.top_brim_visible : !!report.top_brim_color;
  checkBrim(issues, "top of the brim", exp.top, topVisible, report.top_brim_color, profile.top_brim_color);
  checkBrim(issues, "underside of the brim", exp.under, !!report.under_brim_visible, report.under_brim_color, profile.under_brim_color);

  if (exp.interior) {
    if (report.side_shown !== "inside") issues.push(`shows the ${report.side_shown} instead of the inside`);
    if (textOverlap(profile.inside_identity, report.side_identity) < 0.4) issues.push("the interior doesn't match the inside reference");
  } else if (exp.side) {
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
Report: top_brim_color (the UPPER surface of the bill, from the front photo), under_brim_color (the UNDERSIDE of the bill, from the inside photo) — these are independent; front_text (exact lettering on the front); back_text (exact lettering on the back); right_side_identity (short description of the wearer's right side design, including any text); left_side_identity (same for the wearer's left); inside_identity (short description of the interior from the inside photo: underside color, lining, seam tape, labels); confidence 0–1 for the whole analysis. Do not guess; lower confidence instead.`;

export const STILL_PROMPT = `Image 1 is a generated product still. The remaining images are reference photos of the real hat (front, wearer's right, wearer's left, back, inside).
Describe ONLY what Image 1 shows: hat_present, hat_count, side_shown (front | wearer_right | wearer_left | back | inside | none | multiple; wearer's right appears on image-left when the hat faces the camera), top_brim_visible (is the UPPER surface of the bill visible at all), top_brim_color (null if not visible), top_brim_colors_per_hat (when more than one hat is shown: the UPPER bill color of EACH hat separately, left to right, null for a hat whose upper bill is hidden; empty list for a single hat), under_brim_visible, under_brim_color, visible_text (exact lettering you can read on the hat), text_legible, side_identity (short description of the visible side design, or of the interior/lining when the inside is shown), any_text_or_logo (any text, sign lettering or logo anywhere in the image), confidence 0–1. Do not assume it matches the references.`;

export const REFERENCE_SCHEMA = {
  type: "OBJECT",
  properties: {
    top_brim_color: { type: "STRING" }, under_brim_color: { type: "STRING" },
    front_text: { type: "STRING" }, back_text: { type: "STRING" },
    right_side_identity: { type: "STRING" }, left_side_identity: { type: "STRING" }, inside_identity: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["top_brim_color", "under_brim_color", "front_text", "back_text", "right_side_identity", "left_side_identity", "inside_identity", "confidence"],
};

export const STILL_SCHEMA = {
  type: "OBJECT",
  properties: {
    hat_present: { type: "BOOLEAN" }, hat_count: { type: "INTEGER" },
    side_shown: { type: "STRING", enum: ["front", "wearer_right", "wearer_left", "back", "inside", "none", "multiple"] },
    top_brim_visible: { type: "BOOLEAN" }, top_brim_color: { type: "STRING", nullable: true },
    top_brim_colors_per_hat: { type: "ARRAY", items: { type: "STRING", nullable: true } },
    under_brim_visible: { type: "BOOLEAN" }, under_brim_color: { type: "STRING", nullable: true },
    visible_text: { type: "STRING" }, text_legible: { type: "BOOLEAN" }, side_identity: { type: "STRING" },
    any_text_or_logo: { type: "BOOLEAN" }, confidence: { type: "NUMBER" },
  },
  required: ["hat_present", "hat_count", "side_shown", "top_brim_visible", "top_brim_colors_per_hat", "under_brim_visible", "visible_text", "text_legible", "side_identity", "any_text_or_logo", "confidence"],
};

/* ------------------------- serialized state + gate ------------------------- */

export const QA_CLAIM_MS = 3 * 60_000;

/** Ids of rejected still requests across all shots (late callbacks are ignored). */
export function supersededRequestIds(raw: unknown): string[] {
  return Object.values(parseQa(raw).shots).flatMap((s) => s.superseded_requests ?? []);
}

/** Durable state store. `write` is compare-and-set on `rev`; both throw on database errors. */
export interface QaStore {
  read(): Promise<{ qa: HatFilmQaState; rev: number }>;
  write(qa: HatFilmQaState, expectedRev: number): Promise<boolean>;
}

/** Read → mutate → CAS write, retried on conflict. `next: null` = nothing to write. */
export async function updateQa<T>(store: QaStore, mutate: (qa: HatFilmQaState) => { next: HatFilmQaState | null; out: T }, tries = 12): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const { qa, rev } = await store.read();
    const { next, out } = mutate(structuredClone(qa));
    if (!next) return out;
    if (await store.write({ ...next, rev: rev + 1 }, rev)) return out;
  }
  throw new Error("QA_STATE_CONFLICT: product check state is busy; try again");
}

export interface GateDeps {
  store: QaStore;
  analyzeReference(): Promise<unknown>;
  inspectStill(stillUrl: string): Promise<unknown>;
  locks: { top_brim_color?: string | null; under_brim_color?: string | null };
  now(): number;
  newId(): string;
}
export type GateResult =
  | { action: "animate" }
  | { action: "retry"; correction: string }
  | { action: "needs_review"; reason: string }
  /** Another worker holds this shot's (or the reference's) check until `until` (ISO). */
  | { action: "wait"; until?: string }
  /** This shot's clip was already handed to another worker; do not submit it again. */
  | { action: "skip" };

const live = (c: { expires_at: string } | null | undefined, now: number) => !!c && Date.parse(c.expires_at) > now;
const unavailable = (e: unknown) => !!(e as { unavailable?: boolean })?.unavailable;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Serialized product check for one shot. At most one in-flight check per shot
 * and one reference analysis per run; retries are decided from freshly read
 * state, so they stay bounded under concurrent callbacks.
 */
export async function runHatFilmGate(deps: GateDeps, args: { shot: HatFilmShot; stillUrl: string | undefined; stillRequestId: string | null }): Promise<GateResult> {
  const { store, now } = deps;
  const id = args.shot.id;
  const claimId = deps.newId();
  const expires = () => new Date(now() + QA_CLAIM_MS).toISOString();

  const start = await updateQa<GateResult | "claimed">(store, (qa) => {
    const cur = qa.shots[id] ?? emptyShotQa();
    if (cur.status === "passed") {
      if (cur.clip_submitted_by) return { next: null, out: { action: "skip" } };
      qa.shots[id] = { ...cur, clip_submitted_by: claimId };
      return { next: qa, out: { action: "animate" } };
    }
    if (cur.status === "needs_review") return { next: null, out: { action: "needs_review", reason: cur.last?.issues.join("; ") || "needs review" } };
    // A stale worker holding an already-rejected still: never re-check it (that would burn the retry).
    if (args.stillRequestId && (cur.superseded_requests ?? []).includes(args.stillRequestId)) return { next: null, out: { action: "skip" } };
    if (live(cur.claim, now())) return { next: null, out: { action: "wait", until: cur.claim!.expires_at } };
    if (!args.stillUrl) {
      qa.shots[id] = { ...cur, status: "needs_review", last: { verdict: "uncertain", issues: ["still missing"] }, claim: null };
      return { next: qa, out: { action: "needs_review", reason: "still missing" } };
    }
    qa.shots[id] = { ...cur, claim: { id: claimId, expires_at: expires() } };
    return { next: qa, out: "claimed" };
  });
  if (start !== "claimed") return start;

  const release = () => updateQa(store, (qa) => {
    const cur = qa.shots[id];
    if (cur?.claim?.id !== claimId) return { next: null, out: null };
    qa.shots[id] = { ...cur, claim: null };
    return { next: qa, out: null };
  });

  // Reference analysis: once per run, serialized.
  const refClaim = deps.newId();
  const ref = await updateQa<{ kind: "ok" | "claimed" | "wait" | "bad"; profile?: ReferenceProfile; reason?: string; until?: string }>(store, (qa) => {
    const r = qa.reference;
    if (r?.status === "ok" && r.profile) return { next: null, out: { kind: "ok", profile: r.profile } };
    if (r?.status === "invalid") return { next: null, out: { kind: "bad", reason: `reference analysis invalid: ${r.error ?? ""}` } };
    if (r?.status === "analyzing" && live(r.claim, now())) return { next: null, out: { kind: "wait", until: r.claim!.expires_at } };
    qa.reference = { status: "analyzing", profile: null, error: null, analyzed_at: null, claim: { id: refClaim, expires_at: expires() } };
    return { next: qa, out: { kind: "claimed" } };
  });
  if (ref.kind === "wait") { await release(); return { action: "wait", until: ref.until }; }

  let profile = ref.profile ?? null;
  let refReason = ref.reason ?? null;
  if (ref.kind === "claimed") {
    const at = new Date(now()).toISOString();
    let next: NonNullable<HatFilmQaState["reference"]>;
    try {
      const n = normalizeReferenceProfile(await deps.analyzeReference());
      if (!n.ok) next = { status: "invalid", profile: null, error: n.reason, analyzed_at: at, claim: null };
      else {
        const conflicts = brimConflicts(n.profile, deps.locks);
        next = conflicts.length
          ? { status: "invalid", profile: n.profile, error: conflicts.join("; "), analyzed_at: at, claim: null }
          : { status: "ok", profile: n.profile, error: null, analyzed_at: at, claim: null };
      }
    } catch (e) {
      // A missing key costs nothing to retry later; a failed paid call is not repeated.
      next = { status: unavailable(e) ? "unavailable" : "invalid", profile: null, error: msg(e), analyzed_at: at, claim: null };
    }
    await updateQa(store, (qa) => {
      if (qa.reference?.claim?.id !== refClaim) return { next: null, out: null };
      qa.reference = next;
      return { next: qa, out: null };
    });
    profile = next.status === "ok" ? next.profile : null;
    refReason = profile ? null : `reference analysis ${next.status}: ${next.error ?? ""}`;
  }

  let verdict: Verdict | null = null;
  let analyzer = !!profile;
  if (profile) {
    try {
      verdict = judgeStill(args.shot, profile, (await deps.inspectStill(args.stillUrl!)) as StillReport);
    } catch (e) {
      if (unavailable(e)) analyzer = false;
      verdict = { verdict: "uncertain", issues: [`inspection failed: ${msg(e)}`] };
    }
  }

  const final = await updateQa<GateResult>(store, (qa) => {
    const cur = qa.shots[id] ?? emptyShotQa();
    if (cur.claim?.id !== claimId) return { next: null, out: { action: "wait" } }; // claim expired and was taken over
    const decision = decideAfterCheck(verdict, cur, analyzer);
    const applied = applyCheck(cur, verdict ?? { verdict: "uncertain", issues: [refReason ?? "product check unavailable"] }, decision, new Date(now()).toISOString());
    const next: ShotQa = { ...applied, claim: null, ...(decision === "animate" ? { clip_submitted_by: claimId } : {}) };
    if (decision === "retry" && args.stillRequestId) next.superseded_requests = [...new Set([...(cur.superseded_requests ?? []), args.stillRequestId])];
    qa.shots[id] = next;
    const out: GateResult = decision === "animate" ? { action: "animate" }
      : decision === "retry" ? { action: "retry", correction: next.correction ?? "" }
      : { action: "needs_review", reason: next.last?.issues.join("; ") || "product check could not verify this shot" };
    return { next: qa, out };
  });
  return final;
}
