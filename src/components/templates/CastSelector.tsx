/**
 * FT7 / Phase 5 — "Cast your campaign" selector.
 *
 * Thin wrapper around the shared premium CastLibrary so the runner, the Brand
 * Workspace and onboarding all use the exact same picker. Selected cast IS sent
 * to the runner (cast_config), so copy must never claim otherwise.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import CastLibrary, { CastPortrait } from "@/components/cast/CastLibrary";
import { listFuseAvatars, listMyAvatars } from "@/services/avatarProfiles";

/** Structured for cast_a / cast_b / cast_c later; a single slot for now. */
export type CastSelection = Record<string, string | null>;

export const PRIMARY_CAST_SLOT = "cast_a";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";

export default function CastSelector({
  userId,
  selection,
  onSelectionChange,
  slot = PRIMARY_CAST_SLOT,
  required = false,
}: {
  userId?: string | null;
  /** FT8 — mirrors cast_config.required; affects copy only. */
  required?: boolean;
  selection: CastSelection;
  onSelectionChange: (next: CastSelection) => void;
  slot?: string;
}) {
  const [picking, setPicking] = useState(false);

  const fuseAvatars = useQuery({ queryKey: ["fuse-avatars"], queryFn: listFuseAvatars });
  const myAvatars = useQuery({
    queryKey: ["my-avatars", userId ?? "anon"],
    queryFn: () => listMyAvatars(userId ?? ""),
    enabled: Boolean(userId),
  });

  const selectedId = selection[slot] ?? null;
  const selectedAvatar = useMemo(
    () =>
      [...(myAvatars.data ?? []), ...(fuseAvatars.data ?? [])].find((avatar) => avatar.id === selectedId) ?? null,
    [fuseAvatars.data, myAvatars.data, selectedId],
  );

  if (selectedAvatar && !picking) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
        <p className={LABEL}>Cast your campaign</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-32 w-24 shrink-0 overflow-hidden rounded-[1rem] border border-white/10 bg-black/40">
            <CastPortrait avatar={selectedAvatar} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{selectedAvatar.name}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
              {selectedAvatar.source_type === "FUSE" ? "FUSE Cast" : "My avatar"}
            </p>
            {selectedAvatar.style_tags.length ? (
              <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                {selectedAvatar.style_tags.slice(0, 3).join(" · ")}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPicking(true)}
                className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
              >
                Change cast
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelectionChange({ ...selection, [slot]: null })}
                className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Pick who appears in this drop.{" "}
          <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {required ? "Required" : "Optional"}
          </span>
        </p>
        <Button
          asChild
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
        >
          <Link to="/app/avatars">
            <Users className="h-3.5 w-3.5" /> Manage cast
          </Link>
        </Button>
      </div>
      <CastLibrary
        userId={userId}
        mode="single"
        selectedIds={selectedId ? [selectedId] : []}
        onToggle={(avatar) => {
          onSelectionChange({ ...selection, [slot]: avatar.id === selectedId ? null : avatar.id });
          setPicking(false);
        }}
      />
    </div>
  );
}
