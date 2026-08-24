import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import CinemaComposer from "@/components/cinema/CinemaComposer";
import { SYSTEM_DEFAULT_CONFIG, applyDirectorProposal } from "@/lib/cinema/resolveConfig";
import {
  CONTINUITY_FIELDS,
  createScene,
  createShot,
  duplicateShot,
  reorder,
  resolveShot,
  restoreScenes,
} from "@/lib/cinema/shotBoard";
import {
  createCinemaProject,
  listCinemaProjects,
  loadCinemaProject,
  saveCinemaProject,
} from "@/services/cinemaStudio";
import type {
  CinemaProjectState,
  CinemaProjectSummary,
  CinemaReference,
  CinemaScene,
  CinemaShot,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
  Sourced,
} from "@/lib/cinema/types";
import type { CinemaFinish } from "@/lib/cinema/finish";

const AUTOSAVE_DELAY_MS = 1200;

const CONTINUITY_SET = new Set<DirectorConfigField>(CONTINUITY_FIELDS);

export default function CinemaStudio() {
  /* CV8 — the working state IS the active shot within the active scene. */
  const [scenes, setScenes] = useState<CinemaScene[]>(() => [createScene()]);
  const [activeSceneId, setActiveSceneId] = useState<string>(() => "");
  const [activeShotId, setActiveShotId] = useState<string>(() => "");
  const [advanced, setAdvanced] = useState(false);
  /** Non-destructive FINISH grade metadata, keyed by generation id. */
  const [finishes, setFinishes] = useState<Record<string, CinemaFinish>>({});

  const [projects, setProjects] = useState<CinemaProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState("Untitled Project");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  /** Suppresses autosave while a project load replaces the working state. */
  const restoringRef = useRef(false);

  const scene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];
  const shot = scene?.shots.find((s) => s.id === activeShotId) ?? scene?.shots[0];

  /* Keep the active ids valid (first mount, project load, shot deletion). */
  useEffect(() => {
    if (scene && scene.id !== activeSceneId) setActiveSceneId(scene.id);
    if (shot && shot.id !== activeShotId) setActiveShotId(shot.id);
  }, [scene, shot, activeSceneId, activeShotId]);

  /** Resolved config for the active shot: SHOT ▸ SCENE ▸ PROJECT ▸ SYSTEM. */
  const config = useMemo<DirectorConfig>(
    () =>
      scene && shot
        ? resolveShot(scenes, scene.id, shot.id)
        : { ...SYSTEM_DEFAULT_CONFIG },
    [scenes, scene, shot],
  );

  const prompt = shot?.prompt ?? "";
  const references = shot?.references ?? [];
  const continuityLock = Boolean(scene?.continuityLock);

  const patchScene = useCallback(
    (sceneId: string, patch: (s: CinemaScene) => CinemaScene) => {
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? patch(s) : s)));
    },
    [],
  );

  const patchShot = useCallback(
    (shotId: string, patch: (s: CinemaShot) => CinemaShot) => {
      setScenes((prev) =>
        prev.map((s) => ({
          ...s,
          shots: s.shots.map((sh) => (sh.id === shotId ? patch(sh) : sh)),
        })),
      );
    },
    [],
  );

  const setPrompt = useCallback(
    (value: string) => {
      if (!shot) return;
      patchShot(shot.id, (s) => ({ ...s, prompt: value }));
    },
    [shot, patchShot],
  );

  const setReferences = useCallback(
    (next: CinemaReference[]) => {
      if (!shot) return;
      patchShot(shot.id, (s) => ({ ...s, references: next }));
    },
    [shot, patchShot],
  );

  /**
   * Panel edits are USER-sourced unless the panel reports another source.
   * When scene continuity is locked, continuity fields are written at
   * scene.sceneDefaults (and any shot override is cleared) so every shot in the
   * scene inherits them through resolveCinemaConfig.
   */
  const updateField = useCallback(
    <F extends DirectorConfigField>(
      field: F,
      value: DirectorConfig[F]["value"],
      source: ConfigSource = "USER",
    ) => {
      if (!scene || !shot) return;
      const entry = { value, source } as Sourced<unknown>;

      if (continuityLock && CONTINUITY_SET.has(field)) {
        patchScene(scene.id, (s) => ({
          ...s,
          sceneDefaults: { ...(s.sceneDefaults ?? {}), [field]: entry } as PartialDirectorConfig,
          shots: s.shots.map((sh) => {
            const overrides = { ...(sh.directorOverrides ?? {}) } as Record<string, unknown>;
            delete overrides[field];
            return { ...sh, directorOverrides: overrides as PartialDirectorConfig };
          }),
        }));
        return;
      }

      patchShot(shot.id, (s) => ({
        ...s,
        directorOverrides: {
          ...(s.directorOverrides ?? {}),
          [field]: entry,
        } as PartialDirectorConfig,
      }));
    },
    [scene, shot, continuityLock, patchScene, patchShot],
  );

  /**
   * Director Agent proposals apply only where the field is not USER-sourced,
   * and never touch a continuity-locked field while the lock is on.
   */
  const onApplyDirectorProposal = useCallback(
    (proposal: PartialDirectorConfig) => {
      if (!shot) return;
      const next = applyDirectorProposal(config, proposal).config;
      patchShot(shot.id, (s) => {
        const overrides = { ...(s.directorOverrides ?? {}) } as Record<string, unknown>;
        (Object.keys(next) as DirectorConfigField[]).forEach((field) => {
          if (continuityLock && CONTINUITY_SET.has(field)) return;
          overrides[field] = next[field];
        });
        return { ...s, directorOverrides: overrides as PartialDirectorConfig };
      });
    },
    [shot, config, continuityLock, patchShot],
  );

  /* ------------------------- shot board actions ------------------------- */

  const onAddShot = useCallback(() => {
    if (!scene) return;
    const created = createShot();
    patchScene(scene.id, (s) => ({ ...s, shots: [...s.shots, created] }));
    setActiveShotId(created.id);
  }, [scene, patchScene]);

  const onDuplicateShot = useCallback(
    (shotId: string) => {
      if (!scene) return;
      const source = scene.shots.find((s) => s.id === shotId);
      if (!source) return;
      const copy = duplicateShot(source);
      patchScene(scene.id, (s) => {
        const index = s.shots.findIndex((sh) => sh.id === shotId);
        const shots = [...s.shots];
        shots.splice(index + 1, 0, copy);
        return { ...s, shots };
      });
      setActiveShotId(copy.id);
    },
    [scene, patchScene],
  );

  const onDeleteShot = useCallback(
    (shotId: string) => {
      if (!scene || scene.shots.length <= 1) return;
      const remaining = scene.shots.filter((s) => s.id !== shotId);
      patchScene(scene.id, (s) => ({ ...s, shots: remaining }));
      if (shotId === activeShotId) setActiveShotId(remaining[0].id);
    },
    [scene, activeShotId, patchScene],
  );

  const onReorderShots = useCallback(
    (from: number, to: number) => {
      if (!scene) return;
      patchScene(scene.id, (s) => ({ ...s, shots: reorder(s.shots, from, to) }));
    },
    [scene, patchScene],
  );

  /**
   * LOCK SCENE CONTINUITY: promotes the active shot's continuity fields to
   * scene defaults and clears them from every shot, so they stay constant.
   */
  const onToggleContinuity = useCallback(
    (value: boolean) => {
      if (!scene) return;
      patchScene(scene.id, (s) => {
        if (!value) return { ...s, continuityLock: false };
        const defaults = { ...(s.sceneDefaults ?? {}) } as Record<string, unknown>;
        CONTINUITY_FIELDS.forEach((field) => {
          defaults[field] = config[field];
        });
        return {
          ...s,
          continuityLock: true,
          sceneDefaults: defaults as PartialDirectorConfig,
          shots: s.shots.map((sh) => {
            const overrides = { ...(sh.directorOverrides ?? {}) } as Record<string, unknown>;
            CONTINUITY_FIELDS.forEach((field) => delete overrides[field]);
            return { ...sh, directorOverrides: overrides as PartialDirectorConfig };
          }),
        };
      });
    },
    [scene, config, patchScene],
  );

  /** Records a new generation id onto the ACTIVE shot (per-shot history). */
  const onGenerationCreated = useCallback(
    (generationId: string) => {
      if (!shot) return;
      patchShot(shot.id, (s) => ({
        ...s,
        generationIds: [...(s.generationIds ?? []), generationId],
      }));
    },
    [shot, patchShot],
  );

  const resolveShotConfig = useCallback(
    (shotId: string) =>
      scene ? resolveShot(scenes, scene.id, shotId) : { ...SYSTEM_DEFAULT_CONFIG },
    [scenes, scene],
  );

  /* --------------------------- persistence ---------------------------- */

  const workingState = useMemo<CinemaProjectState>(
    () => ({
      version: 1,
      prompt,
      config,
      references,
      scenes,
      shots: [],
      advanced,
      finishes,
      activeSceneId: scene?.id,
      activeShotId: shot?.id,
    }),
    [prompt, config, references, scenes, advanced, finishes, scene?.id, shot?.id],
  );

  useEffect(() => {
    listCinemaProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  /* Debounced autosave of the working state into cinema_projects. */
  useEffect(() => {
    if (!activeProjectId || restoringRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      saveCinemaProject(activeProjectId, workingState)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, workingState]);

  const onNewProject = useCallback(async () => {
    try {
      setSaveState("saving");
      const freshScene = createScene();
      const created = await createCinemaProject("Untitled Project", {
        version: 1,
        prompt: "",
        config: { ...SYSTEM_DEFAULT_CONFIG },
        references: [],
        scenes: [freshScene],
        shots: [],
        advanced: false,
        finishes: {},
        activeSceneId: freshScene.id,
        activeShotId: freshScene.shots[0].id,
      });
      restoringRef.current = true;
      setScenes([freshScene]);
      setActiveSceneId(freshScene.id);
      setActiveShotId(freshScene.shots[0].id);
      setFinishes({});
      setAdvanced(false);
      setActiveProjectId(created.id);
      setActiveName(created.name);
      setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      setSaveState("saved");
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    } catch {
      setSaveState("error");
    }
  }, []);

  const onSelectProject = useCallback(async (projectId: string) => {
    try {
      restoringRef.current = true;
      const { summary, state } = await loadCinemaProject(projectId);
      setActiveProjectId(summary.id);
      setActiveName(summary.name);
      if (state) {
        /* Legacy single-shot projects migrate into scene[0].shot[0]. */
        const restored = restoreScenes(state);
        setScenes(restored);
        const nextScene =
          restored.find((s) => s.id === state.activeSceneId) ?? restored[0];
        const nextShot =
          nextScene.shots.find((s) => s.id === state.activeShotId) ?? nextScene.shots[0];
        setActiveSceneId(nextScene.id);
        setActiveShotId(nextShot.id);
        setAdvanced(Boolean(state.advanced));
        setFinishes(
          state.finishes && typeof state.finishes === "object" ? state.finishes : {},
        );
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      window.setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    }
  }, []);

  const onRename = useCallback(
    async (name: string) => {
      setActiveName(name);
      if (!activeProjectId) return;
      try {
        setSaveState("saving");
        await saveCinemaProject(activeProjectId, workingState, name);
        setProjects((prev) =>
          prev.map((p) => (p.id === activeProjectId ? { ...p, name } : p)),
        );
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [activeProjectId, workingState],
  );

  return (
    <SiteShell>
      <section className="container py-10">
        <CinemaComposer
          config={config}
          prompt={prompt}
          onPromptChange={setPrompt}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          references={references}
          onReferencesChange={setReferences}
          updateField={updateField}
          onApplyDirectorProposal={onApplyDirectorProposal}
          cinemaProjectId={activeProjectId}
          finishes={finishes}
          onFinishesChange={setFinishes}
          onGenerationCreated={onGenerationCreated}
          shotBoard={
            scene && shot
              ? {
                  shots: scene.shots,
                  activeShotId: shot.id,
                  sceneName: scene.name,
                  continuityLock,
                  resolveShotConfig,
                  onSelectShot: setActiveShotId,
                  onAddShot,
                  onDuplicateShot,
                  onDeleteShot,
                  onReorder: onReorderShots,
                  onToggleContinuity,
                }
              : undefined
          }
          projectPicker={{
            projects,
            activeProjectId,
            activeName,
            saveState,
            onNewProject,
            onSelectProject,
            onRename,
          }}
        />
      </section>
    </SiteShell>
  );
}
