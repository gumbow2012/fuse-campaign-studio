/**
 * Single shared formatter for customer-facing campaign deliverable labels.
 * Counts always come from the template object (counts.imageOutputs /
 * counts.videoOutputs) — never queried or invented here.
 */
type OutputCounts = { imageOutputs?: number | null; videoOutputs?: number | null } | null | undefined;

export function formatCampaignOutputs(counts?: OutputCounts): string {
  const img = Number(counts?.imageOutputs ?? 0);
  const vid = Number(counts?.videoOutputs ?? 0);
  const images = `${img} ${img === 1 ? "image" : "images"}`;
  const clips = `${vid} ${vid === 1 ? "video clip" : "video clips"}`;
  if (img > 0 && vid > 0) return `${images} · ${clips}`;
  if (img > 0) return images;
  if (vid > 0) return clips;
  return "campaign assets";
}


export function formatCampaignOutputsLong(counts?: OutputCounts): string {
  const img = Number(counts?.imageOutputs ?? 0);
  const vid = Number(counts?.videoOutputs ?? 0);
  const images = `${img} ${img === 1 ? "image" : "images"}`;
  const clips = `${vid} ${vid === 1 ? "video clip" : "video clips"}`;
  if (img > 0 && vid > 0) return `${images} + ${clips}`;
  if (img > 0) return images;
  if (vid > 0) return clips;
  return "campaign assets";
}

