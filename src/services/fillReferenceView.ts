import { supabase } from "@/integrations/supabase/client";
import { uploadRunInputFile } from "@/services/runInputUpload";

/** Shown on the button. The server's FILL_VIEW_CREDITS is what is actually charged. */
export const FILL_VIEW_CREDITS = 4;

export type FillView = "back" | "left" | "right" | "inside";

const NOT_PRODUCT = /logo|brand|vibe|background|name|website|face|person/i;

/** Which missing view a slot asks for, or null when it is not a fillable product angle. */
export function viewForLabel(label: string): FillView | null {
  if (NOT_PRODUCT.test(label)) return null;
  if (/inside|underside/i.test(label)) return "inside";
  if (/\bback\b/i.test(label)) return "back";
  if (/\bleft\b/i.test(label)) return "left";
  if (/\bright\b/i.test(label)) return "right";
  if (/\bside\b/i.test(label)) return "left";
  return null;
}

/** Slots whose photo shows the product itself, so it can be used to build a missing view. */
export function isProductPhotoLabel(label: string): boolean {
  return !NOT_PRODUCT.test(label) && /front|back|side|inside|underside|detail|hat|cap|product|top/i.test(label);
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("fill-reference-view", { body });
  const result = (data ?? (error as unknown as { context?: { body?: unknown } })?.context?.body ?? null) as (T & { ok?: boolean; reason?: string }) | null;
  if (!result?.ok) throw new Error(result?.reason ?? error?.message ?? "The view could not be made.");
  return result;
}

/**
 * Generates a missing view from the customer's own hat photos. Charges credits when it starts
 * (refunded by the server if it fails). Resolves with an image URL for the slot.
 */
export async function fillReferenceView(view: FillView, sources: (File | string)[]): Promise<string> {
  const sourceUrls = await Promise.all(sources.slice(0, 4).map((source) => (typeof source === "string" ? source : uploadRunInputFile(source))));
  const { fillId } = await call<{ fillId: string }>({ action: "start", view, sourceUrls });
  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const status = await call<{ state: "running" | "done" | "failed"; url?: string; reason?: string }>({ action: "status", fillId });
    if (status.state === "done" && status.url) return status.url;
    if (status.state === "failed") throw new Error(status.reason ?? "The view could not be made. Your credits were refunded.");
  }
  throw new Error("Still working on it. Check back in a minute.");
}
