// Client-side handling of files fetched as blobs (generated contracts/
// documents from authed backend routes — PDF or DOCX, the backend decides
// which per template). A backend file response is never turned into a plain
// link: it is fetched with the bearer token, then saved or shown from a
// short-lived object URL.

const REVOKE_MS = 60_000;

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
// A file's mime type from its name's extension — used only as a fallback
// when the backend's own metadata omits `mime_type` (rare; it normally sends
// the right one). Better than assuming one fixed format, now that generated
// documents can be PDF or DOCX depending on the template.
export function mimeFromName(name: string, fallback = "application/octet-stream"): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || fallback;
}

const MIME_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_MIME).map(([ext, mime]) => [mime, ext]));
// The inverse of mimeFromName — a plain extension ("pdf", "docx"…) from a
// mime type, for building a file name before any bytes have been fetched.
export function extFromMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] || "";
}

const withType = (blob: Blob, type: string) => (blob.type ? blob : new Blob([blob], { type }));

// Save a blob under `fileName`. The object URL is revoked later: revoking
// right after click() can cancel the download in some browsers.
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(withType(blob, mimeFromName(fileName)));
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
  const url = URL.createObjectURL(withType(blob, mimeFromName(fileName)));
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
export function base64Blob(b64: string | undefined, type = "application/octet-stream"): Blob | null {
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
