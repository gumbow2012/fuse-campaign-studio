/**
 * Madden Media Studio — M3 outfit module.
 *
 * Independent of the subject module: the same subject can wear a different
 * outfit, and a saved outfit can be reused across projects.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import MaddenConsistencyPanel from "@/components/madden-media/MaddenConsistencyPanel";
import {
  analyzeOutfit,
  deleteMaddenProfile,
  listOutfitProfiles,
  saveOutfitProfile,
} from "@/services/maddenMediaStudio";
import {
  createEmptyOutfitData,
  MADDEN_GARMENT_FIELDS,
  MADDEN_OUTFIT_CATEGORIES,
  MADDEN_OUTFIT_LABELS,
  normalizeOutfitData,
  summarizeOutfit,
  type MaddenOutfitCategory,
  type MaddenOutfitProfile,
  type MaddenOutfitProfileData,
} from "@/lib/madden-media/wardrobe";
import type { MaddenSlot } from "@/lib/madden-media/types";

type Props = {
  slot: MaddenSlot;
  onBind: (patch: {
    name?: string;
    profileId?: string | null;
    profileData?: MaddenOutfitProfileData;
    locked?: boolean;
  }) => void;
};

export default function MaddenOutfitPanel({ slot, onBind }: Props) {
  const [profiles, setProfiles] = useState<MaddenOutfitProfile[]>([]);
  const [name, setName] = useState(slot.name);
  const [data, setData] = useState<MaddenOutfitProfileData>(() =>
    slot.profileData ? normalizeOutfitData(slot.profileData) : createEmptyOutfitData(),
  );

  useEffect(() => {
    setName(slot.name);
    setData(slot.profileData ? normalizeOutfitData(slot.profileData) : createEmptyOutfitData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.profileId]);

  useEffect(() => {
    void listOutfitProfiles()
      .then(setProfiles)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load saved outfits"),
      );
  }, []);

  return (
    <MaddenConsistencyPanel<MaddenOutfitCategory, MaddenOutfitProfileData>
      title="Outfit"
      description="Reference images drive a garment-consistency read: material, colour, graphics, fit and construction — never a brand claim. Your edits and locks always override the analysis."
      namePlaceholder="Outfit name (your label)"
      savedLabel="Saved outfits"
      analyzeLabel="Analyze outfit"
      saveLabel="Save outfit"
      updateLabel="Update saved outfit"
      categories={MADDEN_OUTFIT_CATEGORIES}
      categoryLabels={MADDEN_OUTFIT_LABELS}
      fields={MADDEN_GARMENT_FIELDS}
      slotLocked={slot.locked}
      slotName={name}
      profileId={slot.profileId ?? null}
      data={data}
      profiles={profiles}
      summarize={summarizeOutfit}
      onAnalyze={(urls) => analyzeOutfit(urls)}
      onDataChange={(next) => {
        setData(next);
        onBind({ profileData: next });
      }}
      onNameChange={(value) => {
        setName(value);
        onBind({ name: value });
      }}
      onLockedChange={(locked) => onBind({ locked })}
      onSave={async () => {
        try {
          const profile = await saveOutfitProfile({
            id: slot.profileId ?? null,
            name,
            data,
            thumbnailUrl: data.referenceUrls[0] ?? null,
          });
          setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
          onBind({ name: profile.name, profileId: profile.id, profileData: profile.data });
          toast.success("Outfit saved to your library");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save that outfit");
        }
      }}
      onUseProfile={(profile) => {
        setName(profile.name);
        setData(profile.data);
        onBind({ name: profile.name, profileId: profile.id, profileData: profile.data });
      }}
      onDeleteProfile={async (id) => {
        try {
          await deleteMaddenProfile(id);
          setProfiles((prev) => prev.filter((p) => p.id !== id));
          if (slot.profileId === id) onBind({ profileId: null });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not delete that outfit");
        }
      }}
    />
  );
}
