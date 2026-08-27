/**
 * BRAND ACTIVATION — Phase 3: the ONE shared persistent/contextual banner.
 *
 * Driven entirely by the Phase 1 resolver (useBrandActivation → readiness +
 * resolveBrandActivationNudge). It strictly separates SETUP (required identity)
 * from ENRICHMENT (products / cast / creative DNA) so optional depth is never
 * framed as "incomplete setup". Renders nothing once the brand is enriched.
 *
 * Mount it once per surface — never duplicate the logic inline.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandActivation } from "@/hooks/useBrandActivation";
import {
  ACTIVATION_EVENTS,
  ONBOARDING_ROUTE,
  buildActivationStatePatch,
  findHighestValueMissing,
} from "@/lib/brandActivation";
import { writeLocalActivationState } from "@/lib/brandActivationLocal";
import { patchBrandMetadata } from "@/services/brandProfiles";
import { track } from "@/lib/analytics/track";

type Variant = "no_brand" | "setup" | "enrichment";

/** Enrichment copy — opportunity framing only, never "incomplete". */
const ENRICHMENT_COPY: Record<string, { title: string; body: string; cta: string }> = {
  product: {
    title: "Make more campaigns one-click",
    body: "Add your first product so FUSE can preload compatible templates.",
    cta: "Add product",
  },
  product_back: {
    title: "Unlock full-garment templates",
    body: "Add back views so templates can show the whole garment.",
    cta: "Add views",
  },
  model: {
    title: "Preload your cast",
    body: "Choose a model so people-based campaigns start ready.",
    cta: "Choose cast",
  },
  dna: {
    title: "Personalize your recommendations",
    body: "Add creative direction so FUSE suggests campaigns that fit your brand.",
    cta: "Add creative DNA",
  },
};

const ENRICHMENT_FALLBACK = {
  title: "Make more campaigns one-click",
  body: "Add a little more brand depth so FUSE can preload compatible templates.",
  cta: "Continue",
};

export default function BrandActivationBanner({
  surface,
  className,
}: {
  /** Non-PII surface label for analytics, e.g. "marketplace". */
  surface: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const { readiness, activationState, nudge, completionPercent, loading } = useBrandActivation();
  const [dismissed, setDismissed] = useState(false);
  const shownFor = useRef<string | null>(null);

  const content = useMemo(() => {
    if (loading || !user) return null;

    if (!activeBrand) {
      return {
        variant: "no_brand" as Variant,
        title: "Build your brand once",
        body: "FUSE can remember your products, logos and creative direction.",
        cta: "Build brand",
        deepLink: nudge?.deepLink || `${ONBOARDING_ROUTE}?step=1`,
        missingKey: "brand",
      };
    }

    if (!readiness) return null;
    const brandName = activeBrand.name?.trim() || "your brand";

    if (readiness.requiredMissing > 0) {
      const missing = findHighestValueMissing(readiness);
      return {
        variant: "setup" as Variant,
        title: `Finish setting up ${brandName}`,
        body: "Your identity is saved. Add your logo and colors to finish.",
        cta: "Continue",
        deepLink:
          nudge?.deepLink ??
          `${ONBOARDING_ROUTE}?brand=${encodeURIComponent(activeBrand.id)}&step=${missing?.step ?? 1}`,
        missingKey: missing?.key ?? "identity",
      };
    }

    const missing = findHighestValueMissing(readiness);
    if (!missing) return null; // brand enriched — stay silent
    const copy = ENRICHMENT_COPY[missing.key] ?? ENRICHMENT_FALLBACK;
    return {
      variant: "enrichment" as Variant,
      title: copy.title,
      body: copy.body,
      cta: copy.cta,
      deepLink: `${ONBOARDING_ROUTE}?brand=${encodeURIComponent(activeBrand.id)}&step=${missing.step}`,
      missingKey: missing.key,
    };
  }, [loading, user, activeBrand, readiness, nudge?.deepLink]);

  /** Changes whenever readiness meaningfully advances, which re-shows the banner. */
  const signature = content
    ? `${content.variant}:${content.missingKey}:${completionPercent}`
    : null;

  const suppressed =
    !!signature && activationState.bannerDismissedSignature === signature;

  const visible = !!content && !dismissed && !suppressed;

  useEffect(() => {
    if (!visible || !signature || shownFor.current === signature) return;
    shownFor.current = signature;
    track(ACTIVATION_EVENTS.nudgeShown, {
      level: "banner",
      surface,
      variant: content?.variant,
      missing: content?.missingKey,
      completion: completionPercent,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, signature]);

  async function persistDismissal() {
    try {
      if (activeBrand) {
        await patchBrandMetadata(
          activeBrand,
          buildActivationStatePatch(activationState, {
            bannerDismissedAt: new Date().toISOString(),
            bannerDismissedSignature: signature ?? undefined,
          }),
        );
      } else {
        writeLocalActivationState(user?.id, {
          bannerDismissedAt: new Date().toISOString(),
          bannerDismissedSignature: signature ?? undefined,
        });
      }
    } catch {
      /* cadence state is best-effort — never block the UI */
    }
  }

  if (!visible || !content) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.06] p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 pr-8 sm:pr-0">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
              {content.title}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{content.body}</p>
          </div>
        </div>

        <Button
          onClick={() => {
            track(ACTIVATION_EVENTS.nudgeClicked, {
              level: "banner",
              surface,
              variant: content.variant,
              missing: content.missingKey,
            });
            navigate(content.deepLink);
          }}
          className="shrink-0 gap-2 rounded-full font-semibold uppercase tracking-[0.14em]"
        >
          {content.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          void persistDismissal();
          track(ACTIVATION_EVENTS.nudgeDismissed, {
            level: "banner",
            surface,
            variant: content.variant,
            missing: content.missingKey,
          });
        }}
        className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 sm:static sm:ml-3"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
