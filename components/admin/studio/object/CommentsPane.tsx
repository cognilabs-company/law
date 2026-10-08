"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import type { StudioComment, StudioVersion } from "@/lib/services/studio";
import { StudioErrorNote, useStudioText } from "../bits";
import { newestFirst } from "./model";
import { VersionBadge } from "./ui";
import { IconChatDots, IconSend } from "@/components/icons";

export default function CommentsPane({
  comments,
  error,
  versions,
  canComment,
  sending,
  onRetry,
  onAdd,
}: {
  comments: StudioComment[] | null;
  error: unknown;
  versions: StudioVersion[];
  canComment: boolean;
  sending: boolean;
  onRetry: () => void;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const { t, when, role } = useStudioText();
  const uid = useId();
  const [text, setText] = useState("");

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const v = text.trim();
    if (!v || sending) return;
    if (await onAdd(v)) setText("");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const list = comments ? newestFirst(comments) : [];
  const verOf = (id: string) => versions.find((v) => v.id === id)?.version ?? "";

  return (
    <div className="stu-opane" data-ai-id="admin.studio.editor.comments" data-ai-type="section" data-ai-label={t("editor.side.comments")}>
      {canComment ? (
        <form className="stu-ocmtf" onSubmit={submit}>
          <label htmlFor={`${uid}-c`} className="sr-only">
            {t("editor.comments.label")}
          </label>
          <textarea
            id={`${uid}-c`}
            rows={3}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("editor.comments.placeholder")}
            disabled={sending}
            data-ai-id="admin.studio.editor.comments.input"
            data-ai-type="textarea"
            data-ai-label={t("editor.comments.label")}
          />
          <div className="stu-ocmtf__row">
            <small>{t("editor.comments.hint")}</small>
            <button type="submit" className="btn btn--pri btn--sm" disabled={sending || !text.trim()} data-ai-id="admin.studio.editor.comments.send" data-ai-type="button" data-ai-label={t("actions.send")}>
              {sending ? <span className="stu-spin" aria-hidden /> : <IconSend aria-hidden />}
              {t("actions.send")}
            </button>
          </div>
        </form>
      ) : null}
      {error && !comments ? <StudioErrorNote error={error} onRetry={onRetry} compact /> : null}
      {comments === null && !error ? <p className="stu-opane__empty">{t("common.loading")}</p> : null}
      {comments && !list.length ? (
        <div className="stu-opane__none">
          <IconChatDots aria-hidden />
          <p>{t("editor.comments.empty")}</p>
        </div>
      ) : null}
      {list.length ? (
        <ul className="stu-ocmts">
          {list.map((c, i) => {
            const ver = c.versionId ? verOf(c.versionId) : "";
            return (
              <li key={c.id || `${c.createdAt}-${i}`} className="stu-ocmt">
                <span className="stu-ocmt__av" aria-hidden>
                  {(c.author || "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className="stu-ocmt__m">
                  <div className="stu-ocmt__top">
                    <b>{c.author || t("editor.comments.someone")}</b>
                    {c.authorRole ? <span className="stu-ocmt__role">{role(c.authorRole)}</span> : null}
                    {ver ? <VersionBadge version={ver} /> : null}
                  </div>
                  <p>{c.text}</p>
                  {c.createdAt ? <small>{when(c.createdAt)}</small> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
