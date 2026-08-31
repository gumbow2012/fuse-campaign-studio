/**
 * CREATOR-MODE BUILDER COPY (presentation only).
 *
 * Relabels the real Template Canvas palette / nodes with creator-friendly
 * language. The underlying node types, actions and server authorization are
 * unchanged — admin mode keeps the original labels.
 */

export type CreatorNodeHelpKey = "input" | "reference" | "prompt" | "image" | "video" | "connection";

export const CREATOR_NODE_HELP: Record<CreatorNodeHelpKey, { title: string; body: string }> = {
  input: {
    title: "Customer input",
    body: "Something your customer uploads. Changes every run.",
  },
  reference: {
    title: "Reference asset",
    body:
      "One of your own fixed references. Stays locked inside the template. Customers don't replace it.",
  },
  prompt: {
    title: "Prompt",
    body: "Instructions you write once. Customers never need to prompt.",
  },
  image: {
    title: "Image step",
    body: "Generates one campaign image.",
  },
  video: {
    title: "Video step",
    body: "Turns an image/frame into a video clip.",
  },
  connection: {
    title: "Connection",
    body: "Tells FUSE which result feeds into the next step.",
  },
};

/** Creator-friendly palette labels keyed by the real palette item key. */
export const CREATOR_PALETTE_LABELS: Record<string, { label: string; hint: string }> = {
  input: { label: "Customer Input", hint: "What your customer uploads" },
  reference: { label: "Reference", hint: "Your fixed image/reference" },
  image: { label: "Image Step", hint: "Generate a campaign image" },
  video: { label: "Video Step", hint: "Turn an image into a clip" },
  prompt: { label: "Prompt", hint: "Reusable instructions" },
};

export const CREATOR_LEARNING_OUTCOMES = [
  "Decide what customers upload",
  "Lock your own references into the template",
  "Write prompts once so customers never have to",
  "Build image and video steps",
  "Connect the workflow",
  "Choose generation models",
  "Test using real customer inputs",
  "Review your results",
  "Preview what customers see",
  "Submit your template",
];

export const CREATOR_HELP_TOPICS: Array<{ title: string; points: string[] }> = [
  {
    title: "Connecting steps",
    points: [
      "Drag from a step's output dot to the next step to connect them.",
      "A connection tells FUSE which result feeds into the next step.",
      "Order matters — the first connection is usually the main subject.",
    ],
  },
  {
    title: "Testing",
    points: [
      "Use Test to run the workflow with real customer-style inputs.",
      "Upload sample files the way a customer would, then review each result.",
      "Fix prompts or connections and test again until it's consistent.",
    ],
  },
  {
    title: "Publishing",
    points: [
      "When it's consistent, choose Submit for review.",
      "The FUSE team reviews your template before it goes live.",
      "You'll be notified once it's approved.",
    ],
  },
];

/** Maps a creator-facing status label from review status + active flags. */
export function creatorTemplateStatusLabel(input: {
  reviewStatus?: string | null;
  isActive?: boolean | null;
}): string {
  if (input.isActive) return "PUBLISHED";
  const value = (input.reviewStatus ?? "").trim().toLowerCase();
  if (!value) return "DRAFT";
  if (value.includes("approve") || value === "published" || value === "live") return "PUBLISHED";
  if (value.includes("reject") || value.includes("change")) return "NEEDS CHANGES";
  if (value.includes("submit") || value.includes("review") || value.includes("pending")) {
    return "IN REVIEW";
  }
  if (value.includes("test")) return "TESTING";
  return "DRAFT";
}
