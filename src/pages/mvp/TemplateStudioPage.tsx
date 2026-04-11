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
import { supabase } from "@/integrations/supabase/client";
import {
  createProject,
  enqueueProject,
  fetchTemplateDetail,
  fetchTemplates,
  getProjectStatus,
  type ApiTemplate,
  type OutputItem,
  type TemplateDetail,
  uploadFile,
} from "@/services/fuseApi";
import { getStaticInputs } from "@/services/templateInputMap";

type RunnerStatus = "queued" | "running" | "video_pending" | "complete" | "failed";

interface InputField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
}

interface RunnerResult {
  status: RunnerStatus;
  progress: number;
  logs: string[];
  outputs: OutputItem[];
  error?: string;
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

export default function TemplateStudioPage() {
  const { profile, roles } = useAuth();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [result, setResult] = useState<RunnerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const templatesQuery = useQuery<ApiTemplate[]>({
    queryKey: ["mvp-templates"],
    queryFn: async () => {
      const token = await getAccessToken();
      return fetchTemplates(token);
    },
    staleTime: 60_000,
  });

  const templates = (templatesQuery.data ?? []).filter((template) => template.is_active);

  useEffect(() => {
    if (!templates.length) return;
    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  const templateDetailQuery = useQuery<TemplateDetail | null>({
    queryKey: ["mvp-template-detail", selectedTemplateId],
    enabled: !!selectedTemplate,
    queryFn: async () => {
      if (!selectedTemplate) return null;
      const token = await getAccessToken();
      return fetchTemplateDetail(token, selectedTemplate);
    },
  });

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const token = await getAccessToken();
        const status = await getProjectStatus(token, projectId);
        if (cancelled) return;

        const normalizedStatus = status.status as RunnerStatus;
        setResult({
          status: normalizedStatus,
          progress: status.progress ?? 0,
          logs: status.logs ?? [],
          outputs: (status.outputs?.items ?? []).map((output) => ({
            type: output.type ?? "image",
            url: output.url,
            label: output.label,
            key: output.key,
          })),
          error: status.error ?? undefined,
        });

        if (normalizedStatus === "queued" || normalizedStatus === "running" || normalizedStatus === "video_pending") {
          timeoutId = window.setTimeout(poll, 8000);
        }
      } catch {
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, 10000);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [projectId]);

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
  const canAfford = creditBalance >= creditsRequired;
  const hasPrivilegedBypass = roles.includes("admin") || roles.includes("dev");
  const hasActiveSubscription =
    hasPrivilegedBypass ||
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setFiles({});
    setTextInputs({});
    setProjectId(null);
    setResult(null);
  };

  const handleRun = async () => {
    if (!selectedTemplate) return;
    if (!requiredInputsAreReady) {
      toast({
        title: "Missing inputs",
        description: "Fill every required field before running the template.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setProjectId(null);
    setResult(null);

    try {
      const token = await getAccessToken();
      const inputs: Record<string, string> = {};

      for (const field of inputFields) {
        if (field.type === "image") {
          const file = files[field.key];
          if (!file) continue;
          const upload = await uploadFile(token, file);
          inputs[field.key] = upload.imageUrl;
          inputs[`${field.key}_key`] = upload.key;
        } else {
          const value = textInputs[field.key]?.trim();
          if (value) inputs[field.key] = value;
        }
      }

      const createdProject = await createProject(token, selectedTemplate.id, inputs);
      if (!createdProject.projectId) {
        throw new Error("Template run did not return a project id.");
      }

      await enqueueProject(token, createdProject.projectId);
      setProjectId(createdProject.projectId);
      setResult({ status: "queued", progress: 0, logs: [], outputs: [] });
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
            <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white">One page. Pick a template. Run it.</h1>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Balance {creditBalance} credits
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

                    {templateDetailQuery.data?.asset_requirements ? (
                      <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">
                        {templateDetailQuery.data.asset_requirements}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Inputs</p>
                      <p className="mt-2 text-sm text-slate-300">Required inputs come from the template manifest or the static fallback map.</p>
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
                          <p className="mt-2 text-2xl font-semibold text-white">{creditsRequired} credits</p>
                        </div>
                        <div className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${canAfford ? "bg-emerald-400/10 text-emerald-100" : "bg-rose-400/10 text-rose-100"}`}>
                          {canAfford ? "Ready" : "Insufficient balance"}
                        </div>
                      </div>

                      <Button
                        onClick={() => void handleRun()}
                        disabled={submitting || isRunning || !requiredInputsAreReady || !canAfford || !hasActiveSubscription}
                        className="mt-5 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                      >
                        {submitting || isRunning ? "Running..." : "Run template"}
                      </Button>

                      {!hasActiveSubscription ? (
                        <p className="mt-3 text-sm leading-6 text-amber-100">
                          Active membership required before running templates.
                          {" "}
                          <Link to="/billing" className="underline underline-offset-4">
                            Open billing
                          </Link>
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
                    Current project {projectId ? <span className="font-mono text-slate-100">{projectId}</span> : "has not started yet"}.
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

              {result?.logs?.length ? (
                <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Runner log</p>
                  <div className="mt-3 space-y-2 font-mono text-xs text-slate-300">
                    {result.logs.slice(-6).map((entry, index) => (
                      <p key={`${entry}-${index}`}>{entry}</p>
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
