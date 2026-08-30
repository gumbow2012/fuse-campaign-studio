/**
 * LEADS — admin-only CRM of free-plan accounts.
 * Reuses the admin-users edge function for reads/notes and
 * admin-adjust-credits for grants (no new credit path).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, Mail, Search } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmailComposerDialog, { type EmailComposerTarget } from "@/components/admin/EmailComposerDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LeadRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  subscription_status: string | null;
  credits_balance: number;
  created_at: string;
  last_activity_at: string | null;
  admin_note: string | null;
  tier: "paid" | "free";
};

const PAGE_SIZE = 100;

const NY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatEastern(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${NY_FORMATTER.format(date)} ET`;
}

function formatRelative(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Inline note cell — debounced autosave through the admin function. */
function NoteCell({
  userId,
  initialNote,
  onSave,
}: {
  userId: string;
  initialNote: string | null;
  onSave: (userId: string, note: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialNote ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef(initialNote ?? "");

  useEffect(() => {
    baseline.current = initialNote ?? "";
    setValue(initialNote ?? "");
  }, [initialNote, userId]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const scheduleSave = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (next === baseline.current) return;
      setState("saving");
      try {
        await onSave(userId, next);
        baseline.current = next;
        setState("saved");
      } catch (error) {
        setState("idle");
        toast.error(error instanceof Error ? error.message : "Could not save note");
      }
    }, 900);
  };

  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        rows={2}
        placeholder="Add a note…"
        onChange={(event) => {
          setValue(event.target.value);
          setState("idle");
          scheduleSave(event.target.value);
        }}
        className="min-h-[52px] resize-y text-xs"
      />
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : value !== baseline.current ? "Unsaved" : ""}
      </p>
    </div>
  );
}

export default function AdminLeads() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"created_at" | "credits">("created_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const [grantTarget, setGrantTarget] = useState<LeadRow | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTarget, setComposerTarget] = useState<EmailComposerTarget | null>(null);
  const [balanceOverrides, setBalanceOverrides] = useState<Record<string, number>>({});

  const queryKey = ["admin-leads", search, sort, direction, page] as const;

  const leadsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "list",
          search,
          filter: "free",
          planEquals: "free",
          sort,
          direction,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { rows: LeadRow[]; total: number };
    },
  });

  const saveNote = async (userId: string, note: string) => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "set_note", userId, note },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
  };

  const grantCredits = useMutation({
    mutationFn: async (payload: { userId: string; amount: number; reason: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-adjust-credits", {
        body: {
          action: "adjust",
          userId: payload.userId,
          amount: payload.amount,
          description: payload.reason,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return { ...(data as { newBalance: number | null }), userId: payload.userId, amount: payload.amount };
    },
    onSuccess: (result) => {
      const fallback = (grantTarget?.credits_balance ?? 0) + result.amount;
      const nextBalance = result.newBalance != null ? Number(result.newBalance) : fallback;
      setBalanceOverrides((prev) => ({ ...prev, [result.userId]: nextBalance }));
      toast.success(`Updated balance: ${nextBalance.toLocaleString()} credits`);
      setGrantTarget(null);
      setGrantAmount("");
      setGrantReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Grant failed"),
  });

  const rows = useMemo(() => {
    const list = leadsQuery.data?.rows ?? [];
    return list.map((row) =>
      balanceOverrides[row.user_id] != null
        ? { ...row, credits_balance: balanceOverrides[row.user_id] }
        : row,
    );
  }, [leadsQuery.data, balanceOverrides]);

  const total = leadsQuery.data?.total ?? 0;
  const withCredits = rows.filter((row) => row.credits_balance > 0).length;
  const zeroCredits = rows.length - withCredits;

  const applySearch = () => {
    setPage(0);
    setSearch(searchInput.trim());
  };

  return (
    <SiteShell>
      <PageMeta title="Leads · FUSE Admin" description="Free-plan lead CRM." path="/admin/leads" noindex />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-black uppercase tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Free-plan accounts you can work manually.
          </p>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Free leads", value: total },
            { label: "With credits", value: withCredits },
            { label: "Zero credits", value: zeroCredits },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-black text-foreground">{stat.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applySearch();
              }}
              placeholder="Search email or name"
              className="h-9 w-56"
            />
            <Button size="sm" variant="outline" onClick={applySearch}>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={sort === "created_at" ? "default" : "outline"}
              onClick={() => {
                setSort("created_at");
                setPage(0);
              }}
            >
              Signed up
            </Button>
            <Button
              size="sm"
              variant={sort === "credits" ? "default" : "outline"}
              onClick={() => {
                setSort("credits");
                setPage(0);
              }}
            >
              Credits
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDirection((prev) => (prev === "desc" ? "asc" : "desc"))}>
              {direction === "desc" ? "↓" : "↑"}
            </Button>
          </div>
        </div>

        {leadsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
          </div>
        ) : leadsQuery.isError ? (
          <p className="text-sm text-destructive">
            {leadsQuery.error instanceof Error ? leadsQuery.error.message : "Could not load leads."}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No free leads match.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-4 py-3 font-bold">Email</th>
                  <th className="px-4 py-3 font-bold">Credits</th>
                  <th className="px-4 py-3 font-bold">Signed up</th>
                  <th className="px-4 py-3 font-bold">Last active</th>
                  <th className="px-4 py-3 font-bold">Note</th>
                  <th className="px-4 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id} className="border-b border-white/5 align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="max-w-[16rem] truncate font-medium text-foreground">{row.email ?? "—"}</p>
                      {row.name ? <p className="truncate text-xs text-muted-foreground">{row.name}</p> : null}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.credits_balance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={formatEastern(row.created_at)}>
                      {formatRelative(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={formatEastern(row.last_activity_at)}>
                      {formatRelative(row.last_activity_at)}
                    </td>
                    <td className="w-[18rem] px-4 py-3">
                      <NoteCell userId={row.user_id} initialNote={row.admin_note} onSave={saveNote} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setGrantTarget(row);
                            setGrantAmount("");
                            setGrantReason("");
                          }}
                        >
                          <Coins className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Credits
                        </Button>
                        {row.email ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setComposerTarget({
                                to: row.email as string,
                                subject: "",
                                body: `Hi ${row.name || "there"},\n\n`,
                              });
                              setComposerOpen(true);
                            }}
                          >
                            <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Message
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || leadsQuery.isFetching}
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={leadsQuery.isFetching || (page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(grantTarget)} onOpenChange={(open) => (!open ? setGrantTarget(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant credits</DialogTitle>
            <DialogDescription>{grantTarget?.email ?? "Selected lead"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={grantAmount}
              onChange={(event) => setGrantAmount(event.target.value)}
              placeholder="Amount"
              inputMode="numeric"
            />
            <Input
              value={grantReason}
              onChange={(event) => setGrantReason(event.target.value)}
              placeholder="Reason (ledger note)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={grantCredits.isPending}
              onClick={() => {
                const amount = Number(grantAmount);
                if (!grantTarget) return;
                if (!Number.isFinite(amount) || amount === 0) {
                  toast.error("Enter a non-zero amount");
                  return;
                }
                if (!grantReason.trim()) {
                  toast.error("A reason is required");
                  return;
                }
                grantCredits.mutate({ userId: grantTarget.user_id, amount, reason: grantReason.trim() });
              }}
            >
              {grantCredits.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailComposerDialog open={composerOpen} target={composerTarget} onOpenChange={setComposerOpen} />
    </SiteShell>
  );
}
