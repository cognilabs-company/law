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

// Soft two-note chime when someone joins the meeting.
export function playJoinTone() {
  const c = ac();
  if (!c) return;
  tone(c, 660, 0, 0.12, 0.12);
  tone(c, 880, 0.12, 0.18, 0.12);
}
// Falling note when someone leaves.
export function playLeaveTone() {
  const c = ac();
  if (!c) return;
  tone(c, 660, 0, 0.12, 0.1);
  tone(c, 440, 0.12, 0.2, 0.1);
}
