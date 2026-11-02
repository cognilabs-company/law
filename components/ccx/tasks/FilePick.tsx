"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import type { TaskUploadLimits } from "@/lib/services/taskManagement";
import type { usePickedFiles } from "@/components/tasks/TaskFilePicker";
import { sizeOf } from "@/components/tasks/attachmentImages";
import { IcClose, IcDoc } from "../icons";
import { IcUpload } from "./icons";
import { extOf, IMAGE_EXT, mb } from "./model";
import { useTx } from "./text";

type Picked = ReturnType<typeof usePickedFiles>;

export default function FilePick({ picked, limits, disabled, error }: { picked: Picked; limits: TaskUploadLimits; disabled?: boolean; error?: string }) {
  const { t } = useTx();
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
    <div className="opx-tk-up">
      <span className="opx-tk-lbl" id={`${uid}-l`}>
        {t("upload.label")}
        <small className="opx-num">{t("upload.count", { n: picked.items.length, max: limits.maxCount })}</small>
      </span>
      <div
        className="opx-tk-up__drop"
        data-over={over || undefined}
        data-full={full || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input
          ref={input}
          type="file"
          multiple={limits.multiple}
          accept={limits.extensions.join(",")}
          hidden
          onChange={(e) => {
            picked.add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="opx-tk-up__ic" aria-hidden="true">
          <IcUpload size={22} />
        </span>
        <span className="opx-tk-up__t">
          <button type="button" onClick={() => input.current?.click()} disabled={disabled || full} aria-describedby={`${uid}-h`}>
            {full ? t("upload.full", { max: limits.maxCount }) : t("upload.pick")}
          </button>
          <small id={`${uid}-h`}>
            {t("upload.hint", { images: imageKinds.join(", "), size: mb(limits.maxBytes) })}
            <span title={kinds.join(", ")}> · {t("upload.alsoFiles")}</span>
          </small>
        </span>
      </div>
      {picked.items.length ? (
        <ul className="opx-tk-up__grid" aria-labelledby={`${uid}-l`}>
          {picked.items.map((p) => (
            <li key={p.id} data-kind={p.image ? "img" : "file"}>
              {p.image ? (
                <span className="opx-tk-up__pic">
                  <Image src={p.url} alt={p.file.name} fill sizes="96px" unoptimized />
                </span>
              ) : (
                <span className="opx-tk-up__doc" aria-hidden="true">
                  <IcDoc size={20} />
                  <b>{extOf(p.file.name).slice(1).toUpperCase()}</b>
                </span>
              )}
              <span className="opx-tk-up__cap">
                <span title={p.file.name}>{p.file.name}</span>
                <small className="opx-num">{sizeOf(p.file.size)}</small>
              </span>
              <button type="button" className="opx-tk-up__x" onClick={() => picked.remove(p.id)} disabled={disabled} aria-label={t("upload.remove", { name: p.file.name })} title={t("upload.remove", { name: p.file.name })}>
                <IcClose size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {picked.rejected.length ? (
        <ul className="opx-tk-up__bad" role="alert">
          {picked.rejected.map((r, i) => (
            <li key={`${r.name}-${i}`}>{t(`upload.why.${r.why}`, { name: r.name, size: mb(limits.maxBytes), max: limits.maxCount })}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="opx-ferr" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
