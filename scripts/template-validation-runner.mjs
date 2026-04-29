#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://ykrrwgkxgidoavtzcumk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ??
  "<SECRET>";
const RUNNER_CODE = process.env.LAB_RUNNER_CODE ?? "693cddf7cade6477d67bb6e0";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 8000);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 24 * 60 * 1000);
const QUEUED_RESUME_AFTER_MS = Number(process.env.QUEUED_RESUME_AFTER_MS ?? 90 * 1000);
const ASSET_DIR = path.resolve(process.env.VALIDATION_ASSET_DIR ?? "tmp/template-validation-assets");
const REPORT_DIR = path.resolve("tmp/template-validation-reports");

const args = process.argv.slice(2);
const templateArg = readArg("--template");
const versionArg = readArg("--version");
const all = args.includes("--all");
const skipTemplates = readAllArgs("--skip-template").map((name) => name.toLowerCase());
const limit = Number(readArg("--limit") ?? (all ? 999 : 1));

function readArg(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function readAllArgs(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function fileToDataUrl(filePath) {
  const bytes = await fs.readFile(filePath);
  return `data:${mimeTypeFor(filePath)};base64,${bytes.toString("base64")}`;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error ?? `${response.status} ${response.statusText}`);
  }
  return data;
}

function runnerHeaders(extra = {}) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "x-runner-code": RUNNER_CODE,
    ...extra,
  };
}

async function getCatalog() {
  return fetchJson(`${SUPABASE_URL}/functions/v1/lab-template-catalog`, {
    headers: runnerHeaders(),
  });
}

async function getDetail(versionId) {
  return fetchJson(`${SUPABASE_URL}/functions/v1/lab-template-detail?versionId=${encodeURIComponent(versionId)}`, {
    headers: runnerHeaders(),
  });
}

async function startRun(versionId, inputFiles) {
  return fetchJson(`${SUPABASE_URL}/functions/v1/start-template-run`, {
    method: "POST",
    headers: runnerHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ versionId, inputFiles }),
  });
}

async function getJobStatus(jobId) {
  return fetchJson(`${SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${encodeURIComponent(jobId)}`, {
    headers: runnerHeaders(),
  });
}

async function resumeJob(jobId) {
  return fetchJson(`${SUPABASE_URL}/functions/v1/resume-template-job`, {
    method: "POST",
    headers: runnerHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ jobId }),
  });
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  let resumeAttempted = false;
  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const status = await getJobStatus(jobId);
    if (status.status === "complete" || status.status === "failed") return status;
    if (
      !resumeAttempted &&
      status.status === "queued" &&
      Number(status.progress ?? 0) === 0 &&
      Date.now() - startedAt > QUEUED_RESUME_AFTER_MS
    ) {
      resumeAttempted = true;
      console.log(`  ${jobId.slice(0, 8)} queued at 0%; resuming executor`);
      await resumeJob(jobId);
    }
    console.log(`  ${jobId.slice(0, 8)} ${status.status} ${status.progress ?? 0}%`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function slugify(value) {
  return String(value ?? "template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "template";
}

function pickAsset(templateName, input) {
  const normalizedTemplateName = normalize(templateName);
  const label = normalize(`${input.id} ${input.name} ${input.expected}`);
  if (normalizedTemplateName.includes("jeans")) return "jeans-garment.png";
  if (normalizedTemplateName.includes("raven")) return "raven-hoodie.png";
  if (label.includes("logo")) return "logo.png";
  if (label.includes("back")) return "back-garment.png";
  if (label.includes("bottom") || label.includes("pants") || label.includes("jeans")) return "bottom-garment.png";
  if (label.includes("top") || label.includes("shirt") || label.includes("hoodie")) return "top-garment.png";
  if (label.includes("accessory") || label.includes("sunglass") || label.includes("glasses")) return "accessory.png";
  return "front-garment.png";
}

async function buildInputFiles(template) {
  const inputFiles = {};
  const picked = [];
  for (const input of template.inputs ?? []) {
    if (input.defaultAssetUrl) continue;
    const filename = pickAsset(template.templateName, input);
    const filePath = path.join(ASSET_DIR, filename);
    inputFiles[input.name] = {
      filename,
      dataUrl: await fileToDataUrl(filePath),
    };
    picked.push({ slot: input.name, slotId: input.id, filename });
  }
  return { inputFiles, picked };
}

function summarizeSteps(status) {
  return (status.steps ?? []).map((step) => ({
    label: step.label,
    type: step.type,
    status: step.status,
    error: step.error ?? null,
    outputNumber: step.outputNumber ?? null,
    outputUrl: step.outputUrl ?? null,
    providerRequestId: step.providerRequestId ?? null,
    executionTimeMs: step.executionTimeMs ?? null,
    inputPayload: step.inputPayload ?? {},
    telemetry: step.telemetry ?? null,
  }));
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
}

async function downloadRunMedia(result) {
  if (!result.jobId) return null;
  const dir = path.join(REPORT_DIR, `${slugify(result.templateName)}-${result.jobId.slice(0, 8)}`);
  const downloads = [];

  for (const [index, step] of result.steps.entries()) {
    if (!step.outputUrl) continue;
    const extension = step.type === "video_gen" ? "mp4" : "png";
    const filePath = path.join(dir, `step-${index + 1}-${slugify(step.label)}.${extension}`);
    await downloadFile(step.outputUrl, filePath);
    downloads.push({ kind: "step", label: step.label, type: step.type, filePath, url: step.outputUrl });
  }

  for (const output of result.outputs) {
    if (!output.url) continue;
    const extension = output.type === "video" ? "mp4" : "png";
    const filePath = path.join(dir, `output-${output.outputNumber ?? downloads.length + 1}.${extension}`);
    await downloadFile(output.url, filePath);
    downloads.push({ kind: "output", label: output.label, type: output.type, outputNumber: output.outputNumber, filePath, url: output.url });
  }

  return { dir, downloads };
}

function preliminaryVerdict(template, detail, status) {
  const outputs = status.outputs ?? [];
  const stepErrors = (status.steps ?? []).filter((step) => step.status === "failed" || step.error);
  const exposedExpected = detail.nodes.filter((node) => node.outputNumber).length;

  const issues = [];
  if (status.status !== "complete") issues.push(`job status is ${status.status}`);
  if (status.error) issues.push(status.error);
  if (stepErrors.length) issues.push(`${stepErrors.length} failed step(s)`);
  if (!outputs.length) issues.push("no final outputs returned");
  if (exposedExpected && outputs.length < exposedExpected) {
    issues.push(`expected ${exposedExpected} exposed outputs, got ${outputs.length}`);
  }

  return {
    state: issues.length ? "needs_review" : "provider_complete",
    issues,
    outputCount: outputs.length,
    exposedExpected,
    note: "Provider completion only. Visual/prompt match still needs inspection before green light.",
  };
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const catalog = await getCatalog();
  const allTemplates = catalog.templates ?? [];
  const selected = allTemplates
    .filter((template) => !templateArg || template.templateName.toLowerCase() === templateArg.toLowerCase())
    .filter((template) => !versionArg || template.versionId === versionArg)
    .filter((template) => !skipTemplates.includes(template.templateName.toLowerCase()))
    .slice(0, limit);

  if (!selected.length) {
    throw new Error(`No template matched ${templateArg ?? versionArg ?? "selection"}`);
  }

  const report = {
    startedAt: new Date().toISOString(),
    assetDir: ASSET_DIR,
    requested: { template: templateArg, version: versionArg, all, limit },
    results: [],
  };

  for (const template of selected) {
    console.log(`\n=== ${template.templateName} v${template.versionNumber} ===`);
    const result = {
      templateName: template.templateName,
      versionId: template.versionId,
      versionNumber: template.versionNumber,
      jobId: null,
      status: "not_started",
      pickedInputs: [],
      detail: null,
      outputs: [],
      steps: [],
      media: null,
      verdict: null,
      error: null,
    };

    try {
      const detail = await getDetail(template.versionId);
      result.detail = {
        nodes: detail.nodes.length,
        edges: detail.edges.length,
        exposedOutputs: detail.nodes.filter((node) => node.outputNumber).map((node) => ({
          outputNumber: node.outputNumber,
          nodeNumber: node.nodeNumber,
          name: node.name,
          nodeType: node.nodeType,
          prompt: node.prompt,
        })),
      };

      const { inputFiles, picked } = await buildInputFiles(template);
      result.pickedInputs = picked;

      console.log(`  inputs: ${picked.map((item) => `${item.slot}=${item.filename}`).join(", ") || "none"}`);
      const started = await startRun(template.versionId, inputFiles);
      result.jobId = started.jobId;
      console.log(`  job: ${started.jobId}`);

      const status = await waitForJob(started.jobId);
      result.status = status.status;
      result.outputs = status.outputs ?? [];
      result.steps = summarizeSteps(status);
      result.error = status.error ?? null;
      result.verdict = preliminaryVerdict(template, detail, status);
      result.media = await downloadRunMedia(result);
      console.log(`  result: ${status.status}, outputs=${result.outputs.length}`);
      if (result.media?.dir) console.log(`  media: ${result.media.dir}`);
      if (result.verdict.issues.length) console.log(`  issues: ${result.verdict.issues.join("; ")}`);
    } catch (error) {
      result.status = "failed_to_start_or_poll";
      result.error = error instanceof Error ? error.message : String(error);
      result.verdict = {
        state: "blocked",
        issues: [result.error],
      };
      console.log(`  blocked: ${result.error}`);
    }

    report.results.push(result);
    const partialPath = path.join(REPORT_DIR, "latest.json");
    await fs.writeFile(partialPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  report.completedAt = new Date().toISOString();
  const stamp = report.completedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(REPORT_DIR, `validation-${stamp}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(REPORT_DIR, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nReport: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
