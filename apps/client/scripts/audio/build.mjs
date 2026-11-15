// Makes the shipped audio in public/audio from the downloaded CC0 originals, and prints what it measured.
// Usage: node scripts/audio/build.mjs <source-root>   (needs ffmpeg on PATH; rerunnable, overwrites its outputs)
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MUSIC, SFX } from './spec.mjs';

const OUT = resolve(import.meta.dirname, '../../public/audio');
const SFX_MOMENTARY_TARGET = -14;
const SFX_PEAK_CEILING = -1.5;
const MUSIC_TARGET = { I: -18, TP: -1.5, LRA: 11 };
const SFX_RATE = 44100;
const SILENCE = { head: '-50dB', tail: '-60dB' };
const TAIL_FADE = 0.01;

const ffmpegLog = (args) => {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (error) {
    throw new Error(`ffmpeg failed: ${error.stderr}`);
  }
};
/** ffmpeg writes its measurements to stderr. */
const stderrOf = (args) => execFileSync('sh', ['-c', 'ffmpeg -hide_banner -nostats "$@" 2>&1', 'sh', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });

const trimChain = (spec) => {
  const head = spec.keepHead ? [] : [`silenceremove=start_periods=1:start_threshold=${SILENCE.head}`];
  return [...head, 'areverse', `silenceremove=start_periods=1:start_threshold=${SILENCE.tail}`, 'areverse'];
};

function measure(path) {
  const log = stderrOf(['-i', path, '-af', 'ebur128=peak=true:framelog=info', '-f', 'null', '-']);
  const momentary = [...log.matchAll(/ M:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(summary)?.[1] ?? Number.NaN);
  return { integrated: num(/I:\s+(-?[\d.]+) LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/), momentaryMax: Math.max(...momentary) };
}

function duration(path) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }));
}

/** Largest absolute sample after decoding, as a fraction of full scale: 1 means the file clips. */
function samplePeak(path) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  return samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
}

function buildSfx(root, spec) {
  const out = join(OUT, `${spec.out}.mp3`);
  const cut = spec.cut === undefined ? [] : ['-ss', String(spec.cut.start), '-t', String(spec.cut.length)];
  const shaped = [...trimChain(spec), ...(spec.fade === undefined ? [] : [`afade=t=in:d=${spec.fade.in}`]), `areverse,afade=t=in:d=${spec.fade?.out ?? TAIL_FADE},areverse`];
  const tmp = join(OUT, `.${spec.out}.wav`);
  ffmpegLog(['-y', ...cut, '-i', join(root, spec.src), '-af', shaped.join(','), '-ac', '1', '-ar', String(SFX_RATE), tmp]);
  const m = measure(tmp);
  const gain = Math.min(SFX_MOMENTARY_TARGET - m.momentaryMax, SFX_PEAK_CEILING - m.truePeak);
  ffmpegLog(['-y', '-i', tmp, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-q:a', '5', out]);
  execFileSync('rm', [tmp]);
  return out;
}

function buildMusic(root, spec) {
  const out = join(OUT, `${spec.out}.mp3`);
  const chain = trimChain(spec).join(',');
  const { I, TP, LRA } = MUSIC_TARGET;
  const first = stderrOf(['-i', join(root, spec.src), '-af', `${chain},loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-']);
  const stats = JSON.parse(first.slice(first.lastIndexOf('{'), first.lastIndexOf('}') + 1));
  const second = `${chain},loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:linear=true:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}`;
  ffmpegLog(['-y', '-i', join(root, spec.src), '-af', second, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', `${spec.kbps}k`, out]);
  return out;
}

function report(id, path) {
  const m = measure(path);
  const peak = samplePeak(path);
  const row = [id, path.split('/').pop(), statSync(path).size, duration(path).toFixed(3), m.integrated, m.momentaryMax.toFixed(1), m.truePeak, peak.toFixed(4), peak >= 0.9999 ? 'CLIPS' : 'ok'];
  return row.join('\t');
}

const root = process.argv[2];
if (root === undefined) throw new Error('Pass the folder the originals were downloaded to.');
mkdirSync(OUT, { recursive: true });
const rows = [
  ...SFX.map((spec) => report(spec.out, buildSfx(root, spec))),
  ...MUSIC.map((spec) => report(spec.out, buildMusic(root, spec))),
];
process.stdout.write(['id\tfile\tbytes\tseconds\tI_LUFS\tM_max_LUFS\ttruePeak_dBFS\tsamplePeak\tclip', ...rows].join('\n') + '\n');
