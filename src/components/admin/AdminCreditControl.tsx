import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UserResult = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  masked_email: string | null;
  credits_balance: number;
  plan: string | null;
};

type LedgerEntry = {
  id: string;
  amount: number;
  type: string | null;
  description: string | null;
  created_at: string | null;
};

type Op = "add" | "remove" | "set";

const REASONS = [
  "Contest reward",
  "Support correction",
  "Promotional credit",
  "Testing",
  "Refund correction",
  "Other",
] as const;

const fmt = (value: number) => value.toLocaleString();

function label(row: UserResult) {
  return row.handle ? `@${row.handle}` : row.display_name || row.masked_email || row.user_id.slice(0, 8);
}

const AdminCreditControl = () => {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const [op, setOp] = useState<Op>("add");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke("admin-adjust-credits", {
        body: { action: "search_user", query: query.trim(), limit: 8 },
      });
      if (cancelled) return;
      setSearching(false);
      if (error) {
        setResults([]);
        return;
      }
      setResults(((data as { results?: UserResult[] } | null)?.results ?? []) as UserResult[]);
    }, 300);
    return () => {
      cancelled = true;
      setSearching(false);
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  const loadLedger = useCallback(async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("admin-adjust-credits", {
      body: { action: "recent_ledger", userId },
    });
    if (error) {
      setLedger([]);
      return;
    }
    setLedger(((data as { entries?: LedgerEntry[] } | null)?.entries ?? []) as LedgerEntry[]);
  }, []);

  const select = async (row: UserResult) => {
    setSelected(row);
    setResults([]);
    setQuery(label(row));
    await loadLedger(row.user_id);
  };

  const clearSelection = () => {
    setSelected(null);
    setLedger([]);
    setQuery("");
    setValue("");
    setNotes("");
    setReason("");
  };

  const numeric = Number(value);
  const preview = useMemo(() => {
    if (!selected || !Number.isFinite(numeric) || value.trim() === "") return null;
    const before = selected.credits_balance;
    const n = Math.round(numeric);
    if (n < 0) return null;
    const after = op === "add" ? before + n : op === "remove" ? before - n : n;
    if (after < 0) return null;
    return { before, after, change: after - before };
  }, [selected, numeric, value, op]);

  const description = useMemo(() => {
    if (!reason) return "";
    return notes.trim() ? `${reason} — ${notes.trim()}` : reason;
  }, [reason, notes]);

  const canApply = Boolean(selected && preview && preview.change !== 0 && reason);

  const apply = async () => {
    if (!selected || !preview) return;
    setApplying(true);
    try {
      const body =
        op === "set"
          ? { action: "set_balance", userId: selected.user_id, targetBalance: preview.after, description }
          : { action: "adjust", userId: selected.user_id, amount: preview.change, description };
      const { data, error } = await supabase.functions.invoke("admin-adjust-credits", { body });
      if (error) throw new Error(error.message);
      const payload = data as { error?: string; newBalance?: number | null } | null;
      if (payload?.error) throw new Error(payload.error);
      const newBalance = typeof payload?.newBalance === "number" ? payload.newBalance : preview.after;
      setSelected({ ...selected, credits_balance: newBalance });
      setValue("");
      setNotes("");
      setConfirmOpen(false);
      toast({
        title: "Credits adjusted",
        description: `${label(selected)} now has ${fmt(newBalance)} credits.`,
      });
      await loadLedger(selected.user_id);
    } catch (err) {
      toast({
        title: "Adjustment failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5 max-w-xl">
      <h3 className="text-sm font-bold text-foreground mb-4">Adjust User Credits</h3>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Username, creator handle, name or email..."
          value={query}
          onChange={(e) => {
            setSelected(null);
            setLedger([]);
            setQuery(e.target.value);
          }}
          className="bg-secondary border-border text-foreground pl-9"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}

        {!selected && results.length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {results.map((row) => (
              <button
                key={row.user_id}
                type="button"
                onClick={() => void select(row)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-secondary"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">
                    {row.handle ? `@${row.handle}` : row.display_name || "Unnamed"}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {[row.display_name, row.masked_email].filter(Boolean).join(" · ") || "No email"}
                  </span>
                </span>
                <span className="whitespace-nowrap font-mono text-foreground/80">{fmt(row.credits_balance)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!selected ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Search and select a user — credits can only be adjusted on an explicitly selected account.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-border/60 bg-secondary/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {selected.handle ? `@${selected.handle}` : selected.display_name || "Unnamed"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[selected.display_name, selected.masked_email, selected.plan].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                Change
              </Button>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Current balance
            </p>
            <p className="font-display text-3xl font-black text-foreground">{fmt(selected.credits_balance)}</p>
          </div>

          <div className="flex gap-2">
            {(["add", "remove", "set"] as Op[]).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={op === mode ? "default" : "outline"}
                onClick={() => setOp(mode)}
              >
                {mode === "add" ? "Add (+n)" : mode === "remove" ? "Remove (−n)" : "Set balance (=n)"}
              </Button>
            ))}
          </div>

          <Input
            type="number"
            min={0}
            placeholder={op === "set" ? "New balance" : "Credits"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-secondary border-border text-foreground"
          />

          {preview ? (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3 text-center text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Before</p>
                <p className="font-mono text-foreground">{fmt(preview.before)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Change</p>
                <p className={`font-mono ${preview.change < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {preview.change > 0 ? "+" : ""}
                  {fmt(preview.change)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">After</p>
                <p className="font-mono text-foreground">{fmt(preview.after)}</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue placeholder="Reason (required)" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-secondary border-border text-foreground min-h-[64px]"
            />
          </div>

          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canApply}
            className="gradient-primary text-primary-foreground font-bold border-0"
          >
            Review adjustment
          </Button>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recent adjustments</p>
            {ledger.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No adjustments yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {ledger.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/40 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{entry.description || entry.type || "—"}</span>
                      <span className="block text-muted-foreground">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}
                      </span>
                    </span>
                    <span className={`font-mono ${entry.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {entry.amount > 0 ? "+" : ""}
                      {fmt(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected ? `Adjust ${label(selected)}'s credits?` : "Adjust credits?"}
            </DialogTitle>
            <DialogDescription>
              {preview
                ? `${fmt(preview.before)} → ${fmt(preview.after)}, ${preview.change > 0 ? "+" : ""}${fmt(
                    preview.change,
                  )}. Reason: ${description}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void apply()} disabled={applying || !canApply}>
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCreditControl;
