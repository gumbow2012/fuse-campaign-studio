/**
 * Admin — V6 Template Manager
 *
 * Two modes:
 *   1. HAR Import  — upload a Weavy HAR → parse recipes → convert to V6 steps → upload to R2
 *   2. Manual Edit — write / paste a V6 template JSON directly and upload to R2
 */
import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, FileJson, Check, AlertCircle, Loader2 } from "lucide-react";

const WORKER_BASE =
  (import.meta.env.VITE_CF_WORKER_URL as string) ||
  "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

async function getToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function uploadTemplateToWorker(token: string, name: string, template: object) {
  const res = await fetch(`${WORKER_BASE}/admin/upload-template`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, template }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as any).error || `Upload failed (${res.status})`);
  return data;
}

/* ─── HAR extraction helpers ─── */

interface WeavyRecipe {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
  rawJson: any;
}

function extractRecipesFromHar(har: any): WeavyRecipe[] {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) return [];

  const seen = new Map<string, WeavyRecipe>();
  for (const entry of entries) {
    const url: string = entry?.request?.url ?? "";
    if (!url.includes("/api/v1/recipes/")) continue;

    const saveMatch = url.match(/\/recipes\/([^/]+)\/save/);
    const plainMatch = url.match(/\/recipes\/([^/?]+)/);
    const recipeId = saveMatch?.[1] || plainMatch?.[1];
    if (!recipeId || seen.has(recipeId)) continue;

    for (const raw of [
      entry?.request?.postData?.text,
      entry?.response?.content?.text,
    ]) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.nodes && parsed?.edges) {
          seen.set(recipeId, {
            id: recipeId,
            name: parsed.name || recipeId,
            nodes: parsed.nodes,
            edges: parsed.edges,
            rawJson: parsed,
          });
          break;
        }
      } catch {}
    }
  }
  return Array.from(seen.values());
}

/** Convert a Weavy recipe to V6 steps format (best-effort). */
function convertRecipeToV6(recipe: WeavyRecipe, overrideName?: string): object {
  const steps: object[] = [];

  for (const node of recipe.nodes) {
    const type = (node.type || node.node_type || "").toLowerCase();
    const data = node.data || {};

    if (
      type.includes("nano") ||
      type.includes("banana") ||
      type.includes("fal") ||
      type.includes("image_gen") ||
      type.includes("image_edit")
    ) {
      steps.push({
        id: `image_edit_${node.id || steps.length}`,
        type: "nano_banana_pro",
        prompt:
          data.prompt ||
          data.system_prompt ||
          data.text ||
          "fashion editorial product photo, high quality",
        locked_inputs: data.reference_images || data.locked_inputs || [],
        user_input_keys: ["product_image"],
      });
    }

    if (
      type.includes("kling") ||
      type.includes("video") ||
      type.includes("image2video") ||
      type.includes("i2v")
    ) {
      steps.push({
        id: `video_gen_${node.id || steps.length}`,
        type: "kling",
        prompt:
          data.prompt ||
          data.video_prompt ||
          data.text ||
          "cinematic product video, smooth camera movement",
        image_source: "previous_step",
        model: data.model || "kling-v1-6",
        duration: data.duration || "10",
        aspect_ratio: data.aspect_ratio || "9:16",
      });
    }
  }

  // Default 2-step pipeline if nothing was detected
  if (steps.length === 0) {
    steps.push(
      {
        id: "image_edit",
        type: "nano_banana_pro",
        prompt: "fashion editorial product photo, cinematic lighting, high quality",
        locked_inputs: [],
        user_input_keys: ["product_image"],
      },
      {
        id: "video_gen",
        type: "kling",
        prompt: "cinematic product campaign video, smooth camera movement",
        image_source: "previous_step",
        model: "kling-v1-6",
        duration: "10",
        aspect_ratio: "9:16",
      }
    );
  }

  return {
    name: overrideName || recipe.name,
    description: "",
    category: "General",
    output_type: "video",
    estimated_credits_per_run: 50,
    version: "1.0",
    user_inputs: [
      { key: "product_image", label: "Product Image", type: "image", required: true },
    ],
    steps,
    _weavy_recipe_id: recipe.id,
  };
}

/* ─── Default blank template ─── */
const BLANK_TEMPLATE = {
  name: "MY TEMPLATE",
  description: "Describe what this template does",
  category: "Street",
  output_type: "video",
  estimated_credits_per_run: 50,
  version: "1.0",
  user_inputs: [
    { key: "product_image", label: "Product Image", type: "image", required: true },
  ],
  steps: [
    {
      id: "image_edit",
      type: "nano_banana_pro",
      prompt: "your image generation prompt here — describe the visual style",
      locked_inputs: [],
      user_input_keys: ["product_image"],
    },
    {
      id: "video_gen",
      type: "kling",
      prompt: "your video motion prompt here",
      image_source: "previous_step",
      model: "kling-v1-6",
      duration: "10",
      aspect_ratio: "9:16",
    },
  ],
};

/* ═══════════════════════════════════════════════════════ */
export default function AdminTemplateImport() {
  /* ── HAR tab ── */
  const [harTemplates, setHarTemplates] = useState<
    { recipe: WeavyRecipe; v6: any; uploaded: boolean }[]
  >([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());

  /* ── Manual tab ── */
  const [manualJson, setManualJson] = useState(JSON.stringify(BLANK_TEMPLATE, null, 2));
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualUploading, setManualUploading] = useState(false);

  /* ── HAR handlers ── */
  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setHarTemplates([]);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const har = JSON.parse(reader.result as string);
        const recipes = extractRecipesFromHar(har);
        if (recipes.length === 0) {
          setParseError(
            "No Weavy recipes found. Make sure the HAR contains requests to /api/v1/recipes/ with nodes & edges."
          );
          return;
        }
        setHarTemplates(
          recipes.map((r) => ({ recipe: r, v6: convertRecipeToV6(r), uploaded: false }))
        );
      } catch {
        setParseError("Failed to parse HAR file — invalid JSON.");
      }
    };
    reader.readAsText(file);
  }, []);

  const uploadOne = useCallback(
    async (idx: number) => {
      const item = harTemplates[idx];
      setUploadingIds((prev) => new Set(prev).add(item.recipe.id));
      try {
        const token = await getToken();
        await uploadTemplateToWorker(token, item.v6.name, item.v6);
        setHarTemplates((prev) =>
          prev.map((t, i) => (i === idx ? { ...t, uploaded: true } : t))
        );
        toast({ title: `✅ Uploaded "${item.v6.name}"` });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally {
        setUploadingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.recipe.id);
          return next;
        });
      }
    },
    [harTemplates]
  );

  const uploadAll = useCallback(async () => {
    for (let i = 0; i < harTemplates.length; i++) {
      if (!harTemplates[i].uploaded) await uploadOne(i);
    }
  }, [harTemplates, uploadOne]);

  /* ── Manual upload ── */
  const handleManualUpload = useCallback(async () => {
    setManualError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(manualJson);
    } catch {
      setManualError("Invalid JSON — check syntax.");
      return;
    }
    if (!parsed.name) {
      setManualError('Template must have a "name" field.');
      return;
    }
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      setManualError('Template must have a "steps" array with at least one step.');
      return;
    }
    setManualUploading(true);
    try {
      const token = await getToken();
      const res = await uploadTemplateToWorker(token, parsed.name, parsed);
      toast({ title: `✅ Uploaded "${parsed.name}"`, description: (res as any).key });
    } catch (err: any) {
      setManualError(err.message);
    } finally {
      setManualUploading(false);
    }
  }, [manualJson]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12 max-w-5xl">
        <h1 className="text-2xl font-bold mb-2">Template Manager</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Upload V6 step-based templates to R2. Each template defines a FAL image edit +
          Kling video pipeline.
        </p>

        <Tabs defaultValue="manual">
          <TabsList className="mb-6">
            <TabsTrigger value="manual">Manual / Edit JSON</TabsTrigger>
            <TabsTrigger value="har">Import from Weavy HAR</TabsTrigger>
          </TabsList>

          {/* ── Manual tab ── */}
          <TabsContent value="manual">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Write or paste a V6 template JSON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  rows={28}
                  spellCheck={false}
                  className="w-full rounded-lg border border-border/40 bg-secondary/20 px-4 py-3 text-xs font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
                {manualError && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {manualError}
                  </div>
                )}
                <Button onClick={handleManualUpload} disabled={manualUploading}>
                  {manualUploading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <Upload className="h-4 w-4 mr-2" /> Upload to R2
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HAR tab ── */}
          <TabsContent value="har">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileJson className="h-5 w-5" /> Upload Weavy HAR File
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  In Chrome DevTools → Network tab, click "Save all as HAR with content" while
                  working in the Weavy editor. Upload that file here to extract and convert all
                  recipe node graphs to V6 steps format.
                </p>
                <Input
                  type="file"
                  accept=".har,application/json"
                  onChange={handleFile}
                  className="max-w-md"
                />
                {fileName && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Loaded: <span className="font-mono">{fileName}</span>
                  </p>
                )}
              </CardContent>
            </Card>

            {parseError && (
              <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive mb-6">
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <p className="text-sm">{parseError}</p>
              </div>
            )}

            {harTemplates.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    Found {harTemplates.length} recipe
                    {harTemplates.length !== 1 && "s"}
                  </CardTitle>
                  <Button size="sm" onClick={uploadAll}>
                    Upload All to R2
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {harTemplates.map((item, idx) => (
                    <div
                      key={item.recipe.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-secondary/20"
                    >
                      <div>
                        <p className="text-sm font-semibold">{item.v6.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {item.recipe.id.slice(0, 16)}… · {item.recipe.nodes.length} nodes ·{" "}
                          {(item.v6 as any).steps?.length || 0} steps
                        </p>
                      </div>
                      {item.uploaded ? (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" /> Uploaded
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={uploadingIds.has(item.recipe.id)}
                          onClick={() => uploadOne(idx)}
                        >
                          {uploadingIds.has(item.recipe.id) && (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          )}
                          Upload
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
