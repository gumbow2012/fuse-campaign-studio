import { useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { runUploadChecks } from "@/lib/uploadChecks";
import { sortReferencePhotos } from "@/services/sortReferences";
import type { CampaignField } from "@/lib/campaignFields";
import { cn } from "@/lib/utils";

interface Props {
  /** Image reference fields of the template. */
  fields: CampaignField[];
  files: Record<string, File | null>;
  assets: Record<string, { url: string; name?: string | null } | null>;
  onFileChange: (key: string, file: File | null) => void;
}

/** One drop for all the photos: each goes to the empty slot it shows (front, back, side, logo...). */
export default function BulkReferenceDrop({ fields, files, assets, onFileChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const empty = fields.filter((field) => field.kind === "image" && !files[field.id] && !assets[field.id]?.url);

  const take = async (list: FileList | File[]) => {
    const photos = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (!photos.length) return;
    if (!empty.length) {
      setNote("Every photo slot already has a photo. Remove one below to swap it.");
      return;
    }
    setNote(null);
    setBusy(`Sorting ${photos.length} photo${photos.length === 1 ? "" : "s"}…`);
    try {
      // Same check a single upload gets: corrupt or unusable files never reach a slot.
      const checked = await Promise.all(photos.map(async (file) => ({ file, ok: (await runUploadChecks(file)).state !== "error" })));
      const usable = checked.filter((c) => c.ok).map((c) => c.file);
      const sorted = usable.length
        ? await sortReferencePhotos(usable, empty.map((field) => ({ id: field.id, label: field.label, hint: field.helper })))
        : [];
      sorted.forEach((photo) => photo.slotId && onFileChange(photo.slotId, photo.file));
      const placed = sorted.filter((photo) => photo.slotId);
      const unplaced = [...sorted.filter((photo) => !photo.slotId).map((photo) => photo.file.name), ...checked.filter((c) => !c.ok).map((c) => c.file.name)];
      setNote(
        `Placed ${placed.length} of ${photos.length}.` +
          (unplaced.length ? ` Couldn't place ${unplaced.join(", ")}. Drag ${unplaced.length === 1 ? "it" : "them"} onto a row below.` : ""),
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not sort the photos. Add them one by one below.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void take(event.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "border-primary bg-primary/10" : "border-border/80 hover:border-primary/60 hover:bg-primary/[0.04]",
        )}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Sparkles className="h-5 w-5 text-primary" />}
        <span className="text-[15px] font-semibold text-foreground">{busy ?? (dragging ? "Drop to sort them" : "Drop all your photos at once")}</span>
        <span className="text-[13px] text-muted-foreground">We'll put each one where it belongs: front, back, sides, logo. Or add them one by one below.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Add several photos at once"
        onChange={(event) => {
          const list = event.target.files;
          if (list) void take(Array.from(list));
          event.target.value = "";
        }}
      />
      {note ? <p className="text-[13px] leading-5 text-muted-foreground" aria-live="polite">{note}</p> : null}
    </div>
  );
}
