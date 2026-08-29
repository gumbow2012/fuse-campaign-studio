import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MaddenProjectSummary } from "@/lib/madden-media/types";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  projects: MaddenProjectSummary[];
  activeProjectId: string | null;
  name: string;
  saveLabel: string;
  busy?: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onNameChange: (name: string) => void;
  onDelete: (id: string) => void;
};

export default function MaddenProjectSwitcher({
  projects,
  activeProjectId,
  name,
  saveLabel,
  busy,
  onSelect,
  onCreate,
  onNameChange,
  onDelete,
}: Props) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Project name
          </label>
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Untitled project"
            className="mt-1"
            disabled={!activeProjectId}
          />
        </div>
        <div className="flex items-center gap-2 sm:pt-5">
          <span className="text-xs text-muted-foreground">{saveLabel}</span>
          <Button size="sm" variant="secondary" onClick={onCreate} disabled={busy}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New project
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No projects yet — create one to start building.
          </p>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId;
            return (
              <div
                key={project.id}
                className={cn(
                  "group flex items-center gap-1 rounded-full border px-1 pl-3 text-xs transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <button type="button" onClick={() => onSelect(project.id)} className="py-1.5">
                  {project.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${project.name}`}
                  onClick={() => onDelete(project.id)}
                  className="rounded-full p-1.5 text-muted-foreground/70 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
