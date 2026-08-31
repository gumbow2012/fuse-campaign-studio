/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";
import { sendEmail } from "../_shared/sendEmail.ts";
import { buildCreatorInviteEmail } from "../_shared/creatorInviteEmail.ts";

const INVITE_REDIRECT_TO = "https://fuse-us.com/creator/setup";
const BRANDED_INVITE_BASE = "https://fuse-us.com/creator/invite";


type Action = "list" | "invite" | "resend" | "revoke" | "review_queue" | "set_verification";

type Body = {
  action?: Action;
  email?: string;
  userId?: string;
  inviteId?: string;
  verificationStatus?: string;
  verificationReason?: string | null;
  firstName?: string;
  instagramHandle?: string;
  displayName?: string;
  personalNote?: string;
  creatorSpecialty?: string;
};

type Personalization = {
  first_name: string | null;
  instagram_handle: string | null;
  display_name: string | null;
  personal_note: string | null;
  creator_specialty: string | null;
};

const VERIFICATION_STATUSES = ["creator", "verified", "featured", "partner"] as const;


function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, max);
  return trimmed ? trimmed : null;
}

function cleanNote(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed ? trimmed : null;
}

function cleanHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bare = value.replace(/\s+/g, "").replace(/^@+/, "").slice(0, 64);
  return bare ? bare : null;
}

function readPersonalization(body: Body): Personalization {
  return {
    first_name: cleanText(body.firstName, 80),
    instagram_handle: cleanHandle(body.instagramHandle),
    display_name: cleanText(body.displayName, 80),
    personal_note: cleanNote(body.personalNote, 500),
    creator_specialty: cleanText(body.creatorSpecialty, 80),
  };
}

/** URL-safe random token, never logged. */
function newBrandedToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

function brandedUrl(token: string) {
  return `${BRANDED_INVITE_BASE}/${token}`;
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

      // Public verification fields only — verification_reason stays private.
      const { data: creatorProfiles } = ids.length
        ? await admin
            .from("creator_profiles")
            .select("user_id, handle, verification_status, verified_at")
            .in("user_id", ids)
        : { data: [] } as any;
      const creatorProfileById = new Map<string, any>(
        (creatorProfiles ?? []).map((row: any) => [row.user_id, row]),
      );

      const creators = ids.map((id: string) => ({
        userId: id,
        email: profileById.get(id)?.email ?? null,
        name: profileById.get(id)?.name ?? null,
        createdAt: profileById.get(id)?.created_at ?? null,
        handle: creatorProfileById.get(id)?.handle ?? null,
        verificationStatus: creatorProfileById.get(id)?.verification_status ?? "creator",
        verifiedAt: creatorProfileById.get(id)?.verified_at ?? null,
      }));

      const { data: invites, error: inviteError } = await admin
        .from("creator_invites")
        .select(
          "id, email, status, invited_by, created_at, accepted_at, email_status, provider_message_id, delivered_at, bounced_at, failure_reason, last_sent_at, sent_count, first_name, instagram_handle, display_name, creator_specialty",
        )
        .order("created_at", { ascending: false });
      if (inviteError) throw new Error(inviteError.message);

      return json({ creators, invites: invites ?? [] });
    }

    if (action === "invite") {
      const email = cleanEmail(body.email);
      if (!email || !email.includes("@")) throw new Error("A valid email is required");

      const personalization = readPersonalization(body);

      const { data: existingInvite } = await admin
        .from("creator_invites")
        .select("id, status, sent_count")
        .eq("email", email)
        .maybeSingle();

      let inviteId = (existingInvite as any)?.id as string | undefined;
      let sentCount = Number((existingInvite as any)?.sent_count ?? 0);
      if (inviteId) {
        const { error } = await admin
          .from("creator_invites")
          .update({ status: "pending", invited_by: user.id, ...personalization })
          .eq("id", inviteId);
        if (error) throw new Error(error.message);
      } else {
        const { data: inserted, error } = await admin
          .from("creator_invites")
          .insert({ email, invited_by: user.id, status: "pending", ...personalization })
          .select("id, sent_count")
          .single();
        if (error) throw new Error(error.message);
        inviteId = (inserted as any).id;
        sentCount = Number((inserted as any)?.sent_count ?? 0);
      }

      const { data: linkData, error: inviteError } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: INVITE_REDIRECT_TO },
      });

      if (!inviteError) {
        const actionLink = (linkData as any)?.properties?.action_link as string | undefined;
        if (!actionLink) {
          await admin
            .from("creator_invites")
            .update({ email_status: "failed", failure_reason: "No invite link generated" })
            .eq("id", inviteId!);
          return json({ ok: false, inviteId, emailSent: false, emailStatus: "failed", reason: "Could not generate invite link" });
        }

        const brandedToken = newBrandedToken();
        await admin
          .from("creator_invites")
          .update({ action_link: actionLink, branded_token: brandedToken })
          .eq("id", inviteId!);

        const branded = buildCreatorInviteEmail(brandedUrl(brandedToken), {
          firstName: personalization.first_name ?? undefined,
          instagramHandle: personalization.instagram_handle ?? undefined,
          personalNote: personalization.personal_note ?? undefined,
        });
        const sendResult = await sendEmail({
          to: email,
          subject: branded.subject,
          html: branded.html,
          text: branded.text,
          fromName: "FUSE Creator Team",
        });

        if (!sendResult.sent) {
          const reason = sendResult.reason === "no_provider"
            ? "Email provider not configured"
            : `Email provider rejected the send (${sendResult.status})`;
          await admin
            .from("creator_invites")
            .update({ email_status: "failed", failure_reason: reason.slice(0, 500) })
            .eq("id", inviteId!);
          return json({ ok: false, inviteId, emailSent: false, emailStatus: "failed", reason });
        }

        // Honest status: the provider accepted the send. Delivery is NOT confirmed here.
        await admin
          .from("creator_invites")
          .update({
            email_status: "provider_accepted",
            last_sent_at: new Date().toISOString(),
            sent_count: sentCount + 1,
            failure_reason: null,
          })
          .eq("id", inviteId!);
        return json({ ok: true, inviteId, emailSent: true, grantedImmediately: false, emailStatus: "provider_accepted" });
      }


      const message = inviteError.message ?? "";
      const alreadyExists = /already|registered|exists/i.test(message);
      if (!alreadyExists) {
        await admin
          .from("creator_invites")
          .update({ email_status: "failed", failure_reason: message.slice(0, 500) || "Send failed" })
          .eq("id", inviteId!);
        return json({ ok: false, inviteId, emailSent: false, emailStatus: "failed", reason: message || "Could not send invite email" });
      }

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

    if (action === "resend") {
      // Admin already verified above via requireAdminUser; re-assert intent explicitly.
      if (!user?.id) throw new Error("Admin access required");
      const inviteId = typeof body.inviteId === "string" ? body.inviteId.trim() : "";
      if (!inviteId) throw new Error("inviteId is required");

      const { data: invite, error: loadError } = await admin
        .from("creator_invites")
        .select("id, email, sent_count, first_name, instagram_handle, display_name, personal_note, creator_specialty")
        .eq("id", inviteId)
        .maybeSingle();
      if (loadError) throw new Error(loadError.message);
      if (!invite) throw new Error("Invite not found");

      const email = cleanEmail((invite as any).email);
      if (!email.includes("@")) throw new Error("This invite has no valid email");
      const sentCount = Number((invite as any).sent_count ?? 0);

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: INVITE_REDIRECT_TO },
      });

      let sendFailure: string | null = linkError ? (linkError.message ?? "Send failed") : null;

      if (!sendFailure) {
        const actionLink = (linkData as any)?.properties?.action_link as string | undefined;
        if (!actionLink) {
          sendFailure = "Could not generate invite link";
        } else {
          const brandedToken = newBrandedToken();
          await admin
            .from("creator_invites")
            .update({ action_link: actionLink, branded_token: brandedToken })
            .eq("id", inviteId);

          const branded = buildCreatorInviteEmail(brandedUrl(brandedToken), {
            firstName: (invite as any).first_name ?? undefined,
            instagramHandle: (invite as any).instagram_handle ?? undefined,
            personalNote: (invite as any).personal_note ?? undefined,
          });
          const sendResult = await sendEmail({
            to: email,
            subject: branded.subject,
            html: branded.html,
            text: branded.text,
            fromName: "FUSE Creator Team",
          });
          if (!sendResult.sent) {
            sendFailure = sendResult.reason === "no_provider"
              ? "Email provider not configured"
              : `Email provider rejected the send (${sendResult.status})`;
          }
        }
      }

      const patch = sendFailure
        ? { email_status: "failed", failure_reason: sendFailure.slice(0, 500) }
        : {
            email_status: "provider_accepted",
            failure_reason: null,
            last_sent_at: new Date().toISOString(),
            sent_count: sentCount + 1,
          };


      const { data: updated, error: updateError } = await admin
        .from("creator_invites")
        .update(patch)
        .eq("id", inviteId)
        .select(
          "id, email, status, invited_by, created_at, accepted_at, email_status, provider_message_id, delivered_at, bounced_at, failure_reason, last_sent_at, sent_count",
        )
        .single();
      if (updateError) throw new Error(updateError.message);

      return json({
        ok: !sendFailure,
        reason: sendFailure ?? null,
        invite: updated,
      });

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

    if (action === "set_verification") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      const status = String(body.verificationStatus ?? "").trim().toLowerCase();
      if (!userId) throw new Error("userId is required");
      if (!(VERIFICATION_STATUSES as readonly string[]).includes(status)) {
        throw new Error("Unknown verification status");
      }

      const patch: Record<string, unknown> = {
        verification_status: status,
        verified_at: status === "creator" ? null : new Date().toISOString(),
      };
      // Admin-only note; stored but never returned by any public read.
      if (typeof body.verificationReason === "string" || body.verificationReason === null) {
        patch.verification_reason = body.verificationReason || null;
      }

      const { error } = await admin
        .from("creator_profiles")
        .update(patch)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);

      return json({ ok: true, userId, verificationStatus: status });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "Admin access required" ? 403 : 400;
    return json({ error: message }, status);
  }
});
