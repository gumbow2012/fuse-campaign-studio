/**
 * The single tool registry. MCP `tools/list`/`tools/call`, the REST routes and
 * the OpenAPI document are all generated from these definitions, so there is
 * exactly one implementation of every capability.
 */
import type { Admin, AuthContext, Scope } from "./auth.ts";
import { requireScope } from "./auth.ts";
import { FuseError } from "./errors.ts";
import { getPricingSummary } from "./core/pricing.ts";
import { getTemplateDetail, listPublicTemplates, scoreTemplate } from "./core/templates.ts";
import { canRun, getAccountCredits } from "./core/credits.ts";
import { attachUploadedAssets, createUploadSession } from "./core/uploads.ts";
import { cancelRun, getCampaignHistory, getRunStatus, prepareCampaignRun, startCampaignRun } from "./core/runs.ts";
import { listRunOutputs, renameCampaign } from "./core/outputs.ts";
import { getTimeline, saveCampaignEdit } from "./core/editor.ts";
import { exportCampaign, getExportStatus } from "./core/exports.ts";
import { getHelp } from "./core/help.ts";

export type JsonSchema = Record<string, unknown>;

export type ToolContext = { admin: Admin; auth: AuthContext; resourceMetadataUrl: string; client: string };

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  scope: Scope | null; // null = public
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  rest: { method: "GET" | "POST" | "PATCH"; path: string; operationId: string; summary: string };
  widget?: string; // ui:// resource for ChatGPT Apps
  handler: (args: Record<string, any>, ctx: ToolContext) => Promise<Record<string, unknown>>;
  /** Short model-facing text summary of a result (keeps context small). */
  summarize?: (result: any) => string;
};

const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description, ...extra });
const num = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: "integer", description, ...extra });
const bool = (description: string): JsonSchema => ({ type: "boolean", description });
const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const arr = (items: JsonSchema, description: string): JsonSchema => ({ type: "array", items, description });

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function needScope(ctx: ToolContext, scope: Scope | null) {
  if (scope) requireScope(ctx.auth, scope, ctx.resourceMetadataUrl);
}

export const TOOLS: ToolDef[] = [
  {
    name: "fuse_search_templates",
    title: "Search FUSE campaign templates",
    description: "Find FUSE campaign templates by what the user sells and wants (e.g. \"hoodie drop\", \"jewelry campaign videos\", \"TikTok ads for a hat\"). Returns real templates with output counts, credits and plan info. Use this first whenever the user asks for a campaign, template, photoshoot, or content for a product. Public — no account needed.",
    scope: null,
    inputSchema: obj({
      query: str("Natural-language request, e.g. \"changing room try-on for a hoodie\""),
      category: str("Optional use case: lookbook, fit check, changing room, product reveal, jewelry close-up, unboxing, ads, social clips"),
      product_type: str("Optional product type: hoodie, tee, hat, jeans, shorts, jacket, grillz, chain, ring, sneakers…"),
      output_type: str("Optional", { enum: ["images", "video", "full_campaign"] }),
      style: str("Optional style words: cinematic, studio, gritty, streetwear, luxury…"),
      industry: str("Optional", { enum: ["streetwear", "jewelry", "fashion", "product", "general"] }),
      plan: str("Optional: only templates included in this plan", { enum: ["starter", "pro", "studio"] }),
      max_results: num("Default 6, max 12", { minimum: 1, maximum: 12 }),
    }),
    annotations: RO,
    rest: { method: "GET", path: "/api/templates", operationId: "searchTemplates", summary: "Search campaign templates" },
    widget: "ui://fuse/template-search.html",
    async handler(args, ctx) {
      const all = await listPublicTemplates(ctx.admin, ctx.auth.isPrivileged);
      const max = Math.min(12, Math.max(1, Number(args.max_results ?? 6)));
      const scored = all.map((t) => ({ t, ...scoreTemplate(t, args) })).sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name));
      const any = scored.some((s) => s.score > 0);
      const picked = (any ? scored.filter((s) => s.score > 0) : scored).slice(0, max);
      return {
        templates: picked.map((s) => ({ ...s.t, confidence_match_reason: s.reason })),
        total_public_templates: all.length,
        exact_match: any,
        recommended_next_action: any
          ? "Show the user 2–4 of these in plain English (what they upload, what they get), then call fuse_get_campaign_template for the one they pick."
          : "No template matched those words exactly. Show the closest real options above and say what is missing; do not invent templates.",
      };
    },
    summarize: (r) => `${r.templates.length} template(s)${r.exact_match ? "" : " (closest matches, no exact hit)"}: ${r.templates.map((t: any) => `${t.name} (${t.slug}) — ${t.outputs.images_count} images + ${t.outputs.clips_count} clips, ${t.estimated_credits} credits, ${t.included_in_starter ? "included in Starter" : t.plan_required}`).join("; ")}`,
  },
  {
    name: "fuse_get_campaign_template",
    title: "Get a FUSE campaign template",
    description: "Full public details for one template: what the user uploads, what they get (real image/clip counts), estimated credits, plan inclusion, sample outputs and the FUSE page. Use after search, or when the user names a template. Public.",
    scope: null,
    inputSchema: obj({ template_slug: str("Template slug from search, e.g. changing-room"), template_id: str("Template UUID (alternative to slug)") }),
    annotations: RO,
    rest: { method: "GET", path: "/api/templates/{slug}", operationId: "getTemplate", summary: "Get one campaign template" },
    widget: "ui://fuse/template-detail.html",
    async handler(args, ctx) {
      if (!args.template_slug && !args.template_id) throw new FuseError("INVALID_INPUT", "template_slug or template_id required");
      return { template: await getTemplateDetail(ctx.admin, { slug: args.template_slug, id: args.template_id }, ctx.auth.isPrivileged) };
    },
    summarize: (r) => `${r.template.name}: upload ${r.template.what_user_uploads.join(", ") || "a product photo"}; get ${r.template.outputs.images_count} images + ${r.template.outputs.clips_count} clips; ${r.template.estimated_credits} credits; ${r.template.included_in_starter ? "included in Starter" : `needs ${r.template.plan_required}`}. ${r.template.public_url}`,
  },
  {
    name: "fuse_list_template_categories",
    title: "List FUSE campaign categories",
    description: "Browseable use cases and product types with real template counts. Use when the user wants to explore rather than search. Public.",
    scope: null,
    inputSchema: obj({}),
    annotations: RO,
    rest: { method: "GET", path: "/api/template-categories", operationId: "listTemplateCategories", summary: "List campaign categories" },
    async handler(_args, ctx) {
      const all = await listPublicTemplates(ctx.admin, ctx.auth.isPrivileged);
      const buckets = new Map<string, { label: string; kind: "use_case" | "product_type" | "industry"; slugs: string[] }>();
      const add = (kind: "use_case" | "product_type" | "industry", label: string, slug: string) => {
        const key = `${kind}:${label.toLowerCase()}`;
        const b = buckets.get(key) ?? { label, kind, slugs: [] };
        if (!b.slugs.includes(slug)) b.slugs.push(slug);
        buckets.set(key, b);
      };
      for (const t of all) {
        for (const u of t.use_cases) add("use_case", u, t.slug);
        for (const p of t.product_types_supported) add("product_type", p, t.slug);
        for (const i of t.industries) add("industry", i, t.slug);
      }
      const categories = [...buckets.values()].map((b) => ({
        slug: b.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: b.label,
        kind: b.kind,
        template_count: b.slugs.length,
        example_template_slugs: b.slugs.slice(0, 4),
      })).sort((a, b) => b.template_count - a.template_count || a.label.localeCompare(b.label));
      return { categories, total_public_templates: all.length };
    },
    summarize: (r) => r.categories.slice(0, 12).map((c: any) => `${c.label} (${c.template_count})`).join(", "),
  },
  {
    name: "fuse_get_pricing_summary",
    title: "Explain FUSE pricing",
    description: "Plans and credits in plain language (campaigns per month, first-month promo, credit packs), optionally for one template. Use when the user asks what it costs, which plan they need, or whether a template is included. Public.",
    scope: null,
    inputSchema: obj({ template_slug: str("Optional template to price"), plan: str("Optional plan to focus on", { enum: ["starter", "pro", "studio"] }) }),
    annotations: RO,
    rest: { method: "GET", path: "/api/pricing", operationId: "getPricingSummary", summary: "Pricing summary" },
    widget: "ui://fuse/pricing.html",
    async handler(args, ctx) {
      let selected: { slug: string; estimated_credits: number } | null = null;
      if (args.template_slug) {
        const t = await getTemplateDetail(ctx.admin, { slug: args.template_slug }, ctx.auth.isPrivileged);
        selected = { slug: t.slug, estimated_credits: t.estimated_credits };
      }
      const pricing = await getPricingSummary(ctx.admin, selected);
      return { ...pricing, focus_plan: args.plan ?? null };
    },
    summarize: (r) => `Starter $${r.starter_monthly_price_usd}/mo (${r.promo_note}) ≈ ${r.plans.find((p: any) => p.key === "starter")?.approximate_campaigns_per_month ?? 3} campaigns/mo; ${r.plans.filter((p: any) => p.key !== "starter").map((p: any) => `${p.name} $${p.monthly_price_usd}/mo ≈ ${p.approximate_campaigns_per_month} campaigns/mo`).join("; ")}${r.selected_template ? `. ${r.selected_template.slug}: ${r.selected_template.estimated_credits} credits (${r.selected_template.approximate_campaign_fraction}), ${r.selected_template.included_in_starter ? "included in Starter" : "needs a bigger plan"}` : ""}. ${r.pricing_url}`,
  },
  {
    name: "fuse_check_account_credits",
    title: "Check FUSE credits",
    description: "The connected user's plan and credit balance, and whether a given template can run right now. Requires a connected FUSE account.",
    scope: "fuse.account.read",
    inputSchema: obj({ template_slug: str("Optional template to check affordability for") }),
    annotations: RO,
    rest: { method: "GET", path: "/api/me/credits", operationId: "checkAccountCredits", summary: "Check plan and credits" },
    widget: "ui://fuse/credits.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.account.read");
      const account = await getAccountCredits(ctx.admin, ctx.auth);
      let cost: number | null = null;
      let slug: string | null = null;
      if (args.template_slug) {
        const t = await getTemplateDetail(ctx.admin, { slug: args.template_slug }, ctx.auth.isPrivileged);
        cost = ctx.auth.isPrivileged ? 0 : t.estimated_credits;
        slug = t.slug;
      }
      const verdict = cost != null ? canRun(account, cost) : null;
      return { ...account, template_slug: slug, template_estimated_credits: cost, ...(verdict ?? { can_run: null, missing_credits: null, upgrade_required: null, recommended_action: "Pass template_slug to check a specific campaign." }) };
    },
    summarize: (r) => `Plan ${r.plan}, ${r.credit_balance} credits${r.template_slug ? `; ${r.template_slug} needs ${r.template_estimated_credits} → ${r.can_run ? "can run" : `short by ${r.missing_credits}`}` : ""}.`,
  },
  {
    name: "fuse_create_upload_session",
    title: "Create upload slots for a campaign",
    description: "Get signed upload URLs for the product photos (or other inputs) a template needs. Each slot is a PUT URL that expires. After uploading, call fuse_attach_uploaded_assets. If the user already has a public https image URL, skip this and pass source_url to fuse_attach_uploaded_assets instead. Requires a connected account.",
    scope: "fuse.assets.write",
    inputSchema: obj({
      template_slug: str("Template slug"),
      files_requested: arr(obj({ input_key: str("Input key from the template's required_inputs"), file_name: str("Original file name"), mime_type: str("image/png, image/jpeg, image/webp, video/mp4, video/quicktime, video/webm"), size_bytes: num("Optional size in bytes") }, ["input_key", "file_name", "mime_type"]), "One entry per file to upload"),
      campaign_name: str("Optional name for the campaign, e.g. \"Kola Hoodie Drop\""),
      idempotency_key: str("Optional client key so a retried call returns the same session"),
    }, ["template_slug", "files_requested"]),
    annotations: WRITE,
    rest: { method: "POST", path: "/api/uploads/session", operationId: "createUploadSession", summary: "Create an upload session" },
    widget: "ui://fuse/upload.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.assets.write");
      return await createUploadSession(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => `Upload session ${r.upload_session_id}: ${r.upload_slots.length} slot(s) [${r.upload_slots.map((s: any) => s.input_key).join(", ")}], expires ${r.expires_at}. ${r.instructions}`,
  },
  {
    name: "fuse_attach_uploaded_assets",
    title: "Attach uploaded product photos",
    description: "Confirm uploads and attach them to a campaign draft. Pass storage_key values from the upload session (after the PUT), or a public https source_url per input for FUSE to fetch. Verifies the files exist and are real images/videos. Requires a connected account.",
    scope: "fuse.assets.write",
    inputSchema: obj({
      upload_session_id: str("Session id from fuse_create_upload_session"),
      uploaded_files: arr(obj({ input_key: str("Input key"), storage_key: str("storage_key from the upload slot (after the file was PUT)"), source_url: str("Alternative: a public https URL of the file for FUSE to fetch"), original_file_name: str("Optional"), mime_type: str("Optional") }, ["input_key"]), "Files to attach"),
    }, ["upload_session_id", "uploaded_files"]),
    annotations: WRITE,
    rest: { method: "POST", path: "/api/uploads/complete", operationId: "attachUploadedAssets", summary: "Attach uploaded assets" },
    widget: "ui://fuse/upload.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.assets.write");
      return await attachUploadedAssets(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => `${r.attached_assets.length} asset(s) attached; ${r.ready_to_prepare ? "ready to prepare" : `still missing: ${r.required_inputs_remaining.join(", ")}`}. campaign_draft_id=${r.campaign_draft_id}`,
  },
  {
    name: "fuse_prepare_campaign_run",
    title: "Prepare a campaign run (no credits used)",
    description: "Safety checkpoint before generation. Validates inputs, computes the real credit cost server-side, checks the balance, and returns a confirmation_token when everything is ready. Nothing is generated and no credits are used. ALWAYS show the confirmation_summary to the user and get an explicit yes before calling fuse_start_campaign_run. Requires a connected account.",
    scope: "fuse.runs.prepare",
    inputSchema: obj({
      template_slug: str("Template slug"),
      campaign_draft_id: str("campaign_draft_id / upload_session_id with attached assets"),
      inputs: { type: "object", description: "Optional extra inputs {input_key: https URL of an attached asset}", additionalProperties: { type: "string" } },
      campaign_name: str("Optional campaign name"),
      output_mode: str("Default full_campaign", { enum: ["images_only", "video_only", "full_campaign"] }),
      dry_run: bool("Always true — this tool never starts generation"),
    }, ["template_slug"]),
    annotations: RO,
    rest: { method: "POST", path: "/api/runs/prepare", operationId: "prepareCampaignRun", summary: "Prepare (dry-run) a campaign" },
    widget: "ui://fuse/confirm-run.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.runs.prepare");
      return await prepareCampaignRun(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => r.confirmation_summary + (r.ready ? " (confirmation_token issued — ask the user to confirm before starting)" : ""),
  },
  {
    name: "fuse_start_campaign_run",
    title: "Start a confirmed campaign run",
    description: "Generates the campaign. Requires the confirmation_token from fuse_prepare_campaign_run and the user's explicit approval; consumes credits. Pass an idempotency_key so a retried call returns the same run instead of starting a second one. Returns immediately with a run_id — poll fuse_get_run_status. Requires a connected account.",
    scope: "fuse.runs.create",
    inputSchema: obj({
      confirmation_token: str("Token from fuse_prepare_campaign_run"),
      idempotency_key: str("Client-generated unique key for this start request (recommended)"),
      campaign_name: str("Optional campaign name override"),
    }, ["confirmation_token"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    rest: { method: "POST", path: "/api/runs/start", operationId: "startCampaignRun", summary: "Start a confirmed campaign run" },
    widget: "ui://fuse/run-status.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.runs.create");
      return await startCampaignRun(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => `${r.idempotent_replay ? "Already running" : "Started"}: run ${r.run_id} (${r.template_slug}) — expect ${r.estimated_outputs.images_count} images + ${r.estimated_outputs.clips_count} clips. Check status in ~${r.next_poll_after_seconds}s.`,
  },
  {
    name: "fuse_generate_image_from_template",
    title: "Generate campaign images from a template",
    description: "Image-first entry point: runs a template for a product photo. FUSE templates render their images and clips together, so this starts the template's full campaign (the images are part of it) — the tool says so honestly. Requires a confirmation_token from fuse_prepare_campaign_run and user approval; consumes credits. Requires a connected account.",
    scope: "fuse.runs.create",
    inputSchema: obj({
      template_slug: str("Template slug"),
      confirmation_token: str("Token from fuse_prepare_campaign_run"),
      campaign_name: str("Optional"),
      idempotency_key: str("Recommended"),
      image_count: num("Ignored unless the template supports a variable count (none do today)"),
      aspect_ratio: str("Ignored unless the template supports it (templates declare their own ratio)"),
    }, ["template_slug", "confirmation_token"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    rest: { method: "POST", path: "/api/runs/start-images", operationId: "generateImagesFromTemplate", summary: "Start an image-first campaign run" },
    widget: "ui://fuse/run-status.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.runs.create");
      const started = await startCampaignRun(ctx.admin, ctx.auth, args as any);
      return {
        ...started,
        requested_image_count: started.estimated_outputs?.images_count ?? null,
        preview_status_url: started.status_url,
        note: `This template produces ${started.estimated_outputs?.images_count ?? 0} images and ${started.estimated_outputs?.clips_count ?? 0} clips together; image-only runs aren't available yet, so the full campaign is generating.`,
      };
    },
    summarize: (r) => `Run ${r.run_id} started — ${r.requested_image_count} images (plus the template's clips). ${r.note}`,
  },
  {
    name: "fuse_get_run_status",
    title: "Check a campaign run",
    description: "Progress, stage, outputs ready vs expected, failures and preview links for one run. Poll every ~20s while queued/running. Requires a connected account.",
    scope: "fuse.runs.read",
    inputSchema: obj({ run_id: str("Run id") }, ["run_id"]),
    annotations: RO,
    rest: { method: "GET", path: "/api/runs/{run_id}", operationId: "getRunStatus", summary: "Get run status" },
    widget: "ui://fuse/run-status.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.runs.read");
      return await getRunStatus(ctx.admin, ctx.auth, String(args.run_id));
    },
    summarize: (r) => `Run ${r.run_id} (${r.campaign_name}): ${r.status}, ${r.progress_percent}% — ${r.outputs_ready_count}/${r.outputs_expected_count} outputs ready${r.failed_outputs_count ? `, ${r.failed_outputs_count} failed` : ""}${r.current_stage ? `; ${r.current_stage}` : ""}.`,
  },
  {
    name: "fuse_list_run_outputs",
    title: "List a run's outputs",
    description: "Every generated image and clip for a run with preview and download links (links expire in ~1 hour). Requires a connected account.",
    scope: "fuse.outputs.read",
    inputSchema: obj({ run_id: str("Run id"), type: str("Filter", { enum: ["image", "video", "all"] }) }, ["run_id"]),
    annotations: RO,
    rest: { method: "GET", path: "/api/runs/{run_id}/outputs", operationId: "listRunOutputs", summary: "List run outputs" },
    widget: "ui://fuse/output-gallery.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.outputs.read");
      return await listRunOutputs(ctx.admin, ctx.auth, String(args.run_id), (args.type ?? "all") as any);
    },
    summarize: (r) => `${r.outputs.length} output(s) for ${r.campaign_name}: ${r.outputs.filter((o: any) => o.type === "image").length} images, ${r.outputs.filter((o: any) => o.type === "video").length} clips${r.counts.failed ? `; ${r.counts.failed} failed` : ""}. Links expire ${r.links_expire_at}.`,
  },
  {
    name: "fuse_get_output_download_links",
    title: "Fresh download links",
    description: "Fresh signed download links for some or all outputs of a run (file names use the campaign name). Requires a connected account.",
    scope: "fuse.outputs.read",
    inputSchema: obj({ run_id: str("Run id"), output_ids: arr(str("output_id"), "Optional subset"), bundle: bool("Request a ZIP (not available through the API yet — reported honestly)") }, ["run_id"]),
    annotations: RO,
    rest: { method: "POST", path: "/api/runs/{run_id}/download-links", operationId: "getDownloadLinks", summary: "Get download links" },
    async handler(args, ctx) {
      needScope(ctx, "fuse.outputs.read");
      const r = await listRunOutputs(ctx.admin, ctx.auth, String(args.run_id), "all", { ttl: 3600 });
      const wanted = Array.isArray(args.output_ids) && args.output_ids.length ? new Set(args.output_ids.map(String)) : null;
      const links = r.outputs.filter((o) => !wanted || wanted.has(o.output_id)).map((o) => ({ output_id: o.output_id, type: o.type, file_name: o.file_name, download_url: o.download_url }));
      return { run_id: r.run_id, campaign_name: r.campaign_name, links, zip_url: null, zip_note: args.bundle ? r.download_all.note : null, expires_at: r.links_expire_at };
    },
    summarize: (r) => `${r.links.length} download link(s), expire ${r.expires_at}.${r.zip_note ? ` ${r.zip_note}` : ""}`,
  },
  {
    name: "fuse_rename_campaign",
    title: "Rename a campaign",
    description: "Give a run a customer-friendly name used in downloads and exports. Requires a connected account.",
    scope: "fuse.editor.write",
    inputSchema: obj({ run_id: str("Run id"), name: str("2–80 characters") }, ["run_id", "name"]),
    annotations: WRITE,
    rest: { method: "PATCH", path: "/api/runs/{run_id}/name", operationId: "renameCampaign", summary: "Rename a campaign" },
    async handler(args, ctx) {
      needScope(ctx, "fuse.editor.write");
      return await renameCampaign(ctx.admin, ctx.auth, String(args.run_id), String(args.name));
    },
    summarize: (r) => `Renamed to “${r.name}”.`,
  },
  {
    name: "fuse_get_campaign_timeline",
    title: "Get the clip timeline",
    description: "Current clip order, trims and mutes for a run's video editor. Use before editing so output_ids and durations are known. Requires a connected account.",
    scope: "fuse.outputs.read",
    inputSchema: obj({ run_id: str("Run id") }, ["run_id"]),
    annotations: RO,
    rest: { method: "GET", path: "/api/runs/{run_id}/edit", operationId: "getCampaignTimeline", summary: "Get the edit timeline" },
    widget: "ui://fuse/editor.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.outputs.read");
      return await getTimeline(ctx.admin, ctx.auth, String(args.run_id));
    },
    summarize: (r) => `${r.clips.length} clip(s), ${r.total_duration_seconds}s total: ${r.clips.map((c: any, i: number) => `${i + 1}. ${c.label}${c.enabled ? "" : " (removed)"}${c.muted ? " (muted)" : ""}`).join("; ")}`,
  },
  {
    name: "fuse_save_campaign_edit",
    title: "Save clip edits",
    description: "Non-destructive edits to a run's clips: order, trim start/end (seconds), mute, include/exclude. Originals are never changed. Example: \"put clip 3 first, remove clip 5, trim the last clip to 2 seconds\". Requires a connected account.",
    scope: "fuse.editor.write",
    inputSchema: obj({
      run_id: str("Run id"),
      campaign_name: str("Optional rename"),
      clips: arr(obj({ output_id: str("Video output_id"), order: num("0-based position"), trim_start_seconds: { type: "number" }, trim_end_seconds: { type: "number" }, muted: bool("Mute this clip"), enabled: bool("false removes the clip from the timeline") }, ["output_id"]), "Clip changes"),
    }, ["run_id"]),
    annotations: WRITE,
    rest: { method: "POST", path: "/api/runs/{run_id}/edit", operationId: "saveCampaignEdit", summary: "Save clip edits" },
    widget: "ui://fuse/editor.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.editor.write");
      return await saveCampaignEdit(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => `Edit saved (revision ${r.revision}); ${r.clips.filter((c: any) => c.enabled).length} clips on the timeline, ${r.total_duration_seconds}s.${r.warnings.length ? ` ${r.warnings.join(" ")}` : ""}`,
  },
  {
    name: "fuse_export_campaign",
    title: "Export the final video",
    description: "Render the edited clips into one final video (uses the saved edit; originals untouched). Returns an export_id to poll with fuse_get_export_status. ZIP bundles are not rendered by the API yet and are reported honestly. Requires a connected account.",
    scope: "fuse.exports.create",
    inputSchema: obj({ run_id: str("Run id"), edit_id: str("Optional edit id"), export_type: str("What to export", { enum: ["final_video", "zip_all_assets", "social_pack"] }), file_name: str("Optional file name"), aspect_ratio: str("Optional", { enum: ["9:16", "16:9", "4:5", "1:1"] }), idempotency_key: str("Recommended") }, ["run_id", "export_type"]),
    annotations: WRITE,
    rest: { method: "POST", path: "/api/runs/{run_id}/export", operationId: "exportCampaign", summary: "Export a campaign" },
    async handler(args, ctx) {
      needScope(ctx, "fuse.exports.create");
      return await exportCampaign(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => r.export_id ? `Export ${r.export_id}: ${r.status}. ${r.message}` : r.message,
  },
  {
    name: "fuse_get_export_status",
    title: "Check an export",
    description: "Poll a final-video export until it is ready; returns the download link when done. Requires a connected account.",
    scope: "fuse.outputs.read",
    inputSchema: obj({ export_id: str("Export id") }, ["export_id"]),
    annotations: RO,
    rest: { method: "GET", path: "/api/exports/{export_id}", operationId: "getExportStatus", summary: "Get export status" },
    async handler(args, ctx) {
      needScope(ctx, "fuse.outputs.read");
      return await getExportStatus(ctx.admin, ctx.auth, String(args.export_id));
    },
    summarize: (r) => `Export ${r.export_id}: ${r.status}${r.download_url ? " — download link ready" : ""}${r.error ? ` — ${r.error}` : ""}.`,
  },
  {
    name: "fuse_cancel_run",
    title: "Cancel a run",
    description: "Ask FUSE to stop a run. Honest answer: runs cannot be stopped once providers are rendering; failed outputs are refunded automatically. Requires a connected account.",
    scope: "fuse.runs.create",
    inputSchema: obj({ run_id: str("Run id") }, ["run_id"]),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    rest: { method: "POST", path: "/api/runs/{run_id}/cancel", operationId: "cancelRun", summary: "Cancel a run" },
    async handler(args, ctx) {
      needScope(ctx, "fuse.runs.create");
      return await cancelRun(ctx.admin, ctx.auth, String(args.run_id));
    },
    summarize: (r) => r.message,
  },
  {
    name: "fuse_get_user_campaign_history",
    title: "List my campaigns",
    description: "The connected user's recent campaigns (newest first) with status, thumbnail and output counts. Requires a connected account.",
    scope: "fuse.runs.read",
    inputSchema: obj({ limit: num("Default 10, max 50", { minimum: 1, maximum: 50 }), status: str("Optional filter", { enum: ["queued", "running", "complete", "failed"] }) }),
    annotations: RO,
    rest: { method: "GET", path: "/api/me/campaigns", operationId: "getCampaignHistory", summary: "List my campaigns" },
    widget: "ui://fuse/output-gallery.html",
    async handler(args, ctx) {
      needScope(ctx, "fuse.runs.read");
      return await getCampaignHistory(ctx.admin, ctx.auth, args as any);
    },
    summarize: (r) => r.campaigns.length ? r.campaigns.map((c: any) => `${c.campaign_name} (${c.template_slug}) — ${c.status}, ${c.outputs_count} outputs, run ${c.run_id}`).join("; ") : "No campaigns yet.",
  },
  {
    name: "fuse_get_help",
    title: "FUSE help",
    description: "Answers common questions from FUSE's approved help copy: what a campaign is, what to upload, what you get, credits, running, downloading, editing, failures, the make-it-right policy, billing. Public.",
    scope: null,
    inputSchema: obj({ topic: str("Question or topic") }),
    annotations: RO,
    rest: { method: "GET", path: "/api/help", operationId: "getHelp", summary: "Help topics" },
    async handler(args) {
      return getHelp(args.topic);
    },
    summarize: (r) => r.answer,
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
