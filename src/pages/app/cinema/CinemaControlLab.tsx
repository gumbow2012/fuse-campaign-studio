/**
 * FUSE Cinema — CV9 Control Lab (ADMIN/DEV only, gated by BuilderRoute).
 *
 * Objectively answers "does this preset actually change the image, repeatably?"
 * Same prompt · same input · same model · same settings — only Variable A vs
 * Variable B differ. NOTHING runs automatically: every attempt requires an
 * explicit click after the credit warning.
 */

import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  CONTROL_LAB_CATEGORIES,
  CONTROL_LAB_LIBRARIES,
  CONTROL_LAB_MODELS,
  DEFAULT_ATTEMPTS,
  MAX_ATTEMPTS,
  latestPromotion,
  listControlTests,
  resolvePresetValidation,
  runControlTestPair,
  saveControlTest,
  updateControlTest,
} from "@/lib/cinema/controlLab";
import type {
  ControlLabCategory,
  ControlPromotion,
  ControlTestOutput,
  ControlTestRecord,
  PresetSupportType,
} from "@/lib/cinema/controlLab";
import type { CinemaVideoModelKey } from "@/lib/cinema/modelAdapters";
import { syncCinemaGeneration } from "@/services/cinemaStudio";
import AttachPreviewPanel from "@/components/cinema/AttachPreviewPanel";

const SUPPORT_TYPES: PresetSupportType[] = [
  "NATIVE",
  "PROMPT_PROVEN",
  "PROMPT_EXPERIMENTAL",
  "UNSUPPORTED",
];

const SUPPORT_TONE: Record<PresetSupportType, string> = {
  NATIVE: "border-emerald-500/40 text-emerald-300",
  PROMPT_PROVEN: "border-sky-500/40 text-sky-300",
  PROMPT_EXPERIMENTAL: "border-amber-500/40 text-amber-300",
  UNSUPPORTED: "border-rose-500/40 text-rose-300",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function selectClass() {
  return "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
}

export default function CinemaControlLab() {
  const [category, setCategory] = useState<ControlLabCategory>("lighting");
  const [model, setModel] = useState<CinemaVideoModelKey>(CONTROL_LAB_MODELS[0].key);
  const [prompt, setPrompt] = useState(
    "Single continuous shot of a model standing still in a bare studio, mid-shot, neutral wardrobe.",
  );
  const [referenceUrl, setReferenceUrl] = useState("");
  const [attempts, setAttempts] = useState(DEFAULT_ATTEMPTS);
  const [variableA, setVariableA] = useState("");
  const [variableB, setVariableB] = useState("");

  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [tests, setTests] = useState<ControlTestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTestId, setOpenTestId] = useState<string | null>(null);

  const library = CONTROL_LAB_LIBRARIES[category];

  useEffect(() => {
    setVariableA(library[0]?.id ?? "");
    setVariableB(library[1]?.id ?? library[0]?.id ?? "");
  }, [category, library]);

  useEffect(() => {
    let alive = true;
    listControlTests()
      .then((rows) => {
        if (alive) setTests(rows);
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load test history"),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const presetA = library.find((p) => p.id === variableA);
  const presetB = library.find((p) => p.id === variableB);

  const validationRows = useMemo(
    () =>
      library.map((preset) => ({
        preset,
        validation: resolvePresetValidation(preset, tests),
        promotion: latestPromotion(preset.id, tests),
      })),
    [library, tests],
  );

  const canRun =
    !!presetA && !!presetB && presetA.id !== presetB.id && prompt.trim().length > 8 && !running;

  /** Runs ONLY from this explicit click, after the credit warning. */
  const onConfirmRun = async () => {
    if (!canRun || !presetA || !presetB) return;
    setConfirming(false);
    setRunning(true);
    setProgress({ done: 0, total: attempts * 2 });
    try {
      const outputs = await runControlTestPair(
        {
          category,
          model,
          prompt: prompt.trim(),
          referenceUrl: referenceUrl.trim() || null,
          attempts,
          presetA,
          presetB,
        },
        (done, total) => setProgress({ done, total }),
      );
      const saved = await saveControlTest({
        presetId: presetA.id,
        category,
        model,
        variableA: presetA.name,
        variableB: presetB.name,
        outputs,
        supportType: resolvePresetValidation(presetA, tests).supportType,
      });
      setTests((prev) => [saved, ...prev]);
      setOpenTestId(saved.id);
      toast.success(`Test recorded — ${outputs.length} attempts submitted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test could not be run");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  /** Pulls current provider status/URL for a recorded test's attempts. */
  const onRefresh = async (test: ControlTestRecord) => {
    try {
      const next: ControlTestOutput[] = await Promise.all(
        test.outputs.map(async (out) => {
          if (!out.generationId || out.outputUrl) return out;
          try {
            const row = await syncCinemaGeneration(out.generationId);
            return { ...out, status: row.status ?? out.status, outputUrl: row.outputUrl ?? null };
          } catch {
            return out;
          }
        }),
      );
      const saved = await updateControlTest(test.id, { outputs: next });
      setTests((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh outputs");
    }
  };

  const onEvaluate = async (
    test: ControlTestRecord,
    patch: {
      differenceScore?: number;
      consistencyScore?: number;
      evaluatorNotes?: string;
      supportType?: PresetSupportType;
      promotion?: ControlPromotion;
    },
  ) => {
    try {
      const saved = await updateControlTest(test.id, patch);
      setTests((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      toast.success("Evaluation saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save evaluation");
    }
  };

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Cinema · Internal
          </p>
          <h1 className="font-heading text-3xl">Control Lab</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Controlled A/B testing for Cinema presets. Same prompt, same input, same model, same
            settings — only Variable A vs Variable B change. Nothing runs until you click Run test.
          </p>
        </header>

        {/* ------------------------- Harness ------------------------- */}
        <section className="space-y-5 rounded-xl border border-border bg-card/50 p-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            A/B Test Harness
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Category">
              <select
                className={selectClass()}
                value={category}
                onChange={(e) => setCategory(e.target.value as ControlLabCategory)}
              >
                {CONTROL_LAB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model (identical for both)">
              <select
                className={selectClass()}
                value={model}
                onChange={(e) => setModel(e.target.value as CinemaVideoModelKey)}
              >
                {CONTROL_LAB_MODELS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Attempts per variable (max ${MAX_ATTEMPTS})`}>
              <select
                className={selectClass()}
                value={attempts}
                onChange={(e) => setAttempts(Number(e.target.value))}
              >
                {Array.from({ length: MAX_ATTEMPTS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Prompt (identical for both)">
            <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>

          <Field label="Input reference URL (optional, identical for both)">
            <Input
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Variable A">
              <select
                className={selectClass()}
                value={variableA}
                onChange={(e) => setVariableA(e.target.value)}
              >
                {library.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Variable B">
              <select
                className={selectClass()}
                value={variableB}
                onChange={(e) => setVariableB(e.target.value)}
              >
                {library.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {presetA && presetB && presetA.id === presetB.id ? (
            <p className="text-xs text-amber-300">
              Variable A and B are the same preset — pick two different presets.
            </p>
          ) : null}

          {confirming ? (
            <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <p className="text-sm">
                This submits <strong>{attempts * 2}</strong> real generations ({attempts} per
                variable) to {CONTROL_LAB_MODELS.find((m) => m.key === model)?.label}.{" "}
                <strong>Credits will be spent.</strong> Nothing has run yet.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={onConfirmRun} disabled={!canRun}>
                  Yes — run {attempts * 2} generations
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button onClick={() => setConfirming(true)} disabled={!canRun}>
                Run test
              </Button>
              <span className="text-xs text-muted-foreground">
                {running && progress
                  ? `Submitting ${progress.done}/${progress.total}…`
                  : "Manual only — no automatic runs, no background spend."}
              </span>
            </div>
          )}
        </section>

        <AttachPreviewPanel />

        {/* --------------------- Promotion / validation --------------------- */}
        <section className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Preset validation · {category}
          </h2>
          <div className="grid gap-2">
            {validationRows.map(({ preset, validation, promotion }) => (
              <div
                key={preset.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm"
              >
                <span className="min-w-[180px] font-medium">{preset.name}</span>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${SUPPORT_TONE[validation.supportType]}`}
                >
                  {validation.supportType}
                </span>
                <span className="text-xs text-muted-foreground">
                  difference {validation.visibleDifferenceScore} · consistency{" "}
                  {validation.consistencyScore} ·{" "}
                  {validation.modelsTested.length
                    ? validation.modelsTested.join(", ")
                    : "untested"}
                </span>
                {promotion ? (
                  <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                    {promotion}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            New presets default to PROMPT_EXPERIMENTAL. Promotion is recorded as metadata on the
            test — no preset data is ever deleted automatically.
          </p>
        </section>

        {/* --------------------------- History --------------------------- */}
        <section className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Recorded tests
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !tests.length ? (
            <p className="text-sm text-muted-foreground">No tests recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {tests.map((test) => {
                const open = openTestId === test.id;
                return (
                  <div key={test.id} className="rounded-lg border border-border/60 bg-background/40">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm"
                      onClick={() => setOpenTestId(open ? null : test.id)}
                    >
                      <span className="font-medium">
                        {test.variableA} vs {test.variableB}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {test.category} · {test.model} · {test.outputs.length} attempts ·{" "}
                        {new Date(test.testDate).toLocaleString()}
                      </span>
                      {test.supportType ? (
                        <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                          {test.supportType}
                        </span>
                      ) : null}
                    </button>

                    {open ? (
                      <div className="space-y-4 border-t border-border/60 px-3 py-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {test.outputs.map((out, i) => (
                            <div
                              key={`${out.generationId}-${i}`}
                              className="space-y-2 rounded-md border border-border/60 p-2"
                            >
                              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                VAR {out.variable} · attempt {out.attempt} · {out.status}
                              </p>
                              {out.outputUrl ? (
                                <video
                                  src={out.outputUrl}
                                  className="aspect-video w-full rounded bg-muted object-cover"
                                  controls
                                  muted
                                  playsInline
                                />
                              ) : (
                                <div className="flex aspect-video items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                                  pending
                                </div>
                              )}
                              <p className="truncate text-xs text-muted-foreground">
                                {out.presetName}
                              </p>
                            </div>
                          ))}
                        </div>

                        <Button size="sm" variant="outline" onClick={() => onRefresh(test)}>
                          Refresh outputs
                        </Button>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label={`Visible difference — ${test.differenceScore ?? 0}`}>
                            <Slider
                              value={[test.differenceScore ?? 0]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={([v]) =>
                                setTests((prev) =>
                                  prev.map((t) =>
                                    t.id === test.id ? { ...t, differenceScore: v } : t,
                                  ),
                                )
                              }
                              onValueCommit={([v]) => onEvaluate(test, { differenceScore: v })}
                            />
                          </Field>
                          <Field label={`Consistency — ${test.consistencyScore ?? 0}`}>
                            <Slider
                              value={[test.consistencyScore ?? 0]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={([v]) =>
                                setTests((prev) =>
                                  prev.map((t) =>
                                    t.id === test.id ? { ...t, consistencyScore: v } : t,
                                  ),
                                )
                              }
                              onValueCommit={([v]) => onEvaluate(test, { consistencyScore: v })}
                            />
                          </Field>
                        </div>

                        <Field label="Evaluator notes">
                          <Textarea
                            rows={3}
                            value={test.evaluatorNotes ?? ""}
                            onChange={(e) =>
                              setTests((prev) =>
                                prev.map((t) =>
                                  t.id === test.id ? { ...t, evaluatorNotes: e.target.value } : t,
                                ),
                              )
                            }
                            onBlur={(e) => onEvaluate(test, { evaluatorNotes: e.target.value })}
                          />
                        </Field>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            Support type
                          </span>
                          {SUPPORT_TYPES.map((type) => (
                            <Button
                              key={type}
                              size="sm"
                              variant={test.supportType === type ? "default" : "outline"}
                              onClick={() => onEvaluate(test, { supportType: type })}
                            >
                              {type}
                            </Button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            Promotion
                          </span>
                          <Button
                            size="sm"
                            variant={test.promotion === "PROVEN" ? "default" : "outline"}
                            onClick={() =>
                              onEvaluate(test, {
                                promotion: "PROVEN",
                                supportType: "PROMPT_PROVEN",
                              })
                            }
                          >
                            Mark PROVEN
                          </Button>
                          <Button
                            size="sm"
                            variant={test.promotion === "MERGE" ? "default" : "outline"}
                            onClick={() => onEvaluate(test, { promotion: "MERGE" })}
                          >
                            Flag MERGE
                          </Button>
                          <Button
                            size="sm"
                            variant={test.promotion === "REMOVE" ? "default" : "outline"}
                            onClick={() => onEvaluate(test, { promotion: "REMOVE" })}
                          >
                            Flag REMOVE
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEvaluate(test, { promotion: null })}
                          >
                            Clear
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Flags are advisory metadata only — nothing is deleted or merged
                          automatically.
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
