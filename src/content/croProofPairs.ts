/**
 * REAL before/after pairs only.
 *
 * Each entry points at a static file under `public/cro-preview/pairs/`, copied
 * from the private `fuse-assets` bucket (never hotlinked). If a file is absent,
 * the component renders an internal "MISSING REAL PAIR" card — never a
 * placeholder image and never a fabricated pair.
 */

export type CroProofPair = {
  id: string;
  template: string;
  useCase: string;
  inputSrc: string;
  outputSrc: string;
  /** Optional poster frame for video outputs. Absence never breaks the pair. */
  posterSrc?: string;
  outputType: "image" | "video";
  approved: false;
  jobId: string;
  /** Internal-only note; never rendered on customer-facing surfaces. */
  rightsNote?: string;
};

const BASE = "/cro-preview/pairs";

export const CRO_PROOF_PAIRS: CroProofPair[] = [
  {
    id: "studio-hoodie",
    template: "Studio",
    useCase: "Lookbook",
    inputSrc: `${BASE}/studio-hoodie-input.jpg`,
    outputSrc: `${BASE}/studio-hoodie-output.jpg`,
    outputType: "image",
    approved: false,
    jobId: "c7c27eb2-a680-401e-9c4b-d9d8b16c73b4",
  },
  {
    id: "studio-shorts",
    template: "Studio",
    useCase: "Lookbook",
    inputSrc: `${BASE}/studio-shorts-input.jpg`,
    outputSrc: `${BASE}/studio-shorts-output.jpg`,
    outputType: "image",
    approved: false,
    jobId: "c7c27eb2-a680-401e-9c4b-d9d8b16c73b4",
  },
  {
    id: "ugc-walkin-top",
    template: "UGC Walk in",
    useCase: "Fit check",
    inputSrc: `${BASE}/ugc-walkin-top-input.jpg`,
    outputSrc: `${BASE}/ugc-walkin-top-output.jpg`,
    outputType: "image",
    approved: false,
    jobId: "89f1a26b-9b9d-4765-a598-bf5dc7e3cf3a",
    rightsNote: "Input carries a third-party brand graphic — rights check before public use",
  },
  {
    id: "changing-room",
    template: "Changing Room",
    useCase: "Changing room",
    inputSrc: `${BASE}/changing-room-input.jpg`,
    outputSrc: `${BASE}/changing-room-output.jpg`,
    outputType: "image",
    approved: false,
    jobId: "2aea30cc-a720-42d8-9849-44c2aea43723",
  },
  {
    id: "paparazzi-video",
    template: "Paparazzi",
    useCase: "Product reveal",
    inputSrc: `${BASE}/paparazzi-input.jpg`,
    outputSrc: `${BASE}/paparazzi-output.mp4`,
    posterSrc: `${BASE}/paparazzi-output-poster.jpg`,
    outputType: "video",
    approved: false,
    jobId: "7e281c50-4b9e-43f0-814d-b1db6b386ee2",
    rightsNote: "Input carries a licensed third-party graphic — rights check before public use",
  },
];
