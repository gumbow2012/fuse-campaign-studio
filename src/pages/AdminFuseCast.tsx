/**
 * FT14b — Canonical Review for FUSE avatars.
 * Admin-only: generate a neutral master portrait through the EXISTING
 * generate-studio pipeline (nano-banana-pro), review it, then deliberately
 * approve it onto the avatar_profiles row. Nothing generates on page load.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCanonicalPrompt,
  CANONICAL_PORTRAIT_ASPECT,
  CANONICAL_PORTRAIT_MODEL,
  CANONICAL_PORTRAIT_RESOLUTION,
  CANONICAL_REQUIRED_LABEL,
  isCanonicalReady,
} from "@/lib/canonicalPortrait";
import { listFuseAvatars, updateAvatar, type AvatarProfile } from "@/services/avatarProfiles";
import LiveBillingProvisionCard from "@/components/admin/LiveBillingProvisionCard";

type Draft = {
  generationId: string | null;
  status: "idle" | "running" | "complete" | "failed";
  outputUrl: string | null;
  error: string | null;
};

const EMPTY_DRAFT: Draft = { generationId: null, status: "idle", outputUrl: null, error: null };

async function callStudio(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("generate-studio", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message;
    if (context) {
      const text = await context.text().catch(() => "");
      try {
        const parsed = text ? JSON.parse(text) : null;
        if (parsed?.error) message = String(parsed.error);
      } catch {
        /* keep the original message */
      }
    }
    throw new Error(message || "Generation request failed");
  }
  if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error: string }).error));
  return data as { generation?: Record<string, unknown> };
}

export default function AdminFuseCast() {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await listFuseAvatars();
    setAvatars(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      Object.values(timers.current).forEach((id) => window.clearTimeout(id));
    };
  }, [load]);

  const poll = useCallback((avatarId: string, generationId: string) => {
    const tick = async () => {
      try {
        const data = await callStudio({ action: "status", generationId });
        const generation = (data.generation ?? {}) as Record<string, unknown>;
        const status = String(generation.status ?? "");
        if (status === "complete") {
          setDrafts((prev) => ({
            ...prev,
            [avatarId]: {
              generationId,
              status: "complete",
              outputUrl: String(generation.outputUrl ?? "") || null,
              error: null,
            },
          }));
          return;
        }
        if (status === "failed") {
          setDrafts((prev) => ({
            ...prev,
            [avatarId]: {
              generationId,
              status: "failed",
              outputUrl: null,
              error: String(generation.error ?? "Generation failed"),
            },
          }));
          return;
        }
        timers.current[avatarId] = window.setTimeout(tick, 6000);
      } catch (error) {
        setDrafts((prev) => ({
          ...prev,
          [avatarId]: {
            generationId,
            status: "failed",
            outputUrl: null,
            error: error instanceof Error ? error.message : "Generation failed",
          },
        }));
      }
    };
    timers.current[avatarId] = window.setTimeout(tick, 4000);
  }, []);

  const generate = useCallback(
    async (avatar: AvatarProfile) => {
      setBusy((prev) => ({ ...prev, [avatar.id]: true }));
      setDrafts((prev) => ({ ...prev, [avatar.id]: { ...EMPTY_DRAFT, status: "running" } }));
      try {
        const data = await callStudio({
          action: "start",
          kind: "image",
          model: CANONICAL_PORTRAIT_MODEL,
          prompt: buildCanonicalPrompt(avatar),
          resolution: CANONICAL_PORTRAIT_RESOLUTION,
          aspectRatio: CANONICAL_PORTRAIT_ASPECT,
        });
        const generationId = String((data.generation as Record<string, unknown> | undefined)?.id ?? "");
        if (!generationId) throw new Error("Generation did not start");
        setDrafts((prev) => ({ ...prev, [avatar.id]: { ...EMPTY_DRAFT, generationId, status: "running" } }));
        poll(avatar.id, generationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Generation failed";
        setDrafts((prev) => ({ ...prev, [avatar.id]: { ...EMPTY_DRAFT, status: "failed", error: message } }));
        toast.error(message);
      } finally {
        setBusy((prev) => ({ ...prev, [avatar.id]: false }));
      }
    },
    [poll],
  );

  const approve = useCallback(async (avatar: AvatarProfile, outputUrl: string) => {
    if (isCanonicalReady(avatar)) {
      toast.error("This identity is already approved — nothing was replaced.");
      return;
    }
    setBusy((prev) => ({ ...prev, [avatar.id]: true }));
    try {
      await updateAvatar(avatar.id, {
        thumbnail_url: outputUrl,
        reference_assets: [outputUrl],
        consistency_profile: {
          ...(avatar.consistency_profile ?? {}),
          needs_canonical_assets: false,
          canonical_reference_assets: [outputUrl],
        },
      });
      toast.success(`${avatar.name} identity approved`);
      setDrafts((prev) => ({ ...prev, [avatar.id]: EMPTY_DRAFT }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve identity");
    } finally {
      setBusy((prev) => ({ ...prev, [avatar.id]: false }));
    }
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">FUSE Cast</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">Canonical Review</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each FUSE character needs one approved master portrait before customers can cast it.
          Portraits are identity references only — never campaign art.
        </p>
      </header>

      <div className="mb-8">
        <LiveBillingProvisionCard />
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading FUSE cast…
        </p>
      ) : !avatars.length ? (
        <p className="text-sm text-muted-foreground">No FUSE avatars found.</p>
      ) : (
        <div className="space-y-4">
          {avatars.map((avatar) => {
            const ready = isCanonicalReady(avatar);
            const draft = drafts[avatar.id] ?? EMPTY_DRAFT;
            const working = busy[avatar.id] === true;
            return (
              <section
                key={avatar.id}
                className="rounded-2xl border border-border/50 bg-background/60 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-foreground">{avatar.name}</h2>
                      <span
                        className={
                          ready
                            ? "rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200"
                            : "rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200"
                        }
                      >
                        {ready ? "Ready" : CANONICAL_REQUIRED_LABEL}
                      </span>
                    </div>
                    {avatar.style_tags.length ? (
                      <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {avatar.style_tags.join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/75">
                      {avatar.visual_description ?? "No canonical identity text on this row."}
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    {avatar.thumbnail_url ? (
                      <img
                        src={avatar.thumbnail_url}
                        alt={`${avatar.name} master portrait`}
                        className="h-32 w-24 rounded-xl border border-border/50 object-cover"
                      />
                    ) : null}
                    {draft.outputUrl ? (
                      <img
                        src={draft.outputUrl}
                        alt={`${avatar.name} candidate portrait`}
                        className="h-32 w-24 rounded-xl border border-cyan-300/50 object-cover"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {!ready && draft.status === "idle" ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={working}
                      onClick={() => void generate(avatar)}
                      className="rounded-full"
                    >
                      <Sparkles className="mr-2 h-3.5 w-3.5" />
                      Generate master portrait (nano-banana-pro · 2K)
                    </Button>
                  ) : null}

                  {draft.status === "running" ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating master portrait…
                    </p>
                  ) : null}

                  {draft.status === "complete" && draft.outputUrl ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={working}
                        onClick={() => void approve(avatar, draft.outputUrl!)}
                        className="rounded-full"
                      >
                        <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                        Approve identity
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={working}
                        onClick={() => void generate(avatar)}
                        className="rounded-full"
                      >
                        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Regenerate
                      </Button>
                    </>
                  ) : null}

                  {draft.status === "failed" ? (
                    <>
                      <p className="text-xs text-destructive">{draft.error}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={working}
                        onClick={() => void generate(avatar)}
                        className="rounded-full"
                      >
                        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
                      </Button>
                    </>
                  ) : null}

                  {ready && draft.status === "idle" ? (
                    <p className="text-xs text-muted-foreground">
                      Master portrait approved — customers can cast this character.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
