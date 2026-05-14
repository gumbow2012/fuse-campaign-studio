#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://ykrrwgkxgidoavtzcumk.supabase.co";
const BILLING_SMOKE_SECRET = process.env.BILLING_SMOKE_SECRET ?? "";
const PACK_KEY = process.env.PACK_KEY ?? "boost";
const CLEANUP = process.env.CLEANUP === "true";
const OUTPUT_PATH = path.resolve(process.env.OUTPUT_PATH ?? "tmp/billing-credit-pack-smoke-report.json");

if (!BILLING_SMOKE_SECRET) {
  console.error("BILLING_SMOKE_SECRET is required");
  process.exit(1);
}

const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-credit-pack-smoke`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-billing-smoke-secret": BILLING_SMOKE_SECRET,
  },
  body: JSON.stringify({
    packKey: PACK_KEY,
    cleanup: CLEANUP,
  }),
});

const text = await response.text();
let json;
try {
  json = text ? JSON.parse(text) : null;
} catch {
  json = { raw: text };
}

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(json, null, 2)}\n`, "utf8");

console.log(`Status: ${response.status}`);
console.log(`Report: ${OUTPUT_PATH}`);
console.log(JSON.stringify(json, null, 2));

if (!response.ok) {
  process.exit(1);
}
