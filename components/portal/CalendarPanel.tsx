"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime, monthTitle, weekdays, fmtDate } from "@/lib/date";
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
import TimePicker from "@/components/TimePicker";
import { IconCalendar, IconPlus, IconClock, IconMapPin, IconClose, IconBell, IconDownload, IconChevronLeft, IconChevronRight } from "@/components/icons";

// GM T1B-04: court hearing, investigative action, meeting, filing deadline, appeal deadline.
const TYPES = ["hearing", "investigative", "meeting", "filing_deadline", "appeal_deadline"] as const;
// Reminder presets in minutes before the event ("" = no reminder).
const REMINDERS = ["", "15", "30", "60", "1440"] as const;
const DEADLINE_KINDS = ["appeal", "document", "complaint", "general"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
// Local calendar day of an ISO timestamp ("YYYY-MM-DD").
function dayKey(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : iso(d.getFullYear(), d.getMonth(), d.getDate());
}
function timeOf(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
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

// Court calendar + deadlines, shared by the advocate and lawyer portals:
// a month grid in the site's own style (events as coloured chips), the
// selected day's agenda beside it, and an upcoming list; adding an event,
// the deadline calculator and the .ics export stay in modals.
export default function CalendarPanel({ ns }: { ns: string }) {
  const t = useTranslations(ns);
  const tc = useTranslations("portal.common.calendar");
  const locale = useLocale();
  const wd = weekdays(locale);
  const fmt = (ts: string) => shortDateTime(ts, locale);
  const tr = useTranslations("portal.common.reminder");
  const [reloadKey, setReloadKey] = useState(0);
  const res = useResource<CalendarEvent>(() => listCalendarEvents(), [reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  const now = new Date();
  const todayKey = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const [vy, setVy] = useState(now.getFullYear());
  const [vm, setVm] = useState(now.getMonth());
  const [sel, setSel] = useState(todayKey);
  const [mode, setMode] = useState<"month" | "list">("month");

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
  const [del, setDel] = useState<CalendarEvent | null>(null);

  // Events grouped by local day, sorted by time.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    const sorted = [...res.data].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (const ev of sorted) {
      const k = dayKey(ev.startsAt);
      m.set(k, [...(m.get(k) ?? []), ev]);
    }
    return m;
  }, [res.data]);
  const upcoming = useMemo(() => {
    const nowIso = new Date().toISOString();
    return [...res.data].filter((e) => e.startsAt >= nowIso || dayKey(e.startsAt) >= todayKey).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 8);
  }, [res.data, todayKey]);

  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7; // Monday-first
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const prevDays = new Date(vy, vm, 0).getDate();
  const cells: { key: string; d: number; other: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) { const d = prevDays - i; const m = vm === 0 ? 11 : vm - 1; const y = vm === 0 ? vy - 1 : vy; cells.push({ key: iso(y, m, d), d, other: true }); }
  for (let d = 1; d <= daysIn; d++) cells.push({ key: iso(vy, vm, d), d, other: false });
  for (let d = 1; cells.length % 7 !== 0; d++) { const m = vm === 11 ? 0 : vm + 1; const y = vm === 11 ? vy + 1 : vy; cells.push({ key: iso(y, m, d), d, other: true }); }

  function step(delta: number) {
    let m = vm + delta, y = vy;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setVm(m); setVy(y);
  }
  function goToday() { setVy(now.getFullYear()); setVm(now.getMonth()); setSel(todayKey); }
  function openAdd(day?: string) {
    setNote(null);
    if (day) setDate(day);
    else if (!date) setDate(sel);
    setOpen(true);
  }

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
      setSel(date);
      const [y, m] = date.split("-").map((x) => parseInt(x, 10));
      if (y && m) { setVy(y); setVm(m - 1); }
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

  async function confirmRemove() {
    if (!del) return;
    const id = del.id;
    setDel(null);
    try {
      await deleteCalendarEvent(id);
      res.setData((cur) => cur.filter((e) => e.id !== id));
    } catch {
      setNote({ ok: false, msg: t("error") });
    }
  }

  const typeOpts = TYPES.map((v) => ({ value: v, label: t(v) }));
  const typeLabel = (v: string) => (t.has(v) ? t(v) : v);
  // "30 daqiqa oldin" / "1 soat oldin" / "1 kun oldin".
  const beforeLabel = (min: number) =>
    min > 0 && min % 1440 === 0
      ? tr("days", { n: min / 1440 })
      : min > 0 && min % 60 === 0
        ? tr("hours", { n: min / 60 })
        : tr("minutes", { n: min });
  const reminderOpts = REMINDERS.map((v) => ({ value: v, label: v ? beforeLabel(parseInt(v, 10)) : tr("none") }));
  const selEvents = byDay.get(sel) ?? [];

  const eventRow = (ev: CalendarEvent, withDate: boolean) => (
    <div className={`calev calev--${ev.type}`} key={ev.id}>
      <span className={`calev__type calev__type--${ev.type}`}>{typeLabel(ev.type)}</span>
      <div className="calev__m">
        <b>{ev.title}</b>
        <span>
          <IconClock />
          {withDate ? fmt(ev.startsAt) : timeOf(ev.startsAt)}
          {ev.location ? (<>{" · "}<IconMapPin />{ev.location}</>) : null}
          {ev.reminderScheduled && ev.reminderMinutesBefore != null ? (<>{" · "}<IconBell />{beforeLabel(ev.reminderMinutesBefore)}</>) : null}
        </span>
      </div>
      <button className="calev__ical" type="button" title={td("ical")} aria-label={td("ical")} disabled={icalBusy === ev.id} onClick={() => ical(ev)}>
        <IconDownload />
      </button>
      <button className="calev__x" type="button" aria-label={t("remove")} onClick={() => setDel(ev)}>
        <IconClose />
      </button>
    </div>
  );

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="segs segs--sm" role="tablist" aria-label={tc("view")}>
            <button type="button" role="tab" className="seg" aria-selected={mode === "month"} onClick={() => setMode("month")}>{tc("month")}</button>
            <button type="button" role="tab" className="seg" aria-selected={mode === "list"} onClick={() => setMode("list")}>{tc("list")}</button>
          </div>
          <button className="btn btn--soft btn--sm" type="button" onClick={() => { setCalcRes(null); setCalcErr(null); setCalcOpen(true); }}>
            <IconClock />
            {td("open")}
          </button>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => openAdd()}>
            <IconPlus />
            {t("add")}
          </button>
        </div>
      </div>
      {note && !open ? <Notice ok={note.ok} msg={note.msg} /> : null}

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : mode === "list" ? (
        !res.data.length ? (
          <EmptyState icon={<IconCalendar />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="calist">
            {[...res.data].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((ev) => eventRow(ev, true))}
          </div>
        )
      ) : (
        <div className="calwrap">
          <div className="calgrid">
            <div className="calgrid__nav">
              <button type="button" aria-label={tc("prev")} onClick={() => step(-1)}><IconChevronLeft /></button>
              <b>{monthTitle(vy, vm, locale)}</b>
              <button type="button" aria-label={tc("next")} onClick={() => step(1)}><IconChevronRight /></button>
              <button type="button" className="calgrid__today" onClick={goToday}>{t("today")}</button>
            </div>
            <div className="calgrid__wd">{wd.map((w, i) => <span key={i} className={i >= 5 ? "we" : ""}>{w}</span>)}</div>
            <div className="calgrid__cells">
              {cells.map((c, i) => {
                const evs = byDay.get(c.key) ?? [];
                const cls = ["calgrid__d", c.other ? "other" : "", c.key === todayKey ? "today" : "", c.key === sel ? "sel" : "", i % 7 >= 5 ? "we" : ""].filter(Boolean).join(" ");
                return (
                  <button
                    type="button"
                    key={c.key}
                    className={cls}
                    onClick={() => { setSel(c.key); if (c.other) { const [y, m] = c.key.split("-").map((x) => parseInt(x, 10)); setVy(y); setVm(m - 1); } }}
                    onDoubleClick={() => openAdd(c.key)}
                    aria-label={`${fmtDate(c.key, locale)}${evs.length ? ` · ${evs.length}` : ""}`}
                    aria-pressed={c.key === sel}
                  >
                    <span className="calgrid__n">{c.d}</span>
                    <span className="calgrid__evs">
                      {evs.slice(0, 2).map((ev) => (
                        <i key={ev.id} className={`calgrid__ev calgrid__ev--${ev.type}`} title={ev.title}><em>{timeOf(ev.startsAt)}</em>{ev.title}</i>
                      ))}
                      {evs.length > 2 ? <i className="calgrid__more">+{evs.length - 2}</i> : null}
                    </span>
                    {evs.length ? <span className="calgrid__dots" aria-hidden>{evs.slice(0, 3).map((ev) => <b key={ev.id} className={`calgrid__dot--${ev.type}`} />)}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="calside">
            <div className="calside__h">
              <b>{sel === todayKey ? t("today") : fmtDate(sel, locale)}</b>
              <button type="button" className="aitem__act" aria-label={t("add")} title={t("add")} onClick={() => openAdd(sel)}><IconPlus /></button>
            </div>
            {selEvents.length ? (
              <div className="calist">{selEvents.map((ev) => eventRow(ev, false))}</div>
            ) : (
              <p className="calside__empty">{tc("noneDay")}</p>
            )}
            <div className="calside__h calside__h--up"><b>{tc("upcoming")}</b></div>
            {upcoming.length ? (
              <ul className="calup">
                {upcoming.map((ev) => (
                  <li key={ev.id}>
                    <button type="button" onClick={() => { const k = dayKey(ev.startsAt); setSel(k); const [y, m] = k.split("-").map((x) => parseInt(x, 10)); setVy(y); setVm(m - 1); }}>
                      <b className={`calgrid__dot--${ev.type}`} />
                      <span className="calup__m"><b>{ev.title}</b><small>{fmt(ev.startsAt)}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="calside__empty">{t("empty")}</p>
            )}
          </aside>
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
          <label className={`vac${addEvent ? " on" : ""}`} style={{ justifySelf: "start" }}>
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
              <TimePicker value={time} onChange={setTime} placeholder={tc("time")} ariaLabel={tc("time")} />
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
          <button className="btn btn--pri btn--full" type="submit" disabled={busy || !title.trim() || !date}>
            {busy ? t("saving") : t("save")}
          </button>
        </form>
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title={t("remove")}>
        <p className="advmuted">{tc("removeText", { title: del?.title ?? "" })}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setDel(null)}>{tc("cancel")}</button>
          <button type="button" className="btn btn--pri btn--sm" style={{ background: "#e5484d", boxShadow: "none" }} onClick={() => void confirmRemove()}>{t("remove")}</button>
        </div>
      </Modal>
    </div>
  );
}
