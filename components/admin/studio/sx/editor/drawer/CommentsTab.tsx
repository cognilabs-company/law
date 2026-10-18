"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../sx-editor-panels.css";
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { SxButton } from "../../Button";
import { TextArea } from "../../form/TextArea";
import { SxNote } from "../../layout/Note";
import { useStudioLabels } from "../../useStudioLabels";
import { MessageSquareTextIcon, SendIcon, glyph } from "../../icons";
import type { EditorState } from "../useEditorState";
import { useEditorErrorText } from "../useEditorErrorText";
import { initials, newestFirst, roleName } from "../model";

const DECISION_WORD = /^(approve|approved|reject|rejected|changes_requested|request_changes|publish|published)$/i;
const MAX = 2000;

export function commentText(text: string, decision: (raw: string) => string): string {
  const v = text.trim();
  return DECISION_WORD.test(v) ? decision(v) : text;
}

export function isSendKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

export function CommentsTab({ st }: { st: EditorState }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const uid = useId();
  const [text, setText] = useState("");
  const sending = st.busy === "comment";
  const { items, error } = st.comments;
  const list = items ? newestFirst(items) : [];
  const versions = st.detail?.versions ?? [];
  const verOf = (id: string) => versions.find((v) => v.id === id)?.version ?? "";
  const inputId = `${uid}-c`;
  const hintId = `${uid}-h`;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const v = text.trim();
    if (!v || sending) return;
    if (await st.addComment(v)) setText("");
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSendKey(e)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="sx-ed-cmt" data-ai-id="admin.studio.editor.comments" data-ai-type="section" data-ai-label={t("sx.editor.tab.comments")}>
      {st.can.comment ? (
        <form className="sx-ed-cmt__form" onSubmit={send}>
          <label className="sx-vh" htmlFor={inputId}>
            {t("sx.editor.comments.label")}
          </label>
          <TextArea
            id={inputId}
            value={text}
            onChange={setText}
            onKeyDown={onKey}
            maxLength={MAX}
            minRows={3}
            maxRows={8}
            placeholder={t("sx.editor.comments.placeholder")}
            disabled={sending}
            aria-describedby={hintId}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            aiId="admin.studio.editor.comments.input"
            aiLabel={t("sx.editor.comments.label")}
          />
          <div className="sx-ed-cmt__row">
            <p className="sx-ed-cmt__hint" id={hintId}>
              {t("sx.editor.comments.hint")}
            </p>
            <SxButton type="submit" variant="primary" size="sm" icon={SendIcon} busy={sending} disabled={!sending && !text.trim()} aiId="admin.studio.editor.comments.send">
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
            <SxButton variant="ghost" size="sm" onClick={st.reloadComments}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {errText(error).text}
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
        <div className="sx-ed-none">
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
            return (
              <li key={c.id || `${c.createdAt}-${i}`} className="sx-ed-cmt__item">
                <span className="sx-ed-av" aria-hidden="true">
                  {initials(c.author || "?")}
                </span>
                <div className="sx-ed-cmt__body">
                  <div className="sx-ed-cmt__top">
                    <span className="sx-ed-cmt__who">{who}</span>
                    {role ? <span className="sx-ed-cmt__role">{role}</span> : null}
                    {ver ? <span className="sx-code">{t("sx.editor.versionTag", { v: ver })}</span> : null}
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
