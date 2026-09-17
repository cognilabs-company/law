// Synthesized call tones via WebAudio (no assets). Ringback for the caller,
// ringtone for the callee, and a short tone when a call ends.
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new Ctor();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol = 0.15) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

// Create / resume the audio context inside a user gesture (accept / join
// click) so the browser's autoplay policy lets the tones play later.
export function primeCallAudio(): void {
  const c = ac();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// Caller's "gudok" — a single 425 Hz burst repeated every ~3.5s.
export function playRingback(): () => void {
  const c = ac();
  if (!c) return () => {};
  let stop = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = () => {
    if (stop) return;
    // Standard PBX ringback: 425 Hz, ~1s on, repeated.
    tone(c, 425, 0, 1.1, 0.28);
    timer = setTimeout(loop, 3500);
  };
  loop();
  return () => {
    stop = true;
    clearTimeout(timer);
  };
}

// Callee's incoming ringtone — a brighter two-tone repeated every ~2.5s.
export function playRingtone(): () => void {
  const c = ac();
  if (!c) return () => {};
  let stop = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = () => {
    if (stop) return;
    tone(c, 620, 0, 0.4, 0.3);
    tone(c, 480, 0.45, 0.4, 0.3);
    timer = setTimeout(loop, 2500);
  };
  loop();
  return () => {
    stop = true;
    clearTimeout(timer);
  };
}

// Short descending tone when a call ends.
export function playEndTone() {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(480, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.3);
  g.gain.setValueAtTime(0.2, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.38);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.42);
}

// Warm bell-like note: a fundamental plus a soft octave partial with a slow
// decay (triangle + sine), through a gentle low-pass so it never sounds sharp.
function bell(c: AudioContext, freq: number, start: number, dur: number, vol: number) {
  const t0 = c.currentTime + start;
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const partials: [number, OscillatorType, number][] = [[1, "triangle", 1], [2, "sine", 0.35], [3, "sine", 0.12]];
  for (const [mul, type, amp] of partials) {
    const o = c.createOscillator();
    const pg = c.createGain();
    o.type = type;
    o.frequency.value = freq * mul;
    pg.gain.value = amp;
    o.connect(pg).connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  lp.connect(g).connect(c.destination);
}

// Pleasant rising three-note chime (C5–E5–G5) when someone joins; the first
// join of a meeting also gets a longer, softer welcome note.
export function playJoinTone(first = false) {
  const c = ac();
  if (!c) return;
  if (first) {
    bell(c, 523.25, 0, 0.9, 0.16);
    bell(c, 659.25, 0.16, 0.9, 0.14);
    bell(c, 783.99, 0.32, 1.2, 0.14);
    return;
  }
  bell(c, 659.25, 0, 0.45, 0.13);
  bell(c, 783.99, 0.14, 0.6, 0.12);
}
// Soft falling note when someone leaves.
export function playLeaveTone() {
  const c = ac();
  if (!c) return;
  bell(c, 659.25, 0, 0.35, 0.09);
  bell(c, 493.88, 0.14, 0.55, 0.09);
}
// Short double tick when a recording starts/stops.
export function playRecTone(on: boolean) {
  const c = ac();
  if (!c) return;
  bell(c, on ? 880 : 660, 0, 0.18, 0.1);
  bell(c, on ? 1174.66 : 523.25, 0.12, 0.25, 0.1);
}
