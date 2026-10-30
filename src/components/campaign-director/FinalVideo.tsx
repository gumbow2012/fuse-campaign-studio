import { useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadAllClips } from "@/services/campaignDirectorEdit";
import { readyClips } from "@/lib/campaign-director/finalVideo";
import type { DirectorProject } from "@/lib/campaign-director/types";

type Props = {
  project: DirectorProject;
  name: string;
  /** Sends the clips to the Campaign Editor and opens it. */
  onOpenEditor: () => Promise<void>;
};

export default function FinalVideo({ project, name, onOpenEditor }: Props) {
  const [opening, setOpening] = useState(false);
  const [zipping, setZipping] = useState<string | null>(null);
  const ready = readyClips(project);
  const missing = project.shots.filter((s) => !s.video.url);

  const open = async () => {
    setOpening(true);
    try {
      await onOpenEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the editor.");
      setOpening(false);
    }
  };

  const zip = async () => {
    setZipping("Starting…");
    try {
      await downloadAllClips(project, name, (done, total) => setZipping(`Packing ${done}/${total}…`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the download.");
    } finally {
      setZipping(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Final video</p>
        <h2 className="text-lg font-semibold tracking-tight">{ready.length} of {project.shots.length} clips are finished</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open them in the editor already lined up in script order. Trim, reorder, add text or music, then export one video.
          {project.editProjectId ? " New clips are added to Available media, so your edits stay as they are." : ""}
        </p>
        {missing.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No clip yet for shot{missing.length === 1 ? "" : "s"} {missing.slice(0, 8).map((s) => s.index).join(", ")}
            {missing.length > 8 ? " and more" : ""}.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={ready.length === 0 || opening} onClick={() => void open()}>
          {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
          {project.editProjectId ? "Open in editor" : "Edit and export final video"}
        </Button>
        <Button type="button" variant="outline" disabled={ready.length === 0 || zipping !== null} onClick={() => void zip()}>
          {zipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {zipping ?? "Download all clips (.zip)"}
        </Button>
      </div>
    </section>
  );
}
