/**
 * brand-import — DETERMINISTIC storefront reader.
 *
 * Reads a PUBLIC web page (and, for Shopify, the PUBLIC /products.json feed) and
 * returns extraction CANDIDATES only. It never calls an AI model, never invents
 * data, and NEVER writes to the database — persistence happens later, in the
 * onboarding autosave, after the user approves the import.
 */

import { corsHeaders, errorMessage, json } from "../_shared/supabase-admin.ts";
import {
  extractFromHtml,
  extractStorefrontProducts,
  mapShopifyProduct,
  normalizeTargetUrl,
  type BrandImportProduct,
} from "../_shared/brand-import.ts";

const FETCH_TIMEOUT_MS = 8000;
const UA = "Mozilla/5.0 (compatible; FUSE-BrandImport/1.0; +https://fuse-us.com)";
const PRODUCT_PAGES = 3;
const PRODUCTS_PER_PAGE = 50;

async function fetchText(url: string, accept: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: accept },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = response.ok ? await response.text() : "";
    return { ok: response.ok, status: response.status, contentType, body, finalUrl: response.url };
  } finally {
    clearTimeout(timer);
  }
}

async function loadShopifyProducts(base: URL): Promise<BrandImportProduct[]> {
  const products: BrandImportProduct[] = [];
  for (let page = 1; page <= PRODUCT_PAGES; page += 1) {
    let payload: unknown;
    try {
      const feed = await fetchText(
        new URL(`/products.json?limit=${PRODUCTS_PER_PAGE}&page=${page}`, base).toString(),
        "application/json",
      );
      if (!feed.ok || !feed.contentType.includes("json")) break;
      payload = JSON.parse(feed.body);
    } catch {
      break;
    }
    const list = (payload as { products?: unknown })?.products;
    if (!Array.isArray(list) || list.length === 0) break;
    for (const entry of list) {
      const mapped = mapShopifyProduct((entry ?? {}) as Record<string, unknown>, base);
      if (mapped) products.push(mapped);
    }
    if (list.length < PRODUCTS_PER_PAGE) break;
  }
  return products;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    const normalized = normalizeTargetUrl((payload as { url?: unknown })?.url);
    if ("error" in normalized) return json({ ok: false, reason: normalized.error }, 200);
    const target = normalized.url;

    let page: Awaited<ReturnType<typeof fetchText>>;
    try {
      page = await fetchText(target.toString(), "text/html,application/xhtml+xml");
    } catch {
      return json({ ok: false, reason: "We couldn't reach that website." }, 200);
    }

    if (!page.ok) {
      return json(
        { ok: false, reason: `That website returned an error (${page.status}).` },
        200,
      );
    }
    if (!page.contentType.includes("html") || page.body.trim().length < 40) {
      return json({ ok: false, reason: "That address didn't return a web page." }, 200);
    }

    const base = new URL(page.finalUrl || target.toString());
    const extracted = extractFromHtml(page.body, base);

    let source: "shopify" | "storefront" = extracted.shopify ? "shopify" : "storefront";
    let products = source === "shopify" ? await loadShopifyProducts(base) : [];

    // A storefront that is not obviously Shopify can still expose products.json.
    if (source === "storefront") {
      const probe = await loadShopifyProducts(base);
      if (probe.length) {
        source = "shopify";
        products = probe;
      } else {
        products = extractStorefrontProducts(page.body, base);
      }
    }

    return json({
      ok: true,
      source,
      url: base.origin,
      domain: base.hostname.replace(/^www\./, ""),
      storeName: extracted.storeName,
      description: extracted.description,
      faviconUrl: extracted.faviconUrl,
      logoCandidates: extracted.logoCandidates,
      colorCandidates: extracted.colorCandidates,
      products: products.slice(0, 120),
      counts: {
        logos: extracted.logoCandidates.length,
        colors: extracted.colorCandidates.length,
        products: Math.min(products.length, 120),
      },
    });
  } catch (error) {
    console.error("brand-import failed:", errorMessage(error).slice(0, 500));
    return json({ ok: false, reason: "We couldn't read this store." }, 200);
  }
});
