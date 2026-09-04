/**
 * The campaign's name, edited in place.
 *
 * Pencil (or click) opens an inline field; Enter saves through the editor's
 * `set_meta` op, Esc cancels. The saved name is what the export file and folder
 * are named after, so it is a first-class part of the header — not a label.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditableCampaignNameProps {
  name: string | null;
  placeholder?: string;
  saving?: boolean;
  savedAt?: number | null;
  onSave?: (name: string) => void;
  className?: string;
}

export function EditableCampaignName({
  name,
  placeholder = "Untitled campaign",
  saving = false,
  savedAt = null,
  onSave,
  className,
}: EditableCampaignNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name ?? "");
  }, [editing, name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === (name ?? "").trim()) return;
    onSave?.(next);
  };

  if (editing) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <input
          ref={inputRef}
          value={draft}
          maxLength={80}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            else if (event.key === "Escape") setEditing(false);
          }}
          onBlur={commit}
          aria-label="Campaign name"
          className="w-full min-w-0 max-w-2xl rounded-xl border border-cyan-300/50 bg-slate-950/80 px-3 py-2 font-display text-2xl font-bold tracking-tight text-white outline-none transition-shadow duration-200 focus:shadow-[0_0_0_3px_rgba(103,232,249,0.18)] sm:text-3xl"
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={commit}
          aria-label="Save campaign name"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 text-cyan-100 transition-colors duration-200 hover:bg-cyan-300/20"
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            setEditing(false);
          }}
          aria-label="Cancel rename"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-slate-400 transition-colors duration-200 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <h2
        className={cn(
          "min-w-0 truncate font-display text-2xl font-bold tracking-tight sm:text-3xl",
          name ? "text-white" : "text-slate-500",
        )}
      >
        {name || placeholder}
      </h2>
      {onSave ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename campaign"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 transition-colors duration-200 hover:border-cyan-300/40 hover:text-cyan-100"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      {saving ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving
        </span>
      ) : savedAt ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-cyan-200/90">
          <Check className="h-3.5 w-3.5" aria-hidden /> Saved
        </span>
      ) : null}
    </div>
  );
}

export default EditableCampaignName;
