import { Check, ChevronDown, ShieldCheck, Download, ImageIcon, Loader2, RotateCcw, Star, Undo2, Film, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { estimateRun, type RunEstimate, type UnitPrices } from "@/lib/campaign-director/costEstimate";
import { compileImageRequest, isShotReadyForImage } from "@/lib/campaign-director/promptCompiler";
import { type DirectorProject, type DirectorShot, type ShotStatus } from "@/lib/campaign-director/types";
import { cn } from "@/lib/utils";
import { SignedImg, SignedLink, SignedVideo } from "./Signed";
import ShotFields, { Field } from "./ShotFields";
import { friendlyError } from "@/lib/campaign-director/errors";

type Props = {
  project: DirectorProject;
  prices: UnitPrices | null;
  busy: boolean;
  onUpdateShot: (id: string, patch: Partial<DirectorShot>) => void;
  onRequest: (estimate: RunEstimate) => void;
  onSetArtistMaster: (shot: DirectorShot) => void;
  onCheck: (shot: DirectorShot) => void;
};

const STATUS_LABEL: Record<ShotStatus, string> = {
  draft: "Draft",
  image_queued: "Rendering…",
  image_ready: "Review",
  approved: "Approved",
  rejected: "Rejected",
  video_queued: "Animating…",
  video_ready: "Clip ready",
  failed: "Failed",
};

export default function ShotBoard({ project, prices, busy, onUpdateShot, onRequest, onSetArtistMaster, onCheck }: Props) {
  if (project.shots.length === 0) {
    return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No script yet. Write one above.</p>;
  }

  const request = (mode: "images" | "videos", id: string) => {
    if (!prices) return;
    const estimate = estimateRun(project, mode, prices, [id]);
    if (estimate.count > 0) onRequest(estimate);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {project.shots.map((shot) => {
        const blocked = isShotReadyForImage(shot, project);
        const rendering = shot.status === "image_queued" || shot.status === "video_queued";
        const compiled = compileImageRequest(shot, project);
        const chosen = project.products.filter((p) => shot.productIds.includes(p.id));

        return (
          <div key={shot.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="truncate text-sm font-medium">
                <span className="text-muted-foreground">{String(shot.index).padStart(2, "0")}</span> {shot.title}
              </p>
              <Badge variant={shot.status === "failed" || shot.status === "rejected" ? "destructive" : shot.status === "approved" || shot.status === "video_ready" ? "default" : "secondary"}>
                {STATUS_LABEL[shot.status]}
              </Badge>
            </div>

            <div className={cn("relative bg-muted", project.world.aspectRatio === "16:9" ? "aspect-video" : project.world.aspectRatio === "1:1" ? "aspect-square" : "aspect-[9/16] max-h-[420px]")}>
              {shot.video.url ? (
                <SignedVideo src={shot.video.url} poster={shot.image.url || undefined} controls loop playsInline className="h-full w-full object-contain" />
              ) : shot.image.url ? (
                <SignedImg src={shot.image.url} alt={shot.title} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full min-h-[160px] items-center justify-center p-4 text-center text-xs text-muted-foreground">
                  {rendering ? <Loader2 className="h-6 w-6 animate-spin" /> : "No image yet"}
                </div>
              )}
              {rendering && (shot.image.url || shot.video.url) ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : null}
            </div>

            <div className="space-y-2 p-3 text-xs">
              <p className="text-muted-foreground">
                {shot.act ? `${shot.act} · ` : ""}
                {shot.camera}
              </p>
              <p>{shot.action}</p>
              {chosen.length ? (
                <p className="text-muted-foreground">
                  Product: {chosen.map((p) => p.name).join(", ")} ({shot.productRole})
                  {shot.artistProductIds.length ? ` · artist on screen` : ""}
                </p>
              ) : null}
              {shot.image.url && shot.qa.checkedUrl === shot.image.url && shot.qa.verdict ? (
                <div className={cn("rounded-md border px-2 py-1.5", shot.qa.verdict === "pass" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" : "border-amber-500/50 text-amber-700 dark:text-amber-400")}>
                  <p className="font-medium">
                    {shot.qa.verdict === "pass" ? "Check passed: character, scale and product match" : shot.qa.verdict === "fail" ? "Check flagged this still" : "Check could not run"}
                  </p>
                  {shot.qa.issues.map((issue) => (
                    <p key={issue}>· {issue}</p>
                  ))}
                </div>
              ) : null}
              {shot.image.error || shot.video.error ? <p className="text-destructive">{friendlyError(shot.image.error || shot.video.error)}</p> : null}
              {blocked && shot.status === "draft" ? <p className="text-amber-600">{blocked}</p> : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {(shot.status === "draft" || shot.status === "rejected" || shot.status === "failed") && !shot.image.url ? (
                  <Button size="sm" disabled={busy || rendering || Boolean(blocked) || !prices} onClick={() => request("images", shot.id)}>
                    <ImageIcon className="mr-1 h-3.5 w-3.5" /> {shot.image.attempts > 0 ? "Regenerate" : "Generate"}
                  </Button>
                ) : null}
                {shot.status === "image_ready" ? (
                  <>
                    <Button size="sm" onClick={() => onUpdateShot(shot.id, { status: "approved" })}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onUpdateShot(shot.id, { status: "rejected", image: { ...shot.image, url: "", requestId: "" } })}>
                      <X className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                  </>
                ) : null}
                {shot.status === "failed" && shot.image.url ? (
                  <>
                    <Button size="sm" onClick={() => onUpdateShot(shot.id, { status: "image_ready", video: { ...shot.video, requestId: "", error: "" } })}>
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> Back to review
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onUpdateShot(shot.id, { status: "rejected", image: { ...shot.image, url: "", requestId: "" }, video: { ...shot.video, requestId: "", error: "" } })}>
                      <X className="mr-1 h-3.5 w-3.5" /> Reject image
                    </Button>
                  </>
                ) : null}
                {shot.status === "approved" ? (
                  <>
                    <Button size="sm" disabled={busy || !prices} onClick={() => request("videos", shot.id)}>
                      <Film className="mr-1 h-3.5 w-3.5" /> Animate
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onUpdateShot(shot.id, { status: "image_ready" })}>
                      <Undo2 className="mr-1 h-3.5 w-3.5" /> Unapprove
                    </Button>
                  </>
                ) : null}
                {shot.status === "video_ready" ? (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <SignedLink href={shot.video.url} download target="_blank" rel="noreferrer">
                        <Download className="mr-1 h-3.5 w-3.5" /> Clip
                      </SignedLink>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onUpdateShot(shot.id, { status: "approved", video: { ...shot.video, url: "", requestId: "" } })}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Re-animate
                    </Button>
                  </>
                ) : null}
                {shot.image.url && !rendering && (shot.qa.checkedUrl !== shot.image.url || shot.qa.verdict === "error") ? (
                  <Button size="sm" variant="outline" onClick={() => onCheck(shot)} title="Gemini compares this still with your character and product references">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Check
                  </Button>
                ) : null}
                {shot.image.url && shot.artistProductIds.length > 0 && shot.artistProductIds.some((id) => !project.artistMasters[id]) ? (
                  <Button size="sm" variant="outline" onClick={() => onSetArtistMaster(shot)} title="Lock this render as the artist's look for later shots">
                    <Star className="mr-1 h-3.5 w-3.5" /> Lock artist look
                  </Button>
                ) : null}
              </div>
            </div>

            <Collapsible className="border-t">
              <CollapsibleTrigger className="flex w-full items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className="h-3.5 w-3.5" /> Edit shot and see exactly what is sent
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 px-3 pb-3">
                <ShotFields shot={shot} project={project} onUpdateShot={onUpdateShot} />
                <Field label="Override the whole prompt (optional)">
                  <Textarea rows={3} value={shot.promptOverride} onChange={(e) => onUpdateShot(shot.id, { promptOverride: e.target.value })} />
                </Field>
                <div className="space-y-1 rounded-md bg-muted p-2">
                  <p className="text-xs font-medium">References sent, in order</p>
                  <ol className="list-decimal pl-4 text-[11px] text-muted-foreground">
                    {compiled.referenceLabels.map((label, i) => <li key={i}>{label}</li>)}
                  </ol>
                  <p className="pt-1 text-xs font-medium">Prompt</p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{compiled.prompt}</pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
