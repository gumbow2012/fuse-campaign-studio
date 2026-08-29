import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireUser,
} from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const user = await requireUser(req, admin);
    userId = user.id;
    userEmail = user.email ?? null;

    const payload = await req.json().catch(() => null);
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";

    if (name.length < 2 || name.length > 80) {
      throw new Error("Display name must be between 2 and 80 characters.");
    }

    // Optional avatar: a compact inline JPEG/PNG/WEBP data URL, or null to remove it.
    const hasAvatarField = payload && Object.prototype.hasOwnProperty.call(payload, "avatar_data_url");
    let avatarUrl: string | null | undefined;

    if (hasAvatarField) {
      const raw = payload.avatar_data_url;
      if (raw === null || raw === "") {
        avatarUrl = null;
      } else if (typeof raw !== "string") {
        throw new Error("Invalid profile photo payload.");
      } else {
        if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
          throw new Error("Profile photo must be a JPEG, PNG or WEBP image.");
        }
        const base64 = raw.split(",")[1] ?? "";
        const bytes = Math.floor((base64.length * 3) / 4);
        if (bytes > 160_000) {
          throw new Error("Profile photo is too large. Please choose a smaller image.");
        }
        avatarUrl = raw;
      }
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .upsert({
        user_id: user.id,
        email: (user.email ?? "").toLowerCase(),
        name,
        ...(avatarUrl === undefined ? {} : { avatar_url: avatarUrl }),
      }, {
        onConflict: "user_id",
      })
      .select("user_id, email, name, avatar_url")
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message ?? "Could not save your profile.");
    }

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: name,
        name,
      },
    });

    if (authError) {
      await logAuditEvent({
        eventType: "account.profile.metadata_sync_failed",
        message: authError.message,
        severity: "warn",
        source: "account-profile",
        requestId,
        errorCode: "profile_metadata_sync_failed",
        metadata: {
          user_id: user.id,
          email: user.email ?? null,
          attempted_name: name,
        },
      }, admin);
    }

    await logAuditEvent({
      eventType: "account.profile.updated",
      message: "Profile updated successfully.",
      source: "account-profile",
      requestId,
      metadata: {
        user_id: user.id,
        email: user.email ?? null,
        name,
      },
    }, admin);

    return json({
      ok: true,
      profile: {
        name: profile.name ?? name,
        avatar_url: profile.avatar_url ?? null,
      },
    });
  } catch (error) {
    const message = errorMessage(error);

    await logAuditEvent({
      eventType: "account.profile.update_failed",
      message,
      severity: "error",
      source: "account-profile",
      requestId,
      errorCode: "profile_update_failed",
      metadata: {
        user_id: userId,
        email: userEmail,
      },
    }, admin);

    return json({ error: message }, 400);
  }
});
