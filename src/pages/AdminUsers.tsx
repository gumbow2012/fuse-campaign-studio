/**
 * ACCOUNTS — admin-only user ledger.
 * Reads via the admin-users edge function (service role + admin check).
 * Credit grants go exclusively through the existing admin-adjust-credits function.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Coins, Loader2, Mail, Search } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AdminUserRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  subscription_status: string | null;
  credits_balance: number;
  created_at: string;
  last_activity_at: string | null;
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

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "free">("all");
  const [sort, setSort] = useState<"created_at" | "credits">("created_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-users", search, filter, sort, direction, page],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "list",
          search,
          filter,
          sort,
          direction,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { rows: AdminUserRow[]; total: number };
    },
  });

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
      return data as { newBalance: number | null };
    },
    onSuccess: (data) => {
      toast.success(
        data?.newBalance != null ? `Updated balance: ${data.newBalance} credits` : "Credits applied",
      );
      setGrantAmount("");
      setGrantReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Grant failed"),
  });

  const sendAlert = useMutation({
    mutationFn: async (payload: { userId: string; title: string; message: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "notify", ...payload },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("Alert sent to their notifications");
      setAlertTitle("");
      setAlertMessage("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send alert"),
  });

  const rows = usersQuery.data?.rows ?? [];
  const total = usersQuery.data?.total ?? 0;

  const applySearch = () => {
    setPage(0);
    setSearch(searchInput.trim());
  };

  return (
    <SiteShell>
      <PageMeta title="Accounts · FUSE Admin" description="Account ledger and management." path="/admin/users" noindex />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-black uppercase tracking-tight text-foreground">Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total.toLocaleString()} accounts · showing {rows.length}
          </p>
        </header>

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
            {(["all", "paid", "free"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => {
                  setFilter(value);
                  setPage(0);
                }}
                className="capitalize"
              >
                {value}
              </Button>
            ))}
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
              Joined
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDirection((prev) => (prev === "desc" ? "asc" : "desc"))}
            >
              {direction === "desc" ? "↓" : "↑"}
            </Button>
          </div>
        </div>

        {usersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        ) : usersQuery.isError ? (
          <p className="text-sm text-destructive">
            {usersQuery.error instanceof Error ? usersQuery.error.message : "Could not load accounts."}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts match.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const isOpen = openRow === row.user_id;
              return (
                <li key={row.user_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{row.name || "—"}</p>
                      <p className="truncate text-sm text-muted-foreground">{row.email ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Joined {formatEastern(row.created_at)} · Last activity {formatEastern(row.last_activity_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em]",
                          row.tier === "paid"
                            ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/40"
                            : "bg-white/5 text-muted-foreground",
                        )}
                      >
                        {row.tier}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.plan ?? "no plan"} · {row.subscription_status ?? "none"}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        {row.credits_balance.toLocaleString()} credits
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setOpenRow(isOpen ? null : row.user_id)}>
                        {isOpen ? "Close" : "Manage"}
                      </Button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-4 grid gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          Grant credits
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            value={grantAmount}
                            onChange={(event) => setGrantAmount(event.target.value)}
                            placeholder="Amount"
                            inputMode="numeric"
                            className="h-9 w-28"
                          />
                          <Input
                            value={grantReason}
                            onChange={(event) => setGrantReason(event.target.value)}
                            placeholder="Reason (ledger note)"
                            className="h-9 flex-1 min-w-[10rem]"
                          />
                          <Button
                            size="sm"
                            disabled={grantCredits.isPending}
                            onClick={() => {
                              const amount = Number(grantAmount);
                              if (!Number.isFinite(amount) || amount === 0) {
                                toast.error("Enter a non-zero amount");
                                return;
                              }
                              if (!grantReason.trim()) {
                                toast.error("A reason is required");
                                return;
                              }
                              grantCredits.mutate({
                                userId: row.user_id,
                                amount,
                                reason: grantReason.trim(),
                              });
                            }}
                          >
                            {grantCredits.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Coins className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Grant
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          Alert from FUSE
                        </p>
                        <Input
                          value={alertTitle}
                          onChange={(event) => setAlertTitle(event.target.value)}
                          placeholder="Title"
                          className="h-9"
                        />
                        <Textarea
                          value={alertMessage}
                          onChange={(event) => setAlertMessage(event.target.value)}
                          placeholder="Message"
                          rows={3}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={sendAlert.isPending}
                            onClick={() => {
                              if (!alertTitle.trim()) {
                                toast.error("Add a title");
                                return;
                              }
                              sendAlert.mutate({
                                userId: row.user_id,
                                title: alertTitle.trim(),
                                message: alertMessage.trim(),
                              });
                            }}
                          >
                            {sendAlert.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Bell className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Send alert
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
                              Email
                            </Button>
                          ) : null}

                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || usersQuery.isFetching}
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={usersQuery.isFetching || (page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </SiteShell>
  );
}
