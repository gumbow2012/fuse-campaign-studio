import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Wand2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { issueSummary, validateScript } from "@/lib/campaign-director/script";
import type { DirectorProject } from "@/lib/campaign-director/types";

type Props = {
  project: DirectorProject;
  writing: boolean;
  onBriefChange: (brief: DirectorProject["brief"]) => void;
  onWrite: () => void;
};

export default function BriefPanel({ project, writing, onBriefChange, onWrite }: Props) {
  const { brief, shots, products } = project;
  const [confirmReplace, setConfirmReplace] = useState(false);
  const hasWork = shots.some((s) => s.image.url || s.video.url || s.image.requestId);
  const issues = useMemo(() => validateScript(shots, products, brief.shotCount), [shots, products, brief.shotCount]);
  const summary = issueSummary(issues);

  const start = () => (hasWork ? setConfirmReplace(true) : onWrite());

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="cd-theme">Theme / idea</Label>
        <Textarea
          id="cd-theme"
          rows={4}
          value={brief.theme}
          placeholder="e.g. Labor Day weekend takeover: he travels through a Caribbean festival and hands each artist their pouch."
          onChange={(e) => onBriefChange({ ...brief, theme: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cd-notes">Extra direction (optional)</Label>
        <Textarea
          id="cd-notes"
          rows={3}
          value={brief.notes}
          placeholder="Must-have scenes, mood, ending, anything the script must include."
          onChange={(e) => onBriefChange({ ...brief, notes: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28 space-y-1">
          <Label htmlFor="cd-count">Shots</Label>
          <Input
            id="cd-count"
            type="number"
            min={4}
            max={40}
            value={brief.shotCount}
            onChange={(e) => onBriefChange({ ...brief, shotCount: Math.min(40, Math.max(4, Number(e.target.value) || 20)) })}
          />
        </div>
        <Button type="button" disabled={writing || products.length === 0} onClick={start}>
          {writing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {shots.length ? "Rewrite script" : "Write script"}
        </Button>
        {products.length === 0 ? <span className="text-xs text-muted-foreground">Add product designs first.</span> : null}
        <span className="text-xs text-muted-foreground">Writing the script costs a fraction of a cent. No images are generated.</span>
      </div>

      {shots.length > 0 ? (
        <div className="space-y-1 rounded-md border p-3 text-sm">
          <p className="font-medium">
            Script check: {summary.errors} error{summary.errors === 1 ? "" : "s"}, {summary.warnings} warning{summary.warnings === 1 ? "" : "s"}
          </p>
          {issues.length === 0 ? <p className="text-xs text-muted-foreground">Every product has a hero shot, reveals are paced, cameras vary.</p> : null}
          <ul className="space-y-1">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {issue.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />}
                <span>{issue.shot ? `Shot ${issue.shot}: ` : ""}{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the script?</AlertDialogTitle>
            <AlertDialogDescription>
              This campaign already has generated images or clips. Rewriting the script replaces every shot, including the ones you paid for. The files stay in storage, but they will no longer be attached to a shot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my shots</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReplace(false);
                onWrite();
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
