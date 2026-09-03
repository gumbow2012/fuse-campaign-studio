/**
 * Music upload + signed playback for the Campaign Editor.
 * Files land in the private `fuse-assets` bucket under the owner's own prefix,
 * so only the storage path is ever persisted on the project.
 */
import { supabase } from "@/integrations/supabase/client";
import { uploadToStorage } from "@/services/storageUpload";
import { MUSIC_MAX_BYTES, normalizeMusic, type MusicTrack } from "@/services/editorMusic";

const BUCKET = "fuse-assets";
const PLAYBACK_TTL = 60 * 60 * 6;

async function currentUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to add music.");
  return userId;
}

/** Reads the real duration of an audio file locally (no upload required). */
export function readAudioDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0);
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

export async function uploadMusicFile(
  projectId: string,
  file: File,
): Promise<{ music: MusicTrack; url: string }> {
  if (file.size > MUSIC_MAX_BYTES) {
    throw new Error("That track is too large — please use a file under 40MB.");
  }
  const userId = await currentUserId();
  const durationMs = await readAudioDurationMs(file);
  const { path, url } = await uploadToStorage(
    `${userId}/campaign-music/${projectId}`,
    file,
    file.name || "music.mp3",
  );

  const music = normalizeMusic({
    path,
    name: file.name?.replace(/\.[a-z0-9]+$/i, "") || "Music",
    startMs: 0,
    clipStartMs: 0,
    clipEndMs: durationMs || 30_000,
    sourceDurationMs: durationMs,
    volume: 0.7,
    muted: false,
    fadeInMs: 600,
    fadeOutMs: 900,
    mode: "trim",
    duck: 35,
  });
  if (!music) throw new Error("That track could not be prepared.");
  return { music, url };
}

/** Short-lived playback url for the persisted music path. */
export async function signMusicUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, PLAYBACK_TTL);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
