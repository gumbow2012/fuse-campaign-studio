/**
 * Madden Media Studio — M3 shared consistency panel.
 *
 * Drives the outfit and jewelry modules: reference uploads → Gemini VISION
 * analysis → editable structured attributes → per-category consistency locks →
 * reusable madden_profiles row bound into the project slot.
 *
 * Owned entirely by Madden Media Studio. Nothing here imports Cinema,
 * Jewelry Swap, Outfit Swap, Generation Studio or Templates. No generation.
 */
import { useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { uploadRunInputFile } from "@/services/runInputUpload";
import {
  MADDEN_LOCK_LABELS,
  MADDEN_LOCK_LEVELS,
  type MaddenLockLevel,
} from "@/lib/madden-media/subject";
import type { MaddenProfileOf } from "@/lib/madden-media/wardrobe";

const MAX_REFERENCES = 4;

type Analysis = { version: string; model: string; analyzedAt: string } | null;

/** Every M3 category entry is a `present` flag plus free-text descriptors. */
type CategoryEntry = { present: boolean } & Record<string, unknown>;

export type ConsistencyData<C extends string> = {
  version: 1;
  attributes: Record<C, CategoryEntry> & { notes: string; uncertain: string[] };
  locks: Record<C, MaddenLockLevel>;
  referenceUrls: string[];
  analysis?: Analysis;
  edited?: boolean;
};

export type ConsistencyPanelProps<C extends string, D extends ConsistencyData<C>> = {
  title: string;
  description: string;
  namePlaceholder: string;
  savedLabel: string;
  analyzeLabel: string;
  saveLabel: string;
  updateLabel: string;
  categories: readonly C[];
  categoryLabels: Record<C, string>;
  fields: readonly { key: string; label: string }[];
  presentLabel?: string;
  slotLocked: boolean;
  slotName: string;
  profileId: string | null;
  data: D;
  profiles: MaddenProfileOf<D>[];
  summarize: (data: D) => string;
  onAnalyze: (urls: string[]) => Promise<
    | { ok: true; attributes: D["attributes"]; analysis: NonNullable<Analysis>; analyzedUrls: string[] }
    | { ok: false; reason: string }
  >;
  onDataChange: (data: D) => void;
  onNameChange: (name: string) => void;
  onLockedChange: (locked: boolean) => void;
  onSave: () => Promise<void>;
  onUseProfile: (profile: MaddenProfileOf<D>) => void;
  onDeleteProfile: (id: string) => Promise<void>;
};

export default function MaddenConsistencyPanel<C extends string, D extends ConsistencyData<C>>(
  props: ConsistencyPanelProps<C, D>,
) {
  const {
    title,
    description,
    namePlaceholder,
    savedLabel,
    analyzeLabel,
    saveLabel,
    updateLabel,
    categories,
    categoryLabels,
    fields,
    presentLabel = "In this look",
    slotLocked,
    slotName,
    profileId,
    data,
    profiles,
    summarize,
    onAnalyze,
    onDataChange,
    onNameChange,
    onLockedChange,
    onSave,
    onUseProfile,
    onDeleteProfile,
  } = props;

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Local edits flow straight into project_state (autosaved upstream). */
  const commit = (next: D, edited = true) => {
    onDataChange({ ...next, edited: edited || next.edited } as D);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_REFERENCES - data.referenceUrls.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_REFERENCES} reference images.`);
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        urls.push(await uploadRunInputFile(file));
      }
      commit({ ...data, referenceUrls: [...data.referenceUrls, ...urls] }, false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await onAnalyze(data.referenceUrls);
      if (result.ok !== true) {
        toast.error(result.reason ?? "Analysis failed");
        return;
      }
      // Analysis fills the fields; the artist's edits and locks win after.
      commit(
        {
          ...data,
          attributes: result.attributes,
          analysis: result.analysis,
          referenceUrls: result.analyzedUrls,
        } as D,
        false,
      );
      toast.success("Attributes extracted — review and edit before saving.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const attr = data.attributes;

  const patchCategory = (category: C, patch: Record<string, unknown>) => {
    commit({
      ...data,
      attributes: { ...attr, [category]: { ...attr[category], ...patch } },
    } as D);
  };

  const setLock = (category: C, level: MaddenLockLevel) => {
    commit({ ...data, locks: { ...data.locks, [category]: level } } as D);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4 md:col-span-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">{description}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Lock
          <Switch checked={slotLocked} onCheckedChange={onLockedChange} />
        </label>
      </header>

      {profiles.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {savedLabel}
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`group relative flex w-40 shrink-0 flex-col gap-1 rounded-xl border p-2 text-left ${
                  profileId === profile.id ? "border-primary" : "border-border/60"
                }`}
              >
                <button type="button" onClick={() => onUseProfile(profile)} className="text-left">
                  {profile.thumbnailUrl ? (
                    <img
                      src={profile.thumbnailUrl}
                      alt={`${profile.name} reference`}
                      loading="lazy"
                      className="h-24 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-24 w-full rounded-lg bg-muted/40" />
                  )}
                  <p className="mt-1 truncate text-xs font-medium">{profile.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {summarize(profile.data) || "No attributes yet"}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${profile.name}`}
                  onClick={() => void onDeleteProfile(profile.id)}
                  className="absolute right-1 top-1 rounded-md bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <Input
          value={slotName}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={namePlaceholder}
        />

        <div className="flex flex-wrap gap-2">
          {data.referenceUrls.map((url) => (
            <div key={url} className="relative">
              <img
                src={url}
                alt="Reference"
                loading="lazy"
                className="h-24 w-20 rounded-lg border border-border/60 object-cover"
              />
              <button
                type="button"
                aria-label="Remove reference"
                onClick={() =>
                  commit(
                    {
                      ...data,
                      referenceUrls: data.referenceUrls.filter((u) => u !== url),
                    } as D,
                    false,
                  )
                }
                className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-1 shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {data.referenceUrls.length < MAX_REFERENCES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 text-[11px] text-muted-foreground hover:border-primary/60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Add
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => void handleUpload(event.target.files)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void runAnalysis()}
            disabled={analyzing || data.referenceUrls.length === 0}
          >
            {analyzing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {analyzing ? "Reading references…" : analyzeLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {profileId ? updateLabel : saveLabel}
          </Button>
          {data.analysis?.analyzedAt && (
            <Badge variant="secondary" className="text-[10px]">
              Analyzed {new Date(data.analysis.analyzedAt).toLocaleString()}
            </Badge>
          )}
          {data.edited && (
            <Badge variant="outline" className="text-[10px]">
              Edited by you
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {categories.map((category) => {
          const entry = attr[category];
          return (
            <div key={category} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {categoryLabels[category]}
                </p>
                <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {presentLabel}
                  <Switch
                    checked={entry.present}
                    onCheckedChange={(checked) => patchCategory(category, { present: checked })}
                  />
                </label>
              </div>
              <div className="mt-2 space-y-2">
                {fields.map((field) => (
                  <label key={field.key} className="block">
                    <span className="text-[11px] text-muted-foreground">{field.label}</span>
                    <Input
                      value={typeof entry[field.key] === "string" ? (entry[field.key] as string) : ""}
                      onChange={(event) =>
                        patchCategory(category, { [field.key]: event.target.value })
                      }
                      className="mt-1 h-9"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Continuity notes
        </p>
        <Textarea
          value={attr.notes}
          onChange={(event) =>
            commit({ ...data, attributes: { ...attr, notes: event.target.value } } as D)
          }
          rows={2}
          className="mt-2"
          placeholder="Anything that must stay identical across shots"
        />
        {attr.uncertain.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Not clearly visible in the references: {attr.uncertain.join(", ")}
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-border/60 p-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Consistency locks
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          How hard each category is held across shots. Strict = never deviate.
        </p>
        <div className="mt-3 space-y-2">
          {categories.map((category) => (
            <div key={category} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{categoryLabels[category]}</span>
              <div
                className="flex gap-1"
                role="group"
                aria-label={`${categoryLabels[category]} lock level`}
              >
                {MADDEN_LOCK_LEVELS.map((level) => {
                  const active = data.locks[category] === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setLock(category, level)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {MADDEN_LOCK_LABELS[level]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
