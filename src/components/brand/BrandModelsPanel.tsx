/**
 * Brand Workspace — Models / FUSE Cast panel.
 *
 * Uses the shared premium CastLibrary (same picker as onboarding + the template
 * runner). Association is persisted in brand_profiles.metadata.modelIds — the
 * same shape the onboarding wizard writes, and the shape generation reads.
 */

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { LABEL } from "@/components/brand/BrandEditors";
import CastLibrary from "@/components/cast/CastLibrary";
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
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const modelIds = useMemo(() => readModelIds(activeBrand), [activeBrand]);

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
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update this brand's cast"),
  });

  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL}>Models / FUSE Cast</p>
        <p className="mt-1 text-sm text-slate-400">
          {activeBrand
            ? `${modelIds.length} of ${avatars.length || modelIds.length} model${avatars.length === 1 ? "" : "s"} linked to ${activeBrand.name}. Linked models are used when a campaign needs a person.`
            : "Pick an active brand to link models."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading models…</p>
      ) : (
        <CastLibrary
          userId={user?.id ?? null}
          mode="multi"
          selectedIds={modelIds}
          busyId={toggle.isPending ? toggle.variables ?? null : null}
          onToggle={(avatar) => {
            if (!activeBrand) {
              toast.error("Pick an active brand first.");
              return;
            }
            toggle.mutate(avatar.id);
          }}
        />
      )}
    </div>
  );
}
