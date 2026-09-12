/**
 * Grouped reference list for a campaign's real configured inputs.
 *
 * Required references sit in one compact list; an optional group is rendered
 * ONLY when the template actually declares optional inputs.
 */

import CampaignReferenceRow from "@/components/campaigns/CampaignReferenceRow";
import type { CampaignField } from "@/lib/campaignFields";

interface Props {
  fields: CampaignField[];
  files: Record<string, File | null>;
  assets: Record<string, { url: string; name?: string | null } | null>;
  onFileChange: (key: string, file: File | null) => void;
  onClear: (key: string) => void;
  /** "0 of 2 added" — omitted when nothing is required. */
  addedCount: number;
  requiredCount: number;
}

function List({
  fields,
  files,
  assets,
  onFileChange,
  onClear,
  showRequirement,
}: Pick<Props, "fields" | "files" | "assets" | "onFileChange" | "onClear"> & {
  showRequirement: boolean;
}) {
  return (
    <div className="divide-y divide-border/60">
      {fields.map((field) => (
        <CampaignReferenceRow
          key={field.id}
          field={field}
          file={files[field.id] ?? null}
          assetUrl={assets[field.id]?.url ?? null}
          showRequirement={showRequirement}
          onFileChange={(file) => onFileChange(field.id, file)}
          onClear={() => onClear(field.id)}
        />
      ))}
    </div>
  );
}

export default function CampaignReferenceList({
  fields,
  files,
  assets,
  onFileChange,
  onClear,
  addedCount,
  requiredCount,
}: Props) {
  const required = fields.filter((field) => field.required);
  const optional = fields.filter((field) => !field.required);

  return (
    <section aria-labelledby="campaign-references-heading" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="campaign-references-heading" className="text-[19px] font-semibold text-foreground">
          Your references
        </h2>
        {requiredCount > 0 ? (
          <p className="text-[13px] text-muted-foreground" aria-live="polite">
            {addedCount} of {requiredCount} added
          </p>
        ) : null}
      </div>

      {required.length ? (
        <>
          <p className="text-[14px] leading-6 text-muted-foreground">
            Add one image for each required reference.
          </p>
          <List
            fields={required}
            files={files}
            assets={assets}
            onFileChange={onFileChange}
            onClear={onClear}
            showRequirement={false}
          />
        </>
      ) : null}

      {optional.length ? (
        <div className="pt-4">
          <h3 className="text-[17px] font-semibold text-foreground">
            {required.length ? "Finishing touches" : "Optional references"}
          </h3>
          <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
            These are optional — add them only if you want them in the campaign.
          </p>
          <List
            fields={optional}
            files={files}
            assets={assets}
            onFileChange={onFileChange}
            onClear={onClear}
            showRequirement
          />
        </div>
      ) : null}
    </section>
  );
}
