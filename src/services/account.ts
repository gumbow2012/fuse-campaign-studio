import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export type AccountProfileInput = {
  name: string;
  /** Compact JPEG data URL from `fileToAvatarDataUrl`, or null to remove the photo. */
  avatarDataUrl?: string | null;
};

export async function updateAccountProfile(input: AccountProfileInput) {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      throw error;
    }
    session = data.session;
  }

  if (!session?.access_token) {
    throw new Error("Missing authenticated session.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-account-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      name: input.name,
      ...(input.avatarDataUrl === undefined ? {} : { avatar_data_url: input.avatarDataUrl }),
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not update your profile.");
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data as { ok: true; profile: { name: string; avatar_url: string | null } };
}
