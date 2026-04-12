import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { ADMIN_VISUAL_BUDGET_TOTAL, getAdminVisualCreditsRemaining, getAdminVisualCreditsSpent, recordAdminVisualCreditUsage } from "@/lib/adminBudget";
import { fetchTemplateDetail, fetchTemplates, type ApiTemplate, type TemplateDetail } from "@/services/fuseApi";
import { getStaticInputs } from "@/services/templateInputMap";

type RunnerStatus = "queued" | "running" | "video_pending" | "complete" | "failed";

interface InputField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
}

interface RunnerOutput {
  type: string;
  url: string;
  label?: string;
  key?: string;
}

interface RunnerResult {
  status: RunnerStatus;
  progress: number;
  outputs: RunnerOutput[];
  error?: string;
}

const TEMPLATE_CACHE_KEY = "fuse.templateStudio.templates";
const TEMPLATE_DETAIL_CACHE_KEY = "fuse.templateStudio.templateDetails";
const TEMPLATE_SELECTION_KEY = "fuse.templateStudio.selectedTemplateId";

function readCachedJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadCachedTemplates() {
  const parsed = readCachedJson<unknown>(TEMPLATE_CACHE_KEY, []);
  return Array.isArray(parsed) ? (parsed as ApiTemplate[]) : [];
}

function loadCachedTemplateDetail(templateId: string) {
  const cached = readCachedJson<Record<string, TemplateDetail | null>>(TEMPLATE_DETAIL_CACHE_KEY, {});
  const detail = cached[templateId];
  return detail ?? null;
}

function storeCachedTemplateDetail(templateId: string, detail: TemplateDetail | null) {
  if (typeof window === "undefined") return;
  const cached = readCachedJson<Record<string, TemplateDetail | null>>(TEMPLATE_DETAIL_CACHE_KEY, {});
  cached[templateId] = detail;
  window.localStorage.setItem(TEMPLATE_DETAIL_CACHE_KEY, JSON.stringify(cached));
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing authenticated session.");
  }

  return session.access_token;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function fetchJobStatus(jobId: string) {
  const token = await getAccessToken();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/get-job-status?jobId=${encodeURIComponent(jobId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load run status.");
  }

  return data as {
    status: RunnerStatus;
    progress?: number;
    outputs?: RunnerOutput[];
    error?: string | null;
  };
}

export default function TemplateStudioPage() {
  const { isAdmin, profile } = useAuth();
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(TEMPLATE_SELECTION_KEY) ?? "";
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<RunnerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [adminVisualSpent, setAdminVisualSpent] = useState(() => getAdminVisualCreditsSpent());

  const templatesQuery = useQuery<ApiTemplate[]>({
    queryKey: ["mvp-templates"],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchTemplates(token);
    },
    initialData: loadCachedTemplates,
    staleTime: 60_000,
  });

  const templates = (templatesQuery.data ?? []).filter((template) => template.is_active);

  useEffect(() => {
    if (!templates.length) return;
    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (typeof window === "undefined" || !templates.length) return;
    window.localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedTemplateId) return;
    window.localStorage.setItem(TEMPLATE_SELECTION_KEY, selectedTemplateId);
  }, [selectedTemplateId]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  const templateDetailQuery = useQuery<TemplateDetail | null>({
    queryKey: ["mvp-template-detail", selectedTemplateId],
    enabled: !!selectedTemplate,
    initialData: selectedTemplate ? loadCachedTemplateDetail(selectedTemplate.id) : null,
    staleTime: 60_000,
    queryFn: async () => {
      if (!selectedTemplate) return null;
      const token = await getAccessToken();
      const detail = await fetchTemplateDetail(token, selectedTemplate);
      storeCachedTemplateDetail(selectedTemplate.id, detail);
      return detail;
    },
  });

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const status = await fetchJobStatus(jobId);
        if (cancelled) return;

        setResult({
          status: status.status,
          progress: status.progress ?? 0,
          outputs: Array.isArray(status.outputs) ? status.outputs : [],
          error: status.error ?? undefined,
        });

        if (status.status === "queued" || status.status === "running" || status.status === "video_pending") {
          timeoutId = window.setTimeout(poll, 3000);
        }
      } catch (error) {
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, 6000);
        }
        console.error("Job polling failed:", error);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [jobId]);

  const inputFields: InputField[] = (() => {
    if (templateDetailQuery.data?.user_inputs?.length) {
      return templateDetailQuery.data.user_inputs.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type || "image",
        required: field.required ?? true,
        hint: field.hint,
      }));
    }

    if (selectedTemplate?.input_schema?.length) {
      return selectedTemplate.input_schema.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type || "image",
        required: field.required ?? true,
        hint: field.hint,
      }));
    }

    const staticInputs = selectedTemplate ? getStaticInputs(selectedTemplate.name) : null;
    if (staticInputs?.length) return staticInputs;

    return selectedTemplate
      ? [{ key: "product_image", label: "Product image", type: "image", required: true }]
      : [];
  })();

  const requiredInputsAreReady = inputFields
    .filter((field) => field.required)
    .every((field) => (field.type === "image" ? !!files[field.key] : !!textInputs[field.key]?.trim()));

  const creditsRequired = selectedTemplate?.estimated_credits_per_run ?? 0;
  const creditBalance = profile?.credits_balance ?? 0;
  const canAfford = isAdmin || creditBalance >= creditsRequired;
  const hasActiveMembership =
    isAdmin ||
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";
  const canRun = requiredInputsAreReady && hasActiveMembership && canAfford;
  const adminVisualRemaining = getAdminVisualCreditsRemaining();
  const creditBanner = isAdmin
    ? `Admin budget ${adminVisualRemaining}/${ADMIN_VISUAL_BUDGET_TOTAL}`
    : `Balance ${creditBalance} credits`;
  const costDisplay = isAdmin ? "Bypassed for admin" : `${creditsRequired} credits`;

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setFiles({});
    setTextInputs({});
    setJobId(null);
    setResult(null);
  };

  const handleRun = async () => {
    if (!selectedTemplate) return;
    if (!selectedTemplate.versionId) {
      toast({
        title: "Template unavailable",
        description: "This template is missing a live version.",
        variant: "destructive",
      });
      return;
    }
    if (!requiredInputsAreReady) {
      toast({
        title: "Missing inputs",
        description: "Fill every required field before running the template.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setJobId(null);
    setResult(null);

    try {
      const inputFiles = Object.fromEntries(
        await Promise.all(
          inputFields
            .filter((field) => field.type === "image" && files[field.key])
            .map(async (field) => {
              const file = files[field.key]!;
              const dataUrl = await fileToDataUrl(file);
              return [
                field.key,
                {
                  dataUrl,
                  filename: file.name,
                },
              ];
            }),
        ),
      );

      const inputs = Object.fromEntries(
        inputFields
          .filter((field) => field.type !== "image")
          .map((field) => [field.key, textInputs[field.key]?.trim() ?? ""])
          .filter(([, value]) => value.length > 0),
      );

      const { data, error } = await supabase.functions.invoke("start-template-run", {
        body: {
          versionId: selectedTemplate.versionId,
          inputFiles,
          inputs,
        },
      });

      if (error) throw new Error(error.message || "Could not start the template run.");
      if (data?.error) throw new Error(String(data.error));
      if (!data?.jobId) throw new Error("Template run did not return a job id.");

      if (isAdmin) {
        recordAdminVisualCreditUsage(creditsRequired);
        setAdminVisualSpent(getAdminVisualCreditsSpent());
      }

      setJobId(String(data.jobId));
      setResult({
        status: "queued",
        progress: 0,
        outputs: [],
      });
      toast({ title: "Run queued", description: "The template is now executing." });
    } catch (error) {
      toast({
        title: "Run failed",
        description: error instanceof Error ? error.message : "Could not start the template run.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isRunning =
    result?.status === "queued" || result?.status === "running" || result?.status === "video_pending";

  return (
    <SiteShell>
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Template Studio</p>
            <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white">
              Run production workflows without leaving the page.
            </h1>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {creditBanner}
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[340px_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Templates</p>
                <p className="mt-2 text-sm text-slate-300">Choose the workflow you want to run.</p>
              </div>
              {templatesQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-100" /> : null}
            </div>

            <div className="mt-5 space-y-3">
              {templatesQuery.isError ? (
                <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                  Could not load templates.
                </div>
              ) : null}

              {!templatesQuery.isLoading && !templates.length ? (
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
                  No active templates were returned.
                </div>
              ) : null}

              {templates.map((template) => {
                const selected = template.id === selectedTemplateId;

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template.id)}
                    className={`w-full rounded-[1.5rem] border p-4 text-left transition-colors ${
                      selected
                        ? "border-cyan-300/40 bg-cyan-300/10"
                        : "border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{template.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {template.category || "General"}
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                        {template.estimated_credits_per_run || 0} cr
                      </div>
                    </div>

                    {template.description ? (
                      <p className="mt-3 text-sm leading-6 text-slate-300">{template.description}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              {!selectedTemplate ? (
                <div className="flex min-h-[240px] items-center justify-center text-slate-400">Select a template to begin.</div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-[1.75rem] border border-white/8 bg-black/25">
                      {selectedTemplate.preview_url ? (
                        <img
                          src={selectedTemplate.preview_url}
                          alt={selectedTemplate.name}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]">
                          <Sparkles className="h-10 w-10 text-cyan-100/60" />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {selectedTemplate.category || "General"}
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {selectedTemplate.output_type || "image"}
                        </span>
                      </div>
                      <h2 className="mt-4 font-display text-3xl font-bold tracking-[-0.04em] text-white">
                        {selectedTemplate.name}
                      </h2>
                      <p className="mt-3 text-sm leading-7 text-slate-300">
                        {selectedTemplate.description || "Run the configured workflow with the source assets you provide below."}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Inputs</p>
                      <p className="mt-2 text-sm text-slate-300">Upload the required assets and add any prompt text the template expects.</p>
                    </div>

                    <div className="space-y-4">
                      {inputFields.map((field) => (
                        <div key={field.key} className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{field.label}</Label>
                            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                              {field.required ? "Required" : "Optional"}
                            </span>
                          </div>

                          {field.type === "image" ? (
                            <>
                              <div className="mt-3 flex items-center gap-3">
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 hover:bg-white/[0.08]">
                                  <Upload className="h-4 w-4" />
                                  Upload image
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) =>
                                      setFiles((current) => ({
                                        ...current,
                                        [field.key]: event.target.files?.[0] ?? null,
                                      }))
                                    }
                                  />
                                </label>
                                {files[field.key] ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFiles((current) => ({
                                        ...current,
                                        [field.key]: null,
                                      }))
                                    }
                                    className="text-xs text-slate-400 hover:text-white"
                                  >
                                    Clear
                                  </button>
                                ) : null}
                              </div>
                              <p className="mt-3 text-sm text-slate-300">
                                {files[field.key]
                                  ? `${files[field.key]?.name} · ${Math.round((files[field.key]?.size ?? 0) / 1024)} KB`
                                  : "No file selected"}
                              </p>
                            </>
                          ) : field.type === "prompt" ? (
                            <Textarea
                              value={textInputs[field.key] ?? ""}
                              onChange={(event) =>
                                setTextInputs((current) => ({ ...current, [field.key]: event.target.value }))
                              }
                              rows={4}
                              className="mt-3 rounded-[1.25rem] border-white/10 bg-white/[0.03] text-white"
                            />
                          ) : (
                            <Input
                              value={textInputs[field.key] ?? ""}
                              onChange={(event) =>
                                setTextInputs((current) => ({ ...current, [field.key]: event.target.value }))
                              }
                              className="mt-3 rounded-[1.25rem] border-white/10 bg-white/[0.03] text-white"
                            />
                          )}

                          {field.hint ? <p className="mt-3 text-xs leading-6 text-slate-400">{field.hint}</p> : null}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Run cost</p>
                          <p className="mt-2 text-2xl font-semibold text-white">{costDisplay}</p>
                          {isAdmin ? (
                            <p className="mt-2 text-xs text-slate-500">
                              Visual admin spend {adminVisualSpent}. Runs stay unblocked.
                            </p>
                          ) : null}
                        </div>
                        <div className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                          canRun ? "bg-emerald-400/10 text-emerald-100" : "bg-rose-400/10 text-rose-100"
                        }`}>
                          {canRun ? "Ready" : "Blocked"}
                        </div>
                      </div>

                      <Button
                        onClick={() => void handleRun()}
                        disabled={submitting || isRunning || !canRun}
                        className="mt-5 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                      >
                        {submitting || isRunning ? "Running..." : "Run template"}
                      </Button>

                      {!hasActiveMembership ? (
                        <p className="mt-3 text-sm leading-6 text-amber-100">
                          Active membership required before running templates.
                          {" "}
                          <Link to="/billing" className="underline underline-offset-4">
                            Open billing
                          </Link>
                        </p>
                      ) : null}

                      {!isAdmin && hasActiveMembership && !canAfford ? (
                        <p className="mt-3 text-sm leading-6 text-rose-100">
                          This run costs {creditsRequired} credits and your balance is {creditBalance}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Result</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Current run {jobId ? <span className="font-mono text-slate-100">{jobId}</span> : "has not started yet"}.
                  </p>
                </div>
                {result?.status ? (
                  <div className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                    result.status === "failed"
                      ? "bg-rose-400/10 text-rose-100"
                      : result.status === "complete"
                        ? "bg-emerald-400/10 text-emerald-100"
                        : "bg-cyan-300/10 text-cyan-100"
                  }`}>
                    {result.status.replace("_", " ")}
                  </div>
                ) : null}
              </div>

              {!result ? (
                <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 text-slate-400">
                  Output will appear here after you run a template.
                </div>
              ) : null}

              {result && (result.status === "queued" || result.status === "running" || result.status === "video_pending") ? (
                <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-100" />
                    <p className="text-sm text-slate-200">
                      {result.status === "video_pending" ? "Video rendering is still in progress." : "The runner is processing your request."}
                    </p>
                  </div>
                  <Progress value={result.progress} className="mt-4 h-2" />
                  <p className="mt-2 text-xs text-slate-400">{result.progress}% complete</p>
                </div>
              ) : null}

              {result?.status === "failed" ? (
                <div className="mt-6 rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 p-5">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-rose-100" />
                    <p className="text-sm text-rose-50">{result.error || "The run failed."}</p>
                  </div>
                </div>
              ) : null}

              {result?.status === "complete" ? (
                <div className="mt-6 space-y-5">
                  <div className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-100" />
                    <p className="text-sm text-emerald-50">The template completed successfully.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {result.outputs.map((output, index) => (
                      <article key={`${output.url}-${index}`} className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-black/20">
                        {output.type === "video" ? (
                          <video src={output.url} controls className="aspect-video w-full bg-black" />
                        ) : (
                          <img src={output.url} alt={output.label || `Output ${index + 1}`} className="aspect-square w-full object-cover" />
                        )}
                        <div className="flex items-center justify-between gap-3 p-4">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            {output.type === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                            <span>{output.label || `Output ${index + 1}`}</span>
                          </div>
                          <a
                            href={output.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-300 hover:bg-white/[0.06]"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
