#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPORT_DIR = path.resolve("tmp/template-validation-reports");
const reportPath = path.resolve(process.argv[2] ?? path.join(REPORT_DIR, "latest.json"));
const outputPath = path.resolve(process.argv[3] ?? path.join(REPORT_DIR, "approval-gallery.html"));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mediaTag(item) {
  const href = pathToFileURL(item.filePath).href;
  const label = escapeHtml(
    item.outputNumber ? `Output ${item.outputNumber}` : path.basename(item.filePath),
  );
  const filename = escapeHtml(path.basename(item.filePath));
  const isVideo = item.type === "video" || item.filePath.toLowerCase().endsWith(".mp4");

  return `
    <article class="card">
      <a class="mediaLink" href="${href}" target="_blank" rel="noreferrer">
        ${isVideo
          ? `<video src="${href}" controls muted playsinline preload="metadata"></video>`
          : `<img src="${href}" alt="${label}">`}
      </a>
      <div class="cardMeta">
        <strong>${label}</strong>
        <span>${filename}</span>
      </div>
    </article>`;
}

function promptList(result) {
  const outputs = result.detail?.exposedOutputs ?? [];
  if (!outputs.length) return "";

  return `
    <details>
      <summary>Output prompt trace</summary>
      <ol>
        ${outputs.map((output) => `
          <li>
            <strong>Output ${escapeHtml(output.outputNumber)} · Node ${escapeHtml(output.nodeNumber)} · ${escapeHtml(output.name)}</strong>
            <p>${escapeHtml(output.prompt ?? "No prompt captured")}</p>
          </li>
        `).join("")}
      </ol>
    </details>`;
}

const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const generatedAt = new Date().toISOString();

const sections = (report.results ?? []).map((result) => {
  const outputs = (result.media?.downloads ?? []).filter((item) => item.kind === "output");
  const issues = result.verdict?.issues ?? [];
  const state = result.verdict?.state ?? "unknown";

  return `
    <section class="template">
      <header>
        <div>
          <h2>${escapeHtml(result.templateName)}</h2>
          <p>v${escapeHtml(result.versionNumber)} · job ${escapeHtml(result.jobId ?? "not started")} · ${escapeHtml(result.status)}</p>
        </div>
        <div class="badges">
          <span>${outputs.length} outputs</span>
          <span class="${state === "provider_complete" ? "good" : "warn"}">${escapeHtml(state)}</span>
        </div>
      </header>
      ${issues.length ? `<p class="issues">${escapeHtml(issues.join("; "))}</p>` : ""}
      <div class="grid">
        ${outputs.map(mediaTag).join("") || `<p class="empty">No downloaded outputs for this run.</p>`}
      </div>
      ${promptList(result)}
    </section>`;
}).join("");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fuse Template Validation Outputs</title>
  <style>
    :root { color-scheme: light; --bg: #f6f5f2; --panel: #fff; --ink: #171717; --muted: #666; --line: #dedbd2; --soft: #f0eee8; --good: #157f3b; --warn: #9f5b00; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .wrap { padding: 24px; max-width: 1500px; margin: 0 auto; }
    .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-bottom: 20px; }
    h1 { font-size: 24px; line-height: 1.1; margin: 0 0 6px; }
    .top p, header p { margin: 0; color: var(--muted); font-size: 13px; }
    .template { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 14px; }
    header { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
    h2 { font-size: 17px; margin: 0 0 4px; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .badges span { border: 1px solid var(--line); background: var(--soft); border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 700; }
    .badges .good { color: var(--good); border-color: color-mix(in srgb, var(--good) 35%, var(--line)); }
    .badges .warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 35%, var(--line)); }
    .issues { margin: 0 0 12px; padding: 9px 10px; border-radius: 6px; background: #fff7ed; color: #8a3b00; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
    .card { border: 1px solid #e4e1d8; border-radius: 7px; overflow: hidden; background: #fafafa; min-width: 0; }
    .mediaLink { display: block; background: #ddd; color: inherit; text-decoration: none; }
    video, img { display: block; width: 100%; aspect-ratio: 9 / 16; object-fit: cover; background: #ddd; }
    .cardMeta { padding: 8px; display: grid; gap: 2px; }
    .cardMeta strong { font-size: 12px; }
    .cardMeta span { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    details { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
    summary { cursor: pointer; font-size: 13px; font-weight: 750; }
    ol { margin: 10px 0 0; padding-left: 20px; }
    li { margin-bottom: 10px; }
    li p { margin: 4px 0 0; color: #444; font-size: 12px; line-height: 1.45; }
    .empty { color: var(--muted); font-size: 13px; }
    @media (max-width: 680px) {
      .wrap { padding: 14px; }
      .top, header { display: block; }
      .badges { justify-content: flex-start; margin-top: 10px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <div>
        <h1>Fuse Template Validation Outputs</h1>
        <p>Report: ${escapeHtml(path.basename(reportPath))} · started ${escapeHtml(report.startedAt)} · generated ${escapeHtml(generatedAt)}</p>
      </div>
      <p>${(report.results ?? []).length} templates</p>
    </div>
    ${sections}
  </main>
</body>
</html>`;

await fs.writeFile(outputPath, html, "utf8");
console.log(outputPath);
