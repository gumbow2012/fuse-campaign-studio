/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireAdminUser,
  requireUser,
} from "../_shared/supabase-admin.ts";

/**
 * Creator economics config + per-creator revenue share (P5A).
 *
 * ALL economics numbers come from public.platform_economics_config — never hardcoded here.
 * Admin-only writes; the only non-admin action is "my_rate", which returns ONLY the
 * caller's own effective share. The audit table and admin notes are never returned to creators.
 */

type Action = "config" | "get" | "set_creator_share" | "set_template_share" | "my_rate";

type Body = {
  action?: Action;
  userId?: string;
  templateId?: string;
  shareBps?: number | null;
  note?: string | null;
};

async function loadConfig(admin: any) {
  const { data, error } = await admin
    .from("platform_economics_config")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No active platform economics config found");
  return data as Record<string, any>;
}

async function effectiveShare(admin: any, userId: string | null, templateId: string | null) {
  const { data, error } = await admin.rpc("effective_creator_share_bps", {
    p_user: userId,
    p_template: templateId,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

async function customShare(admin: any, userId: string) {
  const { data, error } = await admin
    .from("creator_economics")
    .select("share_bps")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const value = (data as any)?.share_bps;
  return value === null || value === undefined ? null : Number(value);
}

function assertWithinBounds(shareBps: number, config: Record<string, any>) {
  const min = Number(config.creator_share_min_bps);
  const max = Number(config.creator_share_max_bps);
  if (!Number.isInteger(shareBps) || shareBps < min || shareBps > max) {
    throw new Error(`Share must be a whole value between ${min / 100}% and ${max / 100}%`);
  }
}

function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 500);
  return trimmed ? trimmed : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = (body.action ?? "config") as Action;

    // Creator-safe: caller's own effective rate only.
    if (action === "my_rate") {
      const user = await requireUser(req, admin);
      const config = await loadConfig(admin);
      const custom = await customShare(admin, user.id);
      const bps = await effectiveShare(admin, user.id, null);
      return json({
        effectiveShareBps: bps,
        source: custom === null ? "default" : "custom",
        defaultShareBps: Number(config.default_creator_share_bps),
      });
    }

    const user = await requireAdminUser(req, admin);
    const config = await loadConfig(admin);

    if (action === "config") {
      return json({ config });
    }

    if (action === "get") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!userId) throw new Error("userId is required");
      const custom = await customShare(admin, userId);
      const bps = await effectiveShare(admin, userId, null);
      return json({
        effectiveShareBps: bps,
        source: custom === null ? "default" : "custom",
        customShareBps: custom,
        config,
      });
    }

    if (action === "set_creator_share") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!userId) throw new Error("userId is required");

      const raw = body.shareBps;
      const clearing = raw === null || raw === undefined;
      const shareBps = clearing ? null : Number(raw);
      if (!clearing) assertWithinBounds(shareBps as number, config);

      const previousEffective = await effectiveShare(admin, userId, null);

      const { error: upsertError } = await admin
        .from("creator_economics")
        .upsert(
          { user_id: userId, share_bps: shareBps, updated_by: user.id, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (upsertError) throw new Error(upsertError.message);

      const newEffective = await effectiveShare(admin, userId, null);

      const { error: auditError } = await admin.from("creator_share_audit").insert({
        target_user_id: userId,
        old_bps: previousEffective,
        new_bps: newEffective,
        changed_by: user.id,
        note: cleanNote(body.note),
      });
      if (auditError) throw new Error(auditError.message);

      return json({
        ok: true,
        userId,
        effectiveShareBps: newEffective,
        customShareBps: shareBps,
        source: shareBps === null ? "default" : "custom",
      });
    }

    if (action === "set_template_share") {
      const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
      if (!templateId) throw new Error("templateId is required");

      const raw = body.shareBps;
      const clearing = raw === null || raw === undefined;
      const shareBps = clearing ? null : Number(raw);
      if (!clearing) assertWithinBounds(shareBps as number, config);

      const { data: existing, error: loadError } = await admin
        .from("fuse_templates")
        .select("id, created_by, creator_share_bps_override")
        .eq("id", templateId)
        .maybeSingle();
      if (loadError) throw new Error(loadError.message);
      if (!existing) throw new Error("Template not found");

      const previous = (existing as any).creator_share_bps_override;
      const previousBps =
        previous === null || previous === undefined
          ? await effectiveShare(admin, (existing as any).created_by ?? null, null)
          : Number(previous);

      const { error: updateError } = await admin
        .from("fuse_templates")
        .update({ creator_share_bps_override: shareBps })
        .eq("id", templateId);
      if (updateError) throw new Error(updateError.message);

      const newEffective = await effectiveShare(admin, (existing as any).created_by ?? null, templateId);

      const { error: auditError } = await admin.from("creator_share_audit").insert({
        target_template_id: templateId,
        target_user_id: (existing as any).created_by ?? null,
        old_bps: previousBps,
        new_bps: newEffective,
        changed_by: user.id,
        note: cleanNote(body.note),
      });
      if (auditError) throw new Error(auditError.message);

      return json({ ok: true, templateId, effectiveShareBps: newEffective, overrideShareBps: shareBps });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "Admin access required"
      ? 403
      : /authorization|bearer|Authentication/i.test(message)
        ? 401
        : 400;
    return json({ error: message }, status);
  }
});
