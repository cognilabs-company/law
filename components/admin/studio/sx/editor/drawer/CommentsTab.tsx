"use client";

import "../../sx-core.css";
import "../../sx-form.css";
import "../sx-editor-panels.css";
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import IconButton from "@/components/ui/IconButton";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { SxButton } from "../../Button";
import { TextArea } from "../../form/TextArea";
import { SxNote } from "../../layout/Note";
import { useStudioLabels } from "../../useStudioLabels";
import { MessageSquareTextIcon, PencilIcon, SendIcon, Trash2Icon, glyph } from "../../icons";
import type { EditorState } from "../useEditorState";
import { useEditorErrorText } from "../useEditorErrorText";
import { initials, newestFirst, roleName } from "../model";
import { commentAllowed, type SxComment } from "../objectApi";

const DECISION_WORD = /^(approve|approved|reject|rejected|changes_requested|request_changes|publish|published)$/i;
const MAX = 2000;
const AI = "admin.studio.editor.comments";

export function commentText(text: string, decision: (raw: string) => string): string {
  const v = text.trim();
  return DECISION_WORD.test(v) ? decision(v) : text;
}

export function isSendKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

function EditBox({ st, comment, onDone }: { st: EditorState; comment: SxComment; onDone: () => void }): ReactElement {
  const t = useTranslations("studio");
  const uid = useId();
  const [text, setText] = useState(comment.text);
  const saving = st.busy === "comment";
  const changed = text.trim() !== comment.text.trim();

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || saving) return;
    if (!changed) {
      onDone();
      return;
    }
    if (await st.editComment(comment.id, text)) onDone();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSendKey(e)) {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDone();
    }
  }

  return (
    <form className="sx-ed-cmt__edit" onSubmit={save}>
      <label className="sx-vh" htmlFor={`${uid}-e`}>
        {t("sx.editor.comments.editLabel")}
      </label>
      <TextArea
        id={`${uid}-e`}
        value={text}
        onChange={setText}
        onKeyDown={onKey}
        maxLength={MAX}
        minRows={2}
        maxRows={8}
        disabled={saving}
        autoFocus
        aria-keyshortcuts="Control+Enter Meta+Enter Escape"
        aiId={`${AI}.edit.input`}
        aiLabel={t("sx.editor.comments.editLabel")}
      />
      <div className="sx-ed-cmt__edit-row">
        <SxButton variant="ghost" size="sm" onClick={onDone} disabled={saving} aiId={`${AI}.edit.cancel`}>
          {t("sx.ui.cancel")}
        </SxButton>
        <SxButton type="submit" variant="primary" size="sm" busy={saving} disabled={!saving && !text.trim()} aiId={`${AI}.edit.save`}>
          {t("sx.ui.save")}
        </SxButton>
      </div>
    </form>
  );
}

export function CommentsTab({ st }: { st: EditorState }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const errText = useEditorErrorText();
  const uid = useId();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState("");
  const sending = st.busy === "comment";
  const { items, error } = st.comments;
  const list = items ? newestFirst(items) : [];
  const versions = st.detail?.versions ?? [];
  const verOf = (id: string) => versions.find((v) => v.id === id)?.version ?? "";
  const inputId = `${uid}-c`;
  const hintId = `${uid}-h`;
  const admin = st.access.isAdmin;

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

  async function remove(c: SxComment) {
    await confirmDialog({
      title: t("sx.editor.comments.deleteTitle"),
      text: t("sx.editor.comments.deleteText"),
      confirmLabel: t("sx.editor.comments.delete"),
      cancelLabel: t("sx.ui.cancel"),
      tone: "danger",
      onConfirm: () => st.removeComment(c.id).then(() => undefined),
    });
  }

  return (
    <div className="sx-ed-cmt" data-ai-id={AI} data-ai-type="section" data-ai-label={t("sx.editor.tab.comments")}>
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
            aiId={`${AI}.input`}
            aiLabel={t("sx.editor.comments.label")}
          />
          <div className="sx-ed-cmt__row">
            <p className="sx-ed-cmt__hint" id={hintId}>
              {t("sx.editor.comments.hint")}
            </p>
            <SxButton type="submit" variant="primary" size="sm" icon={SendIcon} busy={sending && !editing} disabled={!sending && !text.trim()} aiId={`${AI}.send`}>
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
            const canEdit = st.can.comment && commentAllowed(c, "edit", st.me, admin);
            const canDelete = commentAllowed(c, "delete", st.me, admin);
            const isEditing = editing !== "" && editing === c.id && canEdit;
            return (
              <li key={c.id || `${c.createdAt}-${i}`} className="sx-ed-cmt__item" data-deleted={c.deleted ? "" : undefined}>
                <span className="sx-ed-av" aria-hidden="true">
                  {initials(c.author || "?")}
                </span>
                <div className="sx-ed-cmt__body">
                  <div className="sx-ed-cmt__top">
                    <span className="sx-ed-cmt__who">{who}</span>
                    {role ? <span className="sx-ed-cmt__role">{role}</span> : null}
                    {ver ? <span className="sx-code">{t("sx.editor.versionTag", { v: ver })}</span> : null}
                    {(canEdit || canDelete) && !isEditing ? (
                      <span className="sx-ed-cmt__acts">
                        {canEdit ? (
                          <IconButton
                            className="sx-ibtn"
                            size="sm"
                            label={t("sx.editor.comments.edit")}
                            icon={glyph(PencilIcon, { size: 15 })}
                            disabled={sending}
                            onClick={() => setEditing(c.id)}
                            aiId={`${AI}.item.edit`}
                          />
                        ) : null}
                        {canDelete ? (
                          <IconButton
                            className="sx-ibtn"
                            size="sm"
                            variant="danger"
                            label={t("sx.editor.comments.delete")}
                            icon={glyph(Trash2Icon, { size: 15 })}
                            disabled={sending}
                            onClick={() => void remove(c)}
                            aiId={`${AI}.item.delete`}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  {c.deleted ? (
                    <p className="sx-ed-cmt__text" data-deleted="">
                      {c.deletedBy ? t("sx.editor.comments.deletedBy", { name: c.deletedBy }) : t("sx.editor.comments.deleted")}
                    </p>
                  ) : isEditing ? (
                    <EditBox st={st} comment={c} onDone={() => setEditing("")} />
                  ) : (
                    <p className="sx-ed-cmt__text">{commentText(c.text, labels.stepDecision)}</p>
                  )}
                  {c.createdAt ? (
                    <span className="sx-ed-cmt__meta">
                      <time className="sx-ed-cmt__when" dateTime={c.createdAt}>
                        {labels.dateTime(c.createdAt)}
                      </time>
                      {c.editedAt && !c.deleted ? (
                        <span className="sx-ed-cmt__edited" title={labels.dateTime(c.editedAt)}>
                          {t("sx.editor.comments.edited")}
                        </span>
                      ) : null}
                    </span>
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
