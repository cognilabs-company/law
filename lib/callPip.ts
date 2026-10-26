// A call's small always-on-top window (Document Picture-in-Picture), the
// way Google Meet keeps the call in view when you switch tabs or apps.
// Chromium opens it by itself when the tab is hidden during a call (the
// Media Session "enterpictureinpicture" action); the call room can also open
// it from a button. The window gets a copy of this page's styles; the call
// room renders into it through a portal, so the call itself never moves.

type PipApi = {
  requestWindow: (o?: { width?: number; height?: number; disallowReturnToOpener?: boolean }) => Promise<Window>;
  window: Window | null;
};

const api = (): PipApi | null => (typeof window !== "undefined" ? ((window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null) : null);

export const callPipSupported = (): boolean => !!api();

// Styles, theme and font classes, so the window looks like the page.
function copyLook(to: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = to.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      to.head.appendChild(style);
    } catch {
      // Cross-origin sheet: link it instead.
      if (!sheet.href) continue;
      const link = to.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      to.head.appendChild(link);
    }
  }
  const html = document.documentElement;
  to.documentElement.className = html.className;
  for (const a of ["lang", "data-theme", "style"]) {
    const v = html.getAttribute(a);
    if (v != null) to.documentElement.setAttribute(a, v);
  }
  to.body.className = `${document.body.className} mtgpip-doc`;
}

// Opens the window (null when the browser has none or refuses). Needs a user
// gesture, or the browser's own automatic request.
export async function openCallPip(width = 400, height = 300): Promise<Window | null> {
  const pip = api();
  if (!pip) return null;
  if (pip.window) return pip.window;
  try {
    const win = await pip.requestWindow({ width, height });
    copyLook(win.document);
    win.document.title = document.title;
    return win;
  } catch {
    return null;
  }
}

// Lets the browser open the window by itself when the tab is hidden during a
// call. Returns the undo.
export function onAutoCallPip(open: () => void): () => void {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms || !api()) return () => {};
  const action = "enterpictureinpicture" as MediaSessionAction;
  try {
    ms.setActionHandler(action, open);
  } catch {
    return () => {};
  }
  return () => {
    try {
      ms.setActionHandler(action, null);
    } catch {
      /* ignore */
    }
  };
}
