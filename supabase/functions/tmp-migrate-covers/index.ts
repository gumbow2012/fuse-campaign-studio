// Decommissioned one-off migration function. Retained only as a 410 tombstone
// until it can be fully de-registered via the Supabase CLI/dashboard.
Deno.serve(() => new Response(
  JSON.stringify({ error: "gone", detail: "tmp-migrate-covers has been decommissioned" }),
  { status: 410, headers: { "content-type": "application/json" } },
));
