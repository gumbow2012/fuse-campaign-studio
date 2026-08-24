import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import PresetPreview from "./PresetPreview";
import { resolvePreviewMedia } from "@/lib/cinema/previewTypes";
import {
  BLOCKING_OPTIONS,
  BODY_LANGUAGE_OPTIONS,
  EMOTION_PRESETS,
  EYE_LINE_OPTIONS,
  MOTION_OPTIONS,
  WARDROBE_AUTHORITY_OPTIONS,
  findEmotionPreset,
} from "@/lib/cinema/presets/characterPresets";
import type {
  CharacterConfig,
  CinemaReference,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
} from "@/lib/cinema/types";

export interface CharacterPanelProps {
  config: DirectorConfig;
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
  /** Reference Board data — only Character-role references can drive identity. */
  references?: CinemaReference[];
}

const FALLBACK: CharacterConfig = {
  identityReferenceIds: [],
  expression: "",
  emotion: "",
  emotionIntensity: 50,
  eyeLine: "",
  bodyLanguage: "",
  energy: 50,
  blocking: "",
  motion: "",
  interactionLevel: 50,
  wardrobeAuthority: "reference-guided",
  eyeContact: 50,
  headMovement: 30,
  gestureLevel: 30,
  bodyTension: 40,
  walkingSpeed: 40,
  performanceIntensity: 50,
  stillness: 50,
};

/** Character chip panel — emotion grid + performance params. Writes source "USER". */
export default function CharacterPanel({
  config,
  updateField,
  advanced,
  references = [],
}: CharacterPanelProps) {
  const character: CharacterConfig = { ...FALLBACK, ...(config.character?.value ?? {}) };

  const setCharacter = (patch: Partial<CharacterConfig>) =>
    updateField("character", { ...character, ...patch }, "USER");

  const characterRefs = references.filter((ref) => (ref.roles ?? []).includes("Character"));
  const identityIds = character.identityReferenceIds ?? [];

  const toggleIdentity = (id: string) =>
    setCharacter({
      identityReferenceIds: identityIds.includes(id)
        ? identityIds.filter((value) => value !== id)
        : [...identityIds, id],
    });

  const activeEmotion = findEmotionPreset(character.emotion);

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-5 text-foreground">
        {/* ---------------------------- EMOTION GRID --------------------------- */}
        <div className="space-y-2">
          <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Emotion
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {EMOTION_PRESETS.map((preset) => {
              const active = character.emotion === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    setCharacter({
                      emotion: preset.id,
                      expression: preset.expression,
                      emotionIntensity: active
                        ? character.emotionIntensity
                        : preset.defaultIntensity,
                    })
                  }
                  title={preset.hint}
                  className={cn(
                    "overflow-hidden rounded-xl border text-left transition-all",
                    "border-border/70 bg-card/50 hover:border-primary/60 hover:bg-card",
                    active && "border-primary/70 glow-blue-sm",
                  )}
                >
                  <PresetPreview
                    media={resolvePreviewMedia({ category: "CHARACTER", preset })}
                    alt={`${preset.name} performance`}
                    className="h-14"
                  />
                  <div className="space-y-0.5 px-2 py-1.5">
                    <span className="block text-[11px] text-foreground/90">{preset.name}</span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {preset.hint}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {advanced ? (
            <SliderRow
              label="Emotion intensity"
              value={character.emotionIntensity}
              onChange={(value) => setCharacter({ emotionIntensity: value })}
            />
          ) : null}
        </div>

        <Separator className="bg-border/60" />

        {/* ------------------------------ BLOCKING ---------------------------- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectRow
            label="Eye line"
            value={character.eyeLine}
            options={EYE_LINE_OPTIONS}
            onChange={(value) => setCharacter({ eyeLine: value })}
          />
          <SelectRow
            label="Body language"
            value={character.bodyLanguage}
            options={BODY_LANGUAGE_OPTIONS}
            onChange={(value) => setCharacter({ bodyLanguage: value })}
          />
          <SelectRow
            label="Blocking"
            value={character.blocking}
            options={BLOCKING_OPTIONS}
            onChange={(value) => setCharacter({ blocking: value })}
          />
          <SelectRow
            label="Motion"
            value={character.motion}
            options={MOTION_OPTIONS}
            onChange={(value) => setCharacter({ motion: value })}
          />
        </div>

        {advanced ? (
          <>
            <Separator className="bg-border/60" />

            {/* --------------------- PERFORMANCE PARAMETERS -------------------- */}
            <div className="space-y-3">
              <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Performance
              </h3>
              <SliderRow
                label="Energy"
                value={character.energy}
                onChange={(v) => setCharacter({ energy: v })}
              />
              <SliderRow
                label="Eye contact"
                value={character.eyeContact}
                onChange={(v) => setCharacter({ eyeContact: v })}
              />
              <SliderRow
                label="Head movement"
                value={character.headMovement}
                onChange={(v) => setCharacter({ headMovement: v })}
              />
              <SliderRow
                label="Gesture level"
                value={character.gestureLevel}
                onChange={(v) => setCharacter({ gestureLevel: v })}
              />
              <SliderRow
                label="Body tension"
                value={character.bodyTension}
                onChange={(v) => setCharacter({ bodyTension: v })}
              />
              <SliderRow
                label="Walking speed"
                value={character.walkingSpeed}
                onChange={(v) => setCharacter({ walkingSpeed: v })}
              />
              <SliderRow
                label="Performance intensity"
                value={character.performanceIntensity}
                onChange={(v) => setCharacter({ performanceIntensity: v })}
              />
              <SliderRow
                label="Stillness"
                value={character.stillness}
                onChange={(v) => setCharacter({ stillness: v })}
              />
              <SliderRow
                label="Interaction level"
                value={character.interactionLevel}
                onChange={(v) => setCharacter({ interactionLevel: v })}
              />
              <p className="text-[10px] text-muted-foreground">
                These compile into performance language inside the prompt — no model exposes
                native performance controls.
              </p>
            </div>
          </>
        ) : null}

        <Separator className="bg-border/60" />

        {/* --------------------------- IDENTITY REFS -------------------------- */}
        <div className="space-y-2">
          <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Identity references
          </h3>
          {characterRefs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Give a reference the Character role on the Reference Board to use it for identity.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {characterRefs.map((ref) => {
                const active = identityIds.includes(ref.id);
                return (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => toggleIdentity(ref.id)}
                    className={cn(
                      "overflow-hidden rounded-lg border transition-all",
                      "border-border/70 hover:border-primary/60",
                      active && "border-primary/70 glow-blue-sm",
                    )}
                    title={ref.name ?? "Character reference"}
                  >
                    <img
                      src={ref.url}
                      alt={ref.name ?? "Character reference"}
                      loading="lazy"
                      className="h-16 w-full object-cover"
                    />
                    <span className="block truncate px-1.5 py-1 text-[9px] text-muted-foreground">
                      {active ? "Identity" : "Not used"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <SelectRow
            label="Wardrobe authority"
            value={character.wardrobeAuthority}
            options={WARDROBE_AUTHORITY_OPTIONS}
            onChange={(value) => setCharacter({ wardrobeAuthority: value })}
          />
        </div>

        {activeEmotion ? (
          <p className="text-[10px] text-muted-foreground">
            Current performance: {activeEmotion.name} · {activeEmotion.hint}
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={([next]) => onChange(next ?? 0)}
      />
    </div>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Auto" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
