import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";
import { signedDisplayUrl } from "@/lib/campaign-director/signedUrl";
import { clipFileName, readyClips, segmentRows } from "@/lib/campaign-director/finalVideo";
import type { DirectorProject } from "@/lib/campaign-director/types";

const reason = (error: unknown, fallback: string) => (error as { message?: string } | null)?.message || fallback;
const asRecord = (rows: unknown) => rows as Record<string, unknown>;

export interface SentToEditor {
  /** Campaign Editor project id: open it at /editor/<id>. */
  id: string;
  added: number;
  total: number;
}

/**
 * Puts this campaign's finished clips into the Campaign Editor (the same editor FUSE runs use), in script
 * order. First time: a new edit project with every clip on the timeline. After that: the same project,
 * and only clips it does not have yet are added, as Available media, so the user's edits are untouched.
 * Both tables are owner-scoped by RLS, so this runs straight from the browser.
 */
export async function sendToEditor(project: DirectorProject, campaignName: string): Promise<SentToEditor> {
  const clips = readyClips(project);
  if (clips.length === 0) throw new Error("There are no finished clips yet.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  let projectId = project.editProjectId ?? "";
  let created = false;
  let existingPaths: string[] = [];
  let nextPosition = 0;
  let revision = 0;

  if (projectId) {
    const { data } = await looseTable("campaign_edit_projects").select("id,revision").eq("id", projectId).maybeSingle();
    if (data) {
      revision = Number(data.revision) || 0;
      const { data: segs } = await looseTable("campaign_edit_segments").select("source_path,position").eq("project_id", projectId);
      const rows = (Array.isArray(segs) ? segs : []) as { source_path: string; position: number }[];
      existingPaths = rows.map((s) => s.source_path);
      nextPosition = rows.reduce((max, s) => Math.max(max, Number(s.position) || 0), -1) + 1;
    } else {
      projectId = ""; // the edit was deleted: start a fresh one
    }
  }

  if (!projectId) {
    const { data, error } = await looseTable("campaign_edit_projects")
      .insert({ user_id: user.id, name: `${campaignName.trim() || "Campaign"} — Final video`, aspect_ratio: project.world.aspectRatio, status: "draft" })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) throw new Error(reason(error, "Could not start the edit."));
    projectId = String(data.id);
    created = true;
  }

  const rows = segmentRows(projectId, clips, project.world.clipSeconds, existingPaths, nextPosition);
  if (rows.length > 0) {
    const { error } = await looseTable("campaign_edit_segments").insert(asRecord(rows));
    if (error) {
      if (created) await looseTable("campaign_edit_projects").delete().eq("id", projectId); // no half-built edit left behind
      throw new Error(reason(error, "Could not add the clips to the editor."));
    }
    // An editor tab that is already open sees a newer revision and reloads, so it picks the new clips up.
    if (!created) await looseTable("campaign_edit_projects").update({ revision: revision + 1 }).eq("id", projectId);
  }
  return { id: projectId, added: rows.length, total: clips.length };
}

/** Every finished clip in one .zip, named by shot number and title. */
export async function downloadAllClips(project: DirectorProject, campaignName: string, onProgress: (done: number, total: number) => void) {
  const clips = readyClips(project);
  if (clips.length === 0) throw new Error("There are no finished clips yet.");
  const zip = new JSZip();
  let done = 0;
  onProgress(0, clips.length);
  for (const { shot } of clips) {
    const response = await fetch(await signedDisplayUrl(shot.video.url));
    if (!response.ok) throw new Error(`Could not download shot ${shot.index} (${response.status}).`);
    zip.file(clipFileName(shot), await response.arrayBuffer());
    onProgress(++done, clips.length);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }); // mp4 is already compressed
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${(campaignName.trim() || "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-clips.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
