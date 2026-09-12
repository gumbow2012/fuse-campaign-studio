import { useQuery } from "@tanstack/react-query";
import { fetchTemplateDetailPage } from "@/services/templateDetailPage";
import { fetchTemplates } from "@/services/fuseApi";
import { templateSlug } from "@/lib/templateSlug";
import CampaignCtaButton, { type CroCtaState } from "@/components/cro/CampaignCtaButton";

/**
 * Value box for one campaign. Every count comes from live data — never
 * hardcoded. Credits stay behind an "Advanced" disclosure.
 */
export default function CampaignValueBox({
  slug,
  state = "signed_out",
}: {
  slug: string;
  state?: CroCtaState;
}) {
  const detailQuery = useQuery({
    queryKey: ["cro-preview-detail", slug],
    staleTime: 5 * 60_000,
    queryFn: () => fetchTemplateDetailPage(slug),
  });
  const catalogQuery = useQuery({
    queryKey: ["cro-preview-catalog"],
    staleTime: 5 * 60_000,
    queryFn: () => fetchTemplates(""),
  });

  const detail = detailQuery.data ?? null;
  const catalogEntry =
    (catalogQuery.data ?? []).find((template) => templateSlug(template) === slug) ?? null;

  const uploads =
    catalogEntry?.input_schema?.map((field) => field.label) ??
    detail?.required_inputs.map((input) => input.label) ??
    [];
  const images = detail?.image_count ?? catalogEntry?.counts?.imageOutputs ?? 0;
  const clips = detail?.video_count ?? catalogEntry?.counts?.videoOutputs ?? 0;
  const credits = catalogEntry?.estimated_credits_per_run ?? 0;

  const loading = detailQuery.isPending && catalogQuery.isPending;
  const failed = detailQuery.isError && catalogQuery.isError;

  return (
    <div className="space-y-4 rounded-[18px] border border-border/70 bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground">{detail?.name ?? slug}</h3>

      {failed ? (
        <p className="text-sm text-muted-foreground">Campaign details are unavailable right now.</p>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              What you upload
            </p>
            <ul className="mt-1 space-y-1 text-base text-foreground">
              {loading ? (
                <li className="text-muted-foreground">Loading…</li>
              ) : uploads.length ? (
                uploads.map((label) => <li key={label}>{label}</li>)
              ) : (
                <li className="text-muted-foreground">No uploads needed for this campaign.</li>
              )}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              What you get
            </p>
            <p className="mt-1 text-base text-foreground">
              {loading
                ? "Loading…"
                : `${images} campaign image${images === 1 ? "" : "s"} + ${clips} short clip${
                    clips === 1 ? "" : "s"
                  }`}
            </p>
            <p className="text-sm text-muted-foreground">
              Ready for ads, socials, and launch pages
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Plan
            </p>
            <p className="mt-1 text-base text-foreground">Included in Starter</p>
            <p className="text-sm text-muted-foreground">About 3 campaigns/month on Starter</p>
          </div>

          <CampaignCtaButton state={state} surface="campaign_page" templateSlug={slug} />

          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">Advanced</summary>
            <p className="mt-2">
              {credits ? `Estimated ${credits.toLocaleString()} credits` : "Estimate unavailable"}
            </p>
          </details>
        </>
      )}
    </div>
  );
}
