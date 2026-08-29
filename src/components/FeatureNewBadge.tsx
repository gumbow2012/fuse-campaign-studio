import { cn } from "@/lib/utils";
import { isFeatureNew, type FeatureKey } from "@/lib/featureRegistry";

/**
 * The ONLY place a "NEW" pill is rendered. Reads the central feature registry so
 * badges expire on their own.
 */
export function FeatureNewBadge({
  featureKey,
  className,
}: {
  featureKey: FeatureKey;
  className?: string;
}) {
  if (!isFeatureNew(featureKey)) return null;

  return (
    <span
      className={cn(
        "rounded-full border border-lime-300/40 bg-lime-300/15 px-1.5 py-[1px] font-sans text-[9px] font-bold uppercase tracking-[0.14em] text-lime-200",
        className
      )}
    >
      New
    </span>
  );
}

export default FeatureNewBadge;
