"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { FileText, ImagePlus, Upload, X } from "lucide-react";
import type { TaskUploadLimits } from "@/lib/services/taskManagement";
import { sizeOf } from "./attachmentImages";
import { STROKE, useTaskText } from "./parts";

// Images and files chosen for a task before it is saved — several at once,
// by button, drag and drop or paste — held locally and uploaded in one
// multipart call after the task exists (POST /task-management/{id}/attachments).
// Every limit comes from GET /task-management/meta.

export type PickedFile = { id: string; file: File; url: string; image: boolean };
export type PickReject = { name: string; why: "type" | "size" | "count" };

const mb = (n: number) => `${Math.round((n / 1048576) * 10) / 10} MB`;
const extOf = (name: string) => (/\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? "");
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function usePickedFiles(limits: TaskUploadLimits) {
  const [items, setItems] = useState<PickedFile[]>([]);
  const [rejected, setRejected] = useState<PickReject[]>([]);
  // Object URLs live as long as their thumbnail; the rest go with the form.
  const live = useRef<PickedFile[]>([]);
  useEffect(() => {
    live.current = items;
  }, [items]);
  useEffect(() => () => live.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  const add = (files: File[]) => {
    const out: PickedFile[] = [];
    const bad: PickReject[] = [];
    const seen = new Set(items.map((p) => `${p.file.name}|${p.file.size}|${p.file.lastModified}`));
    for (const f of files) {
      const key = `${f.name}|${f.size}|${f.lastModified}`;
      if (seen.has(key)) continue;
      // A pasted screenshot arrives as "image.png"; anything else keeps its name.
      const ext = extOf(f.name) || (f.type === "image/png" ? ".png" : f.type === "image/jpeg" ? ".jpg" : "");
      if (!limits.extensions.includes(ext)) bad.push({ name: f.name, why: "type" });
      else if (f.size > limits.maxBytes) bad.push({ name: f.name, why: "size" });
      else if (items.length + out.length >= limits.maxCount) bad.push({ name: f.name, why: "count" });
      else {
        const image = IMAGE_EXT.has(ext);
        seen.add(key);
        out.push({ id: `${key}|${Math.random().toString(36).slice(2)}`, file: f, url: image ? URL.createObjectURL(f) : "", image });
      }
    }
    setRejected(bad);
    if (out.length) setItems((cur) => [...cur, ...out]);
  };
  const remove = (id: string) => {
    setItems((cur) => {
      const gone = cur.find((p) => p.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return cur.filter((p) => p.id !== id);
    });
    setRejected([]);
  };
  return { items, rejected, add, remove };
}

export default function TaskFilePicker({
  picked,
  limits,
  disabled,
  error,
}: {
  picked: ReturnType<typeof usePickedFiles>;
  limits: TaskUploadLimits;
  disabled?: boolean;
  error?: string;
}) {
  const { t } = useTaskText();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const full = picked.items.length >= limits.maxCount;
  const kinds = limits.extensions.map((e) => e.slice(1).toUpperCase());
  const imageKinds = kinds.filter((k) => IMAGE_EXT.has(`.${k.toLowerCase()}`));

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    picked.add(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="ttk-up">
      <span className="ttk-form__lbl ttk-lbl" id={`${uid}-l`}>
        <ImagePlus aria-hidden strokeWidth={STROKE} />
        {t("upload.label")}
        <span className="ttk-up__n">{t("upload.count", { n: picked.items.length, max: limits.maxCount })}</span>
      </span>
      <div
        className={`ttk-up__drop${over ? " is-over" : ""}${full ? " is-full" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input
          ref={input}
          id={`${uid}-i`}
          type="file"
          multiple={limits.multiple}
          accept={limits.extensions.join(",")}
          hidden
          onChange={(e) => {
            picked.add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="ttk-up__ic" aria-hidden="true">
          <Upload strokeWidth={STROKE} />
        </span>
        <span className="ttk-up__t">
          <button type="button" className="ttk-up__btn" onClick={() => input.current?.click()} disabled={disabled || full} aria-describedby={`${uid}-h`}>
            {full ? t("upload.full", { max: limits.maxCount }) : t("upload.pick")}
          </button>
          <small id={`${uid}-h`}>
            {t("upload.hint", { images: imageKinds.join(", "), size: mb(limits.maxBytes) })}
            <span className="ttk-up__kinds" title={kinds.join(", ")}>
              {" "}
              · {t("upload.alsoFiles")}
            </span>
          </small>
        </span>
      </div>
      {picked.items.length ? (
        <ul className="ttk-up__grid" aria-labelledby={`${uid}-l`}>
          {picked.items.map((p) => (
            <li key={p.id} className={p.image ? "ttk-up__th" : "ttk-up__th ttk-up__th--file"}>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL of the chosen file
                <img src={p.url} alt={p.file.name} />
              ) : (
                <span className="ttk-up__doc" aria-hidden="true">
                  <FileText strokeWidth={STROKE} />
                  <b>{extOf(p.file.name).slice(1).toUpperCase()}</b>
                </span>
              )}
              <span className="ttk-up__cap">
                <span title={p.file.name}>{p.file.name}</span>
                <small>{sizeOf(p.file.size)}</small>
              </span>
              <button type="button" className="ttk-up__x" onClick={() => picked.remove(p.id)} disabled={disabled} aria-label={t("upload.remove", { name: p.file.name })} title={t("upload.remove", { name: p.file.name })}>
                <X aria-hidden strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked.rejected.length ? (
        <ul className="ttk-up__bad" role="alert">
          {picked.rejected.map((r, i) => (
            <li key={`${r.name}-${i}`}>{t(`upload.why.${r.why}`, { name: r.name, size: mb(limits.maxBytes), max: limits.maxCount })}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="cform__bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
