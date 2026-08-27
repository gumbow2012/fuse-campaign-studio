/**
 * Madden Media Studio — M2 subject module.
 *
 * Reference uploads (direct-to-storage) → Gemini VISION analysis → editable
 * structured attributes + per-category consistency locks → reusable
 * madden_profiles row bound into the project's subject slot.
 *
 * No generation happens here. Nothing imports Cinema / Jewelry / Generation.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { uploadRunInputFile } from "@/services/runInputUpload";
import {
  analyzeSubject,
  deleteSubjectProfile,
  listSubjectProfiles,
  saveSubjectProfile,
} from "@/services/maddenMediaStudio";
import {
  createEmptySubjectData,
  MADDEN_LOCK_LABELS,
  MADDEN_LOCK_LEVELS,
  MADDEN_SUBJECT_LOCK_CATEGORIES,
  MADDEN_SUBJECT_LOCK_LABELS,
  normalizeSubjectData,
  summarizeSubject,
  type MaddenLockLevel,
  type MaddenSubjectLockCategory,
  type MaddenSubjectProfile,
  type MaddenSubjectProfileData,
} from "@/lib/madden-media/subject";
import type { MaddenSlot } from "@/lib/madden-media/types";

const MAX_REFERENCES = 4;

type Props = {
  slot: MaddenSlot;
  onBind: (patch: {
    name?: string;
    profileId?: string | null;
    profileData?: MaddenSubjectProfileData;
    locked?: boolean;
  }) => void;
};

export default function MaddenSubjectPanel({ slot, onBind }: Props) {
  const [profiles, setProfiles] = useState<MaddenSubjectProfile[]>([]);
  const [name, setName] = useState(slot.name);
  const [data, setData] = useState<MaddenSubjectProfileData>(() =>
    slot.profileData ? normalizeSubjectData(slot.profileData) : createEmptySubjectData(),
  );
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Re-sync when a different project (or profile) is loaded into the slot. */
  useEffect(() => {
    setName(slot.name);
    setData(
      slot.profileData ? normalizeSubjectData(slot.profileData) : createEmptySubjectData(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.profileId]);

  useEffect(() => {
    void listSubjectProfiles()
      .then(setProfiles)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load saved subjects"),
      );
  }, []);

  /** Every local change flows straight into project_state (autosaved upstream). */
  const commit = (next: MaddenSubjectProfileData, edited = true) => {
    const marked = { ...next, edited: edited || next.edited };
    setData(marked);
    onBind({ profileData: marked });
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

  const removeReference = (url: string) => {
    commit({ ...data, referenceUrls: data.referenceUrls.filter((u) => u !== url) }, false);
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeSubject(data.referenceUrls);
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      // Analysis fills the fields; the artist's edits and locks always win after.
      commit(
        {
          ...data,
          attributes: result.attributes,
          analysis: result.analysis,
          referenceUrls: result.analyzedUrls,
        },
        false,
      );
      toast.success("Subject attributes extracted — review and edit before saving.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Subject analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const profile = await saveSubjectProfile({
        id: slot.profileId ?? null,
        name,
        data,
        thumbnailUrl: data.referenceUrls[0] ?? null,
      });
      setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
      onBind({ name: profile.name, profileId: profile.id, profileData: profile.data });
      toast.success("Subject saved to your library");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that subject");
    } finally {
      setSaving(false);
    }
  };

  const useProfile = (profile: MaddenSubjectProfile) => {
    setName(profile.name);
    setData(profile.data);
    onBind({ name: profile.name, profileId: profile.id, profileData: profile.data });
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await deleteSubjectProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (slot.profileId === id) onBind({ profileId: null });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that subject");
    }
  };

  const setLock = (category: MaddenSubjectLockCategory, level: MaddenLockLevel) => {
    commit({ ...data, locks: { ...data.locks, [category]: level } });
  };

  const attr = data.attributes;
  const patchAttr = (patch: Partial<typeof attr>) =>
    commit({ ...data, attributes: { ...attr, ...patch } });

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4 md:col-span-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Subject</h3>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
            Reference images drive a visual-consistency read: appearance attributes only —
            never an identity. Your edits and locks always override the analysis.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Lock
          <Switch checked={slot.locked} onCheckedChange={(checked) => onBind({ locked: checked })} />
        </label>
      </header>

      {/* Saved subjects */}
      {profiles.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Saved subjects
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`group relative flex w-40 shrink-0 flex-col gap-1 rounded-xl border p-2 text-left ${
                  slot.profileId === profile.id ? "border-primary" : "border-border/60"
                }`}
              >
                <button type="button" onClick={() => useProfile(profile)} className="text-left">
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
                    {summarizeSubject(profile.data) || "No attributes yet"}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${profile.name}`}
                  onClick={() => void handleDeleteProfile(profile.id)}
                  className="absolute right-1 top-1 rounded-md bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Name + references */}
      <div className="mt-4 space-y-3">
        <Input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            onBind({ name: event.target.value });
          }}
          placeholder="Subject name (your label — not an identity claim)"
        />

        <div className="flex flex-wrap gap-2">
          {data.referenceUrls.map((url) => (
            <div key={url} className="relative">
              <img
                src={url}
                alt="Subject reference"
                loading="lazy"
                className="h-24 w-20 rounded-lg border border-border/60 object-cover"
              />
              <button
                type="button"
                aria-label="Remove reference"
                onClick={() => removeReference(url)}
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
            {analyzing ? "Reading references…" : "Analyze subject"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {slot.profileId ? "Update saved subject" : "Save subject"}
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

      {/* Attributes */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Group title="Face">
          <Field label="Shape" value={attr.face.shape} onChange={(v) => patchAttr({ face: { ...attr.face, shape: v } })} />
          <Field
            label="Proportions"
            value={attr.face.proportions}
            onChange={(v) => patchAttr({ face: { ...attr.face, proportions: v } })}
          />
          <Field
            label="Distinguishing features"
            value={attr.face.distinguishingFeatures}
            onChange={(v) => patchAttr({ face: { ...attr.face, distinguishingFeatures: v } })}
          />
        </Group>

        <Group title="Skin">
          <Field label="Tone" value={attr.skin.tone} onChange={(v) => patchAttr({ skin: { ...attr.skin, tone: v } })} />
          <Field
            label="Texture"
            value={attr.skin.texture}
            onChange={(v) => patchAttr({ skin: { ...attr.skin, texture: v } })}
          />
        </Group>

        <Group title="Hair">
          <Field label="Style" value={attr.hair.style} onChange={(v) => patchAttr({ hair: { ...attr.hair, style: v } })} />
          <Field label="Color" value={attr.hair.color} onChange={(v) => patchAttr({ hair: { ...attr.hair, color: v } })} />
          <Field
            label="Length"
            value={attr.hair.length}
            onChange={(v) => patchAttr({ hair: { ...attr.hair, length: v } })}
          />
        </Group>

        <Group title="Facial hair">
          <Toggle
            label="Present"
            checked={attr.facialHair.present}
            onChange={(checked) =>
              patchAttr({ facialHair: { ...attr.facialHair, present: checked } })
            }
          />
          <Field
            label="Description"
            value={attr.facialHair.description}
            onChange={(v) => patchAttr({ facialHair: { ...attr.facialHair, description: v } })}
          />
        </Group>

        <Group title="Tattoos">
          <Toggle
            label="Visible"
            checked={attr.tattoos.present}
            onChange={(checked) => patchAttr({ tattoos: { ...attr.tattoos, present: checked } })}
          />
          <Field
            label="Description"
            value={attr.tattoos.description}
            onChange={(v) => patchAttr({ tattoos: { ...attr.tattoos, description: v } })}
          />
          <Field
            label="Placements (comma separated)"
            value={attr.tattoos.placements.join(", ")}
            onChange={(v) =>
              patchAttr({
                tattoos: {
                  ...attr.tattoos,
                  placements: v
                    .split(",")
                    .map((part) => part.trim())
                    .filter(Boolean),
                },
              })
            }
          />
        </Group>

        <Group title="Grills / teeth">
          <Toggle
            label="Present"
            checked={attr.grills.present}
            onChange={(checked) => patchAttr({ grills: { ...attr.grills, present: checked } })}
          />
          <Field
            label="Description"
            value={attr.grills.description}
            onChange={(v) => patchAttr({ grills: { ...attr.grills, description: v } })}
          />
        </Group>
      </div>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Continuity notes
        </p>
        <Textarea
          value={attr.notes}
          onChange={(event) => patchAttr({ notes: event.target.value })}
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

      {/* Consistency locks */}
      <div className="mt-5 rounded-xl border border-border/60 p-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Consistency locks
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          How hard each category is held across shots. Strict = never deviate.
        </p>
        <div className="mt-3 space-y-2">
          {MADDEN_SUBJECT_LOCK_CATEGORIES.map((category) => (
            <div key={category} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{MADDEN_SUBJECT_LOCK_LABELS[category]}</span>
              <div className="flex gap-1" role="group" aria-label={`${MADDEN_SUBJECT_LOCK_LABELS[category]} lock level`}>
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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
