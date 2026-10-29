import { useMemo } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ImageIcon, Plus, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { estimateRun, formatUsd, type RunEstimate, type UnitPrices } from "@/lib/campaign-director/costEstimate";
import { isShotReadyForImage } from "@/lib/campaign-director/promptCompiler";
import { issueSummary, validateScript } from "@/lib/campaign-director/script";
import { normalizeShot } from "@/lib/campaign-director/state";
import type { DirectorProject, DirectorShot } from "@/lib/campaign-director/types";
import ShotFields from "./ShotFields";

type Props = {
  project: DirectorProject;
  prices: UnitPrices | null;
  onUpdateShot: (id: string, patch: Partial<DirectorShot>) => void;
  onShotsChange: (shots: DirectorShot[]) => void;
  /** Opens the spend dialog. Nothing is generated from here. */
  onRequest: (estimate: RunEstimate) => void;
};

const renumber = (shots: DirectorShot[]) => shots.map((s, i) => ({ ...s, index: i + 1 }));

/** The script, before any image is paid for: read it, change anything, then generate. */
export default function ScriptEditor({ project, prices, onUpdateShot, onShotsChange, onRequest }: Props) {
  const { shots, products, brief } = project;
  const issues = useMemo(() => validateScript(shots, products, brief.shotCount), [shots, products, brief.shotCount]);
  const summary = issueSummary(issues);
  const reasons = [...new Set(shots.map((s) => isShotReadyForImage(s, project)).filter((r): r is string => Boolean(r)))];
  const estimate = prices ? estimateRun(project, "images", prices) : null;

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= shots.length) return;
    const next = [...shots];
    [next[i], next[j]] = [next[j], next[i]];
    onShotsChange(renumber(next));
  };
  const remove = (i: number) => onShotsChange(renumber(shots.filter((_, k) => k !== i)));
  const add = () => onShotsChange(renumber([...shots, normalizeShot({ title: `Shot ${shots.length + 1}` }, shots.length)]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Read through the script and change anything: the story beats, places, cameras, which bag is in which shot. Nothing is generated until you press
        the button at the bottom.
      </p>

      {issues.length > 0 ? (
        <details className="rounded-md border p-3 text-xs">
          <summary className="cursor-pointer text-sm font-medium">
            Script check: {summary.errors} error{summary.errors === 1 ? "" : "s"}, {summary.warnings} warning{summary.warnings === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                {issue.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />}
                <span>{issue.shot ? `Shot ${issue.shot}: ` : ""}{issue.message}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ol className="space-y-3">
        {shots.map((shot, i) => {
          const names = products.filter((p) => shot.productIds.includes(p.id)).map((p) => p.name);
          return (
            <li key={shot.id} className="space-y-2 rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-xs text-muted-foreground">{String(shot.index).padStart(2, "0")}</span>
                <Input className="h-8 font-medium" value={shot.title} onChange={(e) => onUpdateShot(shot.id, { title: e.target.value })} aria-label={`Shot ${shot.index} title`} />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === shots.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 hover:text-destructive" onClick={() => remove(i)} aria-label="Delete shot">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea rows={3} value={shot.action} onChange={(e) => onUpdateShot(shot.id, { action: e.target.value })} aria-label={`Shot ${shot.index} moment`} />
              <p className="text-xs text-muted-foreground">
                {shot.camera}
                {names.length ? ` · ${names.join(", ")} (${shot.productRole})` : " · no product"}
                {shot.reflective ? " · reflective" : ""}
              </p>
              <Collapsible>
                <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" /> Setting, camera, products, motion
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <ShotFields shot={shot} project={project} onUpdateShot={onUpdateShot} skip={["title", "action"]} />
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ol>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a shot
      </Button>

      <div className="sticky bottom-0 z-10 space-y-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        {reasons.length > 0 ? <p className="text-xs text-amber-600">Fix first: {reasons.slice(0, 3).join(" ")}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {shots.length} shots{prices ? "" : " · loading prices…"}
          </p>
          <Button type="button" size="lg" disabled={!estimate || estimate.count === 0 || reasons.length > 0} onClick={() => estimate && onRequest(estimate)}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Looks good: generate {estimate ? `${estimate.count} images (${formatUsd(estimate.usd)})` : "images"}
          </Button>
        </div>
      </div>
    </div>
  );
}
