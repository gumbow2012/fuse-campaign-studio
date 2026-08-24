import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ConfigTile from "./ConfigTile";
import CinemaStage from "./CinemaStage";
import { buildActiveConfigTiles } from "@/lib/cinema/activeConfigTiles";

import ChipModal from "./ChipModal";
import CameraPanel from "./CameraPanel";
import MovementPanel from "./MovementPanel";
import LightingPanel from "./LightingPanel";
import ColorPanel from "./ColorPanel";
import CompositionPanel from "./CompositionPanel";
import OpticsPanel from "./OpticsPanel";
import AtmospherePanel from "./AtmospherePanel";
import DirectorAgentPanel from "./DirectorAgentPanel";
import FilmSetupPanel from "./FilmSetupPanel";
import FullPresetPanel from "./FullPresetPanel";
import ReferenceManager from "./ReferenceManager";
import ReferenceBoard from "./ReferenceBoard";

import CinemaProjectPicker, { type CinemaProjectPickerProps } from "./CinemaProjectPicker";
import type {
  CinemaReference,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
} from "@/lib/cinema/types";
import PreviewManifestReadout from "./PreviewManifestReadout";
import PromptPreview from "./PromptPreview";
import {
  CINEMA_MODEL_ADAPTERS,
  CINEMA_MODEL_CAPABILITIES,
  CINEMA_MODEL_KEYS,
  type CinemaVideoModelKey,
} from "@/lib/cinema/modelAdapters";
import { cinemaPromptCompiler } from "@/lib/cinema/promptCompiler";
import {
  listCinemaGenerations,
  startCinemaGeneration,
  syncCinemaGeneration,
  type CinemaGeneration,
} from "@/services/cinemaStudio";
import { toast } from "sonner";

type ChipKey = "references" | "presets" | DirectorConfigField;

const CHIPS: Array<{ key: ChipKey; label: string }> = [
  { key: "references", label: "References" },
  { key: "presets", label: "Presets" },
  { key: "filmSetup", label: "Film Setup" },
  { key: "camera", label: "Camera" },
  { key: "movement", label: "Movement" },
  { key: "composition", label: "Composition" },
  { key: "lighting", label: "Lighting" },
  { key: "color", label: "Color" },
  { key: "optics", label: "Optics" },
  { key: "atmosphere", label: "Atmosphere" },
];

const MODEL_LABELS: Record<CinemaVideoModelKey, string> = {
  "kling-3.0-pro": "Kling 3.0 Pro",
  "kling-3.0-standard": "Kling 3.0 Standard",
  "kling-2.5": "Kling 2.5",
  "seedance-2.0": "Seedance 2.0",
  "seedance-2.0-fast": "Seedance 2.0 Fast",
};

const MODEL_KEYS = CINEMA_MODEL_KEYS;
const POLL_INTERVAL_MS = 6000;
const DEFAULT_MODEL: CinemaVideoModelKey = "kling-3.0-pro";

/* Bottom-bar defaults must come from the model's own schema — a hardcoded
   default (e.g. "9:16") would be submitted to a model that has no such
   setting and the adapter rejects it. */
function defaultResolution(model: CinemaVideoModelKey): string {
  return CINEMA_MODEL_CAPABILITIES[model].resolutions[0] ?? "";
}

function defaultAspect(model: CinemaVideoModelKey): string {
  const caps = CINEMA_MODEL_CAPABILITIES[model];
  if (caps.fixedAspect) return caps.fixedAspect;
  if (!caps.aspectRatios.length) return "";
  return caps.aspectRatios.includes("9:16") ? "9:16" : caps.aspectRatios[0];
}

function defaultDuration(model: CinemaVideoModelKey): string {
  const durations = CINEMA_MODEL_CAPABILITIES[model].durations;
  if (!durations.length) return "";
  return durations.includes("5") ? "5" : durations[0];
}



export interface CinemaComposerProps {
  config: DirectorConfig;
  prompt: string;
  onPromptChange: (value: string) => void;
  advanced: boolean;
  onAdvancedChange: (value: boolean) => void;
  references: CinemaReference[];
  onReferencesChange: (references: CinemaReference[]) => void;
  projectPicker: CinemaProjectPickerProps;
  /** Writes config[field] = { value, source } (defaults to "USER"). */
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  /** Merges a Director Agent proposal (never overwrites USER fields). */
  onApplyDirectorProposal: (proposal: PartialDirectorConfig) => void;
  /** Generations are tagged with the active project (null = unsaved workspace). */
  cinemaProjectId?: string | null;
}

export default function CinemaComposer({
  config,
  prompt,
  onPromptChange,
  advanced,
  onAdvancedChange,
  references,
  onReferencesChange,
  projectPicker,
  updateField,
  onApplyDirectorProposal,
  cinemaProjectId = null,
}: CinemaComposerProps) {
  const [openChip, setOpenChip] = useState<ChipKey | null>(null);
  const [model, setModel] = useState<CinemaVideoModelKey>(DEFAULT_MODEL);
  const [resolution, setResolution] = useState<string>(() => defaultResolution(DEFAULT_MODEL));
  const [aspectRatio, setAspectRatio] = useState<string>(() => defaultAspect(DEFAULT_MODEL));
  const [duration, setDuration] = useState<string>(() => defaultDuration(DEFAULT_MODEL));
  const [audio, setAudio] = useState(false);
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generations, setGenerations] = useState<CinemaGeneration[]>([]);
  const [revisionIndex, setRevisionIndex] = useState(0);
  const [focusKey, setFocusKey] = useState<ChipKey | null>(null);

  const activeChip = CHIPS.find((c) => c.key === openChip) ?? null;

  /* Bottom-bar options come from the SELECTED model's live schema:
     an option a model cannot do is never offered, so requested === submitted. */
  const capabilities = CINEMA_MODEL_CAPABILITIES[model];

  useEffect(() => {
    setResolution((prev) =>
      capabilities.resolutions.length
        ? (capabilities.resolutions.includes(prev) ? prev : capabilities.resolutions[0])
        : "",
    );
    setAspectRatio((prev) => {
      if (capabilities.fixedAspect) return capabilities.fixedAspect;
      if (!capabilities.aspectRatios.length) return "";
      return capabilities.aspectRatios.includes(prev) ? prev : capabilities.aspectRatios[0];
    });
    setDuration((prev) =>
      capabilities.durations.includes(prev) ? prev : (capabilities.durations[0] ?? ""),
    );
    if (!capabilities.supportsAudio) setAudio(false);
  }, [capabilities]);

  /* The adapter rejects any option the selected model cannot do. Surface that
     as a message instead of letting it unmount the studio. */
  const [compiled, compileError] = useMemo(() => {
    const build = (request: Parameters<typeof cinemaPromptCompiler>[0]["request"]) =>
      cinemaPromptCompiler({ resolvedConfig: config, prompt, references, model, request });
    try {
      return [
        build({
          resolution: resolution || null,
          aspectRatio: aspectRatio || null,
          duration: duration || null,
          generateAudio: capabilities.supportsAudio ? audio : null,
        }),
        null as string | null,
      ] as const;
    } catch (error) {
      return [
        build({ resolution: null, aspectRatio: null, duration: null, generateAudio: null }),
        error instanceof Error ? error.message : "This option is not available on this model",
      ] as const;
    }
  }, [config, prompt, references, model, resolution, aspectRatio, duration, audio, capabilities]);


  /* Load the project's revision history (append-only, oldest first). */
  useEffect(() => {
    let cancelled = false;
    listCinemaGenerations(cinemaProjectId)
      .then((rows) => {
        if (cancelled) return;
        setGenerations(rows);
        setRevisionIndex(Math.max(0, rows.length - 1));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cinemaProjectId]);

  /* Poll any in-flight generation until it settles. */
  const pendingIds = generations
    .filter((g) => g.status === "queued" || g.status === "running")
    .map((g) => g.id)
    .join(",");
  const pendingRef = useRef(pendingIds);
  pendingRef.current = pendingIds;

  useEffect(() => {
    if (!pendingIds) return;
    const timer = window.setInterval(async () => {
      const ids = pendingRef.current.split(",").filter(Boolean);
      for (const id of ids) {
        try {
          const next = await syncCinemaGeneration(id);
          setGenerations((prev) => prev.map((g) => (g.id === next.id ? next : g)));
        } catch {
          /* transient — keep polling */
        }
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pendingIds]);

  const finalPrompt = promptOverride ?? compiled.finalPrompt;
  const canGenerate = !generating && !compileError && finalPrompt.trim().length > 0;


  const onGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const created = await startCinemaGeneration({
        model,
        prompt: finalPrompt,
        promptSource: promptOverride === null ? "COMPILED" : "USER_EDITED",
        nativeParams: compiled.nativeParams,
        resolvedConfig: config,
        references: references.map((ref) => ({
          url: ref.url,
          name: ref.name ?? null,
          roles: ref.roles,
        })),
        referenceUrls: references.map((ref) => ref.url).filter(Boolean),
        presetIds: [],
        cinemaProjectId,
      });
      setGenerations((prev) => {
        const next = [...prev, created];
        setRevisionIndex(next.length - 1);
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation could not be started");
    } finally {
      setGenerating(false);
    }
  };

  const tiles = useMemo(() => buildActiveConfigTiles(config, references), [config, references]);
  const focusTile =
    tiles.find((tile) => tile.key === focusKey) ??
    tiles.find((tile) => tile.key === "camera") ??
    tiles[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">FUSE Cinema</h1>
        <div className="flex items-center gap-3">
          <CinemaProjectPicker {...projectPicker} />
          <Label
            htmlFor="cinema-advanced"
            className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Advanced
          </Label>
          <Switch id="cinema-advanced" checked={advanced} onCheckedChange={onAdvancedChange} />
        </div>
      </div>

      {/* 1 — VISUAL STAGE (hero) */}
      <CinemaStage
        generations={generations}
        index={revisionIndex}
        onIndexChange={setRevisionIndex}
        references={references}
        focusTile={focusTile}
      />

      {/* 1b — VISIBLE REFERENCE BOARD (same reference state as the modal) */}
      <ReferenceBoard
        references={references}
        onChange={onReferencesChange}
        advanced={advanced}
      />

      {/* 2 — ACTIVE CONFIG STRIP (visual selections over the existing panels) */}
      <div className="fuse-panel rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <span className="font-display text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Shot setup
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {MODEL_LABELS[model]}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tiles.map((tile) => (
            <ConfigTile
              key={tile.key}
              tile={tile}
              active={openChip === tile.opens || focusKey === tile.key}
              onClick={() => {
                setFocusKey(tile.key);
                if (tile.opens === "references") {
                  document
                    .getElementById("cinema-reference-board")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  return;
                }
                setOpenChip(tile.opens);
              }}
            />
          ))}
        </div>
      </div>


      {/* 3 — secondary scene prompt */}
      <div className="fuse-panel rounded-2xl p-3">
        <Label
          htmlFor="cinema-scene-prompt"
          className="px-1 font-display text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
        >
          Scene
        </Label>
        <Textarea
          id="cinema-scene-prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Describe your scene…"
          className="min-h-[84px] resize-none border-0 bg-transparent text-sm focus-visible:ring-0"
        />
      </div>

      <DirectorAgentPanel
        config={config}
        prompt={prompt}
        model={model}
        onApply={onApplyDirectorProposal}
      />


      <div className="fuse-panel flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <ControlBlock label="Model">
          <Select value={model} onValueChange={(v) => setModel(v as CinemaVideoModelKey)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {MODEL_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlBlock>

        {capabilities.resolutions.length ? (
          <ControlBlock label="Resolution">
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capabilities.resolutions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ControlBlock>
        ) : null}

        {capabilities.aspectRatios.length || capabilities.fixedAspect ? (
          <ControlBlock label="Aspect">
            <Select
              value={aspectRatio}
              onValueChange={setAspectRatio}
              disabled={Boolean(capabilities.fixedAspect)}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(capabilities.fixedAspect
                  ? [capabilities.fixedAspect]
                  : capabilities.aspectRatios
                ).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ControlBlock>
        ) : null}

        <ControlBlock label="Duration">
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {capabilities.durations.map((d) => (
                <SelectItem key={d} value={d}>
                  {d === "auto" ? "Auto" : `${d}s`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlBlock>

        {capabilities.supportsAudio ? (
          <ControlBlock label="Audio">
            <div className="flex h-10 items-center">
              <Switch checked={audio} onCheckedChange={setAudio} />
            </div>
          </ControlBlock>
        ) : null}

        <div className="ml-auto flex flex-col items-end gap-1">
          <Button
            className="font-display tracking-[0.16em]"
            disabled={!canGenerate}
            onClick={onGenerate}
          >
            {generating ? "STARTING…" : "GENERATE"}
          </Button>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {compileError ?? MODEL_LABELS[model]}
          </span>

        </div>
      </div>

      <PreviewManifestReadout />

      <PromptPreview
        compiled={compiled}
        resolvedConfig={config}
        override={promptOverride}
        onOverrideChange={setPromptOverride}
      />


      <ChipModal
        open={openChip !== null}
        onOpenChange={(open) => !open && setOpenChip(null)}
        title={activeChip?.label ?? ""}
        description={advanced ? "Advanced mode enabled." : undefined}
      >
        {openChip === "references" ? (
          <ReferenceManager
            references={references}
            onChange={onReferencesChange}
            advanced={advanced}
          />
        ) : openChip === "presets" ? (
          <FullPresetPanel config={config} updateField={updateField as never} />
        ) : openChip === "filmSetup" ? (
          <FilmSetupPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "camera" ? (
          <CameraPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "movement" ? (
          <MovementPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "lighting" ? (
          <LightingPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "color" ? (
          <ColorPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "composition" ? (
          <CompositionPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "optics" ? (
          <OpticsPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "atmosphere" ? (
          <AtmospherePanel config={config} updateField={updateField} advanced={advanced} />
        ) : undefined}
      </ChipModal>
    </div>
  );
}

function ControlBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
