// Client-side handling of files fetched as blobs (PDFs from authed backend
// routes). A backend file response is never turned into a plain link: it is
// fetched with the bearer token, then saved or shown from a short-lived
// object URL.

const REVOKE_MS = 60_000;

const asPdf = (blob: Blob, type = "application/pdf") => (blob.type ? blob : new Blob([blob], { type }));

// Save a blob under `fileName`. The object URL is revoked later: revoking
// right after click() can cancel the download in some browsers.
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(asPdf(blob));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}

// Open a tab synchronously inside the click handler (a window.open after an
// await is blocked as a popup). Pass the result to showBlob / closeTab.
export function preopenTab(): Window | null {
  try {
    return window.open("", "_blank");
  } catch {
    return null;
  }
}

// Show a blob in a pre-opened tab; without one (popup blocked) save it instead.
export function showBlob(blob: Blob, fileName: string, win: Window | null): void {
  if (!win || win.closed) {
    saveBlob(blob, fileName);
    return;
  }
  const url = URL.createObjectURL(asPdf(blob));
  win.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}

export function closeTab(win: Window | null): void {
  try {
    win?.close();
  } catch {
    /* already gone */
  }
}

// Inline base64 payload (older contract/document responses) → Blob, or null.
export function base64Blob(b64: string | undefined, type = "application/pdf"): Blob | null {
  if (!b64) return null;
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

// Get a file via `fetcher` and open (download=false) or save it. Returns false
// when the fetch failed so the caller can show its own message.
export async function fetchAndDeliver(
  fetcher: () => Promise<Blob>,
  fileName: string,
  download: boolean,
): Promise<boolean> {
  const win = download ? null : preopenTab();
  try {
    const blob = await fetcher();
    if (download) saveBlob(blob, fileName);
    else showBlob(blob, fileName, win);
    return true;
  } catch {
    closeTab(win);
    return false;
  }
}
