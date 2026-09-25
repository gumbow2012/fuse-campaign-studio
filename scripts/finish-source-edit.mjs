#!/usr/bin/env node
// Local validation of the deterministic source-edit finishing on real files.
// Nothing is uploaded; no network. Usage:
//   node --experimental-strip-types scripts/finish-source-edit.mjs <generated.mp4> <source.mp4> <out.mp4> [--duration 12.535918 --width 720 --height 1280]
import { readFileSync, writeFileSync } from 'node:fs';
import { finishSourceEditMp4, Mp4FinishError } from '../supabase/functions/_shared/mp4-source-audio-finish.ts';

const [gen, src, out, ...rest] = process.argv.slice(2);
if (!gen || !src || !out) {
  console.error('usage: finish-source-edit.mjs <generated.mp4> <source.mp4> <out.mp4> [--duration s --width px --height px]');
  process.exit(2);
}
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? Number(rest[i + 1]) : null; };
try {
  const { bytes, report } = finishSourceEditMp4({
    generated: new Uint8Array(readFileSync(gen)),
    source: new Uint8Array(readFileSync(src)),
    expected: { duration: flag('duration'), width: flag('width'), height: flag('height') },
  });
  if (report.status === 'finished') writeFileSync(out, bytes);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'finished') console.log('Not written: finishing was skipped.');
} catch (e) {
  if (e instanceof Mp4FinishError) { console.error(`REJECTED [${e.code}]: ${e.message}`); process.exit(1); }
  throw e;
}
