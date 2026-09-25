"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── What a browser can and cannot do about screen capture ─────────────────
// A web page cannot physically stop a screenshot or a screen recorder: the
// pixels are captured by the operating system, outside the page's reach. Only
// a native app (Windows SetWindowDisplayAffinity, Android FLAG_SECURE) or DRM
// playback (Widevine L1 + an HDCP policy) can black out a captured frame, and
// neither is available to a WebRTC video stream.
//
// What the industry actually ships for confidential meetings — Teams, Zoom and
// the enterprise DLP vendors alike — is a two-layer defence, and that is what
// this module implements:
//
//   1. DETERRENCE AND FORENSICS: a per-viewer dynamic watermark burnt over the
//      video. Every participant sees their OWN name, id and the call id, tiled
//      across the picture and shifted on a timer so it cannot be cropped out.
//      Any leaked screenshot or recording therefore identifies who leaked it.
//
//   2. DENIAL OF THE CAPTURE WINDOW: the moment anything that accompanies a
//      capture happens — the tab is hidden, the window loses focus (the
//      Windows Snipping Tool and macOS screenshot overlay both steal it), or a
//      screenshot key combination is pressed — the video is blanked and the
//      remote audio muted before the frame can be grabbed, the clipboard is
//      overwritten, and the other side is told. A recorder left running
//      captures a black rectangle and silence for as long as the guard holds.
//
// The proposed `MediaDevices.isScreenCaptured` fraud-prevention API (the
// screen-share/is-screen-captured explainer) is feature-detected below: it is
// not in any browser yet and is planned behind an allowlisted origin trial, so
// this stays inert today and starts shielding the call automatically on the
// day a browser ships it. See also LEXGO meeting security notes.

export type GuardTrip = "hidden" | "blur" | "key" | "capture";

type MediaDevicesWithCapture = MediaDevices & {
  isScreenCaptured?: boolean;
  onisscreencapturedchange?: ((this: MediaDevices, ev: Event) => unknown) | null;
};

// How long the shield stays up after the window comes back. A screenshot tool
// hands focus back the instant the shot is taken, so lifting immediately would
// re-expose the frame the user was aiming at.
const HOLD_MS = 1400;

function isShotKey(e: KeyboardEvent): boolean {
  const k = e.key;
  if (k === "PrintScreen" || k === "Snapshot" || e.code === "PrintScreen") return true;
  // Windows: Win+Shift+S (Snip & Sketch). macOS: Cmd+Shift+3/4/5.
  if (e.shiftKey && (e.metaKey || e.ctrlKey) && (k === "S" || k === "s" || k === "3" || k === "4" || k === "5")) return true;
  return false;
}

/**
 * Blanks the meeting while anything that accompanies a screen capture is
 * happening. `onTrip` fires once per trip so the caller can tell the room.
 */
export function useCaptureGuard(enabled: boolean, onTrip?: (why: GuardTrip) => void) {
  const [trip, setTrip] = useState<GuardTrip | "">("");
  // A detected screen capture is not a moment, it is a state: it holds the
  // shield up until it stops, unlike the timed trips.
  const [captured, setCaptured] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onTripRef = useRef(onTrip);
  useEffect(() => { onTripRef.current = onTrip; }, [onTrip]);

  const fire = useCallback((why: GuardTrip) => {
    setTrip((cur) => {
      if (cur !== why) onTripRef.current?.(why);
      return why;
    });
    clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => setTrip(""), HOLD_MS);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onVis = () => { if (document.visibilityState === "hidden") fire("hidden"); };
    // window.blur also fires when focus moves into a same-page iframe — the
    // OnlyOffice editor the meeting floats over does exactly that, and tripping
    // the shield every time the advocate clicks into the document would make
    // the guard unusable. document.hasFocus() is still true in that case and
    // false only when another window or a screenshot overlay took focus, so the
    // decision is deferred one tick and taken on that.
    let blurT: ReturnType<typeof setTimeout> | undefined;
    const onBlur = () => {
      clearTimeout(blurT);
      blurT = setTimeout(() => { if (!document.hasFocus()) fire("blur"); }, 60);
    };
    const onFocus = () => {
      // Hold briefly rather than clearing here: see HOLD_MS.
      clearTimeout(blurT);
      clearTimeout(holdRef.current);
      holdRef.current = setTimeout(() => setTrip(""), HOLD_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isShotKey(e)) return;
      fire("key");
      // PrintScreen writes the frame to the clipboard without the page ever
      // seeing a copy event; overwriting it is the only reach we have, and it
      // needs the document focused, which it still is at keydown time.
      try { void navigator.clipboard?.writeText(" "); } catch { /* denied — the shield still fired */ }
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);

    // Not shipped anywhere yet — wired so the call hardens itself the day it is.
    const md = navigator.mediaDevices as MediaDevicesWithCapture | undefined;
    let offCapture: (() => void) | undefined;
    if (md && "isScreenCaptured" in md) {
      const sync = () => {
        const on = md.isScreenCaptured === true;
        setCaptured(on);
        if (on) onTripRef.current?.("capture");
      };
      // Not straight from the effect body: an immediate setState there is a
      // cascading render, and the initial value is only interesting one tick in.
      const t0 = setTimeout(sync, 0);
      md.addEventListener("isscreencapturedchange", sync);
      offCapture = () => { clearTimeout(t0); md.removeEventListener("isscreencapturedchange", sync); };
    }

    return () => {
      clearTimeout(holdRef.current);
      clearTimeout(blurT);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      offCapture?.();
    };
  }, [enabled, fire]);

  // Derived, not reset in an effect: with the room closed or backgrounded the
  // hook simply reports nothing rather than racing a state update.
  const on = enabled && captured;
  const why: GuardTrip | "" = !enabled ? "" : on ? "capture" : trip;
  return { shielded: why !== "", reason: why, captured: on };
}

/**
 * Per-viewer watermark tiled over the video. `label` identifies the person
 * looking at the screen, so a leaked frame names its source. The tile origin
 * moves every few seconds: a fixed overlay can be cropped away, a moving one
 * cannot without cropping the picture itself.
 */
export function MeetingWatermark({ label, clock = true }: { label: string; clock?: boolean }) {
  const [shift, setShift] = useState(0);
  const [now, setNow] = useState("");
  useEffect(() => {
    const iv = setInterval(() => setShift((s) => (s + 1) % 4), 4000);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!clock) return;
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [clock]);
  if (!label) return null;
  const text = clock && now ? `${label} · ${now}` : label;
  // 12 tiles is enough to cover a 16:9 stage at any size the meeting uses; the
  // row offset alternates so the grid reads as diagonal rather than as columns.
  return (
    <div className="mtg__wm" aria-hidden data-shift={shift}>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="mtg__wm-t" style={{ marginLeft: `${((i % 3) + shift) * 6}%` }}>{text}</span>
      ))}
    </div>
  );
}

/** The blackout itself. Rendered inside the stage, above every tile. */
export function CaptureShield({ reason, title, lead, note }: { reason: GuardTrip | ""; title: string; lead: string; note: string }) {
  if (!reason) return null;
  return (
    <div className="mtg__shield" role="alert" data-reason={reason}>
      <div className="mtg__shield-m">
        <b>{title}</b>
        <span>{lead}</span>
        <small>{note}</small>
      </div>
    </div>
  );
}
