create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  template_id text,
  template_name text,
  plan_key text,
  return_to text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  fbclid text,
  claim_nonce_hash text not null,
  stripe_session_id text,
  status text default 'created',
  claimed_user_id uuid,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '2 hours',
  claimed_at timestamptz
);

create index if not exists checkout_intents_stripe_session_id_idx
  on public.checkout_intents (stripe_session_id);

grant all on public.checkout_intents to service_role;

alter table public.checkout_intents enable row level security;