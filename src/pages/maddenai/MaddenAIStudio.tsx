import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Download, Link2, Loader2, Plus, Shirt, Upload, X } from "lucide-react";
import { toast } from "sonner";

import PageMeta from "@/components/mvp/PageMeta";
import MaddenAIShell, { MADDENAI } from "@/components/maddenai/MaddenAIShell";
import { Ps2Glyph, ps2Button, ps2Ghost, ps2Panel, ps2Well } from "@/components/maddenai/ps2";
import { useAuth } from "@/contexts/AuthContext";
import { IMAGE_FLAT_USD, creditsFromUsd, resolutionMultiplier } from "@/lib/costEstimate";
import { compressImageFile } from "@/lib/imageCompress";
import { extractFrames, frameTimestamps, loadVideo, readMeta, type VideoMeta } from "@/lib/videoFrames";
import { createOutfitSwapFolder, uploadToStorage, uploadWithConcurrency } from "@/services/storageUpload";
import { callOutfitSwap, type OutfitSwapGarment, type SwapGeneration } from "@/services/outfitSwap";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

/**
 * MADDEN AI — the guided, one-screen version of Outfit Swap.
 * Same `outfit-swap` edge function and credits as the Pro editor, with the
 * choices made for you: 4 evenly spread frames, 2K swaps, Seedance 2.0 at 1080p.
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

type Frame = { time: number; url: string };
type SourceVideo = { path: string; duration: number; width: number; height: number };

const isLive = (g?: SwapGeneration | null) => g?.status === "queued" || g?.status === "running";
const display = { fontFamily: '"Orbitron Variable", Orbitron, system-ui, sans-serif', fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" } as const;

const STEP_GLYPHS = ["□", "△", "✕"] as const;

function StepLabel({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <span className="grid h-6 w-6 place-items-center rounded-full border border-sky-100/70 bg-[linear-gradient(180deg,#8FD0FF,#2F6FF0)] text-white shadow-[0_0_14px_rgba(77,168,255,0.8)]">
          <Check size={13} />
        </span>
      ) : (
        <Ps2Glyph glyph={STEP_GLYPHS[n - 1]} />
      )}
      <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.14em] text-white">{title}</h2>
    </div>
  );
}

export default function MaddenAIStudio() {
  const { user, profile, isAdmin } = useAuth();
  const videoInput = useRef<HTMLInputElement>(null);
  const pieceInput = useRef<HTMLInputElement>(null);
  const busyUpload = useRef(false);

  const [clipPreview, setClipPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [sourceVideo, setSourceVideo] = useState<SourceVideo | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [clipProgress, setClipProgress] = useState<number | null>(null);

  const [pieces, setPieces] = useState<OutfitSwapGarment[]>([]);
  const [uploadingPiece, setUploadingPiece] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const [swaps, setSwaps] = useState<Record<number, SwapGeneration>>({});
  const [auto, setAuto] = useState(false);
  const [igUrl, setIgUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [styling, setStyling] = useState(false);
  const [videos, setVideos] = useState<SwapGeneration[]>([]);
  const [rendering, setRendering] = useState(false);
  const [stageVideoId, setStageVideoId] = useState<string | null>(null);

  /* ----------------------------- cost preview ----------------------------- */
  const pickedFrames = useMemo(() => {
    if (!frames.length) return [];
    const step = Math.max(1, Math.ceil(frames.length / FRAME_COUNT));
    return frames.map((_, i) => i).filter((i) => i % step === 0).slice(0, FRAME_COUNT);
  }, [frames]);
  const duration = Math.min(15, Math.max(4, Math.round(meta?.duration ?? 5)));
  const styleCredits = creditsFromUsd(IMAGE_FLAT_USD * resolutionMultiplier("2K") * (pickedFrames.length || FRAME_COUNT));
  const videoCredits = creditsFromUsd(VIDEO_USD_PER_SECOND * duration * resolutionMultiplier(VIDEO_RESOLUTION));
  const balance = profile?.credits_balance ?? 0;
  const canAfford = (credits: number) => isAdmin || balance >= credits;

  /* ------------------------------- library -------------------------------- */
  useEffect(() => {
    if (!user) return;
    callOutfitSwap<{ generations: SwapGeneration[] }>({ action: "list", limit: 24 })
      .then((data) => setVideos((data.generations ?? []).filter((g) => g.kind === "video")))
      .catch(() => null);
  }, [user]);

  const inFlight = useMemo(
    () => [...Object.values(swaps), ...videos].filter(isLive).map((g) => g.id),
    [swaps, videos],
  );
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

  /* -------------------------------- step 1 -------------------------------- */
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
    setFrames([]);
    setSourceVideo(null);
    setSwaps({});
    setClipProgress(0);
    try {
      const el = await loadVideo(url);
      const m = readMeta(el);
      if (!Number.isFinite(m.duration) || m.duration < 2 || m.duration > 15) throw new Error("Use a clip between 2 and 15 seconds");
      setMeta(m);
      const folder = await createOutfitSwapFolder();
      const stored = await uploadToStorage(folder, file, file.name);
      const captured = await extractFrames(el, frameTimestamps(m.duration), (d, t) => setClipProgress(Math.round((d / t) * 50)));
      const uploaded = await uploadWithConcurrency(
        captured,
        3,
        async (f) => ({ time: f.time, url: (await uploadToStorage(folder, f.file, f.file.name)).url }),
        (d, t) => setClipProgress(50 + Math.round((d / t) * 50)),
      );
      setFrames(uploaded);
      setSourceVideo({ path: stored.path, duration: m.duration, width: m.width, height: m.height });
    } catch (error) {
      setClipPreview(null);
      setMeta(null);
      toast.error(error instanceof Error ? error.message : "Couldn't read that clip");
    } finally {
      busyUpload.current = false;
      setClipProgress(null);
    }
  }, []);

  /* -------------------------------- step 2 -------------------------------- */
  const onPieces = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploadingPiece(true);
    try {
      const folder = await createOutfitSwapFolder();
      const added: OutfitSwapGarment[] = [];
      for (const file of files.slice(0, MAX_PIECES)) {
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

  /* -------------------------------- step 3 -------------------------------- */
  const styleFrame = useCallback(
    async (index: number) => {
      const frame = frames[index];
      if (!frame) return;
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "swap_frame",
        sourceFrameUrl: frame.url,
        garments: pieces,
        person: "Main Subject",
        frameIndex: index,
        frameTime: frame.time,
        aspectRatio: meta?.aspectRatio,
        extraPrompt: note,
        resolution: "2K",
        frameSubjects: [],
        castAssignment: {},
        modelAssignment: {},
      });
      setSwaps((prev) => ({ ...prev, [index]: data.generation }));
    },
    [frames, pieces, meta, note],
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
  const readyUrls = swapList
    .filter((e) => e.swap?.status === "complete" && e.swap.outputUrl)
    .map((e) => e.swap!.outputUrl as string);
  const stylingLive = swapList.some((e) => isLive(e.swap));

  /* -------------------------------- step 4 -------------------------------- */
  const makeVideo = useCallback(async () => {
    if (!sourceVideo || !readyUrls.length) return;
    setRendering(true);
    try {
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "reconstruct",
        sourceVideo,
        frameUrls: readyUrls,
        garments: pieces,
        model: VIDEO_MODEL,
        duration,
        resolution: VIDEO_RESOLUTION,
        aspectRatio: meta?.aspectRatio,
        generateAudio: false,
        extraPrompt: note,
        frameSubjects: [],
        castAssignment: {},
        modelAssignment: {},
      });
      setVideos((prev) => [data.generation, ...prev]);
      setStageVideoId(data.generation.id);
      toast.success("Your video is rendering. It usually takes a few minutes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the video");
    } finally {
      setRendering(false);
    }
  }, [sourceVideo, readyUrls, pieces, duration, meta, note]);

  // One click: style the frames, then render as soon as they're all back.
  useEffect(() => {
    if (!auto || styling || stylingLive || swapList.length < pickedFrames.length) return;
    setAuto(false);
    if (readyUrls.length) void makeVideo();
    else toast.error("Styling didn't work on this clip. Try another clip or photo. Failed steps are refunded.");
  }, [auto, styling, stylingLive, swapList.length, pickedFrames.length, readyUrls.length, makeVideo]);

  const makeIt = useCallback(() => {
    setAuto(true);
    void styleAll();
  }, [styleAll]);

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

  const stageVideo = videos.find((v) => v.id === stageVideoId) ?? null;
  const clipReady = !!sourceVideo;
  const step2Done = pieces.length > 0;
  const totalCredits = styleCredits + videoCredits;
  const working = auto || styling || stylingLive || rendering;

  /* --------------------------------- view --------------------------------- */

  return (
    <MaddenAIShell>
      <PageMeta
        title="MADDEN AI — Put your clothes on anyone, in any video"
        description="Drop a clip and a photo of your piece. MADDEN AI restyles the video. No set, no model, no prompts."
        path="/maddenai"
      />

      <div className="mx-auto grid max-w-[1400px] gap-5 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:pt-8">
        {/* STAGE */}
        <section className={`${ps2Panel} order-2 overflow-hidden lg:order-1 lg:min-h-[640px]`}>
          {stageVideo ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 p-6">
              {stageVideo.status === "complete" && stageVideo.outputUrl ? (
                <video src={stageVideo.outputUrl} className="max-h-[560px] rounded-2xl" controls autoPlay loop muted playsInline />
              ) : stageVideo.status === "failed" || stageVideo.status === "canceled" ? (
                <p className="max-w-sm text-center text-white/70">{stageVideo.error ?? "That render didn't finish."} Credits for failed renders go back to your account.</p>
              ) : (
                <div className="flex flex-col items-center gap-3 text-white/70">
                  <Loader2 className="animate-spin" style={{ color: MADDENAI.accent }} size={32} />
                  <p>Rendering your video…</p>
                  <p className="text-xs text-sky-100/45">You can leave this page. It'll be under "Your videos".</p>
                </div>
              )}
              {stageVideo.outputUrl ? (
                <a href={stageVideo.outputUrl} target="_blank" rel="noreferrer" className={ps2Ghost}>
                  <Download size={15} /> Download
                </a>
              ) : null}
            </div>
          ) : clipPreview ? (
            <div className="flex h-full min-h-[420px] items-center justify-center p-6">
              <video src={clipPreview} className="max-h-[560px] rounded-2xl" autoPlay loop muted playsInline />
            </div>
          ) : (
            <div className="grid h-full min-h-[420px] place-items-center p-8">
              <div className="max-w-xl text-center">
                <img src="/maddenai/wordmark.png" alt="MADDEN AI" className="maddenai-glow mx-auto h-9 w-auto sm:h-11" />
                <p className="mt-4 font-display text-[11px] font-bold uppercase tracking-[0.35em]" style={{ color: MADDENAI.glow }}>Press ✕ to start</p>
                <h1 className="crt-text mt-4 text-balance text-3xl leading-[1.02] text-white sm:text-5xl" style={display}>
                  Put your clothes on anyone. In any video.
                </h1>
                <p className="mx-auto mt-4 max-w-md text-sky-100/65">
                  Drop a clip, add a photo of your piece, and MADDEN AI restyles the video. No set, no model, no prompts.
                </p>
                <div className="mx-auto mt-8 flex max-w-sm items-center justify-center gap-3">
                  <img src="/cro-preview/pairs/changing-room-input.jpg" alt="Product photo of pink shorts" className="w-28 rounded-xl border border-sky-200/30 bg-white" />
                  <ArrowRight className="shrink-0 text-sky-100/45" />
                  <img src="/cro-preview/pairs/changing-room-output.jpg" alt="The same shorts worn in a generated scene" className="w-44 rounded-xl border border-sky-200/40 shadow-[0_20px_50px_-20px_rgba(60,150,255,0.8)]" />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* CONTROLS */}
        <aside className="order-1 flex flex-col gap-3 lg:order-2">
          {!user ? (
            <div className={`${ps2Panel} p-6`}>
              <h2 className="text-2xl text-white" style={display}>Make your first swap</h2>
              <p className="mt-2 text-sm text-sky-100/65">Sign in to upload your clip and your clothes. You'll see the credit cost before anything runs.</p>
              <Link to="/auth?returnTo=/maddenai" className={`${ps2Button} mt-5 w-full`}>
                <Ps2Glyph /> Sign in to start
              </Link>
            </div>
          ) : (
            <>
              {/* 1 · clip */}
              <div className={`${ps2Panel} p-4`}>
                <StepLabel n={1} title="Your clip" done={clipReady} />
                <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(e) => { void onClip(e.target.files?.[0]); e.target.value = ""; }} />
                {clipProgress !== null ? (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full transition-all" style={{ width: `${clipProgress}%`, background: MADDENAI.accent }} /></div>
                    <p className="mt-2 text-xs text-sky-100/55">Reading your clip… {clipProgress}%</p>
                  </div>
                ) : clipReady ? (
                  <button type="button" onClick={() => videoInput.current?.click()} className="mt-3 text-sm text-sky-100/65 underline-offset-4 hover:text-white hover:underline">
                    {Math.round(meta?.duration ?? 0)}s clip ready · Change clip
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => videoInput.current?.click()} className="mt-3 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-sky-300/35 bg-[#020a24]/60 px-4 py-6 text-center hover:border-sky-200/70">
                      <Upload size={20} className="text-white/70" />
                      <span className="text-sm font-semibold text-white">Upload a video</span>
                      <span className="text-xs text-sky-100/50">MP4 or MOV · 2–15 seconds · one person works best</span>
                    </button>
                    <div className="my-3 flex items-center gap-3 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-sky-100/40">
                      <span className="h-px flex-1 bg-sky-300/20" /> or <span className="h-px flex-1 bg-sky-300/20" />
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); void importInstagram(); }} className="flex gap-2">
                      <label className={`${ps2Well} flex min-w-0 flex-1 items-center gap-2 px-3`}>
                        <Link2 size={15} className="shrink-0 text-sky-200/70" />
                        <input
                          value={igUrl}
                          onChange={(e) => setIgUrl(e.target.value)}
                          inputMode="url"
                          placeholder="Paste an Instagram reel link"
                          aria-label="Instagram reel link"
                          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-sky-100/35"
                        />
                      </label>
                      <button type="submit" disabled={!igUrl.trim() || importing} className={`${ps2Ghost} px-4`}>
                        {importing ? <Loader2 size={15} className="animate-spin" /> : "Import"}
                      </button>
                    </form>
                    {importing ? <p className="mt-2 text-xs text-sky-100/55">Grabbing the reel from Instagram… this takes about 20 seconds.</p> : null}
                  </>
                )}
              </div>

              {/* 2 · clothes */}
              <div className={`${ps2Panel} p-4`}>
                <StepLabel n={2} title="Your clothes" done={step2Done} />
                <input ref={pieceInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void onPieces(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                <div className="mt-3 flex flex-col gap-2">
                  {pieces.map((piece) => (
                    <div key={piece.id} className={`${ps2Well} flex items-center gap-3 p-2`}>
                      <img src={piece.url} alt="" className="h-14 w-14 rounded-lg bg-white object-contain" />
                      <select
                        aria-label="What is this piece?"
                        value={piece.type}
                        onChange={(e) => setPieces((prev) => prev.map((p) => (p.id === piece.id ? { ...p, type: e.target.value } : p)))}
                        className="min-w-0 flex-1 rounded-lg border border-sky-300/25 bg-[#020a24]/70 px-2.5 py-2 text-sm text-white"
                      >
                        {PIECE_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                      </select>
                      <button type="button" aria-label="Remove piece" onClick={() => setPieces((prev) => prev.filter((p) => p.id !== piece.id))} className="p-1.5 text-sky-100/45 hover:text-white">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {pieces.length < MAX_PIECES ? (
                    <button type="button" disabled={uploadingPiece} onClick={() => pieceInput.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300/35 bg-[#020a24]/60 px-4 py-4 text-sm font-semibold text-white hover:border-sky-200/70 disabled:opacity-50">
                      {uploadingPiece ? <Loader2 size={16} className="animate-spin" /> : pieces.length ? <Plus size={16} /> : <Shirt size={16} />}
                      {pieces.length ? "Add another piece" : "Add a photo of your piece"}
                    </button>
                  ) : null}
                  <p className="text-xs text-sky-100/45">A clean product photo on a plain background works best.</p>
                </div>
                {noteOpen ? (
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to keep in mind? e.g. tuck the shirt in" className="mt-3 w-full rounded-lg border border-sky-300/25 bg-[#020a24]/70 px-3 py-2 text-sm text-white placeholder:text-white/30" />
                ) : (
                  <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 text-xs text-sky-100/55 hover:text-white">+ Add a note</button>
                )}
              </div>

              {/* 3 · make it */}
              <div className={`${ps2Panel} p-4`}>
                <StepLabel n={3} title="Make it" done={!!stageVideo && stageVideo.status === "complete"} />
                {swapList.length ? (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {swapList.map(({ index, swap }) => (
                      <div key={index} className="aspect-[9/16] overflow-hidden rounded-lg border border-sky-300/25 bg-[#020a24]/70">
                        {swap!.outputUrl ? (
                          <img src={swap!.outputUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="grid h-full place-items-center">
                            {isLive(swap) ? <Loader2 size={16} className="animate-spin text-sky-100/65" /> : <X size={16} className="text-sky-100/55" />}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-sky-100/50">
                  {rendering || (stageVideo && isLive(stageVideo))
                    ? "Rendering your video…"
                    : auto || styling || stylingLive
                      ? `Styling your outfit… ${swapList.filter((e) => e.swap?.status === "complete").length}/${pickedFrames.length || FRAME_COUNT}`
                      : "One click. MADDEN AI dresses your clip and renders the video."}
                </p>
                <div className="mt-3">
                  {canAfford(totalCredits) ? (
                    <button type="button" className={`${ps2Button} w-full`} disabled={!clipReady || !step2Done || working} onClick={makeIt}>
                      {working ? <Loader2 size={16} className="animate-spin" /> : <Ps2Glyph />}
                      Make my video · ≈ {totalCredits} credits
                    </button>
                  ) : (
                    <Link to="/pricing" className={`${ps2Button} w-full`}>Get credits ({totalCredits} needed)</Link>
                  )}
                </div>
                <p className="mt-2 text-xs text-sky-100/45">
                  {isAdmin ? "Admin · free" : `${balance.toLocaleString()} credits on your account`} · failed steps are refunded
                </p>
              </div>

              <Link to="/maddenai/pro" className="px-1 text-xs text-sky-100/45 hover:text-white">
                Want to pick frames yourself? Open the Pro editor →
              </Link>
            </>
          )}
        </aside>
      </div>

      {user && videos.length ? (
        <section className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6">
          <h2 className="text-xl text-white" style={display}>Your videos</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {videos.map((v) => (
              <button key={v.id} type="button" onClick={() => { setStageVideoId(v.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-sky-300/25 bg-[#020a24]/70 text-left shadow-[0_18px_40px_-24px_rgba(60,150,255,0.7)] transition hover:border-sky-200/60">
                {v.status === "complete" && v.outputUrl ? (
                  <video src={v.outputUrl} className="h-full w-full object-cover" muted playsInline loop onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                ) : (
                  <span className="grid h-full place-items-center text-xs text-sky-100/55">
                    {isLive(v) ? <Loader2 size={18} className="animate-spin" /> : "Didn't finish"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </MaddenAIShell>
  );
}
