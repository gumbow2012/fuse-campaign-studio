/**
 * Studio "elements": named people / objects / places saved with their reference
 * images. Typing @Name in the prompt attaches that element's images at generate
 * time and rewrites the mention so the model knows which images it means.
 */

// ponytail: per-browser localStorage like the reference library; move to a table if elements must follow the user across devices.
export const ELEMENT_STORE_KEY = "fuse-studio-elements";
export const MAX_ELEMENT_IMAGES = 4;

export type ElementKind = "person" | "object" | "place";
export type StudioElement = { id: string; name: string; kind: ElementKind; urls: string[] };

export const ELEMENT_KINDS: { value: ElementKind; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "object", label: "Object" },
  { value: "place", label: "Place" },
];

/** Mention names are one token: letters, digits, _ and -. */
export function toElementName(raw: string) {
  return raw.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 32);
}

export function readElements(): StudioElement[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ELEMENT_STORE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e.name === "string" && Array.isArray(e.urls))
      : [];
  } catch {
    return [];
  }
}

export function writeElements(elements: StudioElement[]) {
  try {
    localStorage.setItem(ELEMENT_STORE_KEY, JSON.stringify(elements));
  } catch {
    // storage is a convenience only
  }
}

/** The "@partial" being typed right before the caret, or null. */
export function activeMention(text: string, caret: number) {
  const match = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(text.slice(0, caret));
  return match ? { query: match[2], start: caret - match[2].length - 1 } : null;
}

const MENTION = /@([\p{L}\p{N}_-]+)/gu;

/**
 * Appends each mentioned element's images after the manual references (cap
 * respected, duplicates reuse their slot) and rewrites @Name to
 * "Name (reference image 3)" using 1-based positions in the final list.
 */
export function expandMentions(
  prompt: string,
  elements: StudioElement[],
  referenceUrls: string[],
  maxImages: number,
) {
  const byName = new Map(elements.map((e) => [e.name.toLowerCase(), e]));
  const urls = [...referenceUrls];
  const used: StudioElement[] = [];
  const slots = new Map<string, number[]>();
  let dropped = 0;

  for (const [, name] of prompt.matchAll(MENTION)) {
    const element = byName.get(name.toLowerCase());
    if (!element || slots.has(element.id)) continue;
    const positions: number[] = [];
    for (const url of element.urls) {
      let index = urls.indexOf(url);
      if (index === -1) {
        if (urls.length >= maxImages) {
          dropped += 1;
          continue;
        }
        index = urls.push(url) - 1;
      }
      positions.push(index + 1);
    }
    slots.set(element.id, positions);
    used.push(element);
  }

  const text = prompt.replace(MENTION, (whole, name: string) => {
    const element = byName.get(name.toLowerCase());
    const positions = element && slots.get(element.id);
    if (!element || !positions?.length) return element ? element.name : whole;
    const where = positions.length === 1
      ? `reference image ${positions[0]}`
      : `reference images ${positions.join(", ")}`;
    return `${element.name} (the ${element.kind} shown in ${where})`;
  });

  return { prompt: text, urls, used, dropped };
}