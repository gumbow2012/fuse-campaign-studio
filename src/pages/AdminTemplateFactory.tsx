import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  ImageOff,
  Loader2,
  Network,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  analyzeStreetwearReference,
  createStreetwearReference,
  deleteStreetwearReference,
  listStreetwearReferences,
  parseTags,
  updateStreetwearReference,
  type ReferenceBlueprint,
  type StreetwearReference,
} from "@/services/streetwearReferences";


type WorkbenchVersion = {
  id: string;
  version_number: number;
  is_active: boolean;
  review_status: string;
  activationGate?: { publishable: boolean; reasons: string[] } | null;
};

type WorkbenchTemplate = {
  id: string;
  name: string;
  description: string | null;
  versions: WorkbenchVersion[];
};

type Stage = "live" | "review" | "draft";

const STAGE_META: Record<Stage, { label: string; hint: string; tone: string }> = {
  live: {
    label: "Live",
    hint: "Published and available in the marketplace",
    tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  },
  review: {
    label: "In Review",
    hint: "Gate passed or under audit — ready to publish",
    tone: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  },
  draft: {
    label: "Draft / Unreviewed",
    hint: "Still being built or missing audit evidence",
    tone: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  },
};

function latestVersion(template: WorkbenchTemplate) {
  return template.versions.find((version) => version.is_active) ?? template.versions[0] ?? null;
}

function resolveStage(template: WorkbenchTemplate): Stage {
  const version = latestVersion(template);
  if (!version) return "draft";
  if (version.is_active) return "live";
  if (version.activationGate?.publishable || version.review_status === "in_review") return "review";
  return "draft";
}

const TINY_LABEL = "font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground";

type FormState = {
  id: string | null;
  title: string;
  category: string;
  tags: string;
  image_url: string;
  source_url: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  category: "",
  tags: "",
  image_url: "",
  source_url: "",
  notes: "",
};

export default function AdminTemplateFactory() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["admin-template-workbench-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-template-workbench", {
        body: { action: "catalog" },
      });
      if (error) throw error;
      return ((data as { templates?: WorkbenchTemplate[] } | null)?.templates ?? []) as WorkbenchTemplate[];
    },
  });

  const { data: references, isLoading: referencesLoading } = useQuery({
    queryKey: ["streetwear-references"],
    queryFn: listStreetwearReferences,
  });

  const stages = useMemo(() => {
    const grouped: Record<Stage, WorkbenchTemplate[]> = { live: [], review: [], draft: [] };
    for (const template of templates ?? []) grouped[resolveStage(template)].push(template);
    return grouped;
  }, [templates]);

  const invalidateReferences = () => {
    void queryClient.invalidateQueries({ queryKey: ["streetwear-references"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (state: FormState) => {
      const payload = {
        title: state.title.trim(),
        category: state.category.trim() || null,
        tags: parseTags(state.tags),
        image_url: state.image_url.trim() || null,
        source_url: state.source_url.trim() || null,
        notes: state.notes.trim() || null,
      };
      return state.id
        ? updateStreetwearReference(state.id, payload)
        : createStreetwearReference(payload);
    },
    onSuccess: () => {
      invalidateReferences();
      setForm(null);
      toast({ title: "Reference saved" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not save reference",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStreetwearReference,
    onSuccess: () => {
      invalidateReferences();
      toast({ title: "Reference removed" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not remove reference",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const openEdit = (reference: StreetwearReference) => {
    setForm({
      id: reference.id,
      title: reference.title,
      category: reference.category ?? "",
      tags: (reference.tags ?? []).join(", "),
      image_url: reference.image_url ?? "",
      source_url: reference.source_url ?? "",
      notes: reference.notes ?? "",
    });
  };

  return (
    <SiteShell>
      <div className="container mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-12">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={TINY_LABEL}>Admin · Supply</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Template Factory</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Pipeline overview of every graph template plus the curated streetwear intelligence board
              that informs what gets built next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="rounded-full border-white/15 bg-white/5">
              <Link to="/admin/templates">Template Workbench</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/app/lab/canvas">
                <Network className="mr-2 h-4 w-4" />
                New / Edit Draft
              </Link>
            </Button>
          </div>
        </div>

        <section className="mb-12">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Supply pipeline</h2>
            <span className="text-xs text-muted-foreground">{templates?.length ?? 0} templates</span>
          </div>

          {templatesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.keys(STAGE_META) as Stage[]).map((stage) => {
                const meta = STAGE_META[stage];
                const items = stages[stage];
                return (
                  <Card key={stage} className="border-white/10 bg-white/[0.03]">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={meta.tone}>
                          {meta.label}
                        </Badge>
                        <span className="font-display text-xl font-bold">{items.length}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{meta.hint}</p>

                      <div className="mt-4 space-y-2">
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nothing in this stage.</p>
                        ) : (
                          items.slice(0, 8).map((template) => {
                            const version = latestVersion(template);
                            return (
                              <Link
                                key={template.id}
                                to={`/app/lab/canvas${version ? `?versionId=${version.id}` : ""}`}
                                className="block rounded-lg border border-white/10 bg-background/60 px-3 py-2 transition-colors hover:border-cyan-300/40 hover:bg-cyan-300/5"
                              >
                                <div className="truncate text-sm font-medium">{template.name}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  {version ? `v${version.version_number} · ${version.review_status}` : "No version"}
                                </div>
                              </Link>
                            );
                          })
                        )}
                        {items.length > 8 ? (
                          <Link
                            to="/admin/templates"
                            className="block px-1 text-[11px] text-cyan-200 hover:underline"
                          >
                            +{items.length - 8} more in the workbench
                          </Link>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={TINY_LABEL}>Research</p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-tight">
                Streetwear Intelligence
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Curated trend references that brief new template concepts.
              </p>
            </div>
            <Button
              size="sm"
              className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              onClick={() => setForm({ ...EMPTY_FORM })}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add reference
            </Button>
          </div>

          {referencesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !references?.length ? (
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No references yet. Add the first trend reference to start the board.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {references.map((reference) => (
                <Card key={reference.id} className="overflow-hidden border-white/10 bg-white/[0.03]">
                  <div className="aspect-[4/3] w-full bg-black/40">
                    {reference.image_url ? (
                      <img
                        src={reference.image_url}
                        alt={reference.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{reference.title}</div>
                        {reference.category ? (
                          <div className={`${TINY_LABEL} mt-1`}>{reference.category}</div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(reference)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => deleteMutation.mutate(reference.id)}
                        >
                          <Trash2 className="h-4 w-4 text-rose-300" />
                        </Button>
                      </div>
                    </div>

                    {reference.tags?.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {reference.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[11px] text-cyan-100"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {reference.notes ? (
                      <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {reference.notes}
                      </p>
                    ) : null}

                    {reference.source_url ? (
                      <a
                        href={reference.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-200 hover:underline"
                      >
                        Source
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog open={!!form} onOpenChange={(open) => (open ? null : setForm(null))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit reference" : "Add reference"}</DialogTitle>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sr-title">Title</Label>
                <Input
                  id="sr-title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Washed denim flash editorial"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sr-category">Category</Label>
                  <Input
                    id="sr-category"
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    placeholder="Streetwear"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sr-tags">Tags (comma separated)</Label>
                  <Input
                    id="sr-tags"
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="denim, flash, night"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sr-image">Image URL</Label>
                <Input
                  id="sr-image"
                  value={form.image_url}
                  onChange={(event) => setForm({ ...form, image_url: event.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sr-source">Source URL</Label>
                <Input
                  id="sr-source"
                  value={form.source_url}
                  onChange={(event) => setForm({ ...form, source_url: event.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sr-notes">Notes</Label>
                <Textarea
                  id="sr-notes"
                  value={form.notes}
                  rows={4}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="What makes this worth turning into a template?"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              disabled={!form?.title.trim() || saveMutation.isPending}
              onClick={() => form && saveMutation.mutate(form)}
              className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SiteShell>
  );
}
