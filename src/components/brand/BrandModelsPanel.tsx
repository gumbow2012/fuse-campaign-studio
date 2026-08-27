/**
 * Brand Workspace — Models / FUSE Cast panel.
 *
 * Lists the signed-in user's avatar_profiles and lets them associate models with
 * the ACTIVE brand. Association is persisted in brand_profiles.metadata.modelIds
 * (the same shape the onboarding wizard writes).
 */

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CARD, LABEL } from "@/components/brand/BrandEditors";
import { avatarInitials } from "@/lib/avatarImage";
import type { AvatarProfile } from "@/services/avatarProfiles";
import { patchBrandMetadata, readModelIds, type BrandProfile } from "@/services/brandProfiles";

export default function BrandModelsPanel({
  avatars,
  loading,
  activeBrand,
}: {
  avatars: AvatarProfile[];
  loading: boolean;
  activeBrand: BrandProfile | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const modelIds = useMemo(() => readModelIds(activeBrand), [activeBrand]);

  const sorted = useMemo(() => {
    const linked = (id: string) => (modelIds.includes(id) ? 0 : 1);
    return [...avatars].sort((a, b) => linked(a.id) - linked(b.id) || a.name.localeCompare(b.name));
  }, [avatars, modelIds]);

  const toggle = useMutation({
    mutationFn: async (avatarId: string) => {
      if (!activeBrand) throw new Error("No active brand");
      const next = modelIds.includes(avatarId)
        ? modelIds.filter((id) => id !== avatarId)
        : [...modelIds, avatarId];
      await patchBrandMetadata(activeBrand, { modelIds: next });
      return next.includes(avatarId);
    },
    onSuccess: (added) => {
      toast.success(added ? "Model added to this brand" : "Model removed from this brand");
      queryClient.invalidateQueries({ queryKey: ["brand-profiles"] });
    },
    onError: () => toast.error("Could not update this brand's cast"),
  });

  const addModelCta = (
    <Button
      type="button"
      onClick={() => navigate("/app/avatars")}
      className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
    >
      <Plus className="h-3.5 w-3.5" /> Add a model
    </Button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={LABEL}>Models / FUSE Cast</p>
          <p className="mt-1 text-sm text-slate-400">
            {activeBrand
              ? `${modelIds.length} of ${avatars.length} model${avatars.length === 1 ? "" : "s"} linked to ${activeBrand.name}.`
              : "Pick an active brand to link models."}
          </p>
        </div>
        {addModelCta}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading models…</p>
      ) : sorted.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((avatar) => {
            const linked = modelIds.includes(avatar.id);
            return (
              <div key={avatar.id} className={`${CARD} ${linked ? "border-cyan-300/40" : ""}`}>
                <div className="flex items-start gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40 text-sm font-semibold text-cyan-100">
                    {avatar.thumbnail_url ? (
                      <img
                        src={avatar.thumbnail_url}
                        alt={avatar.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      avatarInitials(avatar.name)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{avatar.name}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {avatar.source_type === "FUSE" ? "FUSE cast" : "Your model"}
                    </p>
                    {avatar.style_tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {avatar.style_tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {linked ? (
                    <span className="inline-flex h-8 items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 text-[11px] uppercase tracking-[0.16em] text-cyan-100">
                      <Check className="h-3 w-3" /> In this brand
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!activeBrand || toggle.isPending}
                    onClick={() => toggle.mutate(avatar.id)}
                    className="h-8 rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
                  >
                    {linked ? "Remove" : "Add to brand"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`${CARD} flex flex-col items-start gap-3`}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-cyan-200">
            <Users className="h-5 w-5" />
          </span>
          <p className="text-sm text-slate-400">
            No models yet. Save a model once and reuse it across every campaign.
          </p>
          {addModelCta}
        </div>
      )}
    </div>
  );
}
