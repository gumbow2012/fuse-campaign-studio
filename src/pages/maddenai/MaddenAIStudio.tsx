import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import PageMeta from "@/components/mvp/PageMeta";
import MaddenAIShell from "@/components/maddenai/MaddenAIShell";
import { OptionCycler, Ps2Glyph, ps2Button, ps2Ghost, ps2Panel, ps2Well } from "@/components/maddenai/ps2";
import SubjectModelSelector from "@/components/outfitswap/SubjectModelSelector";
import { createUserAvatar } from "@/services/avatarProfiles";
import ResultStage from "@/components/maddenai/ResultStage";
import { useAuth } from "@/contexts/AuthContext";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { IMAGE_FLAT_USD, creditsFromUsd, resolutionMultiplier } from "@/lib/costEstimate";
import { compressImageFile } from "@/lib/imageCompress";
import { captureFrameAt, extractFrames, frameTimestamps, loadVideo, readMeta, seekVideoTo, type VideoMeta } from "@/lib/videoFrames";
import { changeScore, grayOf, groupRuns, patchWindow, pickSpread, unswappedTimes, type Gray } from "@/lib/swapCheck";
import { createOutfitSwapFolder, uploadToStorage, uploadWithConcurrency } from "@/services/storageUpload";
import { renderPiecesToBlob } from "@/services/videoExport/renderClip";
import {
  KEEP_ORIGINAL_MODEL,
  analyzeOutfitSwapSource,
  callOutfitSwap,
  isKeepOriginal,
  primarySubjectId,
  suggestCastAssignment,
  type OutfitSwapFrameSubject,
  type OutfitSwapGarment,
  type OutfitSwapSourceAnalysis,
  type OutfitSwapSubjectModel,
  type SwapGeneration,
} from "@/services/outfitSwap";

/**
 * MADDEN AI — the guided, game-styled version of Outfit Swap.
 * Same `outfit-swap` edge function and credits as the Pro editor, with the
 * choices made for you: 4 evenly spread frames, 2K swaps, Seedance 2.0 at 1080p.
 * Flow: title screen -> mode select -> setup (clip, outfit, player) -> loading screen -> result.
 */

const PIECE_TYPES = [
  { label: "Top", type: "Shirt / Top" },
  { label: "Hoodie / Jacket", type: "Hoodie / Jacket" },
  { label: "Pants", type: "Pants" },
  { label: "Shorts", type: "Shorts" },
  { label: "Shoes", type: "Shoes" },
  { label: "Hat", type: "Hat" },
  { label: "Accessory", type: "Accessory" },
];
const FRAME_COUNT = 4;
const VIDEO_MODEL = "seedance-2.0";
const VIDEO_USD_PER_SECOND = 0.3024; // matches the Pro editor's Seedance 2.0 rate
const VIDEO_RESOLUTION = "1080p";
const MAX_PIECES = 4;
const MAX_CLIP_SECONDS = 60;
const PART_MAX_SECONDS = 15; // Seedance's per-render limit
const FRAMES_PER_PART = 2;
const MAX_REFS_PER_PART = 6;
const MAX_ANALYZED_FRAMES = 16; // outfit-swap-analyze takes 16 frames per call
const MAX_UNSWAPPED_SECONDS = 0.5; // 1s+ of a person left untouched = fix it before stitching
const PATCH_FRAMES_MAX = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KLING_CLIP_SECONDS = 3; // outfit-swap animate_frame: Kling 3.0 Pro, fixed 3s
const KLING_USD_PER_SECOND = 0.112;
const BACK_CREDITS = creditsFromUsd(IMAGE_FLAT_USD); // one 1K Nano Banana Pro image
const SHEET_CREDITS = creditsFromUsd(IMAGE_FLAT_USD * resolutionMultiplier("2K")); // one 2K sheet
const DRESS_SHEET_PROMPT =
  "Image 1 is a CHARACTER REFERENCE SHEET. Re-create the exact same sheet — same person (identical face, hair, skin tone, tattoos, body), same layout, same views (front, three-quarter, side, back, face close-ups), same plain light-gray background, no text — but dress the person in the exact garments shown in the other reference images. Copy each garment's color, fabric, fit, and its prints and logos exactly where they appear in the garment photos. A print only appears on the back view if a garment's back photo shows it; otherwise the back of that garment is plain. Keep any garment not provided as plain black basics.";
/** Video renders only: montages cut between shots, and every shot with the person gets the swap. */
const EVERY_SHOT_RULE =
  "This clip may cut between several shots, outfits and angles. The replacement applies to the person in EVERY shot where they appear, including shots with no matching reference frame: never fall back to the original person or the original outfit for any shot or any second. Only shots with no person in them (empty room, title cards, text) stay as in @Video1.";
const NO_BACK_PRINT_RULE =
  "If a garment has no back reference image, its back is plain: never copy or invent the front graphic, logo or text on the back.";
const CHARACTER_SHEET_PROMPT =
  "CHARACTER REFERENCE SHEET of the EXACT same person shown in the reference photos — identical face, facial structure, skin tone, hair (style, length, color, texture), facial hair, tattoos, body type and height proportions. Do not beautify, slim, age, de-age or change ethnicity. Layout on one plain light-gray studio background, evenly spaced, no text or labels: full-body front view, full-body three-quarter view, full-body side profile, full-body back view, plus a large front face close-up and a three-quarter face close-up. Neutral relaxed standing pose, neutral expression, plain fitted black t-shirt and plain black pants, barefoot or plain black sneakers, no jewelry, hats or props (so outfits can be swapped later). Even soft studio lighting, photorealistic, sharp detail.";
/** Appended to the swap + render prompts when Low Poly Mode is on. */
const LOW_POLY_PROMPT = [
  "STYLE OVERRIDE — LOW POLY MODE. PlayStation 2 era low-poly video game screenshot.",
  "Re-create the source frame as a screenshot from a 2001 PS2 game: the person becomes a low-poly player avatar wearing the outfit described in this request (exact garment colors, prints and logos as low-res textures), with the same hairstyle and hair color, same pose, same camera angle and framing.",
  "Keep only the accessories that are actually in the source frame (hoods stay as they are) and never add any, such as sunglasses, that are not there.",
  "The background becomes a matching empty liminal game room.",
  "Rendered entirely as 2001 PlayStation 2 low-poly 3D graphics: chunky visible polygons, blurry low-resolution textures, dithered gradients, hard aliased edges with no anti-aliasing, flat vertex lighting, nostalgic uncanny quiet, faint CRT phosphor tint.",
  "Translate everything into crude low-poly geometry, never photorealism. No text, no UI, no watermark.",
].join(" ");
const TIPS = [
  "Clean product photos on a plain background give the sharpest fit.",
  "One person facing the camera swaps best.",
  "Add the back of a piece so turns and walk-aways stay right.",
  "You can leave this page. Your video lands in Your videos.",
  "Clips over 15 seconds render in parts and get stitched back together.",
];

type Frame = { time: number; url: string; gray?: Gray };
type PartRange = { start: number; end: number };
type PartJob = { range: PartRange; generationId: string; frameUrl?: string };
type Engine = "seedance" | "kling";

/** Equal parts of at most 15s (a 60s clip -> 4 x 15s, 20s -> 2 x 10s). */
function splitParts(duration: number): PartRange[] {
  const n = Math.max(1, Math.ceil(duration / PART_MAX_SECONDS - 1e-6));
  const len = duration / n;
  return Array.from({ length: n }, (_, k) => ({ start: k * len, end: k === n - 1 ? duration : (k + 1) * len }));
}

/**
 * Frames to style: per part, frames spread about every 2s (so every shot / outfit /
 * angle in a montage has a reference nearby), up to the cap.
 */
function pickFrameIndices(frames: Frame[], duration: number): number[] {
  if (!frames.length) return [];
  const parts = splitParts(duration);
  const cap = parts.length === 1 ? FRAME_COUNT : Math.min(MAX_REFS_PER_PART, Math.floor(MAX_ANALYZED_FRAMES / parts.length));
  const grays = frames.map((f) => f.gray);
  return parts
    .flatMap((p, k) => {
      const pool = frames.map((_, i) => i).filter((i) => frames[i].time >= p.start && (frames[i].time < p.end || k === parts.length - 1));
      return pickSpread(pool, grays, cap);
    })
    .sort((a, b) => a - b);
}
type SourceVideo = { path: string; duration: number; width: number; height: number };
type Screen = "title" | "menu" | "setup";
type Piece = OutfitSwapGarment & { backState?: "generating" | "uploading" | null };

const isLive = (g?: SwapGeneration | null) => g?.status === "queued" || g?.status === "running";
const display = { fontFamily: '"Orbitron Variable", Orbitron, system-ui, sans-serif', fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" } as const;

/* ------------------------------ small parts ------------------------------ */

function StepLabel({ glyph, title, hint, done }: { glyph: "□" | "△" | "○" | "✕"; title: string; hint?: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Ps2Glyph glyph={glyph} className={done ? "shadow-[0_0_14px_rgba(124,227,255,0.9)]" : ""} />
      <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-white">{title}</h2>
      {done ? (
        <span className="ml-auto rounded-md border border-sky-200/50 bg-sky-400/15 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-[0.14em] text-sky-200">Ready</span>
      ) : hint ? (
        <span className="ml-auto rounded-md border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 font-display text-xs font-bold uppercase tracking-[0.14em] text-sky-100">{hint}</span>
      ) : null}
    </div>
  );
}

/** Click-or-drop zone. */
function DropZone({ accept, multiple, onFiles, disabled, children, className = "" }: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; disabled?: boolean; children: ReactNode; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFiles(Array.from(e.dataTransfer.files ?? []));
  };
  return (
    <>
      <input ref={input} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition disabled:opacity-50 ${
          over ? "border-sky-200 bg-sky-400/15 shadow-[0_0_24px_rgba(77,168,255,0.5)]" : "border-sky-300/35 bg-[#020a24]/60 hover:border-sky-200/70"
        } ${className}`}
      >
        {children}
      </button>
    </>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function MaddenAIStudio() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const busyUpload = useRef(false);

  const [screen, setScreen] = useState<Screen>(() => (sessionStorageGet("maddenai-started") ? "menu" : "title"));
  const [menuIndex, setMenuIndex] = useState(0);

  const [clipPreview, setClipPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [sourceVideo, setSourceVideo] = useState<SourceVideo | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [clipProgress, setClipProgress] = useState<number | null>(null);
  const [igUrl, setIgUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState<OutfitSwapSourceAnalysis | null>(null);
  const [analysisState, setAnalysisState] = useState<"idle" | "running" | "done" | "error">("idle");

  const [pieces, setPieces] = useState<Piece[]>([]);
  const [uploadingPiece, setUploadingPiece] = useState(false);
  const [model, setModel] = useState<OutfitSwapSubjectModel>(KEEP_ORIGINAL_MODEL);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [lowPoly, setLowPoly] = useState(false);
  const [engine, setEngine] = useState<Engine>("seedance");
  const [likenessConsent, setLikenessConsent] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [dressedUrl, setDressedUrl] = useState<string | null>(null);
  const [dressedFor, setDressedFor] = useState<string>("");
  const [dressing, setDressing] = useState(false);
  const [buildingSheet, setBuildingSheet] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [savingCharacter, setSavingCharacter] = useState(false);

  const [swaps, setSwaps] = useState<Record<number, SwapGeneration>>({});
  const [auto, setAuto] = useState(false);
  const [styling, setStyling] = useState(false);
  const [videos, setVideos] = useState<SwapGeneration[]>([]);
  const [rendering, setRendering] = useState(false);
  const [stageVideoId, setStageVideoId] = useState<string | null>(null);
  const [sessionVideoIds, setSessionVideoIds] = useState<string[]>([]);
  const [runFolder, setRunFolder] = useState<string | null>(null);
  const [partJobs, setPartJobs] = useState<PartJob[]>([]);
  const [stitched, setStitched] = useState<string | null>(null);
  const [stitching, setStitching] = useState(false);
  const [partStage, setPartStage] = useState<string | null>(null);

  /* ----------------------------- title / menu ----------------------------- */
  const MENU = useMemo(
    () => [
      { key: "quick", title: "Quick Swap", body: "Drop a clip and your clothes. One button does the rest.", glyph: "✕" as const },
      { key: "pro", title: "Pro Editor", body: "Pick frames yourself, multiple people, hats and logos, per-frame fixes.", glyph: "○" as const },
      { key: "create", title: "Image & Video", body: "Make images and video from a prompt or your photos.", glyph: "△" as const },
    ],
    [],
  );
  const choose = useCallback(
    (key: string) => {
      if (key === "pro") return navigate("/maddenai/pro");
      if (key === "create") return navigate("/maddenai/create");
      if (!user) return navigate("/auth?returnTo=/maddenai");
      setScreen("setup");
    },
    [navigate, user],
  );
  const start = useCallback(() => {
    sessionStorageSet("maddenai-started", "1");
    setScreen("menu");
  }, []);

  useEffect(() => {
    if (screen === "setup") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (screen === "title" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); start(); }
      if (screen === "menu") {
        if (e.key === "ArrowDown") { e.preventDefault(); setMenuIndex((i) => (i + 1) % MENU.length); }
        if (e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((i) => (i - 1 + MENU.length) % MENU.length); }
        if (e.key === "Enter") { e.preventDefault(); choose(MENU[menuIndex].key); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, menuIndex, MENU, choose, start]);

  /* ----------------------------- cost preview ----------------------------- */
  const clipSeconds = meta?.duration ?? 5;
  const parts = useMemo(() => splitParts(clipSeconds), [clipSeconds]);
  const candidateFrames = useMemo(() => pickFrameIndices(frames, clipSeconds), [frames, clipSeconds]);
  /** Whether the analysis saw a person in frame i (unknown = yes). */
  const hasPerson = useCallback(
    (i: number) => {
      const f = analysis?.frames.find((x) => x.frameId === `frame-${i}`);
      return !f || f.subjects.length > 0;
    },
    [analysis],
  );
  // Skip title cards and empty shots: nothing to restyle there.
  const pickedFrames = useMemo(() => {
    const withPeople = candidateFrames.filter(hasPerson);
    return withPeople.length ? withPeople : candidateFrames;
  }, [candidateFrames, hasPerson]);
  const partSeconds = (range: PartRange) => Math.min(PART_MAX_SECONDS, Math.max(4, Math.round(range.end - range.start)));
  const duration = partSeconds(parts[0]);
  const styleCredits = creditsFromUsd(IMAGE_FLAT_USD * resolutionMultiplier("2K") * (pickedFrames.length || FRAME_COUNT));
  const seedanceCredits = parts.reduce((sum, range) => sum + creditsFromUsd(VIDEO_USD_PER_SECOND * partSeconds(range) * resolutionMultiplier(VIDEO_RESOLUTION)), 0);
  const klingCredits = (pickedFrames.length || FRAME_COUNT) * creditsFromUsd(KLING_USD_PER_SECOND * KLING_CLIP_SECONDS);
  const videoCredits = engine === "kling" ? klingCredits : seedanceCredits;
  const totalCredits = styleCredits + videoCredits;
  const balance = profile?.credits_balance ?? 0;
  const canAfford = (credits: number) => isAdmin || balance >= credits;

  /* ------------------------------- library -------------------------------- */
  useEffect(() => {
    if (!user) return;
    callOutfitSwap<{ generations: SwapGeneration[] }>({ action: "list", limit: 24 })
      .then((data) => setVideos((data.generations ?? []).filter((g) => g.kind === "video")))
      .catch(() => null);
  }, [user]);

  const inFlight = useMemo(() => [...Object.values(swaps), ...videos].filter(isLive).map((g) => g.id), [swaps, videos]);
  useEffect(() => {
    if (!inFlight.length) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await callOutfitSwap<{ generations: SwapGeneration[] }>({ action: "status", generationIds: inFlight });
        if (cancelled) return;
        for (const g of data.generations ?? []) {
          if (g.kind === "video") setVideos((prev) => prev.map((v) => (v.id === g.id ? g : v)));
          else if (g.frameIndex !== null) setSwaps((prev) => ({ ...prev, [g.frameIndex as number]: g }));
        }
      } catch {
        // transient; next tick retries
      }
    };
    const timer = setInterval(poll, 5000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [inFlight.join(",")]);

  /* ------------------------------- the clip ------------------------------- */
  const onClip = useCallback(async (file?: File) => {
    if (!file || busyUpload.current) return;
    if (!/\.(mp4|mov)$/i.test(file.name) || file.size >= 50_000_000) {
      toast.error("Use an MP4 or MOV under 50 MB");
      return;
    }
    busyUpload.current = true;
    const url = URL.createObjectURL(file);
    setClipPreview(url);
    setStageVideoId(null);
    setPartJobs([]);
    setStitched(null);
    setFrames([]);
    setSourceVideo(null);
    setSwaps({});
    setAnalysis(null);
    setAnalysisState("idle");
    setClipProgress(0);
    try {
      const el = await loadVideo(url);
      const m = readMeta(el);
      if (!Number.isFinite(m.duration) || m.duration < 2 || m.duration > MAX_CLIP_SECONDS) throw new Error("Use a clip between 2 and 60 seconds");
      setMeta(m);
      const folder = await createOutfitSwapFolder();
      setRunFolder(folder);
      const stored = await uploadToStorage(folder, file, file.name);
      const captured = await extractFrames(el, frameTimestamps(m.duration), (d, t) => setClipProgress(Math.round((d / t) * 50)));
      const grays = new Map<number, Gray>();
      for (const f of captured) {
        await seekVideoTo(el, f.time);
        grays.set(f.time, grayOf(el));
      }
      const uploaded: Frame[] = await uploadWithConcurrency(
        captured,
        3,
        async (f) => ({ time: f.time, url: (await uploadToStorage(folder, f.file, f.file.name)).url, gray: grays.get(f.time) }),
        (d, t) => setClipProgress(50 + Math.round((d / t) * 50)),
      );
      setFrames(uploaded);
      setSourceVideo({ path: stored.path, duration: m.duration, width: m.width, height: m.height });
      // Same detection pass as the Pro editor: who is in each frame and which way they face.
      setAnalysisState("running");
      analyzeOutfitSwapSource(pickFrameIndices(uploaded, m.duration).map((i) => ({ frameId: `frame-${i}`, timestamp: uploaded[i].time, imageUrl: uploaded[i].url })))
        .then((result) => {
          setAnalysis(result.analysis);
          setAnalysisState("done");
        })
        .catch(() => setAnalysisState("error"));
    } catch (error) {
      setClipPreview(null);
      setMeta(null);
      toast.error(error instanceof Error ? error.message : "Couldn't read that clip");
    } finally {
      busyUpload.current = false;
      setClipProgress(null);
    }
  }, []);

  /** Paste an Instagram link -> the server fetches the reel -> same path as an upload. */
  const importInstagram = useCallback(async () => {
    if (!igUrl.trim() || importing) return;
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-instagram-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: igUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Import failed (${res.status})`);
      }
      const blob = await res.blob();
      setIgUrl("");
      await onClip(new File([blob], "instagram-reel.mp4", { type: "video/mp4" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't import that link");
    } finally {
      setImporting(false);
    }
  }, [igUrl, importing, onClip]);

  /* ------------------------------- the outfit ------------------------------ */
  const onPieces = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      if (files.length) toast.error("Drop photos of your clothes (JPG, PNG or WEBP)");
      return;
    }
    setUploadingPiece(true);
    try {
      const folder = await createOutfitSwapFolder();
      const added: Piece[] = [];
      for (const file of images.slice(0, MAX_PIECES)) {
        const compressed = await compressImageFile(file);
        const { url } = await uploadToStorage(folder, compressed, compressed.name);
        added.push({
          id: crypto.randomUUID(),
          url,
          frontUrl: url,
          hasBackDesign: false,
          backUrl: null,
          detailUrl: null,
          sideUrl: null,
          name: file.name,
          type: PIECE_TYPES[0].type,
          label: "",
          person: "Main Subject",
        });
      }
      setPieces((prev) => [...prev, ...added].slice(0, MAX_PIECES));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload that photo");
    } finally {
      setUploadingPiece(false);
    }
  }, []);

  const patchPiece = (id: string, patch: Partial<Piece>) => setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const uploadBack = useCallback(async (id: string, file?: File) => {
    if (!file?.type.startsWith("image/")) return;
    patchPiece(id, { backState: "uploading" });
    try {
      const folder = await createOutfitSwapFolder();
      const compressed = await compressImageFile(file);
      const { url } = await uploadToStorage(folder, compressed, compressed.name);
      patchPiece(id, { backUrl: url, hasBackDesign: true, backState: null });
    } catch (error) {
      patchPiece(id, { backState: null });
      toast.error(error instanceof Error ? error.message : "Couldn't upload the back");
    }
  }, []);

  /** One Nano Banana Pro image through generate-studio (charges + refunds live there). */
  const studioImage = useCallback(async (args: { prompt: string; imageUrls: string[]; resolution: string; aspectRatio: string }) => {
    const { data, error } = await supabase.functions.invoke("generate-studio", {
      body: { action: "start", kind: "image", model: "nano-banana-pro", ...args },
    });
    if (error) throw new Error(error.message);
    const generationId = String(data?.generation?.id ?? "");
    if (!generationId) throw new Error("Couldn't start that image");
    for (let i = 0; i < 75; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const status = await supabase.functions.invoke("generate-studio", { body: { action: "status", generationId } });
      const g = status.data?.generation;
      if (g?.status === "complete" && g.outputUrl) return String(g.outputUrl);
      if (g?.status === "failed") throw new Error(g.error ?? "That image failed. Credits were refunded.");
    }
    throw new Error("That image is taking too long. Try again.");
  }, []);

  /** △ — make the back view from the front photo. */
  const generateBack = useCallback(async (piece: Piece) => {
    patchPiece(piece.id, { backState: "generating" });
    try {
      const url = await studioImage({
        resolution: "1K",
        aspectRatio: "1:1",
        imageUrls: [piece.frontUrl],
        prompt:
          "Product photo of the BACK of this exact garment, laid flat and centered on a plain light-gray background, same framing and lighting as the reference. Keep the exact fabric, color, fit and construction. Do not copy the front graphics onto the back unless the reference clearly shows they wrap around; if the back design is unknown, keep the back plain. No person, no hanger, no text added.",
      });
      patchPiece(piece.id, { backUrl: url, hasBackDesign: true, backState: null });
    } catch (error) {
      patchPiece(piece.id, { backState: null });
      toast.error(error instanceof Error ? error.message : "Couldn't make the back view");
    }
  }, [studioImage]);

  /* ---------------------------- character sheet ---------------------------- */
  const modelPhotos = (model.uploadedRefUrls ?? []).filter((u) => u !== sheetUrl && u !== dressedUrl);
  // A sheet only belongs to the photos it was built from.
  useEffect(() => {
    if (sheetUrl && !(model.uploadedRefUrls ?? []).includes(sheetUrl)) setSheetUrl(null);
  }, [model.uploadedRefUrls, sheetUrl]);

  /** △ — turn the uploaded model photo(s) into a multi-view sheet so the identity can't drift. */
  const buildSheet = useCallback(async () => {
    if (!modelPhotos.length) return;
    setBuildingSheet(true);
    try {
      const url = await studioImage({ prompt: CHARACTER_SHEET_PROMPT, imageUrls: modelPhotos, resolution: "2K", aspectRatio: "16:9" });
      setSheetUrl(url);
      setModel({ modelSource: "upload", avatarId: null, uploadedRefUrls: [url, ...modelPhotos].slice(0, 5) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't build the character sheet");
    } finally {
      setBuildingSheet(false);
    }
  }, [modelPhotos.join("|"), studioImage]);

  /** △ — the character sheet wearing your actual garments: one consistent person + outfit for every frame. */
  const piecesKey = pieces.map((p) => `${p.frontUrl}|${p.backUrl ?? ""}`).join(",");
  const dressedCurrent = !!dressedUrl && dressedFor === `${sheetUrl}::${piecesKey}`;
  const dressSheet = useCallback(async () => {
    if (!sheetUrl || !pieces.length) return;
    setDressing(true);
    try {
      const garmentImages = pieces.flatMap((p) => [p.frontUrl, p.backUrl].filter((u): u is string => !!u));
      const url = await studioImage({ prompt: DRESS_SHEET_PROMPT, imageUrls: [sheetUrl, ...garmentImages].slice(0, 10), resolution: "2K", aspectRatio: "16:9" });
      setDressedUrl(url);
      setDressedFor(`${sheetUrl}::${piecesKey}`);
      setModel({ modelSource: "upload", avatarId: null, uploadedRefUrls: [url, sheetUrl, ...modelPhotos].slice(0, 5) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't dress the character");
    } finally {
      setDressing(false);
    }
  }, [sheetUrl, pieces, piecesKey, studioImage, modelPhotos.join("|")]);

  /** ○ — keep the character (sheet + photos) in My avatars for next time. */
  const saveCharacter = useCallback(async () => {
    if (!sheetUrl) return;
    setSavingCharacter(true);
    try {
      const created = await createUserAvatar({
        name: characterName.trim() || "My character",
        thumbnail_url: modelPhotos[0] ?? sheetUrl,
        reference_assets: [sheetUrl, ...modelPhotos].slice(0, 5),
        consistency_profile: { character_sheet: sheetUrl, source: "maddenai" },
      });
      toast.success("Character saved to My avatars");
      if (created) setModel({ modelSource: "avatar", avatarId: created.id, uploadedRefUrls: [] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the character");
    } finally {
      setSavingCharacter(false);
    }
  }, [sheetUrl, characterName, modelPhotos.join("|")]);

  /* ------------------------------ generation ------------------------------ */
  const subjectId = primarySubjectId(analysis);
  const replacing = !isKeepOriginal(model);
  const modelAssignment = useMemo(() => (replacing ? { [subjectId]: model } : {}), [replacing, subjectId, model]);
  const subjectsFor = useCallback(
    (index: number): OutfitSwapFrameSubject[] => analysis?.frames.find((f) => f.frameId === `frame-${index}`)?.subjects ?? [],
    [analysis],
  );
  const cleanPieces = useMemo(() => pieces.map(({ backState: _ignored, ...garment }) => garment), [pieces]);
  const missingBack = pieces.some((p) => !p.backUrl);
  const prompt = useMemo(
    () => [note.trim(), missingBack ? NO_BACK_PRINT_RULE : "", lowPoly ? LOW_POLY_PROMPT : ""].filter(Boolean).join("\n\n"),
    [note, lowPoly, missingBack],
  );
  const videoPrompt = `${prompt}\n\n${EVERY_SHOT_RULE}`.trim();
  // Put the garments on the main (replaced) person, even when the frame has several people.
  const castAssignment = useMemo(() => suggestCastAssignment([subjectId], cleanPieces) ?? {}, [subjectId, cleanPieces]);

  const styleFrame = useCallback(
    async (index: number) => {
      const frame = frames[index];
      if (!frame) return;
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "swap_frame",
        sourceFrameUrl: frame.url,
        garments: cleanPieces,
        person: "Main Subject",
        frameIndex: index,
        frameTime: frame.time,
        aspectRatio: meta?.aspectRatio,
        extraPrompt: prompt,
        resolution: "2K",
        frameSubjects: subjectsFor(index),
        castAssignment,
        modelAssignment,
      });
      setSwaps((prev) => ({ ...prev, [index]: data.generation }));
    },
    [frames, cleanPieces, meta, prompt, subjectsFor, castAssignment, modelAssignment],
  );

  const styleAll = useCallback(async () => {
    setStyling(true);
    try {
      for (const index of pickedFrames) await styleFrame(index);
    } catch (error) {
      setAuto(false);
      toast.error(error instanceof Error ? error.message : "Couldn't start styling");
    } finally {
      setStyling(false);
    }
  }, [pickedFrames, styleFrame]);

  const swapList = pickedFrames.map((i) => ({ index: i, swap: swaps[i] })).filter((e) => e.swap);
  const readyUrls = swapList.filter((e) => e.swap?.status === "complete" && e.swap.outputUrl).map((e) => e.swap!.outputUrl as string);
  const stylingLive = swapList.some((e) => isLive(e.swap));

  /** Long clips: cut each ≤15s part in the browser, upload it, render it with that part's styled frames. */
  const renderParts = useCallback(async (only?: number[]) => {
    if (!sourceVideo || !clipPreview || !runFolder) return;
    setRendering(true);
    setStitched(null);
    try {
      const seen = new Map<string, OutfitSwapFrameSubject>();
      for (const f of analysis?.frames ?? []) for (const s of f.subjects ?? []) if (!seen.has(s.subjectId)) seen.set(s.subjectId, s);
      const styledAt = (i: number) => (swaps[i]?.status === "complete" ? swaps[i]?.outputUrl ?? null : null);
      const jobs: PartJob[] = [...partJobs];
      for (let k = 0; k < parts.length; k++) {
        if (only && !only.includes(k)) continue;
        const range = parts[k];
        setPartStage(`Cutting part ${k + 1} of ${parts.length}`);
        const blob = await renderPiecesToBlob([{ url: clipPreview, startMs: range.start * 1000, endMs: range.end * 1000 }], { width: sourceVideo.width, height: sourceVideo.height });
        const stored = await uploadToStorage(runFolder, blob, `part-${k + 1}.mp4`);
        const own = pickedFrames.filter((i) => frames[i] && frames[i].time >= range.start && frames[i].time <= range.end).map(styledAt).filter((u): u is string => !!u);
        setPartStage(`Starting part ${k + 1} of ${parts.length}`);
        const data = await callOutfitSwap<{ generation: SwapGeneration }>({
          action: "reconstruct",
          sourceVideo: { path: stored.path, duration: range.end - range.start, width: sourceVideo.width, height: sourceVideo.height },
          frameUrls: own.length ? own : readyUrls.slice(0, FRAMES_PER_PART),
          garments: cleanPieces,
          model: VIDEO_MODEL,
          duration: partSeconds(range),
          resolution: VIDEO_RESOLUTION,
          aspectRatio: meta?.aspectRatio,
          generateAudio: false,
          extraPrompt: videoPrompt,
          frameSubjects: Array.from(seen.values()),
          castAssignment,
          modelAssignment,
        });
        jobs[k] = { range, generationId: data.generation.id };
        setVideos((prev) => [data.generation, ...prev]);
        setSessionVideoIds((prev) => [...prev, data.generation.id]);
        setPartJobs([...jobs]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the video");
    } finally {
      setPartStage(null);
      setRendering(false);
    }
  }, [sourceVideo, clipPreview, runFolder, analysis, swaps, partJobs, parts, pickedFrames, frames, readyUrls, cleanPieces, meta, videoPrompt, castAssignment, modelAssignment]);

  /** Kling: animate each styled frame into a 3s clip; the clips get stitched in order. */
  const renderKling = useCallback(async (only?: number[]) => {
    setRendering(true);
    setStitched(null);
    try {
      const styled = pickedFrames
        .map((i) => ({ i, url: swaps[i]?.status === "complete" ? swaps[i]?.outputUrl ?? null : null }))
        .filter((f): f is { i: number; url: string } => !!f.url);
      const jobs: PartJob[] = only ? [...partJobs] : [];
      for (let k = 0; k < styled.length; k++) {
        if (only && !only.includes(k)) continue;
        setPartStage(`Animating clip ${k + 1} of ${styled.length}`);
        const data = await callOutfitSwap<{ generation: SwapGeneration }>({
          action: "animate_frame",
          imageUrl: styled[k].url,
          frameIndex: styled[k].i,
          frameTime: frames[styled[k].i]?.time ?? 0,
        });
        jobs[k] = { range: { start: 0, end: KLING_CLIP_SECONDS }, generationId: data.generation.id, frameUrl: styled[k].url };
        setVideos((prev) => [data.generation, ...prev]);
        setSessionVideoIds((prev) => [...prev, data.generation.id]);
        setPartJobs([...jobs]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the clips");
    } finally {
      setPartStage(null);
      setRendering(false);
    }
  }, [pickedFrames, swaps, partJobs, frames]);

  const makeVideo = useCallback(async () => {
    if (!sourceVideo || !readyUrls.length) return;
    if (engine === "kling") {
      setStageVideoId(null);
      setPartJobs([]);
      return renderKling();
    }
    if (parts.length > 1) {
      setStageVideoId(null);
      setPartJobs([]);
      return renderParts();
    }
    setRendering(true);
    try {
      const seen = new Map<string, OutfitSwapFrameSubject>();
      for (const f of analysis?.frames ?? []) for (const s of f.subjects ?? []) if (!seen.has(s.subjectId)) seen.set(s.subjectId, s);
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "reconstruct",
        sourceVideo,
        frameUrls: readyUrls,
        garments: cleanPieces,
        model: VIDEO_MODEL,
        duration,
        resolution: VIDEO_RESOLUTION,
        aspectRatio: meta?.aspectRatio,
        generateAudio: false,
        extraPrompt: videoPrompt,
        frameSubjects: Array.from(seen.values()),
        castAssignment,
        modelAssignment,
      });
      setVideos((prev) => [data.generation, ...prev]);
      setSessionVideoIds((prev) => [...prev, data.generation.id]);
      setStageVideoId(data.generation.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the video");
    } finally {
      setRendering(false);
    }
  }, [sourceVideo, readyUrls, engine, renderKling, parts.length, renderParts, cleanPieces, duration, meta, videoPrompt, analysis, castAssignment, modelAssignment]);

  // One click: style the frames, then render as soon as they're all back.
  useEffect(() => {
    if (!auto || styling || stylingLive || swapList.length < pickedFrames.length) return;
    setAuto(false);
    if (readyUrls.length) void makeVideo();
    else toast.error("Styling didn't work on this clip. Try another clip or photo. Failed steps are refunded.");
  }, [auto, styling, stylingLive, swapList.length, pickedFrames.length, readyUrls.length, makeVideo]);

  const partGens = partJobs.map((job) => videos.find((v) => v.id === job?.generationId) ?? null);
  const stageVideo = videos.find((v) => v.id === stageVideoId) ?? null;
  const stageFromSession = !!stageVideoId && sessionVideoIds.includes(stageVideoId);

  /* Copy check: Seedance sometimes hands back the source untouched for a shot or a whole part.
     Every finished render is compared to the source, second by second, before it's stitched. */
  const [unswapped, setUnswapped] = useState<Record<string, number[]>>({});
  /** Re-rendered windows spliced over a render: genId -> seconds [start, end) and the patch video. */
  const [patches, setPatches] = useState<Record<string, { start: number; end: number; url: string }>>({});
  const [repairing, setRepairing] = useState(false);
  const checkingIds = useRef(new Set<string>());
  const personAt = useCallback(
    (src: Gray) => {
      // The analysed frame that looks most like this moment says whether someone is on screen.
      let best = -1;
      let bestScore = Infinity;
      for (const i of candidateFrames) {
        const gray = frames[i]?.gray;
        if (!gray) continue;
        const score = changeScore(src, gray);
        if (score < bestScore) [best, bestScore] = [i, score];
      }
      return best < 0 || hasPerson(best);
    },
    [candidateFrames, frames, hasPerson],
  );
  useEffect(() => {
    if (engine === "kling" || !clipPreview) return;
    const renders = partJobs.map((job, k) => ({ start: job?.range.start ?? 0, gen: partGens[k] }));
    if (stageVideo && stageFromSession) renders.push({ start: 0, gen: stageVideo });
    for (const { start, gen } of renders) {
      if (gen?.status !== "complete" || !gen.outputUrl || checkingIds.current.has(gen.id)) continue;
      checkingIds.current.add(gen.id);
      void unswappedTimes(clipPreview, start, gen.outputUrl, personAt)
        .catch(() => [] as number[]) // can't read it: don't block the result
        .then((times) => setUnswapped((prev) => ({ ...prev, [gen.id]: times })));
    }
  }, [engine, clipPreview, partJobs, partGens, stageVideo, stageFromSession, personAt]);
  const unswappedSecs = (g?: SwapGeneration | null) => (g ? (unswapped[g.id]?.length ?? 0) * 0.5 : 0);
  const isUnswapped = (g?: SwapGeneration | null) => unswappedSecs(g) > MAX_UNSWAPPED_SECONDS;
  const isChecked = (g?: SwapGeneration | null) => engine === "kling" || (!!g && unswapped[g.id] !== undefined);

  /** Poll one generation until it finishes. */
  const waitFor = useCallback(async (id: string) => {
    for (;;) {
      await sleep(5000);
      const data = await callOutfitSwap<{ generations: SwapGeneration[] }>({ action: "status", generationIds: [id] }).catch(() => null);
      const g = data?.generations?.find((x) => x.id === id);
      if (g && !isLive(g)) return g;
    }
  }, []);

  /**
   * Fix only the seconds that came back unswapped: style a fresh frame from each missed
   * shot, re-render a short window around them, check it, and splice it over the render.
   */
  const repair = useCallback(
    async (gen: SwapGeneration, sourceStart: number) => {
      const times = unswapped[gen.id] ?? [];
      if (!gen.outputUrl || !times.length || !clipPreview || !runFolder || !sourceVideo) return;
      setRepairing(true);
      setStitched(null);
      try {
        const runs = groupRuns(times).slice(0, PATCH_FRAMES_MAX);
        const length = readMeta(await loadVideo(gen.outputUrl)).duration;
        const nearestCandidate = (t: number) =>
          candidateFrames.reduce((best, i) => (Math.abs(frames[i].time - t) < Math.abs(frames[best].time - t) ? i : best), candidateFrames[0]);

        setPartStage("Restyling the shots that didn't swap");
        const src = await loadVideo(clipPreview);
        const refs: string[] = [];
        for (const [n, run] of runs.entries()) {
          const t = sourceStart + (run.from + run.to) / 2;
          const file = await captureFrameAt(src, t);
          const stored = await uploadToStorage(runFolder, file, file.name);
          const data = await callOutfitSwap<{ generation: SwapGeneration }>({
            action: "swap_frame",
            sourceFrameUrl: stored.url,
            garments: cleanPieces,
            person: "Main Subject",
            frameIndex: 900 + n, // outside the clip's own frames
            frameTime: t,
            aspectRatio: meta?.aspectRatio,
            extraPrompt: prompt,
            resolution: "2K",
            frameSubjects: candidateFrames.length ? subjectsFor(nearestCandidate(t)) : [],
            castAssignment,
            modelAssignment,
          });
          const done = await waitFor(data.generation.id);
          if (done.status === "complete" && done.outputUrl) refs.push(done.outputUrl);
        }
        if (!refs.length) throw new Error("Couldn't restyle those shots. Try redoing the whole part.");

        const win = patchWindow(runs, length);
        // Keep the original references that fall inside the window too.
        const nearby = pickedFrames
          .filter((i) => frames[i] && frames[i].time >= sourceStart + win.start && frames[i].time <= sourceStart + win.end)
          .map((i) => (swaps[i]?.status === "complete" ? swaps[i]?.outputUrl ?? null : null))
          .filter((u): u is string => !!u);
        setPartStage("Re-rendering those seconds");
        const blob = await renderPiecesToBlob(
          [{ url: clipPreview, startMs: (sourceStart + win.start) * 1000, endMs: (sourceStart + win.end) * 1000 }],
          { width: sourceVideo.width, height: sourceVideo.height },
        );
        const piece = await uploadToStorage(runFolder, blob, `patch-${gen.id.slice(0, 8)}-${Math.round(win.start * 10)}.mp4`);
        const seen = new Map<string, OutfitSwapFrameSubject>();
        for (const f of analysis?.frames ?? []) for (const subj of f.subjects ?? []) if (!seen.has(subj.subjectId)) seen.set(subj.subjectId, subj);
        const started = await callOutfitSwap<{ generation: SwapGeneration }>({
          action: "reconstruct",
          sourceVideo: { path: piece.path, duration: win.end - win.start, width: sourceVideo.width, height: sourceVideo.height },
          frameUrls: [...refs, ...nearby],
          garments: cleanPieces,
          model: VIDEO_MODEL,
          duration: partSeconds(win),
          resolution: VIDEO_RESOLUTION,
          aspectRatio: meta?.aspectRatio,
          generateAudio: false,
          extraPrompt: videoPrompt,
          frameSubjects: Array.from(seen.values()),
          castAssignment,
          modelAssignment,
        });
        const patch = await waitFor(started.generation.id);
        if (patch.status !== "complete" || !patch.outputUrl) throw new Error(patch.error ?? "That fix didn't render. Credits for failed renders go back to your account.");

        setPartStage("Checking the fix");
        const left = await unswappedTimes(clipPreview, sourceStart + win.start, patch.outputUrl, personAt).catch(() => [] as number[]);
        const missedInside = times.filter((t) => t >= win.start && t < win.end);
        if (left.length >= missedInside.length) throw new Error("The fix came back unswapped too. Try redoing the whole part.");
        setPatches((prev) => ({ ...prev, [gen.id]: { start: win.start, end: win.end, url: patch.outputUrl as string } }));
        setUnswapped((prev) => ({
          ...prev,
          [gen.id]: [...times.filter((t) => t < win.start || t >= win.end), ...left.map((t) => t + win.start)],
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't fix those seconds");
      } finally {
        setPartStage(null);
        setRepairing(false);
      }
    },
    [unswapped, clipPreview, runFolder, sourceVideo, candidateFrames, frames, cleanPieces, meta, prompt, subjectsFor, castAssignment, modelAssignment, waitFor, pickedFrames, swaps, analysis, videoPrompt, personAt],
  );
  const repairCredits = (g?: SwapGeneration | null) => {
    const runs = groupRuns(g ? unswapped[g.id] ?? [] : []).slice(0, PATCH_FRAMES_MAX);
    if (!runs.length) return 0;
    const win = patchWindow(runs, 15);
    return runs.length * creditsFromUsd(IMAGE_FLAT_USD * resolutionMultiplier("2K")) + creditsFromUsd(VIDEO_USD_PER_SECOND * partSeconds(win) * resolutionMultiplier(VIDEO_RESOLUTION));
  };
  /** A render as stitchable pieces, with its patch (if any) spliced in. */
  const piecesOf = useCallback(
    async (url: string, id: string) => {
      const len = Math.round(readMeta(await loadVideo(url)).duration * 1000);
      const patch = patches[id];
      if (!patch) return [{ url, startMs: 0, endMs: len }];
      return [
        { url, startMs: 0, endMs: Math.round(patch.start * 1000) },
        { url: patch.url, startMs: 0, endMs: Math.round((patch.end - patch.start) * 1000) },
        { url, startMs: Math.round(patch.end * 1000), endMs: len },
      ].filter((p) => p.endMs - p.startMs > 40);
    },
    [patches],
  );

  const partsLive = partGens.some((g) => isLive(g));
  const failedParts = partJobs.map((job, k) => (partGens[k]?.status === "failed" || partGens[k]?.status === "canceled" || isUnswapped(partGens[k]) ? k : -1)).filter((k) => k >= 0);
  const unswappedParts = failedParts.filter((k) => isUnswapped(partGens[k]));
  const expectedParts = engine === "kling" ? readyUrls.length : parts.length;
  const partsRendered = partJobs.length > 0 && partJobs.length === expectedParts && (engine === "kling" || parts.length > 1) && partGens.every((g) => g?.status === "complete" && g.outputUrl);
  const checkingParts = partsRendered && !partGens.every(isChecked);
  const partsDone = partsRendered && !checkingParts && !failedParts.length;
  const checkingStage = !!stageVideo && stageFromSession && stageVideo.status === "complete" && !isChecked(stageVideo);

  useEffect(() => {
    if (!partsDone || stitched || stitching || !runFolder || !sourceVideo) return;
    setStitching(true);
    (async () => {
      try {
        const pieces = (await Promise.all(partGens.map((g) => piecesOf(g!.outputUrl as string, g!.id)))).flat();
        const blob = await renderPiecesToBlob(pieces, { width: sourceVideo.width, height: sourceVideo.height });
        const { url } = await uploadToStorage(runFolder, blob, "madden-ai-full.mp4");
        setStitched(url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't join the parts");
      } finally {
        setStitching(false);
      }
    })();
  }, [partsDone, stitched, stitching, runFolder, sourceVideo, partGens, piecesOf]);

  // A single render that got a fix spliced in becomes one file again.
  const stagePatched = !!stageVideo?.outputUrl && !!patches[stageVideo.id] && !isUnswapped(stageVideo);
  useEffect(() => {
    if (!stagePatched || stitched || stitching || !runFolder || !sourceVideo || !stageVideo?.outputUrl) return;
    setStitching(true);
    (async () => {
      try {
        const blob = await renderPiecesToBlob(await piecesOf(stageVideo.outputUrl as string, stageVideo.id), { width: sourceVideo.width, height: sourceVideo.height });
        const { url } = await uploadToStorage(runFolder, blob, "madden-ai-fixed.mp4");
        setStitched(url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't join the fix in");
      } finally {
        setStitching(false);
      }
    })();
  }, [stagePatched, stitched, stitching, runFolder, sourceVideo, stageVideo, piecesOf]);

  const clipReady = !!sourceVideo;
  const modelPicked = !!(model.uploadedRefUrls?.length || model.avatarId);
  const outfitReady = pieces.length > 0 || (replacing && modelPicked);
  const needsSheet = model.modelSource === "upload" && !sheetUrl;
  const modelReady = !replacing || (modelPicked && !needsSheet && analysisState !== "running" && analysisState !== "idle");
  const backsBusy = pieces.some((p) => p.backState);
  const loading = auto || styling || rendering || repairing || stitching || checkingParts || checkingStage || (partsLive && !failedParts.length) || (!!stageVideo && isLive(stageVideo));
  const needsConsent = engine === "kling" && replacing;
  const canStart = clipReady && outfitReady && modelReady && analysisState !== "running" && !backsBusy && !loading && !stylingLive && (!needsConsent || likenessConsent);

  const begin = useCallback(() => {
    setStageVideoId(null);
    setPartJobs([]);
    setStitched(null);
    setSwaps({});
    setAuto(true);
    void styleAll();
  }, [styleAll]);

  /* --------------------------------- view --------------------------------- */
  return (
    <MaddenAIShell>
      <PageMeta
        title="MADDEN AI — Put your clothes on anyone, in any video"
        description="Drop a clip and a photo of your piece. MADDEN AI restyles the video. No set, no model, no prompts."
        path="/maddenai"
      />

      {screen === "title" ? (
        <TitleScreen onStart={start} />
      ) : screen === "menu" ? (
        <section className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-[720px] flex-col justify-center px-4 py-12">
          <img src="/maddenai/wordmark.png" alt="MADDEN AI" className="maddenai-glow mx-auto h-10 w-auto sm:h-14" />
          <p className="mt-5 text-center font-display text-[11px] font-bold uppercase tracking-[0.4em] text-sky-300">Select mode</p>
          <ul className="mt-8 flex flex-col gap-3" role="listbox" aria-label="Mode">
            {MENU.map((item, i) => {
              const active = i === menuIndex;
              return (
                <li key={item.key} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onMouseEnter={() => setMenuIndex(i)}
                    onFocus={() => setMenuIndex(i)}
                    onClick={() => choose(item.key)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition ${
                      active
                        ? "border-sky-200/70 bg-[linear-gradient(90deg,rgba(77,168,255,0.35),rgba(20,60,180,0.25))] shadow-[inset_0_1px_0_rgba(200,235,255,0.5),0_0_34px_-6px_rgba(77,168,255,0.8)]"
                        : "border-sky-300/15 bg-[#030c2c]/70 hover:border-sky-300/40"
                    }`}
                  >
                    <span className={`font-display text-lg text-sky-200 transition ${active ? "ps2-blink opacity-100" : "opacity-0"}`}>▶</span>
                    <Ps2Glyph glyph={item.glyph} />
                    <span className="min-w-0 flex-1">
                      <span className={`block font-display text-lg font-black uppercase tracking-[0.08em] ${active ? "crt-text text-white" : "text-sky-100/75"}`}>{item.title}</span>
                      <span className="mt-0.5 block text-sm text-sky-100/60">{item.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-center font-display text-[10px] font-bold uppercase tracking-[0.25em] text-sky-100/40">↑ ↓ choose · Enter select</p>
        </section>
      ) : (
        <div className="mx-auto grid max-w-[1400px] gap-5 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:pt-8">
          {/* STAGE */}
          <section className={`${ps2Panel} z-[2] order-2 overflow-hidden lg:order-1 lg:min-h-[680px]`}>
            {loading ? (
              <LoadingScreen
                tiles={pickedFrames.map((i) => ({ source: frames[i]?.url ?? null, done: swaps[i]?.status === "complete" ? swaps[i]?.outputUrl ?? null : null }))}
                stylingDone={swapList.filter((e) => e.swap?.status === "complete").length}
                total={pickedFrames.length || FRAME_COUNT}
                renderingVideo={rendering || repairing || stitching || partsLive || (!!stageVideo && isLive(stageVideo))}
                lowPoly={lowPoly}
                status={
                  partStage ??
                  (checkingParts || checkingStage
                    ? "Checking every second for the swap"
                    : stitching
                    ? `Stitching ${partJobs.length} ${engine === "kling" ? "clips" : "parts"}`
                    : partsLive
                      ? `Rendering ${engine === "kling" ? "clips" : "parts"} · ${partGens.filter((g) => g?.status === "complete").length}/${partJobs.length} done`
                      : null)
                }
              />
            ) : stitched || failedParts.length ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center">
                {failedParts.length ? (
                  <div className="flex flex-col items-center gap-4 p-6 text-center">
                    {unswappedParts.length ? (
                      <p className="max-w-sm text-sky-100/75">
                        Part {unswappedParts.map((k) => k + 1).join(", ")} of {parts.length} came back with the original person still in it ({unswappedParts.map((k) => `${unswappedSecs(partGens[k])}s`).join(", ")} unchanged). Fix just those seconds, or redo the whole part.
                      </p>
                    ) : null}
                    {failedParts.length > unswappedParts.length ? (
                      <p className="max-w-sm text-sky-100/75">
                        Part {failedParts.filter((k) => !unswappedParts.includes(k)).map((k) => k + 1).join(", ")} of {parts.length} didn't render. Credits for failed parts go back to your account.
                      </p>
                    ) : null}
                    {partsLive ? (
                      <p className="flex items-center gap-2 text-xs text-sky-100/55">
                        <Loader2 size={13} className="animate-spin" />
                        {partGens.filter((g) => isLive(g)).length} other part(s) still rendering. Retry now and everything gets stitched together when it's all done.
                      </p>
                    ) : null}
                    {unswappedParts.length ? (
                      <button
                        type="button"
                        className={ps2Button}
                        disabled={!canAfford(unswappedParts.reduce((sum, k) => sum + repairCredits(partGens[k]), 0))}
                        onClick={() => void (async () => { for (const k of unswappedParts) await repair(partGens[k]!, partJobs[k].range.start); })()}
                      >
                        <Ps2Glyph /> Fix just those seconds · ≈{unswappedParts.reduce((sum, k) => sum + repairCredits(partGens[k]), 0)} cr
                      </button>
                    ) : null}
                    <button type="button" className={unswappedParts.length ? ps2Ghost : ps2Button} onClick={() => void (engine === "kling" ? renderKling(failedParts) : renderParts(failedParts))}>
                      <Ps2Glyph /> Redo {failedParts.length > 1 ? "those parts" : "that part"}
                    </button>
                  </div>
                ) : (
                  <ResultStage
                    videoUrl={stitched as string}
                    breakdown={pickedFrames.map((i) => ({
                      index: i,
                      time: frames[i]?.time ?? 0,
                      source: frames[i]?.url ?? null,
                      styled: swaps[i]?.outputUrl ?? null,
                      live: isLive(swaps[i]),
                      failed: swaps[i]?.status === "failed",
                    }))}
                    onRedoFrame={(i) => void styleFrame(i).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't redo that frame"))}
                    onRerender={() => void makeVideo()}
                    rerenderCredits={videoCredits}
                    frameCredits={creditsFromUsd(IMAGE_FLAT_USD * resolutionMultiplier("2K"))}
                    rerenderDisabled={stylingLive || rendering || !readyUrls.length || !canAfford(videoCredits)}
                  />
                )}
              </div>
            ) : stageVideo ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center">
                {stageVideo.status === "complete" && stageVideo.outputUrl && isUnswapped(stageVideo) ? (
                  <div className="flex flex-col items-center gap-4 p-6 text-center">
                    <p className="max-w-sm text-sky-100/75">
                      {unswappedSecs(stageVideo)}s of this render came back with the original person still in it. Fix just those seconds, or render it all again.
                    </p>
                    <button type="button" className={ps2Button} disabled={!canAfford(repairCredits(stageVideo))} onClick={() => void repair(stageVideo, 0)}>
                      <Ps2Glyph /> Fix just those seconds · ≈{repairCredits(stageVideo)} cr
                    </button>
                    <button type="button" className={ps2Ghost} disabled={rendering || !readyUrls.length || !canAfford(videoCredits)} onClick={() => void makeVideo()}>
                      <Ps2Glyph /> Render it all again
                    </button>
                  </div>
                ) : stageVideo.status === "complete" && stageVideo.outputUrl ? (
                  <ResultStage
                    videoUrl={stageVideo.outputUrl}
                    breakdown={stageFromSession ? pickedFrames.map((i) => ({
                      index: i,
                      time: frames[i]?.time ?? 0,
                      source: frames[i]?.url ?? null,
                      styled: swaps[i]?.outputUrl ?? null,
                      live: isLive(swaps[i]),
                      failed: swaps[i]?.status === "failed",
                    })) : []}
                    onRedoFrame={(i) => void styleFrame(i).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't redo that frame"))}
                    onRerender={() => void makeVideo()}
                    rerenderCredits={videoCredits}
                    frameCredits={creditsFromUsd(IMAGE_FLAT_USD * resolutionMultiplier("2K"))}
                    rerenderDisabled={stylingLive || rendering || !readyUrls.length || !canAfford(videoCredits)}
                  />
                ) : (
                  <p className="max-w-sm text-center text-sky-100/75">{stageVideo.error ?? "That render didn't finish."} Credits for failed renders go back to your account.</p>
                )}
              </div>
            ) : clipPreview ? (
              <div className="flex h-full min-h-[420px] items-center justify-center p-6">
                <video src={clipPreview} className="max-h-[600px] rounded-2xl border border-sky-200/30" autoPlay loop muted playsInline />
              </div>
            ) : (
              <div className="grid h-full min-h-[420px] place-items-center p-8 text-center">
                <div>
                  <img src="/maddenai/wordmark.png" alt="MADDEN AI" className="maddenai-glow mx-auto h-9 w-auto sm:h-11" />
                  <p className="crt-text mt-6 text-balance text-3xl leading-[1.02] text-white sm:text-5xl" style={display}>Put your clothes on anyone.</p>
                  <p className="mx-auto mt-4 max-w-md text-sky-100/65">Drop your clip to begin.</p>
                </div>
              </div>
            )}
          </section>

          {/* CONTROLS */}
          <aside className="order-1 flex flex-col gap-3 lg:order-2">
            <button type="button" onClick={() => setScreen("menu")} className="self-start font-display text-[10px] font-bold uppercase tracking-[0.25em] text-sky-200/70 hover:text-white">
              ◀ Mode select
            </button>

            {/* □ CLIP */}
            <div className={`${ps2Panel} p-4`}>
              <StepLabel glyph="□" title="Your clip" done={clipReady} hint={meta && parts.length > 1 ? `${Math.round(meta.duration)}s · ${parts.length} parts` : "2–60 sec"} />
              {clipProgress !== null ? (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full border border-sky-300/30 bg-[#020a24]">
                    <div className="h-full bg-[linear-gradient(90deg,#3C8CFF,#7CE3FF)] transition-all" style={{ width: `${clipProgress}%` }} />
                  </div>
                  <p className="mt-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/55">Loading clip… {clipProgress}%</p>
                </div>
              ) : clipReady ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-sky-100/75">{Math.round(meta?.duration ?? 0)}s clip loaded</p>
                  <DropZone accept="video/mp4,video/quicktime,.mp4,.mov" onFiles={(f) => void onClip(f[0])} className="w-auto px-3 py-1.5">
                    <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">Change</span>
                  </DropZone>
                </div>
              ) : (
                <>
                  <div className="mt-3">
                    <DropZone accept="video/mp4,video/quicktime,.mp4,.mov" onFiles={(f) => void onClip(f[0])}>
                      <Upload size={20} className="text-sky-200" />
                      <span className="text-sm font-semibold text-white">Drop a video or click to upload</span>
                      <span className="text-xs text-sky-100/50">MP4 or MOV · one person facing camera works best</span>
                    </DropZone>
                  </div>
                  <div className="my-3 flex items-center gap-3 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-sky-100/40">
                    <span className="h-px flex-1 bg-sky-300/20" /> or <span className="h-px flex-1 bg-sky-300/20" />
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); void importInstagram(); }} className="flex gap-2">
                    <label className={`${ps2Well} flex min-w-0 flex-1 items-center gap-2 px-3`}>
                      <Link2 size={15} className="shrink-0 text-sky-200/70" />
                      <input value={igUrl} onChange={(e) => setIgUrl(e.target.value)} inputMode="url" placeholder="Paste an Instagram reel link" aria-label="Instagram reel link" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-sky-100/35" />
                    </label>
                    <button type="submit" disabled={!igUrl.trim() || importing} className={`${ps2Ghost} px-4`}>
                      {importing ? <Loader2 size={15} className="animate-spin" /> : "Import"}
                    </button>
                  </form>
                  {importing ? <p className="mt-2 text-xs text-sky-100/55">Grabbing the reel from Instagram… about 20 seconds.</p> : null}
                </>
              )}
            </div>

            {/* △ OUTFIT */}
            <div className={`${ps2Panel} p-4`}>
              <StepLabel glyph="△" title="Your outfit" done={pieces.length > 0} hint={`${pieces.length}/${MAX_PIECES}`} />
              <div className="mt-3 flex flex-col gap-2">
                {pieces.map((piece) => (
                  <div key={piece.id} className={`${ps2Well} p-2`}>
                    <div className="flex items-center gap-2">
                      <img src={piece.frontUrl} alt="Front" className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain" />
                      <div className="min-w-0 flex-1">
                        <OptionCycler label="What is this piece?" options={PIECE_TYPES.map((t) => ({ label: t.label, value: t.type }))} value={piece.type} onChange={(type) => patchPiece(piece.id, { type })} />
                      </div>
                      <button type="button" aria-label="Remove piece" onClick={() => setPieces((prev) => prev.filter((p) => p.id !== piece.id))} className="p-1.5 text-sky-100/45 hover:text-white">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {piece.backUrl ? (
                        <>
                          <img src={piece.backUrl} alt="Back" className="h-10 w-10 rounded-md bg-white object-contain" />
                          <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">Back ready</span>
                          <button type="button" onClick={() => patchPiece(piece.id, { backUrl: null, hasBackDesign: false })} className="ml-auto text-xs text-sky-100/50 hover:text-white">Remove</button>
                        </>
                      ) : piece.backState ? (
                        <span className="flex items-center gap-2 text-xs text-sky-100/65">
                          <Loader2 size={13} className="animate-spin" /> {piece.backState === "generating" ? "Generating the back…" : "Uploading the back…"}
                        </span>
                      ) : (
                        <>
                          <label className={`${ps2Ghost} flex-1 cursor-pointer px-2 py-2 text-[10px]`}>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadBack(piece.id, e.target.files?.[0]); e.target.value = ""; }} />
                            <Ps2Glyph glyph="□" className="h-5 w-5 text-[10px]" /> Upload back
                          </label>
                          <button type="button" disabled={!canAfford(BACK_CREDITS)} onClick={() => void generateBack(piece)} className={`${ps2Ghost} flex-1 px-2 py-2 text-[10px]`} title={`About ${BACK_CREDITS} credits`}>
                            <Ps2Glyph glyph="△" className="h-5 w-5 text-[10px]" /> Generate back
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {pieces.length < MAX_PIECES ? (
                  <DropZone accept="image/*" multiple disabled={uploadingPiece} onFiles={(f) => void onPieces(f)}>
                    {uploadingPiece ? <Loader2 size={18} className="animate-spin text-sky-200" /> : <Plus size={18} className="text-sky-200" />}
                    <span className="text-sm font-semibold text-white">{pieces.length ? "Drop another piece" : "Drop your clothes here"}</span>
                    <span className="text-xs text-sky-100/50">Front photo first. Add the back, or press △ to generate it (≈{BACK_CREDITS} cr).</span>
                  </DropZone>
                ) : null}
              </div>
              {noteOpen ? (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to keep in mind? e.g. tuck the shirt in" className="mt-3 w-full rounded-lg border border-sky-300/25 bg-[#020a24]/70 px-3 py-2 text-sm text-white placeholder:text-white/30" />
              ) : (
                <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 text-xs text-sky-100/55 hover:text-white">+ Add a note</button>
              )}
            </div>

            {/* ○ PLAYER (model replace) */}
            <div className={`${ps2Panel} p-4`}>
              <StepLabel glyph="○" title="Player" hint={replacing ? "Replacing" : "Keep original"} />
              <div className="mt-3">
                <OptionCycler
                  label="Who wears it?"
                  options={[
                    { label: "Keep the person", value: "keep_original" },
                    { label: "Upload a model", value: "upload" },
                    { label: "My avatars", value: "avatar" },
                    { label: "FUSE Cast", value: "cast" },
                  ]}
                  value={model.modelSource}
                  onChange={(v) =>
                    setModel(v === "keep_original" ? KEEP_ORIGINAL_MODEL : { modelSource: v as OutfitSwapSubjectModel["modelSource"], avatarId: null, uploadedRefUrls: [] })
                  }
                />
              </div>
              {replacing ? (
                <div className="ps2-scope mt-3">
                  <SubjectModelSelector userId={user?.id ?? null} model={model} onChange={setModel} compact hideSourcePicker hideSave={model.modelSource === "upload"} />
                  {model.modelSource === "upload" && modelPhotos.length ? (
                    <div className={`${ps2Well} mt-3 p-3`}>
                      <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-white">Character sheet</p>
                      {sheetUrl ? (
                        <>
                          <img src={sheetUrl} alt="Character sheet" className="mt-2 w-full rounded-lg border border-sky-200/40 bg-white" />
                          <p className="mt-2 text-xs text-sky-100/60">Locked in. Every frame uses this sheet so the face and body stay the same.</p>
                          {pieces.length ? (
                            dressedCurrent ? (
                              <>
                                <img src={dressedUrl as string} alt="Character sheet wearing your outfit" className="mt-3 w-full rounded-lg border border-sky-200/40 bg-white" />
                                <p className="mt-2 text-xs text-sky-100/60">Dressed in your outfit, front and back. Every frame copies this.</p>
                              </>
                            ) : (
                              <button type="button" disabled={dressing || !canAfford(SHEET_CREDITS)} onClick={() => void dressSheet()} className={`${ps2Ghost} mt-3 w-full`}>
                                {dressing ? <Loader2 size={15} className="animate-spin" /> : <Ps2Glyph glyph="△" className="h-5 w-5 text-[10px]" />}
                                {dressing ? "Dressing the character…" : `Dress character in your outfit · ≈ ${SHEET_CREDITS} cr`}
                              </button>
                            )
                          ) : null}
                          <div className="mt-3 flex gap-2">
                            <input
                              value={characterName}
                              onChange={(e) => setCharacterName(e.target.value)}
                              placeholder="Name this character"
                              aria-label="Character name"
                              className="min-w-0 flex-1 rounded-lg border border-sky-300/25 bg-[#020a24]/70 px-3 py-2 text-sm text-white placeholder:text-sky-100/35"
                            />
                            <button type="button" disabled={savingCharacter} onClick={() => void saveCharacter()} className={`${ps2Ghost} px-3 py-2 text-[10px]`}>
                              {savingCharacter ? <Loader2 size={13} className="animate-spin" /> : <Ps2Glyph glyph="○" className="h-5 w-5 text-[10px]" />} Save character
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-xs text-sky-100/60">
                            Builds a front / side / back / face sheet from your photo so the AI keeps the same person instead of guessing. Required before you start.
                          </p>
                          <button type="button" disabled={buildingSheet || !canAfford(SHEET_CREDITS)} onClick={() => void buildSheet()} className={`${ps2Button} mt-3 w-full`}>
                            {buildingSheet ? <Loader2 size={16} className="animate-spin" /> : <Ps2Glyph glyph="△" />}
                            {buildingSheet ? "Building character sheet…" : `Build character sheet · ≈ ${SHEET_CREDITS} cr`}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                  {analysisState === "running" ? <p className="mt-2 text-xs text-sky-100/55">Finding the person in your clip…</p> : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-sky-100/50">Same person, new outfit. Switch to replace them with a model or one of your avatars.</p>
              )}
            </div>

            {/* ✕ START */}
            <div className={`${ps2Panel} p-4`}>
              <p className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/70">Video engine</p>
              <OptionCycler
                label="Video engine"
                options={[
                  { label: "Seedance · copies your clip's motion", value: "seedance" },
                  { label: "Kling · animates your styled frames", value: "kling" },
                ]}
                value={engine}
                onChange={(v) => setEngine(v as Engine)}
              />
              <p className="mb-3 mt-1.5 text-[11px] text-sky-100/50">
                {engine === "kling"
                  ? `Each styled frame becomes a ${KLING_CLIP_SECONDS}s clip, stitched in order (${(pickedFrames.length || FRAME_COUNT) * KLING_CLIP_SECONDS}s total). Best when Seedance won't accept a face.`
                  : "Rebuilds your exact clip with the new outfit. Some faces get rejected by this engine."}
              </p>
              {needsConsent ? (
                <label className={`${ps2Well} mb-3 flex cursor-pointer items-start gap-2.5 p-3 text-xs text-sky-100/80`}>
                  <input type="checkbox" checked={likenessConsent} onChange={(e) => setLikenessConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sky-400" />
                  <span>I have permission from the person in my model photos to use their likeness in this video.</span>
                </label>
              ) : null}
              <button
                type="button"
                role="switch"
                aria-checked={lowPoly}
                onClick={() => setLowPoly((v) => !v)}
                className={`mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  lowPoly
                    ? "border-sky-200/70 bg-[linear-gradient(90deg,rgba(77,168,255,0.35),rgba(20,60,180,0.25))] shadow-[0_0_24px_-4px_rgba(77,168,255,0.8)]"
                    : "border-sky-300/25 bg-[#020a24]/60 hover:border-sky-200/50"
                }`}
              >
                <span aria-hidden className="grid h-8 w-8 place-items-center">
                  <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke={lowPoly ? "#7CE3FF" : "#6f8fbf"} strokeWidth="1.5" strokeLinejoin="round">
                    <path d="M16 3 28 10v12L16 29 4 22V10z" />
                    <path d="M16 3v26M4 10l24 12M28 10 4 22" opacity=".6" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-white">
                    Low Poly Mode
                    <span className="rounded border border-[#FF8C9A]/60 bg-[#FF8C9A]/15 px-1.5 py-px text-[9px] tracking-[0.2em] text-[#FFB3BE]">New</span>
                  </span>
                  <span className="block text-[11px] text-sky-100/55">Swaps the outfit and remakes the whole video in PS2 low-poly style.</span>
                </span>
                <span className={`h-5 w-9 shrink-0 rounded-full border p-0.5 transition ${lowPoly ? "border-sky-200 bg-sky-400/60" : "border-sky-300/30 bg-[#020a24]"}`}>
                  <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${lowPoly ? "translate-x-4" : ""}`} />
                </span>
              </button>
              {canAfford(totalCredits) ? (
                <button type="button" className={`${ps2Button} w-full py-4 text-[14px]`} disabled={!canStart} onClick={begin}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Ps2Glyph />}
                  Start · ≈ {totalCredits} credits
                </button>
              ) : (
                <Link to="/pricing" className={`${ps2Button} w-full py-4`}>Get credits ({totalCredits} needed)</Link>
              )}
              <p className="mt-2 text-center text-xs text-sky-100/45">
                {isAdmin ? "Admin · free" : `${balance.toLocaleString()} credits`} · failed steps are refunded
              </p>
            </div>
          </aside>
        </div>
      )}

      {screen === "setup" && user && videos.length ? (
        <section className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6">
          <h2 className="text-xl text-white" style={display}>Your videos</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {videos.map((v) => (
              <button key={v.id} type="button" onClick={() => { setStageVideoId(v.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-sky-300/25 bg-[#020a24]/70 text-left shadow-[0_18px_40px_-24px_rgba(60,150,255,0.7)] transition hover:border-sky-200/60">
                {v.status === "complete" && v.outputUrl ? (
                  <video src={v.outputUrl} className="h-full w-full object-cover" muted playsInline loop onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                ) : (
                  <span className="grid h-full place-items-center text-xs text-sky-100/55">{isLive(v) ? <Loader2 size={18} className="animate-spin" /> : "Didn't finish"}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </MaddenAIShell>
  );
}

/* ------------------------------ title screen ------------------------------ */

function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <button type="button" onClick={onStart} className="relative grid min-h-[calc(100vh-7rem)] w-full place-items-center px-4 text-center" aria-label="Press start">
      <div>
        <img src="/maddenai/wordmark.png" alt="MADDEN AI" className="maddenai-glow mx-auto h-14 w-auto sm:h-24" />
        <p className="crt-text mx-auto mt-8 max-w-2xl text-balance text-2xl leading-tight text-white sm:text-4xl" style={display}>
          Put your clothes on anyone. In any video.
        </p>
        <p className="ps2-blink mt-14 font-display text-sm font-bold uppercase tracking-[0.5em] text-sky-200">Press start</p>
        <p className="mt-3 inline-flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-[0.3em] text-sky-100/40">
          <Ps2Glyph className="h-5 w-5 text-[10px]" /> or Enter
        </p>
      </div>
      <p className="absolute bottom-6 left-0 right-0 font-display text-[9px] font-bold uppercase tracking-[0.3em] text-sky-100/30">© Madden Media · Powered by FUSE</p>
    </button>
  );
}

/* ----------------------------- loading screen ----------------------------- */

function LoadingScreen({ tiles, stylingDone, total, renderingVideo, lowPoly, status }: { tiles: { source: string | null; done: string | null }[]; stylingDone: number; total: number; renderingVideo: boolean; lowPoly?: boolean; status?: string | null }) {
  const [tick, setTick] = useState(0);
  const renderStart = useRef<number | null>(null);
  if (renderingVideo && renderStart.current === null) renderStart.current = Date.now();
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1800);
    return () => clearInterval(t);
  }, []);
  // Styling fills 0-55%; the video render eases toward 97% over ~4 minutes.
  const renderPct = renderStart.current ? Math.min(42, ((Date.now() - renderStart.current) / 240_000) * 42) : 0;
  const pct = Math.round((stylingDone / Math.max(1, total)) * 55 + renderPct);
  const featuredIndex = tiles.length ? tick % tiles.length : -1;
  const featured = featuredIndex >= 0 ? tiles[featuredIndex] : null;

  return (
    <div className="relative flex h-full min-h-[520px] flex-col items-center justify-center gap-6 p-6">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.45em] text-sky-300">{status ?? (renderingVideo ? "Rendering stage" : "Styling outfit")}{lowPoly ? " · Low poly" : ""}</p>

      {/* featured "character select" card: locked silhouette until its frame is styled */}
      <div className="relative aspect-[9/16] w-[min(260px,60vw)] overflow-hidden rounded-2xl border border-sky-200/40 bg-[#020a24] shadow-[0_0_60px_-12px_rgba(77,168,255,0.85)]">
        {tiles.map((tile, i) => {
          const src = tile.done ?? tile.source;
          return src ? (
            <img
              key={i}
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-all duration-1000"
              style={{
                opacity: i === featuredIndex ? 1 : 0,
                filter: tile.done ? "none" : "brightness(0.18) saturate(0) sepia(1) hue-rotate(180deg) saturate(4) blur(1px)",
              }}
            />
          ) : null;
        })}
        {featured && !featured.done ? (
          <span className="absolute inset-0 grid place-items-center">
            <span className="rounded-md border border-sky-200/40 bg-[#020820]/70 px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.3em] text-sky-100">Locked</span>
          </span>
        ) : null}
      </div>

      {/* roster strip */}
      <div className="flex gap-2">
        {tiles.map((tile, i) => (
          <div key={i} className={`relative h-16 w-10 overflow-hidden rounded-md border ${tile.done ? "border-sky-200/70 shadow-[0_0_14px_rgba(124,227,255,0.7)]" : "border-sky-300/20"}`}>
            {tile.done ? (
              <img src={tile.done} alt="" className="h-full w-full object-cover" />
            ) : tile.source ? (
              <img src={tile.source} alt="" className="h-full w-full object-cover" style={{ filter: "brightness(0.15) saturate(0)" }} />
            ) : null}
          </div>
        ))}
      </div>

      {/* segmented progress */}
      <div className="w-[min(420px,85%)]">
        <div className="flex gap-1">
          {Array.from({ length: 20 }, (_, i) => (
            <span key={i} className={`h-3 flex-1 rounded-sm ${i < Math.round(pct / 5) ? "bg-[linear-gradient(180deg,#9FE0FF,#3C8CFF)] shadow-[0_0_8px_rgba(124,227,255,0.8)]" : "bg-sky-300/10"}`} />
          ))}
        </div>
        <p className="mt-2 flex justify-between font-display text-[10px] font-bold uppercase tracking-[0.25em] text-sky-100/60">
          <span className="ps2-blink">Now loading</span>
          <span>{pct}%</span>
        </p>
      </div>

      <p className="max-w-sm text-center text-sm text-sky-100/60">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.25em] text-sky-300">Tip · </span>
        {TIPS[tick % TIPS.length]}
      </p>
    </div>
  );
}

function sessionStorageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function sessionStorageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // remembered start screen is a convenience only
  }
}
