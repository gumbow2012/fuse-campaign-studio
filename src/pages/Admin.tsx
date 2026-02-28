import { useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";

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

  const [newTemplate, setNewTemplate] = useState({ name: "", description: "", estimated_credits_per_run: 10, category: "" });

  const createTemplate = async () => {
    try {
      const { error } = await supabase.from("templates").insert([newTemplate]);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      setNewTemplate({ name: "", description: "", estimated_credits_per_run: 10, category: "" });
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

  // Recent projects
  const { data: recentProjects } = useQuery({
    queryKey: ["admin-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(name), profiles!projects_user_id_fkey(email)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

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
          </TabsList>

          <TabsContent value="templates">
            {/* Create template form */}
            <div className="rounded-xl border border-border/40 bg-card p-5 mb-6">
              <h3 className="text-sm font-bold text-foreground mb-4">New Template</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Input placeholder="Name" value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Category" value={newTemplate.category} onChange={e => setNewTemplate({...newTemplate, category: e.target.value})} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Description" value={newTemplate.description} onChange={e => setNewTemplate({...newTemplate, description: e.target.value})} className="bg-secondary border-border text-foreground" />
                <Input placeholder="Credits per run" type="number" value={newTemplate.estimated_credits_per_run} onChange={e => setNewTemplate({...newTemplate, estimated_credits_per_run: parseInt(e.target.value) || 10})} className="bg-secondary border-border text-foreground" />
              </div>
              <Button onClick={createTemplate} className="gradient-primary text-primary-foreground font-bold border-0" disabled={!newTemplate.name}>
                <Plus size={14} className="mr-1" /> Create
              </Button>
            </div>

            {/* Template list */}
            <div className="space-y-2">
              {templates?.map(t => (
                <div key={t.id} className="rounded-lg border border-border/30 bg-card p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.category} · {t.estimated_credits_per_run} credits</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 size={14} />
                  </Button>
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
                    <p className="text-xs text-muted-foreground">{p.profiles?.email ?? "—"} · {new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    p.status === "complete" ? "bg-green-500/20 text-green-400" :
                    p.status === "failed" ? "bg-red-500/20 text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{p.status}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
