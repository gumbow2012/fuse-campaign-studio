import { useCallback, useEffect, useRef, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import MaddenProjectSwitcher from "@/components/madden-media/MaddenProjectSwitcher";
import MaddenSubjectPanel from "@/components/madden-media/MaddenSubjectPanel";
import MaddenOutfitPanel from "@/components/madden-media/MaddenOutfitPanel";
import MaddenJewelryPanel from "@/components/madden-media/MaddenJewelryPanel";
import MaddenPresetPicker from "@/components/madden-media/MaddenPresetPicker";
import MaddenShotBoard from "@/components/madden-media/MaddenShotBoard";
import MaddenShotPackPanel from "@/components/madden-media/MaddenShotPackPanel";
import MaddenRecipePanel from "@/components/madden-media/MaddenRecipePanel";
import MaddenPromptPreview from "@/components/madden-media/MaddenPromptPreview";

import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MADDEN_CINEMATOGRAPHY_PRESETS } from "@/lib/madden-media/cinematographyPresets";
import { MADDEN_LIGHTING_PRESETS } from "@/lib/madden-media/lightingPresets";
import { MADDEN_ENVIRONMENT_PRESETS } from "@/lib/madden-media/environmentPresets";
import {
  createEmptyProjectState,
  type MaddenProjectState,
  type MaddenProjectSummary,
  type MaddenShot,
  type MaddenSlot,
  type MaddenSlotKind,
} from "@/lib/madden-media/types";

import {
  applyRecipeToState,
  buildRecipeConfigFromState,
  type MaddenRecipe,
} from "@/lib/madden-media/recipes";

import {
  createProject,
  saveUserRecipe,
  deleteProject,
  listProjects,
  loadProject,
  renameProject,
  saveProjectState,
} from "@/services/maddenMediaStudio";

const AUTOSAVE_DELAY_MS = 1200;

export default function MaddenMediaStudio() {
  const [projects, setProjects] = useState<MaddenProjectSummary[]>([]);
  const [recipeRefreshKey, setRecipeRefreshKey] = useState(0);
  const presetsRef = useRef<HTMLDivElement | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [state, setState] = useState<MaddenProjectState>(() => createEmptyProjectState());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);

  /** Suppresses autosave while a load replaces the working state. */
  const restoringRef = useRef(false);

  const refreshProjects = useCallback(async () => {
    const rows = await listProjects();
    setProjects(rows);
    return rows;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await refreshProjects();
        if (rows[0]) await openProject(rows[0].id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load your projects");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProject = useCallback(async (id: string) => {
    restoringRef.current = true;
    try {
      const project = await loadProject(id);
      setActiveProjectId(project.id);
      setName(project.name);
      setState(project.projectState);
      setSaveState("idle");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that project");
    } finally {
      // Let the state commit before autosave re-arms.
      setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    }
  }, []);

  /* Debounced project_state autosave. */
  useEffect(() => {
    if (!activeProjectId || restoringRef.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveProjectState(activeProjectId, state)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeProjectId, state]);

  /* Debounced rename. */
  useEffect(() => {
    if (!activeProjectId || restoringRef.current) return;
    const timer = setTimeout(() => {
      void renameProject(activeProjectId, name)
        .then(() =>
          setProjects((prev) =>
            prev.map((p) => (p.id === activeProjectId ? { ...p, name: name.trim() || "Untitled project" } : p)),
          ),
        )
        .catch(() => setSaveState("error"));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeProjectId, name]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const project = await createProject("Untitled project");
      restoringRef.current = true;
      setActiveProjectId(project.id);
      setName(project.name);
      setState(project.projectState);
      setSaveState("idle");
      setTimeout(() => {
        restoringRef.current = false;
      }, 0);
      await refreshProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that project");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      const rows = await refreshProjects();
      if (id === activeProjectId) {
        if (rows[0]) {
          await openProject(rows[0].id);
        } else {
          restoringRef.current = true;
          setActiveProjectId(null);
          setName("");
          setState(createEmptyProjectState());
          setTimeout(() => {
            restoringRef.current = false;
          }, 0);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that project");
    }
  };

  const updateSlot = (kind: MaddenSlotKind, patch: Partial<MaddenSlot>) => {
    setState((prev) => ({
      ...prev,
      slots: { ...prev.slots, [kind]: { ...prev.slots[kind], ...patch } },
    }));
  };

  const addShot = () => {
    setState((prev) => ({
      ...prev,
      shots: [
        ...prev.shots,
        {
          id: crypto.randomUUID(),
          title: `Shot ${prev.shots.length + 1}`,
          direction: "",
          durationSeconds: 5,
          inheritSlots: [],
        },
      ],
    }));
  };

  const updateShot = (id: string, patch: Partial<MaddenShot>) => {
    setState((prev) => ({
      ...prev,
      shots: prev.shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)),
    }));
  };

  const removeShot = (id: string) => {
    setState((prev) => ({ ...prev, shots: prev.shots.filter((shot) => shot.id !== id) }));
  };

  const applyRecipe = (recipe: MaddenRecipe) => {
    let skipped: MaddenSlotKind[] = [];
    setState((prev) => {
      const result = applyRecipeToState(prev, recipe.config);
      skipped = result.skipped;
      return result.next;
    });
    if (skipped.length > 0) {
      toast.success(`${recipe.name} applied — kept your locked ${skipped.join(", ")}`);
    } else {
      toast.success(`${recipe.name} applied`);
    }
  };

  const customizeRecipe = (recipe: MaddenRecipe) => {
    applyRecipe(recipe);
    setTimeout(() => {
      presetsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const saveCurrentAsRecipe = async (recipeName: string) => {
    try {
      const config = buildRecipeConfigFromState(state);
      await saveUserRecipe({ name: recipeName, tags: [], config });
      setRecipeRefreshKey((key) => key + 1);
      toast.success("Recipe saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that recipe");
    }
  };

  const applyShotPack = (pack: MaddenShotPack) => {
    setState((prev) => applyShotPackToState(prev, pack));
    toast.success(`${pack.name} applied — ${pack.shots.length} shots`);
  };

  const handlePromptChange = (value: string) => {

    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, promptOverride: value, promptUserEdited: true },
    }));
  };

  const handleResetPrompt = () => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, promptOverride: "", promptUserEdited: false },
    }));
  };

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Save failed"
          : activeProjectId
            ? "Up to date"
            : "No project";

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Madden Media Studio
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Artist reference workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Vertical 9:16 short-form built around locked subject, outfit, jewelry and environment
            continuity. This is the workspace foundation — nothing generates yet.
          </p>
        </header>

        <MaddenProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId}
          name={name}
          saveLabel={saveLabel}
          busy={busy}
          onSelect={(id) => void openProject(id)}
          onCreate={() => void handleCreate()}
          onNameChange={setName}
          onDelete={(id) => void handleDelete(id)}
        />

        {!activeProjectId ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
            Create a project to open the studio canvas.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <MaddenSubjectPanel
                slot={state.slots.subject}
                onBind={(patch) => updateSlot("subject", patch as Partial<MaddenSlot>)}
              />
              <MaddenOutfitPanel
                slot={state.slots.outfit}
                onBind={(patch) => updateSlot("outfit", patch as Partial<MaddenSlot>)}
              />
              <MaddenJewelryPanel
                slot={state.slots.jewelry}
                onBind={(patch) => updateSlot("jewelry", patch as Partial<MaddenSlot>)}
              />
            </div>

            <MaddenRecipePanel
              onApply={applyRecipe}
              onCustomize={customizeRecipe}
              onSaveCurrent={saveCurrentAsRecipe}
              refreshKey={recipeRefreshKey}
            />

            <div ref={presetsRef} className="grid gap-4 md:grid-cols-2">
              <MaddenPresetPicker
                title="Cinematography"
                description="Camera, lens and framing language applied across the board."
                presets={MADDEN_CINEMATOGRAPHY_PRESETS}
                selectedId={state.settings.cinematographyId}
                onSelect={(id) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, cinematographyId: id },
                  }))
                }
              />
              <MaddenPresetPicker
                title="Lighting"
                description="The lighting setup every shot inherits."
                presets={MADDEN_LIGHTING_PRESETS}
                selectedId={state.settings.lightingId}
                onSelect={(id) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, lightingId: id },
                  }))
                }
              />
              <div className="md:col-span-2">
                <MaddenPresetPicker
                  title="Environment"
                  description="Location and scene continuity — this also fills the project's environment slot."
                  presets={MADDEN_ENVIRONMENT_PRESETS}
                  selectedId={state.settings.environmentId}
                  onSelect={(id) => {
                    const preset = id
                      ? MADDEN_ENVIRONMENT_PRESETS.find((p) => p.id === id) ?? null
                      : null;
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, environmentId: id },
                      slots: {
                        ...prev.slots,
                        environment: {
                          ...prev.slots.environment,
                          name: preset?.name ?? "",
                          description: preset?.promptFragment ?? "",
                        },
                      },
                    }));
                  }}
                />
              </div>
            </div>


            <MaddenPromptPreview
              state={state}
              onPromptChange={handlePromptChange}
              onResetPrompt={handleResetPrompt}
            />

            <MaddenShotPackPanel
              projectId={activeProjectId}
              state={state}
              onApplyPack={applyShotPack}
            />

            <MaddenShotBoard
              shots={state.shots}
              onAdd={addShot}
              onChange={updateShot}
              onRemove={removeShot}
            />


            <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
              <h3 className="font-semibold tracking-tight">Project notes</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Direction that applies to every shot.
              </p>
              <Textarea
                value={state.settings.globalNotes}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, globalNotes: event.target.value },
                  }))
                }
                rows={3}
                className="mt-3"
                placeholder="Tone, pacing, references, do-not-do list"
              />
            </section>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
