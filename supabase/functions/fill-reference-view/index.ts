// Fills a missing product view (back, sides, inside) from the customer's OWN hat photos.
// The customer pays: credits are charged when generation starts and refunded exactly once if it fails.
// Actions: "start" { view, sourceUrls } -> { fillId, credits }; "status" { fillId } -> { state, url? }.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { IMAGE_MODEL, getFalQueueResult, getFalQueueStatus, submitImageJob } from "../_shared/fal.ts";
import { extractFuseAssetPath, resolveExecutionUrl } from "../_shared/asset-access.ts";
import { corsHeaders, createAdminClient, errorMessage, getUserRoles, json, requireUser } from "../_shared/supabase-admin.ts";

/**
 * One Nano Banana Pro image costs about $0.15. Credit packs sell at $0.0375-$0.05 a credit, so 4 credits
 * roughly covers it at the cheapest pack. Change here to reprice.
 */
const FILL_VIEW_CREDITS = 4;
const MAX_SOURCES = 4;
const MAX_PENDING_PER_USER = 4;
const BUCKET = "fuse-assets";

type View = "back" | "left" | "right" | "inside";
const VIEW_TEXT: Record<View, string> = {
  back: "the BACK of the hat, seen straight from behind at eye level",
  left: "the wearer's LEFT side of the hat in a clean side profile, brim pointing to the left of the image",
  right: "the wearer's RIGHT side of the hat in a clean side profile, brim pointing to the right of the image",
  inside: "the INSIDE / underside of the hat: turned upside down, showing the underside of the brim and the inside of the crown",
};

function prompt(view: View) {
  return [
    "The images are photos of ONE real hat: the customer's product.",
    `Create one clean product photo of ${VIEW_TEXT[view]} of exactly this hat.`,
    "Keep everything the photos show identical: crown shape and height, number of panels, seams, eyelets, top button, brim shape and curve, every color, fabric and texture, and every logo, embroidery, patch and label in its exact place and size.",
    "Anything no photo shows stays plain and consistent with the hat: the same fabric and color as the matching panel, and the usual construction for this hat style (fitted caps have a solid back, snapbacks a plastic snap strap, trucker caps mesh). Never invent new logos, text, patches or graphics.",
    "Replace the whole background with plain light grey seamless studio paper, edge to edge: nothing from the photos' own backgrounds (ground, floor, plants, walls, hands) may remain anywhere in the image.",
    "Soft even light, the hat centered and fully in frame. No hands, no people, no props, no text.",
  ].join("\n");
}

const hookUrl = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/fill-reference-view?hook=1`;

/** Marks a pending fill failed and refunds its credits exactly once. */
async function failAndRefund(admin: ReturnType<typeof createAdminClient>, fillId: string, reason: string) {
  await admin.from("reference_view_fills").update({ status: "failed", error: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", fillId).eq("status", "pending");
  const { data: refund } = await admin.from("reference_view_fills").update({ credits_refunded: true })
    .eq("id", fillId).eq("status", "failed").eq("credits_refunded", false).gt("charged_credits", 0)
    .select("user_id, charged_credits").maybeSingle();
  if (refund) {
    await admin.rpc("apply_credit_transaction", {
      p_user_id: refund.user_id, p_amount: refund.charged_credits, p_type: "refund",
      p_description: `Hat view fill refund (${fillId})`, p_template_id: null, p_project_id: null, p_step_id: null,
    });
  }
}

async function start(admin: ReturnType<typeof createAdminClient>, userId: string, roles: string[], body: Record<string, unknown>) {
  const view = String(body.view ?? "") as View;
  if (!(view in VIEW_TEXT)) return json({ ok: false, reason: "Only back, side and inside views can be filled." }, 400);
  const sources = (Array.isArray(body.sourceUrls) ? body.sourceUrls : []).map(String).slice(0, MAX_SOURCES);
  if (!sources.length) return json({ ok: false, reason: "Add at least one photo of the hat first." }, 400);
  // Only the caller's own uploads may be used as references.
  for (const url of sources) {
    const path = extractFuseAssetPath(url);
    if (!/^https?:\/\//i.test(url) || !path || !path.startsWith(`${userId}/`)) return json({ ok: false, reason: "Those photos could not be used." }, 400);
  }
  const { count } = await admin.from("reference_view_fills").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending");
  if ((count ?? 0) >= MAX_PENDING_PER_USER) return json({ ok: false, reason: "A few views are still being made. Try again in a moment." }, 429);

  const privileged = roles.includes("admin") || roles.includes("dev");
  const credits = privileged ? 0 : FILL_VIEW_CREDITS;
  const { data: fill, error } = await admin.from("reference_view_fills").insert({ user_id: userId, view, charged_credits: credits }).select("id").single();
  if (error || !fill) throw new Error(error?.message ?? "Could not start.");
  if (credits > 0) {
    const { error: chargeError } = await admin.rpc("apply_credit_transaction", {
      p_user_id: userId, p_amount: -credits, p_type: "run_template",
      p_description: `Fill missing hat view: ${view} (${fill.id})`, p_template_id: null, p_project_id: null, p_step_id: null,
    });
    if (chargeError) {
      await admin.from("reference_view_fills").delete().eq("id", fill.id);
      return json({ ok: false, reason: /insufficient/i.test(chargeError.message) ? "Not enough credits." : chargeError.message }, 402);
    }
  }
  try {
    const imageUrls = (await Promise.all(sources.map((u) => resolveExecutionUrl(admin, u)))).filter(Boolean) as string[];
    const requestId = await submitImageJob({ prompt: prompt(view), imageUrls, aspectRatio: "1:1", resolution: "2K", webhookUrl: hookUrl() });
    await admin.from("reference_view_fills").update({ request_id: requestId, updated_at: new Date().toISOString() }).eq("id", fill.id);
    return json({ ok: true, fillId: fill.id, credits });
  } catch (submitError) {
    await failAndRefund(admin, fill.id, errorMessage(submitError));
    return json({ ok: false, reason: "The view could not be started. No credits were used." }, 502);
  }
}

async function status(admin: ReturnType<typeof createAdminClient>, userId: string, body: Record<string, unknown>) {
  const { data: fill } = await admin.from("reference_view_fills").select("*").eq("id", String(body.fillId ?? "")).eq("user_id", userId).maybeSingle();
  if (!fill) return json({ ok: false, reason: "Not found." }, 404);
  const signed = async (url: string) => (await resolveExecutionUrl(admin, url)) ?? url;
  if (fill.status === "complete") return json({ ok: true, state: "done", url: await signed(fill.result_url) });
  if (fill.status === "failed") return json({ ok: true, state: "failed", reason: "The view could not be made. Your credits were refunded." });
  if (Date.now() - Date.parse(fill.created_at) > 10 * 60_000) {
    // Never leave a customer charged for a view that never arrives.
    await failAndRefund(admin, fill.id, "Timed out.");
    return json({ ok: true, state: "failed", reason: "The view took too long. Your credits were refunded." });
  }
  if (!fill.request_id) return json({ ok: true, state: "running" });

  const providerState = String(await getFalQueueStatus(IMAGE_MODEL, fill.request_id) ?? "").toUpperCase();
  if (providerState !== "COMPLETED") return json({ ok: true, state: "running" });
  try {
    const result: any = await getFalQueueResult(IMAGE_MODEL, fill.request_id);
    const remote = result?.images?.[0]?.url ?? result?.image?.url;
    if (!remote) throw new Error("No image came back.");
    const bytes = new Uint8Array(await (await fetch(remote)).arrayBuffer());
    const path = `${userId}/reference-fills/${fill.id}.png`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const canonical = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await admin.from("reference_view_fills").update({ status: "complete", result_url: canonical, updated_at: new Date().toISOString() })
      .eq("id", fill.id).eq("status", "pending");
    return json({ ok: true, state: "done", url: await signed(canonical) });
  } catch (resultError) {
    // Provider refusals (content checks) and broken results land here: refund once.
    await failAndRefund(admin, fill.id, errorMessage(resultError));
    return json({ ok: true, state: "failed", reason: "The view could not be made. Your credits were refunded." });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (new URL(req.url).searchParams.get("hook") === "1") return json({ ok: true }); // fal webhook: the page polls instead
  const admin = createAdminClient();
  try {
    const user = await requireUser(req, admin);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "start") return await start(admin, user.id, await getUserRoles(user.id, admin), body);
    if (body.action === "status") return await status(admin, user.id, body);
    return json({ ok: false, reason: "Unknown action." }, 400);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 401);
  }
});
