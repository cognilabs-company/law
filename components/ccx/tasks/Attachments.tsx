"use client";

import { useState } from "react";
import Image from "next/image";
import { saveBlob } from "@/lib/download";
import { downloadTaskAttachment, type TaskAttachment } from "@/lib/services/taskManagement";
import { sizeOf, useImage } from "@/components/tasks/attachmentImages";
import { IcDoc, IcRefresh } from "../icons";
import { IcDownload, IcImageOff, IcSpin } from "./icons";
import { useTx } from "./text";

function Thumb({ a, onOpen }: { a: TaskAttachment; onOpen: () => void }) {
  const { t } = useTx();
  const [tick, setTick] = useState(0);
  const img = useImage(a, tick);
  const [broken, setBroken] = useState("");
  const bad = img.status === "error" || (img.url !== "" && broken === img.url);
  return (
    <li className="opx-tk-th" data-state={bad ? "bad" : img.status}>
      {bad ? (
        <div className="opx-tk-th__fail" role="group" aria-label={a.fileName}>
          <IcImageOff size={20} />
          <span>{t("attachments.error")}</span>
          <button
            type="button"
            onClick={() => {
              setBroken("");
              setTick((n) => n + 1);
            }}
          >
            <IcRefresh size={14} />
            {t("retry")}
          </button>
        </div>
      ) : (
        <button type="button" className="opx-tk-th__open" onClick={onOpen} aria-label={t("attachments.open", { name: a.fileName })} title={a.note || a.fileName} disabled={img.status !== "ready"}>
          {img.status === "ready" ? (
            <Image src={img.url} alt={a.note || a.fileName} fill sizes="160px" unoptimized onError={() => setBroken(img.url)} />
          ) : (
            <span className="opx-shim opx-tk-th__sk" role="status" aria-label={t("attachments.loading")} />
          )}
        </button>
      )}
      <span className="opx-tk-th__cap" title={a.fileName}>
        {a.fileName}
      </span>
    </li>
  );
}

function FileRow({ a }: { a: TaskAttachment }) {
  const { t } = useTx();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const get = async () => {
    if (busy || !a.downloadUrl) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await downloadTaskAttachment(a.downloadUrl);
      saveBlob(r.blob, r.name || a.fileName);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="opx-tk-frow">
      <span className="opx-tk-frow__ic" aria-hidden="true">
        <IcDoc size={18} />
      </span>
      <span className="opx-tk-frow__txt">
        <b title={a.fileName}>{a.fileName}</b>
        <small data-bad={failed || undefined}>{failed ? t("attachments.downloadError") : [sizeOf(a.sizeBytes), a.note].filter(Boolean).join(" · ")}</small>
      </span>
      <button type="button" className="opx-tk-ibtn" onClick={() => void get()} disabled={busy || !a.downloadUrl} aria-label={t("attachments.downloadName", { name: a.fileName })} title={t("attachments.download")}>
        {busy ? <IcSpin size={17} /> : <IcDownload size={17} />}
      </button>
    </li>
  );
}

export default function Attachments({ attachments, count, loading, onOpen }: { attachments: TaskAttachment[] | null; count: number; loading: boolean; onOpen: (index: number) => void }) {
  const { t } = useTx();
  if (attachments === null) {
    if (!loading && count <= 0) return <p className="opx-pnone">{t("attachments.empty")}</p>;
    return (
      <ul className="opx-tk-thumbs" aria-busy="true">
        {Array.from({ length: Math.min(Math.max(count, 2), 6) }, (_, k) => (
          <li key={k} className="opx-tk-th" data-state="loading">
            <span className="opx-shim opx-tk-th__sk" />
          </li>
        ))}
      </ul>
    );
  }
  if (!attachments.length) return <p className="opx-pnone">{t("attachments.empty")}</p>;
  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);
  return (
    <>
      {images.length ? (
        <ul className="opx-tk-thumbs">
          {images.map((a, k) => (
            <Thumb key={a.id} a={a} onOpen={() => onOpen(k)} />
          ))}
        </ul>
      ) : null}
      {files.length ? (
        <ul className="opx-tk-files">
          {files.map((a) => (
            <FileRow key={a.id} a={a} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
