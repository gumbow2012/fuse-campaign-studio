#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://ykrrwgkxgidoavtzcumk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ??
  "<SECRET>";
const RUNNER_CODE = process.env.LAB_RUNNER_CODE ?? "693cddf7cade6477d67bb6e0";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 18 * 60 * 1000);
const IMAGE_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("src/assets/templates/raven-original.png");

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
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error ?? `${response.status} ${response.statusText}`);
  }
  return json;
}

async function getCatalog() {
  return fetchJson(`${SUPABASE_URL}/functions/v1/lab-template-catalog`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-runner-code": RUNNER_CODE,
    },
  });
}

async function startRun(versionId, inputFiles) {
  return fetchJson(`${SUPABASE_URL}/functions/v1/start-template-run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-runner-code": RUNNER_CODE,
    },
    body: JSON.stringify({
      versionId,
      inputFiles,
    }),
  });
}

async function getJobStatus(jobId) {
  return fetchJson(`${SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${jobId}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-runner-code": RUNNER_CODE,
    },
  });
}

async function waitForJob(jobId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const status = await getJobStatus(jobId);
    if (status.status === "complete" || status.status === "failed") return status;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
}

function summarizeStatus(status) {
  return {
    status: status.status,
    progress: status.progress,
    error: status.error ?? null,
    outputs: status.outputs ?? [],
    steps: (status.steps ?? []).map((step) => ({
      label: step.label,
      type: step.type,
      status: step.status,
      error: step.error ?? null,
      executionTimeMs: step.executionTimeMs ?? null,
      estimatedCostUsd: step.telemetry?.estimatedCostUsd ?? null,
      outputUrl: step.outputUrl ?? null,
      providerRequestId: step.providerRequestId ?? null,
    })),
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const dataUrl = await fileToDataUrl(IMAGE_PATH);
  const catalog = await getCatalog();
  const templates = catalog.templates ?? [];
  const outputPath = path.resolve("tmp/template-lab-report.json");

  const report = {
    startedAt,
    imagePath: IMAGE_PATH,
    templateCount: templates.length,
    results: [],
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const template of templates) {
    const requiredUploads = template.inputs.filter((input) => !input.defaultAssetUrl);
    const inputFiles = Object.fromEntries(
      requiredUploads.map((input) => [
        input.name,
        {
          dataUrl,
          filename: path.basename(IMAGE_PATH),
        },
      ]),
    );

    const result = {
      templateName: template.templateName,
      versionId: template.versionId,
      counts: template.counts,
      jobId: null,
      status: "not_started",
      error: null,
      summary: null,
    };

    try {
      console.log(`\n=== ${template.templateName} ===`);
      const started = await startRun(template.versionId, inputFiles);
      result.jobId = started.jobId;
      console.log(`Job ${started.jobId} queued`);

      const status = await waitForJob(started.jobId);
      result.status = status.status;
      result.error = status.error ?? null;
      result.summary = summarizeStatus(status);

      console.log(`${template.templateName}: ${status.status}`);
      if (status.error) console.log(`Error: ${status.error}`);
    } catch (error) {
      result.status = "failed_to_start";
      result.error = error instanceof Error ? error.message : String(error);
      console.log(`${template.templateName}: failed_to_start`);
      console.log(result.error);
    }

    report.results.push(result);
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const passed = report.results.filter((result) => result.status === "complete").length;
  const failed = report.results.length - passed;

  console.log(`\nReport written to ${outputPath}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
