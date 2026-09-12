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
  outputType: "image" | "video";
  approved: false;
  jobId: string;
};

const BASE = "/cro-preview/pairs";

export const CRO_PROOF_PAIRS: CroProofPair[] = [
  {
    id: "studio-hoodie",
    template: "Studio",
    useCase: "Lookbook",
    inputSrc: `${BASE}/studio-hoodie-input.png`,
    outputSrc: `${BASE}/studio-hoodie-output.png`,
    outputType: "image",
    approved: false,
    jobId: "c7c27eb2-a680-401e-9c4b-d9d8b16c73b4",
  },
  {
    id: "studio-shorts",
    template: "Studio",
    useCase: "Lookbook",
    inputSrc: `${BASE}/studio-shorts-input.png`,
    outputSrc: `${BASE}/studio-shorts-output.png`,
    outputType: "image",
    approved: false,
    jobId: "c7c27eb2-a680-401e-9c4b-d9d8b16c73b4",
  },
  {
    id: "ugc-walkin-top",
    template: "UGC Walk in",
    useCase: "Fit check",
    inputSrc: `${BASE}/ugc-walkin-top-input.webp`,
    outputSrc: `${BASE}/ugc-walkin-top-output.png`,
    outputType: "image",
    approved: false,
    jobId: "89f1a26b-9b9d-4765-a598-bf5dc7e3cf3a",
  },
  {
    id: "changing-room",
    template: "Changing Room",
    useCase: "Changing room",
    inputSrc: `${BASE}/changing-room-input.png`,
    outputSrc: `${BASE}/changing-room-output.png`,
    outputType: "image",
    approved: false,
    jobId: "2aea30cc-a720-42d8-9849-44c2aea43723",
  },
  {
    id: "paparazzi-video",
    template: "Paparazzi",
    useCase: "Product reveal",
    inputSrc: `${BASE}/paparazzi-video-input.png`,
    outputSrc: `${BASE}/paparazzi-video-output.mp4`,
    outputType: "video",
    approved: false,
    jobId: "7e281c50-4b9e-43f0-814d-b1db6b386ee2",
  },
];
