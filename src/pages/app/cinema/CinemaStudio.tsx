import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import CinemaComposer from "@/components/cinema/CinemaComposer";
import { SYSTEM_DEFAULT_CONFIG, applyDirectorProposal } from "@/lib/cinema/resolveConfig";
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
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
} from "@/lib/cinema/types";
import type { CinemaFinish } from "@/lib/cinema/finish";

const AUTOSAVE_DELAY_MS = 1200;

export default function CinemaStudio() {
  const [config, setConfig] = useState<DirectorConfig>(() => ({ ...SYSTEM_DEFAULT_CONFIG }));
  const [prompt, setPrompt] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [references, setReferences] = useState<CinemaReference[]>([]);
  /** Non-destructive FINISH grade metadata, keyed by generation id. */
  const [finishes, setFinishes] = useState<Record<string, CinemaFinish>>({});

  const [projects, setProjects] = useState<CinemaProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState("Untitled Project");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  /** Suppresses autosave while a project load replaces the working state. */
  const restoringRef = useRef(false);

  /** Panel edits are USER-sourced unless the panel reports another source. */
  const updateField = useCallback(
    <F extends DirectorConfigField>(
      field: F,
      value: DirectorConfig[F]["value"],
      source: ConfigSource = "USER",
    ) => {
      setConfig((prev) => ({ ...prev, [field]: { value, source } }));
    },
    [],
  );

  /** Director Agent proposals apply only where the field is not USER-sourced. */
  const onApplyDirectorProposal = useCallback((proposal: PartialDirectorConfig) => {
    setConfig((prev) => applyDirectorProposal(prev, proposal).config);
  }, []);

  const workingState = useMemo<CinemaProjectState>(
    () => ({ version: 1, prompt, config, references, scenes: [], shots: [], advanced, finishes }),
    [prompt, config, references, advanced, finishes],
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
      const created = await createCinemaProject("Untitled Project", {
        version: 1,
        prompt: "",
        config: { ...SYSTEM_DEFAULT_CONFIG },
        references: [],
        scenes: [],
        shots: [],
        advanced: false,
        finishes: {},
      });
      restoringRef.current = true;
      setConfig({ ...SYSTEM_DEFAULT_CONFIG });
      setPrompt("");
      setReferences([]);
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
        setPrompt(state.prompt ?? "");
        setConfig({ ...SYSTEM_DEFAULT_CONFIG, ...state.config });
        setReferences(Array.isArray(state.references) ? state.references : []);
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
