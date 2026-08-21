/**
 * NANO PROMPT BLOCK COMPILER (§E4) — structural only.
 *
 * The jewelry generation prompt is assembled from a fixed, ordered set of NAMED
 * blocks. Each block is concise physical text derived from data that already
 * exists (Master Product Lock, target spec, stone engineering, connected assets,
 * source cinematography / campaign photography, lighting, diamond optics, frame
 * instruction, reference routing, firewalls, negatives).
 *
 * RULES
 * - A block is emitted ONLY when it has content; empty blocks vanish entirely.
 * - Blocks carry the SAME effective instructions as before this refactor: this
 *   module does not add, expand or weaken any directive, and it never dumps raw
 *   PKM / lock / profile JSON — callers pass finished prompt lines.
 */

export const PROMPT_BLOCK_ORDER = [
  "TASK",
  "MASTER_PRODUCT_LOCK",
  "TARGET_SPEC",
  "STONE_ENGINEERING",
  "CONNECTED_ASSET",
  "SOURCE_CAMERA",
  "PHOTOGRAPHY",
  "LIGHTING",
  "OPTICS",
  "FRAME_INSTRUCTION",
  "REFERENCE_ROUTING",
  "CONTEXT_FIREWALL",
  "NEGATIVES",
  /** Run-specific tail: failure correction + caller extra (unchanged). */
  "CORRECTION",
  "EXTRA",
] as const;

export type PromptBlockName = (typeof PROMPT_BLOCK_ORDER)[number];

export type PromptBlocks = Partial<
  Record<PromptBlockName, (string | null | undefined | false)[] | string | null>
>;

/** Keeps only real lines; trims trailing whitespace, preserves author wording. */
function blockLines(value: PromptBlocks[PromptBlockName]): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((line) => (typeof line === "string" ? line.replace(/\s+$/, "") : null))
    .filter((line): line is string => Boolean(line && line.trim()));
}

/**
 * Compiles the named blocks in PROMPT_BLOCK_ORDER, separated by a blank line.
 * Blocks without data are omitted, so a project with no analysis produces the
 * same lean prompt it produced before.
 */
export function compilePromptBlocks(blocks: PromptBlocks): string {
  const sections: string[] = [];
  for (const name of PROMPT_BLOCK_ORDER) {
    const lines = blockLines(blocks[name]);
    if (lines.length) sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}

/** Block names that actually carried content — for logs / audit payloads. */
export function activePromptBlocks(blocks: PromptBlocks): PromptBlockName[] {
  return PROMPT_BLOCK_ORDER.filter((name) => blockLines(blocks[name]).length > 0);
}
