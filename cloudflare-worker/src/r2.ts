import type { Env } from "./auth";

export async function serveAsset(env: Env, key: string) {
  const object = await env.FUSE_ASSETS.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=3600");

  return new Response(object.body, { headers });
}
