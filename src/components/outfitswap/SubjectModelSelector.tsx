/**
 * Outfit Swap V2 — PHASE 4: model / person reference selector for ONE subject.
 *
 * This deliberately REUSES the shared FUSE avatar system (avatar_profiles +
 * CastLibrary, the same picker the template runner, Brand Workspace and
 * onboarding use). No second avatar system lives here.
 *
 * The selection is CHOSEN and STORED only — Phase 4 never wires model
 * references into the swap or video generation calls, so "Keep original"
 * (the default) keeps today's clothing-only behaviour untouched.
 */

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CastLibrary, { CastPortrait } from "@/components/cast/CastLibrary";
import {
  createUserAvatar,
  listFuseAvatars,
  listMyAvatars,
  uploadAvatarReference,
  type AvatarProfile,
} from "@/services/avatarProfiles";
import {
  KEEP_ORIGINAL_MODEL,
  MAX_MODEL_REFERENCES,
  type OutfitSwapModelSource,
  type OutfitSwapSubjectModel,
} from "@/services/outfitSwap";

const SELECT_CLASS =
  "w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-1.5 text-xs text-foreground outline-none transition-colors hover:border-cyan-200/40 focus:border-cyan-200/60";

const OPTIONS: { value: OutfitSwapModelSource; label: string }[] = [
  { value: "keep_original", label: "Keep original" },
  { value: "upload", label: "Upload model" },
  { value: "avatar", label: "My avatars" },
  { value: "cast", label: "FUSE Cast" },
];

export default function SubjectModelSelector({
  userId,
  model,
  onChange,
  compact = false,
}: {
  userId?: string | null;
  model: OutfitSwapSubjectModel | null;
  onChange: (next: OutfitSwapSubjectModel) => void;
  compact?: boolean;
}) {
  const source = model?.modelSource ?? "keep_original";
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const wantsAvatar = source === "avatar" || source === "cast";
  const fuseAvatars = useQuery({ queryKey: ["fuse-avatars"], queryFn: listFuseAvatars, enabled: wantsAvatar });
  const myAvatars = useQuery({
    queryKey: ["my-avatars", userId ?? "anon"],
    queryFn: () => listMyAvatars(userId ?? ""),
    enabled: wantsAvatar && Boolean(userId),
  });

  const selectedAvatar = useMemo<AvatarProfile | null>(
    () =>
      [...(myAvatars.data ?? []), ...(fuseAvatars.data ?? [])].find(
        (avatar) => avatar.id === model?.avatarId,
      ) ?? null,
    [fuseAvatars.data, myAvatars.data, model?.avatarId],
  );

  const refs = model?.uploadedRefUrls ?? [];

  const selectSource = (next: OutfitSwapModelSource) => {
    if (next === "keep_original") {
      onChange({ ...KEEP_ORIGINAL_MODEL });
      return;
    }
    onChange({
      modelSource: next,
      avatarId: next === "upload" ? null : (model?.avatarId ?? null),
      uploadedRefUrls: next === "upload" ? refs : [],
    });
    if (next !== "upload") setPicking(true);
  };

  const addReferences = async (files: File[]) => {
    if (!files.length) return;
    const room = MAX_MODEL_REFERENCES - refs.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_MODEL_REFERENCES} model photos.`);
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, room)) {
        urls.push(await uploadAvatarReference(file));
      }
      onChange({ modelSource: "upload", avatarId: null, uploadedRefUrls: [...refs, ...urls] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that photo");
    } finally {
      setUploading(false);
    }
  };

  /** Explicit, opt-in only — loose references never enter My avatars on their own. */
  const saveAsAvatar = async () => {
    if (!refs.length) return;
    setSavingAvatar(true);
    try {
      const created = await createUserAvatar({
        name: `Outfit Swap model ${new Date().toLocaleDateString()}`,
        reference_assets: refs,
        thumbnail_url: refs[0],
      });
      toast.success("Saved to My avatars");
      if (created) onChange({ modelSource: "avatar", avatarId: created.id, uploadedRefUrls: [] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that avatar");
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">Model</label>
        <select
          value={source}
          onChange={(event) => selectSource(event.target.value as OutfitSwapModelSource)}
          className={SELECT_CLASS}
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {source === "keep_original" ? (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Same person, new wardrobe.
          </p>
        ) : null}
      </div>

      {wantsAvatar ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-2">
          <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/50">
            {selectedAvatar ? (
              <CastPortrait avatar={selectedAvatar} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserRound size={14} className="text-foreground/40" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-foreground">
              {selectedAvatar ? selectedAvatar.name : "No one selected yet"}
            </p>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="mt-1 text-[10px] uppercase tracking-[0.12em] text-cyan-200 hover:text-cyan-100"
            >
              {selectedAvatar ? "Change" : source === "cast" ? "Browse FUSE Cast" : "Browse my avatars"}
            </button>
          </div>
        </div>
      ) : null}

      {source === "upload" ? (
        <div className="rounded-xl border border-white/10 bg-black/25 p-2">
          <div className={compact ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-5 gap-2"}>
            {refs.map((url) => (
              <div
                key={url}
                className="relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-black/50"
              >
                <img src={url} alt="Model reference" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove model reference"
                  onClick={() =>
                    onChange({
                      modelSource: "upload",
                      avatarId: null,
                      uploadedRefUrls: refs.filter((entry) => entry !== url),
                    })
                  }
                  className="absolute right-1 top-1 rounded-md border border-white/15 bg-black/60 p-0.5 text-foreground/70 hover:border-red-400/60 hover:text-red-300"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {refs.length < MAX_MODEL_REFERENCES ? (
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/30 text-cyan-200 transition-colors hover:border-cyan-200/50"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              </button>
            ) : null}
          </div>
          <input
            ref={uploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              void addReferences(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              {refs.length}/{MAX_MODEL_REFERENCES} photos · used only in this project
            </p>
            {refs.length ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={savingAvatar}
                onClick={() => void saveAsAvatar()}
                className="h-6 rounded-lg border-white/12 bg-white/[0.03] px-2 text-[10px] uppercase tracking-[0.12em]"
              >
                {savingAvatar ? <Loader2 size={11} className="animate-spin" /> : "Save as avatar"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-4xl border-white/10 bg-[#07090f]">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">
              {source === "cast" ? "FUSE Cast" : "My avatars"}
            </DialogTitle>
          </DialogHeader>
          <CastLibrary
            userId={userId}
            mode="single"
            selectedIds={model?.avatarId ? [model.avatarId] : []}
            onToggle={(avatar) => {
              onChange({
                modelSource: avatar.source_type === "FUSE" ? "cast" : "avatar",
                avatarId: avatar.id === model?.avatarId ? null : avatar.id,
                uploadedRefUrls: [],
              });
              setPicking(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
