/**
 * FUSE Cinema — CV10 admin "attach preview" flow (admin/dev gated by the route).
 *
 * One preset at a time, DELIBERATELY: pick a preset, upload a still (webp/avif
 * preferred) or a short compressed loop (webm preferred) plus an optional
 * poster/thumbnail, and register the hosted URL so PresetPreview serves it.
 *
 * This is NOT a bulk job: nothing is generated, no provider is called, and no
 * preview is ever produced on demand when a picker opens.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  listAttachablePresets,
  loadPreviewRegistry,
  registerPresetPreview,
  removePresetPreview,
  uploadPresetPreviewFile,
} from "@/lib/cinema/previewRegistry";
import type { PreviewKind } from "@/lib/cinema/previewTypes";

const KIND_ACCEPT: Record<PreviewKind, string> = {
  still: "image/avif,image/webp,image/jpeg,image/png",
  strip: "image/avif,image/webp,image/jpeg,image/png",
  "still-swatches": "image/avif,image/webp,image/jpeg,image/png",
  loop: "video/webm,video/mp4",
};

export default function AttachPreviewPanel() {
  const inventory = useMemo(() => listAttachablePresets(), []);
  const [query, setQuery] = useState("");
  const [presetId, setPresetId] = useState(inventory[0]?.presetId ?? "");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? inventory.filter(
          (row) =>
            row.presetId.toLowerCase().includes(needle) ||
            row.category.toLowerCase().includes(needle),
        )
      : inventory;
    return rows.slice(0, 300);
  }, [inventory, query]);

  const selected = inventory.find((row) => row.presetId === presetId);
  const kind: PreviewKind = selected?.kind ?? "still";

  async function attach() {
    if (!selected || !mediaFile) return;
    setBusy(true);
    try {
      const uploaded = await uploadPresetPreviewFile(selected.presetId, mediaFile);
      let poster: string | undefined;
      if (posterFile) {
        poster = (await uploadPresetPreviewFile(selected.presetId, posterFile)).url;
      }
      await registerPresetPreview({
        presetId: selected.presetId,
        category: selected.category,
        kind,
        src: uploaded.url,
        poster,
        thumbSrc: kind === "loop" ? undefined : poster,
        sources: [{ src: uploaded.url }],
      });
      setAttached((prev) => ({ ...prev, [selected.presetId]: uploaded.url }));
      setMediaFile(null);
      setPosterFile(null);
      toast.success(`Preview attached to ${selected.presetId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach preview media");
    } finally {
      setBusy(false);
    }
  }

  async function detach() {
    if (!selected) return;
    setBusy(true);
    try {
      await removePresetPreview(selected.presetId);
      setAttached((prev) => {
        const next = { ...prev };
        delete next[selected.presetId];
        return next;
      });
      toast.success("Preview media unregistered — gradient fallback restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove preview media");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
      <div className="space-y-1">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Attach preview media
        </h2>
        <p className="text-xs text-muted-foreground">
          One preset at a time. Nothing is generated here — upload an already-produced still
          (webp/avif) or a short compressed loop (webm) and it is served from storage. Presets with
          no registered media keep their gradient.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Find preset
          </Label>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by preset id or category"
          />
          <select
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
          >
            {filtered.map((row) => (
              <option key={`${row.category}-${row.presetId}`} value={row.presetId}>
                {row.category} · {row.presetId} · {row.kind}
                {row.hasMedia || attached[row.presetId] ? " · media" : " · gradient"}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {inventory.length} preview slots · showing {filtered.length}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {kind === "loop" ? "Loop file (webm preferred)" : "Still file (webp/avif preferred)"}
          </Label>
          <Input
            type="file"
            accept={KIND_ACCEPT[kind]}
            onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
          />
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {kind === "loop" ? "Poster frame (optional)" : "Thumbnail derivative (optional)"}
          </Label>
          <Input
            type="file"
            accept="image/avif,image/webp,image/jpeg,image/png"
            onChange={(event) => setPosterFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => void attach()} disabled={busy || !mediaFile || !selected}>
              {busy ? "Working…" : "Attach preview"}
            </Button>
            <Button variant="outline" onClick={() => void detach()} disabled={busy || !selected}>
              Remove
            </Button>
            <Button
              variant="ghost"
              onClick={() => void loadPreviewRegistry(true)}
              disabled={busy}
            >
              Reload registry
            </Button>
          </div>
          {attached[presetId] ? (
            <p className="break-all text-xs text-muted-foreground">{attached[presetId]}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
