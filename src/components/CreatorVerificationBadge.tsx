/**
 * FUSE verification mark — electric-cyan, FUSE-specific geometry (a faceted
 * spark inside a ring, not another platform's checkmark).
 *
 * Renders nothing for plain 'creator'.
 */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isBadgedVerification, verificationLabel } from "@/lib/creatorVerification";

export default function CreatorVerificationBadge({
  status,
  className,
  size = 14,
}: {
  status: unknown;
  className?: string;
  size?: number;
}) {
  if (!isBadgedVerification(status)) return null;
  const label = verificationLabel(status) ?? "FUSE Creator";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            role="img"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full border border-cyan-300/60 bg-cyan-300/15 text-cyan-200",
              className,
            )}
            style={{ width: size + 6, height: size + 6 }}
          >
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
              <path
                d="M12 2.5l2.4 5.1 5.6.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8z"
                fill="currentColor"
                opacity="0.95"
              />
            </svg>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
