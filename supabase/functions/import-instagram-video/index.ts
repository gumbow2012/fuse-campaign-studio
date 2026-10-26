import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, errorMessage, json, requireUser } from "../_shared/supabase-admin.ts";
import { normalizeInstagramUrl } from "./url.ts";

/**
 * Paste an Instagram post/reel link -> stream back its MP4 so the browser can
 * feed it into the normal Outfit Swap upload path. Resolution goes through the
 * Apify Instagram scraper (secret APIFY_TOKEN); nothing is stored here.
 */

const MAX_BYTES = 50_000_000; // same cap as a manual upload
const MEDIA_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

async function resolveVideoUrl(postUrl: string, token: string): Promise<string> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=90`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directUrls: [postUrl], resultsType: "posts", resultsLimit: 1, addParentData: false }),
    },
  );
  if (!res.ok) throw new Error(`Couldn't reach Instagram right now (${res.status}). Try again or upload the file.`);
  const items = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  const item = items[0] ?? {};
  const videoUrl = typeof item.videoUrl === "string" ? item.videoUrl : null;
  if (!videoUrl) {
    throw new Error(
      item.error ? "That post is private or unavailable." : "That link isn't a video. Paste a reel or a video post.",
    );
  }
  return videoUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    await requireUser(req);
    const { url } = await req.json().catch(() => ({ url: "" }));
    const postUrl = normalizeInstagramUrl(String(url ?? ""));
    if (!postUrl) return json({ error: "Paste an Instagram reel or post link (instagram.com/reel/…)." }, 400);

    const token = Deno.env.get("APIFY_TOKEN");
    if (!token) return json({ error: "Instagram import isn't set up yet. Upload the video file instead." }, 503);

    const videoUrl = await resolveVideoUrl(postUrl, token);
    // SSRF guard: only Instagram's own media CDN, and re-check after redirects.
    if (!MEDIA_HOST.test(new URL(videoUrl).hostname)) throw new Error("Unexpected video host");
    const media = await fetch(videoUrl);
    if (!media.ok || !media.body || !MEDIA_HOST.test(new URL(media.url).hostname)) {
      throw new Error("Couldn't download that video. Try again or upload the file.");
    }
    const declared = Number(media.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return json({ error: "That video is over 50 MB. Upload a shorter clip." }, 413);

    // Stream through with a hard byte cap (never buffer the whole file).
    let seen = 0;
    const capped = media.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          seen += chunk.byteLength;
          if (seen > MAX_BYTES) controller.error(new Error("too large"));
          else controller.enqueue(chunk);
        },
      }),
    );
    return new Response(capped, {
      headers: { ...corsHeaders, "Content-Type": "video/mp4", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = errorMessage(error);
    const status = /authorization|Authentication|bearer/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
