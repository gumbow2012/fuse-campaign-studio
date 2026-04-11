import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

export interface ContactMessageInput {
  name: string;
  email: string;
  company?: string;
  message: string;
}

export async function submitContactMessage(input: ContactMessageInput) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-contact-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Could not send your message.");
  }

  return data as { ok: true; id: string };
}
