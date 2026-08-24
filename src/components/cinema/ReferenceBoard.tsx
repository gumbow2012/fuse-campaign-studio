import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Aperture,
  Box,
  Camera,
  Droplets,
  Loader2,
  MapPin,
  Move,
  Palette,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User,
  Wind,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadToStorage } from "@/services/storageUpload";
import { detectReferenceRoles, fileToDataUrl } from "@/services/cinemaStudio";
import type { CinemaReference, ReferenceRole } from "@/lib/cinema/types";

/**
 * Visible Reference Board — a presentation of the SAME reference state used by
 * ReferenceManager (roles + strengths, persisted in project_state). No new
 * system: it only reads/writes `references`.
 *
 * Roles are assigned by dragging a tile onto a role target, or by clicking the
 * role chips on the tile. Role auto-detect stays opt-in (never runs on upload).
 */

const ROLE_META: Array<{ role: ReferenceRole; label: string; Icon: typeof User }> = [
  { role: "Character", label: "Face / Character", Icon: User },
  { role: "Product", label: "Product", Icon: Box },
  { role: "Location", label: "Location", Icon: MapPin },
  { role: "Lighting", label: "Lighting", Icon: Sun },
  { role: "Palette", label: "Palette", Icon: Palette },
  { role: "Motion", label: "Motion", Icon: Move },
  { role: "Camera", label: "Camera", Icon: Camera },
  { role: "Composition", label: "Composition", Icon: Aperture },
  { role: "Environment", label: "Environment", Icon: Wind },
  { role: "Texture", label: "Texture", Icon: Droplets },
];

const ROLE_ICON = ROLE_META.reduce(
  (acc, entry) => ({ ...acc, [entry.role]: entry.Icon }),
  {} as Record<ReferenceRole, typeof User>,
);

const CINEMA_REFERENCE_FOLDER = "system/cinema/references";
const DEFAULT_STRENGTH = 70;

export interface ReferenceBoardProps {
  references: CinemaReference[];
  onChange: (references: CinemaReference[]) => void;
  advanced: boolean;
}

export default function ReferenceBoard({ references, onChange, advanced }: ReferenceBoardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropRole, setDropRole] = useState<ReferenceRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (id: string, next: Partial<CinemaReference>) =>
    onChange(references.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const assignRole = (id: string, role: ReferenceRole) => {
    const reference = references.find((r) => r.id === id);
    if (!reference || reference.roles.includes(role)) return;
    patch(id, {
      roles: [...reference.roles, role],
      strengths: { ...reference.strengths, [role]: reference.strengths[role] ?? DEFAULT_STRENGTH },
      roleSource: "USER",
    });
  };

  const toggleRole = (reference: CinemaReference, role: ReferenceRole) => {
    const has = reference.roles.includes(role);
    const roles = has ? reference.roles.filter((r) => r !== role) : [...reference.roles, role];
    const strengths = { ...reference.strengths };
    if (has) delete strengths[role];
    else strengths[role] = strengths[role] ?? DEFAULT_STRENGTH;
    patch(reference.id, { roles, strengths, roleSource: "USER" });
  };

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role detection failed — assign roles manually.");
    } finally {
      setDetectingId(null);
    }
  };

  return (
    <section id="cinema-reference-board" className="fuse-panel rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Reference board
          </h2>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {references.length} reference{references.length === 1 ? "" : "s"} · drag onto a role
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            size="sm"
            variant="secondary"
            className="font-display tracking-[0.16em]"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-2 h-3.5 w-3.5" />
            )}
            ADD
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {/* Role targets — drop a reference tile here to assign that role. */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ROLE_META.map(({ role, label, Icon }) => {
          const count = references.filter((r) => r.roles.includes(role)).length;
          const armed = dropRole === role;
          return (
            <div
              key={role}
              onDragOver={(e) => {
                e.preventDefault();
                setDropRole(role);
              }}
              onDragLeave={() => setDropRole((prev) => (prev === role ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/cinema-reference") || draggingId;
                if (id) assignRole(id, role);
                setDropRole(null);
                setDraggingId(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-xl border border-dashed px-2.5 py-2 transition-colors",
                armed
                  ? "border-primary bg-primary/15 text-foreground"
                  : count
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border/60 text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.12em]">
                {label}
              </span>
              {count ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                  {count}
                </Badge>
              ) : null}
            </div>
          );
        })}
      </div>

      {!references.length ? (
        <p className="rounded-xl border border-border/60 bg-background/40 p-6 text-center text-xs text-muted-foreground">
          Add images to build your board — then drag each one onto the roles it should drive.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {references.map((reference) => (
            <div
              key={reference.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/cinema-reference", reference.id);
                e.dataTransfer.effectAllowed = "copy";
                setDraggingId(reference.id);
              }}
              onDragEnd={() => setDraggingId(null)}
              className={cn(
                "group space-y-2 rounded-xl border border-border/60 bg-background/40 p-2 transition-opacity",
                draggingId === reference.id ? "opacity-50" : "opacity-100",
              )}
            >
              <div className="relative overflow-hidden rounded-lg">
                <img
                  src={reference.url}
                  alt={reference.name ?? "Cinema reference"}
                  loading="lazy"
                  draggable={false}
                  className="aspect-square w-full cursor-grab object-cover active:cursor-grabbing"
                />
                <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                  {reference.roles.map((role) => {
                    const Icon = ROLE_ICON[role];
                    return (
                      <span
                        key={role}
                        title={role}
                        className="flex items-center gap-1 rounded-full border border-primary/60 bg-background/80 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] backdrop-blur"
                      >
                        {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
                        {role}
                      </span>
                    );
                  })}
                </div>
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6"
                    title="Auto-detect roles"
                    onClick={() => autoDetect(reference)}
                    disabled={detectingId === reference.id}
                  >
                    {detectingId === reference.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6"
                    title="Remove reference"
                    onClick={() => onChange(references.filter((r) => r.id !== reference.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {ROLE_META.map(({ role }) => {
                  const active = reference.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(reference, role)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
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
                <div className="space-y-2 border-t border-border/60 pt-2">
                  {reference.roles.map((role) => (
                    <div key={role} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span>{role}</span>
                        <span>{reference.strengths[role] ?? DEFAULT_STRENGTH}%</span>
                      </div>
                      <Slider
                        value={[reference.strengths[role] ?? DEFAULT_STRENGTH]}
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
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
