/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";

type Action = "list" | "invite" | "revoke" | "review_queue";

type Body = {
  action?: Action;
  email?: string;
  userId?: string;
  inviteId?: string;
};

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const user = await requireAdminUser(req, admin);
    const body = await req.json().catch(() => ({})) as Body;
    const action = (body.action ?? "list") as Action;

    if (action === "list") {
      const { data: roleRows, error: roleError } = await admin
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "creator");
      if (roleError) throw new Error(roleError.message);

      const ids = (roleRows ?? []).map((row: any) => row.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await admin.from("profiles").select("user_id, email, name, created_at").in("user_id", ids)
        : { data: [], error: null } as any;
      if (profileError) throw new Error(profileError.message);

      const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.user_id, p]));
      const creators = ids.map((id: string) => ({
        userId: id,
        email: profileById.get(id)?.email ?? null,
        name: profileById.get(id)?.name ?? null,
        createdAt: profileById.get(id)?.created_at ?? null,
      }));

      const { data: invites, error: inviteError } = await admin
        .from("creator_invites")
        .select("id, email, status, invited_by, created_at, accepted_at")
        .order("created_at", { ascending: false });
      if (inviteError) throw new Error(inviteError.message);

      return json({ creators, invites: invites ?? [] });
    }

    if (action === "invite") {
      const email = cleanEmail(body.email);
      if (!email || !email.includes("@")) throw new Error("A valid email is required");

      const { data: existingInvite } = await admin
        .from("creator_invites")
        .select("id, status")
        .eq("email", email)
        .maybeSingle();

      let inviteId = (existingInvite as any)?.id as string | undefined;
      if (inviteId) {
        const { error } = await admin
          .from("creator_invites")
          .update({ status: "pending", invited_by: user.id })
          .eq("id", inviteId);
        if (error) throw new Error(error.message);
      } else {
        const { data: inserted, error } = await admin
          .from("creator_invites")
          .insert({ email, invited_by: user.id, status: "pending" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        inviteId = (inserted as any).id;
      }

      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);

      if (!inviteError) {
        return json({ ok: true, inviteId, emailSent: true, grantedImmediately: false });
      }

      const message = inviteError.message ?? "";
      const alreadyExists = /already|registered|exists/i.test(message);
      if (!alreadyExists) throw new Error(message || "Could not send invite email");

      // User already exists — grant the creator role right away.
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile) throw new Error("That account exists but has no profile yet. Ask them to sign in once, then retry.");

      const targetId = (profile as any).user_id as string;
      const { error: roleError } = await admin
        .from("user_roles")
        .upsert({ user_id: targetId, role: "creator" }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);

      const { error: acceptError } = await admin
        .from("creator_invites")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", inviteId!);
      if (acceptError) throw new Error(acceptError.message);

      return json({ ok: true, inviteId, emailSent: false, grantedImmediately: true, userId: targetId });
    }

    if (action === "revoke") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      const inviteId = typeof body.inviteId === "string" ? body.inviteId.trim() : "";
      if (!userId && !inviteId) throw new Error("userId or inviteId is required");

      if (userId) {
        const { error } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "creator");
        if (error) throw new Error(error.message);
      }

      if (inviteId) {
        const { error } = await admin
          .from("creator_invites")
          .update({ status: "revoked" })
          .eq("id", inviteId);
        if (error) throw new Error(error.message);
      }

      return json({ ok: true });
    }

    if (action === "review_queue") {
      const { data: versions, error: versionError } = await admin
        .from("template_versions")
        .select("id, template_id, version_number, review_status, is_active, created_at, updated_at")
        .eq("review_status", "Submitted")
        .order("created_at", { ascending: true });
      if (versionError) throw new Error(versionError.message);

      const templateIds = Array.from(new Set((versions ?? []).map((v: any) => v.template_id)));
      const { data: templates, error: templateError } = templateIds.length
        ? await admin
            .from("fuse_templates")
            .select("id, name, description, preview_url, preview_asset_type, created_by")
            .in("id", templateIds)
        : { data: [], error: null } as any;
      if (templateError) throw new Error(templateError.message);

      const creatorIds = Array.from(
        new Set((templates ?? []).map((t: any) => t.created_by).filter(Boolean)),
      ) as string[];
      const { data: creatorProfiles } = creatorIds.length
        ? await admin.from("profiles").select("user_id, email, name").in("user_id", creatorIds)
        : { data: [] } as any;

      const templateById = new Map<string, any>((templates ?? []).map((t: any) => [t.id, t]));
      const creatorById = new Map<string, any>((creatorProfiles ?? []).map((p: any) => [p.user_id, p]));

      const queue = (versions ?? []).map((version: any) => {
        const template = templateById.get(version.template_id) ?? {};
        const creator = template.created_by ? creatorById.get(template.created_by) : null;
        return {
          versionId: version.id,
          versionNumber: version.version_number,
          templateId: version.template_id,
          templateName: template.name ?? "Untitled template",
          description: template.description ?? null,
          previewUrl: template.preview_url ?? null,
          previewAssetType: template.preview_asset_type ?? null,
          isActive: version.is_active === true,
          submittedAt: version.updated_at ?? version.created_at ?? null,
          creator: creator
            ? { userId: creator.user_id, email: creator.email ?? null, name: creator.name ?? null }
            : null,
        };
      });

      return json({ queue });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "Admin access required" ? 403 : 400;
    return json({ error: message }, status);
  }
});
