# Browser assembly check (local, no provider calls)
Generates synthetic clips with ffmpeg, runs `src/workers/hatFilm.worker.ts` in a real Chromium against the dev server, then verifies with ffprobe and the server's `probeMp4`.
- Fixtures: 11 x 5 s 720x1280 clips (clip3 at 24 fps), `still.png`, 800x400 `logo.png`, 1 s `short.mp4`, 25 s stereo AAC `soundtrack.m4a` in `fx/`.
- `python3 run_assembly.py` -> out.mp4; `python3 run_assembly.py short` must fail on shot_08.
- Needs a Chromium with H.264 encode (the system `/bin/chromium`; Playwright's bundled build has none).
