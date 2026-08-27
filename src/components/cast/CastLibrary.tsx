/**
 * FUSE Cast library — the single premium cast picker reused everywhere:
 * onboarding step 4, Brand Workspace models panel, and the Template Runner
 * (via CastSelector).
 *
 * Data: avatar_profiles only (no new tables, no generation triggered here).
 *  - thumbnail_url  → canonical portrait
 *  - reference_assets → optional full-body / extra references
 *  - style_tags / visual_description → style line + optional filters
 *  - favorited → "Pinned"
 *
 * FUSE Cast members without an approved portrait render a branded
 * "Portrait coming soon" tile and are NOT selectable — never a blank card and
 * never a fabricated image.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Loader2, Plus, Search, Sparkles, Star, Upload, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { avatarInitials } from "@/lib/avatarImage";
import { isCanonicalReady } from "@/lib/canonicalPortrait";
import { listFuseAvatars, listMyAvatars, toggleFavorite, type AvatarProfile } from "@/services/avatarProfiles";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";
const TINY = "font-display text-[10px] uppercase tracking-[0.22em]";

type TabId = "all" | "mine" | "fuse" | "pinned";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "My avatars" },
  { id: "fuse", label: "FUSE Cast" },
  { id: "pinned", label: "Pinned" },
];

function styleLine(avatar: AvatarProfile): string {
  if (avatar.style_tags.length) return avatar.style_tags.slice(0, 3).join(" · ");
  return (avatar.visual_description ?? "").split(/[.,]/)[0]?.slice(0, 44) ?? "";
}

function matchesTrait(avatar: AvatarProfile, trait: string): boolean {
  const text = `${avatar.style_tags.join(" ")} ${avatar.visual_description ?? ""}`.toLowerCase();
  if (trait === "Male") return /\b(male|man|men|masculine|he\b|his\b)/.test(text);
  if (trait === "Female") return /\b(female|woman|women|feminine|she\b|her\b)/.test(text);
  return text.includes(trait.toLowerCase());
}

export function CastPortrait({ avatar }: { avatar: AvatarProfile }) {
  const src = avatar.thumbnail_url ?? avatar.reference_assets[0] ?? null;
  if (src) {
    return <img src={src} alt={avatar.name} loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_50%_25%,rgba(34,211,238,0.16),transparent_70%)] px-2 text-center">
      <span className="font-display text-2xl font-semibold text-cyan-100/80">{avatarInitials(avatar.name)}</span>
      <span className={`${TINY} text-slate-500`}>Portrait coming soon</span>
    </div>
  );
}

function CastCard({
  avatar,
  selected,
  disabled,
  onSelect,
  onTogglePin,
}: {
  avatar: AvatarProfile;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onTogglePin?: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[1.1rem] border bg-white/[0.03] transition",
        selected ? "border-cyan-300/70 ring-1 ring-cyan-300/50" : "border-white/10 hover:border-white/25",
        disabled && "opacity-70",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn("block w-full text-left", disabled && "cursor-not-allowed")}
      >
        <div className="relative aspect-[3/4] bg-black/50">
          <CastPortrait avatar={avatar} />
          {selected ? (
            <span className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-300 text-slate-950">
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : null}
          {avatar.reference_assets.length > 1 ? (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-300">
              <ImageIcon className="h-2.5 w-2.5" /> {avatar.reference_assets.length}
            </span>
          ) : null}
        </div>
        <div className="p-2.5">
          <p className="truncate text-xs font-semibold text-white">{avatar.name}</p>
          <p className="mt-1 truncate text-[9px] uppercase tracking-[0.16em] text-slate-500">
            {styleLine(avatar) || (avatar.source_type === "FUSE" ? "FUSE Cast" : "My avatar")}
          </p>
        </div>
      </button>
      {onTogglePin ? (
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={avatar.favorited ? "Unpin" : "Pin"}
          className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 p-1.5"
        >
          <Star className={cn("h-3.5 w-3.5", avatar.favorited ? "fill-cyan-300 text-cyan-300" : "text-slate-300")} />
        </button>
      ) : null}
    </div>
  );
}

export default function CastLibrary({
  userId,
  selectedIds,
  onToggle,
  mode = "single",
  busyId,
  className,
}: {
  userId?: string | null;
  selectedIds: string[];
  onToggle: (avatar: AvatarProfile) => void;
  mode?: "single" | "multi";
  busyId?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [trait, setTrait] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fuseQuery = useQuery({ queryKey: ["fuse-avatars"], queryFn: listFuseAvatars });
  const mineQuery = useQuery({
    queryKey: ["my-avatars", userId ?? "anon"],
    queryFn: () => listMyAvatars(userId ?? ""),
    enabled: Boolean(userId),
  });

  const fuse = fuseQuery.data ?? [];
  const mine = mineQuery.data ?? [];
  const all = useMemo(() => [...mine, ...fuse], [mine, fuse]);

  const pin = useMutation({
    mutationFn: (avatar: AvatarProfile) => toggleFavorite(avatar.id, !avatar.favorited),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-avatars"] });
      queryClient.invalidateQueries({ queryKey: ["fuse-avatars"] });
    },
    onError: () => toast.error("Could not update pin"),
  });

  // Only surface trait filters that real data can answer.
  const traitOptions = useMemo(
    () => ["Male", "Female"].filter((option) => all.some((avatar) => matchesTrait(avatar, option))),
    [all],
  );
  const styleOptions = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((avatar) => avatar.style_tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [all]);

  const visible = useMemo(() => {
    const base =
      tab === "mine" ? mine : tab === "fuse" ? fuse : tab === "pinned" ? all.filter((a) => a.favorited) : all;
    const query = search.trim().toLowerCase();
    return base.filter((avatar) => {
      const matchesSearch =
        !query ||
        avatar.name.toLowerCase().includes(query) ||
        avatar.style_tags.join(" ").toLowerCase().includes(query) ||
        (avatar.visual_description ?? "").toLowerCase().includes(query);
      const matchesFilter = !trait || matchesTrait(avatar, trait);
      return matchesSearch && matchesFilter;
    });
  }, [tab, mine, fuse, all, search, trait]);

  const loading = fuseQuery.isLoading || mineQuery.isLoading;

  const goCreate = (intent: "generate" | "upload") => {
    const from = `${location.pathname}${location.search}`;
    navigate(`/app/avatars?create=${intent}&from=${encodeURIComponent(from)}`);
  };

  return (
    <div className={cn("rounded-[1.5rem] border border-white/10 bg-white/[0.02] p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={LABEL}>Cast</p>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "multi" ? "Pick everyone who represents your brand." : "Pick who appears in this campaign."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cast"
              className="h-9 w-44 rounded-full border border-white/10 bg-black/30 pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((current) => !current)}
            className={`inline-flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 ${TINY} text-cyan-100`}
          >
            <Plus className="h-3 w-3" /> Create avatar
          </button>
        </div>
      </div>

      {showCreate ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.04] p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => goCreate("generate")}
            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-left hover:border-cyan-300/40"
          >
            <Sparkles className="mt-0.5 h-4 w-4 text-cyan-200" />
            <span>
              <span className={`${TINY} block text-cyan-100`}>[ Generate ]</span>
              <span className="mt-1 block text-xs text-slate-400">
                Describe the person and save them as a reusable cast member.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => goCreate("upload")}
            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-left hover:border-cyan-300/40"
          >
            <Upload className="mt-0.5 h-4 w-4 text-cyan-200" />
            <span>
              <span className={`${TINY} block text-cyan-100`}>[ Upload ]</span>
              <span className="mt-1 block text-xs text-slate-400">
                Turn your own photos into a reusable cast member.
              </span>
            </span>
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-full border px-3 py-1 ${TINY} transition ${
              tab === entry.id
                ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
            }`}
          >
            [ {entry.label} ]
          </button>
        ))}
      </div>

      {traitOptions.length || styleOptions.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[...traitOptions, ...styleOptions].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTrait((current) => (current === option ? null : option))}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] transition ${
                trait === option
                  ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                  : "border-white/10 text-slate-500 hover:text-white"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading cast…
        </p>
      ) : visible.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((avatar) => {
            const ready = avatar.source_type === "USER" || isCanonicalReady(avatar);
            return (
              <div key={avatar.id} className="relative">
                <CastCard
                  avatar={avatar}
                  selected={selectedIds.includes(avatar.id)}
                  disabled={!ready || busyId === avatar.id}
                  onSelect={() => onToggle(avatar)}
                  onTogglePin={avatar.source_type === "USER" ? () => pin.mutate(avatar) : undefined}
                />
                {!ready ? (
                  <p className={`${TINY} mt-1.5 text-center text-slate-500`}>Available soon</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-6 text-center">
          <Users className="mx-auto h-5 w-5 text-slate-500" />
          <p className="mt-2 text-sm text-slate-400">
            {tab === "pinned"
              ? "Nothing pinned yet — tap the star on a card."
              : !userId && tab === "mine"
                ? "Sign in to use your own cast."
                : "No cast members match that search."}
          </p>
        </div>
      )}
    </div>
  );
}
