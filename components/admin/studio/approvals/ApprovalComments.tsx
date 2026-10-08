"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { logApiError } from "@/lib/http";
import { addStudioComment, listStudioComments, type StudioComment } from "@/lib/services/studio";
import { StudioErrorNote, useStudioErrorText, useStudioText } from "../bits";
import { IconChat, IconSend } from "@/components/icons";

const MAX = 2000;

type Loaded = { key: string; list: StudioComment[]; error: unknown };

export default function ApprovalComments({ objectId, pulse, canWrite }: { objectId: string; pulse: number; canWrite: boolean }) {
  const { t, role, when } = useStudioText();
  const errText = useStudioErrorText();
  const uid = useId();
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<StudioComment[]>([]);
  const key = `${objectId}|${pulse}|${reload}`;

  useEffect(() => {
    let alive = true;
    listStudioComments(objectId)
      .then((list) => {
        if (alive) setLoaded({ key, list, error: null });
      })
      .catch((e: unknown) => {
        if (alive) setLoaded((cur) => ({ key, list: cur?.list ?? [], error: e }));
      });
    return () => {
      alive = false;
    };
  }, [objectId, key]);

  const list = loaded?.list ?? [];
  const known = new Set(list.map((c) => c.id).filter(Boolean));
  const extra = mine.filter((c) => !c.id || !known.has(c.id)).filter((c) => !list.some((x) => x.text === c.text && x.author === c.author));
  const all = [...list, ...extra].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const first = loaded === null;
  const error = loaded?.error ?? null;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const c = await addStudioComment(objectId, text);
      setMine((cur) => [...cur, c]);
      setDraft("");
      setReload((n) => n + 1);
    } catch (err) {
      logApiError("studio.approvals.comment", err);
      toast(errText(err).text || t("approvals.comments.fail"), { tone: "err" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stu-apcm">
      {first ? (
        <p className="stu-apd__muted">{t("common.loading")}</p>
      ) : error && !all.length ? (
        <StudioErrorNote error={error} compact onRetry={() => setReload((n) => n + 1)} />
      ) : all.length ? (
        <ol className="stu-apcm__list">
          {all.map((c, i) => (
            <li key={c.id || `local-${i}`} className="stu-apcm__i">
              <span className="stu-apcm__av" aria-hidden>
                {(c.author || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="stu-apcm__m">
                <span className="stu-apcm__who">
                  <b>{c.author || t("approvals.comments.someone")}</b>
                  {c.authorRole ? <em>{role(c.authorRole)}</em> : null}
                  {c.createdAt ? <small>{when(c.createdAt)}</small> : null}
                </span>
                <p>{c.text}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="stu-apd__muted">
          <IconChat aria-hidden />
          {t("approvals.comments.empty")}
        </p>
      )}
      {canWrite ? (
        <form className="stu-apcm__form" onSubmit={send}>
          <label htmlFor={`${uid}-c`} className="sr-only">
            {t("approvals.comments.label")}
          </label>
          <textarea
            id={`${uid}-c`}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder={t("approvals.comments.ph")}
            data-ai-id="admin.studio.approvals.drawer.comment.input"
            data-ai-type="textarea"
            data-ai-label={t("approvals.comments.label")}
          />
          <button type="submit" className="btn btn--pri btn--sm" disabled={!draft.trim() || sending} data-ai-id="admin.studio.approvals.drawer.comment.send" data-ai-type="button" data-ai-label={t("actions.send")}>
            {sending ? <span className="stu-spin" aria-hidden /> : <IconSend aria-hidden />}
            {t("actions.send")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
