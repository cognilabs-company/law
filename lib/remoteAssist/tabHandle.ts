// Which browser tab a screen share captured. Each LexGo tab names itself
// through the Capture Handle API (Chromium), so after the client shares, the
// captured track says which tab it is: remote assistance only accepts the
// client's own tab, and the operator never renders a capture of their own
// tab — a tab showing its own capture is an endless mirror that crashes it.
// Browsers without the API report no handle; then nothing is refused.

type HandleConfig = { handle: string; permittedOrigins: string[]; exposeOrigin: boolean };
type WithHandleConfig = MediaDevices & { setCaptureHandleConfig?: (c: HandleConfig) => void };
type WithCaptureHandle = MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } | null };

let own = "";
let claimed = false;

export function raTabHandle(): string {
  if (!own) own = `lexgo-tab-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  return own;
}

// Name this tab once (top-level documents only; ignored elsewhere).
export function claimRaTabHandle(): void {
  if (claimed || typeof navigator === "undefined") return;
  claimed = true;
  try {
    (navigator.mediaDevices as WithHandleConfig | undefined)?.setCaptureHandleConfig?.({ handle: raTabHandle(), permittedOrigins: ["*"], exposeOrigin: false });
  } catch {
    /* not supported, or not top-level */
  }
}

// The handle of the tab a track captured, or "" when unknown.
export function capturedTabOf(track: MediaStreamTrack | undefined): string {
  try {
    return (track as WithCaptureHandle | undefined)?.getCaptureHandle?.()?.handle ?? "";
  } catch {
    return "";
  }
}

// A share of another tab: known handle that isn't ours.
export const raOtherTab = (captured: string): boolean => !!captured && captured !== raTabHandle();
