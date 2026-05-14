import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { GitBranch, Loader2, Network, TestTube2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type WorkbenchVersion = {
  id: string;
  version_number: number;
  is_active: boolean;
  review_status: string;
  activationGate?: {
    publishable: boolean;
    reasons: string[];
    completedRunCount: number;
    approvedAuditCount: number;
    blockingOutputReportCount: number;
    latestApprovedJobId: string | null;
  } | null;
  counts: {
    total: number;
    inputs: number;
    images: number;
    videos: number;
    edges: number;
  };
};

type WorkbenchTemplate = {
  id: string;
  name: string;
  description: string | null;
  versions: WorkbenchVersion[];
};

type WorkbenchCatalogResponse = {
  templates?: WorkbenchTemplate[];
};

function getLiveVersion(template: WorkbenchTemplate) {
  return template.versions.find((version) => version.is_active) ?? template.versions[0] ?? null;
}

function getOutputCount(version: WorkbenchVersion | null) {
  return Number(version?.counts.images ?? 0) + Number(version?.counts.videos ?? 0);
}

function publishGateLabel(version: WorkbenchVersion | null) {
  if (!version) return "No version";
  if (version.is_active) return "Live";
  if (version.activationGate?.publishable) return "Ready";
  return "Testing";
}

function publishGateClass(version: WorkbenchVersion | null) {
  if (!version) return "border-white/10 bg-white/[0.03] text-slate-300";
  if (version.is_active || version.activationGate?.publishable) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }
  return "border-amber-300/30 bg-amber-400/10 text-amber-100";
}

export default function AdminTemplates() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin-template-workbench-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-template-workbench", {
        body: { action: "catalog" },
      });
      if (error) throw error;
      return ((data as WorkbenchCatalogResponse | null)?.templates ?? []) as WorkbenchTemplate[];
    },
  });

  return (
    <SiteShell>
      <div className="container mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pt-12">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Template Workbench</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Admin graph editor, version control, cloning, and template test runs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/app/lab/canvas">
                <Network className="mr-2 h-4 w-4" />
                New / Edit Draft
              </Link>
            </Button>
          </div>
        </div>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !templates?.length ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">No graph templates found.</p>
                <Button asChild className="mt-4" size="sm">
                  <Link to="/app/lab/canvas">Create a draft template</Link>
                </Button>
              </div>
            ) : (
              <>
              <div className="grid gap-3 p-3 md:hidden">
                {templates.map((template) => {
                  const liveVersion = getLiveVersion(template);
                  const totalOutputs = getOutputCount(liveVersion);

                  return (
                    <div key={template.id} className="rounded-lg border border-white/10 bg-background/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{template.name}</div>
                          {template.description ? (
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {template.description}
                            </div>
                          ) : null}
                        </div>
                        {liveVersion ? (
                          <Badge variant="default">v{liveVersion.version_number}</Badge>
                        ) : (
                          <Badge variant="secondary">None</Badge>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="rounded-md bg-white/[0.04] p-2">
                          <div className="text-muted-foreground">Versions</div>
                          <div className="mt-1 font-semibold">{template.versions.length}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.04] p-2">
                          <div className="text-muted-foreground">Nodes</div>
                          <div className="mt-1 font-semibold">{liveVersion?.counts.total ?? 0}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.04] p-2">
                          <div className="text-muted-foreground">Edges</div>
                          <div className="mt-1 font-semibold">{liveVersion?.counts.edges ?? 0}</div>
                        </div>
                        <div className="rounded-md bg-white/[0.04] p-2">
                          <div className="text-muted-foreground">Outputs</div>
                          <div className="mt-1 font-semibold">{totalOutputs}</div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                        Publish gate: {publishGateLabel(liveVersion)}
                        {!liveVersion?.is_active && liveVersion?.activationGate?.reasons?.[0] ? ` · ${liveVersion.activationGate.reasons[0]}` : ""}
                      </div>

                      <div className="mt-4 flex gap-2">
                        <Button asChild size="sm" className="flex-1 rounded-full">
                          <Link to={`/app/lab/canvas${liveVersion ? `?versionId=${liveVersion.id}` : ""}`}>
                            <GitBranch className="mr-2 h-4 w-4" />
                            Canvas
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline" className="flex-1 rounded-full border-white/15 bg-white/5">
                          <Link to={`/admin/audits${liveVersion ? `?versionId=${liveVersion.id}` : ""}`}>
                            <TestTube2 className="mr-2 h-4 w-4" />
                            Audit
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Versions</TableHead>
                    <TableHead className="text-center">Live</TableHead>
                    <TableHead className="text-center">Nodes</TableHead>
                    <TableHead className="text-center">Edges</TableHead>
                    <TableHead className="text-center">Outputs</TableHead>
                    <TableHead className="text-center">Publish Gate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const liveVersion = getLiveVersion(template);
                    const totalOutputs = getOutputCount(liveVersion);

                    return (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div className="font-medium">{template.name}</div>
                          {template.description ? (
                            <div className="mt-1 max-w-[320px] truncate text-xs text-muted-foreground">
                              {template.description}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-center">{template.versions.length}</TableCell>
                        <TableCell className="text-center">
                          {liveVersion ? (
                            <Badge variant="default">v{liveVersion.version_number}</Badge>
                          ) : (
                            <Badge variant="secondary">None</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{liveVersion?.counts.total ?? 0}</TableCell>
                        <TableCell className="text-center">{liveVersion?.counts.edges ?? 0}</TableCell>
                        <TableCell className="text-center">{totalOutputs}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={publishGateClass(liveVersion)}>
                            {publishGateLabel(liveVersion)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" asChild title="Graph editor">
                              <Link to={`/app/lab/canvas${liveVersion ? `?versionId=${liveVersion.id}` : ""}`}>
                                <GitBranch className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button size="icon" variant="ghost" asChild title="Audit runs">
                              <Link to={`/admin/audits${liveVersion ? `?versionId=${liveVersion.id}` : ""}`}>
                                <TestTube2 className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </SiteShell>
  );
}
