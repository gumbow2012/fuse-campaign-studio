import { useQuery } from "@tanstack/react-query";
import { Trophy, CalendarDays } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ContestStatus = "active" | "judging" | "closed";

type Contest = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  prize: string | null;
  cover_url: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number | null;
};

const STATUS_LABEL: Record<ContestStatus, string> = {
  active: "Active",
  judging: "Judging",
  closed: "Closed",
};

const STATUS_STYLE: Record<ContestStatus, string> = {
  active: "border-cyan-300/30 bg-cyan-300/15 text-cyan-100",
  judging: "border-amber-300/30 bg-amber-300/15 text-amber-100",
  closed: "border-white/15 bg-white/5 text-slate-300",
};

const STATUS_ORDER: ContestStatus[] = ["active", "judging", "closed"];

function normaliseStatus(status: string): ContestStatus {
  return STATUS_ORDER.includes(status as ContestStatus) ? (status as ContestStatus) : "closed";
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatWindow(contest: Contest) {
  const start = formatDate(contest.starts_at);
  const end = formatDate(contest.ends_at);
  if (start && end) return `${start} → ${end}`;
  if (start) return `Opens ${start}`;
  if (end) return `Closes ${end}`;
  return null;
}

function ContestCard({ contest }: { contest: Contest }) {
  const status = normaliseStatus(contest.status);
  const window = formatWindow(contest);

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-cyan-300/30 motion-reduce:transition-none">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
        {contest.cover_url ? (
          <img
            src={contest.cover_url}
            alt={contest.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Trophy className="h-8 w-8 text-white/20" aria-hidden="true" />
          </div>
        )}
        <Badge
          variant="outline"
          className={cn("absolute left-3 top-3 rounded-full text-[10px] uppercase tracking-[0.18em]", STATUS_STYLE[status])}
        >
          {STATUS_LABEL[status]}
        </Badge>
      </div>

      <div className="space-y-3 p-5">
        <div className="space-y-1">
          <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">{contest.title}</h3>
          {contest.subtitle ? <p className="text-sm text-muted-foreground">{contest.subtitle}</p> : null}
        </div>

        {contest.description ? (
          <p className="text-sm leading-6 text-muted-foreground">{contest.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-400">
          {contest.prize ? (
            <span className="inline-flex items-center gap-1.5 text-cyan-100">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              {contest.prize}
            </span>
          ) : null}
          {window ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {window}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ContestsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["contests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contests")
        .select("id,title,subtitle,description,prize,cover_url,status,starts_at,ends_at,sort_order")
        .order("sort_order", { ascending: true })
        .order("starts_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Contest[];
    },
    staleTime: 60_000,
  });

  const contests = data ?? [];
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: contests.filter((contest) => normaliseStatus(contest.status) === status),
  })).filter((group) => group.items.length > 0);

  return (
    <SiteShell>
      <PageMeta
        title="FUSE Contests — Creative competitions for brands and creators"
        description="Live FUSE contests: campaign challenges for brands and creators, with prizes, judging windows and entry dates."
        path="/contests"
      />
      <section className="container py-14 md:py-20">
        <div className="max-w-2xl space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">Community</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Contests</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Creative competitions for brands and creators building with FUSE templates.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-sm text-muted-foreground">
            Contests could not be loaded right now. Please try again shortly.
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-white/20" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">
              No contests running right now — check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-12">
            {groups.map((group) => (
              <div key={group.status} className="space-y-5">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                  {STATUS_LABEL[group.status]}
                </h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((contest) => (
                    <ContestCard key={contest.id} contest={contest} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </SiteShell>
  );
}
