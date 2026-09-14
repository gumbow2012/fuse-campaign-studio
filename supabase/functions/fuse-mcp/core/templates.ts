/**
 * Templates: the public catalog as an AI client should see it.
 * Same visibility rule as the web catalog: a template is public when its active,
 * non-fork version has review_status = 'Approved' (plus template_ai_metadata.visibility).
 * Counts, inputs and credits come from the same shared helpers the web app uses.
 */
import { buildTemplateInputPlan } from "../../_shared/template-inputs.ts";
import { countTemplateDeliverables, getTemplateCreditCost } from "../../_shared/template-pricing.ts";
import { resolveDisplayUrl } from "../../_shared/asset-access.ts";
import type { Admin } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { campaignsPerMonth, planRequiredFor } from "./pricing.ts";

export type TemplateInput = { key: string; label: string; expected: string; required: boolean };

export type TemplateSummary = {
  template_id: string;
  slug: string;
  name: string;
  short_description: string;
  product_types_supported: string[];
  industries: string[];
  use_cases: string[];
  style_tags: string[];
  outputs: { images_count: number; clips_count: number };
  aspect_ratio: string;
  estimated_credits: number;
  plan_required: "starter" | "pro" | "studio";
  included_in_starter: boolean;
  preview_image_url: string | null;
  preview_video_url: string | null;
  public_url: string;
  creator: { name: string; handle: string | null } | null;
};

export type TemplateDetail = TemplateSummary & {
  long_description: string | null;
  version_id: string;
  what_user_uploads: string[];
  what_user_gets: string[];
  required_inputs: TemplateInput[];
  optional_inputs: TemplateInput[];
  sample_outputs: Array<{ type: "image" | "video"; url: string | null; poster_url: string | null; label: string | null }>;
  before_after_examples: [];
  cta: { signed_out: string; signed_in: string };
};

const SITE = "https://fuse-us.com";
const INTERNAL_NAME = /swap\s*frame|approved|reference\s*frame|\bframe\s*\d|\bframe\b/i;
const PLACEHOLDER = /^(new\s*input|input|untitled|node|slot|reference)\s*\d*$/i;
const RATIOS = new Set(["9:16", "16:9", "1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "5:4", "21:9"]);

function friendlyLabel(name: string): string {
  const raw = String(name ?? "").trim();
  const parts = raw.split("·");
  const s = (parts.length > 1 ? parts[parts.length - 1] : raw)
    .replace(/^\s*(product\s+reference|reference|input|ref)\s*\d*\s*[:\-]?\s*/i, "").trim();
  if (!s || PLACEHOLDER.test(s) || PLACEHOLDER.test(raw)) return "Product photo";
  return s;
}

function titleCase(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "Campaign";
  if (s === s.toUpperCase()) return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return s;
}

type Row = {
  id: string; slug: string | null; name: string; description: string | null; preview_url: string | null;
  preview_asset_type: string | null; created_by: string | null; monetization_enabled: boolean | null;
  free_preview_enabled: boolean | null;
};

type LoadedTemplate = {
  row: Row;
  versionId: string;
  nodes: any[];
  edges: any[];
  meta: any | null;
  creator: { name: string; handle: string | null } | null;
};

/** Load every public template (or one by slug/id). Privileged callers also see unapproved ones. */
async function loadTemplates(admin: Admin, opts: { slug?: string; id?: string; privileged?: boolean }): Promise<LoadedTemplate[]> {
  let versions = admin
    .from("template_versions")
    .select("id, template_id, review_status, cast_config")
    .eq("is_active", true)
    .is("fork_id", null);
  if (!opts.privileged) versions = versions.eq("review_status", "Approved");
  const { data: versionRows, error } = await versions;
  if (error) throw new FuseError("INTERNAL", error.message);
  const byTemplate = new Map<string, any>();
  for (const v of versionRows ?? []) byTemplate.set(v.template_id, v);
  if (!byTemplate.size) return [];

  let tq = admin
    .from("fuse_templates")
    .select("id, slug, name, description, preview_url, preview_asset_type, created_by, monetization_enabled, free_preview_enabled")
    .in("id", [...byTemplate.keys()]);
  if (opts.slug) tq = tq.eq("slug", opts.slug);
  if (opts.id) tq = tq.eq("id", opts.id);
  const { data: templates } = await tq;
  const rows = (templates ?? []) as Row[];
  if (!rows.length) return [];

  const versionIds = rows.map((r) => byTemplate.get(r.id).id);
  const [{ data: nodes }, { data: edges }, { data: metas }] = await Promise.all([
    admin.from("nodes").select("id, version_id, name, node_type, prompt_config").in("version_id", versionIds),
    admin.from("edges").select("version_id, source_node_id, target_node_id").in("version_id", versionIds),
    admin.from("template_ai_metadata").select("*").in("template_id", rows.map((r) => r.id)),
  ]);
  const metaById = new Map((metas ?? []).map((m: any) => [m.template_id, m]));

  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const creatorById = new Map<string, { name: string; handle: string | null }>();
  if (creatorIds.length) {
    const { data: profiles } = await admin
      .from("creator_profiles")
      .select("user_id, handle, display_name, is_public")
      .in("user_id", creatorIds);
    for (const p of profiles ?? []) {
      if ((p as any).is_public === false) continue;
      creatorById.set((p as any).user_id, { name: (p as any).display_name ?? (p as any).handle ?? "Creator", handle: (p as any).handle ?? null });
    }
  }

  return rows
    .filter((r) => (metaById.get(r.id)?.visibility ?? "public") === "public" || opts.privileged)
    .map((r) => {
      const v = byTemplate.get(r.id);
      return {
        row: r,
        versionId: v.id,
        nodes: (nodes ?? []).filter((n: any) => n.version_id === v.id),
        edges: (edges ?? []).filter((e: any) => e.version_id === v.id),
        meta: metaById.get(r.id) ?? null,
        creator: r.created_by ? creatorById.get(r.created_by) ?? null : null,
      };
    });
}

function deliverables(t: LoadedTemplate) {
  const targets = new Set(t.edges.map((e: any) => e.target_node_id));
  const exec = t.nodes.filter((n: any) => n.node_type !== "user_input" && n.node_type !== "prompt" && targets.has(n.id));
  const counts = countTemplateDeliverables(exec);
  const ratioCounts: Record<string, number> = {};
  for (const n of exec) {
    if (n.node_type !== "video_gen") continue;
    const r = String(n.prompt_config?.aspect_ratio ?? "").trim();
    if (RATIOS.has(r)) ratioCounts[r] = (ratioCounts[r] ?? 0) + 1;
  }
  const ranked = Object.entries(ratioCounts).sort((a, b) => b[1] - a[1]);
  return { counts, aspect: ranked[0]?.[0] ?? "9:16" };
}

export function inputsFor(t: LoadedTemplate): { required: TemplateInput[]; optional: TemplateInput[]; slotKeys: string[] } {
  const inputNodes = t.nodes.filter((n: any) => n.node_type === "user_input");
  const plan = buildTemplateInputPlan(t.row.name, inputNodes);
  const required: TemplateInput[] = [];
  const optional: TemplateInput[] = [];
  const labelCounts: Record<string, number> = {};
  const all = plan.slots
    .filter((slot) => !INTERNAL_NAME.test(slot.name))
    .map((slot) => {
      const node = inputNodes.find((n: any) => slot.nodeIds.includes(n.id));
      const cfg = node?.prompt_config ?? {};
      return {
        key: slot.id,
        label: friendlyLabel(String(cfg.editor_label ?? slot.name)),
        expected: String(slot.expected ?? cfg.expected ?? "image"),
        required: cfg.required !== false,
      };
    });
  for (const i of all) labelCounts[i.label] = (labelCounts[i.label] ?? 0) + 1;
  const seen: Record<string, number> = {};
  for (const i of all) {
    if (labelCounts[i.label] > 1) {
      seen[i.label] = (seen[i.label] ?? 0) + 1;
      i.label = `${i.label} ${seen[i.label]}`;
    }
    (i.required ? required : optional).push(i);
  }
  return { required, optional, slotKeys: all.map((i) => i.key) };
}

async function toSummary(admin: Admin, t: LoadedTemplate): Promise<TemplateSummary> {
  const { counts, aspect } = deliverables(t);
  const credits = getTemplateCreditCost(t.row.name, counts);
  const plan = planRequiredFor(credits);
  const meta = t.meta;
  const previewUrl = await resolveDisplayUrl(admin, t.row.preview_url);
  const isVideo = t.row.preview_asset_type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(t.row.preview_url ?? "");
  return {
    template_id: t.row.id,
    slug: t.row.slug ?? t.row.id,
    name: meta?.public_name ?? titleCase(t.row.name),
    short_description: meta?.one_sentence_description ?? `Turn your product into a ${titleCase(t.row.name)} campaign with images and short clips.`,
    product_types_supported: meta?.product_types ?? [],
    industries: meta?.industries ?? [],
    use_cases: meta?.use_cases ?? [],
    style_tags: meta?.style_tags ?? [],
    outputs: { images_count: counts.imageOutputs, clips_count: counts.videoOutputs },
    aspect_ratio: aspect,
    estimated_credits: credits,
    plan_required: plan,
    included_in_starter: plan === "starter",
    preview_image_url: isVideo ? null : previewUrl,
    preview_video_url: isVideo ? previewUrl : null,
    public_url: `${SITE}/templates/${t.row.slug ?? t.row.id}`,
    creator: t.creator,
  };
}

export async function listPublicTemplates(admin: Admin, privileged = false): Promise<TemplateSummary[]> {
  const loaded = await loadTemplates(admin, { privileged });
  const out: TemplateSummary[] = [];
  for (const t of loaded) out.push(await toSummary(admin, t));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadTemplate(admin: Admin, ref: { slug?: string; id?: string }, privileged = false): Promise<LoadedTemplate> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const slug = ref.slug?.trim();
  const id = ref.id?.trim() ?? (slug && isUuid.test(slug) ? slug : undefined);
  const [t] = await loadTemplates(admin, id ? { id, privileged } : { slug: slug?.toLowerCase(), privileged });
  if (!t) {
    throw new FuseError("TEMPLATE_NOT_FOUND", `No public template for ${slug ?? id}`, {
      nextAction: "Call fuse_search_templates to find the right campaign.",
    });
  }
  return t;
}

export async function getTemplateDetail(admin: Admin, ref: { slug?: string; id?: string }, privileged = false): Promise<TemplateDetail> {
  const t = await loadTemplate(admin, ref, privileged);
  const summary = await toSummary(admin, t);
  const { required, optional } = inputsFor(t);
  const { data: media } = await admin
    .from("template_preview_media")
    .select("media_type, source_path, poster_path, label, is_primary, sort_order")
    .eq("template_id", t.row.id)
    .eq("published", true)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(6);
  const sample_outputs = [];
  for (const m of media ?? []) {
    sample_outputs.push({
      type: (m as any).media_type === "video" ? "video" as const : "image" as const,
      url: await resolveDisplayUrl(admin, (m as any).source_path),
      poster_url: await resolveDisplayUrl(admin, (m as any).poster_path),
      label: (m as any).label ?? null,
    });
  }
  const gets = [
    summary.outputs.images_count ? `${summary.outputs.images_count} campaign image${summary.outputs.images_count === 1 ? "" : "s"}` : null,
    summary.outputs.clips_count ? `${summary.outputs.clips_count} short clip${summary.outputs.clips_count === 1 ? "" : "s"}` : null,
    "Ready for ads, socials, and launch pages",
  ].filter(Boolean) as string[];
  return {
    ...summary,
    long_description: t.meta?.long_description ?? null,
    version_id: t.versionId,
    what_user_uploads: required.map((i) => i.label),
    what_user_gets: gets,
    required_inputs: required,
    optional_inputs: optional,
    sample_outputs,
    before_after_examples: [],
    cta: {
      signed_out: `Start with this campaign — Starter includes about ${campaignsPerMonth("starter")} campaigns a month.`,
      signed_in: "Upload your product photo and generate this campaign.",
    },
  };
}

/** Plain keyword scoring over the clean metadata. No embeddings, no invention. */
export function scoreTemplate(t: TemplateSummary, q: {
  query?: string; category?: string; product_type?: string; output_type?: string; style?: string; industry?: string; plan?: string;
}): { score: number; reason: string } {
  const hay = [t.name, t.short_description, ...t.product_types_supported, ...t.industries, ...t.use_cases, ...t.style_tags]
    .join(" ").toLowerCase();
  const terms = new Set<string>();
  for (const s of [q.query, q.category, q.product_type, q.style, q.industry]) {
    for (const w of String(s ?? "").toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) terms.add(w);
  }
  const STOP = new Set(["the", "and", "for", "with", "campaign", "template", "templates", "find", "show", "need", "want", "make", "some", "something", "drop", "brand"]);
  let score = 0;
  const hits: string[] = [];
  for (const w of terms) {
    if (STOP.has(w)) continue;
    const stem = w.replace(/(ies|s|es)$/, "");
    if (hay.includes(w) || (stem.length > 3 && hay.includes(stem))) {
      score += t.name.toLowerCase().includes(w) ? 3 : 1;
      hits.push(w);
    }
  }
  if (q.output_type === "video" && t.outputs.clips_count > 0) score += 1;
  if (q.output_type === "images" && t.outputs.images_count > 0) score += 1;
  if (q.output_type === "video" && t.outputs.clips_count === 0) score -= 5;
  if (q.output_type === "images" && t.outputs.images_count === 0) score -= 5;
  if (q.plan === "starter" && !t.included_in_starter) score -= 5;
  const reason = hits.length
    ? `Matches ${hits.slice(0, 4).join(", ")}`
    : `No direct keyword match; shown because it makes ${t.outputs.images_count} images + ${t.outputs.clips_count} clips`;
  return { score, reason };
}
