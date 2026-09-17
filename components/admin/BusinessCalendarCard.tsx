"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getBusinessHours, simulateBusinessHours, addBusinessHoliday, removeBusinessHoliday, type BusinessSim } from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { ApiError } from "@/lib/http";
import { fmtDate } from "@/lib/date";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { IconCalendar, IconClock, IconPlus, IconClose } from "@/components/icons";

// Tashkent wall-clock "DD.MM.YYYY, HH:MM (Du)" for an ISO timestamp.
const DAYS: Record<string, string[]> = {
  uz: ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"],
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
function tashkent(iso: string, locale: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const d = new Date(t + 5 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (${(DAYS[locale] ?? DAYS.uz)[d.getUTCDay()]})`;
}
// Local Tashkent date + time → ISO with the +05:00 offset the backend expects.
const toIso = (day: string, hm: string) => `${day}T${hm || "09:00"}:00+05:00`;

// T0-20: the working-hours service as the tester sees it — schedule, public
// holidays (add / remove) and a "what if it were …" simulator that asks the
// backend for the advocate's 30-minute deadline at any moment.
export default function BusinessCalendarCard() {
  const t = useTranslations("admin.businessCalendar");
  const locale = useLocale();
  const [key, setKey] = useState(0);
  const bh = useResourceOne(getBusinessHours, [key]);
  const [day, setDay] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [simDay, setSimDay] = useState("");
  const [simTime, setSimTime] = useState("20:00");
  const [sim, setSim] = useState<BusinessSim | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const failMsg = (e: unknown) => (e instanceof ApiError && e.status === 403 ? t("forbidden") : e instanceof ApiError && e.detail ? e.detail : t("error"));

  async function add() {
    if (busy || !day) return;
    setBusy(true);
    setNote(null);
    try {
      await addBusinessHoliday(day, title.trim() || t("holidayDefault"));
      setDay("");
      setTitle("");
      setNote({ ok: true, msg: t("added") });
      setKey((k) => k + 1);
    } catch (e) {
      setNote({ ok: false, msg: failMsg(e) });
    } finally {
      setBusy(false);
    }
  }
  async function remove(d: string) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await removeBusinessHoliday(d);
      setKey((k) => k + 1);
    } catch (e) {
      setNote({ ok: false, msg: failMsg(e) });
    } finally {
      setBusy(false);
    }
  }
  async function simulate() {
    if (simBusy || !simDay) return;
    setSimBusy(true);
    setNote(null);
    try {
      setSim(await simulateBusinessHours(toIso(simDay, simTime)));
    } catch (e) {
      setSim(null);
      setNote({ ok: false, msg: failMsg(e) });
    } finally {
      setSimBusy(false);
    }
  }

  const h = bh.data;
  const dayNames = DAYS[locale] ?? DAYS.uz;
  return (
    <div className="ppanel">
      <div className="ppanel__h"><b className="ppanel__t"><span className="pico"><IconCalendar /></span>{t("title")}</b></div>
      <p className="ppanel__note">{t("lead")}</p>
      {bh.status === "loading" ? <Skeleton rows={2} /> : !h ? <Notice ok={false} msg={t("error")} /> : (
        <div className="bcal">
          <div className="bcal__sched">
            <span className="bcal__k">{t("schedule")}</span>
            <b>{h.days.map((d) => dayNames[d % 7]).join(", ")} · {h.start}–{h.end}</b>
            <small>{h.timezone}{h.isWorkingTime != null ? ` · ${h.isWorkingTime ? t("nowOpen") : t("nowClosed")}` : ""}</small>
          </div>

          <div className="bcal__sect">
            <span className="bcal__k">{t("holidays")} ({h.holidays.length})</span>
            {h.holidays.length ? (
              <div className="bcal__chips">
                {h.holidays.map((d) => (
                  <span className="bcal__chip" key={d}>
                    {fmtDate(d, locale)}
                    <button type="button" aria-label={t("remove")} title={t("remove")} disabled={busy} onClick={() => void remove(d)}><IconClose /></button>
                  </span>
                ))}
              </div>
            ) : <p className="advmuted">{t("noHolidays")}</p>}
            <div className="bcal__add">
              <DatePicker value={day} onChange={setDay} placeholder={t("dayPh")} ariaLabel={t("dayPh")} />
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePh")} aria-label={t("titlePh")} maxLength={80} />
              <button type="button" className="btn btn--pri btn--sm" disabled={busy || !day} onClick={() => void add()}><IconPlus />{busy ? t("saving") : t("add")}</button>
            </div>
          </div>

          <div className="bcal__sect">
            <span className="bcal__k">{t("simTitle")}</span>
            <p className="advmuted" style={{ margin: "0 0 8px" }}>{t("simLead")}</p>
            <div className="bcal__add">
              <DatePicker value={simDay} onChange={setSimDay} placeholder={t("simDayPh")} ariaLabel={t("simDayPh")} />
              <TimePicker value={simTime} onChange={setSimTime} placeholder="20:00" ariaLabel={t("simTimePh")} />
              <button type="button" className="btn btn--soft btn--sm" disabled={simBusy || !simDay} onClick={() => void simulate()}><IconClock />{simBusy ? t("simRunning") : t("simRun")}</button>
            </div>
            {sim ? (
              <div className="bcal__res">
                <div><span>{t("simAt")}</span><b>{tashkent(sim.at, locale)}</b></div>
                <div><span>{t("simStatus")}</span><b className={sim.isWorkingTime ? "ok" : "off"}>{sim.isWorkingTime ? t("simOpen") : sim.isWorkingDay ? t("simAfterHours") : t("simDayOff")}</b></div>
                <div><span>{t("simNext")}</span><b>{tashkent(sim.nextWorkStart, locale)}</b></div>
                <div className="bcal__res-main"><span>{t("simDeadline")}</span><b>{tashkent(sim.deadline30, locale)}</b></div>
              </div>
            ) : null}
          </div>
          {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        </div>
      )}
    </div>
  );
}
