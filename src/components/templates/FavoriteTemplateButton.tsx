import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

type FavoriteTemplateButtonProps = {
  favorite: boolean;
  onToggle: () => void;
  className?: string;
  label?: string;
};

/** RETENTION P1 — heart toggle. Presentation only; state lives in useTemplateFavorites. */
const FavoriteTemplateButton = ({ favorite, onToggle, className, label }: FavoriteTemplateButtonProps) => (
  <button
    type="button"
    aria-pressed={favorite}
    aria-label={favorite ? "Remove from favorites" : "Save to favorites"}
    title={favorite ? "Remove from favorites" : "Save to favorites"}
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] backdrop-blur transition-colors",
      favorite
        ? "border-rose-300/50 bg-rose-400/20 text-rose-100 hover:bg-rose-400/30"
        : "border-white/15 bg-black/55 text-white/85 hover:bg-black/80",
      className,
    )}
  >
    <Heart className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
    {label ? <span>{label}</span> : null}
  </button>
);

export default FavoriteTemplateButton;
