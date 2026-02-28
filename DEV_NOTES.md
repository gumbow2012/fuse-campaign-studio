# DEV_NOTES — Revenue Split, Analytics & Referral Systems

## Assumptions & Defaults

### Revenue Split System
- **Default split**: Platform 70% / Creator 30% (stored in `platform_config` table)
- **Affiliate bonus**: 5% of platform's share (configurable)
- **Hold period**: 7 days before allocations become AVAILABLE (configurable)
- **Per-template overrides**: Store in `templates.revenue_split_override` as JSON: `{"platform_percent": 60, "creator_percent": 40}`
- **Platform-owned templates**: `owner_type = 'PLATFORM'`, `creator_id = null` — 100% to platform (minus affiliate)
- **Stripe Connect**: Creator onboarding is placeholder — creates creator profile but doesn't yet redirect to Stripe Connect. Admin must manually set `connect_status = 'ACTIVE'` for now.
- **Payouts**: Payout execution not yet automated. Admin triggers manually. `payouts` table tracks status.

### Revenue Allocation Flow
1. `run-template` or `rerun-step` edge function executes
2. Creates a `usage_charges` record with credit + USD cost info
3. Calls `revenue-split` function with `action: "allocate"` + the charge ID
4. Function reads template ownership, platform config, and referral status
5. Creates `revenue_allocations` rows for PLATFORM, CREATOR, and/or AFFILIATE
6. All allocations start as PENDING with `available_at` = now + hold_period_days
7. A scheduled job (not yet implemented) should flip PENDING → AVAILABLE after the hold

### USD Cost Basis
- `usd_cost_basis_cents` = internal cost estimate (for margin calculation)
- `usd_price_cents` = what the user effectively paid
- For subscription users: `usd_price_cents = (monthly_price / monthly_credits) * credits_spent`
- For topup users: `usd_price_cents = (topup_price / topup_credits) * credits_spent`
- Currently set to 0 — needs integration with Stripe invoice data to calculate properly

### Analytics System
- **Event types**: PROJECT_CREATED, PROJECT_STARTED, PROJECT_COMPLETED, PROJECT_FAILED, STEP_RERUN, CREDITS_DEDUCTED, CREDITS_GRANTED, DOWNLOAD, SUBSCRIPTION_CREATED, SUBSCRIPTION_UPDATED, TOPUP_PURCHASED, REFUND_CREATED
- Events are emitted via `emit-analytics` edge function
- **Not yet wired**: The existing `run-template` and `rerun-step` functions don't yet call `emit-analytics`. You should add those calls when connecting the real AI pipeline.
- Platform overview requires admin role
- User analytics shows own data only (RLS enforced)

### Referral System
- **Signup bonus**: 50 credits (configurable in `referral_program_config`)
- **Referrer bonus**: 100 credits when referred user makes first subscription payment (configurable)
- **Paid trigger**: FIRST_SUBSCRIPTION_PAYMENT (options: FIRST_TOPUP, EITHER)
- **Code format**: FUSE-XXXXXX (6 alphanumeric chars)
- **Anti-fraud**: Self-referral blocked via DB constraint. One attribution per user (UNIQUE on referred_user_id).
- **Referral link**: `https://your-domain.com/auth?ref=FUSE-XXXXXX`
- **Note**: The Auth page doesn't yet auto-read `?ref=` param and apply. You should add that logic to the signup flow.

### What's NOT Yet Implemented (Future Work)
1. **Stripe Connect Express onboarding flow** — needs real Stripe Connect API calls
2. **Automated payout execution** — needs Stripe Transfer API integration
3. **Scheduled job to flip PENDING → AVAILABLE** — needs a cron/scheduled edge function
4. **Webhook handler for referral qualification** — needs Stripe webhook for `invoice.payment_succeeded`
5. **Auto-read ?ref= param on signup** — needs Auth page modification
6. **Usage charge creation in run-template** — the existing function needs to create usage_charges + call revenue-split
7. **Device fingerprinting for referral anti-fraud** — not implemented
8. **Creator template submission flow** — admin currently manages templates; creator self-submission TBD

### Database Tables Added
- `platform_config` — Global revenue split + hold period settings
- `creators` — Creator profiles with Stripe Connect status
- `usage_charges` — Per-usage billing records
- `revenue_allocations` — Revenue split ledger entries
- `payouts` — Payout tracking
- `refund_events` — Refund/chargeback log
- `analytics_events` — All trackable events
- `referral_program_config` — Referral program settings
- `referral_codes` — User referral codes
- `referral_attributions` — Who referred whom
- `referral_rewards` — Credit/revenue rewards issued

### Columns Added to Existing Tables
- `templates`: `owner_type`, `creator_id`, `revenue_split_override`
- `projects`: `started_at`, `completed_at`, `failed_at`
- `project_steps`: `duration_ms`

### New Routes
- `/analytics` — User usage analytics (protected)
- `/creator/analytics` — Creator earnings dashboard (protected)
- `/referrals` — Referral code + stats (protected)
- `/admin/analytics` — Platform-wide analytics (admin only)

### New Edge Functions
- `analytics-platform` — Analytics data endpoint (user/creator/admin views)
- `referrals` — Referral code management + application
- `revenue-split` — Revenue allocation + creator onboarding + reversal
- `emit-analytics` — Server-side analytics event emitter
