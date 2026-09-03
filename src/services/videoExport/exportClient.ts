/**
 * Main-thread controller for the export worker.
 * Owns worker lifecycle, background pre-render, and export status so the UI can stay
 * responsive (and keep editing) while a render runs.
 */
import ExportWorker from "@/workers/campaignExport.worker.ts?worker";
import {
  exportFileName,
  segmentCacheKey,
  type ExportTarget,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerSegment,
} from "./types";

export type ExportPhase = "idle" | "preparing" | "rendering" | "done" | "error" | "unsupported";

export type ExportStatus = {
  phase: ExportPhase;
  progress: number;
  stage: string;
  fileName: string | null;
  downloadUrl: string | null;
  durationMs: number;
  error: string | null;
  cachedKeys: string[];
  prerender: { done: number; total: number };
};

const INITIAL: ExportStatus = {
  phase: "idle",
  progress: 0,
  stage: "",
  fileName: null,
  downloadUrl: null,
  durationMs: 0,
  error: null,
  cachedKeys: [],
  prerender: { done: 0, total: 0 },
};

export type { WorkerSegment, ExportTarget };
export { segmentCacheKey, exportFileName };

class CampaignExportController {
  private worker: Worker | null = null;
  private listeners = new Set<(status: ExportStatus) => void>();
  private status: ExportStatus = INITIAL;
  private jobId: string | null = null;
  private supported = true;

  subscribe(listener: (status: ExportStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus() {
    return this.status;
  }

  private emit(patch: Partial<ExportStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") return null;
    try {
      const worker = new ExportWorker();
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data);
      worker.onerror = () =>
        this.emit({ phase: "error", error: "The export engine could not start in this browser." });
      this.worker = worker;
      return worker;
    } catch {
      this.emit({ phase: "unsupported", error: "This browser can't render video locally." });
      return null;
    }
  }

  private handle(message: WorkerResponse) {
    switch (message.type) {
      case "ready":
        this.supported = message.supported;
        if (!message.supported && this.status.phase === "idle") {
          this.emit({ phase: "unsupported" });
        }
        return;
      case "cached":
        this.emit({ cachedKeys: [...new Set([...this.status.cachedKeys, ...message.keys])] });
        return;
      case "prerender-progress":
        this.emit({ prerender: { done: message.done, total: message.total } });
        return;
      case "export-progress":
        if (message.jobId !== this.jobId) return;
        this.emit({ phase: "rendering", progress: message.progress, stage: message.stage });
        return;
      case "export-done": {
        if (message.jobId !== this.jobId) return;
        if (this.status.downloadUrl) URL.revokeObjectURL(this.status.downloadUrl);
        const url = URL.createObjectURL(new Blob([message.buffer], { type: "video/mp4" }));
        this.emit({
          phase: "done",
          progress: 100,
          stage: "Ready",
          downloadUrl: url,
          fileName: message.fileName,
          durationMs: message.durationMs,
          error: null,
        });
        triggerDownload(url, message.fileName);
        return;
      }
      case "export-error":
        if (message.jobId !== this.jobId) return;
        this.emit({ phase: "error", error: message.message, stage: "" });
        return;
    }
  }

  isSupported() {
    return this.supported && typeof Worker !== "undefined";
  }

  /** Warm the cache in the background — safe to call on every edit. */
  prerender(segments: WorkerSegment[], target: ExportTarget) {
    if (!segments.length) return;
    const worker = this.ensureWorker();
    if (!worker) return;
    this.emit({ prerender: { done: 0, total: segments.length } });
    this.send({ type: "prerender", segments, target });
  }

  /** Drop cached renders whose signature no longer exists (edits, removals). */
  syncCache(segments: WorkerSegment[], target: ExportTarget) {
    if (!this.worker) return;
    const keys = segments.map((segment) => segmentCacheKey(segment, target));
    this.send({ type: "keep", keys });
    this.emit({ cachedKeys: this.status.cachedKeys.filter((key) => keys.includes(key)) });
  }

  start(segments: WorkerSegment[], target: ExportTarget, projectName: string | null) {
    const worker = this.ensureWorker();
    if (!worker || !this.supported) {
      this.emit({ phase: "unsupported", error: "This browser can't render video locally." });
      return;
    }
    if (this.status.downloadUrl) URL.revokeObjectURL(this.status.downloadUrl);
    this.jobId = `export-${Date.now()}`;
    this.emit({
      phase: "preparing",
      progress: 0,
      stage: "Preparing clips",
      error: null,
      downloadUrl: null,
      fileName: null,
    });
    this.send({
      type: "export",
      jobId: this.jobId,
      segments,
      target,
      fileName: exportFileName(projectName),
    });
  }

  cancel() {
    if (!this.jobId) return;
    this.send({ type: "cancel", jobId: this.jobId });
    this.jobId = null;
    this.emit({ phase: "idle", progress: 0, stage: "" });
  }

  reset() {
    if (this.status.downloadUrl) URL.revokeObjectURL(this.status.downloadUrl);
    this.jobId = null;
    this.status = { ...INITIAL, cachedKeys: this.status.cachedKeys };
    for (const listener of this.listeners) listener(this.status);
  }

  private send(request: WorkerRequest) {
    this.worker?.postMessage(request);
  }
}

function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export const campaignExport = new CampaignExportController();
export { triggerDownload };
