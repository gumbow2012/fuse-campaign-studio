import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { assembleHatFilm, fetchHatFilmState, isTabLockFree, OtherTabError, type HatFilmState } from "@/services/hatFilm/assembler";
import { hatFilmPanelMode, readyShotCount } from "@/lib/hatFilmPanel";

const PHASE_COPY: Record<string, string> = {
  generating_stills: "Creating shots",
  generating_clips: "Animating shots",
  needs_review: "Some shots need review",
  assembling_video: "Ready to assemble",
  assembly_failed: "Assembly didn't finish",
  ready: "Film ready",
};

/** Shown only on Hat Brand Film runs; renders nothing for any other run. */
export default function HatFilmAssemblyPanel({ jobId }: { jobId: string }) {
  const [state, setState] = useState<HatFilmState | null>(null);
  const [notHat, setNotHat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ p: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const [tabLockFree, setTabLockFree] = useState(true);
  const [otherTab, setOtherTab] = useState(false);

  const load = useCallback(async () => {
    try { setState(await fetchHatFilmState(jobId)); }
    catch (e) { if (/not a hat|hat brand film/i.test(String(e))) setNotHat(true); else setError(e instanceof Error ? e.message : String(e)); }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (notHat || busy || state?.final_url) return;
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, [load, notHat, busy, state?.final_url]);

  const start = useCallback(async (current: HatFilmState) => {
    setBusy(true); setError(null);
    try {
      await assembleHatFilm(jobId, current, (p, stage) => setProgress({ p, stage }));
      await load();
    } catch (e) {
      if (e instanceof OtherTabError) setOtherTab(true);
      else setError(e instanceof Error ? e.message : String(e));
      await load();
    } finally { setBusy(false); setProgress(null); }
  }, [jobId, load]);

  useEffect(() => {
    if (!state?.assembly.owned || busy) return;
    let alive = true;
    void isTabLockFree(jobId).then((free) => { if (alive) setTabLockFree(free); });
    return () => { alive = false; };
  }, [jobId, state?.assembly.owned, busy]);

  const mode = state ? hatFilmPanelMode(state, { busy, autoStarted: autoStarted.current, tabLockFree }) : "idle";
  useEffect(() => {
    if (!state || mode !== "auto_start") return;
    autoStarted.current = true;
    void start(state);
  }, [state, mode, start]);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  if (notHat || !state) return null;
  const done = readyShotCount(state.shots);

  return (
    <section className="mb-6 rounded-2xl border border-border/60 bg-card/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Hat Brand Film</h2>
        <span className="text-xs text-muted-foreground">{busy ? "Assembling" : PHASE_COPY[state.phase] ?? state.phase} · {done}/12 shots</span>
      </div>

      {state.final_url ? (
        <div className="mt-4 space-y-3">
          <video src={state.final_url} controls playsInline className="mx-auto aspect-[9/16] max-h-[70vh] rounded-xl bg-muted" />
          <Button asChild variant="secondary"><a href={state.final_url} download="hat-brand-film.mp4">Download film</a></Button>
        </div>
      ) : busy && progress ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Keep this tab open while assembling.</p>
          <Progress value={progress.p} />
          <p className="text-xs text-muted-foreground">{progress.stage}. The film is assembled in this browser, not in the background.</p>
        </div>
      ) : state.phase === "needs_review" ? (
        <p className="mt-3 text-sm text-muted-foreground">One or more shots didn't pass the product check after a retry. Review them below before the film can be assembled.</p>
      ) : !busy && (mode === "other_tab" || otherTab) ? (
        <p className="mt-3 text-sm text-muted-foreground">Another tab is assembling this film. Keep that tab open.</p>
      ) : state.phase === "assembly_failed" || error ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-destructive">{error ?? state.assembly.error ?? "Assembly didn't finish."}</p>
          {state.manifest ? <Button onClick={() => start(state)}>Try assembling again</Button> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Your shots are being created. The film assembles here automatically once they're done.</p>
      )}
    </section>
  );
}
