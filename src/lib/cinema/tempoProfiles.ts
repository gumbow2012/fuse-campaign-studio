/**
 * FUSE Cinema — tempo / pacing profiles.
 *
 * Additive, cinema-local. Gives the EXISTING Film Setup tempo vocabulary a
 * visual + prose meaning. Nothing here is imported outside cinema files.
 *
 * Timing figures are schematic approximations for a 10-second reference clip;
 * exact cut behavior is provider/model dependent.
 */

export type TempoBand = "SINGLE SHOT" | "CALM" | "STEADY" | "DYNAMIC" | "CHAOTIC";

export type TempoProfile = {
  /** Must match the existing Film Setup tempo values exactly. */
  value: string;
  band: TempoBand;
  /** Visual beats (cut/energy segments) per 10 seconds. */
  beatsPer10s: number;
  /** Approximate average shot length in seconds. */
  avgShotSeconds: number;
  /** 0–100 camera energy. */
  cameraEnergy: number;
  /** 0–100 subject/scene motion intensity. */
  motionIntensity: number;
  /** Short human line shown on the card. */
  summary: string;
  /** Model-safe prose injected into the compiled prompt. */
  promptText: string;
};

export const TEMPO_PROFILES: TempoProfile[] = [
  {
    value: "Still",
    band: "SINGLE SHOT",
    beatsPer10s: 1,
    avgShotSeconds: 10,
    cameraEnergy: 4,
    motionIntensity: 6,
    summary: "One unbroken shot · no cuts · near-motionless frame",
    promptText:
      "pacing: one unbroken shot for the full clip, no cuts, near-motionless frame, motion limited to micro-detail",
  },
  {
    value: "Very Slow",
    band: "CALM",
    beatsPer10s: 1,
    avgShotSeconds: 10,
    cameraEnergy: 14,
    motionIntensity: 16,
    summary: "1 shot / 10 sec · glacial drift · contemplative",
    promptText:
      "pacing: single continuous shot, glacial camera drift, contemplative timing with long held beats",
  },
  {
    value: "Slow Burn",
    band: "CALM",
    beatsPer10s: 2,
    avgShotSeconds: 5,
    cameraEnergy: 26,
    motionIntensity: 28,
    summary: "1–2 beats / 10 sec · gradual build · patient",
    promptText:
      "pacing: 1-2 visual beats across ten seconds, gradual build, patient sustained movement rather than bursts",
  },
  {
    value: "Steady",
    band: "STEADY",
    beatsPer10s: 3,
    avgShotSeconds: 3.5,
    cameraEnergy: 40,
    motionIntensity: 42,
    summary: "≈3 beats / 10 sec · even, measured motion",
    promptText:
      "pacing: even measured rhythm, roughly three visual beats across ten seconds, consistent continuous motion",
  },
  {
    value: "Rhythmic",
    band: "DYNAMIC",
    beatsPer10s: 4,
    avgShotSeconds: 2.5,
    cameraEnergy: 56,
    motionIntensity: 58,
    summary: "3–5 beats / 10 sec · on-beat pulse",
    promptText:
      "pacing: 3-5 visual beats across ten seconds, motion phrased on a musical pulse with clear repeating accents",
  },
  {
    value: "Energetic",
    band: "DYNAMIC",
    beatsPer10s: 5,
    avgShotSeconds: 2,
    cameraEnergy: 72,
    motionIntensity: 76,
    summary: "4–5 beats / 10 sec · driving, athletic energy",
    promptText:
      "pacing: driving athletic energy, 4-5 visual beats across ten seconds, assertive camera and subject movement",
  },
  {
    value: "Frantic",
    band: "CHAOTIC",
    beatsPer10s: 7,
    avgShotSeconds: 1.4,
    cameraEnergy: 88,
    motionIntensity: 92,
    summary: "6+ beats / 10 sec · restless, urgent",
    promptText:
      "pacing: restless urgent motion, six or more visual beats across ten seconds, continuous high-velocity movement",
  },
  {
    value: "Staccato Cuts",
    band: "CHAOTIC",
    beatsPer10s: 9,
    avgShotSeconds: 1.1,
    cameraEnergy: 82,
    motionIntensity: 86,
    summary: "6+ hard beats / 10 sec · abrupt punctuation",
    promptText:
      "pacing: abrupt staccato punctuation, six or more hard visual beats across ten seconds, motion arriving in sharp bursts with hard stops",
  },
];

export const TEMPO_VALUES = TEMPO_PROFILES.map((t) => t.value);

export function getTempoProfile(value?: string | null): TempoProfile | undefined {
  if (!value) return undefined;
  const key = `${value}`.trim().toLowerCase();
  return TEMPO_PROFILES.find((t) => t.value.toLowerCase() === key);
}

/** Model-safe prose for the compiled prompt. Never throws. */
export function tempoPromptText(value?: string | null): string {
  try {
    const profile = getTempoProfile(value);
    if (!profile) return value ? `${value} tempo` : "";
    return `${profile.value} tempo (${profile.promptText})`;
  } catch {
    return "";
  }
}
