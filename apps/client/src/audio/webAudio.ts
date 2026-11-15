import { contentBounds, SILENCE_THRESHOLD } from './loop';
import type { AudioOutput, Bus, Clip, Level, PlayRequest, Voice } from './output';

/** Decoding needs no gesture in an offline context, and the buffers it makes play in any context. */
const DECODE_RATE = 44100;
const STOP_MARGIN = 0.02;
const NO_VOICE: Voice = { stop: () => undefined };

type Graph = { readonly ctx: AudioContext; readonly levels: Readonly<Record<Level, GainNode>>; readonly buses: Readonly<Record<Bus, AudioNode>> };

function buildGraph(ctx: AudioContext, initial: Readonly<Record<Level, number>>): Graph {
  const gain = (level: Level): GainNode => {
    const node = ctx.createGain();
    node.gain.value = initial[level];
    return node;
  };
  const levels = { master: gain('master'), music: gain('music'), effects: gain('effects'), duck: gain('duck') };
  levels.master.connect(ctx.destination);
  levels.effects.connect(levels.master);
  levels.music.connect(levels.duck).connect(levels.master);
  return { ctx, levels, buses: { music: levels.music, effects: levels.effects } };
}

async function decode(url: string): Promise<{ readonly clip: Clip; readonly buffer: AudioBuffer } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(await response.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    return { buffer, clip: { duration: buffer.duration, bounds: contentBounds(channels, buffer.sampleRate, SILENCE_THRESHOLD) } };
  } catch {
    return null;
  }
}

function envelope(param: AudioParam, request: PlayRequest): void {
  const { when, gain, fadeIn, fadeOut } = request;
  const end = when + request.length / request.rate;
  param.setValueAtTime(fadeIn > 0 ? 0 : gain, when);
  if (fadeIn > 0) param.linearRampToValueAtTime(gain, when + fadeIn);
  if (fadeOut > 0) {
    param.setValueAtTime(gain, Math.max(when + fadeIn, end - fadeOut));
    param.linearRampToValueAtTime(0, end);
  }
}

function startVoice(graph: Graph, buffer: AudioBuffer, request: PlayRequest): Voice {
  const { ctx } = graph;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = request.rate;
  const amp = ctx.createGain();
  envelope(amp.gain, request);
  const pan = ctx.createStereoPanner();
  pan.pan.value = request.pan;
  source.connect(amp).connect(pan).connect(graph.buses[request.bus]);
  source.onended = () => pan.disconnect();
  source.start(Math.max(request.when, ctx.currentTime), request.offset, request.length);
  return {
    stop(fade) {
      const now = ctx.currentTime;
      amp.gain.cancelScheduledValues(now);
      amp.gain.setValueAtTime(amp.gain.value, now);
      amp.gain.linearRampToValueAtTime(0, now + fade);
      try {
        source.stop(now + fade + STOP_MARGIN);
      } catch {
        // Already stopped.
      }
    },
  };
}

/** The real output. Its context is made on the first gesture, so a page nobody touches never asks for audio. */
export function createWebAudioOutput(): AudioOutput {
  const buffers = new WeakMap<Clip, AudioBuffer>();
  let levels: Record<Level, number> = { master: 1, music: 1, effects: 1, duck: 1 };
  let graph: Graph | null = null;
  let hidden = false;

  const settle = (promise: Promise<void> | undefined): void => void promise?.catch(() => undefined);

  return {
    live: () => graph !== null && graph.ctx.state === 'running' && !hidden,
    now: () => graph?.ctx.currentTime ?? 0,
    async load(url) {
      const decoded = await decode(url);
      if (decoded === null) return null;
      buffers.set(decoded.clip, decoded.buffer);
      return decoded.clip;
    },
    play(clip, request) {
      const buffer = buffers.get(clip);
      if (graph === null || buffer === undefined) return NO_VOICE;
      try {
        return startVoice(graph, buffer, request);
      } catch {
        return NO_VOICE;
      }
    },
    setLevel(level, gain, ramp) {
      levels = { ...levels, [level]: gain };
      if (graph === null) return;
      const param = graph.levels[level].gain;
      const now = graph.ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(gain, now + ramp);
    },
    unlock() {
      try {
        graph ??= buildGraph(new AudioContext({ latencyHint: 'interactive' }), levels);
        if (graph.ctx.state !== 'running' && !hidden) settle(graph.ctx.resume());
      } catch {
        graph = null;
      }
    },
    setHidden(next) {
      hidden = next;
      if (graph === null) return;
      settle(next ? graph.ctx.suspend() : graph.ctx.resume());
    },
  };
}
