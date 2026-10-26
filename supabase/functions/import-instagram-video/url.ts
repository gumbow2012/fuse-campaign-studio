/** Instagram post/reel link validation (kept separate so it is testable without starting the server). */
const POST_PATH = /^\/(?:[A-Za-z0-9_.]+\/)?(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?$/;

export function normalizeInstagramUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host)) return null;
  if (!POST_PATH.test(url.pathname)) return null;
  return `https://www.instagram.com${url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`}`;
}
