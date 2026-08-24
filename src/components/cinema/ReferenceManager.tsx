import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadToStorage } from "@/services/storageUpload";
import { detectReferenceRoles, fileToDataUrl } from "@/services/cinemaStudio";
import type { CinemaReference, ReferenceRole } from "@/lib/cinema/types";

/**
 * References chip — upload reference images, toggle roles, optional Gemini
 * role auto-detect. Reference ORDER carries no authority: every reference is
 * used only through its explicit roles and per-role strengths.
 */

const ALL_ROLES: ReferenceRole[] = [
  "Character",
  "Location",
  "Product",
  "Camera",
  "Composition",
  "Lighting",
  "Palette",
  "Environment",
  "Texture",
  "Motion",
];

const CINEMA_REFERENCE_FOLDER = "system/cinema/references";

export interface ReferenceManagerProps {
  references: CinemaReference[];
  onChange: (references: CinemaReference[]) => void;
  advanced: boolean;
}

export default function ReferenceManager({
  references,
  onChange,
  advanced,
}: ReferenceManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const patch = (id: string, next: Partial<CinemaReference>) =>
    onChange(references.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      const added: CinemaReference[] = [];
      for (const file of Array.from(files).slice(0, 12)) {
        if (!file.type.startsWith("image/")) continue;
        const { path, url } = await uploadToStorage(CINEMA_REFERENCE_FOLDER, file, file.name);
        added.push({
          id: crypto.randomUUID(),
          url,
          path,
          name: file.name,
          roles: [],
          strengths: {},
          roleSource: "USER",
        });
      }
      if (added.length) onChange([...references, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — please retry.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggleRole = (reference: CinemaReference, role: ReferenceRole) => {
    const has = reference.roles.includes(role);
    const roles = has
      ? reference.roles.filter((r) => r !== role)
      : [...reference.roles, role];
    const strengths = { ...reference.strengths };
    if (has) delete strengths[role];
    else strengths[role] = strengths[role] ?? 70;
    patch(reference.id, { roles, strengths, roleSource: "USER" });
  };

  const autoDetect = async (reference: CinemaReference) => {
    setError(null);
    setDetectingId(reference.id);
    try {
      const response = await fetch(reference.url);
      if (!response.ok) throw new Error("Could not read that reference image");
      const blob = await response.blob();
      const dataUrl = await fileToDataUrl(
        new File([blob], reference.name ?? "reference", { type: blob.type || "image/jpeg" }),
      );
      const detected = await detectReferenceRoles(dataUrl);
      const strengths: Partial<Record<ReferenceRole, number>> = {};
      for (const entry of detected.roles) strengths[entry.role] = entry.strength;
      patch(reference.id, {
        roles: detected.roles.map((entry) => entry.role),
        strengths,
        roleSource: "REFERENCE_ANALYSIS",
      });
      if (detected.note) setNotes((prev) => ({ ...prev, [reference.id]: detected.note! }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role detection failed — assign roles manually.");
    } finally {
      setDetectingId(null);
    }
  };

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-4 text-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="font-display tracking-[0.16em]"
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            ADD REFERENCES
          </Button>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Roles decide how a reference is used — order does not
          </span>
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        {!references.length ? (
          <p className="text-xs text-muted-foreground">
            No references yet. Add images, then tag each one with the roles it should influence.
          </p>
        ) : null}

        <div className="space-y-3">
          {references.map((reference) => (
            <div
              key={reference.id}
              className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <div className="flex gap-3">
                <img
                  src={reference.url}
                  alt={reference.name ?? "Cinema reference"}
                  loading="lazy"
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs">
                      {reference.name ?? "Reference"}
                    </p>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
                      {reference.roleSource === "REFERENCE_ANALYSIS" ? "Detected" : "Manual"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px] uppercase tracking-[0.14em]"
                      onClick={() => autoDetect(reference)}
                      disabled={detectingId === reference.id}
                    >
                      {detectingId === reference.id ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3 w-3" />
                      )}
                      Auto-detect roles
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                      onClick={() => onChange(references.filter((r) => r.id !== reference.id))}
                    >
                      <Trash2 className="mr-1.5 h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                  {notes[reference.id] ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {notes[reference.id]}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((role) => {
                  const active = reference.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(reference, role)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        active
                          ? "border-primary/70 bg-primary/15 text-foreground"
                          : "border-border/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>

              {advanced && reference.roles.length ? (
                <>
                  <Separator className="bg-border/60" />
                  <div className="space-y-2.5">
                    {reference.roles.map((role) => (
                      <div key={role} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            {role} strength
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {reference.strengths[role] ?? 70}
                          </span>
                        </div>
                        <Slider
                          value={[reference.strengths[role] ?? 70]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={([value]) =>
                            patch(reference.id, {
                              strengths: { ...reference.strengths, [role]: value },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
