import { useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, BarChart3, Eye, Copy, Loader2, Download } from "lucide-react";
import { Link } from "react-router-dom";

const EXAMPLE_INPUT_SCHEMA = JSON.stringify(
  [
    { key: "shirt_image", label: "Shirt Image", nodeId: "node_abc123", type: "image", required: true },
    { key: "background", label: "Background Reference", nodeId: "node_def456", type: "image", required: false },
  ],
  null,
  2,
);

const Admin = () => {
  const queryClient = useQueryClient();

  // Templates
  const { data: templates } = useQuery({
    queryKey: ["admin-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    estimated_credits_per_run: 10,
    category: "",
    weavy_flow_url: "",
    weavy_recipe_id: "",
    weavy_recipe_version: 1,
    input_schema: EXAMPLE_INPUT_SCHEMA,
    output_type: "video",
    expected_output_count: 1,
  });

  const createTemplate = async () => {
    try {
      let parsedSchema: any[];
      try {
        parsedSchema = JSON.parse(newTemplate.input_schema);
      } catch {
        toast({ title: "Invalid JSON", description: "input_schema must be valid JSON array", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("templates").insert([
        {
          name: newTemplate.name,
          description: newTemplate.description,
          estimated_credits_per_run: newTemplate.estimated_credits_per_run,
          category: newTemplate.category,
          weavy_flow_url: newTemplate.weavy_flow_url || null,
          weavy_recipe_id: newTemplate.weavy_recipe_id || null,
          weavy_recipe_version: newTemplate.weavy_recipe_version || 1,
          input_schema: parsedSchema,
          output_type: newTemplate.output_type,
          expected_output_count: newTemplate.expected_output_count,
        },
      ]);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      setNewTemplate({
        name: "",
        description: "",
        estimated_credits_per_run: 10,
        category: "",
        weavy_flow_url: "",
        weavy_recipe_id: "",
        weavy_recipe_version: 1,
        input_schema: EXAMPLE_INPUT_SCHEMA,
        output_type: "video",
        expected_output_count: 1,
      });
      toast({ title: "Template created" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      toast({ title: "Template deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Credit Adjustment
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");

  const adjustCredits = async () => {
    try {
      const { error } = await supabase.functions.invoke("admin-adjust-credits", {
        body: { userId: creditUserId, amount: parseInt(creditAmount), description: creditDesc },
      });
      if (error) throw error;
      toast({ title: "Credits adjusted" });
      setCreditUserId("");
      setCreditAmount("");
      setCreditDesc("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Revenue config
  const { data: platformConfig } = useQuery({
    queryKey: ["platform-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_config").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: referralConfig } = useQuery({
    queryKey: ["referral-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_program_config").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  // Recent projects
  const { data: recentProjects } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Paste-to-import
  const [curlPaste, setCurlPaste] = useState("");
  const [parseLoading, setParseLoading] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  const parseCurlInput = async () => {
    if (!curlPaste.trim()) {
      toast({ title: "Paste a cURL or request body first", variant: "destructive" });
      return;
    }
    setParseLoading(true);
    setParsedResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("parse-weavy-curl", {
        body: { rawInput: curlPaste },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "Parse failed", description: data.error, variant: "destructive" });
        setParsedResult(data);
        return;
      }
      setParsedResult(data);

      // Auto-fill template form
      const p = data.parsed;
      setNewTemplate((prev) => ({
        ...prev,
        weavy_recipe_id: p.recipeId || prev.weavy_recipe_id,
        weavy_recipe_version: p.recipeVersion || prev.weavy_recipe_version,
        input_schema: p.inputs?.length ? JSON.stringify(p.inputs, null, 2) : prev.input_schema,
      }));
      toast({ title: "✅ Parsed!", description: `Recipe ${p.recipeId} with ${p.inputs?.length || 0} inputs extracted.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setParseLoading(false);
    }
  };

  const oneClickImport = async () => {
    if (!parsedResult?.parsed) return;
    const p = parsedResult.parsed;
    if (!p.recipeId) {
      toast({ title: "Missing recipe ID", description: "Could not extract recipe ID from the pasted data.", variant: "destructive" });
      return;
    }

    try {
      let parsedSchema = p.inputs || [];

      const { error } = await supabase.from("templates").insert([
        {
          name: newTemplate.name || `Weavy Recipe ${p.recipeId.slice(0, 8)}`,
          description: newTemplate.description || "",
          estimated_credits_per_run: newTemplate.estimated_credits_per_run,
          category: newTemplate.category || "",
          weavy_recipe_id: p.recipeId,
          weavy_recipe_version: p.recipeVersion || 1,
          input_schema: parsedSchema,
          output_type: newTemplate.output_type,
          expected_output_count: newTemplate.expected_output_count,
        },
      ]);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      setCurlPaste("");
      setParsedResult(null);
      setNewTemplate({
        name: "",
        description: "",
        estimated_credits_per_run: 10,
        category: "",
        weavy_flow_url: "",
        weavy_recipe_id: "",
        weavy_recipe_version: 1,
        input_schema: EXAMPLE_INPUT_SCHEMA,
        output_type: "video",
        expected_output_count: 1,
      });
      toast({ title: "🚀 Template created!", description: "Recipe imported and ready to use." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Admin</h1>
        <p className="text-muted-foreground text-sm mb-8">Manage templates, credits, and projects.</p>

        <Tabs defaultValue="templates">
          <TabsList className="bg-secondary border border-border/40 mb-6">
            <TabsTrigger value="templates" className="text-xs">Templates</TabsTrigger>
            <TabsTrigger value="credits" className="text-xs">Credits</TabsTrigger>
            <TabsTrigger value="projects" className="text-xs">Projects</TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs">Referrals</TabsTrigger>
          </TabsList>

          <TabsContent value="templates">
            {/* Paste-to-Import */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 mb-6">
              <h3 className="text-sm font-bold text-foreground mb-2">⚡ One-Paste Import</h3>
              <p className="text-xs text-muted-foreground mb-1">
                Run your flow once in Weavy, then:
              </p>
              <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside mb-3">
                <li>Open DevTools → <strong>Network</strong> tab (F12)</li>
                <li>Click <strong>Run</strong> in Weavy</li>
                <li>Find the <code className="text-primary">POST .../run</code> request → right-click → <strong>Copy as cURL</strong></li>
                <li>Paste below → everything is auto-extracted</li>
              </ol>
              <Textarea
                placeholder={`Paste cURL here...\n\ncurl 'https://...weavy.io/api/v1/recipe-runs/recipes/ABC123/run' \\\n  -H 'Authorization: Bearer ...' \\\n  --data-raw '{"recipeVersion":1,"inputs":[...]}'`}
                value={curlPaste}
                onChange={(e) => setCurlPaste(e.target.value)}
                rows={5}
                className="bg-secondary border-border text-foreground font-mono text-xs mb-3"
              />
              <div className="flex gap-2">
                <Button
                  onClick={parseCurlInput}
                  disabled={parseLoading || !curlPaste.trim()}
                  className="gradient-primary text-primary-foreground font-bold border-0"
                >
                  {parseLoading ? (
                    <><Loader2 size={14} className="mr-1 animate-spin" /> Parsing...</>
                  ) : (
                    <><Download size={14} className="mr-1" /> Parse & Extract</>
                  )}
                </Button>
                {parsedResult?.parsed && (
                  <Button
                    onClick={oneClickImport}
                    className="bg-accent text-accent-foreground font-bold border-0"
                  >
                    <Plus size={14} className="mr-1" /> One-Click Create Template
                  </Button>
                )}
              </div>

              {parsedResult?.parsed && (
                <div className="mt-4 rounded-lg border border-border/30 bg-card p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                    ✅ Extracted Data
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <div><span className="text-muted-foreground">Recipe ID:</span> <span className="text-foreground font-mono font-bold">{parsedResult.parsed.recipeId || "—"}</span></div>
                    <div><span className="text-muted-foreground">Version:</span> <span className="text-foreground font-bold">{parsedResult.parsed.recipeVersion}</span></div>
                    <div><span className="text-muted-foreground">Inputs found:</span> <span className="text-foreground font-bold">{parsedResult.parsed.inputs?.length || 0}</span></div>
                    <div><span className="text-muted-foreground">Base URL:</span> <span className="text-foreground font-mono text-[10px]">{parsedResult.parsed.baseUrl || "—"}</span></div>
                  </div>
                  {parsedResult.parsed.inputs?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Inputs</p>
                      {parsedResult.parsed.inputs.map((inp: any, i: number) => (
                        <div key={i} className="text-[10px] font-mono bg-secondary/50 rounded p-1.5 flex items-center gap-2">
                          <span className="text-primary font-bold">{inp.nodeId}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-foreground">{inp.label}</span>
                          <span className="text-muted-foreground">({inp.type})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick-edit name before one-click import */}
                  <div className="mt-3 flex gap-2">
                    <Input
                      placeholder="Template name (optional, auto-generated if empty)"
                      value={newTemplate.name}
                      onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      className="bg-secondary border-border text-foreground text-xs"
                    />
                    <Input
                      placeholder="Credits"
                      type="number"
                      value={newTemplate.estimated_credits_per_run}
                      onChange={e => setNewTemplate({ ...newTemplate, estimated_credits_per_run: parseInt(e.target.value) || 10 })}
                      className="bg-secondary border-border text-foreground text-xs w-24"
                    />
                  </div>
                </div>
              )}

              {parsedResult?.error && (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive font-bold">{parsedResult.error}</p>
                  {parsedResult.hint && <p className="text-xs text-muted-foreground mt-1">{parsedResult.hint}</p>}
                </div>
              )}
            </div>

            {/* Create template form with Weavy fields */}
            <div className="rounded-xl border border-border/40 bg-card p-5 mb-6">
              <h3 className="text-sm font-bold text-foreground mb-4">New Template (Weavy Capture)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input placeholder="Template Name *" value={newTemplate.name} onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Category" value={newTemplate.category} onChange={e => setNewTemplate({ ...newTemplate, category: e.target.value })} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Description" value={newTemplate.description} onChange={e => setNewTemplate({ ...newTemplate, description: e.target.value })} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Credits per run" type="number" value={newTemplate.estimated_credits_per_run} onChange={e => setNewTemplate({ ...newTemplate, estimated_credits_per_run: parseInt(e.target.value) || 10 })} className="bg-secondary border-border text-foreground" />
              </div>

              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2 mt-4">Weavy Configuration</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input placeholder="Weavy Flow URL (optional)" value={newTemplate.weavy_flow_url} onChange={e => setNewTemplate({ ...newTemplate, weavy_flow_url: e.target.value })} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Weavy Recipe ID *" value={newTemplate.weavy_recipe_id} onChange={e => setNewTemplate({ ...newTemplate, weavy_recipe_id: e.target.value })} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Recipe Version" type="number" value={newTemplate.weavy_recipe_version} onChange={e => setNewTemplate({ ...newTemplate, weavy_recipe_version: parseInt(e.target.value) || 1 })} className="bg-secondary border-border text-foreground" />
                <div className="flex gap-2">
                  <select
                    value={newTemplate.output_type}
                    onChange={e => setNewTemplate({ ...newTemplate, output_type: e.target.value })}
                    className="flex-1 h-10 rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                  >
                    <option value="video">Video</option>
                    <option value="image">Image</option>
                  </select>
                  <Input placeholder="Output count" type="number" value={newTemplate.expected_output_count} onChange={e => setNewTemplate({ ...newTemplate, expected_output_count: parseInt(e.target.value) || 1 })} className="bg-secondary border-border text-foreground w-28" />
                </div>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2 mt-4">Input Schema (JSON)</p>
              <Textarea
                value={newTemplate.input_schema}
                onChange={e => setNewTemplate({ ...newTemplate, input_schema: e.target.value })}
                rows={6}
                className="bg-secondary border-border text-foreground font-mono text-xs mb-3"
                placeholder='[{"key":"shirt_image","label":"Shirt Image","nodeId":"node_abc","type":"image","required":true}]'
              />

              <Button onClick={createTemplate} className="gradient-primary text-primary-foreground font-bold border-0" disabled={!newTemplate.name}>
                <Plus size={14} className="mr-1" /> Create Template
              </Button>
            </div>

            {/* Template list */}
            <div className="space-y-2">
              {templates?.map((t: any) => (
                <div key={t.id} className="rounded-lg border border-border/30 bg-card overflow-hidden">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.category || "—"} · {t.estimated_credits_per_run} credits
                        {t.weavy_recipe_id && <span className="ml-2 text-primary">· Weavy: {t.weavy_recipe_id}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setExpandedTemplate(expandedTemplate === t.id ? null : t.id)} className="text-muted-foreground hover:text-foreground">
                        <Eye size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(t.id); toast({ title: "ID copied" }); }} className="text-muted-foreground hover:text-foreground">
                        <Copy size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                  {expandedTemplate === t.id && (
                    <div className="px-4 pb-4 border-t border-border/20 pt-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">Recipe ID:</span> <span className="text-foreground font-mono">{t.weavy_recipe_id || "—"}</span></div>
                        <div><span className="text-muted-foreground">Version:</span> <span className="text-foreground">{t.weavy_recipe_version || "—"}</span></div>
                        <div><span className="text-muted-foreground">Output:</span> <span className="text-foreground">{t.output_type} × {t.expected_output_count}</span></div>
                        <div><span className="text-muted-foreground">Flow URL:</span> <span className="text-foreground font-mono text-[10px] break-all">{t.weavy_flow_url || "—"}</span></div>
                      </div>
                      <pre className="mt-2 text-[10px] bg-secondary/50 rounded p-2 overflow-x-auto text-muted-foreground">
                        {JSON.stringify(t.input_schema, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="credits">
            <div className="rounded-xl border border-border/40 bg-card p-5 max-w-md">
              <h3 className="text-sm font-bold text-foreground mb-4">Adjust User Credits</h3>
              <div className="space-y-3">
                <Input placeholder="User ID (UUID)" value={creditUserId} onChange={e => setCreditUserId(e.target.value)} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Amount (+/-)" type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Reason" value={creditDesc} onChange={e => setCreditDesc(e.target.value)} className="bg-secondary border-border text-foreground" />
                <Button onClick={adjustCredits} disabled={!creditUserId || !creditAmount} className="gradient-primary text-primary-foreground font-bold border-0">
                  Adjust Credits
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="projects">
            <div className="space-y-2">
              {recentProjects?.map((p: any) => (
                <div key={p.id} className="rounded-lg border border-border/30 bg-card p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{p.templates?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.weavy_run_id && <span className="text-[9px] font-mono text-muted-foreground">{p.weavy_run_id.slice(0, 8)}...</span>}
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      p.status === "complete" ? "bg-green-500/20 text-green-400" :
                      p.status === "failed" ? "bg-red-500/20 text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="revenue">
            <div className="space-y-6">
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <h3 className="text-sm font-bold text-foreground mb-4">Revenue Split Config</h3>
                {platformConfig ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Platform Share</p>
                      <p className="font-display text-xl font-black text-foreground">{platformConfig.platform_share_percent}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Creator Share</p>
                      <p className="font-display text-xl font-black text-foreground">{platformConfig.creator_share_percent}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Affiliate %</p>
                      <p className="font-display text-xl font-black text-foreground">{platformConfig.affiliate_percent_of_platform}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Hold Period</p>
                      <p className="font-display text-xl font-black text-foreground">{platformConfig.hold_period_days}d</p>
                    </div>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Loading...</p>}
              </div>
              <Link to="/admin/analytics">
                <Button variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
                  <BarChart3 size={14} className="mr-2" /> View Full Analytics Dashboard
                </Button>
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="referrals">
            <div className="rounded-xl border border-border/40 bg-card p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">Referral Program Config</h3>
              {referralConfig ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Status</p>
                    <p className={`font-display text-lg font-black ${referralConfig.enabled ? "text-green-400" : "text-red-400"}`}>
                      {referralConfig.enabled ? "Active" : "Disabled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Signup Bonus</p>
                    <p className="font-display text-xl font-black text-foreground">{referralConfig.signup_bonus_credits} credits</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Referrer Bonus</p>
                    <p className="font-display text-xl font-black text-foreground">{referralConfig.referrer_bonus_credits_on_paid} credits</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Trigger</p>
                    <p className="text-xs font-bold text-foreground">{referralConfig.paid_trigger}</p>
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Loading...</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
