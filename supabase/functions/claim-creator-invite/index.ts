// claim-creator-invite — the authenticated recipient claims a branded creator invite.
// The branded token is the proof of intent (the invite email may be a placeholder, so we do
// NOT email-match). On claim we grant the CREATOR role (never admin), create the claimer's
// creator profile + economics (share from the invite), and re-point any placeholder-owned
// templates/profile to the claimer. Idempotent + safe against double-clicks and reuse.
import { createAdminClient, requireUser, json, errorMessage, corsHeaders } from "../_shared/supabase-admin.ts";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const admin = createAdminClient();
    const user = await requireUser(req, admin); // the person claiming
    const { token } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !TOKEN_RE.test(token)) {
      return json({ status: "invalid", error: "Invite link is not valid" }, 400);
    }

    const { data: invite } = await admin
      .from("creator_invites")
      .select("id, status, branded_token, creator_share_bps, accepted_user_id, accepted_at, display_name, instagram_handle, first_name, created_at, last_sent_at")
      .eq("branded_token", token).maybeSingle();
    if (!invite) return json({ status: "invalid", error: "Invite link is not valid" }, 404);
    if (invite.status === "revoked") return json({ status: "revoked", error: "This invite was revoked" }, 410);

    // Already claimed by THIS user -> idempotent success.
    if (invite.accepted_user_id && invite.accepted_user_id === user.id) {
      return json({ status: "claimed", already: true, userId: user.id, email: user.email });
    }
    // Already claimed by a different REAL user (not a *.pending placeholder) -> blocked.
    if (invite.accepted_user_id) {
      const { data: prevProfile } = await admin.from("profiles").select("email").eq("user_id", invite.accepted_user_id).maybeSingle();
      const prevEmail = String(prevProfile?.email ?? "");
      const isPlaceholder = /\.pending@|@fuse-us\.com$/i.test(prevEmail) || prevEmail === "";
      if (!isPlaceholder) {
        return json({ status: "already_claimed", error: "This invite was already claimed by another account" }, 409);
      }
    }

    // Expiry (only enforced for never-claimed invites).
    if (!invite.accepted_user_id) {
      const stamp = Date.parse(invite.last_sent_at ?? invite.created_at ?? "") || 0;
      if (!stamp || Date.now() - stamp > MAX_AGE_MS) {
        return json({ status: "expired", error: "This invite has expired" }, 410);
      }
    }

    const placeholderId: string | null = invite.accepted_user_id && invite.accepted_user_id !== user.id ? invite.accepted_user_id : null;
    const shareBps = Number(invite.creator_share_bps ?? 0) || null;

    // 1) Grant CREATOR role (idempotent).
    await admin.from("user_roles").upsert({ user_id: user.id, role: "creator" }, { onConflict: "user_id,role" });

    // 2) Economics: move the placeholder's share to the claimer, or seed from the invite.
    if (shareBps) {
      await admin.from("creator_economics").upsert({ user_id: user.id, share_bps: shareBps, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    }
    if (placeholderId) await admin.from("creator_economics").delete().eq("user_id", placeholderId);

    // 3) Re-point placeholder-owned content to the claimer.
    if (placeholderId) {
      await admin.from("fuse_templates").update({ created_by: user.id }).eq("created_by", placeholderId);
      // Move the placeholder creator_profile to the claimer if the claimer has none yet.
      const { data: myProfile } = await admin.from("creator_profiles").select("id").eq("user_id", user.id).maybeSingle();
      if (!myProfile) {
        await admin.from("creator_profiles").update({ user_id: user.id }).eq("user_id", placeholderId);
      }
    }

    // 4) Ensure the claimer has a creator_profile.
    const { data: profileNow } = await admin.from("creator_profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (!profileNow) {
      const handleBase = String(invite.instagram_handle || invite.display_name || (user.email ? user.email.split("@")[0] : "creator"))
        .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32) || "creator";
      await admin.from("creator_profiles").upsert(
        { user_id: user.id, handle: handleBase, display_name: invite.display_name || invite.first_name || null, is_public: false },
        { onConflict: "user_id" },
      );
    }

    // 5) Mark the invite claimed by the real account.
    await admin.from("creator_invites").update({ status: "accepted", accepted_user_id: user.id, accepted_at: new Date().toISOString() }).eq("id", invite.id);

    return json({ status: "claimed", userId: user.id, email: user.email, repointedFrom: placeholderId });
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
