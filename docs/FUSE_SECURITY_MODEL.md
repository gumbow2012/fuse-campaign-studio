# FUSE MCP / API — security model

**Auth.** Three identities: anonymous (public read tools only), Supabase user JWT (OAuth 2.1 access token with `client_id`, or a normal session token) validated by `auth.getUser` plus issuer/audience checks, and developer API keys (`fuse_live_…`, sha256 at rest, per-key scopes, 60/min default rate limit, revocable, `last_used_at`). The `LAB_RUNNER_CODE` bypass and the service role are never used for user actions.

**Scopes.** `fuse.*` scopes per tool (see setup doc). OAuth users get the user set; API keys only what was chosen. Missing scope → `FORBIDDEN_SCOPE` (403). Missing token → `AUTH_REQUIRED` (401 + `WWW-Authenticate`).

**Ownership.** Every run/output/edit/export read checks `user_id` on the row (admins/devs excepted). Upload paths are `<uid>/run-inputs/mcp/…` in the private bucket; attach refuses paths outside the caller's prefix; signed URLs expire (uploads 2 h, previews/downloads 1 h).

**Credits.** Cost is computed server-side from the template's real output count and creator surcharge; client numbers are never trusted. The charge itself happens in the unchanged `start-template-run`, called as the user (OAuth token forwarded; for API keys a short-lived session for the key's owner is minted via magic-link hash and revoked after the call).

**Confirmation.** `fuse_prepare_campaign_run` issues an HMAC-SHA256 token (secret in `service_config.mcp_signing_secret`) bound to user, version, attached inputs, output mode, cost; 15-minute TTL. `fuse_start_campaign_run` refuses without it, on mismatch, or after expiry. One token = one run.

**Idempotency.** `mcp_run_requests` is claimed (unique `user_id+idempotency_key` and unique `confirmation_hash`) *before* the runner is called; retries return the existing run. Upload sessions and exports accept `idempotency_key` too. Renames/edits are naturally idempotent (revision-checked RPC).

**Files.** Types are sniffed from bytes (PNG/JPEG/WEBP/MP4/MOV/WEBM only), 12 MB images / 60 MB video, filenames sanitised; URL ingestion is https-only, blocks localhost/IP/internal hosts, caps size. Base64 payloads are not accepted.

**Prompt injection.** File names, template text and user strings are data. Tool policy (confirmation, scopes, ownership) is enforced in code, not by the model. Campaign names strip `<>{}\`.

**Transport.** HTTPS only; `Origin` validated (absent = non-browser client; otherwise allowlist); no sessions/SSE; unsupported `MCP-Protocol-Version` → 400.

**Logging.** `mcp_tool_calls` (tool, surface, client, auth kind, user, key, template, run, credits, ok, error code, latency, idempotency key) + `api_key_usage`. Never logged: file bytes, signed URLs, tokens, keys, provider secrets. Errors to callers are code + user-safe message; stack traces stay in function logs.

**Not exposed.** Internal prompts, node graphs, provider ids, admin tools, other users' data, Stripe/payment details.
