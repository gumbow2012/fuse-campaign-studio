/**
 * Madden Media Studio — M4 preset primitives.
 *
 * Self-contained: Madden defines its own curated preset library. Nothing here
 * imports from Cinema, Generation Studio, Jewelry or Templates.
 */

export type MaddenPreset = {
  id: string;
  name: string;
  description: string;
  /** Fragment fed into the M6 prompt compiler. */
  promptFragment: string;
  tags: string[];
};

export function findPreset(list: MaddenPreset[], id: string | null | undefined) {
  if (!id) return null;
  return list.find((preset) => preset.id === id) ?? null;
}

export function searchPresets(list: MaddenPreset[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (preset) =>
      preset.name.toLowerCase().includes(q) ||
      preset.description.toLowerCase().includes(q) ||
      preset.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}
