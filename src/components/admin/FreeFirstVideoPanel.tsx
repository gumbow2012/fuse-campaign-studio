/**
 * F3 — Admin FREE FIRST VIDEO configuration panel.
 *
 * The admin explicitly picks which video output is the free activation preview.
 * Nothing is auto-picked and the server always re-validates on enable. Internal
 * cost figures shown here are ADMIN ONLY — never surface them publicly.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Gift, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type VideoOutput = { id: string; name: string };

type ConfigState = {
  activeVersionId: string | null;
  freePreviewEnabled: boolean;
  activationVideoNodeId: string | null;
  videoOutputs: VideoOutput[];
};

type Validation = {
  valid: boolean;
  reason: string | null;
  isVideo: boolean;
  reachable: boolean;
  dependencyNodeCount: number;
  requiredInputs: Array<{ nodeId: string; name: string }>;
  estimatedCredits: number;
  estimatedCostUsd: number;
};

async function callConfig(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-free-preview-config", { body });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) throw new Error(String(payload.error));
  return payload;
}

export default function FreeFirstVideoPanel({ templateId }: { templateId: string | null }) {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const data = await callConfig({ action: "get", templateId });
      const next: ConfigState = {
        activeVersionId: data.activeVersionId ? String(data.activeVersionId) : null,
        freePreviewEnabled: data.freePreviewEnabled === true,
        activationVideoNodeId: data.activationVideoNodeId ? String(data.activationVideoNodeId) : null,
        videoOutputs: Array.isArray(data.videoOutputs) ? (data.videoOutputs as VideoOutput[]) : [],
      };
      setConfig(next);
      setEligible(next.freePreviewEnabled);
      setSelectedNodeId(next.activationVideoNodeId ?? "");
      setValidation(null);
    } catch (error) {
      setConfig(null);
      toast({
        title: "Could not load free-video settings",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!templateId || !selectedNodeId) {
      setValidation(null);
      return;
    }
    let active = true;
    setValidating(true);
    void (async () => {
      try {
        const data = await callConfig({ action: "validate", templateId, nodeId: selectedNodeId });
        if (active) setValidation(data as unknown as Validation);
      } catch (error) {
        if (active) {
          setValidation({
            valid: false,
            reason: error instanceof Error ? error.message : "Validation failed",
            isVideo: false,
            reachable: false,
            dependencyNodeCount: 0,
            requiredInputs: [],
            estimatedCredits: 0,
            estimatedCostUsd: 0,
          });
        }
      } finally {
        if (active) setValidating(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedNodeId, templateId]);

  const enable = useCallback(async () => {
    if (!templateId || !selectedNodeId) return;
    setSaving(true);
    try {
      const data = await callConfig({ action: "enable", templateId, nodeId: selectedNodeId });
      if (data.enabled === true) {
        toast({ title: "Free first video enabled", description: "Customers can claim this video output once." });
        await load();
      } else {
        toast({
          title: "Not enabled",
          description: String(data.reason ?? "Validation failed on the server"),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Could not enable",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [load, selectedNodeId, templateId]);

  const disable = useCallback(async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      await callConfig({ action: "disable", templateId });
      toast({ title: "Free first video disabled" });
      await load();
    } catch (error) {
      toast({
        title: "Could not disable",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [load, templateId]);

  if (!templateId) return null;

  return (
    <div className="rounded-2xl border border-border/50 bg-background/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
            <Gift className="h-4 w-4 text-cyan-200" /> Free first video
          </h3>
          <p className="mt-1 text-sm text-foreground/65">
            One verified new account can generate exactly one designated video from this campaign — free.
          </p>
        </div>
        <label className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
          Eligible for first-video offer
          <Switch
            checked={eligible}
            disabled={loading || saving}
            onCheckedChange={(checked) => {
              setEligible(checked);
              if (!checked && config?.freePreviewEnabled) void disable();
            }}
            aria-label="Eligible for first-video offer"
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-foreground/60">Loading free-video settings…</p>
      ) : !config ? (
        <p className="mt-5 text-sm text-foreground/60">Free-video settings are unavailable right now.</p>
      ) : (
        <>
          {config.freePreviewEnabled ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-100">
                Enabled ·{" "}
                {config.videoOutputs.find((output) => output.id === config.activationVideoNodeId)?.name ??
                  config.activationVideoNodeId}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void disable()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Disable
              </Button>
            </div>
          ) : null}

          {eligible ? (
            <>
              <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/55">
                Preview output
              </label>
              {config.videoOutputs.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/60">
                  This template's active version has no video outputs to offer.
                </p>
              ) : (
                <select
                  className="mt-2 w-full rounded-xl border border-border/50 bg-card/60 px-3 py-2 text-sm text-foreground"
                  value={selectedNodeId}
                  onChange={(event) => setSelectedNodeId(event.target.value)}
                >
                  <option value="">Select a video output…</option>
                  {config.videoOutputs.map((output) => (
                    <option key={output.id} value={output.id}>
                      {output.name}
                    </option>
                  ))}
                </select>
              )}

              {selectedNodeId ? (
                <div className="mt-4 rounded-xl border border-border/40 bg-card/50 p-4 text-sm">
                  {validating ? (
                    <p className="flex items-center gap-2 text-foreground/60">
                      <Loader2 className="h-4 w-4 animate-spin" /> Validating graph…
                    </p>
                  ) : validation ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2">
                        {validation.isVideo ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-300" />
                        )}
                        <span className="text-foreground/80">
                          {validation.isVideo ? "Is a video output" : "Not a video output"}
                        </span>
                      </p>
                      <p className="text-foreground/70">
                        Dependency path = {validation.dependencyNodeCount} steps
                      </p>
                      <div>
                        <p className="text-foreground/60">Required customer inputs:</p>
                        {validation.requiredInputs.length ? (
                          <ul className="mt-1 list-disc pl-5 text-foreground/80">
                            {validation.requiredInputs.map((input) => (
                              <li key={input.nodeId}>{input.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-foreground/50">None</p>
                        )}
                      </div>
                      <p className="text-foreground/80">
                        Estimated FUSE cost: {validation.estimatedCredits} credits (~$
                        {validation.estimatedCostUsd.toFixed(2)} internal)
                      </p>
                      {!validation.valid ? (
                        <p className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-rose-100">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          {validation.reason ?? "This output cannot be offered for free."}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Button
                type="button"
                className="mt-4"
                onClick={() => void enable()}
                disabled={
                  saving ||
                  validating ||
                  !selectedNodeId ||
                  !validation?.valid ||
                  (config.freePreviewEnabled && config.activationVideoNodeId === selectedNodeId)
                }
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                ENABLE FREE FIRST VIDEO
              </Button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
