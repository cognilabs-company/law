"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import {
  listCalendarEvents,
  calculateDeadline,
  downloadEventIcal,
  type DeadlineKind,
  type DeadlineResult,
  createCalendarEvent,
  deleteCalendarEvent,
  type CalendarEvent,
} from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "./DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";
import { IconCalendar, IconPlus, IconClock, IconMapPin, IconClose, IconBell, IconDownload } from "@/components/icons";

// GM T1B-04: court hearing, investigative action, meeting, filing deadline, appeal deadline.
const TYPES = ["hearing", "investigative", "meeting", "filing_deadline", "appeal_deadline"] as const;
// Reminder presets in minutes before the event ("" = no reminder).
const REMINDERS = ["", "15", "30", "60", "1440"] as const;


// Court calendar + deadlines, shared by the advocate and lawyer portals.
const DEADLINE_KINDS = ["appeal", "document", "complaint", "general"] as const;
// Blob → browser download (the .ics comes from the API with a token, so an <a href> can't fetch it).
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CalendarPanel({ ns }: { ns: string }) {
  const t = useTranslations(ns);
  const locale = useLocale();
  const fmt = (iso: string) => shortDateTime(iso, locale);
  const tr = useTranslations("portal.common.reminder");
  const [reloadKey, setReloadKey] = useState(0);
  const res = useResource<CalendarEvent>(() => listCalendarEvents(), [reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("hearing");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [reminder, setReminder] = useState<string>("30");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  // T1B-04 deadline calculator
  const td = useTranslations("portal.common.deadlineCalc");
  const [calcOpen, setCalcOpen] = useState(false);
  const [kind, setKind] = useState<DeadlineKind>("appeal");
  const [baseDate, setBaseDate] = useState("");
  const [calcTitle, setCalcTitle] = useState("");
  const [addEvent, setAddEvent] = useState(true);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcRes, setCalcRes] = useState<DeadlineResult | null>(null);
  const [calcErr, setCalcErr] = useState<string | null>(null);
  const [icalBusy, setIcalBusy] = useState<string | null>(null);
  async function calc(e: React.FormEvent) {
    e.preventDefault();
    if (calcBusy || !baseDate) return;
    setCalcBusy(true);
    setCalcErr(null);
    try {
      const r = await calculateDeadline({ kind, baseDate, createEvent: addEvent, title: calcTitle.trim() || td(`kinds.${kind}`) });
      setCalcRes(r);
      if (r.event) reload();
    } catch {
      setCalcErr(td("error"));
    } finally {
      setCalcBusy(false);
    }
  }
  async function ical(ev: CalendarEvent) {
    if (icalBusy) return;
    setIcalBusy(ev.id);
    try {
      saveBlob(await downloadEventIcal(ev.id), `${ev.title.replace(/[^\w\d-]+/g, "_").slice(0, 40) || "event"}.ics`);
    } catch {
      setNote({ ok: false, msg: td("icalError") });
    } finally {
      setIcalBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !date) return;
    setBusy(true);
    setNote(null);
    try {
      await createCalendarEvent({
        type,
        title: title.trim(),
        starts_at: new Date(`${date}T${time || "09:00"}`).toISOString(),
        location: location.trim() || undefined,
        ...(reminder ? { reminder_minutes_before: parseInt(reminder, 10) } : {}),
      });
      setNote({ ok: true, msg: t("created") });
      setTitle("");
      setDate("");
      setTime("");
      setLocation("");
      reload();
      setTimeout(() => setOpen(false), 900);
    } catch {
      setNote({ ok: false, msg: t("error") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteCalendarEvent(id);
      reload();
    } catch {
      /* ignore */
    }
  }

  const typeOpts = TYPES.map((v) => ({ value: v, label: t(v) }));
  // "30 daqiqa oldin" / "1 soat oldin" / "1 kun oldin".
  const beforeLabel = (min: number) =>
    min > 0 && min % 1440 === 0
      ? tr("days", { n: min / 1440 })
      : min > 0 && min % 60 === 0
        ? tr("hours", { n: min / 60 })
        : tr("minutes", { n: min });
  const reminderOpts = REMINDERS.map((v) => ({ value: v, label: v ? beforeLabel(parseInt(v, 10)) : tr("none") }));

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn--soft btn--sm" type="button" onClick={() => { setCalcRes(null); setCalcErr(null); setCalcOpen(true); }}>
            <IconClock />
            {td("open")}
          </button>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}>
            <IconPlus />
            {t("add")}
          </button>
        </div>
      </div>
      {note && !open ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconCalendar />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="calist">
          {res.data.map((ev) => (
            <div className="calev" key={ev.id}>
              <span className={`calev__type calev__type--${ev.type}`}>{t.has(ev.type) ? t(ev.type) : ev.type}</span>
              <div className="calev__m">
                <b>{ev.title}</b>
                <span>
                  <IconClock />
                  {fmt(ev.startsAt)}
                  {ev.location ? (
                    <>
                      {" · "}
                      <IconMapPin />
                      {ev.location}
                    </>
                  ) : null}
                  {ev.reminderScheduled && ev.reminderMinutesBefore != null ? (
                    <>
                      {" · "}
                      <IconBell />
                      {beforeLabel(ev.reminderMinutesBefore)}
                    </>
                  ) : null}
                </span>
              </div>
              <button className="calev__ical" type="button" title={td("ical")} aria-label={td("ical")} disabled={icalBusy === ev.id} onClick={() => ical(ev)}>
                <IconDownload />
              </button>
              <button className="calev__x" type="button" aria-label={t("remove")} onClick={() => remove(ev.id)}>
                <IconClose />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={calcOpen} onClose={() => setCalcOpen(false)} title={td("title")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={calc}>
          <p className="advmuted">{td("lead")}</p>
          <div>
            <label>{td("kind")}</label>
            <Select value={kind} onChange={(v) => setKind(v as DeadlineKind)} options={DEADLINE_KINDS.map((k) => ({ value: k, label: `${td(`kinds.${k}`)} — ${td(`rules.${k}`)}` }))} ariaLabel={td("kind")} />
          </div>
          <div>
            <label>{td("baseDate")}</label>
            <DatePicker value={baseDate} onChange={setBaseDate} placeholder={td("baseDate")} ariaLabel={td("baseDate")} />
          </div>
          <div>
            <label>{td("eventTitle")}</label>
            <input value={calcTitle} onChange={(e) => setCalcTitle(e.target.value)} placeholder={td("eventTitlePh")} />
          </div>
          <label className="vac" style={{ justifySelf: "start" }}>
            <input type="checkbox" checked={addEvent} onChange={(e) => setAddEvent(e.target.checked)} />
            {td("addToCalendar")}
          </label>
          {calcRes ? (
            <div className="rf__benefit">
              <b>{td("result", { date: shortDateTime(`${calcRes.deadline}T09:00:00`, locale).replace(/,?\s*\d{1,2}:\d{2}$/, "") })}</b>
              <p>{calcRes.event ? td("eventAdded") : td("notAdded")}</p>
            </div>
          ) : null}
          {calcErr ? <Notice ok={false} msg={calcErr} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={calcBusy || !baseDate}>
            {calcBusy ? td("calculating") : td("calculate")}
          </button>
        </form>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={t("addTitle")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
          <div>
            <label>{t("typeLabel")}</label>
            <Select value={type} onChange={setType} options={typeOpts} ariaLabel={t("typeLabel")} />
          </div>
          <div>
            <label>{t("titleLabel")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} />
          </div>
          <div>
            <label>{t("dateLabel")}</label>
            <div className="cal__dt">
              <DatePicker value={date} onChange={setDate} placeholder={t("dateLabel")} ariaLabel={t("dateLabel")} />
              <input type="time" className="cal__time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("dateLabel")} />
            </div>
          </div>
          <div>
            <label>{t("locationLabel")}</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPh")} />
          </div>
          <div>
            <label>{tr("label")}</label>
            <Select value={reminder} onChange={setReminder} options={reminderOpts} ariaLabel={tr("label")} />
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
          <button className="btn btn--pri btn--full" type="submit" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </button>
        </form>
      </Modal>
    </div>
  );
}
