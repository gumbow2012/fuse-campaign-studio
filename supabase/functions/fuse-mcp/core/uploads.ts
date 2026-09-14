/**
 * Upload sessions for MCP clients. Same storage layout and limits as the web app
 * (`<uid>/run-inputs/…` in the private fuse-assets bucket; 12 MB images, 60 MB video).
 * Signed upload URLs expire; attach verifies the object really exists and sniffs
 * its real type — filenames are never trusted.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { inputsFor, loadTemplate } from "./templates.ts";

const BUCKET = "fuse-assets";
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };
const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;
const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60; // Supabase signed upload URLs live 2h.

export type UploadSlot = {
  input_key: string;
  label: string;
  file_name: string;
  mime_type: string;
  max_size_bytes: number;
  storage_path: string;
  upload_url: string;
  upload_token: string;
  expires_at: string;
  accepted_mime_types: string[];
  attached: boolean;
};

function safeName(name: string): string {
  return String(name ?? "file").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
}

function publicStyleUrl(path: string): string {
  return `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function createUploadSession(admin: Admin, auth: AuthContext, args: {
  template_slug: string;
  files_requested: Array<{ input_key: string; file_name: string; mime_type: string; size_bytes?: number }>;
  campaign_name?: string;
  idempotency_key?: string;
}) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  if (args.idempotency_key) {
    const { data: existing } = await admin
      .from("mcp_upload_sessions")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("idempotency_key", args.idempotency_key)
      .maybeSingle();
    if (existing) return describeSession(existing as any, await loadTemplate(admin, { id: (existing as any).template_id }, auth.isPrivileged));
  }
  const t = await loadTemplate(admin, { slug: args.template_slug }, auth.isPrivileged);
  const inputs = inputsFor(t);
  const known = new Map([...inputs.required, ...inputs.optional].map((i) => [i.key, i]));
  if (!Array.isArray(args.files_requested) || !args.files_requested.length) {
    throw new FuseError("INVALID_INPUT", "files_requested[] is required", {
      nextAction: `Request one slot per input. Inputs for this campaign: ${[...known.keys()].join(", ")}`,
    });
  }
  const slots: UploadSlot[] = [];
  for (const f of args.files_requested) {
    const input = known.get(f.input_key);
    if (!input) {
      throw new FuseError("INVALID_INPUT", `Unknown input_key ${f.input_key}`, {
        nextAction: `Use one of: ${[...known.keys()].join(", ")}`,
      });
    }
    const mime = String(f.mime_type ?? "").toLowerCase();
    const isVideo = mime in VIDEO_TYPES;
    const ext = IMAGE_TYPES[mime] ?? VIDEO_TYPES[mime];
    if (!ext) throw new FuseError("UNSUPPORTED_FILE_TYPE", `mime ${mime}`);
    const limit = isVideo ? MAX_VIDEO : MAX_IMAGE;
    if (f.size_bytes && f.size_bytes > limit) throw new FuseError("FILE_TOO_LARGE");
    const path = `${auth.userId}/run-inputs/mcp/${crypto.randomUUID()}/${safeName(f.file_name)}.${ext}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new FuseError("INTERNAL", error?.message ?? "Could not create upload URL");
    slots.push({
      input_key: f.input_key,
      label: input.label,
      file_name: f.file_name,
      mime_type: mime,
      max_size_bytes: limit,
      storage_path: path,
      upload_url: data.signedUrl,
      upload_token: data.token,
      expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
      accepted_mime_types: isVideo ? Object.keys(VIDEO_TYPES) : Object.keys(IMAGE_TYPES),
      attached: false,
    });
  }
  const { data: session, error } = await admin
    .from("mcp_upload_sessions")
    .insert({
      user_id: auth.userId,
      template_id: t.row.id,
      version_id: t.versionId,
      campaign_name: args.campaign_name?.slice(0, 80) ?? null,
      slots,
      idempotency_key: args.idempotency_key ?? null,
      expires_at: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !session) throw new FuseError("INTERNAL", error?.message ?? "Could not create upload session");
  return describeSession(session as any, t);
}

function describeSession(session: any, t: Awaited<ReturnType<typeof loadTemplate>>) {
  const inputs = inputsFor(t);
  const attached = session.attached ?? {};
  const slots = (session.slots ?? []) as UploadSlot[];
  const missing = inputs.required.filter((i) => !attached[i.key]).map((i) => i.key);
  return {
    upload_session_id: session.id,
    template_slug: t.row.slug,
    campaign_name: session.campaign_name ?? null,
    upload_slots: slots.map((s) => ({
      input_key: s.input_key,
      label: s.label,
      upload_url: s.upload_url,
      upload_method: "PUT",
      upload_headers: { "Content-Type": s.mime_type, "x-upsert": "true" },
      expires_at: s.expires_at,
      accepted_mime_types: s.accepted_mime_types,
      max_size_bytes: s.max_size_bytes,
      storage_key: s.storage_path,
      attached: !!attached[s.input_key],
    })),
    attached_assets: Object.entries(attached).map(([input_key, a]: [string, any]) => ({ input_key, asset_id: a.asset_id, file_name: a.file_name, mime_type: a.mime_type, bytes: a.bytes, width: a.width ?? null, height: a.height ?? null })),
    required_inputs_remaining: missing,
    ready_to_prepare: missing.length === 0,
    expires_at: session.expires_at,
    instructions: missing.length
      ? "PUT each file to its upload_url with the Content-Type header, then call fuse_attach_uploaded_assets with the storage_key values. You can also pass a public https file URL per input and FUSE will fetch it."
      : "All required inputs are attached. Call fuse_prepare_campaign_run next.",
  };
}

async function sniff(bytes: Uint8Array): Promise<{ mime: string; width: number | null; height: number | null } | null> {
  const b = bytes;
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset);
    return { mime: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: walk segments to SOF for dimensions.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
    return { mime: "image/jpeg", width: null, height: null };
  }
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return { mime: "image/webp", width: null, height: null };
  }
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = new TextDecoder().decode(b.slice(8, 12));
    return { mime: brand.startsWith("qt") ? "video/quicktime" : "video/mp4", width: null, height: null };
  }
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "video/webm", width: null, height: null };
  return null;
}

/** Fetch a client-provided https URL server-side with strict limits (no private hosts, size caps, type sniff). */
async function ingestFromUrl(admin: Admin, userId: string, inputKey: string, sourceUrl: string) {
  let u: URL;
  try { u = new URL(sourceUrl); } catch { throw new FuseError("INVALID_INPUT", "source_url must be an absolute https URL"); }
  if (u.protocol !== "https:") throw new FuseError("INVALID_INPUT", "source_url must use https");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || /^(\d+\.){3}\d+$/.test(host) || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal") {
    throw new FuseError("INVALID_INPUT", "source_url host not allowed");
  }
  const res = await fetch(u.toString(), { redirect: "follow", headers: { Accept: "image/*,video/*" } });
  if (!res.ok) throw new FuseError("INVALID_INPUT", `Could not fetch source_url (HTTP ${res.status})`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_VIDEO) throw new FuseError("FILE_TOO_LARGE");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_VIDEO) throw new FuseError("FILE_TOO_LARGE");
  const kind = await sniff(buf);
  if (!kind) throw new FuseError("UNSUPPORTED_FILE_TYPE");
  const isVideo = kind.mime.startsWith("video/");
  if (!isVideo && buf.byteLength > MAX_IMAGE) throw new FuseError("FILE_TOO_LARGE");
  const ext = IMAGE_TYPES[kind.mime] ?? VIDEO_TYPES[kind.mime];
  const path = `${userId}/run-inputs/mcp/${crypto.randomUUID()}/${safeName(inputKey)}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: kind.mime, upsert: false });
  if (error) throw new FuseError("INTERNAL", error.message);
  return { path, bytes: buf.byteLength, ...kind };
}

export async function attachUploadedAssets(admin: Admin, auth: AuthContext, args: {
  upload_session_id: string;
  uploaded_files: Array<{ input_key: string; storage_key?: string; source_url?: string; original_file_name?: string; mime_type?: string }>;
}) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const { data: session } = await admin.from("mcp_upload_sessions").select("*").eq("id", args.upload_session_id).maybeSingle();
  if (!session || (session as any).user_id !== auth.userId) throw new FuseError("NOT_FOUND", "Upload session not found");
  if (new Date((session as any).expires_at).getTime() < Date.now()) {
    throw new FuseError("INVALID_INPUT", "Upload session expired", { nextAction: "Create a new upload session." });
  }
  const t = await loadTemplate(admin, { id: (session as any).template_id }, auth.isPrivileged);
  const inputs = inputsFor(t);
  const validKeys = new Set(inputs.slotKeys);
  const slots = ((session as any).slots ?? []) as UploadSlot[];
  const attached = { ...((session as any).attached ?? {}) } as Record<string, unknown>;

  for (const f of args.uploaded_files ?? []) {
    if (!validKeys.has(f.input_key)) throw new FuseError("INVALID_INPUT", `Unknown input_key ${f.input_key}`);
    let path: string;
    let bytes = 0;
    let meta: { mime: string; width: number | null; height: number | null } | null = null;
    if (f.source_url) {
      const ingested = await ingestFromUrl(admin, auth.userId, f.input_key, f.source_url);
      path = ingested.path;
      bytes = ingested.bytes;
      meta = { mime: ingested.mime, width: ingested.width, height: ingested.height };
    } else {
      const slot = slots.find((s) => s.input_key === f.input_key && (!f.storage_key || s.storage_path === f.storage_key));
      if (!slot) throw new FuseError("INVALID_INPUT", `No upload slot for ${f.input_key}`, { nextAction: "Use the storage_key returned by fuse_create_upload_session." });
      path = slot.storage_path;
      if (!path.startsWith(`${auth.userId}/`)) throw new FuseError("FORBIDDEN");
      // Verify the object exists and sniff the first bytes (never trust the filename).
      const { data: blob, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !blob) {
        throw new FuseError("MISSING_INPUT", `Nothing uploaded yet for ${f.input_key}`, { nextAction: "PUT the file to the slot's upload_url, then attach again." });
      }
      bytes = blob.size;
      const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
      meta = await sniff(head);
      if (!meta) throw new FuseError("UNSUPPORTED_FILE_TYPE");
      const isVideo = meta.mime.startsWith("video/");
      if (bytes > (isVideo ? MAX_VIDEO : MAX_IMAGE)) throw new FuseError("FILE_TOO_LARGE");
    }
    attached[f.input_key] = {
      asset_id: crypto.randomUUID(),
      storage_path: path,
      url: publicStyleUrl(path),
      file_name: safeName(f.original_file_name ?? path.split("/").pop() ?? "file"),
      mime_type: meta.mime,
      bytes,
      width: meta.width,
      height: meta.height,
    };
  }
  const { data: updated, error } = await admin
    .from("mcp_upload_sessions")
    .update({ attached, status: "attached", updated_at: new Date().toISOString() })
    .eq("id", (session as any).id)
    .select("*")
    .single();
  if (error || !updated) throw new FuseError("INTERNAL", error?.message ?? "Could not attach");
  const described = describeSession(updated as any, t);
  return { campaign_draft_id: (updated as any).id, ...described };
}

/** Resolve a draft's attached inputs to the `{slotKey: url}` map the runner expects. */
export async function draftInputs(admin: Admin, auth: AuthContext, draftId: string) {
  const { data: session } = await admin.from("mcp_upload_sessions").select("*").eq("id", draftId).maybeSingle();
  if (!session || (session as any).user_id !== auth.userId) throw new FuseError("NOT_FOUND", "Campaign draft not found");
  const attached = ((session as any).attached ?? {}) as Record<string, { url: string }>;
  const inputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(attached)) inputs[k] = v.url;
  return { session: session as any, inputs };
}
