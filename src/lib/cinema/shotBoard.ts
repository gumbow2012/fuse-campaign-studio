/**
 * FUSE Cinema — CV8 Shot Board state helpers (Project ▸ Scene ▸ Shot).
 *
 * Pure state math only: no provider calls, no generation, no credit logic.
 * Inheritance itself still lives ONLY in resolveConfig.ts — this file just
 * shapes the scenes[]/shots[] tree that resolver reads.
 */

import type {
  CinemaProject,
  CinemaProjectState,
  CinemaReference,
  CinemaScene,
  CinemaShot,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
} from "./types";
import { SYSTEM_DEFAULT_CONFIG, resolveCinemaConfig } from "./resolveConfig";

/**
 * Fields pinned by LOCK SCENE CONTINUITY. These live at scene.sceneDefaults so
 * every shot in the scene inherits them, while camera / movement / composition /
 * optics stay free per shot.
 */
export const CONTINUITY_FIELDS: DirectorConfigField[] = [
  "character",
  "atmosphere",
  "color",
  "lighting",
];

export const CONTINUITY_LABELS: Record<string, string> = {
  character: "Character + wardrobe",
  atmosphere: "Location / environment",
  color: "Color family",
  lighting: "Lighting family",
};

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function createShot(init?: Partial<CinemaShot>): CinemaShot {
  return {
    id: uid(),
    prompt: "",
    directorOverrides: {},
    references: [],
    generations: [],
    generationIds: [],
    ...init,
  };
}

export function createScene(init?: Partial<CinemaScene>): CinemaScene {
  return {
    id: uid(),
    name: "Scene 1",
    sceneDefaults: {},
    continuityLock: false,
    shots: [createShot()],
    ...init,
  };
}

/** Duplicates a shot's setup — never its generation history. */
export function duplicateShot(shot: CinemaShot): CinemaShot {
  return createShot({
    prompt: shot.prompt,
    directorOverrides: { ...(shot.directorOverrides ?? {}) },
    references: shot.references.map((r) => ({ ...r })),
    modelConfig: shot.modelConfig,
  });
}

export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Restores scenes/shots from a persisted state, migrating LEGACY single-shot
 * projects (prompt + config + references at the root) into scene[0].shot[0].
 */
export function restoreScenes(state: Partial<CinemaProjectState> | null | undefined): CinemaScene[] {
  const scenes = state?.scenes;
  if (Array.isArray(scenes) && scenes.length) {
    return scenes.map((scene) => ({
      ...scene,
      id: scene.id || uid(),
      name: scene.name || "Scene 1",
      sceneDefaults: scene.sceneDefaults ?? {},
      continuityLock: Boolean(scene.continuityLock),
      shots: (Array.isArray(scene.shots) && scene.shots.length ? scene.shots : [createShot()]).map(
        (shot) => ({
          ...shot,
          id: shot.id || uid(),
          prompt: shot.prompt ?? "",
          directorOverrides: shot.directorOverrides ?? {},
          references: Array.isArray(shot.references) ? shot.references : [],
          generations: Array.isArray(shot.generations) ? shot.generations : [],
          generationIds: Array.isArray(shot.generationIds) ? shot.generationIds : [],
        }),
      ),
    }));
  }

  /* Legacy single-shot project. */
  const legacyShot = createShot({
    prompt: state?.prompt ?? "",
    directorOverrides: (state?.config as PartialDirectorConfig | undefined) ?? {},
    references: Array.isArray(state?.references) ? (state?.references as CinemaReference[]) : [],
  });
  return [createScene({ shots: [legacyShot] })];
}

/** Builds the synthetic CinemaProject the resolver reads (project defaults = system). */
export function asResolverProject(scenes: CinemaScene[], name = "Cinema"): CinemaProject {
  return {
    id: "cinema-working",
    userId: "",
    name,
    projectDefaults: SYSTEM_DEFAULT_CONFIG,
    references: [],
    scenes,
  };
}

/** Resolved config for one shot: SHOT override ▸ SCENE default ▸ PROJECT ▸ SYSTEM. */
export function resolveShot(
  scenes: CinemaScene[],
  sceneId: string,
  shotId: string,
): DirectorConfig {
  return resolveCinemaConfig(asResolverProject(scenes), sceneId, shotId);
}
