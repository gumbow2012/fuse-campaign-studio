import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Loader2, Pencil, Plus } from "lucide-react";
import type { CinemaProjectSummary } from "@/lib/cinema/types";

/** Cinema project picker — new / rename / switch, with autosave status. */
export interface CinemaProjectPickerProps {
  projects: CinemaProjectSummary[];
  activeProjectId: string | null;
  activeName: string;
  saveState: "idle" | "saving" | "saved" | "error";
  onNewProject: () => void;
  onSelectProject: (projectId: string) => void;
  onRename: (name: string) => void;
}

export default function CinemaProjectPicker({
  projects,
  activeProjectId,
  activeName,
  saveState,
  onNewProject,
  onSelectProject,
  onRename,
}: CinemaProjectPickerProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(activeName);

  const commitRename = () => {
    const next = draft.trim();
    if (next) onRename(next);
    setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="h-9 w-[220px]"
        />
        <Button size="sm" variant="secondary" onClick={commitRename}>
          <Check className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-[240px]">
            <span className="truncate">{activeName || "Untitled Project"}</span>
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em]">
            Saved Projects
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.length ? (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() => onSelectProject(project.id)}
                className="flex items-center gap-2"
              >
                {project.id === activeProjectId ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No saved projects yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onNewProject()}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            New project
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDraft(activeName);
              setRenaming(true);
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {saveState === "saving" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving
          </>
        ) : saveState === "saved" ? (
          "Saved"
        ) : saveState === "error" ? (
          <span className="text-destructive">Not saved</span>
        ) : null}
      </span>
    </div>
  );
}
