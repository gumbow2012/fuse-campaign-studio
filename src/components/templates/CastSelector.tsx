/**
 * FT7 — "Cast your campaign" selector. UI + selection state only: the chosen
 * avatar is NOT sent to the runner in this phase.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Star, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listFuseAvatars, listMyAvatars, type AvatarProfile } from "@/services/avatarProfiles";
import { isCanonicalReady } from "@/lib/canonicalPortrait";

/** Structured for cast_a / cast_b / cast_c later; a single slot for now. */
export type CastSelection = Record<string, string | null>;

export const PRIMARY_CAST_SLOT = "cast_a";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";

function AvatarTile({
  avatar,
  selected,
  onSelect,
}: {
  avatar: AvatarProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group overflow-hidden rounded-[1.1rem] border bg-white/[0.03] text-left transition-colors",
        selected ? "border-cyan-300/70" : "border-white/10 hover:border-white/25",
      )}
    >
      <div className="relative aspect-[3/4] bg-black/50">
        {avatar.thumbnail_url ? (
          <img src={avatar.thumbnail_url} alt={avatar.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.16em] text-slate-600">
            No image
          </div>
        )}
        {avatar.favorited ? (
          <span className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 p-1">
            <Star className="h-3 w-3 fill-cyan-300 text-cyan-300" />
          </span>
        ) : null}
      </div>
      <div className="p-2.5">
        <p className="truncate text-xs font-semibold text-white">{avatar.name}</p>
        {avatar.style_tags.length ? (
          <p className="mt-1 truncate text-[9px] uppercase tracking-[0.16em] text-slate-500">
            {avatar.style_tags.slice(0, 3).join(" · ")}
          </p>
        ) : null}
      </div>
    </button>
  );
}

export default function CastSelector({
  userId,
  selection,
  onSelectionChange,
  slot = PRIMARY_CAST_SLOT,
  required = false,
}: {
  userId?: string | null;
  /** FT8 — mirrors cast_config.required; affects copy only (generation untouched). */
  required?: boolean;
  selection: CastSelection;
  onSelectionChange: (next: CastSelection) => void;
  slot?: string;
}) {
  const [picking, setPicking] = useState(false);

  const fuseAvatars = useQuery({ queryKey: ["fuse-avatars"], queryFn: listFuseAvatars });
  const myAvatars = useQuery({
    queryKey: ["my-avatars", userId],
    queryFn: () => listMyAvatars(userId ?? ""),
    enabled: Boolean(userId),
  });

  // FT14b — customers never see a FUSE character without an approved master portrait.
  const fuse = (fuseAvatars.data ?? []).filter(isCanonicalReady);
  const mine = myAvatars.data ?? [];
  const selectedId = selection[slot] ?? null;

  const selectedAvatar = useMemo(
    () => [...mine, ...fuse].find((avatar) => avatar.id === selectedId) ?? null,
    [fuse, mine, selectedId],
  );

  const loading = fuseAvatars.isLoading || myAvatars.isLoading;
  const select = (id: string) => {
    onSelectionChange({ ...selection, [slot]: id });
    setPicking(false);
  };

  if (selectedAvatar && !picking) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
        <p className={LABEL}>Cast your campaign</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-32 w-24 shrink-0 overflow-hidden rounded-[1rem] border border-white/10 bg-black/40">
            {selectedAvatar.thumbnail_url ? (
              <img
                src={selectedAvatar.thumbnail_url}
                alt={selectedAvatar.name}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{selectedAvatar.name}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
              {selectedAvatar.source_type === "FUSE" ? "FUSE Avatar" : "My Avatar"}
            </p>
            {selectedAvatar.style_tags.length ? (
              <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                {selectedAvatar.style_tags.slice(0, 3).join(" · ")}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPicking(true)}
              className="mt-3 h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
            >
              Change cast
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={LABEL}>Cast your campaign</p>
          <p className="mt-1 text-sm text-slate-400">
            Pick who appears in this drop.{" "}
            <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
              {required ? "Required" : "Optional"}
            </span>
          </p>
        </div>
        <Button
          asChild
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
        >
          <Link to="/app/avatars">
            <Users className="h-3.5 w-3.5" /> Upload your own
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading avatars…
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          <section>
            <p className={LABEL}>FUSE Avatars</p>
            {fuse.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {fuse.map((avatar) => (
                  <AvatarTile
                    key={avatar.id}
                    avatar={avatar}
                    selected={avatar.id === selectedId}
                    onSelect={() => select(avatar.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No FUSE avatars are published yet.</p>
            )}
          </section>

          <section>
            <p className={LABEL}>My Avatars</p>
            {!userId ? (
              <p className="mt-2 text-xs text-slate-500">Sign in to use your own avatars.</p>
            ) : mine.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {mine.map((avatar) => (
                  <AvatarTile
                    key={avatar.id}
                    avatar={avatar}
                    selected={avatar.id === selectedId}
                    onSelect={() => select(avatar.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                You haven't saved any avatars yet — upload your own to reuse a cast member.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
