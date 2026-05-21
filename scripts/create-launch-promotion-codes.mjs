#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

const launchCodes = [
  {
    code: "ACCESS19",
    couponId: "fuse_launch_access19_once_100",
    couponName: "FUSE launch access - 100% off first payment",
    percentOff: 100,
    maxRedemptions: 5,
  },
  {
    code: "LAUNCH30",
    couponId: "fuse_launch30_once_30",
    couponName: "FUSE launch - 30% off first payment",
    percentOff: 30,
  },
];

function readDotEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function env(name) {
  if (process.env[name]) return process.env[name];
  const local = readDotEnv(resolve(process.cwd(), ".env.local"));
  if (local[name]) return local[name];
  const root = readDotEnv(resolve(process.cwd(), ".env"));
  return root[name];
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has("--apply"),
    mode: args.has("--test") ? "test" : "live",
  };
}

function keyForMode(mode) {
  if (mode === "test") return env("STRIPE_SECRET_KEY_TEST") || env("STRIPE_SECRET_KEY");
  return env("STRIPE_SECRET_KEY_LIVE") || env("STRIPE_SECRET_KEY");
}

async function stripeRequest(method, path, params, key) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : new URLSearchParams(params),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Stripe request failed: ${method} ${path}`);
  }
  return data;
}

async function findPromotionCode(code, key) {
  const query = new URLSearchParams({ code, active: "true", limit: "1" });
  const result = await stripeRequest("GET", `/promotion_codes?${query.toString()}`, {}, key);
  return result.data?.[0] ?? null;
}

async function ensureCoupon(config, key) {
  try {
    return await stripeRequest("GET", `/coupons/${encodeURIComponent(config.couponId)}`, {}, key);
  } catch (error) {
    if (!String(error.message).includes("No such coupon")) throw error;
  }

  return await stripeRequest("POST", "/coupons", {
    id: config.couponId,
    name: config.couponName,
    duration: "once",
    percent_off: String(config.percentOff),
    "metadata[source]": "fuse_launch",
    "metadata[code]": config.code,
  }, key);
}

async function ensurePromotionCode(config, key) {
  const existing = await findPromotionCode(config.code, key);
  if (existing) return { promotionCode: existing, created: false };

  const coupon = await ensureCoupon(config, key);
  const params = {
    coupon: coupon.id,
    code: config.code,
    active: "true",
    "metadata[source]": "fuse_launch",
  };
  if (config.maxRedemptions) params.max_redemptions = String(config.maxRedemptions);

  const promotionCode = await stripeRequest("POST", "/promotion_codes", params, key);
  return { promotionCode, created: true };
}

async function main() {
  const { apply, mode } = parseArgs();

  if (!apply) {
    console.log("Dry run. Re-run with --apply to create/update Stripe promotion codes.");
    console.table(launchCodes.map(({ code, percentOff, maxRedemptions }) => ({
      code,
      percentOff,
      maxRedemptions: maxRedemptions ?? "unlimited",
      duration: "first payment only",
    })));
    return;
  }

  const key = keyForMode(mode);
  if (!key) throw new Error(`Missing Stripe ${mode} secret key.`);

  for (const config of launchCodes) {
    const { promotionCode, created } = await ensurePromotionCode(config, key);
    console.log(`${created ? "created" : "exists"} ${config.code}: ${promotionCode.id}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
