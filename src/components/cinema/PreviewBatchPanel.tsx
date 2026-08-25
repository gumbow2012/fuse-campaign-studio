/**
 * FUSE Cinema — ADMIN preview batch generator (gated by the Control Lab route).
 *
 * Populates real preview stills for Cinema presets so PresetPreview stops
 * falling back to gradients. Consistency is the point: one canonical base still
 * per scene is edited for every preset, so ONLY the tested variable changes.
 *
 * SPENDS fal credits — but ONLY when an admin clicks Run. Nothing generates on
 * load, and the run is resumable (presets that already have media are skipped).
 */

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import PresetPreview from "@/components/cinema/PresetPreview";
import {
  buildPreviewBatchCategories,
  ensureCanonicalBase,
  estimateBatchCredits,
  estimateBatchUsd,
  fetchPreviewInventory,
  PREVIEW_CONCURRENCY,
  runPreviewBatch,
  type PreviewBatchResult,
} from "@/lib/cinema/previewBatch";
import { loadPreviewRegistry } from "@/lib/cinema/previewRegistry";
import type { CinemaPreviewCategory } from "@/lib/cinema/previewTypes";

const STATUS_TONE: Record<PreviewBatchResult["status"], string> = {
  done: "text-emerald-300",
  skipped: "text-muted-foreground",
  failed: "text-rose-300",
};

export default function PreviewBatchPanel() {
  const categories = useMemo(() => buildPreviewBatchCategories(), []);
  const [categoryKey, setCategoryKey] = useState<CinemaPreviewCategory>("CAMERA");
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [bases, setBases] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PreviewBatchResult[]>([]);
  const [force, setForce] = useState(false);
  const stopRef = useRef(false);

  const category = categories.find((entry) => entry.category === categoryKey) ?? categories[0];
  const pending = category.items.filter((item) => force || !registered.has(item.presetId));
  const usd = estimateBatchUsd(pending.length, category.kind);
  const credits = estimateBatchCredits(pending.length, category.kind);
  const doneCount = results.filter((r) => r.status === "done").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  async function refreshInventory() {
    try {
      const inventory = await fetchPreviewInventory();
      setRegistered(
        new Set(
          inventory.registered.filter((row) => row.src).map((row) => row.preset_id),
        ),
      );
      setBases(inventory.bases ?? {});
      await loadPreviewRegistry(true);
      toast.success("Preview inventory refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read preview inventory");
    }
  }

  async function makeBase() {
    try {
      const { base } = await ensureCanonicalBase(category.scene, true);
      setBases((prev) => ({ ...prev, [category.scene]: Boolean(base.url) }));
      toast.success(
        base.generated
          ? `Canonical ${category.scene} base generated`
          : `Canonical ${category.scene} base already exists`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the canonical base");
    }
  }

  async function run() {
    if (category.video) return;
    if (!pending.length) {
      toast.info("Every preset in this category already has preview media");
      return;
    }
    stopRef.current = false;
    setRunning(true);
    setResults([]);
    try {
      const batch = await runPreviewBatch({
        items: pending,
        force,
        concurrency: PREVIEW_CONCURRENCY,
        onResult: (result) => setResults((prev) => [...prev, result]),
        shouldStop: () => stopRef.current,
      });
      setRegistered((prev) => {
        const next = new Set(prev);
        batch.forEach((result) => {
          if (result.status !== "failed") next.add(result.presetId);
        });
        return next;
      });
      const failed = batch.filter((r) => r.status === "failed").length;
      toast[failed ? "warning" : "success"](
        `${batch.length - failed}/${batch.length} previews generated${failed ? ` · ${failed} failed` : ""}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
      <div className="space-y-1">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Preview batch generator · admin
        </h2>
        <p className="text-xs text-muted-foreground">
          Generates ONE canonical-scene still per preset by editing the locked base plate, then
          registers it so preset tiles show real media instead of a gradient. Nothing runs
          automatically — this spends fal credits only when you press Run, and it resumes by
          skipping presets that already have media.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Category
          </Label>
          <select
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={categoryKey}
            onChange={(event) => {
              setCategoryKey(event.target.value as CinemaPreviewCategory);
              setResults([]);
            }}
            disabled={running}
          >
            {categories.map((entry) => (
              <option key={entry.category} value={entry.category}>
                {entry.label} · {entry.items.length} presets
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Canonical scene: {category.scene} ·{" "}
            {bases[category.scene] ? "base plate ready" : "base plate not generated yet"}
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              disabled={running}
            />
            Regenerate presets that already have media (costs more)
          </label>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Estimated spend
          </Label>
          <div className="rounded-md border border-border bg-background/60 p-3 text-xs">
            <p>
              {pending.length} of {category.items.length} presets need media
            </p>
            <p className="text-muted-foreground">
              ≈ ${usd.toFixed(2)} · ≈ {credits} credits · {PREVIEW_CONCURRENCY} at a time
            </p>
            {category.video ? (
              <p className="pt-1 text-amber-300">
                Video loops are significantly pricier (image-to-video, 2–3s each) and are NOT part
                of this still pass — run them as a separate deliberate action later.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void run()} disabled={running || category.video}>
              {running ? "Generating…" : "Run batch"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                stopRef.current = true;
              }}
              disabled={!running}
            >
              Stop
            </Button>
            <Button variant="outline" onClick={() => void makeBase()} disabled={running}>
              Prepare base plate
            </Button>
            <Button variant="ghost" onClick={() => void refreshInventory()} disabled={running}>
              Refresh inventory
            </Button>
          </div>
        </div>
      </div>

      {results.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length}/{pending.length} processed · {doneCount} generated · {failedCount} failed
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border bg-background/60 p-2">
            {results.map((result) => (
              <p key={result.presetId} className={`text-xs ${STATUS_TONE[result.status]}`}>
                {result.presetId} · {result.status}
                {result.error ? ` · ${result.error.slice(0, 160)}` : ""}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Current tiles
        </Label>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {category.items.slice(0, 18).map((item) => (
            <div key={item.presetId} className="space-y-1">
              <PresetPreview
                media={{
                  kind: category.kind === "loop" ? "loop" : "still",
                  canonicalScene: category.scene,
                  presetId: item.presetId,
                  fallbackGradient: "linear-gradient(135deg,#1a1d21,#3f464d)",
                }}
                alt={item.name}
              />
              <p className="truncate text-[10px] text-muted-foreground">{item.name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
