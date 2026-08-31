/**
 * CREATOR BUILDER TUTORIAL — lesson definitions (presentation only).
 *
 * Every lesson spotlights a REAL control in the existing Template Builder via a
 * `data-tutorial="..."` anchor. Nothing here changes the engine, the node data
 * model, credits math or admin surfaces.
 */

export type CreatorTutorialSignal =
  | "library_seen"
  | "basics_seen"
  | "canvas_seen"
  | "input_added"
  | "reference_added"
  | "prompt_added"
  | "image_added"
  | "connection_made"
  | "video_added"
  | "saved"
  | "test_completed"
  | "submitted";

export type CreatorTutorialLesson = {
  id: string;
  /** Short checklist label for the progress tracker. */
  step: string;
  title: string;
  /** What it is. */
  what: string;
  /** Why it matters. */
  why: string;
  /** What to do now. */
  todo: string;
  /** `data-tutorial` value of the real control to spotlight. */
  anchor: string;
  /** Fallback anchors, tried in order when the primary is not mounted. */
  fallbackAnchors?: string[];
  /** When set, the lesson auto-advances once the creator really does it. */
  advanceOn?: CreatorTutorialSignal;
  tryIt?: string;
  /** Analytics event fired when the lesson is completed. */
  event?: string;
  /** Milestone lessons get a single cyan micro-glow (no confetti). */
  milestone?: boolean;
  extra?: string[];
};

export const CREATOR_TUTORIAL_LESSONS: CreatorTutorialLesson[] = [
  {
    id: "library",
    step: "Template library",
    title: "01 · Template library",
    what: "Every campaign template you build lives here.",
    why: "Only yours appear — you never see or edit FUSE or other creators' templates.",
    todo: "Open it any time to jump between drafts, tests and published templates.",
    anchor: "templates",
    event: "creator_library_learned",
  },
  {
    id: "basics",
    step: "Template basics",
    title: "02 · Template basics",
    what: "Name, description and cover image.",
    why: "This is what customers see when they discover your template.",
    todo: "Give it a clear name and a cover that shows the result customers get.",
    anchor: "template-basics",
    fallbackAnchors: ["settings", "templates"],
    event: "creator_first_template_created",
  },
  {
    id: "canvas",
    step: "The canvas",
    title: "03 · The canvas",
    what: "This is your workflow. Each block is one step. (Blocks are also called nodes.)",
    why: "Connect them so FUSE knows the order: what comes in → what happens → what's created.",
    todo: "Drag blocks to arrange them. Click a block to open its settings.",
    anchor: "canvas",
    advanceOn: "canvas_seen",
  },
  {
    id: "customer-input",
    step: "Customer input",
    title: "04 · Customer input",
    what: "Something your customer replaces every run — garment, product, logo, model.",
    why: "It's the one thing that changes each time your template is used.",
    todo: "Add one now, then set its NAME and TYPE so customers know what to upload.",
    anchor: "palette-input",
    advanceOn: "input_added",
    tryIt: "Click CUSTOMER INPUT in the Add step panel.",
    event: "creator_input_added",
    extra: [
      "Give it a customer-friendly name — customers see this label.",
      "Related uploads stay grouped in one card (e.g. GARMENT with Front / Back slots) — you don't need a separate card for every angle.",
    ],
  },
  {
    id: "reference",
    step: "Reference asset",
    title: "05 · Reference asset",
    what: "One of YOUR images. It stays locked inside the template.",
    why: "Customer input changes every run — your reference stays exactly the same, so your look is consistent.",
    todo: "Add a reference and upload the image you want locked in.",
    anchor: "palette-reference",
    advanceOn: "reference_added",
    tryIt: "Click REFERENCE in the Add step panel.",
    event: "creator_reference_added",
  },
  {
    id: "prompt",
    step: "Prompt block",
    title: "06 · Prompt block",
    what: "Instructions you write once.",
    why: "Customers never prompt — your prompt is what makes results repeatable.",
    todo: "Add a prompt block, then edit the text. Start from this and make it yours:",
    anchor: "palette-prompt",
    advanceOn: "prompt_added",
    tryIt: "Click PROMPT in the Add step panel.",
    event: "creator_prompt_added",
    extra: [
      "Editable example: \"Editorial streetwear campaign photo of the uploaded garment, hard flash, concrete backdrop, 9:16, true product colors, no text.\"",
    ],
  },
  {
    id: "image-step",
    step: "Image step",
    title: "07 · Image step",
    what: "Creates a campaign image.",
    why: "Its INPUTS are what it looks at; its RESULT is what it produces for the next step.",
    todo: "Add an image step, then connect your inputs, references and prompt to it.",
    anchor: "palette-image",
    advanceOn: "image_added",
    tryIt: "Click IMAGE STEP in the Add step panel.",
    event: "creator_image_step_added",
    extra: ["Model stays on Recommended unless you open the advanced model picker."],
  },
  {
    id: "connecting",
    step: "Connecting blocks",
    title: "08 · Connecting blocks",
    what: "Drag from an output dot ●───→● to a matching input dot.",
    why: "A connection tells FUSE which result feeds into the next step.",
    todo: "Make one connection now — from your customer input to the image step.",
    anchor: "canvas",
    advanceOn: "connection_made",
    tryIt: "Drag from the right-side dot of one block onto the left-side dot of another.",
    event: "creator_first_connection",
    milestone: true,
    extra: [
      "If a connection won't stick, the input expects a different type — e.g. an IMAGE input needs an image output.",
      "Order matters: the first connection is usually the main subject.",
    ],
  },
  {
    id: "video-step",
    step: "Video step",
    title: "09 · Video step + model",
    what: "Turns an image into a video clip.",
    why: "FIRST FRAME is the image it animates, PROMPT describes the motion, DURATION sets the length, AUDIO adds sound where the model supports it.",
    todo: "Add a video step, then pick a model — Recommended is a safe default.",
    anchor: "palette-video",
    advanceOn: "video_added",
    tryIt: "Click VIDEO STEP in the Add step panel.",
    event: "creator_video_step_added",
    extra: [
      "The model list shows only models FUSE actually supports, with their real options.",
      "Longer clips, higher resolution and audio use more credits.",
    ],
  },
  {
    id: "workflow-tools",
    step: "Save & organize",
    title: "10 · Save, auto-layout, recenter",
    what: "SAVE stores your draft. AUTO-LAYOUT re-organizes a messy workflow. RECENTER brings everything back into view.",
    why: "You can leave and come back — drafts are private until you submit.",
    todo: "Click SAVE now.",
    anchor: "save",
    advanceOn: "saved",
    tryIt: "Click SAVE in the header.",
  },
  {
    id: "test",
    step: "Test run",
    title: "11 · Test it like a customer",
    what: "Before customers can use it, run it yourself with sample inputs.",
    why: "You see the exact grouped inputs a customer sees, and the same results they'd get.",
    todo: "Click TEST, add sample uploads, then confirm the credit estimate and RUN TEST.",
    anchor: "test",
    advanceOn: "test_completed",
    tryIt: "Click TEST in the header.",
    event: "creator_test_started",
    milestone: true,
    extra: [
      "Tests always show the credit estimate and your balance first — nothing is ever spent without your click.",
      "Status in plain language: Waiting → Running → Complete, or Failed.",
      "If a step fails, FUSE names the step and what to try. The raw provider message stays behind “details”.",
    ],
  },
  {
    id: "submit",
    step: "Review & submit",
    title: "12 · Review, preview, submit",
    what: "Review each image and clip in order, then preview the template as a customer.",
    why: "The customer preview shows the name, preview, grouped inputs, how many images/clips and the run cost.",
    todo: "When it's consistent, choose SUBMIT FOR REVIEW.",
    anchor: "submit-for-review",
    fallbackAnchors: ["settings", "test"],
    advanceOn: "submitted",
    event: "creator_first_template_submitted",
    milestone: true,
    extra: ["The FUSE team reviews your template, then you're notified when it goes live."],
  },
];

export const CREATOR_TUTORIAL_TOTAL = CREATOR_TUTORIAL_LESSONS.length;

/** Port colour legend shown in the ? HELP panel. */
export const CREATOR_PORT_LEGEND: Array<{ label: string; body: string }> = [
  { label: "Left dot", body: "An input — what this step receives." },
  { label: "Right dot", body: "An output — the result this step produces." },
  { label: "Highlighted dot", body: "A valid target while you're dragging a connection." },
  { label: "No connection made", body: "The types don't match — connect an image output to an image input." },
];
