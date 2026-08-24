/**
 * FUSE Cinema — prompt compiler.
 *
 * Single source of truth for what a model actually receives. It reads ONLY the
 * resolved director config (output of `resolveCinemaConfig`) — never panel state,
 * never raw layers — and routes every field through the model adapter:
 *   FULL_SUPPORT  -> native param (never repeated in the prompt)
 *   PROMPT_BASED  -> a prose line in its section
 *   UNSUPPORTED   -> omitted entirely (no fake instruction, no silent downgrade)
 *
 * Sections are emitted in priority order; when the compiled prose exceeds the
 * model's prompt budget the LOWEST-priority sections are dropped first (the
 * scene, hard locks and camera are never dropped).
 */

import { getCinemaModelAdapter, type CinemaVideoModelKey } from "./modelAdapters";
import type {
  CinemaReference,
  DirectorConfig,
  DirectorConfigField,
  ReferenceRole,
} from "./types";

export type CompiledSectionName =
  | "SCENE"
  | "FILM SETUP"
  | "CAMERA"
  | "MOVEMENT"
  | "COMPOSITION"
  | "FOCUS"
  | "LIGHTING"
  | "COLOR"
  | "OPTICS"
  | "ATMOSPHERE"
  | "CHARACTER"
  | "REFERENCES"
  | "HARD LOCKS";

export type CompiledSection = {
  name: CompiledSectionName;
  body: string;
  /** Lower drops last. SCENE / CAMERA / HARD LOCKS are never dropped. */
  priority: number;
  included: boolean;
  /** Director fields that fed this section. */
  fields: DirectorConfigField[];
};

export type CompiledPrompt = {
  finalPrompt: string;
  nativeParams: Record<string, unknown>;
  sections: CompiledSection[];
  /** Fields the selected model cannot express at all (adapter said UNSUPPORTED). */
  omittedFields: DirectorConfigField[];
  model: CinemaVideoModelKey;
  charCount: number;
  promptMaxChars: number;
  trimmedSections: CompiledSectionName[];
};

export type CompileRequest = {
  /** Bottom-bar options — validated by the adapter (requested === submitted). */
  resolution?: string | null;
  aspectRatio?: string | null;
  duration?: string | number | null;
  generateAudio?: boolean | null;
};

type SectionSpec = {
  name: CompiledSectionName;
  priority: number;
  fields: DirectorConfigField[];
};

/** Section order is the emit order; priority governs trimming. */
const SECTION_SPECS: SectionSpec[] = [
  { name: "SCENE", priority: 100, fields: [] },
  { name: "FILM SETUP", priority: 60, fields: ["filmSetup"] },
  { name: "CAMERA", priority: 95, fields: ["camera", "lens", "aperture"] },
  { name: "MOVEMENT", priority: 90, fields: ["movement"] },
  { name: "COMPOSITION", priority: 80, fields: ["composition"] },
  { name: "FOCUS", priority: 55, fields: ["focus"] },
  { name: "LIGHTING", priority: 85, fields: ["lighting"] },
  { name: "COLOR", priority: 75, fields: ["color"] },
  { name: "OPTICS", priority: 45, fields: ["optics"] },
  { name: "ATMOSPHERE", priority: 50, fields: ["atmosphere"] },
  { name: "CHARACTER", priority: 88, fields: ["character"] },
  { name: "REFERENCES", priority: 70, fields: [] },
  { name: "HARD LOCKS", priority: 99, fields: [] },
];

const NEVER_TRIMMED: CompiledSectionName[] = ["SCENE", "CAMERA", "HARD LOCKS"];

function referenceLines(references: CinemaReference[]): string {
  const lines: string[] = [];
  references.slice(0, 8).forEach((ref, index) => {
    const roles = (ref.roles ?? []) as ReferenceRole[];
    if (!roles.length) return;
    const roleText = roles
      .map((role) => {
        const strength = ref.strengths?.[role];
        return typeof strength === "number" ? `${role} ${strength}/100` : role;
      })
      .join(", ");
    lines.push(`REF ${index + 1}${ref.name ? ` (${ref.name})` : ""}: ${roleText}`);
  });
  if (!lines.length) return "";
  return [
    ...lines,
    "Use each reference ONLY for its listed roles. Reference order carries no authority.",
  ].join("\n");
}

function hardLocks(
  config: DirectorConfig,
  nativeParams: Record<string, unknown>,
): string {
  const locks: string[] = [];
  const movement = config.movement?.value;
  if (movement?.motionType === "static") {
    locks.push("Camera is locked off — no pan, tilt, dolly, zoom or handheld drift.");
  } else if (movement && movement.maxDegrees > 0) {
    locks.push(`Do not exceed ${movement.maxDegrees}° of camera arc.`);
  }
  if (config.focus?.value?.focusMode === "locked") {
    locks.push("Focus stays locked — no rack, no hunting.");
  }
  if (nativeParams.generate_audio === false) {
    locks.push("Silent clip — no speech, music or sound design.");
  }
  locks.push("No on-screen text, captions, watermarks or UI overlays.");
  locks.push("Single continuous shot — no cuts, no scene changes.");
  return locks.join("\n");
}

/**
 * Compiles the final model prompt + native params for one shot.
 * `resolvedConfig` MUST come from `resolveCinemaConfig`.
 */
export function cinemaPromptCompiler(args: {
  resolvedConfig: DirectorConfig;
  prompt: string;
  references: CinemaReference[];
  model: CinemaVideoModelKey | string;
  request?: CompileRequest;
}): CompiledPrompt {
  const adapter = getCinemaModelAdapter(args.model);
  const { capabilities } = adapter;
  const nativeParams = adapter.resolveNativeParams(args.request ?? {});

  const omittedFields: DirectorConfigField[] = [];
  const sections: CompiledSection[] = [];

  for (const spec of SECTION_SPECS) {
    let body = "";

    if (spec.name === "SCENE") {
      body = args.prompt.trim();
    } else if (spec.name === "REFERENCES") {
      body = referenceLines(args.references ?? []);
    } else if (spec.name === "HARD LOCKS") {
      body = hardLocks(args.resolvedConfig, nativeParams);
    } else {
      const parts: string[] = [];
      for (const field of spec.fields) {
        const entry = args.resolvedConfig[field];
        if (!entry) continue;
        const resolution = adapter.resolveField(field, entry.value, {
          aperture: args.resolvedConfig.aperture?.value,
        });
        if (resolution.support === "UNSUPPORTED") {
          omittedFields.push(field);
          continue;
        }
        if (resolution.support === "FULL_SUPPORT") {
          if (resolution.nativeParam) {
            nativeParams[resolution.nativeParam.key] = resolution.nativeParam.value;
          }
          continue;
        }
        if (resolution.promptText) parts.push(resolution.promptText);
      }
      body = parts.filter(Boolean).join(". ");
    }

    sections.push({
      name: spec.name,
      body: body.trim(),
      priority: spec.priority,
      included: body.trim().length > 0,
      fields: spec.fields,
    });
  }

  /* Trim lowest-priority sections until the prose fits the model budget. */
  const trimmedSections: CompiledSectionName[] = [];
  const render = () =>
    sections
      .filter((s) => s.included && s.body)
      .map((s) => (s.name === "SCENE" ? s.body : `${s.name}: ${s.body}`))
      .join("\n\n");

  let finalPrompt = render();
  const droppable = sections
    .filter((s) => s.included && !NEVER_TRIMMED.includes(s.name))
    .sort((a, b) => a.priority - b.priority);

  for (const section of droppable) {
    if (finalPrompt.length <= capabilities.promptMaxChars) break;
    section.included = false;
    trimmedSections.push(section.name);
    finalPrompt = render();
  }

  if (finalPrompt.length > capabilities.promptMaxChars) {
    finalPrompt = finalPrompt.slice(0, capabilities.promptMaxChars).trimEnd();
  }

  return {
    finalPrompt,
    nativeParams,
    sections,
    omittedFields: Array.from(new Set(omittedFields)),
    model: adapter.model,
    charCount: finalPrompt.length,
    promptMaxChars: capabilities.promptMaxChars,
    trimmedSections,
  };
}
