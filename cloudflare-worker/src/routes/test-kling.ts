/**
 * GET /api/test-kling — Smoke-test Kling JWT auth.
 * Generates a JWT and hits the Kling account endpoint to verify credentials.
 */
import { Env } from "../types";
import { verifyToken } from "../auth";

async function generateKlingJwt(accessKey: string, secretKey: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5, iat: now };

  const enc = new TextEncoder();
  const b64url = (data: Uint8Array) => {
    let s = "";
    for (const b of data) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const b64urlStr = (str: string) => b64url(enc.encode(str));

  const headerB64 = b64urlStr(JSON.stringify(header));
  const payloadB64 = b64urlStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

export async function handleTestKling(request: Request, env: Env): Promise<Response> {
  // Require auth so only logged-in users can test
  await verifyToken(request, env);

  const accessKey = env.KLING_ACCESS_KEY;
  const secretKey = env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    return Response.json({ ok: false, error: "KLING_ACCESS_KEY / KLING_SECRET_KEY not set" }, { status: 500 });
  }

  try {
    const jwt = await generateKlingJwt(accessKey, secretKey);

    // Hit a lightweight Kling endpoint to verify auth
    const res = await fetch("https://api.klingai.com/v1/videos/image2video", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      // Send minimal invalid body — we expect a 400 (bad request) not 401 (auth failure)
      body: JSON.stringify({ model_name: "kling-v1", image: "https://example.com/test.png", prompt: "test", duration: "5", mode: "std" }),
    });

    const body = await res.text();
    const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();

    // 401/403 = auth failed, anything else (including 400, 200) = auth works
    if (res.status === 401 || res.status === 403) {
      return Response.json({
        ok: false,
        error: "Kling rejected credentials",
        status: res.status,
        body: parsed || body.slice(0, 500),
      });
    }

    return Response.json({
      ok: true,
      message: "Kling JWT auth verified — credentials accepted",
      status: res.status,
      klingResponse: parsed || body.slice(0, 500),
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
