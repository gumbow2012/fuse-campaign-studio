/**
 * POST /api/enqueue — accepts { projectId }, kicks off the graph-based runner.
 * GET /api/projects/:id — returns job status, progress, logs, result_url.
 *
 * The runner loads template.raw_json, parses nodes & edges, topologically
 * sorts them, and executes each node sequentially. User inputs (uploaded
 * assets) are injected into input nodes; prompts stay locked from the
 * template JSON. External model calls go through provider adapters
 * (fal nano-banana, Kling). Final outputs are uploaded to R2 and saved
 * on the project record.
 */

import { Env } from "../types";
import { verifyToken } from "../auth";
import { supabaseFetch, updateProjectStatus, getProject, getTemplate } from "../supabase";

/* ══════════════════════════════════════════════════════════════
 *  Helpers
 * ══════════════════════════════════════════════════════════════ */

async function appendLog(env: Env, projectId: string, message: string) {
  const project = await getProject(env, projectId);
  const logs: string[] = (project?.logs as string[]) ?? [];
  logs.push(`[${new Date().toISOString()}] ${message}`);
  await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body: { logs },
  });
}

async function setProgress(env: Env, projectId: string, progress: number, log?: string) {
  const update: Record<string, unknown> = { progress };
  if (log) {
    const project = await getProject(env, projectId);
    const logs: string[] = (project?.logs as string[]) ?? [];
    logs.push(`[${new Date().toISOString()}] ${log}`);
    update.logs = logs;
  }
  await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body: update,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const R2_PUBLIC_DOMAIN = "https://pub-18eb2ae6df714575853d0d459e18b74b.r2.dev";

function resolveImageUrl(value: string): string {
  if (value.startsWith("uploads/") || value.startsWith("outputs/") || value.startsWith("projects/")) {
    return `${R2_PUBLIC_DOMAIN}/${value}`;
  }
  return value;
}

/* ══════════════════════════════════════════════════════════════
 *  GET /api/projects/:id — Job status
 * ══════════════════════════════════════════════════════════════ */

export async function handleProjectStatus(request: Request, env: Env, projectId: string): Promise<Response> {
  const userId = await verifyToken(request, env);

  const project = await getProject(env, projectId);
  if (!project || project.user_id !== userId) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const outputs = project.outputs as { items?: { type: string; url: string; label?: string }[] } | null;
  const resultUrl = outputs?.items?.[0]?.url ?? null;

  return Response.json({
    status: project.status,
    progress: (project as any).progress ?? 0,
    logs: (project as any).logs ?? [],
    attempts: (project as any).attempts ?? 0,
    maxAttempts: (project as any).max_attempts ?? 3,
    result_url: resultUrl,
    outputs: outputs ?? null,
    error: project.error ?? null,
  });
}

/* ══════════════════════════════════════════════════════════════
 *  POST /api/enqueue — Trigger job execution
 * ══════════════════════════════════════════════════════════════ */

export async function handleEnqueue(request: Request, env: Env): Promise<Response> {
  const isServiceCall = request.headers.get("X-Service-Call") === "true";
  if (!isServiceCall) {
    await verifyToken(request, env);
  }

  const body = await request.json() as { projectId: string };
  if (!body.projectId) {
    return Response.json({ error: "projectId required" }, { status: 400 });
  }

  // Fire and forget
  const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(console.error) };
  ctx.waitUntil(runJob(env, body.projectId));

  return Response.json({ queued: true, projectId: body.projectId });
}

/* ══════════════════════════════════════════════════════════════
 *  Graph Types
 * ══════════════════════════════════════════════════════════════ */

interface TemplateNode {
  id: string;
  type: "input" | "file" | "prompt" | "nano-banana" | "kling" | "output" | "export" | string;
  data: Record<string, unknown>;
}

interface TemplateEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

/* ══════════════════════════════════════════════════════════════
 *  Topological sort
 * ══════════════════════════════════════════════════════════════ */

function topoSort(nodes: TemplateNode[], edges: TemplateEdge[]): TemplateNode[] {
  const nodeMap = new Map<string, TemplateNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: TemplateNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);
    for (const target of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, newDeg);
      if (newDeg === 0) queue.push(target);
    }
  }

  return sorted;
}

/* ══════════════════════════════════════════════════════════════
 *  Provider Adapters
 * ══════════════════════════════════════════════════════════════ */

async function callFalNanoBanana(
  env: Env,
  imageUrl: string,
  prompt: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<string> {
  const apiKey = env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY not configured in Worker secrets");

  await onProgress?.("Calling fal nano-banana-pro edit...");

  // Synchronous endpoint first
  const directRes = await fetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, image_url: imageUrl }),
  });

  if (directRes.ok) {
    const data = await directRes.json() as { images?: { url: string }[]; image?: { url: string } };
    const url = data.images?.[0]?.url || data.image?.url;
    if (url) return url;
  }

  // Queue fallback
  await onProgress?.("Falling back to queue API...");

  const submitRes = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, image_url: imageUrl }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`fal submit failed (${submitRes.status}): ${txt.slice(0, 500)}`);
  }

  const submitData = await submitRes.json() as { request_id: string };
  const requestId = submitData.request_id;
  if (!requestId) throw new Error("fal: no request_id returned");

  const statusUrl = `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}/status`;
  const responseUrl = `https://queue.fal.run/fal-ai/nano-banana-pro/edit/requests/${requestId}`;

  await onProgress?.(`fal queued (request: ${requestId.slice(0, 8)}...)`);

  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    try {
      const statusRes = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
      if (!statusRes.ok) continue;
      const status = await statusRes.json() as { status: string };
      if (status.status === "COMPLETED") {
        const resultRes = await fetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` } });
        const result = await resultRes.json() as { images?: { url: string }[]; image?: { url: string } };
        const url = result.images?.[0]?.url || result.image?.url;
        if (!url) throw new Error("fal completed but no image URL in response");
        return url;
      }
      if (status.status === "FAILED") throw new Error("fal job failed");
    } catch (e) {
      if (e instanceof Error && (e.message.includes("fal job failed") || e.message.includes("no image URL"))) throw e;
    }
  }
  throw new Error("fal job timed out after 10 minutes");
}

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

  const key = await crypto.subtle.importKey("raw", enc.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const sigB64 = b64url(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

async function callKling(
  env: Env,
  imageUrl: string,
  prompt: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<string> {
  const accessKey = env.KLING_ACCESS_KEY;
  const secretKey = env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY not configured");

  const jwt = await generateKlingJwt(accessKey, secretKey);

  const submitRes = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model_name: "kling-v1", image: imageUrl, prompt, duration: "5", mode: "std" }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`Kling submit failed (${submitRes.status}): ${txt.slice(0, 500)}`);
  }

  const submitData = await submitRes.json() as { data?: { task_id: string }; message?: string };
  const taskId = submitData.data?.task_id;
  if (!taskId) throw new Error(`Kling: no task_id — ${submitData.message || "unknown error"}`);

  await onProgress?.(`Kling task submitted (${taskId.slice(0, 8)}...)`);

  for (let i = 0; i < 180; i++) {
    await sleep(10000);
    try {
      const pollJwt = await generateKlingJwt(accessKey, secretKey);
      const statusRes = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
        headers: { Authorization: `Bearer ${pollJwt}` },
      });
      if (!statusRes.ok) continue;
      const status = await statusRes.json() as {
        data?: { task_status: string; task_result?: { videos?: { url: string }[] } };
      };
      if (status.data?.task_status === "succeed") {
        const videoUrl = status.data?.task_result?.videos?.[0]?.url;
        if (!videoUrl) throw new Error("Kling succeeded but no video URL");
        return videoUrl;
      }
      if (status.data?.task_status === "failed") throw new Error("Kling video generation failed");
    } catch (e) {
      if (e instanceof Error && e.message.includes("Kling")) throw e;
    }
  }
  throw new Error("Kling job timed out after 30 minutes");
}

/* ══════════════════════════════════════════════════════════════
 *  Upload outputs to R2
 * ══════════════════════════════════════════════════════════════ */

async function uploadToR2(
  env: Env,
  projectId: string,
  item: { type: string; url: string; label?: string },
): Promise<{ type: string; url: string; label?: string }> {
  if (!item.url) return item;
  try {
    const res = await fetch(item.url);
    if (res.ok && res.body) {
      const ext = item.type === "video" ? "mp4" : "png";
      const ct = item.type === "video" ? "video/mp4" : "image/png";
      const key = `outputs/${projectId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      await env.FUSE_ASSETS.put(key, res.body, { httpMetadata: { contentType: ct } });
      return { type: item.type, url: `${R2_PUBLIC_DOMAIN}/${key}`, label: item.label };
    }
  } catch { /* fall through */ }
  return item;
}

/* ══════════════════════════════════════════════════════════════
 *  Node Executor — executes a single node
 * ══════════════════════════════════════════════════════════════ */

async function executeNode(
  env: Env,
  projectId: string,
  node: TemplateNode,
  edges: TemplateEdge[],
  nodeOutputs: Map<string, unknown>,
  projectInputs: Record<string, string>,
  progressBase: number,
  onProgress: (pct: number, msg: string) => Promise<void>,
): Promise<unknown> {
  const type = node.type.toLowerCase();

  // ── Input / File nodes: resolve user-uploaded assets ──
  if (type === "input" || type === "file") {
    const inputKey = (node.data.key as string) || (node.data.input_key as string) || node.id;
    // Try exact key, then key_key for R2 key, then fallback
    const value = projectInputs[inputKey]
      || projectInputs[`${inputKey}_key`]
      || Object.values(projectInputs).find((v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("uploads/")))
      || "";
    const resolved = resolveImageUrl(value as string);
    await onProgress(progressBase, `Input "${inputKey}" resolved`);
    return resolved;
  }

  // ── Prompt nodes: use locked prompt from template, never user input ──
  if (type === "prompt" || type === "text") {
    const prompt = (node.data.prompt as string) || (node.data.text as string) || (node.data.value as string) || "";
    await onProgress(progressBase, `Prompt loaded (${prompt.length} chars)`);
    return prompt;
  }

  // ── Nano Banana (image edit) ──
  if (type === "nano-banana" || type === "nano_banana" || type === "image-edit" || type === "image_edit" || type === "fal") {
    // Find upstream image and prompt from edges
    const incomingEdges = edges.filter((e) => e.target === node.id);
    let imageUrl = "";
    let prompt = "professional product photo, high quality";

    for (const edge of incomingEdges) {
      const upstreamOutput = nodeOutputs.get(edge.source);
      if (typeof upstreamOutput === "string") {
        if (upstreamOutput.startsWith("http") || upstreamOutput.startsWith("uploads/")) {
          imageUrl = resolveImageUrl(upstreamOutput);
        } else if (upstreamOutput.length > 10) {
          prompt = upstreamOutput;
        }
      }
    }

    // Override prompt from node.data if locked in template
    if (node.data.prompt) prompt = node.data.prompt as string;

    if (!imageUrl) throw new Error(`nano-banana node "${node.id}": no image input found`);

    await onProgress(progressBase, `nano-banana: editing image`);
    const result = await callFalNanoBanana(env, imageUrl, prompt, async (msg) => {
      await onProgress(progressBase + 5, msg);
    });
    return result;
  }

  // ── Kling (image → video) ──
  if (type === "kling" || type === "video" || type === "image-to-video" || type === "image_to_video") {
    const incomingEdges = edges.filter((e) => e.target === node.id);
    let imageUrl = "";
    let prompt = "smooth cinematic motion, product showcase";

    for (const edge of incomingEdges) {
      const upstreamOutput = nodeOutputs.get(edge.source);
      if (typeof upstreamOutput === "string") {
        if (upstreamOutput.startsWith("http")) {
          imageUrl = upstreamOutput;
        } else if (upstreamOutput.length > 10) {
          prompt = upstreamOutput;
        }
      }
    }

    if (node.data.prompt) prompt = node.data.prompt as string;
    if (!imageUrl) throw new Error(`kling node "${node.id}": no image input found`);

    await onProgress(progressBase, `kling: generating video`);
    const result = await callKling(env, imageUrl, prompt, async (msg) => {
      await onProgress(progressBase + 5, msg);
    });
    return result;
  }

  // ── Output / Export nodes: collect final outputs ──
  if (type === "output" || type === "export") {
    const incomingEdges = edges.filter((e) => e.target === node.id);
    const collected: unknown[] = [];
    for (const edge of incomingEdges) {
      const val = nodeOutputs.get(edge.source);
      if (val) collected.push(val);
    }
    await onProgress(progressBase, `Output node collected ${collected.length} result(s)`);
    return collected.length === 1 ? collected[0] : collected;
  }

  // ── Unknown node type — pass through ──
  await onProgress(progressBase, `Skipping unknown node type "${type}"`);
  return null;
}

/* ══════════════════════════════════════════════════════════════
 *  Fallback runner — no graph, uses flat 2-step pipeline
 * ══════════════════════════════════════════════════════════════ */

async function runFlatPipeline(
  env: Env,
  projectId: string,
  template: Record<string, unknown>,
  projectInputs: Record<string, string>,
) {
  // Find image from inputs
  let imageUrl: string | undefined;
  for (const key of ["image", "image_url", "clothing_item", "photo", "input_image", "garment_file", "front_shirt"]) {
    if (projectInputs[key]?.trim()) { imageUrl = resolveImageUrl(projectInputs[key]); break; }
  }
  if (!imageUrl) {
    for (const v of Object.values(projectInputs)) {
      if (typeof v === "string" && (v.startsWith("http") || v.startsWith("uploads/"))) {
        imageUrl = resolveImageUrl(v);
        break;
      }
    }
  }

  const prompt = (template.ai_prompt as string) || "professional product photo, high quality";
  const outputType = (template.output_type as string) || "video";

  if (!imageUrl) throw new Error("No image URL found in inputs");

  await setProgress(env, projectId, 15, "Submitting to nano-banana-pro (image edit)");
  const editedImageUrl = await callFalNanoBanana(env, imageUrl, prompt, async (msg) => {
    await setProgress(env, projectId, 20, msg);
  });
  await setProgress(env, projectId, 45, "nano-banana-pro complete");

  if (outputType !== "video") {
    await setProgress(env, projectId, 90, "Uploading to storage");
    const item = await uploadToR2(env, projectId, { type: "image", url: editedImageUrl, label: "Edited Image" });
    await updateProjectStatus(env, projectId, "complete", {
      completed_at: new Date().toISOString(),
      outputs: { items: [item] },
      progress: 100,
    });
    await appendLog(env, projectId, "✅ Job complete — image saved");
    return;
  }

  await setProgress(env, projectId, 50, "Submitting to Kling (image → video)");
  const videoUrl = await callKling(env, editedImageUrl, prompt, async (msg) => {
    await setProgress(env, projectId, 55, msg);
  });
  await setProgress(env, projectId, 90, "Uploading to storage");

  const imgItem = await uploadToR2(env, projectId, { type: "image", url: editedImageUrl, label: "Edited Image" });
  const vidItem = await uploadToR2(env, projectId, { type: "video", url: videoUrl, label: "Generated Video" });

  await updateProjectStatus(env, projectId, "complete", {
    completed_at: new Date().toISOString(),
    outputs: { items: [imgItem, vidItem] },
    progress: 100,
  });
  await appendLog(env, projectId, "✅ Job complete — image + video saved");
}

/* ══════════════════════════════════════════════════════════════
 *  Graph Runner — parses raw_json, topo-sorts, executes
 * ══════════════════════════════════════════════════════════════ */

async function runGraphPipeline(
  env: Env,
  projectId: string,
  template: Record<string, unknown>,
  projectInputs: Record<string, string>,
  rawJson: { nodes: TemplateNode[]; edges: TemplateEdge[] },
) {
  const { nodes, edges } = rawJson;
  const sorted = topoSort(nodes, edges);

  await setProgress(env, projectId, 10, `Graph loaded: ${sorted.length} nodes, ${edges.length} edges`);

  const nodeOutputs = new Map<string, unknown>();
  const progressPerNode = Math.floor(70 / Math.max(sorted.length, 1));

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    const progressBase = 10 + i * progressPerNode;

    await setProgress(env, projectId, progressBase, `Executing node ${i + 1}/${sorted.length}: ${node.type} (${node.id.slice(0, 8)})`);

    const output = await executeNode(
      env, projectId, node, edges, nodeOutputs, projectInputs,
      progressBase,
      async (pct, msg) => { await setProgress(env, projectId, pct, msg); },
    );

    nodeOutputs.set(node.id, output);
  }

  // Collect final outputs from output/export nodes
  const outputNodes = sorted.filter((n) => n.type === "output" || n.type === "export");
  const finalItems: { type: string; url: string; label?: string }[] = [];

  for (const outNode of outputNodes) {
    const val = nodeOutputs.get(outNode.id);
    const urls = Array.isArray(val) ? val : [val];
    for (const u of urls) {
      if (typeof u === "string" && u.startsWith("http")) {
        const mediaType = /\.(mp4|webm|mov)/i.test(u) ? "video" : "image";
        const label = (outNode.data.label as string) || mediaType;
        const saved = await uploadToR2(env, projectId, { type: mediaType, url: u, label });
        finalItems.push(saved);
      }
    }
  }

  // If no output nodes found, scan all node outputs for URLs
  if (finalItems.length === 0) {
    for (const [, val] of nodeOutputs) {
      if (typeof val === "string" && val.startsWith("http")) {
        const mediaType = /\.(mp4|webm|mov)/i.test(val) ? "video" : "image";
        const saved = await uploadToR2(env, projectId, { type: mediaType, url: val });
        finalItems.push(saved);
      }
    }
  }

  await setProgress(env, projectId, 95, `Saving ${finalItems.length} output(s)`);

  await updateProjectStatus(env, projectId, "complete", {
    completed_at: new Date().toISOString(),
    outputs: { items: finalItems },
    progress: 100,
  });
  await appendLog(env, projectId, `✅ Graph complete — ${finalItems.length} output(s) saved`);
}

/* ══════════════════════════════════════════════════════════════
 *  Job Runner — main entry point with retry logic
 * ══════════════════════════════════════════════════════════════ */

async function runJob(env: Env, projectId: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
        method: "PATCH",
        body: { status: "running", attempts: attempt, started_at: new Date().toISOString() },
      });

      await setProgress(env, projectId, 5, `Attempt ${attempt}/${maxAttempts} — starting`);

      const project = await getProject(env, projectId);
      if (!project) throw new Error("Project not found");

      const template = await getTemplate(env, project.template_id as string);
      if (!template) throw new Error("Template not found");

      const projectInputs = (project.inputs as Record<string, string>) || {};

      // Check if template has a graph (raw_json with nodes + edges)
      const rawJson = template.raw_json as { nodes?: TemplateNode[]; edges?: TemplateEdge[] } | null;
      const hasGraph = rawJson?.nodes && Array.isArray(rawJson.nodes) && rawJson.nodes.length > 0;

      if (hasGraph) {
        await appendLog(env, projectId, `Using graph runner (${rawJson!.nodes!.length} nodes)`);
        await runGraphPipeline(env, projectId, template, projectInputs, rawJson as { nodes: TemplateNode[]; edges: TemplateEdge[] });
      } else {
        await appendLog(env, projectId, "No graph found — using flat pipeline");
        await runFlatPipeline(env, projectId, template, projectInputs);
      }

      return; // Success

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendLog(env, projectId, `❌ Attempt ${attempt} failed: ${msg}`);

      if (attempt >= maxAttempts) {
        await updateProjectStatus(env, projectId, "failed", {
          error: msg.slice(0, 5000),
          failed_at: new Date().toISOString(),
          failed_source: "job_runner",
          progress: 0,
        });
        await appendLog(env, projectId, `🛑 All ${maxAttempts} attempts exhausted`);
        return;
      }

      const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
      await appendLog(env, projectId, `Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
  }
}
