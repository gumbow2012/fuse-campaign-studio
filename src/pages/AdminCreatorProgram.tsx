import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Plus, RefreshCw, Trophy, UserPlus, X } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  createChallenge,
  loadAllChallenges,
  loadCreatorApplications,
  setApplicationStatus,
  updateChallenge,
  type CreatorApplicationRow,
  type CreatorChallengeRow,
} from "@/services/adminCreatorProgram";

const STATUS_FILTERS = ["pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric" });
}

type InviteRow = {
  id: string;
  email: string | null;
  status: string | null;
  created_at: string | null;
  accepted_at: string | null;
  email_status: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  failure_reason: string | null;
  last_sent_at: string | null;
  sent_count: number | null;
};

function minutesSince(value: string | null) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 60000);
}

const panel = "rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur";
const emptyState =
  "rounded-2xl border border-white/10 bg-background/40 px-4 py-6 text-sm text-muted-foreground";

const AdminCreatorProgram = () => {
  const { user } = useAuth();
  const adminId = user?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [applications, setApplications] = useState<CreatorApplicationRow[]>([]);
  const [challenges, setChallenges] = useState<CreatorChallengeRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("pending");

  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftBrief, setDraftBrief] = useState("");
  const [draftReward, setDraftReward] = useState("");
  const [draftStatus, setDraftStatus] = useState<"active" | "closed">("active");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  const [edits, setEdits] = useState<Record<string, Partial<CreatorChallengeRow>>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, list] = await Promise.all([loadCreatorApplications(), loadAllChallenges()]);
      setApplications(apps);
      setChallenges(list);
    } catch (error) {
      toast({
        title: "Could not load creator program data",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(
    () => applications.filter((row) => (row.status || "pending") === filter),
    [applications, filter],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    applications.forEach((row) => {
      const key = row.status || "pending";
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [applications]);

  const approveAndInvite = async (row: CreatorApplicationRow) => {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) {
      toast({ title: "This application has no valid email", variant: "destructive" });
      return;
    }
    setBusy(`approve-${row.id}`);
    try {
      // Reuse the existing manage-creators invite action (no reimplementation).
      const { data, error } = await supabase.functions.invoke("manage-creators", {
        body: { action: "invite", email },
      });
      if (error) throw new Error(error.message);
      await setApplicationStatus(row.id, "approved", adminId);
      const granted = Boolean((data as { grantedImmediately?: boolean } | null)?.grantedImmediately);
      toast({
        title: granted ? "Approved — creator access granted" : "Approved — invite sent",
        description: granted
          ? `${email} already had an account, so creator access is active now.`
          : `${email} will get an email to finish setting up their creator account.`,
      });
      await loadAll();
    } catch (error) {
      toast({
        title: "Approve & invite failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (row: CreatorApplicationRow) => {
    setBusy(`reject-${row.id}`);
    try {
      await setApplicationStatus(row.id, "rejected", adminId);
      toast({ title: "Application rejected" });
      await loadAll();
    } catch (error) {
      toast({
        title: "Could not reject",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const submitChallenge = async () => {
    if (!draftTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setBusy("create-challenge");
    try {
      await createChallenge(
        {
          title: draftTitle,
          description: draftDescription,
          brief: draftBrief,
          reward_note: draftReward,
          status: draftStatus,
          starts_at: draftStart ? new Date(draftStart).toISOString() : null,
          ends_at: draftEnd ? new Date(draftEnd).toISOString() : null,
        },
        adminId,
      );
      toast({ title: "Challenge created" });
      setDraftTitle("");
      setDraftDescription("");
      setDraftBrief("");
      setDraftReward("");
      setDraftStatus("active");
      setDraftStart("");
      setDraftEnd("");
      await loadAll();
    } catch (error) {
      toast({
        title: "Could not create challenge",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleChallengeStatus = async (row: CreatorChallengeRow) => {
    setBusy(`status-${row.id}`);
    try {
      await updateChallenge(row.id, { status: row.status === "active" ? "closed" : "active" });
      await loadAll();
    } catch (error) {
      toast({
        title: "Could not update status",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const saveChallengeEdits = async (row: CreatorChallengeRow) => {
    const patch = edits[row.id];
    if (!patch) return;
    setBusy(`save-${row.id}`);
    try {
      await updateChallenge(row.id, patch);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      toast({ title: "Challenge updated" });
      await loadAll();
    } catch (error) {
      toast({
        title: "Could not save changes",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const setEdit = (id: string, key: keyof CreatorChallengeRow, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  return (
    <SiteShell>
      <PageMeta
        title="Creator Program | FUSE Admin"
        description="Review creator applications and manage creator challenges."
        path="/admin/creator-program"
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Creator Program</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Review incoming creator applications and run the challenge board. Access grants reuse the existing
              creator invite flow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="ghost">
              <Link to="/admin/creators">Creators &amp; review queue</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadAll()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </header>

        <section className={`mt-8 ${panel}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
              <UserPlus className="h-4 w-4 text-cyan-300" />
              Applications ({applications.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={filter === status ? "default" : "outline"}
                  onClick={() => setFilter(status)}
                  className="capitalize"
                >
                  {status} ({counts[status] ?? 0})
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filtered.length === 0 ? (
              <p className={emptyState}>No {filter} applications.</p>
            ) : (
              filtered.map((row) => (
                <article key={row.id} className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{row.name ?? "Unnamed creator"}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.email ?? "No email"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Applied {formatDate(row.created_at)}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-cyan-300">
                      {row.status || "pending"}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    {row.portfolio_url ? (
                      <div className="truncate">
                        <dt className="inline text-foreground/70">Portfolio: </dt>
                        <dd className="inline">
                          <a
                            href={row.portfolio_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 hover:underline"
                          >
                            {row.portfolio_url}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                    {row.instagram ? (
                      <div className="truncate">
                        <dt className="inline text-foreground/70">Instagram: </dt>
                        <dd className="inline">{row.instagram}</dd>
                      </div>
                    ) : null}
                    {row.tiktok ? (
                      <div className="truncate">
                        <dt className="inline text-foreground/70">TikTok: </dt>
                        <dd className="inline">{row.tiktok}</dd>
                      </div>
                    ) : null}
                    {row.x_handle ? (
                      <div className="truncate">
                        <dt className="inline text-foreground/70">X: </dt>
                        <dd className="inline">{row.x_handle}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {row.pitch ? (
                    <p className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-muted-foreground">
                      {row.pitch}
                    </p>
                  ) : null}

                  {(row.status || "pending") === "pending" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void approveAndInvite(row)}
                        disabled={busy === `approve-${row.id}`}
                      >
                        {busy === `approve-${row.id}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Approve &amp; invite
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void reject(row)}
                        disabled={busy === `reject-${row.id}`}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">Reviewed {formatDate(row.reviewed_at)}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className={`mt-6 ${panel}`}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
            <Trophy className="h-4 w-4 text-cyan-300" />
            New challenge
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="challenge-title" className="text-foreground/80">
                Title
              </Label>
              <Input
                id="challenge-title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Winter drop campaign"
                className="mt-2 h-11"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="challenge-description" className="text-foreground/80">
                Description
              </Label>
              <Textarea
                id="challenge-description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                className="mt-2"
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="challenge-brief" className="text-foreground/80">
                Brief
              </Label>
              <Textarea
                id="challenge-brief"
                value={draftBrief}
                onChange={(event) => setDraftBrief(event.target.value)}
                className="mt-2"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="challenge-reward" className="text-foreground/80">
                Reward note
              </Label>
              <Input
                id="challenge-reward"
                value={draftReward}
                onChange={(event) => setDraftReward(event.target.value)}
                placeholder="Featured on the FUSE homepage"
                className="mt-2 h-11"
              />
            </div>
            <div>
              <Label htmlFor="challenge-status" className="text-foreground/80">
                Status
              </Label>
              <select
                id="challenge-status"
                value={draftStatus}
                onChange={(event) => setDraftStatus(event.target.value as "active" | "closed")}
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-background/60 px-3 text-sm text-foreground"
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <Label htmlFor="challenge-start" className="text-foreground/80">
                Starts (optional)
              </Label>
              <Input
                id="challenge-start"
                type="date"
                value={draftStart}
                onChange={(event) => setDraftStart(event.target.value)}
                className="mt-2 h-11"
              />
            </div>
            <div>
              <Label htmlFor="challenge-end" className="text-foreground/80">
                Ends (optional)
              </Label>
              <Input
                id="challenge-end"
                type="date"
                value={draftEnd}
                onChange={(event) => setDraftEnd(event.target.value)}
                className="mt-2 h-11"
              />
            </div>
          </div>
          <Button
            type="button"
            className="mt-4 h-11"
            onClick={() => void submitChallenge()}
            disabled={busy === "create-challenge"}
          >
            {busy === "create-challenge" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create challenge
          </Button>
        </section>

        <section className={`mt-6 ${panel}`}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
            <Trophy className="h-4 w-4 text-cyan-300" />
            Challenges ({challenges.length})
          </div>
          <div className="mt-4 space-y-3">
            {challenges.length === 0 ? (
              <p className={emptyState}>No challenges yet. Create the first one above.</p>
            ) : (
              challenges.map((row) => {
                const edit = edits[row.id] ?? {};
                const dirty = Object.keys(edit).length > 0;
                return (
                  <article key={row.id} className="rounded-2xl border border-white/10 bg-background/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-cyan-300">
                        {row.status}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void toggleChallengeStatus(row)}
                          disabled={busy === `status-${row.id}`}
                        >
                          {row.status === "active" ? "Close" : "Reopen"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveChallengeEdits(row)}
                          disabled={!dirty || busy === `save-${row.id}`}
                        >
                          {busy === `save-${row.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3">
                      <Input
                        value={String(edit.title ?? row.title ?? "")}
                        onChange={(event) => setEdit(row.id, "title", event.target.value)}
                        placeholder="Title"
                        className="h-11"
                      />
                      <Textarea
                        value={String(edit.description ?? row.description ?? "")}
                        onChange={(event) => setEdit(row.id, "description", event.target.value)}
                        placeholder="Description"
                        rows={2}
                      />
                      <Textarea
                        value={String(edit.brief ?? row.brief ?? "")}
                        onChange={(event) => setEdit(row.id, "brief", event.target.value)}
                        placeholder="Brief"
                        rows={3}
                      />
                      <Input
                        value={String(edit.reward_note ?? row.reward_note ?? "")}
                        onChange={(event) => setEdit(row.id, "reward_note", event.target.value)}
                        placeholder="Reward note"
                        className="h-11"
                      />
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Created {formatDate(row.created_at)} · Window {formatDate(row.starts_at)} —{" "}
                      {formatDate(row.ends_at)}
                    </p>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </SiteShell>
  );
};

export default AdminCreatorProgram;
