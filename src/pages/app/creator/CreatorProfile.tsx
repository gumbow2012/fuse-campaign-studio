/**
 * FUSE Creator — PUBLIC profile page at /creator/:handle.
 *
 * Exposes ONLY public `creator_profiles` fields. Metrics are real data only:
 * template count + join date. Uses / likes / followers are not tracked yet and
 * are deliberately absent (no invented numbers).
 *
 * The curated accent tints ONLY the glow, badge, button highlight and the
 * portfolio divider — the base FUSE dark shell is untouched.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink, Instagram, MapPin, Music2, Pencil } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { accentStyle, resolveAccent } from "@/lib/creatorAccents";
import { CreatorPerformanceProof } from "@/components/CreatorPerformance";
import {
  EMPTY_CREATOR_PERFORMANCE,
  loadPublicCreatorPerformance,
  type CreatorPerformanceAggregate,
} from "@/services/creatorPerformance";
import {
  countCreatorTemplatesByHandle,
  getCreatorProfileByHandle,
  type CreatorProfile as CreatorProfileRow,
} from "@/services/creatorProfile";

function joinedLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function externalHref(value: string, prefix = "") {
  const raw = value.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${prefix}${raw.replace(/^@+/, "")}`;
}

export default function CreatorProfile() {
  const { handle = "" } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreatorProfileRow | null>(null);
  const [templateCount, setTemplateCount] = useState<number | null>(null);
  const [performance, setPerformance] = useState<CreatorPerformanceAggregate>(
    EMPTY_CREATOR_PERFORMANCE,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPerformance(EMPTY_CREATOR_PERFORMANCE);
    getCreatorProfileByHandle(handle)
      .then(async (row) => {
        if (cancelled) return;
        setProfile(row);
        if (row) {
          const count = await countCreatorTemplatesByHandle(row.handle);
          if (!cancelled) setTemplateCount(count);
          const aggregate = await loadPublicCreatorPerformance({ handle: row.handle });
          if (!cancelled) setPerformance(aggregate);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load that profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const accent = useMemo(() => resolveAccent(profile?.accent), [profile?.accent]);
  const isOwner = Boolean(user && profile && user.id === profile.user_id);
  const joined = profile ? joinedLabel(profile.created_at) : null;

  const socials = profile
    ? [
        profile.instagram
          ? {
              key: "instagram",
              label: `@${profile.instagram.replace(/^@+/, "")}`,
              href: externalHref(profile.instagram, "https://instagram.com/"),
              icon: Instagram,
            }
          : null,
        profile.tiktok
          ? {
              key: "tiktok",
              label: `@${profile.tiktok.replace(/^@+/, "")}`,
              href: externalHref(profile.tiktok, "https://tiktok.com/@"),
              icon: Music2,
            }
          : null,
        profile.x_handle
          ? {
              key: "x",
              label: `@${profile.x_handle.replace(/^@+/, "")}`,
              href: externalHref(profile.x_handle, "https://x.com/"),
              icon: ExternalLink,
            }
          : null,
        profile.website
          ? { key: "website", label: "Website", href: externalHref(profile.website, "https://"), icon: ExternalLink }
          : null,
        profile.portfolio_url
          ? {
              key: "portfolio",
              label: "Portfolio",
              href: externalHref(profile.portfolio_url, "https://"),
              icon: ExternalLink,
            }
          : null,
      ].filter(Boolean as unknown as (value: unknown) => boolean)
    : [];

  return (
    <SiteShell>
      <PageMeta
        title={profile ? `${profile.display_name} (@${profile.handle}) · FUSE Creator` : "FUSE Creator"}
        description={
          profile?.bio?.slice(0, 155) ??
          "A FUSE creator profile: specialties, portfolio links and published templates."
        }
        path={`/creator/${handle}`}
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8" style={accentStyle(accent)}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : !profile ? (
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <h1 className="text-xl font-semibold">Creator not found</h1>
            <p className="text-sm text-muted-foreground">
              No public FUSE creator uses the handle @{handle}.
            </p>
          </div>
        ) : (
          <>
            {/* banner (optional) */}
            <div
              className="relative h-40 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] sm:h-56"
              style={{ boxShadow: `0 0 60px -20px rgba(var(--creator-accent-rgb), 0.55)` }}
            >
              {profile.banner_url ? (
                <img
                  src={profile.banner_url}
                  alt={`${profile.display_name} banner`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(120%_120%_at_50%_-20%,rgba(var(--creator-accent-rgb),0.18),transparent_70%)]" />
              )}
            </div>

            <header className="-mt-14 flex flex-col gap-4 px-1 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-4">
                <div
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 bg-background sm:h-28 sm:w-28"
                  style={{
                    borderColor: "var(--creator-accent)",
                    boxShadow: `0 0 40px -8px rgba(var(--creator-accent-rgb), 0.6)`,
                  }}
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                      {profile.display_name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="space-y-1 pb-1">
                  <h1 className="text-2xl font-semibold leading-tight">{profile.display_name}</h1>
                  <p className="text-sm text-muted-foreground">@{profile.handle}</p>
                  {profile.location ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {profile.location}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  asChild
                  style={{
                    backgroundColor: "var(--creator-accent)",
                    color: "#0b0d0f",
                    boxShadow: `0 0 30px -10px rgba(var(--creator-accent-rgb), 0.8)`,
                  }}
                >
                  <Link to={`/app/templates?creator=${profile.handle}`}>View Templates</Link>
                </Button>
                <Button variant="outline" disabled title="Follows aren't built yet">
                  Follow · coming soon
                </Button>
                {isOwner ? (
                  <Button asChild variant="ghost">
                    <Link to="/creator/settings/edit">
                      <Pencil className="mr-1.5 h-4 w-4" /> Edit profile
                    </Link>
                  </Button>
                ) : null}
              </div>
            </header>

            {profile.bio ? <p className="max-w-2xl text-sm text-foreground/90">{profile.bio}</p> : null}

            {profile.specialties.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.specialties.map((specialty) => (
                  <span
                    key={specialty}
                    className="rounded-full border px-3 py-1 text-xs"
                    style={{
                      borderColor: `rgba(var(--creator-accent-rgb), 0.45)`,
                      backgroundColor: `rgba(var(--creator-accent-rgb), 0.1)`,
                      color: "var(--creator-accent)",
                    }}
                  >
                    {specialty}
                  </span>
                ))}
              </div>
            ) : null}

            {/* REAL metrics only */}
            <div className="flex flex-wrap gap-6 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
              <div>
                <p className="text-lg font-semibold">{templateCount ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Templates published</p>
              </div>
              {joined ? (
                <div>
                  <p className="text-lg font-semibold">{joined}</p>
                  <p className="text-xs text-muted-foreground">On FUSE since</p>
                </div>
              ) : null}
            </div>

            <CreatorPerformanceProof aggregate={performance} />



            {profile.description ? (
              <section className="space-y-3">
                <div
                  className="h-px w-full"
                  style={{
                    background: `linear-gradient(90deg, rgba(var(--creator-accent-rgb),0.7), transparent)`,
                  }}
                />
                <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">About</h2>
                <p className="max-w-2xl whitespace-pre-wrap text-sm text-foreground/85">
                  {profile.description}
                </p>
              </section>
            ) : null}

            {socials.length ? (
              <section className="space-y-3">
                <div
                  className="h-px w-full"
                  style={{
                    background: `linear-gradient(90deg, rgba(var(--creator-accent-rgb),0.7), transparent)`,
                  }}
                />
                <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Links</h2>
                <div className="flex flex-wrap gap-2">
                  {(socials as Array<{ key: string; label: string; href: string; icon: typeof Instagram }>).map(
                    (social) => (
                      <a
                        key={social.key}
                        href={social.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        style={{ borderColor: `rgba(var(--creator-accent-rgb), 0.28)` }}
                      >
                        <social.icon className="h-3.5 w-3.5" style={{ color: "var(--creator-accent)" }} />
                        {social.label}
                      </a>
                    ),
                  )}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </SiteShell>
  );
}
