/**
 * Creator application submissions (ADDITIVE).
 *
 * Writes to `public.creator_applications` (already applied to prod; anyone may
 * INSERT under RLS). The generated preview types don't include this table, so
 * the client is loosely typed here. No Stripe, billing, credit or generation
 * logic is touched.
 */

import { supabase } from "@/integrations/supabase/client";

export type CreatorApplicationPayload = {
  email: string;
  name?: string | null;
  portfolio_url?: string | null;
  instagram?: string | null;
  tiktok?: string | null
  x_handle?: string | null;
  pitch?: string | null;
  user_id?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function validateCreatorApplication(payload: CreatorApplicationPayload): string | null {
  const email = (payload.email ?? "").trim();
  if (!email) return "Email is required.";
  if (email.length > 255) return "Email must be less than 255 characters.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email address.";
  return null;
}

export async function submitCreatorApplication(payload: CreatorApplicationPayload) {
  const invalid = validateCreatorApplication(payload);
  if (invalid) throw new Error(invalid);

  const row = {
    email: payload.email.trim().slice(0, 255),
    name: clean(payload.name, 120),
    portfolio_url: clean(payload.portfolio_url, 500),
    instagram: clean(payload.instagram, 120),
    tiktok: clean(payload.tiktok, 120),
    x_handle: clean(payload.x_handle, 120),
    pitch: clean(payload.pitch, 2000),
    user_id: payload.user_id ?? null,
  };

  const client = supabase as unknown as {
    from: (table: string) => {
      insert: (values: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const { error } = await client.from("creator_applications").insert(row);
  if (error) throw new Error(error.message);
}
