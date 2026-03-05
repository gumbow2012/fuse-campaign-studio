import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, FileJson, Check, AlertCircle, Loader2 } from "lucide-react";

interface ParsedTemplate {
  id: string;
  name: string;
  nodesCount: number;
  edgesCount: number;
  rawJson: Record<string, unknown>;
  imported?: boolean;
}

function parseHarForTemplates(har: any): ParsedTemplate[] {
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) return [];

  const seen = new Map<string, ParsedTemplate>();

  for (const entry of entries) {
    const url: string = entry?.request?.url ?? "";
    if (!url.includes("/api/v1/recipes/")) continue;

    // Try to get JSON from postData first, then response
    let candidate: any = null;
    const postText = entry?.request?.postData?.text;
    const respText = entry?.response?.content?.text;

    for (const raw of [postText, respText]) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.nodes && parsed.edges) {
          candidate = parsed;
          break;
        }
      } catch {
        /* skip */
      }
    }

    if (!candidate) continue;

    // Extract ID from URL
    let templateId = "";
    const saveMatch = url.match(/\/recipes\/([^/]+)\/save/);
    const plainMatch = url.match(/\/recipes\/([^/?]+)/);
    if (saveMatch) templateId = saveMatch[1];
    else if (plainMatch) templateId = plainMatch[1];
    if (!templateId) continue;

    if (seen.has(templateId)) continue;

    const name = candidate.name || templateId;
    const nodesArr = Array.isArray(candidate.nodes) ? candidate.nodes : [];
    const edgesArr = Array.isArray(candidate.edges) ? candidate.edges : [];

    seen.set(templateId, {
      id: templateId,
      name,
      nodesCount: nodesArr.length,
      edgesCount: edgesArr.length,
      rawJson: candidate,
    });
  }

  return Array.from(seen.values());
}

export default function AdminTemplateImport() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ParsedTemplate[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setParseError(null);
      setTemplates([]);
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const har = JSON.parse(reader.result as string);
          const results = parseHarForTemplates(har);
          if (results.length === 0) {
            setParseError(
              "No valid templates found. Make sure the HAR contains requests to /api/v1/recipes/ with nodes & edges."
            );
          }
          setTemplates(results);
        } catch {
          setParseError("Failed to parse HAR file — invalid JSON.");
        }
      };
      reader.readAsText(file);
    },
    []
  );

  const importOne = useCallback(
    async (t: ParsedTemplate) => {
      setImporting((prev) => new Set(prev).add(t.id));
      try {
        const { error } = await supabase.from("templates").upsert(
          {
            weavy_recipe_id: t.id,
            name: t.name,
            raw_json: t.rawJson as any,
            nodes_count: t.nodesCount,
            edges_count: t.edgesCount,
            is_active: true,
          },
          { onConflict: "weavy_recipe_id" }
        );
        if (error) throw error;
        setTemplates((prev) =>
          prev.map((x) => (x.id === t.id ? { ...x, imported: true } : x))
        );
        toast({ title: `Imported "${t.name}"` });
      } catch (err: any) {
        toast({
          title: "Import failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setImporting((prev) => {
          const next = new Set(prev);
          next.delete(t.id);
          return next;
        });
      }
    },
    []
  );

  const importAll = useCallback(async () => {
    setImportingAll(true);
    const pending = templates.filter((t) => !t.imported);
    for (const t of pending) {
      await importOne(t);
    }
    setImportingAll(false);
    toast({ title: `Imported ${pending.length} templates` });
    navigate("/admin/templates");
  }, [templates, importOne, navigate]);

  const allImported = templates.length > 0 && templates.every((t) => t.imported);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12 max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Import Templates from HAR</h1>

        {/* Upload */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5" /> Upload HAR File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="file"
              accept=".har,application/json"
              onChange={handleFileChange}
              className="max-w-md"
            />
            {fileName && (
              <p className="text-sm text-muted-foreground mt-2">
                <FileJson className="inline h-4 w-4 mr-1" />
                {fileName}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Error */}
        {parseError && (
          <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive mb-6">
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm">{parseError}</p>
          </div>
        )}

        {/* Results */}
        {templates.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                Found {templates.length} template{templates.length !== 1 && "s"}
              </CardTitle>
              <Button
                onClick={importAll}
                disabled={importingAll || allImported}
                size="sm"
              >
                {importingAll && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {allImported ? "All Imported" : "Import All"}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Recipe ID</TableHead>
                    <TableHead className="text-center">Nodes</TableHead>
                    <TableHead className="text-center">Edges</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.id.slice(0, 16)}…
                      </TableCell>
                      <TableCell className="text-center">{t.nodesCount}</TableCell>
                      <TableCell className="text-center">{t.edgesCount}</TableCell>
                      <TableCell className="text-right">
                        {t.imported ? (
                          <Badge variant="secondary" className="gap-1">
                            <Check className="h-3 w-3" /> Done
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={importing.has(t.id)}
                            onClick={() => importOne(t)}
                          >
                            {importing.has(t.id) && (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            )}
                            Import
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
