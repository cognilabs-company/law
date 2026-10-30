"use client";

import "./superadvokat.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import PersonName from "@/components/ui/PersonName";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { IconCrown, IconHistory, IconLock } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { getSuperHistory, isPrimaryOnly, setSuperadvokat, superActiveAt, type SuperEntry, type SuperState } from "@/lib/services/superadvokat";

// TSK-460646 — the manual Superadvokat override for one seller: the state
// now, the change (on/off, a required reason, from, optional until) and the
// audit history. Only the primary superadmin may save (/auth/me
// can_set_superadvokat); anyone else sees the lock before trying.

const REASON_MIN = 10;
const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoOf = (day: string, time: string) => (day ? new Date(`${day}T${time || "00:00"}:00`).toISOString() : "");

export default function SuperadvokatDialog({ sellerUserId, sellerName, canEdit, onClose }: { sellerUserId: string; sellerName: string; canEdit: boolean; onClose: () => void }): ReactElement {
  const t = useTranslations("admin.superadvokat");
  const locale = useLocale();
  // A before/after snapshot in words: on or off, and its period.
  const stateText = (st: SuperState | null) =>
    !st
      ? t("stateNone")
      : [st.active ? t("stateOn") : t("stateOff"), st.startsAt ? t("histFrom", { date: shortDateTime(st.startsAt, locale) }) : "", st.endsAt ? t("histTo", { date: shortDateTime(st.endsAt, locale) }) : st.active ? t("noEnd").toLowerCase() : ""].filter(Boolean).join(", ");
  const [history, setHistory] = useState<SuperEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState("");
  const [startDay, setStartDay] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDay, setEndDay] = useState("");
  const [endTime, setEndTime] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [locked, setLocked] = useState(!canEdit);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [now, setNow] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // The history is the primary superadmin's too: nobody else asks for it.
    if (!canEdit) return;
    const ctl = new AbortController();
    getSuperHistory(sellerUserId, ctl.signal).then(
      (h) => {
        setHistory(h);
        setNow(Date.now());
        const cur = superActiveAt(h, Date.now());
        setActive(!cur.active);
        setStartDay((d) => d || dayOf(new Date()));
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError("superadvokat.history", e);
        setLoadFailed(true);
        if (isPrimaryOnly(e)) setLocked(true);
      },
    );
    return () => ctl.abort();
  }, [sellerUserId, tick, canEdit]);

  const current = history && now ? superActiveAt(history, now) : null;
  const startsAt = isoOf(startDay, startTime);
  const endsAt = isoOf(endDay, endTime);
  const issue = reason.trim().length < REASON_MIN ? "reason" : !startsAt ? "start" : endsAt && endsAt <= startsAt ? "end" : "";

  async function save() {
    setTried(true);
    if (issue || busy || sending.current || locked) return;
    sending.current = true;
    setBusy(true);
    setMsg(null);
    try {
      await setSuperadvokat(sellerUserId, { active, reason, startsAt, endsAt });
      setMsg({ ok: true, text: active ? t("savedOn") : t("savedOff") });
      setReason("");
      setTried(false);
      setTick((n) => n + 1);
    } catch (e) {
      logApiError("superadvokat.set", e);
      if (isPrimaryOnly(e)) setLocked(true);
      else setMsg({ ok: false, text: errDetail(e) || t("failed") });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (busy ? undefined : onClose())}
      title={t("title")}
      description={sellerName}
      icon={<IconCrown />}
      size="lg"
      busy={busy}
      dirty={!!reason.trim()}
      footer={
        <>
          {tried && issue ? (
            <small className="sav__issue" role="alert">
              {t(`issue.${issue}`, { n: REASON_MIN })}
            </small>
          ) : null}
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("close")}
          </button>
          <button type="button" className="btn btn--pri" onClick={() => void save()} disabled={busy || locked || !history}>
            {busy ? t("saving") : active ? t("turnOn") : t("turnOff")}
          </button>
        </>
      }
    >
      <div className="sav">
        <div className="sav__now" data-on={current?.active || undefined}>
          <span className="sav__crown" aria-hidden="true">
            <IconCrown />
          </span>
          <span>
            <b>{!current ? (locked ? t("lockedTitle") : t("loading")) : current.active ? t("nowOn") : t("nowOff")}</b>
            <small>{!current && locked ? t("lockedText") : current?.active ? (current.until ? t("until", { date: shortDateTime(current.until, locale) }) : t("noEnd")) : t("nowOffText")}</small>
          </span>
        </div>

        {locked ? (
          <p className="sav__lock">
            <IconLock aria-hidden="true" />
            {t("locked")}
          </p>
        ) : null}
        {loadFailed && !locked ? <Notice ok={false} msg={t("loadFailed")} /> : null}
        {msg ? <Notice ok={msg.ok} msg={msg.text} /> : null}

        <fieldset className="sav__form" disabled={locked || busy}>
          <legend>{t("change")}</legend>
          <div className="sav__seg" role="radiogroup" aria-label={t("change")}>
            {[true, false].map((on) => (
              <button key={String(on)} type="button" role="radio" aria-checked={active === on} onClick={() => setActive(on)} data-on={on || undefined}>
                <b>{on ? t("give") : t("take")}</b>
                <small>{on ? t("giveHint") : t("takeHint")}</small>
              </button>
            ))}
          </div>
          <label className="sav__f">
            <span>{t("reason")}</span>
            <textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPh")} aria-invalid={tried && issue === "reason" ? true : undefined} />
          </label>
          <div className="sav__two">
            <div className="sav__f" data-bad={tried && issue === "start" ? true : undefined}>
              <span>{t("from")}</span>
              <span className="sav__dt">
                <DatePicker value={startDay} onChange={setStartDay} placeholder={t("pickDay")} ariaLabel={t("fromDay")} />
                <TimePicker value={startTime} onChange={setStartTime} placeholder="00:00" ariaLabel={t("fromTime")} disabled={!startDay} />
              </span>
            </div>
            <div className="sav__f" data-bad={tried && issue === "end" ? true : undefined}>
              <span>
                {t("to")} <em>{t("optional")}</em>
              </span>
              <span className="sav__dt">
                <DatePicker value={endDay} onChange={setEndDay} placeholder={t("noEndPh")} ariaLabel={t("toDay")} min={startDay || undefined} clearLabel={t("clear")} />
                <TimePicker value={endTime} onChange={setEndTime} placeholder="23:59" ariaLabel={t("toTime")} disabled={!endDay} />
              </span>
            </div>
          </div>
          <p className="sav__note">{t("recalc")}</p>
        </fieldset>

        {canEdit ? (
          <section className="sav__hist" aria-labelledby="sav-h">
            <h4 id="sav-h">
              <IconHistory aria-hidden="true" />
              {t("history")}
            </h4>
            {!history ? (
              <div className="sav__sk" aria-hidden="true" />
            ) : !history.length ? (
              <p className="sav__muted">{t("historyEmpty")}</p>
            ) : (
              <ol>
                {history.map((h, i) => (
                  <li key={h.id || i} data-on={h.active || undefined}>
                    <i aria-hidden="true" />
                    <span>
                      <b>
                        {h.active ? t("histOn") : t("histOff")}
                        {h.status === "superseded" || h.status === "revoked" ? <em className="sav__st">{t(`histStatus.${h.status}`)}</em> : null}
                      </b>
                      <small>
                        {[h.at ? shortDateTime(h.at, locale) : "", h.startsAt ? t("histFrom", { date: shortDateTime(h.startsAt, locale) }) : "", h.endsAt ? t("histTo", { date: shortDateTime(h.endsAt, locale) }) : ""].filter(Boolean).join(" · ")}
                        {h.byId || h.byName ? (
                          <>
                            {" · "}
                            <PersonName id={h.byId} name={h.byName} fallback={t("superadmin")} />
                          </>
                        ) : null}
                      </small>
                      {h.before || h.after ? (
                        <span className="sav__diff">
                          <del>{t("histWas", { state: stateText(h.before) })}</del>
                          <ins>{t("histNow", { state: stateText(h.after) })}</ins>
                        </span>
                      ) : null}
                      {h.reason ? <q>{h.reason}</q> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
