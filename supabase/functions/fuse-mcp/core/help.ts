/** Help answers from approved copy only. No invented policy. */
const SITE = "https://fuse-us.com";

const TOPICS: Record<string, { answer: string; links: string[]; next_action: string }> = {
  "what is a campaign": {
    answer: "A campaign is one run of a FUSE template: you upload your product photo, pick a proven shoot, and FUSE generates a set of campaign images and short clips built around your product. Your graphics stay intact — no prompting.",
    links: [`${SITE}/app/templates`],
    next_action: "Call fuse_search_templates with your product type to see campaigns.",
  },
  "what do i upload": {
    answer: "Usually one clear product photo per slot (front of the garment, or the piece of jewelry). A phone photo on a plain background works. Some campaigns also take a logo or a second product. PNG, JPG or WEBP under 12 MB.",
    links: [],
    next_action: "Call fuse_get_campaign_template to see the exact uploads a campaign needs.",
  },
  "what do i get": {
    answer: "Each campaign returns a fixed set of outputs listed on the template — for example 8 images and 9 short clips — ready for ads, socials and launch pages. You can download every file and edit the clips into a final video.",
    links: [],
    next_action: "Call fuse_get_campaign_template for the exact counts.",
  },
  "how credits work": {
    answer: "Plans are sold in campaigns per month; credits run behind the scenes. Starter includes about 3 campaigns a month, Pro about 19, Studio about 58. A typical campaign uses about one campaign's worth of credits. Regenerating a single output uses credits too, so you stay in control. Outputs that fail to generate are not charged.",
    links: [`${SITE}/pricing`],
    next_action: "Call fuse_check_account_credits before running a campaign.",
  },
  "how to run a template": {
    answer: "Find a campaign, upload your product photo, prepare the run to see what it will produce and what it costs, confirm, and FUSE generates it. You'll get a run you can check on until it's complete.",
    links: [],
    next_action: "Use the run_campaign_from_uploads prompt, or call fuse_create_upload_session for the campaign you chose.",
  },
  "how to download outputs": {
    answer: "When a run is complete, every image and clip has a download link (links expire after about an hour, ask for fresh ones any time). Downloads use your campaign name in the file name.",
    links: [],
    next_action: "Call fuse_get_output_download_links with the run id.",
  },
  "how to edit clips": {
    answer: "Runs that include video get a campaign editor: reorder clips, trim the start or end, mute, remove or restore clips, then export a final video. Edits never change the original outputs.",
    links: [],
    next_action: "Call fuse_save_campaign_edit, then fuse_export_campaign.",
  },
  "what if generation fails": {
    answer: "Sometimes a video provider is briefly unavailable and one or more clips don't finish. You are not charged for outputs that fail, completed outputs are still yours, and you can retry the missing ones from the FUSE studio.",
    links: [],
    next_action: "Call fuse_get_run_status to see which outputs completed.",
  },
  "refunds": {
    answer: "Not happy with your first campaign? Email us and we'll make it right.",
    links: [`${SITE}/pricing`],
    next_action: "Email support from the address on your FUSE receipt.",
  },
  "account and billing": {
    answer: "Plans are billed monthly and you can cancel any time from your FUSE account; access continues to the end of the billing month. Starter is $25/month with 20% off your first month.",
    links: [`${SITE}/pricing`, `${SITE}/account`],
    next_action: "Open your FUSE account to manage the plan.",
  },
};

export function getHelp(topic?: string) {
  const q = String(topic ?? "").toLowerCase();
  const key = Object.keys(TOPICS).find((k) => q.includes(k) || k.split(" ").filter((w) => w.length > 3).every((w) => q.includes(w)))
    ?? (q.includes("credit") ? "how credits work" : q.includes("upload") ? "what do i upload" : q.includes("download") ? "how to download outputs" : q.includes("edit") ? "how to edit clips" : q.includes("fail") ? "what if generation fails" : q.includes("refund") || q.includes("guarantee") ? "refunds" : q.includes("cancel") || q.includes("bill") ? "account and billing" : "what is a campaign");
  return { topic: key, ...TOPICS[key], topics: Object.keys(TOPICS) };
}
