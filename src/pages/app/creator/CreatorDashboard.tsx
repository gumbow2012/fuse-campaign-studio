/**
 * CREATOR STUDIO — the creator-facing workspace (ADDITIVE).
 *
 * Real data only: every tile and bucket is derived from rows the creator owns.
 * Metrics production does not track (template uses) are omitted, and future
 * surfaces (Analytics, Rewards) are labelled as not-yet-released placeholders.
 * No generation, Stripe, billing or credit-charging logic is touched here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Gift,
  LayoutDashboard,
  Layers3,
  Loader2,
  Send,
  UserRound,
  X,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getOwnCreatorProfile, type CreatorProfile } from "@/services/creatorProfile";
import {
  loadCreatorDashboard,
  toReviewBucket,
  type CreatorTemplate,
  type ReviewBucket,
} from "@/services/creatorDashboard";

type SectionId =
  | "overview"
  | "templates"
  | "drafts"
  | "submitted"
  | "approved"
  | "rejected"
  | "analytics"
  | "rewards"
  | "profile";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "templates", label: "My Templates" },
  { id: "drafts", label: "Drafts" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Needs Changes" },
  { id: "analytics", label: "Analytics" },
  { id: "rewards", label: "Rewards" },
  { id: "profile", label: "Profile" },
];

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm";

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={panelClass}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-black text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TemplateRow({ template }: { template: CreatorTemplate }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-semibold text-foreground">
          {template.name ?? "Untitled template"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {template.updated_at
            ? `updated ${new Date(template.updated_at).toLocaleDateString()}`
            : "no update date"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {template.review_status ? (
          <Badge variant="outline" className="border-white/15 text-[11px] text-muted-foreground">
            {template.review_status}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-white/15 text-[11px] text-muted-foreground">
            no review status
          </Badge>
        )}
      </div>

    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ComingLater({ title, note }: { title: string; note: string }) {
  return (
    <div className={panelClass}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        <Badge variant="outline" className="border-white/15 text-[11px] text-muted-foreground">
          Coming in a later release
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

const ONBOARDING_BANNER_KEY = "fuse.creatorDashboard.onboardingBanner.dismissed";

export default function CreatorDashboard() {
  const { user, profile } = useAuth();
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [templates, setTemplates] = useState<CreatorTemplate[]>([]);
  const [publishedCount, setPublishedCount] = useState(0);
  const [reviewStatusTracked, setReviewStatusTracked] = useState(false);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SectionId>("overview");
  const [onboardingBannerDismissed, setOnboardingBannerDismissed] = useState(true);

  useEffect(() => {
    setOnboardingBannerDismissed(window.localStorage.getItem(ONBOARDING_BANNER_KEY) === "1");
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [own, dashboard] = await Promise.all([
        getOwnCreatorProfile().catch(() => null),
        loadCreatorDashboard(user.id),
      ]);
      setCreatorProfile(own);
      setTemplates(dashboard.templates);
      setPublishedCount(dashboard.publishedCount);
      setReviewStatusTracked(dashboard.reviewStatusTracked);
      setCreditsEarned(dashboard.creditsEarned);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(() => {
    const grouped: Record<ReviewBucket, CreatorTemplate[]> = {
      draft: [],
      submitted: [],
      approved: [],
      rejected: [],
    };
    for (const template of templates) {
      const bucket = toReviewBucket(template.review_status);
      if (bucket) grouped[bucket].push(template);
    }
    return grouped;
  }, [templates]);

  const displayName =
    creatorProfile?.display_name || profile?.name || user?.email?.split("@")[0] || "creator";

  const renderBucket = (bucket: ReviewBucket, label: string) => (
    <div className={panelClass}>
      <h2 className="font-display text-lg font-bold text-foreground">{label}</h2>
      <div className="mt-4 space-y-2">
        {!reviewStatusTracked ? (
          <EmptyNote>
            Review status isn't tracked for your templates yet, so nothing is shown here rather than
            a placeholder count.
          </EmptyNote>
        ) : buckets[bucket].length ? (
          buckets[bucket].map((template) => <TemplateRow key={template.id} template={template} />)
        ) : (
          <EmptyNote>No templates in this stage.</EmptyNote>
        )}
      </div>
    </div>
  );

  return (
    <SiteShell>
      <PageMeta
        title="Creator Studio | FUSE"
        description="Publish templates, track review status and manage your FUSE creator presence."
        path="/app/creator"
      />

      <div className="mx-auto max-w-6xl px-6 py-12">
        {!loading && !creatorProfile && !onboardingBannerDismissed ? (
          <section className="relative mb-8 rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.06] p-5 backdrop-blur-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Getting started</p>
                <h2 className="mt-1 font-display text-lg font-bold text-foreground">
                  Finish setting up your creator profile
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your public profile and workspace checklist are one step away.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  asChild
                  className="rounded-full bg-cyan-300 px-5 text-slate-950 hover:bg-cyan-200"
                >
                  <Link to="/app/creator/welcome">Open onboarding</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Dismiss"
                  onClick={() => {
                    window.localStorage.setItem(ONBOARDING_BANNER_KEY, "1");
                    setOnboardingBannerDismissed(true);
                  }}
                  className="h-9 w-9 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <header>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Creator Studio</p>
          <h1 className="mt-2 font-display text-3xl font-black text-foreground sm:text-4xl">
            Welcome back, {displayName}
          </h1>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Templates Published"
            value={loading ? "—" : String(publishedCount)}
            hint="Templates you own in FUSE"
          />
          <StatTile label="Creator Level" value="Creator" hint="Levels arrive in a later release" />
          <StatTile
            label="Credits Earned"
            value={loading ? "—" : creditsEarned.toLocaleString()}
            hint="No creator rewards issued yet"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild className="rounded-full bg-cyan-300 px-5 text-slate-950 hover:bg-cyan-200">
            <Link to="/app/lab/templates">
              <Layers3 className="h-4 w-4" />
              Create Template
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
          >
            <Link to={creatorProfile ? `/creator/${creatorProfile.handle}` : "/creator/settings/edit"}>
              <UserRound className="h-4 w-4" />
              View Profile
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSection("submitted")}
            className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
          >
            <Send className="h-4 w-4" />
            Submissions
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSection("analytics")}
            className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </Button>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav className="flex flex-wrap gap-1.5 lg:flex-col" aria-label="Creator Studio sections">
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSection(entry.id)}
                className={cn(
                  "rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  section === entry.id
                    ? "border border-cyan-200/30 bg-white/10 text-foreground"
                    : "border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="space-y-6">
            {loading ? (
              <div className={cn(panelClass, "flex items-center gap-3 text-sm text-muted-foreground")}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your creator data…
              </div>
            ) : null}

            {section === "overview" ? (
              <div className={panelClass}>
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4 text-cyan-200" />
                  <h2 className="font-display text-lg font-bold text-foreground">Overview</h2>
                </div>
                <div className="mt-4 space-y-2">
                  {templates.length ? (
                    templates
                      .slice(0, 5)
                      .map((template) => <TemplateRow key={template.id} template={template} />)
                  ) : (
                    <EmptyNote>
                      You don't own any templates yet. Build your first one in the template builder.
                    </EmptyNote>
                  )}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Template usage counts aren't tracked in production yet, so no usage metric is shown.
                </p>
              </div>
            ) : null}

            {section === "templates" ? (
              <div className={panelClass}>
                <h2 className="font-display text-lg font-bold text-foreground">My Templates</h2>
                <div className="mt-4 space-y-2">
                  {templates.length ? (
                    templates.map((template) => (
                      <TemplateRow key={template.id} template={template} />
                    ))
                  ) : (
                    <EmptyNote>No templates yet.</EmptyNote>
                  )}
                </div>
              </div>
            ) : null}

            {section === "drafts" ? renderBucket("draft", "Drafts") : null}
            {section === "submitted" ? renderBucket("submitted", "Submitted") : null}
            {section === "approved" ? renderBucket("approved", "Approved") : null}
            {section === "rejected" ? renderBucket("rejected", "Rejected / Needs Changes") : null}

            {section === "analytics" ? (
              <ComingLater
                title="Analytics"
                note="Creator analytics — template runs, revenue attribution and audience breakdowns — ships in a later release. Nothing is estimated here in the meantime."
              />
            ) : null}

            {section === "rewards" ? (
              <div className="space-y-4">
                <ComingLater
                  title="Rewards"
                  note="Creator reward payouts ship in a later release. Your ledger currently contains no creator reward entries."
                />
                <div className={cn(panelClass, "flex items-center gap-2 text-sm text-muted-foreground")}>
                  <Gift className="h-4 w-4" />
                  Credits earned to date: {creditsEarned.toLocaleString()}
                </div>
              </div>
            ) : null}

            {section === "profile" ? (
              <div className={panelClass}>
                <h2 className="font-display text-lg font-bold text-foreground">Profile</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  {creatorProfile
                    ? `Your public profile lives at /creator/${creatorProfile.handle}.`
                    : "You haven't set up a public creator profile yet."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
                  >
                    <Link to="/creator/settings/edit">Edit profile</Link>
                  </Button>
                  {creatorProfile ? (
                    <Button
                      asChild
                      variant="outline"
                      className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
                    >
                      <Link to={`/creator/${creatorProfile.handle}`}>View public profile</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
