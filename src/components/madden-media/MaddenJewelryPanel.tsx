/**
 * Madden Media Studio — M3 jewelry module.
 *
 * Independent of the subject and outfit modules: jewelry can be swapped while
 * the subject and outfit stay locked. The references are product authority for
 * the JEWELRY ONLY — their background, hands, gloves, box and scene are never
 * carried over (this module owns that instruction in its own edge action).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import MaddenConsistencyPanel from "@/components/madden-media/MaddenConsistencyPanel";
import {
  analyzeJewelry,
  deleteMaddenProfile,
  listJewelryProfiles,
  saveJewelryProfile,
} from "@/services/maddenMediaStudio";
import {
  createEmptyJewelryData,
  MADDEN_JEWELRY_CATEGORIES,
  MADDEN_JEWELRY_FIELDS,
  MADDEN_JEWELRY_LABELS,
  normalizeJewelryData,
  summarizeJewelry,
  type MaddenJewelryCategory,
  type MaddenJewelryProfile,
  type MaddenJewelryProfileData,
} from "@/lib/madden-media/wardrobe";
import type { MaddenSlot } from "@/lib/madden-media/types";

type Props = {
  slot: MaddenSlot;
  onBind: (patch: {
    name?: string;
    profileId?: string | null;
    profileData?: MaddenJewelryProfileData;
    locked?: boolean;
  }) => void;
};

export default function MaddenJewelryPanel({ slot, onBind }: Props) {
  const [profiles, setProfiles] = useState<MaddenJewelryProfile[]>([]);
  const [name, setName] = useState(slot.name);
  const [data, setData] = useState<MaddenJewelryProfileData>(() =>
    slot.profileData ? normalizeJewelryData(slot.profileData) : createEmptyJewelryData(),
  );

  useEffect(() => {
    setName(slot.name);
    setData(slot.profileData ? normalizeJewelryData(slot.profileData) : createEmptyJewelryData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.profileId]);

  useEffect(() => {
    void listJewelryProfiles()
      .then(setProfiles)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load saved jewelry"),
      );
  }, []);

  return (
    <MaddenConsistencyPanel<MaddenJewelryCategory, MaddenJewelryProfileData>
      title="Jewelry"
      description="Reference images are product authority for the jewelry only — metal, finish, stones, form and scale. The reference background, hands and packaging are never carried over. Your edits and locks always win."
      namePlaceholder="Jewelry set name (your label)"
      savedLabel="Saved jewelry"
      analyzeLabel="Analyze jewelry"
      saveLabel="Save jewelry"
      updateLabel="Update saved jewelry"
      categories={MADDEN_JEWELRY_CATEGORIES}
      categoryLabels={MADDEN_JEWELRY_LABELS}
      fields={MADDEN_JEWELRY_FIELDS}
      presentLabel="Worn"
      slotLocked={slot.locked}
      slotName={name}
      profileId={slot.profileId ?? null}
      data={data}
      profiles={profiles}
      summarize={summarizeJewelry}
      onAnalyze={(urls) => analyzeJewelry(urls)}
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
          const profile = await saveJewelryProfile({
            id: slot.profileId ?? null,
            name,
            data,
            thumbnailUrl: data.referenceUrls[0] ?? null,
          });
          setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
          onBind({ name: profile.name, profileId: profile.id, profileData: profile.data });
          toast.success("Jewelry saved to your library");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not save that jewelry");
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
          toast.error(error instanceof Error ? error.message : "Could not delete that jewelry");
        }
      }}
    />
  );
}
