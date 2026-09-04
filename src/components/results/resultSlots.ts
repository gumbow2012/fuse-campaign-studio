/**
 * Slot model for the Results experience.
 *
 * A "slot" is an intended campaign output position (its output_number). Media
 * fills its own slot as it lands, so provider completion order never reorders
 * the customer's campaign, and a slot that hasn't landed stays a calm
 * placeholder rather than a failure.
 */
import type { CampaignLiveStatus, LiveOutputItem } from "@/services/campaignLiveStatus";

export interface CampaignResultSlot {
  number: number;
  item: LiveOutputItem | null;
}

const isVideo = (mediaType: string | null | undefined) => mediaType === "video";

export function buildSlots(
  status: CampaignLiveStatus,
  mediaType: "video" | "image",
): CampaignResultSlot[] {
  const wantVideo = mediaType === "video";
  const items = status.outputs.items.filter((item) => isVideo(item.media_type) === wantVideo);
  const graphNodes = status.graph.filter((node) => isVideo(node.media_type) === wantVideo);

  const numbers = new Set<number>();
  graphNodes.forEach((node, index) => numbers.add(node.output_number ?? index + 1));
  items.forEach((item, index) => numbers.add(item.output_number ?? index + 1));

  const ordered = [...numbers].sort((a, b) => a - b);
  const byNumber = new Map<number, LiveOutputItem>();
  items.forEach((item, index) => byNumber.set(item.output_number ?? index + 1, item));

  return ordered.map((number) => ({ number, item: byNumber.get(number) ?? null }));
}

export const readySlots = (slots: CampaignResultSlot[]) => slots.filter((slot) => slot.item);

export const readyItems = (slots: CampaignResultSlot[]) =>
  readySlots(slots).map((slot) => slot.item as LiveOutputItem);
