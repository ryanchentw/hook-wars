// Mixes each music file's loop seam the way the game does (src/audio/loop.ts, music.ts, webAudio.ts) and prints the
// quietest 20 ms window across it, beside the track's own quiet and typical levels, so a gap would show as a dip.
// Usage: node scripts/audio/seam.mjs
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const AUDIO = resolve(import.meta.dirname, '../../public/audio');
const RATE = 44100;
const THRESHOLD = 0.001;
const WINDOW = Math.round(0.02 * RATE);
const AROUND = 2;
// Mirrors TRACKS in src/audio/manifest.ts.
const TRACKS = [
  { file: 'music-menu', overlap: 0.05, fadeIn: 0.05 },
  { file: 'music-match', overlap: 1.8, fadeIn: 0 },
];

function decodeMono(path) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

function bounds(samples) {
  const first = samples.findIndex((x) => Math.abs(x) > THRESHOLD);
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) <= THRESHOLD) last -= 1;
  return { start: first, end: last + 1 };
}

const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);

function windowsRms(signal) {
  const out = [];
  for (let i = 0; i + WINDOW <= signal.length; i += WINDOW) {
    let sum = 0;
    for (let j = i; j < i + WINDOW; j += 1) sum += signal[j] * signal[j];
    out.push(Math.sqrt(sum / WINDOW));
  }
  return out;
}

function seam(samples, { overlap, fadeIn }) {
  const { start, end } = bounds(samples);
  const length = end - start;
  const fadeOut = Math.min(Math.round(overlap * RATE), Math.floor(length / 2));
  const period = length - fadeOut;
  const from = period - AROUND * RATE;
  const mix = new Float32Array((AROUND * 2) * RATE + fadeOut);
  for (let k = 0; k < mix.length; k += 1) {
    const t = from + k;
    const oldGain = t < period ? 1 : Math.max(0, 1 - (t - period) / fadeOut);
    const old = t < length ? samples[start + t] * oldGain : 0;
    const n = t - period;
    const newGain = n < 0 ? 0 : fadeIn > 0 ? Math.min(1, n / (fadeIn * RATE)) : 1;
    const next = n >= 0 && n < length ? samples[start + n] * newGain : 0;
    mix[k] = old + next;
  }
  return { mix, body: samples.subarray(start, end), lead: start / RATE, tail: (samples.length - end) / RATE };
}

for (const track of TRACKS) {
  const samples = decodeMono(`${AUDIO}/${track.file}.mp3`);
  const { mix, body, lead, tail } = seam(samples, track);
  const seamRms = windowsRms(mix);
  const bodyRms = windowsRms(body).sort((a, b) => a - b);
  const headRms = windowsRms(body.subarray(0, AROUND * RATE));
  const peak = mix.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  process.stdout.write(
    `${track.file}: padding ${lead.toFixed(3)}s head, ${tail.toFixed(3)}s tail; seam quietest 20ms ${db(Math.min(...seamRms))} dBFS, ` +
      `the track's own first ${AROUND}s quietest ${db(Math.min(...headRms))} dBFS, its 1st percentile ${db(bodyRms[Math.floor(bodyRms.length * 0.01)])} dBFS, median ${db(bodyRms[Math.floor(bodyRms.length / 2)])} dBFS; seam peak ${peak.toFixed(3)}\n`,
  );
}
