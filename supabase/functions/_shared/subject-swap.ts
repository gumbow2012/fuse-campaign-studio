/**
 * Subject Swap (direct, one pass) — pure planning for Kling O3 Pro video edit:
 * replacement people become Kling "elements", clothing photos become @Image refs,
 * and the prompt pins motion/camera/audio to the source clip. Throws before any charge.
 */
import { KLING_VIDEO_EDIT_MAX_REFERENCES } from "./fal.ts";
import type { AssemblySubjectModel } from "./outfit-swap-assembly.ts";

const cleanUrls = (list: unknown[]) => [...new Set(list.map((u) => String(u ?? "").trim()).filter(Boolean))];

export type DirectSubject = { subjectId: string; description?: string; model: AssemblySubjectModel };

function identityElement(model: AssemblySubjectModel) {
  const refs = cleanUrls(model.identityRefs ?? []);
  const angles = model.identityAngles ?? {};
  const frontal = String(angles.front ?? angles.frontal ?? refs[0] ?? "").trim();
  if (!frontal) return null;
  const others = cleanUrls([...Object.values(angles).map((v) => String(v ?? "")), ...refs]).filter((u) => u !== frontal).slice(0, 3);
  return { frontal_image_url: frontal, reference_image_urls: others.length ? others : [frontal] };
}

/** Pure: builds elements, garment images and the prompt. Throws before any charge. */
export function planDirectSwap(args: {
  subjects: DirectSubject[];
  totalSubjectsInClip: number;
  garments: Array<{ url?: string; backUrl?: string | null; hasBackDesign?: boolean; label?: string; type?: string }>;
  outfit: "keep" | "garments";
  extraPrompt?: string;
}) {
  const swapped = args.subjects.filter((s) => s.model.modelSource && s.model.modelSource !== "keep_original");
  if (!swapped.length) throw new Error("Choose a replacement person for at least one subject");
  const elements = swapped.map((s) => {
    const el = identityElement(s.model);
    if (!el) throw new Error(`Add at least one photo of the replacement person for ${s.description || s.subjectId}`);
    return el;
  });
  const garmentImages: string[] = [];
  const outfitLines: string[] = [];
  if (args.outfit === "garments") {
    const garments = args.garments.filter((g) => String(g?.url ?? "").trim());
    if (!garments.length) throw new Error("Add a clothing photo, or choose Keep their outfit");
    for (const g of garments) {
      garmentImages.push(String(g.url).trim());
      const front = garmentImages.length;
      const name = String(g.label || g.type || "garment").trim();
      if (g.hasBackDesign && String(g.backUrl ?? "").trim()) {
        garmentImages.push(String(g.backUrl).trim());
        outfitLines.push(`the ${name} shown in @Image${front} (front) and @Image${garmentImages.length} (back — use it exactly whenever their back is visible)`);
      } else {
        outfitLines.push(`the ${name} shown in @Image${front}`);
      }
    }
  }
  const total = elements.length + garmentImages.length;
  if (total > KLING_VIDEO_EDIT_MAX_REFERENCES) {
    throw new Error(`Quick swap fits ${KLING_VIDEO_EDIT_MAX_REFERENCES} references (each replaced person counts as 1, each clothing photo as 1). This setup needs ${total}. Use fewer clothing photos, or use Precision mode.`);
  }
  const who = (s: DirectSubject) => (s.description ? `the ${s.description.replace(/^(a|an|the)\s+/i, "")}` : args.totalSubjectsInClip > 1 ? `the person tracked as ${s.subjectId}` : "the person");
  const lines = swapped.map((s, i) =>
    `Replace ${who(s)} in @Video1 with @Element${i + 1}: match @Element${i + 1}'s face, hairline, hair, skin tone, body type and any tattoos exactly, in every frame.`);
  if (args.totalSubjectsInClip > swapped.length) lines.push("Leave everyone else in the clip exactly as they are.");
  lines.push(args.outfit === "garments"
    ? `Dress ${swapped.length > 1 ? "the replaced people" : "the replaced person"} in ${outfitLines.join(" and ")}; reproduce its color, fabric, fit, graphics and logos exactly.`
    : `Keep ${swapped.length > 1 ? "each replaced person's" : "the replaced person's"} original clothing from @Video1 exactly.`);
  lines.push("Keep the exact motion, timing, poses, gestures, lip movement, camera movement, framing, background, lighting and color grade of @Video1. Do not add or remove people, and do not change any other object, text or logo.");
  if (String(args.extraPrompt ?? "").trim()) lines.push(String(args.extraPrompt).trim());
  return { elements, imageUrls: garmentImages, prompt: lines.join(" "), swappedCount: swapped.length };
}


/** Self-check: deno run supabase/functions/_shared/subject-swap.ts */
if (import.meta.main) {
  const model = { modelSource: "upload", identityRefs: ["https://a/1.jpg", "https://a/2.jpg"] } as AssemblySubjectModel;
  const keep = planDirectSwap({ subjects: [{ subjectId: "subject_1", description: "adult in dark hoodie", model }], totalSubjectsInClip: 1, garments: [], outfit: "keep" });
  console.assert(keep.elements.length === 1 && keep.imageUrls.length === 0 && /original clothing/.test(keep.prompt) && /dark hoodie/.test(keep.prompt), "keep outfit");
  const dress = planDirectSwap({ subjects: [{ subjectId: "subject_1", model }], totalSubjectsInClip: 2, garments: [{ url: "https://g/f.png", backUrl: "https://g/b.png", hasBackDesign: true, label: "hoodie" }], outfit: "garments" });
  console.assert(dress.imageUrls.length === 2 && /@Image2 \(back/.test(dress.prompt) && /everyone else/.test(dress.prompt), "garments + back + others untouched");
  const bad = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
  console.assert(bad(() => planDirectSwap({ subjects: [{ subjectId: "s", model: { modelSource: "keep_original" } }], totalSubjectsInClip: 1, garments: [], outfit: "keep" })), "needs a replacement");
  console.assert(bad(() => planDirectSwap({ subjects: [{ subjectId: "a", model }, { subjectId: "b", model }], totalSubjectsInClip: 2, garments: [{ url: "https://g/1" }, { url: "https://g/2" }, { url: "https://g/3" }], outfit: "garments" })), "reference cap");
  console.assert(bad(() => planDirectSwap({ subjects: [{ subjectId: "a", model }], totalSubjectsInClip: 1, garments: [], outfit: "garments" })), "garments mode needs a garment");
  console.log("subject-swap self-check ok");
}
