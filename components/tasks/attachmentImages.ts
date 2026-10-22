import { useEffect, useState } from "react";
import { getTaskAttachmentBlob, type TaskAttachment } from "@/lib/services/taskManagement";

// Task attachment images, fetched with the signed-in user's token (their
// preview_url is an API path, not a public link) and shown from object URLs.

// One fetch per file while the page is open: the thumbnail and the viewer
// share it, and a background refetch of the task does not refetch images.
const blobs = new Map<string, Promise<Blob>>();
export function loadBlob(a: TaskAttachment): Promise<Blob> {
  const key = `${a.id}|${a.previewUrl}`;
  let p = blobs.get(key);
  if (!p) {
    p = getTaskAttachmentBlob(a.previewUrl).then((b) => {
      if (!b.size) throw new Error("empty");
      return b;
    });
    p.catch(() => blobs.delete(key));
    blobs.set(key, p);
  }
  return p;
}

export type Shown = { status: "loading" | "ready" | "error"; url: string };

// An image attachment as an object URL, revoked when it is no longer shown.
export function useImage(a: TaskAttachment, tick: number): Shown {
  const [shown, setShown] = useState<{ key: string; s: Shown }>({ key: "", s: { status: "loading", url: "" } });
  const key = `${a.id}|${a.previewUrl}|${tick}`;
  useEffect(() => {
    let alive = true;
    let made = "";
    loadBlob(a).then(
      (b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setShown({ key, s: { status: "ready", url: made } });
      },
      () => alive && setShown({ key, s: { status: "error", url: "" } }),
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown.key === key ? shown.s : { status: "loading", url: "" };
}

export const sizeOf = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : n > 0 ? `${n} B` : "");
