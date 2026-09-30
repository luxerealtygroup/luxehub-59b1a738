// Streams 24 kHz PCM speech (SSE) through one shared AudioContext.
// The context is unlocked on the agent's Start tap so later replies can play
// without another tap (browsers and in-app web views block autoplay otherwise).
import { createParser } from 'eventsource-parser';

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
const sources = new Set<AudioBufferSourceNode>();
let stopCurrent: (() => void) | null = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ sampleRate: 24000 });
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // A silent blip inside the tap fully unlocks iOS Safari / WKWebView.
  const b = ctx.createBuffer(1, 240, 24000);
  const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start();
  return ctx;
}

export function setVolume(v: number) { if (gain) gain.gain.value = v; }

/** Stop whatever is playing now (barge-in, pause, end). */
export function stopSpeech() {
  stopCurrent?.();
  for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } }
  sources.clear();
}

export type SpeechEvents = {
  onReply?: (payload: Record<string, unknown>) => void;
  onFirstAudio?: () => void;
};

/**
 * Reads an SSE response: an optional {type:'reply'} event, then audio deltas.
 * Resolves when playback finishes (or is stopped). Returns whether audio played.
 */
export async function playSpeechResponse(res: Response, ev: SpeechEvents = {}): Promise<{ played: boolean; error?: string }> {
  const ac = unlockAudio();
  if (!res.body) return { played: false, error: 'No audio' };
  let pending = new Uint8Array(0);
  let playhead = 0;
  let played = false;
  let stopped = false;
  let error: string | undefined;
  let last: Promise<void> = Promise.resolve();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  stopSpeech();
  stopCurrent = () => { stopped = true; reader.cancel().catch(() => {}); };

  const parser = createParser({
    onEvent(e) {
      if (stopped) return;
      let p: { type?: string; audio?: string; message?: string } & Record<string, unknown>;
      try { p = JSON.parse(e.data); } catch { return; }
      if (p.type === 'reply') { ev.onReply?.(p); return; }
      if (p.type === 'error') { error = p.message || 'Voice unavailable'; return; }
      if (p.type !== 'speech.audio.delta' || !p.audio) return;
      const inc = Uint8Array.from(atob(p.audio), c => c.charCodeAt(0));
      const bytes = new Uint8Array(pending.length + inc.length);
      bytes.set(pending); bytes.set(inc, pending.length);
      const usable = bytes.length - (bytes.length % 2);
      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(usable / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
      pending = bytes.slice(usable);
      if (!samples.length) return;
      const buf = ac.createBuffer(1, samples.length, 24000);
      buf.copyToChannel(samples, 0);
      const src = ac.createBufferSource();
      src.buffer = buf; src.connect(gain!);
      sources.add(src);
      last = new Promise<void>(r => { src.onended = () => { sources.delete(src); r(); }; });
      if (!played) { played = true; ev.onFirstAudio?.(); }
      playhead = Math.max(playhead, ac.currentTime + 0.05);
      src.start(playhead);
      playhead += buf.duration;
    },
  });

  try {
    while (true) {
      const n = await reader.read();
      if (n.done) break;
      parser.feed(n.value);
    }
  } catch { /* cancelled */ }
  if (!stopped) await last;
  stopCurrent = null;
  return { played, error };
}
