/**
 * Campaign Director — shared types.
 *
 * A "world" is a recurring character + look (e.g. Spray Mafia). A project is one
 * campaign inside a world: the uploaded product designs, a theme, a script of
 * shots, and each shot's generated still + animated clip.
 *
 * Everything here is plain data so it can live in one jsonb document per
 * project (same pattern as Madden Media Studio's project_state).
 */

export type DirectorAspect = "9:16" | "16:9" | "1:1";
export type DirectorImageResolution = "1K" | "2K" | "4K";
export type DirectorVideoModel = "kling-3.0-pro" | "kling-3.0-standard";

export type DirectorRefKind = "character" | "style" | "reflective";

export interface DirectorRef {
  id: string;
  url: string;
  kind: DirectorRefKind;
  /** Short human label, e.g. "full body, Squash bag". */
  label: string;
}

export interface DirectorWorld {
  name: string;
  /** What the recurring character is called in prompts. */
  characterName: string;
  /** Text lock repeated in every prompt, on top of the master reference images. */
  characterLock: string;
  /** Height / proportion rule. Repeated in every prompt. */
  scaleRule: string;
  /** Rendering-style lock. */
  styleLock: string;
  /** One universal physical package construction. Only the front artwork changes. */
  productSpec: string;
  /** Extra lighting block used when a shot is flagged reflective. */
  reflectiveLook: string;
  /** Things the script and every prompt must avoid. */
  avoid: string;
  /** Master references of the recurring character. The first two are sent with every shot. */
  characters: DirectorRef[];
  /** Approved frames from earlier campaigns that define the look. */
  styleRefs: DirectorRef[];
  /** Frames that show the reflective-background treatment. */
  reflectiveRefs: DirectorRef[];
  aspectRatio: DirectorAspect;
  imageResolution: DirectorImageResolution;
  videoModel: DirectorVideoModel;
  /** Seconds per clip. Kling 3.0 snaps to 3 / 5 / 10 / 15. */
  clipSeconds: number;
}

export interface DirectorProduct {
  id: string;
  /** Short label used in the script, e.g. "Squash". */
  name: string;
  /** Artist or collaborator shown on the design. Empty if none. */
  artist: string;
  /** Collaboration world / franchise, as printed on the design. */
  collab: string;
  /** Flavor / product name, as printed on the design. */
  flavor: string;
  /** The uploaded flat design (front of the pouch). */
  imageUrl: string;
  /** Small preview of the design, sent to the script writer so many designs fit in one request. */
  thumbUrl?: string;
}

export type CameraKind =
  | "wide establishing"
  | "low angle"
  | "close facial reaction"
  | "over-the-shoulder"
  | "product POV"
  | "macro product"
  | "symmetrical hero"
  | "rear tracking"
  | "dashboard angle"
  | "hand interaction"
  | "dramatic profile"
  | "top-down"
  | "floor-level"
  | "long-lens compression"
  | "drone wide";

export const CAMERA_KINDS: CameraKind[] = [
  "wide establishing",
  "low angle",
  "close facial reaction",
  "over-the-shoulder",
  "product POV",
  "macro product",
  "symmetrical hero",
  "rear tracking",
  "dashboard angle",
  "hand interaction",
  "dramatic profile",
  "top-down",
  "floor-level",
  "long-lens compression",
  "drone wide",
];

export type ProductRole = "none" | "hero" | "secondary";

export type ShotStatus =
  | "draft"
  | "image_queued"
  | "image_ready"
  | "approved"
  | "rejected"
  | "video_queued"
  | "video_ready"
  | "failed";

export interface DirectorJob {
  requestId: string;
  /** Durable URL once the output has been archived to storage. */
  url: string;
  error: string;
  /** How many times this job has been submitted (for spend tracking). */
  attempts: number;
}

export interface DirectorQa {
  /** "" = not checked. */
  verdict: "" | "pass" | "fail" | "error";
  issues: string[];
  /** The still that was judged, so a regenerated image never keeps an old verdict. */
  checkedUrl: string;
}

export interface DirectorShot {
  id: string;
  index: number;
  /** Story act / section, e.g. "Act 3: Jada Kingdom". */
  act: string;
  title: string;
  camera: CameraKind;
  /** Where we are: specific, physical, never generic. */
  setting: string;
  /** One frozen moment. */
  action: string;
  lighting: string;
  productRole: ProductRole;
  /** Exactly the products visible in this shot. */
  productIds: string[];
  /** Products whose ARTIST must physically appear as a separate character. */
  artistProductIds: string[];
  /** Other cast in frame, plain text. */
  supporting: string;
  /** Use the reflective-environment treatment. */
  reflective: boolean;
  /** The ONE primary movement for the 3 second clip. */
  motion: string;
  status: ShotStatus;
  image: DirectorJob;
  video: DirectorJob;
  /** Optional manual override of the compiled image prompt. */
  promptOverride: string;
  note: string;
  qa: DirectorQa;
}

export interface DirectorBrief {
  theme: string;
  /** Free-text direction for the script writer (story shape, must-haves). */
  notes: string;
  shotCount: number;
}

export interface DirectorProject {
  version: 1;
  world: DirectorWorld;
  products: DirectorProduct[];
  brief: DirectorBrief;
  shots: DirectorShot[];
  /** First approved 3D render of an artist, keyed by product id. Reused for later appearances. */
  artistMasters: Record<string, string>;
}

export interface DirectorProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}
