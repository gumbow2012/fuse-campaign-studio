import { Check, ChevronDown, Copy, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { JewelryProjectSummary } from "@/services/jewelryProjects";

export type ProjectSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * `[ Project name ▾ ]  Saved` — the workspace picker next to the page title.
 * Purely additive: with no project selected the label reads "Unsaved session"
 * and the page behaves exactly as before.
 */
export function ProjectPicker({
  projects,
  currentId,
  currentName,
  status,
  loading,
  onSelect,
  onNew,
  onDuplicate,
}: {
  projects: JewelryProjectSummary[];
  currentId: string | null;
  currentName: string;
  status: ProjectSaveStatus;
  loading?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
}) {
  const statusLabel =
    status === "saving"
      ? "SAVING…"
      : status === "saved"
        ? "SAVED"
        : status === "error"
          ? "SAVE FAILED"
          : currentId
            ? "SAVED"
            : "Not saved yet";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <span className="max-w-[220px] truncate">{currentName}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground">
            Projects
          </DropdownMenuLabel>
          {loading ? (
            <DropdownMenuItem disabled className="gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </DropdownMenuItem>
          ) : projects.length ? (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() => onSelect(project.id)}
                className="gap-2"
              >
                {project.id === currentId ? (
                  <Check className="h-3.5 w-3.5 text-cyan-300" />
                ) : (
                  <span className="h-3.5 w-3.5" />
                )}
                <span className="truncate">{project.name}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No saved projects yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onNew()} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> New Project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate()} className="gap-2">
            <Copy className="h-3.5 w-3.5" /> Duplicate Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.2em]",
          status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {statusLabel}
      </span>
    </div>
  );
}

export default ProjectPicker;
