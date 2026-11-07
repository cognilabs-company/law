"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listAdminCalls } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtDateTime, fmtDuration, localDay } from "@/lib/date";
import { matchesSearch } from "@/lib/searchText";
import { statusSpecOf } from "@/lib/labels";
import { notify } from "@/lib/toast";
import { IcArrowRight, IcClose, IcMeeting, IcPhone, IcRefresh, IcSearch } from "../icons";
import { IcCalendar, IcUsers } from "./glyphs";
import { CALL_TONE, PAGE, PLAT_REFRESH_ID, STATUS_ORDER, countBy, dayStart, isTransient, ordered, reasonOf, useCallStatusMap, utcDay } from "./model";
import Select from "@/components/Select";
import DatePicker from "@/components/DatePicker";

export default function AllMeetings({ minute, onOpen }: { minute: number; onOpen: (id: string) => void }) {
  const t = useTranslations("admin.meetings");
  const tch = useTranslations("admin.callHistory");
  const tn = useTranslations("common.notify");
  const tpc = useTranslations("portal.common");
  const locale = useLocale();
  const uid = useId();
  const callMap = useCallStatusMap();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fromStart = dayStart(from);
  const toEnd = dayStart(to, 1);
  const apiFrom = fromStart === null ? undefined : utcDay(fromStart);
  const apiTo = toEnd === null ? undefined : utcDay(toEnd - 1);
  const platKey = `${apiFrom ?? ""}|${apiTo ?? ""}`;
  const keyRef = useRef(platKey);
  const reloadRef = useRef<() => void>(() => undefined);
  const res = useResource(() => listAdminCalls({ from: apiFrom, to: apiTo }), [apiFrom, apiTo]);
  const filterKey = [query.trim(), status, from, to].join("|");
  const [pager, setPager] = useState({ key: filterKey, n: PAGE });
  const limit = pager.key === filterKey ? pager.n : PAGE;

  useEffect(() => () => notify.dismiss(PLAT_REFRESH_ID), []);

  async function reload() {
    if (busy || res.status === "loading") return;
    notify.dismiss(PLAT_REFRESH_ID);
    setBusy(true);
    const key = platKey;
    try {
      if (res.status === "error") {
        await res.refresh();
        return;
      }
      const rows = await listAdminCalls({ from: apiFrom, to: apiTo });
      if (keyRef.current === key) res.setData(rows);
    } catch (e) {
      if (keyRef.current !== key) return;
      notify.error(t("refreshFailed"), {
        id: PLAT_REFRESH_ID,
        error: e,
        action: isTransient(e) ? { label: tn("retry"), onClick: () => reloadRef.current() } : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    keyRef.current = platKey;
    reloadRef.current = () => void reload();
  });

  const inRange =
    fromStart === null && toEnd === null
      ? res.data
      : res.data.filter((c) => {
          const ts = new Date(c.startedAt || c.createdAt).getTime();
          return Number.isNaN(ts) || ((fromStart === null || ts >= fromStart) && (toEnd === null || ts < toEnd));
        });
  const matched = query.trim() ? inRange.filter((c) => matchesSearch(`${c.title} ${c.creatorName}`, query)) : inRange;
  const counts = countBy(matched, (c) => c.status);
  const found = ordered(counts, STATUS_ORDER);
  const statuses = status && !found.includes(status) ? [...found, status] : found;
  const list = status ? matched.filter((c) => c.status === status) : matched;
  const filtered = Boolean(query.trim() || status || from || to);
  const statusOf = (s: string) => statusSpecOf(callMap, s)?.label ?? "";
  const thisYear = minute ? localDay(minute * 60000).slice(0, 4) : "";
  const when = (iso: string) => fmtDateTime(iso, locale, localDay(iso).slice(0, 4) !== thisYear);
  const visible = list.slice(0, limit);
  const rest = list.length - visible.length;

  return (
    <>
      <div className="opx-mtg-panel__head">
        <span className="opx-mtg-box__ic" aria-hidden="true">
          <IcCalendar size={19} />
        </span>
        <h3>{tch("title")}</h3>
        {res.status === "ready" ? <b className="opx-mtg-count opx-num">{list.length}</b> : null}
        <button
          type="button"
          className="opx-mtg-icon opx-mtg-panel__sync"
          onClick={() => void reload()}
          disabled={busy || res.status === "loading"}
          aria-busy={busy || res.status === "loading" || undefined}
          aria-label={t("refresh")}
          title={t("refresh")}
        >
          <IcRefresh size={17} />
        </button>
      </div>
      <div className="opx-mtg-filters">
        <label className="opx-mtg-in opx-mtg-in--search">
          <IcSearch size={16} />
          <span className="opx-sr">{tch("searchPh")}</span>
          <input type="search" value={query} placeholder={tch("searchPh")} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        </label>
        <span className="opx-mtg-pick">
          <Select value={status} onChange={setStatus} ariaLabel={tpc("filterStatus")} options={[{ value: "", label: tpc("filterAllStatuses") }, ...statuses.map((s) => ({ value: s, label: `${statusOf(s) || s} (${counts.get(s) ?? 0})` }))]} />
        </span>
        <span className="opx-mtg-pick">
          <DatePicker value={from} max={to || undefined} placeholder={tch("from")} ariaLabel={tch("from")} onChange={setFrom} />
        </span>
        <span className="opx-mtg-pick">
          <DatePicker value={to} min={from || undefined} placeholder={tch("to")} ariaLabel={tch("to")} onChange={setTo} />
        </span>
        {from || to ? (
          <button
            type="button"
            className="opx-mtg-icon"
            aria-label={tch("clearDates")}
            title={tch("clearDates")}
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            <IcClose size={16} />
          </button>
        ) : null}
      </div>
      {res.status === "loading" ? (
        <div className="opx-mtg-skel" aria-busy="true">
          <i className="opx-shim" />
          <i className="opx-shim" />
          <i className="opx-shim" />
        </div>
      ) : res.status === "error" ? (
        <div className="opx-mtg-state is-bad" role="alert">
          <h4>{t("historyLoadFailed")}</h4>
          {reasonOf(res.error) ? <p>{reasonOf(res.error)}</p> : null}
          <button type="button" className="opx-pbtn" onClick={() => void res.refresh()}>
            <IcRefresh size={16} />
            {tn("retry")}
          </button>
        </div>
      ) : !list.length ? (
        <div className="opx-mtg-state">
          <span className="opx-mtg-state__ic" aria-hidden="true">
            {filtered ? <IcSearch size={26} /> : <IcMeeting size={26} />}
          </span>
          <h4>{filtered ? tch("noMatch") : tch("empty")}</h4>
          <p>{filtered ? tch("noMatchText") : tch("emptyText")}</p>
        </div>
      ) : (
        <>
          <ul className="opx-mtg-rows" aria-labelledby={`${uid}-n`}>
            {visible.map((c, i) => {
              const start = c.startedAt || c.createdAt;
              const dur = fmtDuration(c.durationSeconds, locale);
              const inner = (
                <>
                  <span className={`opx-mtg-row__ic${c.status === "active" ? " is-live" : ""}`} aria-hidden="true">
                    {c.callType === "audio" ? <IcPhone size={18} /> : c.status === "scheduled" ? <IcCalendar size={18} /> : <IcMeeting size={18} />}
                  </span>
                  <span className="opx-mtg-row__txt">
                    <b>{c.title || tch("untitled")}</b>
                    <span className="opx-mtg-row__meta opx-num">
                      {start ? <span>{when(start)}</span> : null}
                      {dur ? <span>{dur}</span> : null}
                      {c.participantCount > 0 ? (
                        <span>
                          <IcUsers size={14} />
                          {tch("participantCount", { n: c.participantCount })}
                        </span>
                      ) : null}
                      {c.creatorName ? <span>{c.creatorName}</span> : null}
                    </span>
                  </span>
                  {c.status && c.status !== status ? (
                    <span className="opx-pill" data-tone={CALL_TONE[c.status] ?? "mute"}>
                      {statusOf(c.status) || c.status}
                    </span>
                  ) : null}
                  {c.id ? <IcArrowRight size={16} className="opx-mtg-row__go" /> : null}
                </>
              );
              return (
                <li key={c.id || `p${i}`}>
                  {c.id ? (
                    <button type="button" className="opx-mtg-row" aria-haspopup="dialog" onClick={() => onOpen(c.id)}>
                      {inner}
                    </button>
                  ) : (
                    <div className="opx-mtg-row">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <span id={`${uid}-n`} className="opx-sr">
            {tch("title")}
          </span>
          {rest > 0 ? (
            <button type="button" className="opx-pbtn opx-mtg-more" onClick={() => setPager({ key: filterKey, n: limit + PAGE })}>
              {t("showMore", { n: rest })}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}
