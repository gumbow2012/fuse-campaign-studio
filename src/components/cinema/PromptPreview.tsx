import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CompiledPrompt } from "@/lib/cinema/promptCompiler";
import type { DirectorConfig, DirectorConfigField } from "@/lib/cinema/types";

/**
 * FUSE Cinema — exact model prompt preview.
 * Shows the compiled prose and the resolved director config side by side.
 * Auto text and a user override are kept strictly separate: the override is
 * only ever what the user typed, and clearing it returns to the compiled text.
 */

export interface PromptPreviewProps {
  compiled: CompiledPrompt;
  resolvedConfig: DirectorConfig;
  /** User-edited final prompt, or null when the compiled prompt is in use. */
  override: string | null;
  onOverrideChange: (value: string | null) => void;
}

export default function PromptPreview({
  compiled,
  resolvedConfig,
  override,
  onOverrideChange,
}: PromptPreviewProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const editing = draft !== null;
  const effective = override ?? compiled.finalPrompt;
  const overLimit = effective.length > compiled.promptMaxChars;

  const configRows = useMemo(
    () =>
      (Object.keys(resolvedConfig) as DirectorConfigField[]).map((field) => ({
        field,
        source: resolvedConfig[field]?.source ?? "SYSTEM_DEFAULT",
        value: resolvedConfig[field]?.value,
      })),
    [resolvedConfig],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="fuse-panel rounded-2xl">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <span className="font-display text-[11px] uppercase tracking-[0.2em]">
            View final model prompt
          </span>
          <span className="flex items-center gap-2">
            {override !== null ? (
              <Badge variant="outline" className="text-[9px] uppercase tracking-[0.16em]">
                Edited
              </Badge>
            ) : null}
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {effective.length}/{compiled.promptMaxChars} chars
            </span>
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-4 px-4 pb-4">
        <Tabs defaultValue="prompt">
          <TabsList>
            <TabsTrigger value="prompt">Final Model Prompt</TabsTrigger>
            <TabsTrigger value="config">Resolved Director Config</TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="space-y-3">
            {editing ? (
              <>
                <Textarea
                  value={draft ?? ""}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[280px] font-mono text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      const next = (draft ?? "").trim();
                      onOverrideChange(next ? next : null);
                      setDraft(null);
                    }}
                  >
                    Use this prompt
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-background/40 p-3 font-mono text-xs leading-relaxed">
                  {effective || "Describe your scene to compile a prompt."}
                </pre>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraft(effective)}>
                    Edit prompt
                  </Button>
                  {override !== null ? (
                    <Button size="sm" variant="ghost" onClick={() => onOverrideChange(null)}>
                      Revert to auto-compiled
                    </Button>
                  ) : null}
                </div>
                {overLimit ? (
                  <p className="text-[11px] text-destructive">
                    Over the model limit — the provider will truncate anything past{" "}
                    {compiled.promptMaxChars} characters.
                  </p>
                ) : null}
              </>
            )}

            <div className="space-y-1 text-[11px] text-muted-foreground">
              {Object.keys(compiled.nativeParams).length ? (
                <p>
                  Native params:{" "}
                  <span className="font-mono text-foreground">
                    {JSON.stringify(compiled.nativeParams)}
                  </span>
                </p>
              ) : (
                <p>Native params: none — this model takes everything through the prompt.</p>
              )}
              {compiled.omittedFields.length ? (
                <p>
                  Not supported by {compiled.model} (omitted):{" "}
                  {compiled.omittedFields.join(", ")}
                </p>
              ) : null}
              {compiled.trimmedSections.length ? (
                <p>Trimmed to fit the prompt budget: {compiled.trimmedSections.join(", ")}</p>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="config">
            <div className="max-h-[340px] space-y-2 overflow-auto">
              {configRows.map((row) => (
                <div
                  key={row.field}
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[10px] uppercase tracking-[0.18em]">
                      {row.field}
                    </span>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
                      {row.source}
                    </Badge>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(row.value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
