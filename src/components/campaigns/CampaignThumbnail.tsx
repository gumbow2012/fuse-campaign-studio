import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCampaignThumbnail, type CampaignRun } from "@/lib/campaignHistory";

/**
 * Campaign hero media. Poster-first, lazy, and never autoplaying — offscreen
 * cards stay cheap (same media discipline as the generation gallery cards).
 */
export default function CampaignThumbnail({
  run,
  templatePreviewUrl,
  className,
}: {
  run: CampaignRun;
  templatePreviewUrl?: string | null;
  className?: string;
}) {
  const thumbnail = resolveCampaignThumbnail(run, templatePreviewUrl);

  if (thumbnail.kind === "placeholder") {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]",
          className,
        )}
        aria-hidden
      >
        <Sparkles className="h-5 w-5 text-cyan-100/50" />
      </div>
    );
  }

  if (thumbnail.kind === "video") {
    return (
      <video
        src={thumbnail.url}
        className={cn("bg-black/40", className)}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
      />
    );
  }

  return (
    <img
      src={thumbnail.url}
      alt=""
      className={cn("bg-black/40", className)}
      loading="lazy"
      decoding="async"
    />
  );
}
