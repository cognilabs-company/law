"use client";

import { useState } from "react";
import type { Task } from "@/lib/services/taskManagement";
import Sheet from "../panel/Sheet";
import { Field, Note, PanelFoot } from "../panel/bits";
import { IcArchive, IcTrash, IcUndo } from "./icons";
import { useTx } from "./text";

export type ReasonKind = "return" | "delete" | "approve";

export default function ReasonSheet({ kind, task, onClose, onSubmit }: { kind: ReasonKind; task: Task; onClose: () => void; onSubmit: (text: string) => Promise<string | null> }) {
  const { t } = useTx();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState("");
  const empty = !text.trim();
  const title = t(`${kind}Title`, { code: task.code });
  const confirm = kind === "return" ? t("act.return") : kind === "approve" ? t("approve") : t("delete");
  const msg = err || (tried && empty ? t("reasonNeeded") : "");

  const submit = async () => {
    setTried(true);
    if (empty || busy) return;
    setBusy(true);
    setErr("");
    const fail = await onSubmit(text);
    setBusy(false);
    if (fail) setErr(fail);
  };

  return (
    <Sheet
      label={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      dirty={!empty}
      head={
        <div className="opx-tk-shead" data-tone={kind === "delete" ? "hot" : kind === "return" ? "warn" : "ok"}>
          <span className="opx-tk-shead__ic" aria-hidden="true">
            {kind === "delete" ? <IcTrash size={20} /> : kind === "approve" ? <IcArchive size={20} /> : <IcUndo size={20} />}
          </span>
          <span className="opx-tk-shead__t">
            <b>{title}</b>
            <small>{task.title}</small>
          </span>
        </div>
      }
    >
      <div className="opx-pscroll opx-tk-form">
        <Note tone={kind === "approve" ? "info" : "warn"}>{t(`${kind}Lead`)}</Note>
        <Field
          label={t(`${kind}Label`)}
          value={text}
          onChange={(v) => {
            setText(v);
            if (err) setErr("");
          }}
          max={2000}
          multiline
          rows={4}
          required
          error={msg || undefined}
        />
      </div>
      <PanelFoot
        extra={
          <button type="button" className="opx-pbtn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
        }
        primary={() => void submit()}
        primaryLabel={confirm}
        busy={busy}
        danger={kind === "delete"}
      />
    </Sheet>
  );
}
