"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../../editor/sx-editor-panels.css";
import "./sx-review.css";
import "../sx-ap3.css";
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { studioErrorOf, type StudioVersion } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { TextArea } from "../../form/TextArea";
import { SxNote } from "../../layout/Note";
import { useStudioLabels } from "../../useStudioLabels";
import { MessageSquareTextIcon, SendIcon, glyph } from "../../icons";
import { commentText, isSendKey } from "../../editor/drawer/CommentsTab";
import { useEditorErrorText } from "../../editor/useEditorErrorText";
import { initials, newestFirst, roleName } from "../../editor/model";
import type { ReviewComments } from "./useReview";

export type CommentsProps = { state: ReviewComments; canWrite: boolean; versions: readonly StudioVersion[]; onSend: (text: string) => Promise<boolean>; onRetry: () => void };

export const COMMENT_MAX = 2000;

export function Comments({ state, canWrite, versions, onSend, onRetry }: CommentsProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const uid = useId();
  const [text, setText] = useState("");
  const { items, error, sending, sendError } = state;
  const list = items ? newestFirst(items) : [];
  const verOf = (id: string) => versions.find((v) => v.id === id)?.version ?? "";
  const inputId = `${uid}-c`;
  const hintId = `${uid}-h`;
  const errId = `${uid}-e`;
  const failed = !!sendError && !sending;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const v = text.trim();
    if (!v || sending) return;
    if (await onSend(v)) setText("");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSendKey(e)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="sx-ed-cmt sx-rv-cmt">
      {canWrite ? (
        <form className="sx-ed-cmt__form" onSubmit={send}>
          <label className="sx-vh" htmlFor={inputId}>
            {t("sx.editor.comments.label")}
          </label>
          <TextArea
            id={inputId}
            value={text}
            onChange={setText}
            onKeyDown={onKey}
            maxLength={COMMENT_MAX}
            minRows={2}
            maxRows={8}
            placeholder={t("sx.editor.comments.placeholder")}
            disabled={sending}
            invalid={failed}
            aria-describedby={failed ? `${hintId} ${errId}` : hintId}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            aiId="admin.studio.approvals.drawer.comment.input"
            aiLabel={t("sx.editor.comments.label")}
          />
          {failed ? (
            <p id={errId} className="sx-rv-err" role="alert" data-code={studioErrorOf(sendError).code || undefined}>
              {t("sx.appr.err.commentSend")}
            </p>
          ) : null}
          <div className="sx-ed-cmt__row">
            <p className="sx-ed-cmt__hint" id={hintId}>
              {t("sx.editor.comments.hint")}
            </p>
            <SxButton type="submit" variant="primary" size="sm" icon={SendIcon} busy={sending} disabled={!sending && !text.trim()} aiId="admin.studio.approvals.drawer.comment.send">
              {t("sx.editor.comments.send")}
            </SxButton>
          </div>
        </form>
      ) : null}
      {error && !items ? (
        <SxNote
          tone="error"
          title={errText(error).title}
          action={
            <SxButton variant="ghost" size="sm" onClick={onRetry} aiId="admin.studio.approvals.drawer.comments.retry">
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {t("sx.ui.loadFail")}
        </SxNote>
      ) : null}
      {items === null && !error ? (
        <div className="sx-ed-cmt__sk" aria-busy="true">
          <span className="sx-vh">{t("sx.ui.loading")}</span>
          <span className="sx-sk" aria-hidden="true" />
          <span className="sx-sk" aria-hidden="true" />
        </div>
      ) : null}
      {items && !list.length ? (
        <div className="sx-ed-none sx-rv-none">
          {glyph(MessageSquareTextIcon, { size: 24 })}
          <p>{t("sx.editor.comments.empty")}</p>
        </div>
      ) : null}
      {list.length ? (
        <ul className="sx-ed-cmt__list">
          {list.map((c, i) => {
            const ver = c.versionId ? verOf(c.versionId) : "";
            const who = c.author || t("sx.editor.comments.someone");
            const role = roleName(labels, c.authorRole);
            const gone = c.raw.is_deleted === true || (typeof c.raw.deleted_at === "string" && !!c.raw.deleted_at);
            const edited = !gone && (c.raw.is_edited === true || (typeof c.raw.edited_at === "string" && !!c.raw.edited_at));
            return (
              <li key={c.id || `${c.createdAt}-${i}`} className="sx-ed-cmt__item" data-deleted={gone ? "" : undefined}>
                <span className="sx-ed-av" aria-hidden="true">
                  {initials(c.author || "?")}
                </span>
                <div className="sx-ed-cmt__body">
                  <div className="sx-ed-cmt__top">
                    <span className="sx-ed-cmt__who">{who}</span>
                    {role ? <span className="sx-ed-cmt__role">{role}</span> : null}
                    {ver ? <span className="sx-code">{t("sx.editor.versionTag", { v: ver })}</span> : null}
                    {gone ? <span className="sx-ap3-tl__del">{t("sx.ap3.tl.deleted")}</span> : edited ? <span className="sx-ap3-cmt__ed">{t("sx.ap3.cmt.edited")}</span> : null}
                  </div>
                  <p className="sx-ed-cmt__text">{commentText(c.text, labels.stepDecision)}</p>
                  {c.createdAt ? (
                    <time className="sx-ed-cmt__when" dateTime={c.createdAt}>
                      {labels.dateTime(c.createdAt)}
                    </time>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
