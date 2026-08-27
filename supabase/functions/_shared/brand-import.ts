/**
 * Deterministic brand/storefront extraction helpers.
 *
 * NO AI. NO invention. Everything returned here is parsed straight out of the
 * fetched HTML / headers / public Shopify JSON. Pure functions only so they can
 * be unit-tested without network access.
 */

export interface BrandImportProduct {
  title: string;
  type: string;
  imageUrl: string | null;
  url: string | null;
}

export interface BrandImportResult {
  ok: true;
  source: "shopify" | "storefront";
  url: string;
  domain: string;
  storeName: string;
  description: string;
  faviconUrl: string | null;
  logoCandidates: string[];
  colorCandidates: string[];
  products: BrandImportProduct[];
  counts: { logos: number; colors: number; products: number };
}

export interface BrandImportFailure {
  ok: false;
  reason: string;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|\[?::1\]?)$/i;
const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Normalizes user input to an https URL and rejects anything unsafe. */
export function normalizeTargetUrl(raw: unknown): { url: URL } | { error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { error: "Enter a website URL." };
  if (value.length > 2048) return { error: "That URL is too long." };

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "That doesn't look like a valid website URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http and https addresses can be imported." };
  }
  // Always attempt over TLS.
  url.protocol = "https:";
  url.hash = "";

  const host = url.hostname.toLowerCase();
  if (!host || !host.includes(".") || host.endsWith(".")) {
    return { error: "That doesn't look like a valid domain." };
  }
  if (PRIVATE_HOST.test(host)) return { error: "That address can't be imported." };
  if (IPV4.test(host) || host.includes(":")) {
    return { error: "IP addresses can't be imported — use your store's domain." };
  }
  return { url };
}

function absolutize(value: string | null | undefined, base: URL): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) return null;
  try {
    const resolved = new URL(raw, base);
    // Keep candidates https so they render inside the app without mixed content.
    if (resolved.protocol === "http:") resolved.protocol = "https:";
    return resolved.toString();
  } catch {
    return null;
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
}

function metaTags(html: string): string[] {
  return html.match(/<meta\b[^>]*>/gi) ?? [];
}

function readMeta(html: string, keys: string[]): string | null {
  const tags = metaTags(html);
  for (const key of keys) {
    for (const tag of tags) {
      const name = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
      if (name === key.toLowerCase()) {
        const content = attr(tag, "content");
        if (content) return content;
      }
    }
  }
  return null;
}

function linkTags(html: string): string[] {
  return html.match(/<link\b[^>]*>/gi) ?? [];
}

function readIcons(html: string, base: URL) {
  let favicon: string | null = null;
  let appleIcon: string | null = null;
  for (const tag of linkTags(html)) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = absolutize(attr(tag, "href"), base);
    if (!href) continue;
    if (!appleIcon && rel.includes("apple-touch-icon")) appleIcon = href;
    if (!favicon && (rel === "icon" || rel.includes("shortcut icon") || rel.includes("icon"))) {
      if (!rel.includes("apple")) favicon = href;
    }
  }
  return { favicon: favicon ?? absolutize("/favicon.ico", base), appleIcon };
}

/** Header <img> tags whose src/alt/class mentions "logo". */
function logoImages(html: string, base: URL): string[] {
  const headMatch = html.match(/<header\b[\s\S]{0,20000}?<\/header>/i);
  const scopes = [headMatch?.[0] ?? "", html.slice(0, 40000)];
  const out: string[] = [];
  for (const scope of scopes) {
    for (const tag of scope.match(/<img\b[^>]*>/gi) ?? []) {
      const haystack = [attr(tag, "src"), attr(tag, "alt"), attr(tag, "class"), attr(tag, "id")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes("logo")) continue;
      const src = absolutize(attr(tag, "src") ?? attr(tag, "data-src"), base);
      if (src) out.push(src);
    }
  }
  return out;
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().toLowerCase();
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!match) return null;
  const hex = match[1];
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return `#${full}`;
}

/** theme-color meta + hex values that appear in inline styles / style blocks. */
export function extractColorCandidates(html: string): string[] {
  const out: string[] = [];
  const push = (value: string | null) => {
    const hex = value ? normalizeHex(value) : null;
    if (hex && !out.includes(hex) && hex !== "#ffffff" && hex !== "#000000") out.push(hex);
  };

  push(readMeta(html, ["theme-color", "msapplication-TileColor"]));

  const scoped = html.match(/(--[a-z0-9-]*(?:brand|primary|accent|theme)[a-z0-9-]*\s*:\s*#[0-9a-fA-F]{3,6})/g) ?? [];
  for (const entry of scoped) push(entry.split(":")[1]);

  const styles = (html.match(/style\s*=\s*("[^"]*"|'[^']*')/gi) ?? []).join(" ");
  const blocks = (html.match(/<style\b[^>]*>[\s\S]{0,40000}?<\/style>/gi) ?? []).join(" ");
  for (const hex of `${styles} ${blocks}`.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
    if (out.length >= 8) break;
    push(hex);
  }
  return out.slice(0, 8);
}

export function isShopifyHtml(html: string): boolean {
  return /cdn\.shopify\.com|Shopify\.theme|shopify-features|myshopify\.com|shopify-section/i.test(html);
}

/** Deterministic parse of a fetched HTML document. */
export function extractFromHtml(html: string, base: URL) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  const storeName =
    readMeta(html, ["og:site_name"]) ||
    (titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, " ")).split(/\s+[|–—-]\s+/)[0] : "") ||
    readMeta(html, ["apple-mobile-web-app-title"]) ||
    base.hostname.replace(/^www\./, "");

  const description = readMeta(html, ["description", "og:description"]) ?? "";
  const { favicon, appleIcon } = readIcons(html, base);
  const ogImage = absolutize(readMeta(html, ["og:image", "og:image:secure_url"]), base);

  const logoCandidates: string[] = [];
  for (const candidate of [...logoImages(html, base), ogImage, appleIcon, favicon]) {
    if (candidate && !logoCandidates.includes(candidate)) logoCandidates.push(candidate);
  }

  return {
    storeName: storeName.slice(0, 120),
    description: description.slice(0, 400),
    faviconUrl: favicon,
    logoCandidates: logoCandidates.slice(0, 8),
    colorCandidates: extractColorCandidates(html),
    shopify: isShopifyHtml(html),
  };
}

/** Best-effort product extraction for non-Shopify storefronts. Never fabricates. */
export function extractStorefrontProducts(html: string, base: URL): BrandImportProduct[] {
  const type = readMeta(html, ["og:type"])?.toLowerCase() ?? "";
  if (!type.includes("product")) return [];
  const title = readMeta(html, ["og:title"]) ?? "";
  if (!title) return [];
  return [
    {
      title: title.slice(0, 160),
      type: readMeta(html, ["product:category"]) ?? "",
      imageUrl: absolutize(readMeta(html, ["og:image"]), base),
      url: absolutize(readMeta(html, ["og:url"]), base) ?? base.toString(),
    },
  ];
}

/** Maps one entry of the public Shopify products.json payload. */
export function mapShopifyProduct(entry: Record<string, unknown>, base: URL): BrandImportProduct | null {
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  if (!title) return null;
  const images = Array.isArray(entry.images) ? entry.images : [];
  const first = (images[0] ?? {}) as Record<string, unknown>;
  const imageSrc =
    typeof first.src === "string"
      ? first.src
      : typeof (entry.image as Record<string, unknown> | undefined)?.src === "string"
        ? String((entry.image as Record<string, unknown>).src)
        : null;
  const handle = typeof entry.handle === "string" ? entry.handle : "";
  return {
    title: title.slice(0, 160),
    type: typeof entry.product_type === "string" ? entry.product_type : "",
    imageUrl: absolutize(imageSrc, base),
    url: handle ? absolutize(`/products/${handle}`, base) : null,
  };
}
