import { useCallback, useEffect, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plus, Terminal, X } from "lucide-react";
import {
  API_KEY_SCOPES,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRecord,
  type ApiKeyScope,
  type CreatedApiKey,
} from "@/services/apiKeys";

const ENDPOINT = "https://ykrrwgkxgidoavtzcumk.supabase.co/functions/v1/fuse-mcp";

const CURL_EXAMPLE = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer <your key>" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"discovery"}'`;

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
      {scope}
    </span>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy it manually.", variant: "destructive" });
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleCopy}
      className="shrink-0 gap-1.5 rounded-full border-white/15 bg-white/5 text-xs text-foreground hover:bg-white/10"
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export default function DeveloperApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["templates:read", "runs:read"]);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setKeys(await listApiKeys());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load your API keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "Give the key a name you'll recognise.", variant: "destructive" });
      return;
    }
    if (scopes.length === 0) {
      toast({ title: "Pick at least one scope", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const created = await createApiKey(trimmed, scopes);
      setNewKey(created);
      setName("");
      setScopes(["templates:read", "runs:read"]);
      setFormOpen(false);
      await load();
    } catch (error) {
      toast({
        title: "Could not create key",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (record: ApiKeyRecord) => {
    if (!window.confirm(`Revoke "${record.name}"? Any app using this key will stop working immediately.`)) return;
    setRevokingId(record.id);
    try {
      await revokeApiKey(record.id);
      toast({ title: "Key revoked" });
      await load();
    } catch (error) {
      toast({
        title: "Could not revoke key",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <SiteShell>
      <PageMeta
        title="API Keys — FUSE Developer"
        description="Create and manage FUSE API keys for programmatic access to your templates and runs."
        path="/account/developer"
        noindex
      />
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Developer</p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.04em] text-white md:text-5xl">
              API Keys
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Programmatic access to your FUSE templates and runs.
            </p>
          </div>
          <Button
            onClick={() => setFormOpen((open) => !open)}
            className="gap-2 rounded-full bg-cyan-300 font-sans text-xs font-bold uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-200"
          >
            <Plus size={14} aria-hidden="true" />
            Create API key
          </Button>
        </div>

        {/* One-time secret reveal */}
        {newKey?.key ? (
          <div className="mt-8 rounded-2xl border border-cyan-300/40 bg-cyan-300/[0.06] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2 text-cyan-100">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.14em]">
                    Copy this now — it won't be shown again.
                  </p>
                  <p className="mt-1 text-xs text-cyan-100/70">
                    Secret for “{newKey.name}”. Store it in your server environment, never in client code.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Dismiss key"
                onClick={() => setNewKey(null)}
                className="h-8 w-8 shrink-0 text-cyan-100 hover:bg-white/10"
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/50 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-cyan-200">{newKey.key}</code>
              <CopyButton value={newKey.key} label="Copy key" />
            </div>
            {newKey.note ? <p className="mt-3 text-xs text-cyan-100/70">{newKey.note}</p> : null}
          </div>
        ) : null}

        {/* Create form */}
        {formOpen ? (
          <div className={cn(panelClass, "mt-8")}>
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white">New key</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <Label htmlFor="key-name" className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Name
                </Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Production server"
                  className="mt-2 border-white/10 bg-black/40 text-foreground"
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Scopes</p>
                <div className="mt-2 space-y-2">
                  {API_KEY_SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-2 font-mono text-xs text-foreground/85">
                      <Checkbox
                        checked={scopes.includes(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                        aria-label={scope}
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="gap-2 rounded-full bg-cyan-300 font-sans text-xs font-bold uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-200"
              >
                {creating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
                {creating ? "Creating…" : "Create key"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setFormOpen(false)}
                className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* Key list */}
        <div className={cn(panelClass, "mt-8 p-0")}>
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white">Your keys</h2>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Loading your keys…
            </div>
          ) : loadError ? (
            <div className="px-6 py-10">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button
                variant="outline"
                onClick={() => void load()}
                className="mt-4 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
              >
                Try again
              </Button>
            </div>
          ) : keys.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <KeyRound size={20} className="mx-auto text-cyan-300" aria-hidden="true" />
              <p className="mt-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-white">No API keys yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Create a key to call FUSE from your own tools and scripts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Key</th>
                    <th className="px-6 py-3">Scopes</th>
                    <th className="px-6 py-3">Last used</th>
                    <th className="px-6 py-3">Created</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((record) => {
                    const revoked = Boolean(record.revoked_at);
                    return (
                      <tr key={record.id} className="border-t border-white/[0.07]">
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("font-semibold", revoked ? "text-muted-foreground" : "text-foreground")}>
                              {record.name}
                            </span>
                            {revoked ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                Revoked
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{record.key_prefix}…</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {(record.scopes ?? []).map((scope) => (
                              <ScopeChip key={scope} scope={scope} />
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">{formatDate(record.last_used_at)}</td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">{formatDate(record.created_at)}</td>
                        <td className="px-6 py-4 text-right">
                          {revoked ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={revokingId === record.id}
                              onClick={() => void handleRevoke(record)}
                              className="rounded-full border-destructive/40 bg-destructive/10 text-xs text-destructive hover:bg-destructive/20"
                            >
                              {revokingId === record.id ? "Revoking…" : "Revoke"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help */}
        <div className={cn(panelClass, "mt-8")}>
          <div className="flex items-center gap-2">
            <Terminal size={15} className="text-cyan-300" aria-hidden="true" />
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-white">Using the API</h2>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/50 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-cyan-200">POST {ENDPOINT}</code>
            <CopyButton value={ENDPOINT} label="Copy URL" />
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground/85">
                <code>{CURL_EXAMPLE}</code>
              </pre>
              <CopyButton value={CURL_EXAMPLE} label="Copy" />
            </div>
          </div>
          <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Available read actions</p>
            <div className="flex flex-wrap gap-1.5">
              {["discovery", "template.get", "job.status"].map((action) => (
                <ScopeChip key={action} scope={action} />
              ))}
            </div>
            <p className="mt-2 text-xs">
              <span className="font-mono text-foreground/80">run.create</span> is coming soon.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
