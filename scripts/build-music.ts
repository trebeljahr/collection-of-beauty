#!/usr/bin/env tsx

/**
 * Download and encode the 3D museum's background music.
 *
 *   pnpm music:build                 # fetch what is missing, encode what is missing
 *   pnpm music:build --only=swan     # tracks whose id contains "swan"
 *   pnpm music:build --force         # encode again even where the mp3 exists
 *
 * The track list, its sources and their SHA-1s are in
 * src/lib/gallery-music.ts. Sources land in `assets/music/` (never
 * synced, like every original) and encodes in `assets-web/music/v1/`,
 * which `pnpm assets:sync` publishes. The asset origin serves them
 * immutable: change an encode setting, bump `MUSIC_DIR` too.
 *
 * Encoding: an optional trim, then ffmpeg's loudnorm in two passes
 * (measure, then a linear gain to -18 LUFS, so a quiet 78 and a close
 * modern recording sit at one level without compressing either), then
 * LAME VBR quality 2. MP3 because every browser plays it and every
 * object store names its type: rclone took `.m4a` as audio/mp4a-latm on
 * this Mac, which Safari may refuse.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  GALLERY_MUSIC,
  type MusicTrack,
  musicCreditLine,
  musicObjectKey,
} from "../src/lib/gallery-music";

const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "assets", "music");
const OUT_ROOT = join(ROOT, "assets-web");

// Wikimedia asks every client for a descriptive User-Agent with contact.
const USER_AGENT =
  "collection-of-beauty-music/1.0 (https://collectionofbeauty.com; build-music.ts)";

const TARGET_LUFS = -18;
const TARGET_TRUE_PEAK = -1.5;
const TARGET_LRA = 20; // above any source, so loudnorm's linear mode never falls back to dynamic

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

function sourcePath(track: MusicTrack): string {
  const ext = extname(new URL(track.download.url).pathname) || ".bin";
  return join(SOURCE_DIR, `${track.id}${ext.toLowerCase()}`);
}

async function sha1Of(path: string): Promise<string> {
  return createHash("sha1")
    .update(await readFile(path))
    .digest("hex");
}

async function fetchSource(track: MusicTrack): Promise<string> {
  const path = sourcePath(track);
  if (existsSync(path)) {
    const sum = await sha1Of(path);
    if (sum === track.download.sha1) return path;
    throw new Error(
      `${path} has SHA-1 ${sum}, expected ${track.download.sha1}. Move it aside and run again.`,
    );
  }
  console.log(`[music] ${track.id}: downloading ${track.download.url}`);
  const res = await fetch(track.download.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${track.id}: GET ${track.download.url} → ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha1").update(bytes).digest("hex");
  if (sum !== track.download.sha1) {
    throw new Error(
      `${track.id}: downloaded SHA-1 ${sum}, expected ${track.download.sha1}. The source changed; check it before updating the hash.`,
    );
  }
  await mkdir(SOURCE_DIR, { recursive: true });
  await writeFile(`${path}.part`, bytes);
  await rename(`${path}.part`, path);
  return path;
}

type LoudnormMeasure = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

function preFilters(track: MusicTrack, duration: number): string[] {
  const filters: string[] = [];
  const start = track.trim?.start ?? 0;
  const end = duration - (track.trim?.end ?? 0);
  if (start > 0 || end < duration) {
    filters.push(`atrim=start=${start}:end=${end.toFixed(3)}`, "asetpts=PTS-STARTPTS");
  }
  if (track.mono) filters.push("pan=mono|c0=0.5*c0+0.5*c1");
  // A 78's rumble sits under 40 Hz; nothing musical is lost there.
  if (track.mono) filters.push("highpass=f=40");
  return filters;
}

async function durationOf(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    path,
  ]);
  return Number.parseFloat(stdout.trim());
}

async function channelsOf(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=channels",
    "-of",
    "default=nw=1:nk=1",
    path,
  ]);
  return Number.parseInt(stdout.trim(), 10);
}

async function encode(track: MusicTrack, src: string): Promise<void> {
  const out = join(OUT_ROOT, musicObjectKey(track));
  if (existsSync(out) && !force) {
    console.log(`[music] ${track.id}: ${out} exists`);
    return;
  }
  const duration = await durationOf(src);
  const pre = preFilters(track, duration);
  // A source that is already one channel needs no downmix.
  if (track.mono && (await channelsOf(src)) === 1) {
    pre.splice(pre.indexOf("pan=mono|c0=0.5*c0+0.5*c1"), 1);
  }
  const loudnorm = `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LRA}`;

  const pass1 = await run(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      src,
      "-af",
      [...pre, `${loudnorm}:print_format=json`].join(","),
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(pass1.stderr)?.[0];
  if (!json) throw new Error(`${track.id}: loudnorm printed no measurement`);
  const m = JSON.parse(json) as LoudnormMeasure;

  const fadeOutAt = Math.max(0, duration - (track.trim?.start ?? 0) - (track.trim?.end ?? 0) - 1.5);
  const filters = [
    ...pre,
    `${loudnorm}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    // loudnorm resamples to 192 kHz internally; LAME wants 44.1.
    "aresample=44100",
    // Ends cut by `trim` would click; a short fade on both is inaudible
    // on an untrimmed recording, which starts and ends in silence.
    "afade=t=in:d=0.3",
    `afade=t=out:st=${fadeOutAt.toFixed(3)}:d=1.5`,
  ];

  await mkdir(dirname(out), { recursive: true });
  const tmp = `${out}.part.mp3`;
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    src,
    "-map",
    "0:a:0",
    "-map_metadata",
    "-1",
    "-af",
    filters.join(","),
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    "-id3v2_version",
    "3",
    "-metadata",
    `title=${track.work}`,
    "-metadata",
    `artist=${track.performer}`,
    "-metadata",
    `composer=${track.composer}`,
    "-metadata",
    `comment=${musicCreditLine(track)} ${track.sourceUrl}`,
    "-metadata",
    `copyright=${track.licence.name}${track.licence.url ? ` ${track.licence.url}` : ""}`,
    tmp,
  ]);
  await rename(tmp, out);
  console.log(
    `[music] ${track.id}: ${m.input_i} LUFS → ${TARGET_LUFS} (gain ${(TARGET_LUFS - Number(m.input_i)).toFixed(1)} dB) → ${out}`,
  );
}

async function main(): Promise<void> {
  const tracks = GALLERY_MUSIC.filter((t) => !only || t.id.includes(only));
  if (tracks.length === 0) {
    console.error(`[music] no track id contains "${only}"`);
    process.exit(1);
  }
  let failed = 0;
  for (const track of tracks) {
    try {
      await encode(track, await fetchSource(track));
    } catch (err) {
      failed++;
      console.error(`[music] ${track.id}: ${(err as Error).message}`);
    }
  }
  if (failed) process.exit(1);
}

void main();
