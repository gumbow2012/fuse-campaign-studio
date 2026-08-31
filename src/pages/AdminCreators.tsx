import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Loader2, Mail, RefreshCw, ShieldCheck, Undo2, UserPlus, Users } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics/track";
import CreatorRevenueShareControl from "@/components/admin/CreatorRevenueShareControl";
import { bpsToPercent, loadPlatformEconomicsConfig, percentToBps, type PlatformEconomicsConfig } from "@/lib/creatorEconomics";

type CreatorRow = {
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string | null;
  handle?: string | null;
  /** 'creator' | 'verified' | 'featured' | 'partner'. Never carries a reason. */
  verificationStatus?: string | null;
  verifiedAt?: string | null;
};

type InviteRow = {
  id: string;
  email: string;
  status: string;
  created_at: string | null;
  accepted_at: string | null;
};

type QueueRow = {
  versionId: string;
  versionNumber: number;
  templateId: string;
  templateName: string;
  description: string | null;
  previewUrl: string | null;
  previewAssetType: "image" | "video" | null;
  isActive: boolean;
  submittedAt: string | null;
  creator: { userId: string; email: string | null; name: string | null } | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const AdminCreators = () => {
  const { session } = useAuth();
  const accessToken = session?.access_token;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteInstagram, setInviteInstagram] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteSpecialty, setInviteSpecialty] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [economics, setEconomics] = useState<PlatformEconomicsConfig | null>(null);
  const [inviteShareMode, setInviteShareMode] = useState<"default" | "custom">("default");
  const [inviteSharePercent, setInviteSharePercent] = useState<number | null>(null);

  useEffect(() => {
    void loadPlatformEconomicsConfig().then((config) => {
      setEconomics(config);
      if (config) setInviteSharePercent(bpsToPercent(config.defaultCreatorShareBps));
    });
  }, []);

  const callFunction = useCallback(
    async (name: string, body: Record<string, unknown>) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
        headers.apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      }
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      let data: Record<string, unknown> = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          data = { error: raw };
        }
      }
      if (!response.ok) throw new Error(String(data.error ?? `Request failed (${response.status})`));
      return data;
    },
    [accessToken],
  );

  const loadAll = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [listData, queueData] = await Promise.all([
        callFunction("manage-creators", { action: "list" }),
        callFunction("manage-creators", { action: "review_queue" }),
      ]);
      setCreators((listData.creators as CreatorRow[]) ?? []);
      setInvites((listData.invites as InviteRow[]) ?? []);
      setQueue((queueData.queue as QueueRow[]) ?? []);
    } catch (error) {
      toast({
        title: "Could not load creators",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, callFunction]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const pendingInvites = useMemo(() => invites.filter((invite) => invite.status === "pending"), [invites]);

  const normalizedHandle = inviteInstagram.replace(/\s+/g, "").replace(/^@+/, "");
  const invitePreviewTo = useMemo(() => {
    const parts = [inviteFirstName.trim() || inviteEmail.trim() || "—"];
    if (normalizedHandle) parts.push(`@${normalizedHandle}`);
    return parts.join(" · ");
  }, [inviteFirstName, inviteEmail, normalizedHandle]);
  const invitePreviewSubject = inviteFirstName.trim()
    ? `${inviteFirstName.trim()}, you're invited to FUSE Creator Access`
    : "You're invited to FUSE Creator Access";

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setBusy("invite");
    try {
      const data = await callFunction("manage-creators", {
        action: "invite",
        email,
        firstName: inviteFirstName.trim() || undefined,
        instagramHandle: normalizedHandle || undefined,
        displayName: inviteDisplayName.trim() || undefined,
        personalNote: inviteNote.trim() || undefined,
        creatorSpecialty: inviteSpecialty.trim() || undefined,
        creatorShareBps:
          inviteShareMode === "custom" && inviteSharePercent !== null
            ? percentToBps(inviteSharePercent)
            : null,
      });
      track("creator_invite_sent", {
        granted_immediately: Boolean(data.grantedImmediately),
        has_first_name: Boolean(inviteFirstName.trim()),
        has_instagram: Boolean(normalizedHandle),
        has_personal_note: Boolean(inviteNote.trim()),
      });
      toast({
        title: data.grantedImmediately ? "Creator access granted" : "Invite sent",
        description: data.grantedImmediately
          ? `${email} already had an account, so creator access is active now.`
          : `${email} will get an email to finish setting up their creator account.`,
      });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteInstagram("");
      setInviteDisplayName("");
      setInviteNote("");
      setInviteSpecialty("");
      setInviteShareMode("default");
      if (economics) setInviteSharePercent(bpsToPercent(economics.defaultCreatorShareBps));
      await loadAll();
    } catch (error) {
      toast({
        title: "Invite failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (payload: { userId?: string; inviteId?: string }, label: string) => {
    setBusy(`revoke-${payload.userId ?? payload.inviteId}`);
    try {
      await callFunction("manage-creators", { action: "revoke", ...payload });
      toast({ title: `Revoked ${label}` });
      await loadAll();
    } catch (error) {
      toast({
        title: "Revoke failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const approveAndPublish = async (row: QueueRow) => {
    setBusy(`approve-${row.versionId}`);
    try {
      await callFunction("save-template-review-status", {
        versionId: row.versionId,
        reviewStatus: "Approved",
        reviewNote: notes[row.versionId]?.trim() || null,
      });
      await callFunction("admin-template-workbench", { action: "activate_version", versionId: row.versionId });
      toast({ title: "Approved and published", description: `${row.templateName} v${row.versionNumber} is live.` });
      await loadAll();
    } catch (error) {
      toast({
        title: "Approval failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  /** Admin-only verification control. Default stays 'creator'. */
  const setVerification = async (row: CreatorRow, status: string) => {
    setBusy(`verify-${row.userId}`);
    try {
      await callFunction("manage-creators", {
        action: "set_verification",
        userId: row.userId,
        verificationStatus: status,
      });
      toast({
        title: "Verification updated",
        description: `${row.email ?? row.userId} → ${status}`,
      });
      await loadAll();
    } catch (error) {
      toast({
        title: "Could not update verification",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const sendBack = async (row: QueueRow) => {
    setBusy(`send-back-${row.versionId}`);
    try {
      await callFunction("save-template-review-status", {
        versionId: row.versionId,
        reviewStatus: "Prompt Drift",
        reviewNote: notes[row.versionId]?.trim() || null,
      });
      toast({ title: "Sent back to creator", description: `${row.templateName} v${row.versionNumber} needs changes.` });
      await loadAll();
    } catch (error) {
      toast({
        title: "Could not send back",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SiteShell>
      <PageMeta
        title="Creators & Review Queue | FUSE Admin"
        description="Invite creators, manage their access, and review template submissions before they go live."
        path="/admin/creators"
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Creators</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Invite-only creator accounts. Creators build in their own workspace and submit templates here for approval
              before anything reaches customers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild type="button" variant="ghost">
              <Link to="/admin/creator-program">Program: applications &amp; challenges</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadAll()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </header>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
            <UserPlus className="h-4 w-4 text-cyan-300" />
            Send a VIP creator invite
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="invite-first-name" className="text-foreground/80">
                First name
              </Label>
              <Input
                id="invite-first-name"
                value={inviteFirstName}
                onChange={(event) => setInviteFirstName(event.target.value)}
                placeholder="Justin"
                maxLength={80}
                className="mt-2 h-11"
              />
            </div>
            <div>
              <Label htmlFor="invite-email" className="text-foreground/80">
                Email <span className="text-cyan-300">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="creator@studio.com"
                className="mt-2 h-11"
              />
            </div>
            <div>
              <Label htmlFor="invite-instagram" className="text-foreground/80">
                Instagram
              </Label>
              <Input
                id="invite-instagram"
                value={inviteInstagram}
                onChange={(event) => setInviteInstagram(event.target.value)}
                placeholder="@justincreates"
                maxLength={64}
                className="mt-2 h-11"
              />
            </div>
            <div>
              <Label htmlFor="invite-display-name" className="text-foreground/80">
                Display name
              </Label>
              <Input
                id="invite-display-name"
                value={inviteDisplayName}
                onChange={(event) => setInviteDisplayName(event.target.value)}
                placeholder="Justin Creates"
                maxLength={80}
                className="mt-2 h-11"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="invite-specialty" className="text-foreground/80">
                Creator specialty <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="invite-specialty"
                value={inviteSpecialty}
                onChange={(event) => setInviteSpecialty(event.target.value)}
                placeholder="Streetwear campaign edits"
                maxLength={80}
                className="mt-2 h-11"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="invite-note" className="text-foreground/80">
                Personal note
              </Label>
              <Textarea
                id="invite-note"
                value={inviteNote}
                onChange={(event) => setInviteNote(event.target.value.slice(0, 500))}
                placeholder="Been watching your drops — we want you building on FUSE."
                className="mt-2 min-h-[88px]"
              />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">{inviteNote.length}/500</p>
            </div>
          </div>

          <details className="mt-4 rounded-2xl border border-white/10 bg-background/40 px-4 py-3">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
              Advanced · Revenue share
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-center gap-2 text-foreground/90">
                <input
                  type="radio"
                  name="invite-share-mode"
                  checked={inviteShareMode === "default"}
                  onChange={() => setInviteShareMode("default")}
                />
                Platform default{economics ? ` — ${bpsToPercent(economics.defaultCreatorShareBps)}%` : ""}
              </label>
              <label className="flex items-center gap-2 text-foreground/90">
                <input
                  type="radio"
                  name="invite-share-mode"
                  checked={inviteShareMode === "custom"}
                  onChange={() => setInviteShareMode("custom")}
                />
                Custom rate
              </label>
              {inviteShareMode === "custom" && economics ? (
                <div>
                  <Label htmlFor="invite-share" className="text-xs text-foreground/70">
                    Creator keeps (%)
                  </Label>
                  <Input
                    id="invite-share"
                    type="number"
                    min={bpsToPercent(economics.creatorShareMinBps)}
                    max={bpsToPercent(economics.creatorShareMaxBps)}
                    step={1}
                    value={inviteSharePercent ?? ""}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setInviteSharePercent(Number.isFinite(next) ? next : null);
                    }}
                    className="mt-1 h-10 w-28"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Allowed {bpsToPercent(economics.creatorShareMinBps)}–{bpsToPercent(economics.creatorShareMaxBps)}%.
                    Internal only — never shown in the invite email.
                  </p>
                </div>
              ) : null}
            </div>
          </details>

          <div className="mt-4 space-y-1 rounded-2xl border border-white/10 bg-background/40 px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <p className="truncate">To: {invitePreviewTo}</p>
            <p className="truncate normal-case tracking-normal">Subject: {invitePreviewSubject}</p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => void sendInvite()} disabled={busy === "invite"} className="h-11">
              {busy === "invite" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Send VIP creator invite →
            </Button>
          </div>
        </section>


        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
              <Users className="h-4 w-4 text-cyan-300" />
              Active creators ({creators.length})
            </div>
            <div className="mt-4 space-y-2">
              {creators.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                  No creators yet. Invite one above.
                </p>
              ) : (
                creators.map((creator) => (
                  <div
                    key={creator.userId}
                    className="rounded-2xl border border-white/10 bg-background/40 px-4 py-3"
                  >
                   <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{creator.email ?? creator.userId}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {creator.name || "No name set"} · joined {formatDate(creator.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Verification status"
                        className="h-9 rounded-md border border-white/15 bg-background/60 px-2 text-xs text-foreground"
                        value={creator.verificationStatus ?? "creator"}
                        disabled={busy === `verify-${creator.userId}`}
                        onChange={(event) => void setVerification(creator, event.target.value)}
                      >
                        <option value="creator">Creator (no badge)</option>
                        <option value="verified">Verified</option>
                        <option value="featured">Featured</option>
                        <option value="partner">Partner</option>
                      </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                      onClick={() => void revoke({ userId: creator.userId }, creator.email ?? "creator")}
                      disabled={busy === `revoke-${creator.userId}`}
                    >
                      {busy === `revoke-${creator.userId}` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="mr-2 h-4 w-4" />
                      )}
                      Revoke
                    </Button>
                    </div>
                   </div>
                    <CreatorRevenueShareControl
                      userId={creator.userId}
                      label={creator.email ?? creator.name ?? "Creator"}
                      callFunction={callFunction}
                    />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
              <Clock3 className="h-4 w-4 text-amber-300" />
              Pending invites ({pendingInvites.length})
            </div>
            <div className="mt-4 space-y-2">
              {pendingInvites.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                  No invites waiting.
                </p>
              ) : (
                pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">Invited {formatDate(invite.created_at)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void revoke({ inviteId: invite.id }, invite.email)}
                      disabled={busy === `revoke-${invite.id}`}
                    >
                      {busy === `revoke-${invite.id}` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="mr-2 h-4 w-4" />
                      )}
                      Cancel
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Approval queue ({queue.length})
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/lab/canvas">Open builder</Link>
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {queue.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                Nothing submitted for review right now.
              </p>
            ) : (
              queue.map((row) => (
                <div key={row.versionId} className="rounded-2xl border border-white/10 bg-background/40 p-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      {row.previewUrl ? (
                        row.previewAssetType === "video" ? (
                          <video src={row.previewUrl} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          <img
                            src={row.previewUrl}
                            alt={`${row.templateName} preview`}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          No cover
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {row.templateName} · v{row.versionNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Creator: {row.creator?.email ?? row.creator?.name ?? "Unknown"} · submitted{" "}
                        {formatDate(row.submittedAt)}
                      </p>
                      {row.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
                      ) : null}
                      <Textarea
                        value={notes[row.versionId] ?? ""}
                        onChange={(event) =>
                          setNotes((prev) => ({ ...prev, [row.versionId]: event.target.value }))
                        }
                        placeholder="Optional note for the creator"
                        className="mt-3 min-h-[64px]"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void approveAndPublish(row)}
                          disabled={busy === `approve-${row.versionId}`}
                        >
                          {busy === `approve-${row.versionId}` ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          Approve &amp; publish
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void sendBack(row)}
                          disabled={busy === `send-back-${row.versionId}`}
                        >
                          {busy === `send-back-${row.versionId}` ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Undo2 className="mr-2 h-4 w-4" />
                          )}
                          Send back
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/app/lab/canvas?template=${row.templateId}&version=${row.versionId}`}>
                            Inspect graph
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </SiteShell>
  );
};

export default AdminCreators;
