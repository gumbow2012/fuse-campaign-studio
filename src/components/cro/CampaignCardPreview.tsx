import { useQuery } from "@tanstack/react-query";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import { templateSlug } from "@/lib/templateSlug";
import CampaignCtaButton, { type CroCtaState } from "@/components/cro/CampaignCtaButton";

/** Outcome-first campaign card. Names/counts come from the live catalog. */
export function CampaignCard({
  template,
  slug,
  useCase,
  state,
}: {
  template: ApiTemplate | null;
  slug: string;
  useCase: string;
  state: CroCtaState;
}) {
  const images = template?.counts?.imageOutputs ?? 0;
  const clips = template?.counts?.videoOutputs ?? 0;
  const outputLine = template
    ? [images ? `${images} image${images === 1 ? "" : "s"}` : "", clips ? `${clips} clip${clips === 1 ? "" : "s"}` : ""]
        .filter(Boolean)
        .join(" + ")
    : "";

  const title = (template?.name ?? slug)
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) => prefix + letter.toUpperCase())
    .replace(/-/g, " ");

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-border/70 bg-card p-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{useCase}</p>
      </div>
      <p className="text-base text-foreground">
        {template ? outputLine || "Output counts unavailable" : "Loading campaign details…"}
      </p>
      <p className="text-sm text-muted-foreground">Included in Starter</p>
      <p className="text-xs text-muted-foreground">by FUSE Studio</p>
      <div className="mt-auto">
        <CampaignCtaButton
          state={state}
          surface="template_card"
          templateSlug={slug}
        />
      </div>
    </div>
  );
}

const CARDS = [
  { slug: "group-meet", useCase: "Lookbook" },
  { slug: "grillzzzz", useCase: "Jewelry close-up" },
  { slug: "changing-room", useCase: "Changing room" },
];

export default function CampaignCardPreview({ state = "signed_out" }: { state?: CroCtaState }) {
  const templatesQuery = useQuery({
    queryKey: ["cro-preview-catalog"],
    staleTime: 5 * 60_000,
    queryFn: () => fetchTemplates(""),
  });

  const bySlug = new Map(
    (templatesQuery.data ?? []).map((template) => [templateSlug(template), template]),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {CARDS.map((card) => (
        <CampaignCard
          key={card.slug}
          slug={card.slug}
          useCase={card.useCase}
          state={state}
          template={bySlug.get(card.slug) ?? null}
        />
      ))}
    </div>
  );
}
