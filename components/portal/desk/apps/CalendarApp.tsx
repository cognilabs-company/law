"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { calculateDeadline, createCalendarEvent, deleteCalendarEvent, downloadEventIcal, listCalendarEvents, type CalendarEvent, type DeadlineKind, type DeadlineResult } from "@/lib/services/backend";
import { dateOnly, monthNames, monthTitle, weekdays } from "@/lib/date";
import { saveBlob } from "@/lib/download";
import { IconAlert, IconBell, IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconClose, IconDownload, IconGavel, IconMapPin, IconPlus, IconScale, IconTrash } from "@/components/icons";
import { App, Btn, Check, Dialog, Empty, Field, Input, Loading, Search, Seg, Select, Toggle, Tool, Toolbar, useConfirm, useHost, useOs, useToast } from "../kit/kit";
import type { NativeProps } from "../native";
import "./calendar.css";

// The calendar as a desktop program: Calendar on the Mac, the Outlook-style
// calendar on Windows. Day, week and month grids and an agenda; the event
// kinds are calendars of their own, each with its colour and a box to hide
// it; a small month to jump around; new events by the button or by
// double-clicking a time; the procedural deadline calculator; each event's
// details with its .ics file and removal.

const TYPES = ["hearing", "investigative", "meeting", "filing_deadline", "appeal_deadline"] as const;
const COLORS: Record<string, string> = { hearing: "#ff3b30", investigative: "#af52de", meeting: "#007aff", filing_deadline: "#ff9500", appeal_deadline: "#34c759" };
const colorOf = (type: string) => COLORS[type] ?? "#8e8e93";
const REMINDERS = ["", "15", "30", "60", "1440"] as const;
const KINDS: DeadlineKind[] = ["appeal", "document", "complaint", "general"];
type View = "day" | "week" | "month" | "agenda";
const HOUR = 48; // px per hour in the day and week grids

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const evDay = (e: CalendarEvent) => {
  const d = new Date(e.startsAt);
  return Number.isNaN(d.getTime()) ? e.startsAt.slice(0, 10) : keyOf(d);
};
const minutesOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getHours() * 60 + d.getMinutes();
};
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CalendarApp(_props: NativeProps) {
  void _props;
  const t = useTranslations("portal.advocate.calendar");
  const tc = useTranslations("portal.common.calendar");
  const d = useTranslations("portal.desk.calendar");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState("");
  const [today, setToday] = useState("");
  const [nowMin, setNowMin] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const [sel, setSel] = useState("");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<{ date: string; time: string } | null>(null);
  const [calc, setCalc] = useState(false);
  const [confirmNode, confirm] = useConfirm();
  const [toast, say] = useToast();

  const load = () =>
    listCalendarEvents()
      .then((l) => setEvents(l))
      .catch(() => setFailed(true));
  useEffect(() => {
    let alive = true;
    const tick = () => {
      const n = new Date();
      setToday(keyOf(n));
      setNowMin(n.getHours() * 60 + n.getMinutes());
    };
    const h0 = setTimeout(() => {
      tick();
      setCursor((c) => c || keyOf(new Date()));
    }, 0);
    const h = setInterval(tick, 60_000);
    listCalendarEvents()
      .then((l) => alive && setEvents(l))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      clearTimeout(h0);
      clearInterval(h);
    };
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (events ?? []).filter((e) => !hidden.includes(TYPES.includes(e.type as (typeof TYPES)[number]) ? e.type : "other") && (!needle || `${e.title} ${e.location}`.toLowerCase().includes(needle)));
  }, [events, hidden, q]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of [...shown].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) m.set(evDay(e), [...(m.get(evDay(e)) ?? []), e]);
    return m;
  }, [shown]);
  const current = (events ?? []).find((e) => e.id === sel) ?? null;
  const typeName = (type: string) => (t.has(type) ? t(type) : type);
  const cur = cursor ? at(cursor) : new Date(2026, 0, 1);

  const step = (dir: number) => {
    const c = at(cursor);
    const next = view === "day" ? addDays(c, dir) : view === "week" ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1);
    setCursor(keyOf(next));
  };
  const days = view === "day" ? [cur] : Array.from({ length: 7 }, (_, i) => addDays(monday(cur), i));
  const months = monthNames(locale);
  const title =
    view === "day"
      ? dateOnly(keyOf(cur), locale)
      : view === "week"
        ? days[0].getMonth() === days[6].getMonth()
          ? monthTitle(days[0].getFullYear(), days[0].getMonth(), locale)
          : `${months[days[0].getMonth()]} – ${monthTitle(days[6].getFullYear(), days[6].getMonth(), locale)}`
        : monthTitle(cur.getFullYear(), cur.getMonth(), locale);

  async function remove(e: CalendarEvent) {
    const ok = await confirm({ title: t("remove"), text: tc("removeText", { title: e.title }), ok: t("remove"), cancel: tc("cancel"), danger: true });
    if (!ok) return;
    try {
      await deleteCalendarEvent(e.id);
      setEvents((l) => (l ?? []).filter((x) => x.id !== e.id));
      setSel("");
      say(tc("deleted"));
    } catch {
      say(tc("deleteFailed"), "err");
    }
  }
  async function ics(e: CalendarEvent) {
    try {
      saveBlob(await downloadEventIcal(e.id), `${e.title.replace(/[^\w\d-]+/g, "_").slice(0, 40) || "event"}.ics`);
    } catch {
      say(d("icsFailed"), "err");
    }
  }
  const evMenu = (ev: MouseEvent, e: CalendarEvent) =>
    menu?.(ev, e.title, [
      { id: "open", label: d("showDetails"), icon: <IconCalendar />, onSelect: () => setSel(e.id) },
      { id: "ics", label: d("ics"), icon: <IconDownload />, onSelect: () => void ics(e) },
      { sep: true, id: "s" },
      { id: "del", label: t("remove"), icon: <IconTrash />, danger: true, onSelect: () => void remove(e) },
    ]);
  const newAt = (date: string, time = "09:00") => setDraft({ date, time });

  const sideCals = (
    <div className="dxc-cals">
      <p className="dx-side__t">{d("calendars")}</p>
      {TYPES.map((type) => (
        <Check key={type} checked={!hidden.includes(type)} onChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== type) : [...h, type]))} label={typeName(type)}>
          <i className="dxc-sw" style={{ background: colorOf(type) }} aria-hidden />
          {typeName(type)}
        </Check>
      ))}
    </div>
  );
  const side = (
    <aside className="dx-side dxc-side" aria-label={t("title")}>
      <div className="dx-side__drag" aria-hidden />
      {os === "win" ? (
        <div className="dxc-new">
          <Btn kind="primary" icon={<IconPlus />} onClick={() => newAt(cursor)}>
            {t("addTitle")}
          </Btn>
        </div>
      ) : null}
      {os === "mac" ? sideCals : null}
      <MiniMonth value={cursor} today={today} marks={byDay} onPick={(k) => setCursor(k)} />
      {os === "win" ? sideCals : null}
      <div className="dxc-side__foot">
        <Btn kind="plain" small icon={<IconScale />} onClick={() => setCalc(true)}>
          {d("calculator")}
        </Btn>
      </div>
    </aside>
  );

  let body;
  if (events === null) body = failed ? <Empty icon={<IconAlert />} title={t("error")} /> : <Loading label={d("loading")} />;
  else if (view === "month") body = <MonthGrid cursor={cur} today={today} byDay={byDay} sel={sel} onSel={setSel} onNew={newAt} onMenu={evMenu} onDay={(k) => (setCursor(k), setView("day"))} />;
  else if (view === "agenda")
    body = (
      <div className="dxc-agenda dx-scroll">
        {[...byDay.entries()].filter(([k]) => k >= (q ? "" : today)).length ? (
          [...byDay.entries()]
            .filter(([k]) => k >= (q ? "" : today))
            .map(([k, list]) => (
              <section key={k} className="dxc-ag">
                <h3 className={k === today ? "is-today" : ""}>{dateOnly(k, locale)}</h3>
                {list.map((e) => (
                  <button key={e.id} type="button" className={`dxc-ag__e${sel === e.id ? " is-on" : ""}`} onClick={() => setSel(e.id)} onContextMenu={(ev) => (ev.preventDefault(), evMenu(ev, e))}>
                    <i style={{ background: colorOf(e.type) }} aria-hidden />
                    <span className="dxc-ag__t">{hhmm(e.startsAt)}</span>
                    <b>{e.title}</b>
                    <small>{[typeName(e.type), e.location].filter(Boolean).join(" · ")}</small>
                  </button>
                ))}
              </section>
            ))
        ) : (
          <Empty icon={<IconCalendar />} title={t("empty")} text={t("emptyText")} />
        )}
      </div>
    );
  else body = <TimeGrid days={days} today={today} nowMin={nowMin} byDay={byDay} sel={sel} onSel={setSel} onNew={newAt} onMenu={evMenu} weekdayNames={weekdays(locale)} />;

  return (
    <App name="calendar" sidebar={side} inspector={current ? <Details e={current} typeName={typeName} onClose={() => setSel("")} onRemove={() => void remove(current)} onIcs={() => void ics(current)} /> : undefined}>
      <Toolbar
        title={title}
        back={{ label: tc("prev"), onClick: () => step(-1) }}
        forward={{ label: tc("next"), onClick: () => step(1) }}
        end={<Search value={q} onChange={setQ} placeholder={d("search")} />}
      >
        {os === "mac" ? <Tool icon={<IconPlus />} label={t("addTitle")} onClick={() => newAt(cursor)} /> : null}
        <Btn small onClick={() => setCursor(today)}>
          {t("today")}
        </Btn>
        {os === "win" ? <span className="dx-sep" aria-hidden /> : null}
        <Seg
          label={tc("view")}
          small
          value={view}
          onChange={setView}
          items={[
            { id: "day", label: d("day") },
            { id: "week", label: d("week") },
            { id: "month", label: tc("month") },
            { id: "agenda", label: d("agenda") },
          ]}
        />
      </Toolbar>
      {body}
      <NewEvent
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={(e) => {
          setEvents((l) => [...(l ?? []), e]);
          setDraft(null);
          setCursor(evDay(e));
          setSel(e.id);
          say(t("created"));
        }}
        onFail={() => say(tc("createFailed"), "err")}
      />
      <Calculator
        open={calc}
        onClose={() => setCalc(false)}
        onAdded={() => void load()}
      />
      {confirmNode}
      {toast}
    </App>
  );
}

// A small month to move around in; days with events carry a dot.
function MiniMonth({ value, today, marks, onPick }: { value: string; today: string; marks: Map<string, CalendarEvent[]>; onPick: (k: string) => void }) {
  const locale = useLocale();
  const tc = useTranslations("portal.common.calendar");
  const base = value ? at(value) : new Date(2026, 0, 1);
  const [shift, setShift] = useState(0);
  const m = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  const first = monday(m);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const wd = weekdays(locale);
  return (
    <div className="dxc-mini">
      <header>
        <b>{monthTitle(m.getFullYear(), m.getMonth(), locale)}</b>
        <span>
          <button type="button" onClick={() => setShift((s) => s - 1)} aria-label={tc("prev")}>
            <IconChevronLeft />
          </button>
          <button type="button" onClick={() => setShift((s) => s + 1)} aria-label={tc("next")}>
            <IconChevronRight />
          </button>
        </span>
      </header>
      <div className="dxc-mini__g" role="grid">
        {wd.map((w) => (
          <span key={w} className="dxc-mini__w">
            {w.slice(0, 2)}
          </span>
        ))}
        {cells.map((c) => {
          const k = keyOf(c);
          return (
            <button key={k} type="button" className={`${c.getMonth() !== m.getMonth() ? "is-out" : ""}${k === today ? " is-today" : ""}${k === value ? " is-on" : ""}`} onClick={() => (onPick(k), setShift(0))}>
              {c.getDate()}
              {marks.has(k) ? <i aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The day and week grids: hours down the side, events where they fall,
// the time now as a red line; a double-click on an hour starts an event.
function TimeGrid({ days, today, nowMin, byDay, sel, onSel, onNew, onMenu, weekdayNames }: { days: Date[]; today: string; nowMin: number; byDay: Map<string, CalendarEvent[]>; sel: string; onSel: (id: string) => void; onNew: (date: string, time: string) => void; onMenu: (e: MouseEvent, ev: CalendarEvent) => void; weekdayNames: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: HOUR * 7.5 });
  }, []);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const cols = `52px repeat(${days.length}, minmax(0,1fr))`;
  return (
    <div className="dxc-tg">
      <div className="dxc-tg__head" style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((day) => {
          const k = keyOf(day);
          return (
            <span key={k} className={k === today ? "is-today" : ""}>
              <small>{weekdayNames[(day.getDay() + 6) % 7]}</small>
              <b>{day.getDate()}</b>
            </span>
          );
        })}
      </div>
      <div className="dxc-tg__body" ref={ref}>
        <div className="dxc-tg__grid" style={{ gridTemplateColumns: cols, height: HOUR * 24 }}>
          <div className="dxc-tg__hours">
            {hours.map((h) => (
              <span key={h} style={{ top: h * HOUR }}>
                {h ? `${pad(h)}:00` : ""}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const k = keyOf(day);
            const list = byDay.get(k) ?? [];
            return (
              <div
                key={k}
                className={`dxc-tg__col${k === today ? " is-today" : ""}`}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest(".dxc-ev")) return;
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  const h = Math.max(0, Math.min(23, Math.floor(y / HOUR)));
                  onNew(k, `${pad(h)}:00`);
                }}
              >
                {hours.map((h) => (
                  <i key={h} style={{ top: h * HOUR }} aria-hidden />
                ))}
                {list.map((ev) => {
                  const start = minutesOf(ev.startsAt);
                  const end = ev.endsAt ? Math.max(start + 30, minutesOf(ev.endsAt)) : start + 60;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`dxc-ev${sel === ev.id ? " is-on" : ""}`}
                      style={{ top: (start / 60) * HOUR, height: Math.max(22, ((end - start) / 60) * HOUR - 2), "--c": colorOf(ev.type) } as CSSProperties}
                      onClick={() => onSel(ev.id)}
                      onContextMenu={(e) => (e.preventDefault(), onSel(ev.id), onMenu(e, ev))}
                    >
                      <b>{ev.title}</b>
                      <small>
                        {hhmm(ev.startsAt)}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </small>
                    </button>
                  );
                })}
                {k === today ? <span className="dxc-now" style={{ top: (nowMin / 60) * HOUR }} aria-hidden /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ cursor, today, byDay, sel, onSel, onNew, onMenu, onDay }: { cursor: Date; today: string; byDay: Map<string, CalendarEvent[]>; sel: string; onSel: (id: string) => void; onNew: (date: string) => void; onMenu: (e: MouseEvent, ev: CalendarEvent) => void; onDay: (k: string) => void }) {
  const locale = useLocale();
  const d = useTranslations("portal.desk.calendar");
  const first = monday(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  return (
    <div className="dxc-mg">
      <div className="dxc-mg__w">
        {weekdays(locale).map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="dxc-mg__g">
        {cells.map((c) => {
          const k = keyOf(c);
          const list = byDay.get(k) ?? [];
          return (
            <div key={k} className={`dxc-mg__c${c.getMonth() !== cursor.getMonth() ? " is-out" : ""}${k === today ? " is-today" : ""}`} onDoubleClick={(e) => !(e.target as HTMLElement).closest(".dxc-chip") && onNew(k)}>
              <button type="button" className="dxc-mg__n" onClick={() => onDay(k)}>
                {c.getDate()}
              </button>
              {list.slice(0, 3).map((ev) => (
                <button key={ev.id} type="button" className={`dxc-chip${sel === ev.id ? " is-on" : ""}`} style={{ "--c": colorOf(ev.type) } as CSSProperties} onClick={() => onSel(ev.id)} onContextMenu={(e) => (e.preventDefault(), onSel(ev.id), onMenu(e, ev))}>
                  <i aria-hidden />
                  <span>{ev.title}</span>
                  <small>{hhmm(ev.startsAt)}</small>
                </button>
              ))}
              {list.length > 3 ? (
                <button type="button" className="dxc-more" onClick={() => onDay(k)}>
                  {d("more", { n: list.length - 3 })}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Details({ e, typeName, onClose, onRemove, onIcs }: { e: CalendarEvent; typeName: (t: string) => string; onClose: () => void; onRemove: () => void; onIcs: () => void }) {
  const t = useTranslations("portal.advocate.calendar");
  const tr = useTranslations("portal.common.reminder");
  const d = useTranslations("portal.desk.calendar");
  const locale = useLocale();
  const rem = e.reminderMinutesBefore;
  const remText = rem === undefined || rem === null ? tr("none") : rem >= 1440 ? tr("days", { n: Math.round(rem / 1440) }) : rem >= 60 ? tr("hours", { n: Math.round(rem / 60) }) : tr("minutes", { n: rem });
  return (
    <aside className="dxc-insp" aria-label={e.title} style={{ "--c": colorOf(e.type) } as CSSProperties}>
      <header>
        <i aria-hidden />
        <b>{e.title}</b>
        <Btn kind="plain" small icon={<IconClose />} title={d("close")} onClick={onClose} />
      </header>
      <dl>
        <div>
          <dt>
            <IconCalendar aria-hidden />
          </dt>
          <dd>
            <b>{dateOnly(e.startsAt, locale)}</b>
            <span>
              {hhmm(e.startsAt)}
              {e.endsAt ? ` – ${hhmm(e.endsAt)}` : ""}
            </span>
          </dd>
        </div>
        <div>
          <dt>
            <IconGavel aria-hidden />
          </dt>
          <dd>
            <b>{typeName(e.type)}</b>
            <span>{t("typeLabel")}</span>
          </dd>
        </div>
        {e.location ? (
          <div>
            <dt>
              <IconMapPin aria-hidden />
            </dt>
            <dd>
              <b>{e.location}</b>
              <span>{t("locationLabel")}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>
            <IconBell aria-hidden />
          </dt>
          <dd>
            <b>{remText}</b>
            <span>{e.reminderScheduled ? d("reminderOn") : tr("label")}</span>
          </dd>
        </div>
      </dl>
      <footer>
        <Btn icon={<IconDownload />} onClick={onIcs}>
          {d("ics")}
        </Btn>
        <Btn kind="danger" icon={<IconTrash />} onClick={onRemove}>
          {t("remove")}
        </Btn>
      </footer>
    </aside>
  );
}

function NewEvent({ draft, onClose, onSaved, onFail }: { draft: { date: string; time: string } | null; onClose: () => void; onSaved: (e: CalendarEvent) => void; onFail: () => void }) {
  const t = useTranslations("portal.advocate.calendar");
  const tr = useTranslations("portal.common.reminder");
  const d = useTranslations("portal.desk.calendar");
  const [f, setF] = useState({ key: "", type: "hearing", title: "", date: "", time: "", end: "", location: "", reminder: "30" });
  const [busy, setBusy] = useState(false);
  const key = draft ? `${draft.date}T${draft.time}` : "";
  if (draft && f.key !== key) {
    const [h] = draft.time.split(":").map(Number);
    setF({ key, type: "hearing", title: "", date: draft.date, time: draft.time, end: `${pad(Math.min(23, h + 1))}:${draft.time.split(":")[1] ?? "00"}`, location: "", reminder: "30" });
  }
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const remLabel = (r: string) => (!r ? tr("none") : r === "1440" ? tr("days", { n: 1 }) : Number(r) >= 60 ? tr("hours", { n: Number(r) / 60 }) : tr("minutes", { n: Number(r) }));
  async function save() {
    if (busy || !f.title.trim() || !f.date) return;
    setBusy(true);
    try {
      const startsAt = new Date(`${f.date}T${f.time || "09:00"}`).toISOString();
      const endsAt = f.end && f.end > (f.time || "09:00") ? new Date(`${f.date}T${f.end}`).toISOString() : undefined;
      const e = await createCalendarEvent({ type: f.type, title: f.title.trim(), starts_at: startsAt, ends_at: endsAt, location: f.location.trim() || undefined, reminder_minutes_before: f.reminder ? Number(f.reminder) : undefined });
      onSaved(e);
    } catch {
      onFail();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!draft}
      title={t("addTitle")}
      onClose={onClose}
      onSubmit={() => void save()}
      width={480}
      actions={
        <>
          <Btn onClick={onClose}>{d("cancel")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!f.title.trim() || !f.date}>
            {t("save")}
          </Btn>
        </>
      }
    >
      <Field label={t("titleLabel")}>
        <Input value={f.title} onChange={(v) => set({ title: v })} placeholder={t("titlePh")} required maxLength={200} autoFocus />
      </Field>
      <div className="dxc-form2">
        <Field label={t("typeLabel")}>
          <Select ariaLabel={t("typeLabel")} value={f.type} onChange={(v) => set({ type: v })} options={TYPES.map((x) => ({ value: x, label: t(x) }))} />
        </Field>
        <Field label={tr("label")}>
          <Select ariaLabel={tr("label")} value={f.reminder} onChange={(v) => set({ reminder: v })} options={REMINDERS.map((r) => ({ value: r, label: remLabel(r) }))} />
        </Field>
      </div>
      <div className="dxc-form3">
        <Field label={d("date")}>
          <Input type="date" value={f.date} onChange={(v) => set({ date: v })} ariaLabel={d("date")} />
        </Field>
        <Field label={d("starts")}>
          <Input type="time" value={f.time} onChange={(v) => set({ time: v })} ariaLabel={d("starts")} />
        </Field>
        <Field label={d("ends")}>
          <Input type="time" value={f.end} onChange={(v) => set({ end: v })} ariaLabel={d("ends")} />
        </Field>
      </div>
      <Field label={t("locationLabel")}>
        <Input value={f.location} onChange={(v) => set({ location: v })} placeholder={t("locationPh")} maxLength={200} />
      </Field>
    </Dialog>
  );
}

function Calculator({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const td = useTranslations("portal.common.deadlineCalc");
  const d = useTranslations("portal.desk.calendar");
  const locale = useLocale();
  const [kind, setKind] = useState<DeadlineKind>("appeal");
  const [base, setBase] = useState("");
  const [title, setTitle] = useState("");
  const [add, setAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DeadlineResult | null>(null);
  const [err, setErr] = useState("");
  async function run() {
    if (busy || !base) return;
    setBusy(true);
    setErr("");
    try {
      const r = await calculateDeadline({ kind, baseDate: base, createEvent: add, title: title.trim() || td(`kinds.${kind}`) });
      setRes(r);
      if (r.event) onAdded();
    } catch {
      setErr(td("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={td("title")}
      onClose={onClose}
      onSubmit={() => void run()}
      width={500}
      actions={
        <>
          <Btn onClick={onClose}>{d("close")}</Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!base}>
            {td("calculate")}
          </Btn>
        </>
      }
    >
      <p className="dx-dlg__text">{td("lead")}</p>
      <Field label={td("kind")}>
        <Seg label={td("kind")} small value={kind} onChange={setKind} items={KINDS.map((k) => ({ id: k, label: td(`kinds.${k}`) }))} />
      </Field>
      <p className="dxc-rule">
        <IconClock aria-hidden />
        {td(`rules.${kind}`)}
      </p>
      <div className="dxc-form2">
        <Field label={td("baseDate")}>
          <Input type="date" value={base} onChange={setBase} ariaLabel={td("baseDate")} />
        </Field>
        <Field label={td("eventTitle")}>
          <Input value={title} onChange={setTitle} placeholder={td("eventTitlePh")} maxLength={200} />
        </Field>
      </div>
      <label className="dxc-addrow">
        <span>{td("addToCalendar")}</span>
        <Toggle checked={add} onChange={setAdd} label={td("addToCalendar")} />
      </label>
      {err ? <p className="dxc-err">{err}</p> : null}
      {res ? (
        <div className="dxc-result">
          <b>{td("result", { date: dateOnly(res.deadline, locale) })}</b>
          <small>{res.event ? td("eventAdded") : td("notAdded")}</small>
        </div>
      ) : null}
    </Dialog>
  );
}
