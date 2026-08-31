/**
 * CREATOR STUDIO — the creator-facing workspace (ADDITIVE).
 *
 * Real data only: every tile and bucket is derived from rows the creator owns.
 * Metrics production does not track (template uses) are omitted, and future
 * surfaces (Analytics, Rewards) are labelled as not-yet-released placeholders.
 * No generation, Stripe, billing or credit-charging logic is touched here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Check,
  Copy,
  Gift,
  LayoutDashboard,
  Layers3,
  Loader2,
  Send,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";
import { getCreatorLevel } from "@/lib/creatorLevels";
import { getOwnCreatorProfile, type CreatorProfile } from "@/services/creatorProfile";
import { CreatorPerformancePanel } from "@/components/CreatorPerformance";
import {
  EMPTY_CREATOR_PERFORMANCE,
  loadCreatorPerformance,
  type CreatorPerformanceAggregate,
} from "@/services/creatorPerformance";
import {
  loadCreatorAnalytics,
  loadCreatorChallenges,
  loadCreatorDashboard,
  loadCreatorRewards,
  toReviewBucket,
  type CreatorAnalytics,
  type CreatorChallenge,
  type CreatorReward,
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
  | "earnings"
  | "resources"
  | "challenges"
  | "rewards"
  | "profile";

const CREATE_TEMPLATE_PATH = "/app/lab/templates";

const SECTIONS: Array<{ id: SectionId; label: string; to?: string }> = [
  { id: "overview", label: "Creator Home" },
  { id: "templates", label: "My Templates" },
  { id: "drafts", label: "Drafts" },
  { id: "submitted", label: "Submitted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Needs Changes" },
  { id: "analytics", label: "Analytics" },
  { id: "earnings", label: "Earnings" },
  { id: "profile", label: "Profile" },
  { id: "resources", label: "Resources" },
  { id: "challenges", label: "Challenges" },
  { id: "rewards", label: "Levels & Rewards" },
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
const SHARE_FLAG_KEY = "fuse.creatorDashboard.linkShared";
const CHECKLIST_DISMISSED_KEY = "fuse.creatorDashboard.checklistDismissed";

type ChecklistItem = { id: string; label: string; done: boolean };

function ChecklistCard({
  items,
  complete,
  onDismiss,
}: {
  items: ChecklistItem[];
  complete: boolean;
  onDismiss: () => void;
}) {
  const doneCount = items.filter((item) => item.done).length;

  if (complete) {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-cyan-200/20 bg-cyan-200/[0.05] px-4 py-3">
        <p className="text-sm text-foreground">Setup complete ✓</p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Dismiss setup checklist"
          onClick={onDismiss}
          className="h-8 w-8 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(panelClass, "mb-6")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          Creator setup
        </p>
        <p className="font-display text-sm font-bold text-cyan-200">
          {doneCount}/{items.length}
        </p>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                item.done
                  ? "border-cyan-200/40 bg-cyan-300 text-slate-950"
                  : "border-white/20 bg-white/5 text-transparent",
              )}
            >
              <Check className="h-3 w-3" />
            </span>
            <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreatorLinkCard({
  handle,
  copied,
  onCopy,
}: {
  handle: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className={panelClass}>
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        Your creator link
      </p>
      {handle ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-all font-display text-sm font-semibold text-foreground">
            fuse-us.com/creator/{handle}
          </p>
          <Button
            type="button"
            onClick={onCopy}
            className="rounded-full bg-cyan-300 px-5 text-slate-950 hover:bg-cyan-200"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <EmptyNote>Pick a creator handle to get your shareable link.</EmptyNote>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
          >
            <Link to="/creator/settings/edit">Set up profile</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

const FIRST_RUN_STEPS = [
  { n: "01", title: "BUILD", note: "Turn a campaign into a reusable template" },
  { n: "02", title: "PUBLISH", note: "Submit it — the FUSE team reviews, then it goes live" },
  { n: "03", title: "SHARE", note: "Put your creator link in front of your audience" },
];

function FirstRunHome({
  displayName,
  doneSteps,
  onStart,
}: {
  displayName: string;
  doneSteps: number;
  onStart: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className={panelClass}>
        <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">
          Welcome to FUSE Creator
        </p>
        <h2 className="mt-2 font-display text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl">
          Welcome to FUSE Creator{displayName ? `, ${displayName}` : ""}.
        </h2>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-foreground">
            Your first goal: Publish your first template.
          </p>
          <Badge variant="outline" className="border-white/15 text-[11px] text-muted-foreground">
            {doneSteps}/3
          </Badge>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-300 transition-all"
            style={{ width: `${Math.round((doneSteps / 3) * 100)}%` }}
          />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {FIRST_RUN_STEPS.map((step) => (
            <div key={step.n} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="font-display text-xs font-bold tracking-[0.2em] text-cyan-200/80">
                {step.n}
              </p>
              <p className="mt-1 font-display text-sm font-bold tracking-[0.12em] text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.note}</p>
            </div>
          ))}
        </div>

        <Button
          type="button"
          onClick={onStart}
          className="mt-6 w-full rounded-full bg-cyan-300 px-6 py-6 font-display text-sm font-bold tracking-[0.12em] text-slate-950 hover:bg-cyan-200 sm:w-auto"
        >
          CREATE YOUR FIRST TEMPLATE →
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">Pricing &amp; earnings unlock soon.</p>
      </div>
    </div>
  );
}


export default function CreatorDashboard() {
  const { user, profile } = useAuth();
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [templates, setTemplates] = useState<CreatorTemplate[]>([]);
  const [publishedCount, setPublishedCount] = useState(0);
  const [reviewStatusTracked, setReviewStatusTracked] = useState(false);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [rewards, setRewards] = useState<CreatorReward[]>([]);
  const [analytics, setAnalytics] = useState<CreatorAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [performance, setPerformance] = useState<CreatorPerformanceAggregate>(
    EMPTY_CREATOR_PERFORMANCE,
  );
  const [challenges, setChallenges] = useState<CreatorChallenge[] | null>(null);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengesError, setChallengesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<SectionId>("overview");
  const [onboardingBannerDismissed, setOnboardingBannerDismissed] = useState(true);
  const [linkShared, setLinkShared] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setOnboardingBannerDismissed(window.localStorage.getItem(ONBOARDING_BANNER_KEY) === "1");
    setLinkShared(window.localStorage.getItem(SHARE_FLAG_KEY) === "1");
    setChecklistDismissed(window.localStorage.getItem(CHECKLIST_DISMISSED_KEY) === "1");
  }, []);

  useEffect(() => {
    track("creator_home_view");
  }, []);


  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const uses: Record<string, number> = {};
    try {
      const result = await loadCreatorAnalytics();
      setAnalytics(result);
      for (const row of result.perTemplate) uses[row.template_id] = row.runs;
    } catch (error) {
      setAnalytics(null);
      setAnalyticsError(error instanceof Error ? error.message : "Unknown error");
    }
    setPerformance(await loadCreatorPerformance(user?.id ?? "", uses));
    setAnalyticsLoading(false);
  }, [user?.id]);

  const loadChallenges = useCallback(async () => {
    setChallengesLoading(true);
    setChallengesError(null);
    try {
      setChallenges(await loadCreatorChallenges());
    } catch (error) {
      setChallenges(null);
      setChallengesError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setChallengesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === "challenges" && !challenges && !challengesLoading && !challengesError) {
      void loadChallenges();
    }
  }, [section, challenges, challengesLoading, challengesError, loadChallenges]);


  useEffect(() => {
    if (
      (section === "analytics" || section === "overview") &&
      !analytics &&
      !analyticsLoading &&
      !analyticsError
    ) {
      void loadAnalytics();
    }
  }, [section, analytics, analyticsLoading, analyticsError, loadAnalytics]);



  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [own, dashboard, rewardRows] = await Promise.all([
        getOwnCreatorProfile().catch(() => null),
        loadCreatorDashboard(user.id),
        loadCreatorRewards(user.id).catch(() => []),
      ]);
      setCreatorProfile(own);
      setTemplates(dashboard.templates);
      setPublishedCount(dashboard.publishedCount);
      setReviewStatusTracked(dashboard.reviewStatusTracked);
      setCreditsEarned(dashboard.creditsEarned);
      setRewards(rewardRows);
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

  const approvedCount = reviewStatusTracked ? buckets.approved.length : 0;
  const level = useMemo(() => getCreatorLevel(approvedCount), [approvedCount]);

  const displayName =
    creatorProfile?.display_name || profile?.name || user?.email?.split("@")[0] || "creator";

  const handle = creatorProfile?.handle ?? null;
  const hasTemplates = templates.length > 0;
  const hasSubmitted =
    buckets.submitted.length + buckets.approved.length > 0 ||
    (!reviewStatusTracked && publishedCount > 0);

  const checklist = useMemo<ChecklistItem[]>(
    () => [
      { id: "account", label: "Account claimed", done: true },
      { id: "profile", label: "Creator profile created", done: !!handle },
      { id: "build", label: "Create your first template", done: hasTemplates },
      { id: "publish", label: "Publish / submit a template", done: hasSubmitted },
      { id: "share", label: "Share your creator link", done: linkShared },
    ],
    [handle, hasTemplates, hasSubmitted, linkShared],
  );

  const checklistComplete = checklist.every((item) => item.done);
  const firstRun = !loading && !hasTemplates && publishedCount === 0;

  const startFirstTemplate = useCallback(() => {
    track("creator_first_template_started");
    navigate(CREATE_TEMPLATE_PATH);
  }, [navigate]);

  const copyCreatorLink = useCallback(async () => {
    if (!handle) return;
    const url = `https://fuse-us.com/creator/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be unavailable — still mark the step done */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    try {
      window.localStorage.setItem(SHARE_FLAG_KEY, "1");
    } catch {
      /* ignore */
    }
    setLinkShared(true);
    track("creator_profile_link_copied");
  }, [handle]);



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

        {!loading && !(checklistComplete && checklistDismissed) ? (
          <ChecklistCard
            items={checklist}
            complete={checklistComplete}
            onDismiss={() => {
              try {
                window.localStorage.setItem(CHECKLIST_DISMISSED_KEY, "1");
              } catch {
                /* ignore */
              }
              setChecklistDismissed(true);
            }}
          />
        ) : null}

        <header>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Creator Studio</p>
          <h1 className="mt-2 font-display text-3xl font-black text-foreground sm:text-4xl">
            {firstRun ? "Creator Home" : `Welcome back, ${displayName}`}
          </h1>
        </header>

        {!firstRun ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Templates Published"
              value={loading ? "—" : String(publishedCount)}
              hint="Templates you own in FUSE"
            />
            <StatTile
              label="Creator Level"
              value={loading ? "—" : level.current.name}
              hint={
                reviewStatusTracked
                  ? `${approvedCount} approved template${approvedCount === 1 ? "" : "s"}`
                  : "Review status not tracked yet"
              }
            />
            <StatTile
              label="Credits Earned"
              value={loading ? "—" : creditsEarned.toLocaleString()}
              hint="No creator rewards issued yet"
            />
          </div>
        ) : null}


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
            <button
              type="button"
              onClick={startFirstTemplate}
              className="rounded-xl border border-cyan-200/30 bg-cyan-200/10 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-cyan-200/20"
            >
              Create Template
            </button>
            {SECTIONS.map((entry) =>
              entry.id === "profile" ? (
                <Link
                  key={entry.id}
                  to={handle ? `/creator/${handle}` : "/creator/settings/edit"}
                  className="rounded-xl border border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  {entry.label}
                </Link>
              ) : (
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
              ),
            )}
          </nav>


          <div className="space-y-6">
            {loading ? (
              <div className={cn(panelClass, "flex items-center gap-3 text-sm text-muted-foreground")}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your creator data…
              </div>
            ) : null}

            {section === "overview" && !loading ? (
              firstRun ? (
                <FirstRunHome
                  displayName={displayName}
                  doneSteps={
                    [hasTemplates, hasSubmitted, linkShared].filter(Boolean).length
                  }
                  onStart={startFirstTemplate}
                />
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatTile
                      label="Published templates"
                      value={String(publishedCount)}
                      hint="Templates you own in FUSE"
                    />
                    <StatTile
                      label="Runs"
                      value={analytics ? String(analytics.totalRuns) : "—"}
                      hint={
                        analytics
                          ? `${analytics.runsLast30d} in last 30 days`
                          : analyticsLoading
                            ? "Loading real runs…"
                            : "Run data unavailable"
                      }
                    />
                    <StatTile
                      label="Earnings"
                      value="—"
                      hint="Coming soon with creator monetization"
                    />
                  </div>

                  <CreatorLinkCard handle={handle} copied={copied} onCopy={() => void copyCreatorLink()} />

                  <div className={panelClass}>
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-cyan-200" />
                      <h2 className="font-display text-lg font-bold text-foreground">
                        Your top templates
                      </h2>
                    </div>
                    <div className="mt-4 space-y-2">
                      {analytics && analytics.perTemplate.length ? (
                        analytics.perTemplate.slice(0, 5).map((row) => (
                          <div
                            key={row.template_id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                          >
                            <p className="min-w-0 truncate font-display text-sm font-semibold text-foreground">
                              {row.name ?? "Untitled template"}
                            </p>
                            <Badge
                              variant="outline"
                              className="border-white/15 text-[11px] text-muted-foreground"
                            >
                              {row.runs} run{row.runs === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        ))
                      ) : templates.length ? (
                        templates
                          .slice(0, 5)
                          .map((template) => <TemplateRow key={template.id} template={template} />)
                      ) : (
                        <EmptyNote>
                          Nothing here yet — build a template and it'll show up.
                        </EmptyNote>
                      )}
                    </div>
                  </div>

                  <div className={panelClass}>
                    <h2 className="font-display text-lg font-bold text-foreground">
                      Recent activity
                    </h2>
                    <div className="mt-4 space-y-2">
                      {analytics &&
                      analytics.perTemplate.some((row) => row.lastRunAt) ? (
                        analytics.perTemplate
                          .filter((row) => row.lastRunAt)
                          .sort((a, b) => (a.lastRunAt! < b.lastRunAt! ? 1 : -1))
                          .slice(0, 5)
                          .map((row) => (
                            <div
                              key={`activity-${row.template_id}`}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                            >
                              <p className="min-w-0 truncate text-sm text-foreground">
                                {row.name ?? "Untitled template"}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                last run {new Date(row.lastRunAt!).toLocaleDateString()}
                              </span>
                            </div>
                          ))
                      ) : (
                        <EmptyNote>
                          No runs yet. Share your creator link — runs appear here as soon as
                          customers use your templates.
                        </EmptyNote>
                      )}
                    </div>
                  </div>
                </div>
              )
            ) : null}

            {section === "earnings" ? (
              <ComingLater
                title="Earnings"
                note="Earnings arrive with the FUSE Creator monetization launch. You'll be able to set what you earn per run and track it here."
              />
            ) : null}

            {section === "resources" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className={panelClass}>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    How templates work
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    A template is a reusable campaign: you build the workflow once, customers add
                    their own product and run it.
                  </p>
                </div>
                <div className={panelClass}>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Building templates
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Start in the builder, decide what customers upload, preview the customer
                    experience, then submit for review.
                  </p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="mt-3 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                  >
                    <Link to={CREATE_TEMPLATE_PATH}>Open builder</Link>
                  </Button>
                </div>
                <div className={panelClass}>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Sharing your profile
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Published templates live on your creator page. Share that link with your
                    audience so people can run your work.
                  </p>
                  {handle ? (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="mt-3 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                    >
                      <Link to={`/creator/${handle}`}>View your page</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}


            {section === "templates" ? (
              <div className={panelClass}>
                <h2 className="font-display text-lg font-bold text-foreground">Your template library</h2>
                <div className="mt-4 space-y-2">
                  {templates.length ? (
                    templates.map((template) => (
                      <TemplateRow key={template.id} template={template} />
                    ))
                  ) : (
                    <div className="space-y-3">
                      <EmptyNote>
                        Everything you build will live here. You haven't created anything yet.
                      </EmptyNote>
                      <Button
                        type="button"
                        onClick={startFirstTemplate}
                        className="rounded-full bg-cyan-300 px-5 font-display text-xs font-bold tracking-[0.12em] text-slate-950 hover:bg-cyan-200"
                      >
                        CREATE YOUR FIRST TEMPLATE →
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}


            {section === "drafts" ? renderBucket("draft", "Drafts") : null}
            {section === "submitted" ? renderBucket("submitted", "Submitted") : null}
            {section === "approved" ? renderBucket("approved", "Approved") : null}
            {section === "rejected" ? renderBucket("rejected", "Rejected / Needs Changes") : null}

            {section === "analytics" ? (
              <div className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold text-foreground">Analytics</h2>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Real template runs
                  </p>
                </div>

                {analyticsLoading ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
                  </div>
                ) : analyticsError ? (
                  <div className="mt-6 space-y-3">
                    <EmptyNote>Analytics couldn't be loaded: {analyticsError}</EmptyNote>
                    <Button variant="outline" size="sm" onClick={() => void loadAnalytics()}>
                      Retry
                    </Button>
                  </div>
                ) : !analytics || analytics.totalRuns === 0 ? (
                  <div className="mt-6">
                    <EmptyNote>
                      No template runs yet. Once customers run your published templates, analytics
                      appear here.
                    </EmptyNote>
                  </div>
                ) : (
                  <div className="mt-6 space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <StatTile label="Total runs" value={String(analytics.totalRuns)} />
                      <StatTile label="Runs (30d)" value={String(analytics.runsLast30d)} hint={`${analytics.runsLast7d} in last 7 days`} />
                      <StatTile
                        label="Success rate"
                        value={`${Math.round(analytics.successRate * 100)}%`}
                        hint={`${analytics.successfulRuns} complete · ${analytics.failedRuns} failed`}
                      />
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                        Last 30 days
                      </p>
                      <div className="mt-3 flex h-24 items-end gap-1">
                        {analytics.daily.map((point) => {
                          const max = Math.max(...analytics.daily.map((d) => d.runs), 1);
                          const height = point.runs > 0 ? Math.max(6, (point.runs / max) * 100) : 2;
                          return (
                            <div
                              key={point.date}
                              title={`${point.date}: ${point.runs} run${point.runs === 1 ? "" : "s"}`}
                              className={cn(
                                "flex-1 rounded-sm",
                                point.runs > 0 ? "bg-cyan-300/70" : "bg-white/10",
                              )}
                              style={{ height: `${height}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                        Per template
                      </p>
                      <div className="mt-3 space-y-2">
                        {analytics.perTemplate.map((row) => (
                          <div
                            key={row.template_id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-display text-sm font-semibold text-foreground">
                                {row.name ?? "Untitled template"}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.lastRunAt
                                  ? `last run ${new Date(row.lastRunAt).toLocaleDateString()}`
                                  : "no runs yet"}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-white/15 text-[11px] text-muted-foreground"
                            >
                              {row.runs} run{row.runs === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <CreatorPerformancePanel aggregate={performance} className="mt-8" />
              </div>
            ) : null}


            {section === "challenges" ? (
              <div className={panelClass}>
                <h2 className="font-display text-lg font-bold text-foreground">Challenges</h2>
                {challengesLoading ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading challenges…
                  </div>
                ) : challengesError ? (
                  <div className="mt-6 space-y-3">
                    <EmptyNote>Challenges couldn't be loaded: {challengesError}</EmptyNote>
                    <Button variant="outline" size="sm" onClick={() => void loadChallenges()}>
                      Retry
                    </Button>
                  </div>
                ) : challenges && challenges.length ? (
                  <div className="mt-5 space-y-3">
                    {challenges.map((challenge) => (
                      <div
                        key={challenge.id}
                        className="rounded-xl border border-white/10 bg-black/30 px-4 py-4"
                      >
                        <p className="font-display text-sm font-semibold text-foreground">
                          {challenge.title ?? "Untitled challenge"}
                        </p>
                        {challenge.description ? (
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {challenge.description}
                          </p>
                        ) : null}
                        {challenge.brief ? (
                          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {challenge.brief}
                          </p>
                        ) : null}
                        {challenge.reward_note ? (
                          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-cyan-200/80">
                            {challenge.reward_note}
                          </p>
                        ) : null}
                        {challenge.ends_at ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            ends {new Date(challenge.ends_at).toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6">
                    <EmptyNote>No active challenges right now — check back soon.</EmptyNote>
                  </div>
                )}
              </div>
            ) : null}

            {section === "rewards" ? (

              <div className="space-y-4">
                <div className={panelClass}>
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-cyan-200" />
                    <h2 className="font-display text-lg font-bold text-foreground">Creator Level</h2>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Badge className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-300">
                      {level.current.name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {approvedCount} approved template{approvedCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  {level.next ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Next: {level.next.name}</span>
                        <span>
                          {level.toNext} more approved template{level.toNext === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-cyan-300"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((approvedCount / Math.max(1, level.next.minApproved)) * 100),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      You've reached the highest level on the current ladder.
                    </p>
                  )}
                  {!reviewStatusTracked ? (
                    <p className="mt-4 text-xs text-muted-foreground">
                      Review status isn't tracked for your templates yet, so your level falls back to
                      Creator rather than showing an estimated tier.
                    </p>
                  ) : null}
                </div>

                <div className={panelClass}>
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-cyan-200" />
                    <h2 className="font-display text-lg font-bold text-foreground">Rewards</h2>
                  </div>
                  <div className="mt-4 space-y-2">
                    {rewards.length ? (
                      rewards.map((reward) => (
                        <div
                          key={reward.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">
                              {reward.description ?? "Creator reward"}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {reward.created_at
                                ? new Date(reward.created_at).toLocaleDateString()
                                : "no date"}
                            </p>
                          </div>
                          <span className="font-display text-sm font-bold text-cyan-200">
                            {reward.amount.toLocaleString()} credits
                          </span>
                        </div>
                      ))
                    ) : (
                      <EmptyNote>
                        No creator rewards have been issued yet. Reward payouts are coming soon.
                      </EmptyNote>
                    )}
                  </div>
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
