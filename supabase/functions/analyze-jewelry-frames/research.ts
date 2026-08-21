// TARGETED JEWELRY RESEARCH AGENT — ANALYSIS ONLY (Phase C, C1).
//
// WHAT THIS IS
//   An uncertainty-triggered terminology lookup. When the fused product
//   understanding cannot confidently classify a setting / construction term,
//   this module researches what the TERM means (definition, jeweler usage,
//   aliases, candidate engineering signatures) using Gemini with the Google
//   Search grounding tool, then reconciles the researched signature against the
//   ACTUAL observed product evidence.
//
// HARD RULES
//   - Runs ONLY during product understanding, only when uncertain. Never per
//     generation, never per frame.
//   - Gemini stays ANALYSIS ONLY: text/JSON in, text/JSON out. No media.
//   - Research NEVER overrides physical evidence. It supplies vocabulary and
//     candidate signatures to compare against; the observed product decides.
//   - Every researched term is cached in public.jewelry_knowledge_base by
//     normalized term_key, so the same term is never researched twice.

import type { GoogleGenAI } from "https://esm.sh/@google/genai@1.29.0";

const MAX_TERMS_PER_RUN = 3;
const GROUNDED_TIMEOUT_MS = 45_000;

export type ResearchTrigger =
  | "unknown_terminology"
  | "custom_terminology"
  | "ambiguous_ontology_match"
  | "low_confidence_setting"
  | "competing_setting_candidates"
  | "no_engineering_signature_match";

export type ResearchedTerm = {
  term: string;
  termKey: string;
  triggers: ResearchTrigger[];
  canonicalName: string | null;
  vocabularyDomain: string | null;
  aliases: string[];
  definition: string | null;
  engineeringSignature: Record<string, unknown>;
  sourceUrls: string[];
  confidence: number | null;
  /** Did the researched signature match the OBSERVED product evidence? */
  matchesObservedEvidence: boolean | null;
  matchNotes: string[];
  /** Where the finding came from — the KB cache or a fresh grounded search. */
  source: "knowledge_base" | "web_research";
  /** Never authoritative: candidates are compared, never applied as truth. */
  authority: "CANDIDATE_VOCABULARY_ONLY";
};

const arrayOf = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 400) => {
  const next = String(value ?? "").trim();
  return next ? next.slice(0, max) : null;
};

export function termKeyOf(term: string) {
  return String(term ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* ------------------------------------------------------------------ *
 * UNCERTAINTY TRIGGERS — the only reason this module ever runs
 * ------------------------------------------------------------------ */

export type UncertainTerm = { term: string; triggers: ResearchTrigger[] };

/**
 * Reads the fused map and returns ONLY the terms the classification could not
 * confidently resolve. `isKnownTerm` is the existing in-code ontology matcher —
 * a term already in the ontology is never researched.
 */
export function collectUncertainTerms(
  map: any,
  isKnownTerm: (name: string) => boolean,
): UncertainTerm[] {
  const found = new Map<string, Set<ResearchTrigger>>();
  const add = (raw: unknown, trigger: ResearchTrigger) => {
    const term = text(raw, 80);
    if (!term || term.length < 3) return;
    if (/^(needs_confirmation|unknown|n\/a|none|mixed|multiple)$/i.test(term)) return;
    const key = termKeyOf(term);
    if (!key) return;
    const existing = found.get(key);
    if (existing) existing.add(trigger);
    else found.set(key, new Set([trigger]));
  };

  const analysis = map?.settingAnalysis && typeof map.settingAnalysis === "object" ? map.settingAnalysis : {};
  const confidence = Number(analysis?.confidence);
  const lowConfidence = analysis?.needsConfirmation === true ||
    (Number.isFinite(confidence) && confidence < 0.55);

  // Custom / unfamiliar terminology the model reached for.
  for (const term of arrayOf(analysis.customTerminology)) {
    if (!isKnownTerm(String(term))) add(term, "unknown_terminology");
    else if (lowConfidence) add(term, "custom_terminology");
  }

  // The compositional axes themselves, when unresolved or unfamiliar.
  for (const axis of [analysis.stoneFieldTopology, analysis.retentionConstruction]) {
    if (!axis) continue;
    if (!isKnownTerm(String(axis))) add(axis, "unknown_terminology");
    else if (lowConfidence) add(axis, "low_confidence_setting");
  }
  if (arrayOf(analysis.conflictingSignals).length) {
    for (const axis of [analysis.stoneFieldTopology, analysis.retentionConstruction]) {
      add(axis, "competing_setting_candidates");
    }
  }

  // Per-region settings: unmatched signatures and ambiguous matches.
  for (const setting of arrayOf(map?.settings)) {
    const detected = setting?.detectedSetting ?? setting?.canonicalSetting ?? setting?.setting;
    const settingConfidence = Number(setting?.confidence);
    if (!detected) continue;
    if (!isKnownTerm(String(detected))) {
      add(detected, "unknown_terminology");
      continue;
    }
    if (!arrayOf(setting?.matchedSignals).length) add(detected, "no_engineering_signature_match");
    if (arrayOf(setting?.conflictingSignals).length) add(detected, "ambiguous_ontology_match");
    if (Number.isFinite(settingConfidence) && settingConfidence < 0.55) {
      add(detected, "low_confidence_setting");
    }
    for (const candidate of arrayOf(setting?.competingCandidates ?? setting?.alternateCandidates)) {
      add(candidate?.name ?? candidate, "competing_setting_candidates");
    }
  }

  return [...found.entries()]
    .map(([key, triggers]) => ({ key, triggers }))
    .slice(0, MAX_TERMS_PER_RUN)
    .map(({ key, triggers }) => ({
      term: key.replace(/_/g, " "),
      triggers: [...triggers],
    }));
}

/* ------------------------------------------------------------------ *
 * Observed-evidence digest — what the PRODUCT actually shows
 * ------------------------------------------------------------------ */

function observedEvidence(map: any) {
  const analysis = map?.settingAnalysis ?? {};
  return JSON.stringify({
    stoneFieldTopology: analysis.stoneFieldTopology ?? null,
    retentionConstruction: analysis.retentionConstruction ?? null,
    coverageStyle: analysis.coverageStyle ?? null,
    topologyEvidence: arrayOf(analysis.topologyEvidence).slice(0, 6),
    retentionEvidence: arrayOf(analysis.retentionEvidence).slice(0, 6),
    conflictingSignals: arrayOf(analysis.conflictingSignals).slice(0, 6),
    apparentSizeClasses: arrayOf(analysis.apparentSizeClasses).slice(0, 8),
    physicalSizeClasses: arrayOf(analysis.physicalSizeClasses).slice(0, 8),
    stoneGroups: arrayOf(map?.stoneGroups).slice(0, 8).map((group: any) => ({
      region: group?.regionId ?? null,
      cut: group?.stoneCut ?? null,
      sizeUniformity: group?.sizeUniformity ?? null,
      physicalSizeDifference: group?.physicalSizeDifference ?? null,
      retention: group?.retention ?? group?.settingConstruction ?? null,
      metalVisibility: group?.metalVisibility ?? null,
    })),
  }).slice(0, 6000);
}

/* ------------------------------------------------------------------ *
 * Gemini + Google Search grounding
 * ------------------------------------------------------------------ */

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("research timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function groundedPrompt(term: string) {
  return [
    `Research the jewelry term "${term}" using web search. Text only — never produce or reference images or video.`,
    "Search engineering-oriented jeweler sources, for example:",
    `- "${term} setting mixed size diamonds jeweler"`,
    `- "${term} setting custom jewelry construction"`,
    `- "${term} setting definition bench jeweler"`,
    "",
    "Report, in plain prose:",
    "1. DEFINITION — what the term means.",
    "2. ENGINEERING MEANING — the physical construction it describes.",
    "3. JEWELER / MANUFACTURER USAGE — who uses it and in which vocabulary domain (classical, gemological, manufacturing, or modern custom/hip-hop).",
    "4. ALIASES — other names for the same construction.",
    "5. CANDIDATE ENGINEERING SIGNATURES — the observable physical signals a piece built this way would show: expected stone cuts, stone-size pattern, packing pattern, retention mechanics, prong behaviour, metal visibility, row behaviour, orientation behaviour, compatible geometry.",
    "If sources disagree, say so. Do not guess a definition you cannot source.",
  ].join("\n");
}

function reconcilePrompt(term: string, research: string, evidence: string) {
  return [
    `You are reconciling RESEARCHED VOCABULARY for the term "${term}" against the OBSERVED product evidence. Return JSON only.`,
    "",
    "AUTHORITY RULE (absolute): the OBSERVED PRODUCT EVIDENCE decides what the piece is. The research only supplies vocabulary and candidate signatures to compare against. If the researched signature contradicts the observed evidence, matchesObservedEvidence is false and you keep the observation — never rewrite the observation to fit the research.",
    "",
    "RESEARCH NOTES (web-sourced, may be wrong or generic):",
    research.slice(0, 12000),
    "",
    "OBSERVED PRODUCT EVIDENCE (authoritative):",
    evidence,
    "",
    "Fill the schema: canonicalName, vocabularyDomain, aliases, definition, engineeringSignature (the researched signature, not the observation), confidence in the RESEARCH itself, matchesObservedEvidence (does the researched signature actually match what the product shows?), and matchNotes as short physical statements explaining the comparison.",
  ].join("\n");
}

const RECONCILE_SCHEMA = {
  type: "OBJECT",
  properties: {
    canonicalName: { type: "STRING" },
    vocabularyDomain: { type: "STRING" },
    aliases: { type: "ARRAY", items: { type: "STRING" } },
    definition: { type: "STRING" },
    engineeringSignature: {
      type: "OBJECT",
      properties: {
        expectedStoneCuts: { type: "ARRAY", items: { type: "STRING" } },
        stoneSizePattern: { type: "STRING" },
        packingPattern: { type: "STRING" },
        retentionMechanics: { type: "STRING" },
        prongBehavior: { type: "STRING" },
        metalVisibility: { type: "STRING" },
        rowBehavior: { type: "STRING" },
        orientationBehavior: { type: "STRING" },
        compatibleGeometry: { type: "ARRAY", items: { type: "STRING" } },
      },
    },
    confidence: { type: "NUMBER" },
    matchesObservedEvidence: { type: "BOOLEAN" },
    matchNotes: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["canonicalName", "definition", "engineeringSignature", "matchesObservedEvidence"],
} as const;

function groundingUrls(response: any): string[] {
  const chunks = arrayOf(response?.candidates?.[0]?.groundingMetadata?.groundingChunks);
  const urls = chunks
    .map((chunk: any) => text(chunk?.web?.uri, 500))
    .filter((url): url is string => Boolean(url));
  return [...new Set(urls)].slice(0, 8);
}

/* ------------------------------------------------------------------ *
 * Main entry — KB check first, grounded research only when needed
 * ------------------------------------------------------------------ */

export async function researchUncertainTerms(args: {
  ai: GoogleGenAI;
  admin: any;
  model: string;
  map: any;
  uncertain: UncertainTerm[];
}): Promise<{ researchedTerms: ResearchedTerm[]; researchMs: number; cacheHits: number }> {
  const started = Date.now();
  const results: ResearchedTerm[] = [];
  let cacheHits = 0;
  if (!args.uncertain.length) return { researchedTerms: results, researchMs: 0, cacheHits: 0 };

  const evidence = observedEvidence(args.map);

  for (const { term, triggers } of args.uncertain) {
    const termKey = termKeyOf(term);
    try {
      // 1. KNOWLEDGE BASE FIRST — a known term is never re-researched.
      const { data: cached } = await args.admin
        .from("jewelry_knowledge_base")
        .select("term_key, canonical_name, vocabulary_domain, aliases, definition, engineering_signature, source_urls, confidence")
        .eq("term_key", termKey)
        .maybeSingle();

      if (cached?.definition) {
        cacheHits += 1;
        results.push({
          term,
          termKey,
          triggers,
          canonicalName: text(cached.canonical_name, 120) ?? term,
          vocabularyDomain: text(cached.vocabulary_domain, 60),
          aliases: arrayOf(cached.aliases).map((alias) => String(alias)).slice(0, 12),
          definition: text(cached.definition, 1200),
          engineeringSignature: (cached.engineering_signature ?? {}) as Record<string, unknown>,
          sourceUrls: arrayOf(cached.source_urls).map((url) => String(url)).slice(0, 8),
          confidence: Number.isFinite(Number(cached.confidence)) ? Number(cached.confidence) : null,
          // The cached signature still has to be compared to THIS product.
          matchesObservedEvidence: null,
          matchNotes: ["reused cached knowledge-base definition; compared as a candidate only"],
          source: "knowledge_base",
          authority: "CANDIDATE_VOCABULARY_ONLY",
        });
        console.log(`[jewelry-research] KB HIT term=${termKey} triggers=${triggers.join(",")}`);
        continue;
      }

      // 2. GROUNDED SEARCH — Gemini + the Google Search tool, text only.
      const grounded: any = await withTimeout(
        args.ai.models.generateContent({
          model: args.model,
          contents: groundedPrompt(term),
          config: { tools: [{ googleSearch: {} }], temperature: 0 },
        }) as Promise<any>,
        GROUNDED_TIMEOUT_MS,
      );
      const notes = String(grounded?.text ?? "").trim();
      const sourceUrls = groundingUrls(grounded);
      if (!notes) throw new Error("grounded research returned nothing");

      // 3. RECONCILE against the observed product evidence (structured, no tools).
      const reconciled: any = await withTimeout(
        args.ai.models.generateContent({
          model: args.model,
          contents: reconcilePrompt(term, notes, evidence),
          config: {
            responseMimeType: "application/json",
            responseSchema: RECONCILE_SCHEMA as any,
            temperature: 0,
            maxOutputTokens: 4096,
          },
        }) as Promise<any>,
        GROUNDED_TIMEOUT_MS,
      );
      const parsed = JSON.parse(String(reconciled?.text ?? "").trim());

      const finding: ResearchedTerm = {
        term,
        termKey,
        triggers,
        canonicalName: text(parsed?.canonicalName, 120) ?? term,
        vocabularyDomain: text(parsed?.vocabularyDomain, 60),
        aliases: arrayOf(parsed?.aliases).map((alias: unknown) => String(alias).slice(0, 80)).slice(0, 12),
        definition: text(parsed?.definition, 1200),
        engineeringSignature: (parsed?.engineeringSignature ?? {}) as Record<string, unknown>,
        sourceUrls,
        confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : null,
        matchesObservedEvidence: parsed?.matchesObservedEvidence === true
          ? true
          : parsed?.matchesObservedEvidence === false
          ? false
          : null,
        matchNotes: arrayOf(parsed?.matchNotes).map((note: unknown) => String(note).slice(0, 300)).slice(0, 6),
        source: "web_research",
        authority: "CANDIDATE_VOCABULARY_ONLY",
      };
      results.push(finding);

      // 4. UPSERT into the KB so this term is never researched again.
      if (finding.definition) {
        await args.admin.from("jewelry_knowledge_base").upsert(
          {
            term_key: termKey,
            canonical_name: finding.canonicalName ?? term,
            vocabulary_domain: finding.vocabularyDomain,
            aliases: finding.aliases,
            definition: finding.definition,
            engineering_signature: finding.engineeringSignature,
            source_urls: finding.sourceUrls,
            confidence: finding.confidence,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "term_key" },
        );
      }
      console.log(
        `[jewelry-research] RESEARCHED term=${termKey} triggers=${triggers.join(",")} sources=${sourceUrls.length} matchesObserved=${finding.matchesObservedEvidence} confidence=${finding.confidence}`,
      );
    } catch (error) {
      console.warn(`[jewelry-research] term=${termKey} failed:`, String((error as Error)?.message ?? error).slice(0, 300));
    }
  }

  return { researchedTerms: results, researchMs: Date.now() - started, cacheHits };
}

/**
 * Attaches the findings to the map WITHOUT overriding anything: matched
 * signatures become candidates the existing setting-ontology classification can
 * compare against, and the observed axes are left exactly as classified.
 */
export function attachResearchToMap(map: any, researchedTerms: ResearchedTerm[]) {
  if (!map || typeof map !== "object") return map;
  map.researchedTerms = researchedTerms;
  const analysis = map.settingAnalysis && typeof map.settingAnalysis === "object" ? map.settingAnalysis : null;
  if (analysis) {
    analysis.researchCandidates = researchedTerms.map((finding) => ({
      term: finding.term,
      canonicalName: finding.canonicalName,
      vocabularyDomain: finding.vocabularyDomain,
      aliases: finding.aliases,
      engineeringSignature: finding.engineeringSignature,
      matchesObservedEvidence: finding.matchesObservedEvidence,
      matchNotes: finding.matchNotes,
      triggers: finding.triggers,
      // Vocabulary only: physical evidence keeps authority over every axis.
      authority: finding.authority,
    }));
    analysis.researchApplied = researchedTerms.length > 0;
  }
  return map;
}
