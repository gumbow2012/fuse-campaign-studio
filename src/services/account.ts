import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export async function updateAccountProfile(input: { name: string }) {
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
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Could not update your profile.");
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data as { ok: true; profile: { name: string } };
}
