import type { ApiTemplate } from "@/services/fuseApi";
import { sortTemplatesForStudio } from "@/lib/templateOrdering";
import { formatCampaignOutputs } from "@/lib/campaignOutputs";


/** Curated existing media only — nothing is generated for the homepage. */
export const CURATED_PREVIEW_GIFS: Array<{ match: RegExp; src: string }> = [
  { match: /ugc\s*mirror/i, src: "/template-previews/ugc-mirror.gif" },
  { match: /paparazzi/i, src: "/template-previews/paparazzi.gif" },
  { match: /unboxing/i, src: "/template-previews/unboxing.gif" },
  { match: /amazon|delivery/i, src: "/template-previews/amazon-guy.gif" },
  { match: /armored/i, src: "/template-previews/armored-truck.gif" },
  { match: /blue\s*lab/i, src: "/template-previews/blue-lab.gif" },
  { match: /doctor/i, src: "/template-previews/doctor.gif" },
  { match: /garage/i, src: "/template-previews/garage.gif" },
  { match: /jeans/i, src: "/template-previews/jeans.gif" },
  { match: /raven/i, src: "/template-previews/raven.gif" },
  { match: /skate/i, src: "/template-previews/skatepark.gif" },
];

export const FALLBACK_GIFS = CURATED_PREVIEW_GIFS.map((entry) => entry.src);

/** Curated brand/product INPUT assets (never campaign previews). */
export const BRAND_INPUT_ASSETS = [
  "/template-placeholders/shirt.jpeg",
  "/template-placeholders/pants.jpeg",
  "/template-placeholders/chain.png",
  "/template-placeholders/logo.png",
];

/** Dedicated hero campaigns — not simply the first marketplace items. */
const HERO_TEMPLATE_MATCHERS = [/paparazzi/i, /desert|armored/i, /jewel|chain|night/i];

export type TemplateMedia = { url: string; type: "image" | "video" };
export type Entry = { template: ApiTemplate; media: TemplateMedia };

export type HomeAllocation = {
  hero: Entry[];
  trending: Entry[];
  newToday: Entry[];
  creatorDrops: Entry[];
  categories: Array<{ title: string; entries: Entry[] }>;
  mediaWall: string[];
  manifest: {
    sections: Record<string, number>;
    duplicates: number;
    totalUnique: number;
  };
};

function curatedGifFor(name: string) {
  return CURATED_PREVIEW_GIFS.find((entry) => entry.match.test(name))?.src ?? null;
}

export function resolveMedia(template: ApiTemplate): TemplateMedia | null {
  if (template.preview_url) {
    const isVideo =
      template.preview_asset_type === "video" ||
      /\.(mp4|mov|webm)(\?|$)/i.test(template.preview_url);
    return { url: template.preview_url, type: isVideo ? "video" : "image" };
  }
  const gif = curatedGifFor(template.name);
  return gif ? { url: gif, type: "image" } : null;
}

export function outputCount(template: ApiTemplate) {
  return (template.counts?.imageOutputs ?? 0) + (template.counts?.videoOutputs ?? 0);
}

export function outputLabel(template: ApiTemplate) {
  const total = outputCount(template);
  if (total <= 0) return null;
  return formatCampaignOutputs(template.counts);
}


function isRecent(template: ApiTemplate, days = 21) {
  if (!template.created_at) return false;
  const created = new Date(template.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

const CATEGORY_SHELVES: Array<{ title: string; match: RegExp }> = [
  { title: "Streetwear", match: /street|apparel|outfit|garment|fashion/i },
  { title: "Jewelry", match: /jewel|chain|diamond|ice/i },
  { title: "Artist", match: /artist|music|rap|album/i },
  { title: "Product", match: /product|packshot|ecom|unbox/i },
  { title: "Cinematic", match: /cinema|film|cinematic|trailer/i },
];

function matchesCategory(template: ApiTemplate, match: RegExp) {
  const haystack = [template.category ?? "", ...(template.tags ?? [])].join(" ");
  return match.test(haystack);
}

function normalizeUrl(url: string) {
  return url.split("?")[0].trim().toLowerCase();
}

/**
 * Single homepage selection pipeline. Every section draws from here so a
 * template id / preview media / campaign id can appear at most once.
 */
export function allocateHomeMedia(templates: ApiTemplate[]): HomeAllocation {
  const usedTemplateIds = new Set<string>();
  const usedPreviewUrls = new Set<string>();
  const usedCampaignIds = new Set<string>();
  let duplicates = 0;

  const pool: Entry[] = [];
  for (const template of sortTemplatesForStudio(templates)) {
    const media = resolveMedia(template);
    if (!media) continue;
    const nameKey = template.name.trim().toLowerCase();
    if (pool.some((entry) => entry.template.name.trim().toLowerCase() === nameKey)) {
      duplicates += 1;
      continue;
    }
    pool.push({ template, media });
  }

  const keysFor = (entry: Entry) => ({
    id: String(entry.template.id ?? entry.template.templateId ?? entry.template.name),
    url: normalizeUrl(entry.media.url),
    campaign: String(entry.template.templateId ?? entry.template.versionId ?? ""),
  });

  const isUsed = (entry: Entry) => {
    const { id, url, campaign } = keysFor(entry);
    return (
      usedTemplateIds.has(id) ||
      usedPreviewUrls.has(url) ||
      (campaign ? usedCampaignIds.has(campaign) : false)
    );
  };

  const claim = (entry: Entry) => {
    const { id, url, campaign } = keysFor(entry);
    usedTemplateIds.add(id);
    usedPreviewUrls.add(url);
    if (campaign) usedCampaignIds.add(campaign);
  };

  /** Take up to `limit` unclaimed entries, never repeating to fill a row. */
  const take = (candidates: Entry[], limit: number) => {
    const picked: Entry[] = [];
    for (const entry of candidates) {
      if (picked.length >= limit) break;
      if (isUsed(entry)) continue;
      claim(entry);
      picked.push(entry);
    }
    return picked;
  };

  // HERO — dedicated curated set first, then fall back to remaining inventory.
  const heroCandidates: Entry[] = [];
  for (const matcher of HERO_TEMPLATE_MATCHERS) {
    const found = pool.find(
      (entry) => matcher.test(entry.template.name) && !heroCandidates.includes(entry),
    );
    if (found) heroCandidates.push(found);
  }
  const hero = take([...heroCandidates, ...pool], 2);

  const trending = take(pool, 10);

  const recent = pool
    .filter((entry) => isRecent(entry.template))
    .sort(
      (a, b) =>
        new Date(b.template.created_at ?? 0).getTime() -
        new Date(a.template.created_at ?? 0).getTime(),
    );
  const newToday = take(recent, 8);

  const creatorDrops = take(pool, 6);

  const categories = CATEGORY_SHELVES.map((shelf) => ({
    title: shelf.title,
    entries: take(
      pool.filter((entry) => matchesCategory(entry.template, shelf.match)),
      8,
    ),
  })).filter((shelf) => shelf.entries.length >= 2);

  const mediaWall = Array.from(
    new Set(
      pool
        .filter((entry) => entry.media.type === "image")
        .map((entry) => entry.media.url)
        .concat(FALLBACK_GIFS),
    ),
  ).slice(0, 12);

  const sections: Record<string, number> = {
    hero: hero.length,
    trending: trending.length,
    newToday: newToday.length,
    creatorDrops: creatorDrops.length,
  };
  for (const shelf of categories) sections[`category:${shelf.title}`] = shelf.entries.length;

  return {
    hero,
    trending,
    newToday,
    creatorDrops,
    categories,
    mediaWall,
    manifest: { sections, duplicates, totalUnique: usedTemplateIds.size },
  };
}
