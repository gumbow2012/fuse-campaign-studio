import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import WorldPanel from "@/components/campaign-director/WorldPanel";
import ProductsPanel from "@/components/campaign-director/ProductsPanel";
import BriefPanel from "@/components/campaign-director/BriefPanel";
import ShotBoard from "@/components/campaign-director/ShotBoard";
import SimpleStart from "@/components/campaign-director/SimpleStart";
import ScriptEditor from "@/components/campaign-director/ScriptEditor";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import RunBar from "@/components/campaign-director/RunBar";
import SpendDialog from "@/components/campaign-director/SpendDialog";
import { createEmptyProject } from "@/lib/campaign-director/defaults";
import { emptyQa } from "@/lib/campaign-director/state";
import { friendlyError } from "@/lib/campaign-director/errors";
import type { RunEstimate, UnitPrices } from "@/lib/campaign-director/costEstimate";
import type { DirectorProduct, DirectorProject, DirectorProjectSummary, DirectorShot } from "@/lib/campaign-director/types";
import {
  createProject,
  deleteProject,
  getUnitPrices,
  listProjects,
  loadProject,
  pollJob,
  qaCheckShot,
  renameProject,
  saveProject,
  submitImage,
  submitVideo,
  writeScript,
} from "@/services/campaignDirector";

const AUTOSAVE_DELAY_MS = 1200;
const POLL_INTERVAL_MS = 6000;
const SUBMIT_CONCURRENCY = 3;

type Prices = UnitPrices & { live: boolean };

function Section({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{step}</p>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function CampaignDirector() {
  const [projects, setProjects] = useState<DirectorProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [project, setProject] = useState<DirectorProject>(() => createEmptyProject());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [writing, setWriting] = useState(false);
  const [running, setRunning] = useState(false);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [pending, setPending] = useState<RunEstimate | null>(null);

  const restoringRef = useRef(false);
  const projectRef = useRef(project);
  const activeRef = useRef<string | null>(null);
  projectRef.current = project;
  activeRef.current = activeId;

  /* ---------- loading ---------- */
  const open = useCallback(async (id: string) => {
    restoringRef.current = true;
    try {
      const loaded = await loadProject(id);
      setActiveId(loaded.id);
      setName(loaded.name);
      setProject(loaded.project);
      setSaveState("idle");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that campaign");
    } finally {
      setTimeout(() => {
        restoringRef.current = false;
      }, 0);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await listProjects();
        setProjects(rows);
        if (rows[0]) await open(rows[0].id);
        else {
          // First visit: start a campaign right away so the drop zone is usable.
          const created = await createProject("My first campaign");
          setProjects(await listProjects());
          await open(created.id);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load your campaigns");
      }
    })();
  }, [open]);

  /* ---------- autosave ---------- */
  useEffect(() => {
    if (!activeId || restoringRef.current) return;
    setSaveState("saving");
    const timer = setTimeout(() => {
      void saveProject(activeId, project)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeId, project]);

  /** Saves right now. Used after every paid submission so a job id is never lost. */
  const persistNow = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return;
    try {
      await saveProject(id, projectRef.current);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, []);

  /* ---------- prices (read-only lookup, no spend) ---------- */
  const pricingKey = `${project.world.imageResolution}|${project.world.videoModel}`;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void getUnitPrices(projectRef.current)
      .then((p) => !cancelled && setPrices(p))
      .catch(() => !cancelled && setPrices(null));
    return () => {
      cancelled = true;
    };
  }, [activeId, pricingKey]);

  /* ---------- helpers ---------- */
  const patchShot = useCallback((id: string, patch: Partial<DirectorShot>) => {
    setProject((prev) => ({ ...prev, shots: prev.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }, []);

  /** Gemini check of a finished still against the exact references. Text-only, no generation spend. */
  const runQa = useCallback(
    async (shot: DirectorShot, stillUrl: string) => {
      try {
        const result = await qaCheckShot(shot, stillUrl, projectRef.current);
        patchShot(shot.id, { qa: { verdict: result.pass ? "pass" : "fail", issues: result.issues, checkedUrl: stillUrl } });
      } catch (error) {
        patchShot(shot.id, { qa: { verdict: "error", issues: [error instanceof Error ? error.message : "QA check failed"], checkedUrl: stillUrl } });
      }
    },
    [patchShot],
  );

  /* ---------- polling for rendering jobs ---------- */
  const hasQueued = project.shots.some((s) => s.status === "image_queued" || s.status === "video_queued");
  useEffect(() => {
    if (!activeId || !hasQueued) return;
    let stopped = false;
    const tick = async () => {
      const current = projectRef.current;
      const queued = current.shots.filter((s) => (s.status === "image_queued" && s.image.requestId) || (s.status === "video_queued" && s.video.requestId));
      await Promise.all(
        queued.map(async (shot) => {
          const kind = shot.status === "video_queued" ? "video" : "image";
          const requestId = kind === "video" ? shot.video.requestId : shot.image.requestId;
          try {
            const result = await pollJob(kind, requestId, activeRef.current ?? "", current.world.videoModel);
            if (stopped) return;
            if (result.state === "done") {
              patchShot(
                shot.id,
                kind === "image"
                  ? { status: "image_ready", image: { ...shot.image, url: result.url, error: "" }, qa: emptyQa() }
                  : { status: "video_ready", video: { ...shot.video, url: result.url, error: "" } },
              );
              if (kind === "image") void runQa(shot, result.url);
            } else if (result.state === "failed") {
              patchShot(
                shot.id,
                kind === "image"
                  ? { status: "failed", image: { ...shot.image, error: friendlyError(result.error) } }
                  : { status: "failed", video: { ...shot.video, error: friendlyError(result.error) } },
              );
              toast.error(`Shot ${shot.index}: ${friendlyError(result.error)}`);
            }
          } catch {
            /* transient poll error: try again next tick */
          }
        }),
      );
    };
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeId, hasQueued, patchShot, runQa]);

  /* ---------- run (only after the spend dialog was approved) ---------- */
  const execute = useCallback(
    async (estimate: RunEstimate) => {
      setPending(null);
      setRunning(true);
      const queue = [...estimate.shotIds];
      let submitted = 0;

      const worker = async () => {
        while (queue.length) {
          const id = queue.shift()!;
          const shot = projectRef.current.shots.find((s) => s.id === id);
          if (!shot) continue;
          try {
            if (estimate.mode === "images") {
              patchShot(id, { status: "image_queued", image: { ...shot.image, attempts: shot.image.attempts + 1, error: "" } });
              const requestId = await submitImage(shot, projectRef.current);
              patchShot(id, { image: { ...projectRef.current.shots.find((s) => s.id === id)!.image, requestId } });
            } else {
              patchShot(id, { status: "video_queued", video: { ...shot.video, attempts: shot.video.attempts + 1, error: "" } });
              const requestId = await submitVideo(shot, projectRef.current);
              patchShot(id, { video: { ...projectRef.current.shots.find((s) => s.id === id)!.video, requestId } });
            }
            submitted += 1;
            await persistNow();
          } catch (error) {
            const message = friendlyError(error instanceof Error ? error.message : "Submit failed");
            patchShot(id, estimate.mode === "images" ? { status: "failed", image: { ...shot.image, error: message } } : { status: "failed", video: { ...shot.video, error: message } });
            toast.error(`Shot ${shot.index}: ${message}`);
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(SUBMIT_CONCURRENCY, queue.length) }, () => worker()));
      await persistNow();
      setRunning(false);
      toast.success(`${submitted} ${estimate.mode === "images" ? "image" : "clip"} job${submitted === 1 ? "" : "s"} submitted.`);
    },
    [patchShot, persistNow],
  );

  /* ---------- script ---------- */
  const onWrite = async () => {
    setWriting(true);
    try {
      const shots = await writeScript(projectRef.current);
      if (shots.length === 0) throw new Error("The script came back empty. Try again.");
      setProject((prev) => ({ ...prev, shots, artistMasters: prev.artistMasters }));
      toast.success(`${shots.length} shots written.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not write the script");
    } finally {
      setWriting(false);
    }
  };

  const addProduct = (product: DirectorProduct) => setProject((prev) => ({ ...prev, products: [...prev.products, product] }));
  const updateProduct = (id: string, patch: Partial<DirectorProduct>) =>
    setProject((prev) => ({ ...prev, products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const removeProduct = (id: string) => setProject((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));

  const onSetArtistMaster = (shot: DirectorShot) => {
    setProject((prev) => {
      const masters = { ...prev.artistMasters };
      for (const id of shot.artistProductIds) if (!masters[id]) masters[id] = shot.image.url;
      return { ...prev, artistMasters: masters };
    });
    toast.success("Artist look locked for later shots.");
  };

  /* ---------- campaign list actions ---------- */
  const onCreate = async () => {
    try {
      // A new campaign keeps the world: same character, locks and looks. Products and shots start empty.
      const seed: DirectorProject = { ...createEmptyProject(), world: projectRef.current.world };
      const created = await createProject(`Campaign ${projects.length + 1}`, seed);
      setProjects(await listProjects());
      await open(created.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create that campaign");
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this campaign? Generated files stay in storage, but the shot list is removed.")) return;
    try {
      await deleteProject(id);
      const rows = await listProjects();
      setProjects(rows);
      if (id === activeId) {
        if (rows[0]) await open(rows[0].id);
        else {
          setActiveId(null);
          setProject(createEmptyProject());
          setName("");
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that campaign");
    }
  };

  useEffect(() => {
    if (!activeId || restoringRef.current) return;
    const timer = setTimeout(() => {
      void renameProject(activeId, name)
        .then(() => setProjects((prev) => prev.map((p) => (p.id === activeId ? { ...p, name: name.trim() || "Untitled campaign" } : p))))
        .catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activeId, name]);

  // Once any image has been requested the script is locked in and the shot board takes over.
  const started = project.shots.some((s) => s.image.requestId || s.image.url || s.status !== "draft");

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : activeId ? "Up to date" : "No campaign";

  return (
    <SiteShell>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:px-4 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Campaign Director</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Drop your mylars. Type the idea.</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{saveLabel}</span>
            <Button size="sm" variant="secondary" onClick={() => void onCreate()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New campaign
            </Button>
          </div>
        </header>

        {projects.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-1 pl-3 text-xs",
                  p.id === activeId ? "border-primary/40 bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <button type="button" className="py-1.5" onClick={() => void open(p.id)}>
                  {p.name}
                </button>
                <button type="button" aria-label={`Delete ${p.name}`} className="rounded-full p-1.5 hover:text-destructive" onClick={() => void onDelete(p.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {!activeId ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">Setting up your campaign…</div>
        ) : (
          <div className="space-y-5">
            <SimpleStart
              project={project}
              writing={writing}
              onAddProduct={addProduct}
              onUpdateProduct={updateProduct}
              onRemoveProduct={removeProduct}
              onThemeChange={(theme) => setProject((prev) => ({ ...prev, brief: { ...prev.brief, theme } }))}
              onWrite={() => void onWrite()}
            />

            {project.shots.length > 0 && !started ? (
              <Section step="Your script" title="Edit it, then generate">
                <ScriptEditor
                  project={project}
                  prices={prices}
                  onUpdateShot={patchShot}
                  onShotsChange={(shots) => setProject((prev) => ({ ...prev, shots }))}
                  onRequest={setPending}
                />
              </Section>
            ) : null}

            {project.shots.length > 0 && started ? (
              <>
                <Section step="Your shots" title="Review, approve, animate">
                  <ShotBoard
                    project={project}
                    prices={prices}
                    busy={running}
                    onUpdateShot={patchShot}
                    onRequest={setPending}
                    onSetArtistMaster={onSetArtistMaster}
                    onCheck={(shot) => void runQa(shot, shot.image.url)}
                  />
                </Section>
                <RunBar project={project} prices={prices} running={running} onRequest={setPending} />
              </>
            ) : null}

            <Collapsible className="rounded-2xl border border-border/60 bg-card/30">
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
                <span>Advanced: character photos, look, product details, shot count</span>
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-5 px-3 pb-4 sm:px-4">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Campaign name</label>
                  <Input className="mt-1" value={name} placeholder="Untitled campaign" onChange={(e) => setName(e.target.value)} />
                </div>
                <Section step="Character and world" title="Same look in every campaign">
                  <WorldPanel world={project.world} onChange={(world) => setProject((prev) => ({ ...prev, world }))} />
                </Section>
                <Section step="Product details" title="Names the script and prompts use">
                  <ProductsPanel products={project.products} onChange={(products) => setProject((prev) => ({ ...prev, products }))} />
                </Section>
                <Section step="Script options" title="Extra direction and shot count">
                  <BriefPanel project={project} writing={writing} onBriefChange={(brief) => setProject((prev) => ({ ...prev, brief }))} onWrite={() => void onWrite()} />
                </Section>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>

      <SpendDialog estimate={pending} project={project} onCancel={() => setPending(null)} onApprove={(estimate) => void execute(estimate)} />
    </SiteShell>
  );
}

