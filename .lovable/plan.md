# Jerry / Pass the Fit — read-only findings (no changes made)

Scope: investigation only. No code, auth/RLS, billing, review gates, graph, generation or provider calls touched. Code read is this repo; the deployed ykrr… bundles were not re-read here.

## 1. Kling O3 source-edit completion/storage

- `supabase/functions/fal-webhook/index.ts` (lines 126–177): takes `payload.video.url`, passes it to `uploadRemoteAsset` (`_shared/executor.ts`), marks the step complete. It stores the provider file byte-for-byte. There's no probe, trim, pad or audio step, so the 12.396s container, 12.375s video and the AAC offset of 0.042993s are Fal's output, stored unchanged.
- `_shared/executor.ts` ~1518–1540: sends `keepAudio` from `keep_source_audio`. After the output comes back, nothing compares it with `prompt_config.source_video.duration`.

## 2. Is there a deterministic remux/finishing facility? No exact one.

| Facility | Path | Can it restore source audio and timeline exactly? |
|---|---|---|
| Upload normalization | `normalize-video/index.ts`, `normalize-callback/index.ts`, `service_config.normalize_worker_url` | No. It takes one input only (`sourcePath` → `normalized/<base>.h264.mp4`), for playback transcoding. It has no second audio source and no target duration. It's also keyed to the uploaded source path, not to run outputs. |
| Campaign editor export | `export-campaign` (deployed, not in repo); dispatch mirrored in `fuse-mcp/core/exports.ts` 54–90; render worker `app_config/service_config.render_worker_url` | Partly, but not exactly. It accepts segments (trim, volume, muted) plus one `music` track (path, volume, fades), so you could mute the generated clip and add the source file's soundtrack as music. But it re-encodes: fps defaults to 30 (there is an fps setting), CRF 20. It can't stretch or pad 12.375s of video to 12.4167s. Whether `music` accepts an MP4 as an audio source isn't verifiable here, because the worker is external. It's normally billed/free under the existing editor rules and is non-generative. |
| In-browser export | `src/services/videoExport/*` (audioMixer, exportClient) | Same limits: client re-encode, no frame-exact padding. |

Conclusion: FUSE has no path that remuxes the generated video with the original AAC stream at the source's exact 12.535918s timeline. The closest supported option is an editor export with the generated clip muted and source audio as music. It's approximate: about 42 ms of audio offset is fixable only if the worker honours an offset, which is unconfirmed, and about 41 ms of video stays short. Getting an exact result would need new work: a finishing step that copies the source audio stream and pads or retimes the video. That's out of scope for this message.

## 3. Does a full start-template-run regenerate inspected guides? Yes.

- `start-template-run/index.ts` 544 / 813: every run creates new `execution_steps` as `pending`. `runGraphJob` then runs every pending generative step. It never reads `node_runs`, so the canvas-inspected phone guide (node run 4c3b12ba…) and full-body guide are generated again, with new randomness and new charges.
- Fork runs (`action: "run_fork"`, lines 447–474) reuse only the source job's uploaded inputs, not generated outputs.

## 4. Existing supported ways to reuse inspected guides

1. **Canvas single-step preview of the final node** (`run-node/index.ts` 185–206). For upstream generative nodes it uses the newest completed `node_runs` output (`latestByNode`). So previewing node 36a614dc… feeds it the guides you already inspected, plus the hidden source and your test-panel uploads. No graph change is needed, it's billed per step as normal, and it's the only exact-guide path. Caveat: the result is a node_run preview, not a campaign job, so it has no editor project or export.
2. **Per-output regeneration on a finished job** (`action: "regenerate_output"`, `_shared/regeneration.ts` 160–234, `_shared/regeneration-run.ts`). It re-runs only the target and reuses completed ancestors ("completed_output"), charged as `rerun_step`. It reuses guides from **that job**, not canvas node_runs. After one full run whose guides pass inspection, regenerating the final video keeps those guides exactly.
3. `rerun-step` (legacy `project_steps`) and `resume-template-job` (admin/runner only) don't apply.

## Recommended next step (for your decision, nothing executed)

- For guide-exact final video tests: use option 1 (canvas preview of the final node), or option 2 after a full run whose guides pass.
- For exact source duration and soundtrack: either accept the approximate editor-export mute + music route, or approve a separate build task for a deterministic finishing step (copy the source audio, pad or trim to the source duration, no generative call).
