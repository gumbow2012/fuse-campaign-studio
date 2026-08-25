import { cn } from "@/lib/utils";

export type BuilderStepId = "preview" | "requirements" | "assets" | "cast" | "review" | "generate";

export type BuilderStep = {
  id: BuilderStepId;
  label: string;
  /** Steps can be skipped without removing them, so future phases can slot in. */
  enabled: boolean;
  complete?: boolean;
};

/**
 * Campaign builder steps as data. The Cast step is not built yet, so it is
 * disabled (auto-skipped) for every template until that phase ships.
 */
export function buildCampaignSteps({
  hasRequirements,
  assetsReady,
  canGenerate,
  castEnabled = false,
}: {
  hasRequirements: boolean;
  assetsReady: boolean;
  canGenerate: boolean;
  castEnabled?: boolean;
}): BuilderStep[] {
  return [
    { id: "preview", label: "Preview", enabled: true, complete: true },
    { id: "requirements", label: "Requirements", enabled: true, complete: hasRequirements },
    { id: "assets", label: "Assets", enabled: true, complete: assetsReady },
    { id: "cast", label: "Cast", enabled: castEnabled, complete: false },
    { id: "review", label: "Review", enabled: true, complete: assetsReady },
    { id: "generate", label: "Generate", enabled: true, complete: canGenerate },
  ];
}

export default function CampaignBuilderSteps({ steps }: { steps: BuilderStep[] }) {
  const visible = steps.filter((step) => step.enabled);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Campaign builder steps">
      {visible.map((step, index) => (
        <li key={step.id} className="flex items-center gap-2">
          {index > 0 ? <span className="text-white/20">/</span> : null}
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.18em]",
              step.complete ? "text-cyan-100" : "text-slate-500",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
