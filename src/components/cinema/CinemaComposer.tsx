import { useState } from "react";
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
import DirectorChip from "./DirectorChip";
import ChipModal from "./ChipModal";
import CameraPanel from "./CameraPanel";
import MovementPanel from "./MovementPanel";
import LightingPanel from "./LightingPanel";
import ColorPanel from "./ColorPanel";
import type { DirectorConfig, DirectorConfigField } from "@/lib/cinema/types";
import { CINEMA_MODEL_ADAPTERS, type CinemaVideoModelKey } from "@/lib/cinema/modelAdapters";

type ChipKey = "references" | DirectorConfigField;

const CHIPS: Array<{ key: ChipKey; label: string }> = [
  { key: "references", label: "References" },
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

const MODEL_KEYS = Object.keys(CINEMA_MODEL_ADAPTERS) as CinemaVideoModelKey[];

function summarize(key: ChipKey, config: DirectorConfig, referenceCount: number): string {
  if (key === "references") {
    return referenceCount ? `${referenceCount} attached` : "None";
  }
  const value = config[key]?.value as Record<string, unknown> | undefined;
  if (!value) return "Auto";
  switch (key) {
    case "filmSetup":
      return String(value.format ?? "Auto");
    case "camera":
      return String(value.body ?? "Auto");
    case "movement":
      return String(value.motionType ?? "Auto");
    case "composition":
      return String(value.framing ?? "Auto");
    case "lighting":
      return String(value.mood ?? "Auto");
    case "color":
      return String(value.skinToneTreatment ?? "Auto");
    case "optics":
      return String(value.flare ?? "Auto");
    case "atmosphere":
      return String(value.weather ?? "Auto");
    default:
      return "Auto";
  }
}

export interface CinemaComposerProps {
  config: DirectorConfig;
  prompt: string;
  onPromptChange: (value: string) => void;
  advanced: boolean;
  onAdvancedChange: (value: boolean) => void;
  referenceCount?: number;
  /** Writes config[field] = { value, source: "USER" }. */
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
  ) => void;
}

export default function CinemaComposer({
  config,
  prompt,
  onPromptChange,
  advanced,
  onAdvancedChange,
  referenceCount = 0,
  updateField,
}: CinemaComposerProps) {
  const [openChip, setOpenChip] = useState<ChipKey | null>(null);
  const [model, setModel] = useState<CinemaVideoModelKey>("kling-3.0-pro");
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState("5");
  const [audio, setAudio] = useState(false);
  const [outputCount, setOutputCount] = useState("1");

  const activeChip = CHIPS.find((c) => c.key === openChip) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">FUSE Cinema</h1>
        <div className="flex items-center gap-2.5">
          <Label
            htmlFor="cinema-advanced"
            className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Advanced
          </Label>
          <Switch id="cinema-advanced" checked={advanced} onCheckedChange={onAdvancedChange} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <DirectorChip
            key={chip.key}
            label={chip.label}
            summary={summarize(chip.key, config, referenceCount)}
            active={openChip === chip.key}
            onClick={() => setOpenChip(chip.key)}
          />
        ))}
      </div>

      <div className="fuse-panel rounded-2xl p-4">
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Describe your scene…"
          className="min-h-[220px] resize-none border-0 bg-transparent text-base focus-visible:ring-0"
        />
      </div>

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

        <ControlBlock label="Resolution">
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["480p", "720p", "1080p"].map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlBlock>

        <ControlBlock label="Aspect">
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["9:16", "16:9", "1:1"].map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlBlock>

        <ControlBlock label="Duration">
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["5", "10"].map((d) => (
                <SelectItem key={d} value={d}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlBlock>

        <ControlBlock label="Audio">
          <div className="flex h-10 items-center">
            <Switch checked={audio} onCheckedChange={setAudio} />
          </div>
        </ControlBlock>

        <ControlBlock label="Outputs">
          <Select value={outputCount} onValueChange={setOutputCount}>
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["1", "2", "4"].map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlBlock>

        <div className="ml-auto flex flex-col items-end gap-1">
          <Button disabled className="font-display tracking-[0.16em]">
            GENERATE
          </Button>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Coming soon
          </span>
        </div>
      </div>

      <ChipModal
        open={openChip !== null}
        onOpenChange={(open) => !open && setOpenChip(null)}
        title={activeChip?.label ?? ""}
        description={advanced ? "Advanced mode enabled." : undefined}
      >
        {openChip === "camera" ? (
          <CameraPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "movement" ? (
          <MovementPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "lighting" ? (
          <LightingPanel config={config} updateField={updateField} advanced={advanced} />
        ) : openChip === "color" ? (
          <ColorPanel config={config} updateField={updateField} advanced={advanced} />
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
