"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { IconCheck, IconClose, IconEdit, IconPause, IconPlay, IconSend, IconSparkle } from "@/components/icons";
import { humanizeSlug } from "@/lib/lawyers";
import { getRtTimeline, type RtSpeaker, type RtSuggestion, type RtTimelineEntry } from "@/lib/services/executive";
import type { RealtimeAssist } from "@/lib/realtime/useRealtimeAssist";
import "./realtimeAssist.css";

// The call assistant's panel inside the call (contract 2026-11-13 §9): up
// to three suggestion cards, priority 1 first and marked, each used / edited
// / dismissed (recorded for audit); the live transcript; a line the operator
// types; pause and end. An AI outage is a small note, never a blocker.
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function RealtimeAssistPanel({ rt, self }: { rt: RealtimeAssist; self: "operator" | "lawyer" }): ReactElement {
  const t = useTranslations("exec.rt");
  const { markSeen } = rt;
  useEffect(() => {
    markSeen();
  }, [markSeen, rt.unseen]);

  if (rt.state === "off" || rt.state === "failed" || rt.state === "starting") {
    return (
      <div className="rta rta--intro">
        <span className="rta__art" aria-hidden="true"><IconSparkle /></span>
        <b>{t("introTitle")}</b>
        <p>{t("introText")}</p>
        {rt.state === "failed" ? <p className="rta__err" role="alert">{t("startFailed")}</p> : null}
        <button type="button" className="btn btn--pri btn--sm" onClick={() => void rt.start()} disabled={rt.state === "starting"} aria-busy={rt.state === "starting" || undefined}>
          <IconSparkle />
          {rt.state === "starting" ? t("starting") : t("start")}
        </button>
      </div>
    );
  }
  if (rt.state === "denied") {
    return (
      <div className="rta rta--intro">
        <b>{t("deniedTitle")}</b>
        <p>{t("deniedText")}</p>
      </div>
    );
  }
  if (rt.state === "ended") return <Ended rt={rt} />;

  return (
    <div className="rta">
      <div className="rta__bar">
        <span className={`rta__state is-${rt.state}`}>
          <i aria-hidden="true" />
          {rt.state === "paused" ? t("paused") : rt.socket === "online" ? t("listening") : t("connecting")}
        </span>
        {rt.state === "paused" ? (
          <button type="button" className="rta__tool" onClick={() => void rt.resume()}><IconPlay />{t("resume")}</button>
        ) : (
          <button type="button" className="rta__tool" onClick={() => void rt.pause()}><IconPause />{t("pause")}</button>
        )}
        <button type="button" className="rta__tool" onClick={() => void rt.end()}><IconClose />{t("end")}</button>
      </div>
      {rt.generation === "provider_unavailable" ? <p className="rta__note" role="status">{t("unavailable")}</p> : null}
      {rt.state === "paused" ? <p className="rta__note" role="status">{t("pausedNote")}</p> : null}
      <section className="rta__cards" aria-label={t("suggestions")} aria-live="polite">
        {rt.cards.length ? rt.cards.map((s, i) => <Card key={s.id} s={s} top={i === 0 && s.priority <= 1} rt={rt} />) : <p className="rta__empty">{t("noCards")}</p>}
      </section>
      <Transcript rt={rt} self={self} />
    </div>
  );
}

function Card({ s, top, rt }: { s: RtSuggestion; top: boolean; rt: RealtimeAssist }): ReactElement {
  const t = useTranslations("exec.rt");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.editedText || s.text);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const decided = s.status === "used" || s.status === "edited";
  const act = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await fn();
    setBusy(false);
    if (!ok) setFailed(true);
    else setEditing(false);
  };
  return (
    <article className={`rta__card${top ? " is-top" : ""}${decided ? " is-done" : ""}`}>
      <header>
        <span className="rta__type">{t.has(`type.${s.type}`) ? t(`type.${s.type}`) : humanizeSlug(s.type)}</span>
        {top ? <span className="rta__prio">{t("priority1")}</span> : null}
        {s.startMs !== null ? <small>{mmss(s.startMs)}</small> : null}
      </header>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label={t("editLabel")} rows={3} autoFocus />
      ) : (
        <p>{s.status === "edited" && s.editedText ? s.editedText : s.text}</p>
      )}
      {s.rationale && !editing ? <small className="rta__why">{s.rationale}</small> : null}
      {failed ? <small className="rta__err" role="alert">{t("decideFailed")}</small> : null}
      {decided && !editing ? (
        <span className="rta__done"><IconCheck />{s.status === "edited" ? t("editedDone") : t("usedDone")}</span>
      ) : editing ? (
        <div className="rta__acts">
          <button type="button" className="rta__btn is-pri" disabled={busy || !text.trim()} onClick={() => void act(() => rt.decide(s, { action: "edited", editedText: text }))}><IconCheck />{t("saveEdit")}</button>
          <button type="button" className="rta__btn" onClick={() => setEditing(false)}>{t("cancel")}</button>
        </div>
      ) : (
        <div className="rta__acts">
          <button type="button" className="rta__btn is-pri" disabled={busy} onClick={() => void act(() => rt.decide(s, { action: "used" }))}><IconCheck />{t("use")}</button>
          <button type="button" className="rta__btn" disabled={busy} onClick={() => setEditing(true)}><IconEdit />{t("edit")}</button>
          <button type="button" className="rta__btn" disabled={busy} onClick={() => void act(() => rt.decide(s, { action: "dismissed" }))} aria-label={t("dismiss")} title={t("dismiss")}><IconClose />{t("dismissShort")}</button>
        </div>
      )}
    </article>
  );
}

function Transcript({ rt, self }: { rt: RealtimeAssist; self: "operator" | "lawyer" }): ReactElement {
  const t = useTranslations("exec.rt");
  const [who, setWho] = useState<RtSpeaker>("client");
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [rt.lines.length]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText("");
    void rt.say(who, v);
  };
  return (
    <section className="rta__tr" aria-label={t("transcript")}>
      <h4>{t("transcript")}</h4>
      <div className="rta__lines">
        {rt.lines.length ? (
          rt.lines.map((l) => (
            <p key={l.key} className={`rta__line is-${l.speaker}${l.final ? "" : " is-partial"}`}>
              <b>{t(`speaker.${l.speaker}`)}</b> {l.text}
            </p>
          ))
        ) : (
          <p className="rta__empty">{t("noLines")}</p>
        )}
        <div ref={end} />
      </div>
      <form className="rta__say" onSubmit={submit}>
        <span className="rta__who" role="group" aria-label={t("whoSaid")}>
          <button type="button" aria-pressed={who === "client"} onClick={() => setWho("client")}>{t("speaker.client")}</button>
          <button type="button" aria-pressed={who === self} onClick={() => setWho(self)}>{t("speaker.me")}</button>
        </span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("sayPh")} aria-label={t("sayPh")} />
        <button type="submit" className="rta__send" disabled={!text.trim()} aria-label={t("send")} title={t("send")}><IconSend /></button>
      </form>
    </section>
  );
}

// After the call: the session as it happened, by call position.
function Ended({ rt }: { rt: RealtimeAssist }): ReactElement {
  const t = useTranslations("exec.rt");
  const [rows, setRows] = useState<RtTimelineEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const id = rt.session?.id ?? "";
  const load = () => {
    if (!id) return;
    setFailed(false);
    getRtTimeline(id).then(setRows, () => setFailed(true));
  };
  return (
    <div className="rta">
      <p className="rta__note">{t("endedNote")}</p>
      {rows === null ? (
        <button type="button" className="btn btn--line btn--sm rta__tl-open" onClick={load} disabled={!id}>{t("timeline")}</button>
      ) : rows.length ? (
        <ol className="rta__tl">
          {rows.map((r, i) => (
            <li key={i} className={`is-${r.kind}`}>
              <small>{mmss(r.atMs)}</small>
              {r.kind === "suggestion" ? (
                <p><span className="rta__type">{r.suggestion && t.has(`type.${r.suggestion.type}`) ? t(`type.${r.suggestion.type}`) : t("aiSaid")}</span> {r.text}{r.suggestion?.status && r.suggestion.status !== "new" ? <em> · {t.has(`status.${r.suggestion.status}`) ? t(`status.${r.suggestion.status}`) : r.suggestion.status}</em> : null}</p>
              ) : (
                <p><b>{t.has(`speaker.${r.speaker}`) ? t(`speaker.${r.speaker}`) : humanizeSlug(r.speaker)}</b> {r.text}</p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rta__empty">{t("timelineEmpty")}</p>
      )}
      {failed ? <p className="rta__err" role="alert">{t("timelineFailed")}</p> : null}
    </div>
  );
}
