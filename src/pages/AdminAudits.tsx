import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileJson,
  Loader2,
  MessagesSquare,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  User2,
  Wand2,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  fetchAdminAuditDetail,
  fetchAdminAuditQueue,
  submitAdminOutputReport,
  submitAdminTemplateAudit,
  type AdminAuditDetailResponse,
  type AdminAuditQueueItem,
  type AdminAuditRecord,
} from "@/services/fuseApi";

type QueueFilter = "all" | "pending" | "needs_attention" | "approved";
type DateWindow = "all" | "24h" | "7d" | "30d";

type AuditDraft = {
  verdict: string;
  outputQualityScore: number;
  brandAlignmentScore: number;
  promptAdherenceScore: number;
  inputFidelityScore: number;
  failureTags: string[];
  automationFlags: string[];
  summary: string;
  keepers: string;
  changeRequest: string;
  promptToOutputNotes: string;
};

type OutputReportDraft = {
  verdict: "good" | "iffy" | "bad";
  issueTags: string[];
  severity: "low" | "medium" | "high" | "blocking";
  note: string;
  recommendedFix: string;
  status: "open" | "fixed" | "wont_fix";
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(value: number | null | undefined) {
  if (value == null) return "Pending";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatUsd(value: number | null | undefined) {
  if (value == null) return "Pending";
  return `$${value.toFixed(4)}`;
}

function formatSigned(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function formatShortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ");
}

function displayRunOwner(job: Pick<AdminAuditQueueItem, "userId" | "userName" | "userEmail">) {
  if (!job.userId) return "System validation run";
  return job.userName || job.userEmail || "Unknown subscriber";
}

function displayDetailOwner(job: AdminAuditDetailResponse["job"]) {
  if (!job.user.id) return "System validation run";
  return job.user.name || job.user.email || "Unknown subscriber";
}

function verdictDisplayLabel(verdict: string | null | undefined) {
  if (verdict === "approved") return "Good";
  if (verdict === "needs_work") return "Iffy";
  if (verdict === "blocked" || verdict === "critical") return "Bad";
  return "Pending";
}

function queueDisplayLabel(state: QueueFilter | AdminAuditQueueItem["queueState"]) {
  if (state === "approved") return "Good";
  if (state === "needs_attention") return "Iffy / bad";
  if (state === "pending") return "Pending";
  return "All";
}

function isLikelyAssetUrl(value: string | null | undefined) {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function getDateCutoff(window: DateWindow) {
  const now = Date.now();
  if (window === "24h") return now - 24 * 60 * 60 * 1000;
  if (window === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (window === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function summarizePrompt(prompt: string | null | undefined) {
  if (!prompt) return "No prompt captured";
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "No prompt captured";
  return normalized.length > 140 ? `${normalized.slice(0, 140)}…` : normalized;
}

function isPublishBlockingReport(report: AdminOutputReportRecord) {
  if (report.status === "fixed") return false;
  return report.status === "open" || report.verdict !== "good" || report.severity === "blocking";
}

function buildRunBundle(
  detail: AdminAuditDetailResponse,
  outputNumber?: number,
) {
  const selectedOutputs = outputNumber
    ? detail.job.outputs.filter((output) => output.outputNumber === outputNumber)
    : detail.job.outputs;
  const selectedStepIds = new Set(
    selectedOutputs
      .map((output) => output.stepId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const selectedSteps = selectedStepIds.size
    ? detail.job.steps.filter((step) => selectedStepIds.has(step.id))
    : detail.job.steps;

  const lines = [
    `FUSE quality debug bundle`,
    `Run ID: ${detail.job.jobId}`,
    `Template: ${detail.job.template.templateName}`,
    `Version: ${detail.job.template.versionNumber ?? "unknown"} (${detail.job.template.reviewStatus})`,
    `Subscriber: ${displayDetailOwner(detail.job)}`,
    `Plan: ${detail.job.user.plan ?? "free"} (${detail.job.user.subscriptionStatus ?? "inactive"})`,
    `Status: ${detail.job.status}`,
    `Started: ${detail.job.startedAt ?? "pending"}`,
    `Completed: ${detail.job.completedAt ?? "pending"}`,
    `Output count: ${selectedOutputs.length}`,
    `Output cost: ${formatUsd(selectedOutputs.reduce((sum, output) => sum + Number(output.estimatedCostUsd ?? 0), 0))}`,
    `Output time: ${formatDuration(selectedOutputs.reduce((sum, output) => sum + Number(output.executionTimeMs ?? 0), 0))}`,
    "",
    "Subscriber inputs:",
    ...detail.job.userInputs.map((input) =>
      `- ${input.name} (${input.expected}): ${input.value ?? "No captured value"}`
    ),
    "",
    "Outputs:",
    ...selectedOutputs.flatMap((output) => [
      `- Output ${output.outputNumber}: ${output.label}`,
      `  type: ${output.type}`,
      `  cost: ${formatUsd(output.estimatedCostUsd)}`,
      `  duration: ${formatDuration(output.executionTimeMs)}`,
      `  url: ${output.url}`,
    ]),
    "",
    "Prompt trace:",
    ...selectedSteps.flatMap((step, index) => [
      `- Step ${index + 1}: ${step.label} (${step.type}, ${step.status})`,
      `  model: ${step.providerModel || "internal"}`,
      `  cost: ${formatUsd(typeof step.telemetry?.estimatedCostUsd === "number" ? step.telemetry.estimatedCostUsd : null)}`,
      `  duration: ${formatDuration(step.executionTimeMs)}`,
      `  prompt: ${step.prompt ?? "No prompt captured"}`,
      `  output: ${step.outputUrl ?? "No output url"}`,
      `  error: ${step.error ?? "none"}`,
    ]),
  ];

  if (detail.quickFeedback.length) {
    lines.push("", "Tester feedback:");
    lines.push(
      ...detail.quickFeedback.map((entry) =>
        `- ${entry.userName || entry.userEmail || entry.userId}: ${entry.vote ?? "note"}${entry.feedback ? ` | ${entry.feedback}` : ""}`
      ),
    );
  }

  return lines.join("\n");
}

function buildAuditJson(detail: AdminAuditDetailResponse, outputNumber?: number) {
  const outputs = outputNumber
    ? detail.job.outputs.filter((output) => output.outputNumber === outputNumber)
    : detail.job.outputs;
  const outputNumbers = new Set(outputs.map((output) => output.outputNumber));
  const stepIds = new Set(outputs.map((output) => output.stepId).filter(Boolean));

  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    run: {
      id: detail.job.jobId,
      status: detail.job.status,
      progress: detail.job.progress,
      startedAt: detail.job.startedAt,
      completedAt: detail.job.completedAt,
      owner: displayDetailOwner(detail.job),
      user: detail.job.user,
      error: detail.job.error,
    },
    template: detail.job.template,
    outputs,
    outputReports: detail.outputReports.filter((report) => outputNumbers.has(report.outputNumber)),
    adminAudits: detail.audits,
    quickFeedback: detail.quickFeedback,
    prompts: detail.job.steps
      .filter((step) => !stepIds.size || stepIds.has(step.id))
      .map((step, index) => ({
        stepNumber: index + 1,
        id: step.id,
        nodeId: step.nodeId,
        label: step.label,
        type: step.type,
        status: step.status,
        providerModel: step.providerModel,
        prompt: step.prompt,
        sourceInputs: step.sourceInputs,
        outputUrl: step.outputUrl,
        error: step.error,
      })),
  }, null, 2);
}

function buildComparisonBundle(
  primary: AdminAuditDetailResponse,
  comparison: AdminAuditDetailResponse,
) {
  const lines = [
    `FUSE run comparison bundle`,
    `Primary run: ${primary.job.jobId}`,
    `Comparison run: ${comparison.job.jobId}`,
    `Primary template: ${primary.job.template.templateName} v${primary.job.template.versionNumber ?? "?"}`,
    `Comparison template: ${comparison.job.template.templateName} v${comparison.job.template.versionNumber ?? "?"}`,
    `Primary subscriber: ${displayDetailOwner(primary.job)}`,
    `Comparison subscriber: ${displayDetailOwner(comparison.job)}`,
    "",
    `Output count delta: ${formatSigned(primary.job.outputs.length - comparison.job.outputs.length)}`,
    `Output cost delta: ${formatUsd(primary.job.outputTotals.estimatedCostUsd - comparison.job.outputTotals.estimatedCostUsd)}`,
    `Output time delta: ${formatSigned(primary.job.outputTotals.executionTimeMs - comparison.job.outputTotals.executionTimeMs, " ms")}`,
    "",
    "Primary outputs:",
    ...primary.job.outputs.map((output) =>
      `- Output ${output.outputNumber}: ${output.label} | ${output.type} | ${formatUsd(output.estimatedCostUsd)} | ${formatDuration(output.executionTimeMs)} | ${output.url}`
    ),
    "",
    "Comparison outputs:",
    ...comparison.job.outputs.map((output) =>
      `- Output ${output.outputNumber}: ${output.label} | ${output.type} | ${formatUsd(output.estimatedCostUsd)} | ${formatDuration(output.executionTimeMs)} | ${output.url}`
    ),
    "",
    "Primary prompts:",
    ...primary.job.steps.map((step, index) =>
      `- Step ${index + 1}: ${step.label} | ${summarizePrompt(step.prompt)}`
    ),
    "",
    "Comparison prompts:",
    ...comparison.job.steps.map((step, index) =>
      `- Step ${index + 1}: ${step.label} | ${summarizePrompt(step.prompt)}`
    ),
  ];

  return lines.join("\n");
}

function computeOverallScore(draft: AuditDraft) {
  const scores = [
    draft.outputQualityScore,
    draft.brandAlignmentScore,
    draft.promptAdherenceScore,
    draft.inputFidelityScore,
  ];
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / (scores.length * 5)) * 100);
}

function queueBadgeClass(state: QueueFilter | AdminAuditQueueItem["queueState"]) {
  if (state === "approved") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (state === "needs_attention") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  return "border-slate-400/30 bg-slate-400/10 text-slate-200";
}

function verdictBadgeClass(verdict: string | null | undefined) {
  if (verdict === "approved") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (verdict === "critical") return "border-rose-400/30 bg-rose-400/10 text-rose-100";
  if (verdict === "blocked") return "border-orange-400/30 bg-orange-400/10 text-orange-100";
  if (verdict === "needs_work") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  return "border-slate-400/30 bg-slate-400/10 text-slate-200";
}

function outputFrameClass(compact = false) {
  return compact
    ? "h-28 w-full rounded-2xl border border-white/10 bg-black/30 object-cover"
    : "w-full rounded-2xl border border-white/10 bg-black/30 object-cover";
}

function OutputFrame({
  type,
  url,
  label,
  compact = false,
}: {
  type: "image" | "video" | string;
  url: string;
  label: string;
  compact?: boolean;
}) {
  if (type === "video") {
    return (
      <video
        src={url}
        controls
        className={cn(outputFrameClass(compact), "aspect-[9/16]")}
      />
    );
  }

  return (
    <img
      src={url}
      alt={label}
      className={cn(outputFrameClass(compact), "aspect-[9/16]")}
    />
  );
}

function buildDraft(detail: AdminAuditDetailResponse | undefined) {
  const existing = detail?.currentUserAudit;
  const suggested = detail?.suggestedAudit;

  return {
    verdict: existing?.verdict ?? suggested?.verdict ?? "needs_work",
    outputQualityScore: existing?.outputQualityScore ?? 3,
    brandAlignmentScore: existing?.brandAlignmentScore ?? 3,
    promptAdherenceScore: existing?.promptAdherenceScore ?? 3,
    inputFidelityScore: existing?.inputFidelityScore ?? 3,
    failureTags: existing?.failureTags ?? suggested?.failureTags ?? [],
    automationFlags: existing?.automationFlags ?? suggested?.automationFlags ?? [],
    summary: existing?.summary ?? suggested?.summary ?? "",
    keepers: existing?.keepers ?? "",
    changeRequest: existing?.changeRequest ?? "",
    promptToOutputNotes: existing?.promptToOutputNotes ?? "",
  } satisfies AuditDraft;
}

function buildOutputReportDrafts(detail: AdminAuditDetailResponse | undefined) {
  const drafts: Record<number, OutputReportDraft> = {};

  for (const output of detail?.job.outputs ?? []) {
    const existing = detail?.outputReports?.find((report) => report.outputNumber === output.outputNumber);
    drafts[output.outputNumber] = {
      verdict: existing?.verdict ?? "iffy",
      issueTags: existing?.issueTags ?? [],
      severity: existing?.severity ?? "medium",
      note: existing?.note ?? "",
      recommendedFix: existing?.recommendedFix ?? "",
      status: existing?.status ?? "open",
    };
  }

  return drafts;
}

function ScoreSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold text-foreground">{value}/5</span>
      </div>
      <select
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
      >
        {[1, 2, 3, 4, 5].map((score) => (
          <option key={score} value={score}>
            {score} / 5
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickFeedbackList({
  feedback,
}: {
  feedback: AdminAuditDetailResponse["quickFeedback"];
}) {
  if (!feedback.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
        No tester feedback on this run yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((entry) => (
        <div key={`${entry.userId}-${entry.updatedAt}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {entry.userName || entry.userEmail || formatShortId(entry.userId)}
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {formatTimestamp(entry.updatedAt)}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                entry.vote === "down"
                  ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                  : entry.vote === "up"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground",
              )}
            >
              {entry.vote === "down" ? "Thumbs Down" : entry.vote === "up" ? "Thumbs Up" : "Note"}
            </Badge>
          </div>
          {entry.feedback ? (
            <p className="mt-3 text-sm leading-6 text-slate-300">{entry.feedback}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function StepTraceCard({
  index,
  step,
}: {
  index: number;
  step: AdminAuditDetailResponse["job"]["steps"][number];
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Step {index + 1}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{step.label}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {step.type} · {step.providerModel || "internal"} · {step.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
            {formatDuration(step.executionTimeMs)}
          </Badge>
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
            {formatUsd(typeof step.telemetry?.estimatedCostUsd === "number" ? step.telemetry.estimatedCostUsd : null)}
          </Badge>
          {step.error ? (
            <Badge variant="outline" className="border-rose-400/30 bg-rose-400/10 text-rose-100">
              Error
            </Badge>
          ) : null}
        </div>
      </div>

      {step.prompt ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Prompt</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{step.prompt}</pre>
        </div>
      ) : null}

      {step.sourceInputs.length ? (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Incoming Inputs</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {step.sourceInputs.map((input) => (
              <div key={`${step.id}-${input.sourceNodeId}-${input.targetParam}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{input.sourceName}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      input.isHiddenReference
                        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                        : "border-white/10 bg-white/[0.03] text-slate-200",
                    )}
                  >
                    {input.isHiddenReference ? "Hidden Ref" : "User Input"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {input.targetParam || "input"}
                </p>
                {input.sourceUrl ? (
                  <img
                    src={input.sourceUrl}
                    alt={input.sourceName}
                    className="mt-3 aspect-[9/16] w-full rounded-xl border border-white/10 object-cover"
                  />
                ) : (
                  <div className="mt-3 flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-muted-foreground">
                    No asset captured
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step.outputUrl ? (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Step Output</p>
          <div className="mt-3 max-w-md">
            <OutputFrame type={step.type === "video_gen" ? "video" : "image"} url={step.outputUrl} label={step.label} />
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Started {formatTimestamp(step.startedAt)}</span>
        <span>Completed {formatTimestamp(step.completedAt)}</span>
        {step.providerRequestId ? <span>Request {formatShortId(step.providerRequestId)}</span> : null}
      </div>

      {step.error ? (
        <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
          {step.error}
        </div>
      ) : null}
    </div>
  );
}

function AuditQueueCard({
  job,
  selected,
  onSelect,
}: {
  job: AdminAuditQueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[1.5rem] border p-4 text-left transition-colors",
        selected
          ? "border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.18)]"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{job.templateName}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Run {formatShortId(job.id)} · v{job.versionNumber ?? "?"}
          </p>
          <p className="mt-2 truncate text-xs text-slate-300">
            {displayRunOwner(job)}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline" className={queueBadgeClass(job.queueState)}>
          {queueDisplayLabel(job.queueState)}
        </Badge>
        <Badge variant="outline" className={verdictBadgeClass(job.audits.latestVerdict)}>
          {verdictDisplayLabel(job.audits.latestVerdict)}
        </Badge>
        {job.outputReports?.openCount ? (
          <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-amber-100">
            {job.outputReports.openCount} open reports
          </Badge>
        ) : null}
      </div>

      {job.outputPreviewUrl ? (
        <div className="mt-4">
          <OutputFrame
            type={job.outputPreviewType ?? "image"}
            url={job.outputPreviewUrl}
            label={job.templateName}
            compact
          />
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          <p className="uppercase tracking-[0.18em]">Feedback</p>
          <p className="mt-1 text-sm text-foreground">
            {job.quickFeedback.downvotes} down · {job.quickFeedback.upvotes} up
          </p>
        </div>
        <div>
          <p className="uppercase tracking-[0.18em]">Subscriber</p>
          <p className="mt-1 text-sm text-foreground">
            {job.userPlan ?? "free"} · {job.userSubscriptionStatus ?? "inactive"}
          </p>
        </div>
      </div>

      {job.audits.latestSummary ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">
          {job.audits.latestSummary}
        </p>
      ) : job.quickFeedback.latestComment ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">
          {job.quickFeedback.latestComment}
        </p>
      ) : null}
    </button>
  );
}

const AdminAudits = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobIdParam = searchParams.get("jobId");
  const versionIdParam = searchParams.get("versionId");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("30d");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [comparisonJobId, setComparisonJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AuditDraft | null>(null);
  const [outputReportDrafts, setOutputReportDrafts] = useState<Record<number, OutputReportDraft>>({});
  const [expandedReports, setExpandedReports] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [reportSaving, setReportSaving] = useState<number | null>(null);

  const queueQuery = useQuery({
    queryKey: ["admin-audit-queue"],
    queryFn: () => fetchAdminAuditQueue(50),
    enabled: isAdmin,
    retry: false,
  });

  const allJobs = useMemo(() => queueQuery.data?.jobs ?? [], [queueQuery.data?.jobs]);

  const templateOptions = useMemo(
    () => [...new Set(allJobs.map((job) => job.templateName).filter(Boolean))].sort(),
    [allJobs],
  );
  const planOptions = useMemo(
    () => [...new Set(allJobs.map((job) => job.userPlan ?? "free"))].sort(),
    [allJobs],
  );
  const subscriptionOptions = useMemo(
    () => [...new Set(allJobs.map((job) => job.userSubscriptionStatus ?? "inactive"))].sort(),
    [allJobs],
  );

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const cutoff = getDateCutoff(dateWindow);

    return allJobs.filter((job) => {
      if (!jobIdParam && versionIdParam && job.versionId !== versionIdParam) return false;
      if (filter !== "all" && job.queueState !== filter) return false;
      if (templateFilter !== "all" && job.templateName !== templateFilter) return false;
      if (planFilter !== "all" && (job.userPlan ?? "free") !== planFilter) return false;
      if (subscriptionFilter !== "all" && (job.userSubscriptionStatus ?? "inactive") !== subscriptionFilter) return false;
      if (cutoff) {
        const jobTimestamp = job.runAt ?? job.startedAt ?? job.completedAt;
        if (!jobTimestamp || new Date(jobTimestamp).getTime() < cutoff) return false;
      }
      if (!query) return true;

      return [
        job.templateName,
        job.userName,
        job.userEmail,
        job.id,
        job.reviewStatus,
        job.audits.latestSummary,
        job.quickFeedback.latestComment,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [allJobs, dateWindow, filter, jobIdParam, planFilter, search, subscriptionFilter, templateFilter, versionIdParam]);

  const selectedQueueItem = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId],
  );

  useEffect(() => {
    if (jobIdParam && allJobs.some((job) => job.id === jobIdParam)) {
      setSelectedJobId(jobIdParam);
      if (search) setSearch("");
      if (filter !== "all") setFilter("all");
      if (dateWindow !== "all") setDateWindow("all");
      if (templateFilter !== "all") setTemplateFilter("all");
      if (planFilter !== "all") setPlanFilter("all");
      if (subscriptionFilter !== "all") setSubscriptionFilter("all");
    }
  }, [allJobs, dateWindow, filter, jobIdParam, planFilter, search, subscriptionFilter, templateFilter]);

  useEffect(() => {
    if (!versionIdParam || jobIdParam) return;
    if (search) setSearch("");
    if (filter !== "all") setFilter("all");
    if (dateWindow !== "all") setDateWindow("all");
    if (templateFilter !== "all") setTemplateFilter("all");
    if (planFilter !== "all") setPlanFilter("all");
    if (subscriptionFilter !== "all") setSubscriptionFilter("all");
  }, [dateWindow, filter, jobIdParam, planFilter, search, subscriptionFilter, templateFilter, versionIdParam]);

  useEffect(() => {
    if (!filteredJobs.length) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) return;
    if (searchParams.get("jobId") === selectedJobId) return;
    const next = new URLSearchParams(searchParams);
    next.set("jobId", selectedJobId);
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedJobId, setSearchParams]);

  const detailQuery = useQuery({
    queryKey: ["admin-audit-detail", selectedJobId],
    queryFn: () => fetchAdminAuditDetail(selectedJobId!),
    enabled: isAdmin && !!selectedJobId,
    retry: false,
  });

  const comparisonCandidates = useMemo(() => {
    if (!selectedQueueItem) return [];

    return allJobs
      .filter((job) => job.id !== selectedQueueItem.id)
      .sort((left, right) => {
        const score = (job: AdminAuditQueueItem) => {
          let value = 0;
          if (job.templateId && job.templateId === selectedQueueItem.templateId) value += 5;
          else if (job.templateName === selectedQueueItem.templateName) value += 4;
          if (job.userId && job.userId === selectedQueueItem.userId) value += 3;
          else if (job.userEmail && job.userEmail === selectedQueueItem.userEmail) value += 2;
          return value;
        };

        const scoreDelta = score(right) - score(left);
        if (scoreDelta !== 0) return scoreDelta;

        return new Date(right.runAt ?? right.startedAt ?? right.completedAt ?? 0).getTime()
          - new Date(left.runAt ?? left.startedAt ?? left.completedAt ?? 0).getTime();
      });
  }, [allJobs, selectedQueueItem]);

  useEffect(() => {
    if (!comparisonJobId) return;
    if (comparisonJobId === selectedJobId || !comparisonCandidates.some((job) => job.id === comparisonJobId)) {
      setComparisonJobId(null);
    }
  }, [comparisonCandidates, comparisonJobId, selectedJobId]);

  const comparisonDetailQuery = useQuery({
    queryKey: ["admin-audit-detail", comparisonJobId],
    queryFn: () => fetchAdminAuditDetail(comparisonJobId!),
    enabled: isAdmin && !!comparisonJobId && comparisonJobId !== selectedJobId,
    retry: false,
  });

  useEffect(() => {
    setDraft(buildDraft(detailQuery.data));
    setOutputReportDrafts(buildOutputReportDrafts(detailQuery.data));
    setExpandedReports({});
  }, [detailQuery.data]);

  const liveScore = draft ? computeOverallScore(draft) : null;

  const copyToClipboard = async (text: string, successTitle: string) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard is not available in this browser.");
      }
      await navigator.clipboard.writeText(text);
      toast({
        title: successTitle,
        description: "Copied to clipboard for debugging and complaint tracking.",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Could not copy this bundle.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!selectedJobId || !draft) return;

    setSaving(true);
    try {
      await submitAdminTemplateAudit({
        jobId: selectedJobId,
        verdict: draft.verdict,
        outputQualityScore: draft.outputQualityScore,
        brandAlignmentScore: draft.brandAlignmentScore,
        promptAdherenceScore: draft.promptAdherenceScore,
        inputFidelityScore: draft.inputFidelityScore,
        failureTags: draft.failureTags,
        automationFlags: draft.automationFlags,
        summary: draft.summary,
        keepers: draft.keepers,
        changeRequest: draft.changeRequest,
        promptToOutputNotes: draft.promptToOutputNotes,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-audit-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit-detail", selectedJobId] }),
      ]);
      toast({ title: "Admin audit saved", description: "Structured review recorded for this run." });
    } catch (error) {
      toast({
        title: "Admin audit failed",
        description: error instanceof Error ? error.message : "Could not save admin audit.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateOutputReportDraft = (outputNumber: number, patch: Partial<OutputReportDraft>) => {
    setOutputReportDrafts((current) => ({
      ...current,
      [outputNumber]: {
        verdict: "iffy",
        issueTags: [],
        severity: "medium",
        note: "",
        recommendedFix: "",
        status: "open",
        ...(current[outputNumber] ?? {}),
        ...patch,
      },
    }));
  };

  const handleSaveOutputReport = async (
    output: AdminAuditDetailResponse["job"]["outputs"][number],
    draftOverride?: OutputReportDraft,
  ) => {
    if (!selectedJobId) return;
    const reportDraft = draftOverride ?? outputReportDrafts[output.outputNumber];
    if (!reportDraft?.note.trim()) {
      toast({
        title: "Report note required",
        description: "Write what is wrong so the prompt fix is actionable.",
        variant: "destructive",
      });
      return;
    }

    setReportSaving(output.outputNumber);
    try {
      await submitAdminOutputReport({
        jobId: selectedJobId,
        outputNumber: output.outputNumber,
        outputUrl: output.url,
        verdict: reportDraft.verdict,
        issueTags: reportDraft.issueTags,
        severity: reportDraft.severity,
        note: reportDraft.note,
        recommendedFix: reportDraft.recommendedFix,
        status: reportDraft.status,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-audit-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit-detail", selectedJobId] }),
      ]);
      toast({
        title: `Output ${output.outputNumber} report saved`,
        description: "This is now attached to the run for prompt repair.",
      });
    } catch (error) {
      toast({
        title: "Output report failed",
        description: error instanceof Error ? error.message : "Could not save this output report.",
        variant: "destructive",
      });
    } finally {
      setReportSaving(null);
    }
  };

  const handleQuickOutputVerdict = async (
    output: AdminAuditDetailResponse["job"]["outputs"][number],
    verdict: OutputReportDraft["verdict"],
  ) => {
    const preset = verdict === "good"
      ? {
        verdict,
        issueTags: [],
        severity: "low" as const,
        status: "fixed" as const,
        note: "Approved by admin: output matches the prompt, inputs, and expected template result.",
        recommendedFix: "",
      }
      : verdict === "bad"
      ? {
        verdict,
        severity: "high" as const,
        status: "open" as const,
        note: outputReportDrafts[output.outputNumber]?.note || "Bad output: needs prompt, model, reference, or node mapping repair.",
      }
      : {
        verdict,
        severity: "medium" as const,
        status: "open" as const,
        note: outputReportDrafts[output.outputNumber]?.note || "Iffy output: usable direction, but needs admin review before approval.",
      };

    updateOutputReportDraft(output.outputNumber, preset);
    setExpandedReports((current) => ({ ...current, [output.outputNumber]: verdict !== "good" }));

    if (verdict === "good") {
      await handleSaveOutputReport(output, preset);
    }
  };

  if (!isAdmin) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-4xl px-6 pb-16 pt-10">
          <Card className="border-rose-400/20 bg-rose-400/10">
            <CardContent className="flex items-center gap-4 p-6">
              <ShieldAlert className="h-8 w-8 text-rose-100" />
              <div>
                <p className="text-lg font-semibold text-foreground">Admin role required</p>
                <p className="text-sm text-slate-200">
                  This audit surface is locked to admin users because it writes structured template quality reviews.
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </SiteShell>
    );
  }

  const detail = detailQuery.data;
  const publishBlockingReports = detail?.outputReports.filter(isPublishBlockingReport) ?? [];
  const hasApprovedRunAudit = (detail?.audits ?? []).some((audit) => audit.verdict === "approved" && audit.overallScore >= 75);
  const selectedRunPublishEligible =
    detail?.job.status === "complete" &&
    hasApprovedRunAudit &&
    publishBlockingReports.length === 0 &&
    (detail?.job.outputs.length ?? 0) > 0;

  return (
    <SiteShell>
      <main className="mx-auto max-w-[1880px] px-5 pb-12 pt-10 xl:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Developer Runs</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Subscriber output inspector</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Pull up any subscriber run, inspect what they submitted, and audit numbered outputs with cost and timing visible at a glance.
            </p>
          </div>

          <div className="grid min-w-[320px] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Pending</p>
                <p className="mt-2 text-3xl font-black text-foreground">{queueQuery.data?.summary.pendingAudit ?? "—"}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Needs Attention</p>
                <p className="mt-2 text-3xl font-black text-foreground">{queueQuery.data?.summary.needsAttention ?? "—"}</p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Avg Audit Score</p>
                <p className="mt-2 text-3xl font-black text-foreground">{queueQuery.data?.summary.averageAuditScore ?? "—"}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[380px,minmax(0,1fr)]">
          <section className="rounded-[2rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan-200" />
              <p className="text-sm font-semibold text-foreground">Subscriber runs</p>
            </div>

            <div className="mt-4 space-y-3">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search subscriber, template, run id..."
                className="border-white/10 bg-white/[0.03] text-foreground placeholder:text-slate-500"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as QueueFilter)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                >
                  <option value="all">All verdict states</option>
                  <option value="pending">Pending</option>
                  <option value="needs_attention">Iffy / bad</option>
                  <option value="approved">Good</option>
                </select>
                <select
                  value={dateWindow}
                  onChange={(event) => setDateWindow(event.target.value as DateWindow)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                >
                  <option value="30d">Last 30 days</option>
                  <option value="7d">Last 7 days</option>
                  <option value="24h">Last 24 hours</option>
                  <option value="all">All time</option>
                </select>
                <select
                  value={templateFilter}
                  onChange={(event) => setTemplateFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                >
                  <option value="all">All templates</option>
                  {templateOptions.map((templateName) => (
                    <option key={templateName} value={templateName}>
                      {templateName}
                    </option>
                  ))}
                </select>
                <select
                  value={planFilter}
                  onChange={(event) => setPlanFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                >
                  <option value="all">All plans</option>
                  {planOptions.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
                <select
                  value={subscriptionFilter}
                  onChange={(event) => setSubscriptionFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground sm:col-span-2"
                >
                  <option value="all">All memberships</option>
                  {subscriptionOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ScrollArea className="mt-4 h-[calc(100vh-280px)] pr-3">
              {queueQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : queueQuery.isError ? (
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100">
                  <p className="font-semibold">Audit queue failed to load.</p>
                  <p className="mt-2 text-rose-100/80">
                    {queueQuery.error instanceof Error ? queueQuery.error.message : "The admin audit function returned an error."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void queueQuery.refetch()}
                    className="mt-4 rounded-full border-rose-200/20 bg-rose-100/10 text-rose-50 hover:bg-rose-100/15"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry queue
                  </Button>
                </div>
              ) : filteredJobs.length ? (
                <div className="space-y-3">
                  {filteredJobs.map((job) => (
                    <AuditQueueCard
                      key={job.id}
                      job={job}
                      selected={job.id === selectedJobId}
                      onSelect={() => setSelectedJobId(job.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-muted-foreground">
                  {allJobs.length
                    ? "No runs match the current filter. Clear filters or switch to all time."
                    : "No runs returned yet. The inspector will populate as soon as template runs exist."}
                </div>
              )}
            </ScrollArea>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
            {!selectedJobId ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                  <p className="text-lg font-semibold text-foreground">No run selected</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Choose a run on the left, clear the filters, or retry the queue if the backend returned an error.
                  </p>
                </div>
              </div>
            ) : detailQuery.isLoading ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : detailQuery.isError ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-lg rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">
                  <p className="text-lg font-semibold">Run detail failed to load.</p>
                  <p className="mt-2 text-sm leading-6 text-rose-100/80">
                    {detailQuery.error instanceof Error ? detailQuery.error.message : "The output inspector could not load this run."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void detailQuery.refetch()}
                    className="mt-4 rounded-full border-rose-200/20 bg-rose-100/10 text-rose-50 hover:bg-rose-100/15"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry detail
                  </Button>
                </div>
              </div>
            ) : !detail ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="max-w-md rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
                  This run did not return detail data.
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Selected Run</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground">
                      {detail.job.template.templateName}
                    </h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Run {formatShortId(detail.job.jobId)} · version {detail.job.template.versionNumber ?? "?"} · {detail.job.template.reviewStatus}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {displayDetailOwner(detail.job)} · {detail.job.user.plan ?? "free"} · {detail.job.user.subscriptionStatus ?? "inactive"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void copyToClipboard(buildRunBundle(detail), "Run bundle copied")}
                      className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy run bundle
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void copyToClipboard(buildAuditJson(detail), "Audit JSON copied")}
                      className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]"
                    >
                      <FileJson className="mr-2 h-4 w-4" />
                      Copy JSON
                    </Button>
                    {comparisonDetailQuery.data ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void copyToClipboard(
                            buildComparisonBundle(detail, comparisonDetailQuery.data),
                            "Comparison bundle copied",
                          )
                        }
                        className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]"
                      >
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        Copy comparison
                      </Button>
                    ) : null}
                    <Badge variant="outline" className={queueBadgeClass(selectedQueueItem?.queueState ?? "pending")}>
                      {queueDisplayLabel(selectedQueueItem?.queueState ?? "pending")}
                    </Badge>
                    <Badge variant="outline" className={verdictBadgeClass(detail.currentUserAudit?.verdict ?? detail.suggestedAudit.verdict)}>
                      {verdictDisplayLabel(detail.currentUserAudit?.verdict ?? detail.suggestedAudit.verdict)}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                      {detail.job.outputs.length} outputs
                    </Badge>
                    <Badge
                      variant="outline"
                      className={selectedRunPublishEligible
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-300/30 bg-amber-400/10 text-amber-100"}
                    >
                      {selectedRunPublishEligible ? "Publish gate pass" : "Publish gate blocked"}
                    </Badge>
                  </div>
                </div>

                {!selectedRunPublishEligible ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-sm text-amber-50">
                    <p className="font-semibold">Publish requirements for this version</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        Completed run: {detail.job.status === "complete" ? "yes" : "no"}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        Approved audit: {hasApprovedRunAudit ? "yes" : "no"}
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        Blocking output reports: {publishBlockingReports.length}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr),360px]">
                  <div className="space-y-6">
                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-foreground">Final outputs</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Deliverables</p>
                            <p className="mt-2 text-2xl font-black text-foreground">{detail.job.outputs.length}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Output Cost</p>
                            <p className="mt-2 text-2xl font-black text-foreground">{formatUsd(detail.job.outputTotals.estimatedCostUsd)}</p>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Output Time</p>
                            <p className="mt-2 text-2xl font-black text-foreground">{formatDuration(detail.job.outputTotals.executionTimeMs)}</p>
                          </div>
                        </div>
                        {detail.job.outputs.length ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {detail.job.outputs.map((output) => {
                              const reportDraft = outputReportDrafts[output.outputNumber] ?? {
                                verdict: "iffy",
                                issueTags: [],
                                severity: "medium",
                                note: "",
                                recommendedFix: "",
                                status: "open",
                              } satisfies OutputReportDraft;
                              const savedReport = detail.outputReports?.find((report) => report.outputNumber === output.outputNumber);
                              const reportOpen = expandedReports[output.outputNumber] ?? !!savedReport;

                              return (
                              <div key={`${output.label}-${output.url}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">Output {output.outputNumber}</p>
                                    <p className="mt-1 text-xs text-slate-300">{output.label}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                      {output.type}
                                    </Badge>
                                    <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                      {formatUsd(output.estimatedCostUsd)}
                                    </Badge>
                                    <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                      {formatDuration(output.executionTimeMs)}
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        void copyToClipboard(
                                          buildRunBundle(detail, output.outputNumber),
                                          `Output ${output.outputNumber} bundle copied`,
                                        )
                                      }
                                      className="h-8 rounded-full border-white/10 bg-white/[0.03] px-3 text-slate-100 hover:bg-white/[0.06]"
                                    >
                                      <Copy className="mr-2 h-3.5 w-3.5" />
                                      Copy
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        void copyToClipboard(
                                          buildAuditJson(detail, output.outputNumber),
                                          `Output ${output.outputNumber} JSON copied`,
                                        )
                                      }
                                      className="h-8 rounded-full border-white/10 bg-white/[0.03] px-3 text-slate-100 hover:bg-white/[0.06]"
                                    >
                                      <FileJson className="mr-2 h-3.5 w-3.5" />
                                      JSON
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setExpandedReports((current) => ({
                                          ...current,
                                          [output.outputNumber]: !reportOpen,
                                        }))
                                      }
                                      className={cn(
                                        "h-8 rounded-full border-white/10 bg-white/[0.03] px-3 text-slate-100 hover:bg-white/[0.06]",
                                        savedReport?.status === "open" ? "border-amber-300/40 bg-amber-400/10 text-amber-100" : "",
                                      )}
                                    >
                                      <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                                      {savedReport ? "Reported" : "Report"}
                                    </Button>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <OutputFrame type={output.type} url={output.url} label={output.label} />
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mark output</span>
                                  {(["good", "iffy", "bad"] as const).map((verdict) => (
                                    <button
                                      key={`${output.outputNumber}-${verdict}`}
                                      type="button"
                                      onClick={() => void handleQuickOutputVerdict(output, verdict)}
                                      className={cn(
                                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                                        reportDraft.verdict === verdict && verdict === "good"
                                          ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                                          : reportDraft.verdict === verdict && verdict === "iffy"
                                          ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                                          : reportDraft.verdict === verdict && verdict === "bad"
                                          ? "border-rose-300/40 bg-rose-400/15 text-rose-100"
                                          : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                                      )}
                                    >
                                      {verdict === "good" ? "Good" : verdict === "iffy" ? "Iffy" : "Bad"}
                                    </button>
                                  ))}
                                </div>
                                {reportOpen ? (
                                  <div className="mt-3 space-y-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.04] p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                                          Output report
                                        </p>
                                        <p className="mt-1 text-xs text-slate-300">
                                          Capture what needs prompt/model/reference repair.
                                        </p>
                                      </div>
                                      {savedReport ? (
                                        <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 text-amber-100">
                                          {savedReport.verdict} · {savedReport.status}
                                        </Badge>
                                      ) : null}
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-3">
                                      {(["good", "iffy", "bad"] as const).map((verdict) => (
                                        <button
                                          key={`report-${output.outputNumber}-${verdict}`}
                                          type="button"
                                          onClick={() =>
                                            updateOutputReportDraft(output.outputNumber, {
                                              verdict,
                                              severity: verdict === "good" ? "low" : verdict === "bad" ? "high" : "medium",
                                              status: verdict === "good" ? "fixed" : "open",
                                            })
                                          }
                                          className={cn(
                                            "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors",
                                            reportDraft.verdict === verdict && verdict === "good"
                                              ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                                              : reportDraft.verdict === verdict && verdict === "iffy"
                                              ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                                              : reportDraft.verdict === verdict && verdict === "bad"
                                              ? "border-rose-300/40 bg-rose-400/15 text-rose-100"
                                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                                          )}
                                        >
                                          {verdict === "good" ? "Good" : verdict === "iffy" ? "Iffy" : "Bad"}
                                        </button>
                                      ))}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      {(detail.options.outputReportTags ?? []).map((tag) => (
                                        <button
                                          key={tag}
                                          type="button"
                                          onClick={() =>
                                            updateOutputReportDraft(output.outputNumber, {
                                              issueTags: toggleValue(reportDraft.issueTags, tag),
                                            })
                                          }
                                          className={cn(
                                            "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                            reportDraft.issueTags.includes(tag)
                                              ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                                          )}
                                        >
                                          {tag.replaceAll("_", " ")}
                                        </button>
                                      ))}
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="space-y-2">
                                        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Severity</span>
                                        <select
                                          value={reportDraft.severity}
                                          onChange={(event) =>
                                            updateOutputReportDraft(output.outputNumber, {
                                              severity: event.target.value as OutputReportDraft["severity"],
                                            })
                                          }
                                          className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                                        >
                                          {(detail.options.outputReportSeverities ?? ["low", "medium", "high", "blocking"]).map((severity) => (
                                            <option key={severity} value={severity}>
                                              {severity}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="space-y-2">
                                        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</span>
                                        <select
                                          value={reportDraft.status}
                                          onChange={(event) =>
                                            updateOutputReportDraft(output.outputNumber, {
                                              status: event.target.value as OutputReportDraft["status"],
                                            })
                                          }
                                          className="h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                                        >
                                          {(detail.options.outputReportStatuses ?? ["open", "fixed", "wont_fix"]).map((status) => (
                                            <option key={status} value={status}>
                                              {status.replace("_", " ")}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>

                                    <Textarea
                                      value={reportDraft.note}
                                      onChange={(event) =>
                                        updateOutputReportDraft(output.outputNumber, { note: event.target.value })
                                      }
                                      placeholder="What is wrong? Example: Output 3 keeps the old logo; needs stronger package logo replacement and negative prompt for backend sample mark."
                                      className="min-h-[92px] border-white/10 bg-black/20 text-slate-100 placeholder:text-slate-500"
                                    />
                                    <Textarea
                                      value={reportDraft.recommendedFix}
                                      onChange={(event) =>
                                        updateOutputReportDraft(output.outputNumber, { recommendedFix: event.target.value })
                                      }
                                      placeholder="Optional remedy idea: prompt edit, reference replacement, model setting, or node wiring fix."
                                      className="min-h-[78px] border-white/10 bg-black/20 text-slate-100 placeholder:text-slate-500"
                                    />

                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        onClick={() => void handleSaveOutputReport(output)}
                                        disabled={reportSaving === output.outputNumber || !reportDraft.note.trim()}
                                        className="rounded-full bg-amber-300 text-slate-950 hover:bg-amber-200 disabled:bg-white/10 disabled:text-slate-500"
                                      >
                                        {reportSaving === output.outputNumber ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Save output report
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          void copyToClipboard(
                                            [
                                              buildRunBundle(detail, output.outputNumber),
                                              "",
                                              "Output report:",
                                              `Verdict: ${reportDraft.verdict}`,
                                              `Tags: ${reportDraft.issueTags.join(", ") || "none"}`,
                                              `Severity: ${reportDraft.severity}`,
                                              `Status: ${reportDraft.status}`,
                                              `Issue: ${reportDraft.note || "not written"}`,
                                              `Suggested fix: ${reportDraft.recommendedFix || "not written"}`,
                                            ].join("\n"),
                                            `Output ${output.outputNumber} repair bundle copied`,
                                          )
                                        }
                                        className="rounded-full border-white/10 bg-white/[0.03] text-slate-100"
                                      >
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copy repair bundle
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
                            No final deliverables were recorded for this run.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                          <ArrowRightLeft className="h-4 w-4 text-cyan-200" />
                          Run comparison
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                          <select
                            value={comparisonJobId ?? ""}
                            onChange={(event) => setComparisonJobId(event.target.value || null)}
                            className="h-11 min-w-[280px] flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                          >
                            <option value="">Select another run</option>
                            {comparisonCandidates.map((job) => (
                              <option key={job.id} value={job.id}>
                                {job.templateName} · {displayRunOwner(job)} · {formatShortId(job.id)}
                              </option>
                            ))}
                          </select>
                          {comparisonJobId ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setComparisonJobId(null)}
                              className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.06]"
                            >
                              Clear
                            </Button>
                          ) : null}
                        </div>

                        {!comparisonCandidates.length ? (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
                            No other runs are available to compare against yet.
                          </div>
                        ) : null}

                        {comparisonJobId && comparisonDetailQuery.isLoading ? (
                          <div className="flex h-24 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : null}

                        {comparisonDetailQuery.data ? (
                          <>
                            <div className="grid gap-3 md:grid-cols-4">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Output Delta</p>
                                <p className="mt-2 text-2xl font-black text-foreground">
                                  {formatSigned(detail.job.outputs.length - comparisonDetailQuery.data.job.outputs.length)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Cost Delta</p>
                                <p className="mt-2 text-2xl font-black text-foreground">
                                  {formatUsd(detail.job.outputTotals.estimatedCostUsd - comparisonDetailQuery.data.job.outputTotals.estimatedCostUsd)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Time Delta</p>
                                <p className="mt-2 text-2xl font-black text-foreground">
                                  {formatSigned(detail.job.outputTotals.executionTimeMs - comparisonDetailQuery.data.job.outputTotals.executionTimeMs, " ms")}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Compare Run</p>
                                <p className="mt-2 text-sm font-semibold text-foreground">
                                  {displayDetailOwner(comparisonDetailQuery.data.job)}
                                </p>
                                <p className="mt-1 text-xs text-slate-300">
                                  {comparisonDetailQuery.data.job.template.templateName} · {formatShortId(comparisonDetailQuery.data.job.jobId)}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4">
                              {Array.from({
                                length: Math.max(detail.job.outputs.length, comparisonDetailQuery.data.job.outputs.length),
                              }).map((_, index) => {
                                const outputNumber = index + 1;
                                const currentOutput = detail.job.outputs.find((output) => output.outputNumber === outputNumber) ?? null;
                                const compareOutput = comparisonDetailQuery.data.job.outputs.find((output) => output.outputNumber === outputNumber) ?? null;

                                return (
                                  <div key={`comparison-output-${outputNumber}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                    <p className="text-sm font-semibold text-foreground">Output {outputNumber}</p>
                                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                      {[{
                                        label: "Selected run",
                                        output: currentOutput,
                                      }, {
                                        label: "Comparison run",
                                        output: compareOutput,
                                      }].map((entry) => (
                                        <div key={`${entry.label}-${outputNumber}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{entry.label}</p>
                                          {entry.output ? (
                                            <>
                                              <div className="mt-3 flex flex-wrap gap-2">
                                                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                                  {entry.output.type}
                                                </Badge>
                                                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                                  {formatUsd(entry.output.estimatedCostUsd)}
                                                </Badge>
                                                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                                  {formatDuration(entry.output.executionTimeMs)}
                                                </Badge>
                                              </div>
                                              <p className="mt-3 text-sm text-slate-300">{entry.output.label}</p>
                                              <div className="mt-3">
                                                <OutputFrame type={entry.output.type} url={entry.output.url} label={entry.output.label} />
                                              </div>
                                            </>
                                          ) : (
                                            <div className="mt-3 flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-muted-foreground">
                                              No output recorded
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                          <User2 className="h-4 w-4 text-cyan-200" />
                          Subscriber inputs
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          {detail.job.userInputs.map((input) => (
                            <div key={input.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">{input.name}</p>
                                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                  {input.expected}
                                </Badge>
                              </div>
                              {isLikelyAssetUrl(input.value) ? (
                                <img
                                  src={input.value!}
                                  alt={input.name}
                                  className="mt-3 aspect-[9/16] w-full rounded-xl border border-white/10 object-cover"
                                />
                              ) : (
                                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs leading-6 text-slate-300">
                                  {input.value || "No captured value"}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Raw input payload</p>
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-300">
                            {JSON.stringify(detail.job.inputPayload, null, 2)}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                          <MessagesSquare className="h-4 w-4 text-cyan-200" />
                          Tester feedback
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <QuickFeedbackList feedback={detail.quickFeedback} />
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                          <Wand2 className="h-4 w-4 text-cyan-200" />
                          Prompt-to-output trace
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {detail.job.steps.map((step, index) => (
                          <StepTraceCard key={step.id} index={index} step={step} />
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center justify-between gap-2 text-lg text-foreground">
                          <span className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-cyan-200" />
                            Admin audit
                          </span>
                          <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">
                            Score {liveScore ?? "—"}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {!draft ? null : (
                          <>
                            <label className="space-y-2">
                              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Verdict</span>
                              <select
                                value={draft.verdict}
                                onChange={(event) => setDraft((current) => current ? { ...current, verdict: event.target.value } : current)}
                                className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground"
                              >
                                {(detail.options.verdicts ?? []).map((verdict) => (
                                  <option key={verdict} value={verdict}>
                                    {verdictDisplayLabel(verdict)}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="grid gap-4">
                              <ScoreSelect
                                label="Output Quality"
                                value={draft.outputQualityScore}
                                onChange={(value) => setDraft((current) => current ? { ...current, outputQualityScore: value } : current)}
                              />
                              <ScoreSelect
                                label="Brand Alignment"
                                value={draft.brandAlignmentScore}
                                onChange={(value) => setDraft((current) => current ? { ...current, brandAlignmentScore: value } : current)}
                              />
                              <ScoreSelect
                                label="Prompt Adherence"
                                value={draft.promptAdherenceScore}
                                onChange={(value) => setDraft((current) => current ? { ...current, promptAdherenceScore: value } : current)}
                              />
                              <ScoreSelect
                                label="Input Fidelity"
                                value={draft.inputFidelityScore}
                                onChange={(value) => setDraft((current) => current ? { ...current, inputFidelityScore: value } : current)}
                              />
                            </div>

                            <Separator className="bg-white/10" />

                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Failure tags</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {detail.options.failureTags.map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setDraft((current) => current ? { ...current, failureTags: toggleValue(current.failureTags, tag) } : current)}
                                    className={cn(
                                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                      draft.failureTags.includes(tag)
                                        ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                                    )}
                                  >
                                    {tag.replaceAll("_", " ")}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Automation flags</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {detail.options.automationFlags.map((flag) => (
                                  <button
                                    key={flag}
                                    type="button"
                                    onClick={() => setDraft((current) => current ? { ...current, automationFlags: toggleValue(current.automationFlags, flag) } : current)}
                                    className={cn(
                                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                      draft.automationFlags.includes(flag)
                                        ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
                                    )}
                                  >
                                    {flag.replaceAll("_", " ")}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <Textarea
                              value={draft.summary}
                              onChange={(event) => setDraft((current) => current ? { ...current, summary: event.target.value } : current)}
                              placeholder="Core audit summary. What happened, what failed, and what decision should be made on this run?"
                              className="min-h-[120px] border-white/10 bg-white/[0.03] text-slate-100 placeholder:text-slate-500"
                            />
                            <Textarea
                              value={draft.keepers}
                              onChange={(event) => setDraft((current) => current ? { ...current, keepers: event.target.value } : current)}
                              placeholder="What should stay? Good prompts, good scene locks, strong outputs, etc."
                              className="min-h-[100px] border-white/10 bg-white/[0.03] text-slate-100 placeholder:text-slate-500"
                            />
                            <Textarea
                              value={draft.changeRequest}
                              onChange={(event) => setDraft((current) => current ? { ...current, changeRequest: event.target.value } : current)}
                              placeholder="What specifically should change in the template or runner next?"
                              className="min-h-[100px] border-white/10 bg-white/[0.03] text-slate-100 placeholder:text-slate-500"
                            />
                            <Textarea
                              value={draft.promptToOutputNotes}
                              onChange={(event) => setDraft((current) => current ? { ...current, promptToOutputNotes: event.target.value } : current)}
                              placeholder="Trace notes. Which prompt or node caused the visible issue?"
                              className="min-h-[100px] border-white/10 bg-white/[0.03] text-slate-100 placeholder:text-slate-500"
                            />

                            <Button
                              type="button"
                              onClick={() => void handleSave()}
                              disabled={saving || !draft.summary.trim()}
                              className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200 disabled:bg-white/10 disabled:text-slate-500"
                            >
                              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Save admin audit
                            </Button>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-foreground">Run metadata</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-slate-300">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Subscriber</span>
                          <span>{displayDetailOwner(detail.job)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Email</span>
                          <span>{detail.job.user.email || "Not set"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Plan</span>
                          <span>{detail.job.user.plan || "free"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Membership</span>
                          <span>{detail.job.user.subscriptionStatus || "inactive"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Status</span>
                          <span>{detail.job.status}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Progress</span>
                          <span>{detail.job.progress}%</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Started</span>
                          <span>{formatTimestamp(detail.job.startedAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Completed</span>
                          <span>{formatTimestamp(detail.job.completedAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Outputs</span>
                          <span>{detail.job.outputs.length}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Output cost</span>
                          <span>{formatUsd(detail.job.outputTotals.estimatedCostUsd)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Output time</span>
                          <span>{formatDuration(detail.job.outputTotals.executionTimeMs)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Hidden refs</span>
                          <span>{detail.job.template.hiddenRefs.length}</span>
                        </div>
                        {detail.job.error ? (
                          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                            {detail.job.error}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-white/[0.03]">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-foreground">Saved audits</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {detail.audits.length ? (
                          detail.audits.map((audit: AdminAuditRecord) => (
                            <div key={audit.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {audit.adminName || audit.adminEmail || formatShortId(audit.adminUserId)}
                                  </p>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                    {formatTimestamp(audit.updatedAt)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className={verdictBadgeClass(audit.verdict)}>
                                    {verdictDisplayLabel(audit.verdict)}
                                  </Badge>
                                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-slate-200">
                                    {audit.overallScore}
                                  </Badge>
                                </div>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-slate-300">{audit.summary}</p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
                            No admin audits saved yet.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Card className="border-white/10 bg-white/[0.03]">
                        <CardContent className="flex items-center gap-3 p-4">
                          <Clock3 className="h-5 w-5 text-cyan-200" />
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Suggested summary</p>
                            <p className="mt-1 text-sm text-slate-300">{detail.suggestedAudit.summary}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-white/10 bg-white/[0.03]">
                        <CardContent className="flex items-center gap-3 p-4">
                          {detail.job.error ? (
                            <AlertTriangle className="h-5 w-5 text-amber-200" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-200" />
                          )}
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Automation seed</p>
                            <p className="mt-1 text-sm text-slate-300">
                              {detail.suggestedAudit.automationFlags.length
                                ? detail.suggestedAudit.automationFlags.join(", ").replaceAll("_", " ")
                                : "No automatic flags"}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </SiteShell>
  );
};

export default AdminAudits;
