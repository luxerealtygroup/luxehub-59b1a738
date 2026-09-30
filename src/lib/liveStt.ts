// Live speech-to-text over a Deepgram WebSocket, fed from the already-open
// (echo-cancelled) mic stream. Auth uses a short-lived token minted by the
// script-boss function — the API key never reaches the browser.

export type LiveStt = {
  /** Clear text collected so far (start of a new agent turn). */
  reset: () => void;
  /** Forces pending words to finalize and returns the turn's text. */
  finalize: () => Promise<string>;
  hasWords: () => boolean;
  setMuted: (m: boolean) => void;
  /** Seconds of audio streamed since the last call. */
  takeSeconds: () => number;
  close: () => void;
};

const URL_BASE = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=en&encoding=linear16&sample_rate=16000&channels=1'
  + '&interim_results=true&smart_format=true&punctuate=true&endpointing=300';

export async function openLiveStt(stream: MediaStream, ctx: AudioContext, token: string, onFail: () => void): Promise<LiveStt> {
  const ws = new WebSocket(URL_BASE, ['bearer', token]);
  ws.binaryType = 'arraybuffer';
  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), 5000);
    ws.onopen = () => { clearTimeout(t); resolve(); };
    ws.onerror = () => { clearTimeout(t); reject(new Error('socket error')); };
  });

  let finals: string[] = [];
  let interim = '';
  let muted = false;
  let closed = false;
  let seconds = 0;
  let waiter: (() => void) | null = null;

  ws.onmessage = (e) => {
    let m: { type?: string; is_final?: boolean; from_finalize?: boolean; channel?: { alternatives?: { transcript?: string }[] } };
    try { m = JSON.parse(typeof e.data === 'string' ? e.data : ''); } catch { return; }
    if (m.type !== 'Results') return;
    const t = (m.channel?.alternatives?.[0]?.transcript ?? '').trim();
    if (m.is_final) { if (t) finals.push(t); interim = ''; if (waiter) { waiter(); waiter = null; } }
    else interim = t;
  };
  ws.onclose = () => { if (!closed) { closed = true; onFail(); } };
  ws.onerror = () => { /* onclose follows */ };

  // Capture: downsample the mic to 16 kHz 16-bit PCM.
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / 16000;
  proc.onaudioprocess = (ev) => {
    if (muted || ws.readyState !== WebSocket.OPEN) return;
    const input = ev.inputBuffer.getChannelData(0);
    const outLen = Math.floor(input.length / ratio);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s0 = Math.floor(i * ratio), s1 = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0; for (let j = s0; j < s1; j++) sum += input[j];
      const v = Math.max(-1, Math.min(1, sum / Math.max(1, s1 - s0)));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    ws.send(out.buffer);
    seconds += outLen / 16000;
  };
  src.connect(proc);
  const sink = ctx.createGain(); sink.gain.value = 0; // keeps the processor running without playing the mic
  proc.connect(sink); sink.connect(ctx.destination);
  const keepAlive = window.setInterval(() => { if (muted && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' })); }, 4000);

  return {
    reset: () => { finals = []; interim = ''; },
    hasWords: () => finals.length > 0 || interim.length > 0,
    setMuted: (m) => { muted = m; },
    takeSeconds: () => { const s = seconds; seconds = 0; return s; },
    finalize: async () => {
      if (interim && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'Finalize' }));
        await new Promise<void>(r => { waiter = r; window.setTimeout(() => { waiter = null; r(); }, 700); });
      }
      const text = [...finals, interim].filter(Boolean).join(' ').trim();
      finals = []; interim = '';
      return text;
    },
    close: () => {
      closed = true;
      clearInterval(keepAlive);
      try { proc.disconnect(); src.disconnect(); sink.disconnect(); } catch { /* already gone */ }
      try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' })); ws.close(); } catch { /* ignore */ }
    },
  };
}
