/**
 * FUSE — PUBLIC creators directory at /creators/browse.
 *
 * Read-only browse over public `creator_profiles` rows. All search/filter work
 * is client-side over the fetched list. No verification permission logic is
 * touched and `verification_reason` is never fetched or rendered.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Users } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreatorVerificationBadge from "@/components/CreatorVerificationBadge";
import { isBadgedVerification } from "@/lib/creatorVerification";
import { listPublicCreators, type PublicCreatorListing } from "@/services/creatorProfile";
import { cn } from "@/lib/utils";

const panelClass =
  "rounded-2xl border border-white/10 bg-slate-950/70 p-5 transition-colors hover:border-cyan-200/40";

function CreatorCard({ creator }: { creator: PublicCreatorListing }) {
  return (
    <Link to={`/creator/${creator.handle}`} className={cn(panelClass, "block")}>
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-cyan-200/30 bg-white/5">
          {creator.avatar_url ? (
            <img
              src={creator.avatar_url}
              alt={creator.display_name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {creator.display_name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-display text-sm font-semibold uppercase tracking-[0.08em] text-white">
            {creator.display_name}
            <CreatorVerificationBadge status={creator.verification_status} size={12} />
          </p>
          <p className="truncate text-xs text-slate-400">@{creator.handle}</p>
        </div>
      </div>

      {creator.bio ? (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{creator.bio}</p>
      ) : null}

      {creator.specialties?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {creator.specialties.slice(0, 4).map((specialty) => (
            <span
              key={specialty}
              className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100"
            >
              {specialty}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

export default function CreatorsDirectoryPage() {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const { data: creators = [], isLoading, error } = useQuery({
    queryKey: ["public-creators-directory"],
    queryFn: () => listPublicCreators(),
    staleTime: 60_000,
  });

  const specialties = useMemo(() => {
    const set = new Set<string>();
    creators.forEach((creator) => creator.specialties?.forEach((item) => set.add(item)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [creators]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creators.filter((creator) => {
      if (verifiedOnly && !isBadgedVerification(creator.verification_status)) return false;
      if (specialty && !(creator.specialties ?? []).includes(specialty)) return false;
      if (!needle) return true;
      const haystack = [creator.display_name, creator.handle, ...(creator.specialties ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [creators, query, specialty, verifiedOnly]);

  return (
    <SiteShell>
      <PageMeta
        title="Browse FUSE Creators · Campaign Template Makers"
        description="Meet the creators building FUSE campaign templates. Browse by specialty, follow your favourites and run their templates."
        path="/creators/browse"
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <header className="max-w-2xl">
          <p className="font-display text-[10px] uppercase tracking-[0.28em] text-cyan-200/70">
            Creators directory
          </p>
          <h1 className="mt-3 font-display text-3xl font-black text-foreground sm:text-4xl">
            Meet the FUSE creators
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every public FUSE creator, with the specialties they build for. Open a storefront to see their
            templates and follow their work.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/5">
              <Link to="/creators">
                Creator Program
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="mt-8 space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, handle or specialty"
              aria-label="Search creators"
              className="rounded-full pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVerifiedOnly((value) => !value)}
              aria-pressed={verifiedOnly}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
                verifiedOnly
                  ? "border-cyan-200/60 bg-cyan-200/15 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-400 hover:text-white",
              )}
            >
              Verified only
            </button>
            {specialties.length ? (
              <>
                <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
                <button
                  type="button"
                  onClick={() => setSpecialty(null)}
                  aria-pressed={specialty === null}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
                    specialty === null
                      ? "border-cyan-200/60 bg-cyan-200/15 text-cyan-100"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white",
                  )}
                >
                  All specialties
                </button>
                {specialties.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setSpecialty(item)}
                    aria-pressed={specialty === item}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
                      specialty === item
                        ? "border-cyan-200/60 bg-cyan-200/15 text-cyan-100"
                        : "border-white/10 bg-white/5 text-slate-400 hover:text-white",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </div>

        <section className="mt-8">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
                />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-rose-300">Could not load the creators directory. Please try again.</p>
          ) : filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
              <Users className="mx-auto h-6 w-6 text-cyan-200/70" />
              <p className="mt-3 font-display text-sm uppercase tracking-[0.16em] text-white">
                No creators match that
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a different search, or clear the filters to see every public creator.
              </p>
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
