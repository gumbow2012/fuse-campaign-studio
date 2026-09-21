/** MCP prompts that guide a client through FUSE without jargon. */
export type PromptDef = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  render: (args: Record<string, string>) => string;
};

export const PROMPTS: PromptDef[] = [
  {
    name: "find_campaign_for_product",
    title: "Find the right campaign for a product",
    description: "Helps a brand owner find the right FUSE campaign template for their product.",
    arguments: [
      { name: "product_type", description: "hoodie, tee, hat, jeans, grillz, chain…", required: false },
      { name: "brand_style", description: "streetwear, luxury, clean, gritty…", required: false },
      { name: "output_needed", description: "images, video, or full campaign", required: false },
      { name: "platform", description: "TikTok, Instagram, ads, website", required: false },
      { name: "budget_level", description: "starter, pro, studio", required: false },
    ],
    render: (a) => `You are helping a clothing or jewelry brand owner pick a FUSE campaign template. Known so far — product: ${a.product_type || "unknown"}; style: ${a.brand_style || "unknown"}; output needed: ${a.output_needed || "unknown"}; platform: ${a.platform || "unknown"}; budget: ${a.budget_level || "unknown"}.
Ask only for what is missing and matters (product type and whether they want images, clips or both). Then call fuse_search_templates. Recommend 2–4 real templates. For each, say in one plain sentence what they upload and what they get (real image/clip counts). Never invent templates, counts or examples. Do not use words like "viral", "node", "workflow" or "credits" as the main explanation — say "included in Starter" or "about one campaign's worth of credits".`,
  },
  {
    name: "run_campaign_from_uploads",
    title: "Run a campaign from uploaded product assets",
    description: "Guides the user from product uploads to a prepared, confirmed campaign run.",
    arguments: [
      { name: "template_slug", description: "Template to run (optional)", required: false },
      { name: "campaign_name", description: "Name for the campaign (optional)", required: false },
      { name: "output_mode", description: "full_campaign (default)", required: false },
    ],
    render: (a) => `Run a FUSE campaign for the user${a.template_slug ? ` using template ${a.template_slug}` : ""}${a.campaign_name ? ` named "${a.campaign_name}"` : ""}.
Steps: 1) fuse_get_campaign_template to list the required uploads. 2) fuse_create_upload_session for those inputs (or fuse_attach_uploaded_assets with a public https source_url if the user gave a link). 3) Tell the user exactly what to upload — "Upload your product photo. A phone photo is fine." 4) fuse_attach_uploaded_assets. 5) When the user asks for a campaign, you may start the run directly with fuse_start_campaign_run (template_slug + attached inputs, plus a fresh idempotency_key). Runs charge credits from the user's balance and start immediately. You may optionally call fuse_prepare_campaign_run first to show cost. 6) Poll fuse_get_run_status about every 20 seconds and report progress in one line. 7) When complete, show fuse_list_run_outputs. Never retry a start without the same idempotency_key. Speak in campaigns, images and clips.`,

  },
  {
    name: "create_images_only",
    title: "Create campaign images from a product photo",
    description: "Runs a template for a product photo with the images as the goal.",
    arguments: [{ name: "template_slug", description: "Template (optional)", required: false }],
    render: (a) => `The user wants campaign images${a.template_slug ? ` from template ${a.template_slug}` : ""}. Search or get the template, request the product photo upload, attach it, then start the run directly with fuse_generate_image_from_template (or fuse_start_campaign_run) — no confirmation token is needed; runs charge credits from the user's balance and start immediately. You may optionally call fuse_prepare_campaign_run first to show cost. Be honest: FUSE templates generate their images and clips together, so the run produces both. Poll status, then return the image previews and download links.`,
  },
  {
    name: "edit_and_export_campaign",
    title: "Edit clips and export a final video",
    description: "Helps reorder/trim clips and export a final campaign video.",
    arguments: [{ name: "run_id", description: "The run to edit", required: true }],
    render: (a) => `Edit and export FUSE run ${a.run_id}. 1) fuse_get_campaign_timeline and show the clips numbered with durations. 2) Ask the desired order, trims, mutes or removals in plain language. 3) fuse_save_campaign_edit with the changes (use output_id values). 4) fuse_export_campaign with export_type final_video. 5) Poll fuse_get_export_status until ready and return the download link. Originals are never changed.`,
  },
  {
    name: "explain_fuse_to_streetwear_owner",
    title: "Explain FUSE without jargon",
    description: "Explains FUSE to a streetwear or jewelry brand owner in plain language.",
    arguments: [],
    render: () => `Explain FUSE in four short sentences: you upload your real product photo; you pick a proven campaign (a real shoot style, not a prompt); FUSE generates campaign images and short clips with your graphics intact; you edit, export and download everything. Starter is $25 a month (20% off the first month) for about 3 campaigns. Never mention nodes, run ids, workflows or credit counts unless asked. Offer to find a template with fuse_search_templates.`,
  },
];
