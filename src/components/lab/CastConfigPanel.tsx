/**
 * FT8 — admin-only cast configuration for a template version.
 * Persists to template_versions.cast_config via the workbench.
 * NO CASTING clears the config to null (legacy behavior).
 */

import { useEffect, useState } from "react";
import { Copy, Loader2, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_IDENTITY_STRENGTH,
  IDENTITY_STRENGTHS,
  PRIMARY_CAST_SLOT_ID,
  type CastConfig,
  type CastIdentityStrength,
} from "@/lib/castConfig";

type CastMode = "NO_CASTING" | "OPTIONAL" | "REQUIRED";

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60";

export default function CastConfigPanel({
  nodes,
  castConfig,
  saving,
  disabled,
  isActiveVersion,
  cloning,
  onSave,
  onCloneForCast,
}: {
  nodes: Array<{ id: string; name: string; nodeType: string }>;
  castConfig: CastConfig | null;
  saving?: boolean;
  disabled?: boolean;
  /** FT9 — live versions are protected: configure cast on a clone instead. */
  isActiveVersion?: boolean;
  cloning?: boolean;
  onSave: (next: CastConfig | null) => void | Promise<void>;
  onCloneForCast?: (next: CastConfig) => void | Promise<void>;
}) {

  const slot = castConfig?.slots?.[0] ?? null;
  const [mode, setMode] = useState<CastMode>("NO_CASTING");
  const [nodeId, setNodeId] = useState("");
  const [identityStrength, setIdentityStrength] = useState<CastIdentityStrength>(DEFAULT_IDENTITY_STRENGTH);
  const [preservePose, setPreservePose] = useState(false);
  const [preserveComposition, setPreserveComposition] = useState(false);
  const [preserveEnvironment, setPreserveEnvironment] = useState(false);

  useEffect(() => {
    setMode(castConfig?.supported ? (castConfig.required ? "REQUIRED" : "OPTIONAL") : "NO_CASTING");
    setNodeId(slot?.nodeId ?? "");
    setIdentityStrength(slot?.identityStrength ?? DEFAULT_IDENTITY_STRENGTH);
    setPreservePose(slot?.preservePose === true);
    setPreserveComposition(slot?.preserveComposition === true);
    setPreserveEnvironment(slot?.preserveEnvironment === true);
  }, [
    castConfig?.supported,
    castConfig?.required,
    slot?.nodeId,
    slot?.identityStrength,
    slot?.preservePose,
    slot?.preserveComposition,
    slot?.preserveEnvironment,
  ]);

  const castEnabled = mode !== "NO_CASTING";
  const locked = isActiveVersion === true;
  const busy = !!saving || !!cloning;
  const canSave = !locked && !disabled && !busy && (!castEnabled || !!nodeId);
  const canClone = locked && !disabled && !busy && castEnabled && !!nodeId && !!onCloneForCast;

  const buildConfig = (): CastConfig => ({
    supported: true,
    required: mode === "REQUIRED",
    slots: [
      {
        id: PRIMARY_CAST_SLOT_ID,
        label: "Cast A",
        nodeId,
        preservePose,
        preserveComposition,
        preserveEnvironment,
        identityStrength,
      },
    ],
  });

  const submit = () => {
    if (!castEnabled) {
      void onSave(null);
      return;
    }
    void onSave(buildConfig());
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-background/45 p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-cyan-200" />
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/80">Cast</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            locked
              ? "bg-amber-300/10 text-amber-100"
              : "bg-cyan-300/10 text-cyan-100"
          }`}
        >
          {locked ? "Live version — protected" : "Draft test version"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {locked
          ? "This version is live. Pick the cast settings below and clone it into a draft test version — the live graph is never touched."
          : "Casting metadata only — the runner is unchanged. No casting keeps this version exactly as today."}
      </p>


      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Casting</Label>
          <select
            className={SELECT_CLASS}
            value={mode}
            disabled={disabled}
            onChange={(event) => setMode(event.target.value as CastMode)}
          >
            <option value="NO_CASTING">No casting</option>
            <option value="OPTIONAL">Optional cast</option>
            <option value="REQUIRED">Required cast</option>
          </select>
        </div>

        {castEnabled ? (
          <div className="space-y-2">
            <Label>Cast subject node</Label>
            <select
              className={SELECT_CLASS}
              value={nodeId}
              disabled={disabled}
              onChange={(event) => setNodeId(event.target.value)}
            >
              <option value="">Select the node…</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name} ({node.nodeType})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Pick explicitly — multi-person templates are never auto-guessed.
            </p>
          </div>
        ) : null}
      </div>

      {castEnabled ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Identity strength</Label>
            <select
              className={SELECT_CLASS}
              value={identityStrength}
              disabled={disabled}
              onChange={(event) => setIdentityStrength(event.target.value as CastIdentityStrength)}
            >
              {IDENTITY_STRENGTHS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Preserve</Label>
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-foreground/80">
              {([
                ["Pose", preservePose, setPreservePose],
                ["Composition", preserveComposition, setPreserveComposition],
                ["Environment", preserveEnvironment, setPreserveEnvironment],
              ] as Array<[string, boolean, (value: boolean) => void]>).map(([label, value, setValue]) => (
                <label key={label} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value}
                    disabled={disabled}
                    onChange={(event) => setValue(event.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {locked ? (
          <Button type="button" onClick={() => void onCloneForCast?.(buildConfig())} disabled={!canClone}>
            {cloning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
            Clone version for Cast
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={!canSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Cast
          </Button>
        )}
      </div>
      {locked ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          The clone starts as an unreviewed draft. Activation stays a separate manual step after testing.
        </p>
      ) : null}

    </div>
  );
}
