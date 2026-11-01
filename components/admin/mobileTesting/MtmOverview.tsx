"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import DatePicker from "@/components/DatePicker";
import { fmtDate, fmtNum } from "@/lib/date";
import { isPrimaryOnly } from "@/lib/services/superadvokat";
import {
  USAGE_FILTERS,
  getMtmDashboard,
  listMtmInstallations,
  tashToday,
  type MtmDashboard,
  type MtmInstallation,
  type MtmInstallationPage,
  type MtmUsageFilter,
} from "@/lib/services/mobileTesting";
import { IconBolt, IconCalendar, IconCircleCheck, IconClock, IconLayers, IconMinus, IconSmartphone } from "@/components/icons";
import { LiveBar, MtmEmpty, MtmError, MtmForbidden, MtmFrame, MtmSkeleton, Pager, TashTime, TzNote, UsageBadge, useLabels, useMinutes, useMtmLive, useMtmLoad } from "./MtmBits";

const PAGE = 50;
const LIVE = ["mobile_testing.installation_registered", "mobile_testing.usage_updated", "mobile_testing.session_stale"] as const;

// Dashboard (contract §2) and device list (§3) for one Tashkent date. The
// date the backend returns is the one shown; with none picked yet the
// backend chooses today in Asia/Tashkent.
export default function MtmOverview({ initialDate, initialUsage }: { initialDate: string; initialUsage: string }) {
  const t = useTranslations("admin.mtm");
  const locale = useLocale();
  const router = useRouter();
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : "");
  const [usage, setUsage] = useState<MtmUsageFilter>((USAGE_FILTERS as readonly string[]).includes(initialUsage) ? (initialUsage as MtmUsageFilter) : "all");
  const [offset, setOffset] = useState(0);

  const dash = useMtmLoad<MtmDashboard>((s) => getMtmDashboard(date, s), `d:${date}`);
  // The list follows the dashboard's date, so cards and rows never disagree.
  const day = date || dash.data?.date || "";
  const list = useMtmLoad<MtmInstallationPage>(day ? (s) => listMtmInstallations({ date: day, usage, limit: PAGE, offset }, s) : null, `l:${day}:${usage}:${offset}`);

  const refetch = () => {
    dash.reload(true);
    list.reload(true);
  };
  const online = useMtmLive(LIVE, refetch);

  // Keep the date and filter in the address so Back from a device returns here.
  const remember = (d: string, u: MtmUsageFilter) => {
    const q = new URLSearchParams();
    if (d) q.set("date", d);
    if (u !== "all") q.set("usage", u);
    const s = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  };
  const pickDate = (d: string) => {
    setDate(d);
    setOffset(0);
    remember(d, usage);
  };
  const pickUsage = (u: MtmUsageFilter) => {
    setUsage(u);
    setOffset(0);
    remember(day, u);
  };

  if (dash.status === "error" && isPrimaryOnly(dash.error)) {
    return (
      <MtmFrame>
        <MtmForbidden />
      </MtmFrame>
    );
  }

  const d = dash.data;
  const shownDate = d?.date || date;
  const today = tashToday();
  const detailHref = (it: MtmInstallation) => `/admin/mobile-testing/devices/${encodeURIComponent(it.id)}${shownDate ? `?date=${shownDate}` : ""}`;

  return (
    <MtmFrame>
      <section className="mtm-bar" aria-label={t("dateLabel")}>
        <div className="mtm-date">
          <span className="mtm-date__ic" aria-hidden="true">
            <IconCalendar />
          </span>
          <span className="mtm-date__txt">
            <small>{t("selectedDate")}</small>
            <b data-testid="mtm-date">{shownDate ? fmtDate(shownDate, locale) : dash.status === "error" ? t("none") : t("loadingShort")}</b>
            <small className="mtm-date__tz">{t("dayIn", { tz: t("tzName") })}</small>
          </span>
          <div className="mtm-date__pick">
            <DatePicker value={date || d?.date || ""} onChange={(v) => v && pickDate(v)} placeholder={t("pickDate")} ariaLabel={t("pickDate")} max={today || undefined} />
          </div>
          {date && today && date !== today ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => pickDate(today)}>
              {t("today")}
            </button>
          ) : null}
        </div>
        <LiveBar online={online} at={list.at || dash.at} refreshing={dash.refreshing || list.refreshing} failed={dash.refreshFailed || list.refreshFailed} onRefresh={refetch} />
      </section>

      {dash.status === "loading" ? (
        <div className="mtm-cards">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="mtm-card mtm-card--skel" aria-hidden="true" />
          ))}
        </div>
      ) : dash.status === "error" ? (
        <MtmError error={dash.error} onRetry={() => dash.reload(false)} />
      ) : d ? (
        <Cards d={d} />
      ) : null}

      {dash.status === "ready" ? (
        <section className="mtm-panel" aria-labelledby="mtm-dev-h">
          <div className="mtm-panel__h">
            <div>
              <h2 id="mtm-dev-h">{t("devices.title")}</h2>
              <p>{t("devices.lead", { date: shownDate ? fmtDate(shownDate, locale) : "" })}</p>
            </div>
            <div className="mtm-panel__tools">
              <Segmented value={usage} onChange={pickUsage} />
              <TzNote />
            </div>
          </div>
          {list.status === "loading" ? (
            <MtmSkeleton rows={5} />
          ) : list.status === "error" ? (
            <MtmError error={list.error} onRetry={() => list.reload(false)} />
          ) : list.data && list.data.items.length ? (
            <>
              <DeviceTable items={list.data.items} hrefOf={detailHref} onOpen={(it) => router.push(detailHref(it))} />
              <Pager total={list.data.total} limit={list.data.limit || PAGE} offset={list.data.offset} onPage={setOffset} busy={list.refreshing} />
            </>
          ) : usage === "all" && (d?.summary.registeredDevices ?? 0) === 0 ? (
            <MtmEmpty icon={<IconSmartphone aria-hidden="true" />} title={t("empty.noDevices")} text={t("empty.noDevicesText")} />
          ) : (
            <MtmEmpty icon={<IconSmartphone aria-hidden="true" />} title={t(`empty.${usage}`)} text={t(`empty.${usage}Text`)}>
              <button type="button" className="btn btn--line btn--sm" onClick={() => pickUsage("all")}>
                {t("empty.showAll")}
              </button>
            </MtmEmpty>
          )}
        </section>
      ) : null}
    </MtmFrame>
  );
}

function Cards({ d }: { d: MtmDashboard }) {
  const t = useTranslations("admin.mtm.cards");
  const locale = useLocale();
  const minutes = useMinutes();
  const s = d.summary;
  const n = (v: number) => fmtNum(v, locale);
  const card = (key: string, icon: ReactNode, value: string, sub: string, tone: string, extra?: ReactNode) => (
    <div className="mtm-card" data-tone={tone} data-testid={`mtm-card-${key}`}>
      <span className="mtm-card__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="mtm-card__l">{t(key)}</span>
      <b className="mtm-card__v">{value}</b>
      <small className="mtm-card__s">{sub}</small>
      {extra}
    </div>
  );
  const total = s.registeredDevices;
  // Shares of the backend's own counts, for the thin split bar only.
  const share = (v: number) => (total > 0 ? `${Math.min(100, (v / total) * 100)}%` : "0%");
  return (
    <div className="mtm-cards">
      {card("registered", <IconSmartphone />, n(s.registeredDevices), t("registeredSub"), "brand")}
      {card(
        "used",
        <IconCircleCheck />,
        n(s.usedDevices),
        t("ofTotal", { total: n(total) }),
        "ok",
        <span className="mtm-split" aria-hidden="true">
          <i style={{ width: share(s.usedDevices) }} />
        </span>,
      )}
      {card(
        "unused",
        <IconMinus />,
        n(s.unusedDevices),
        t("ofTotal", { total: n(total) }),
        "off",
        <span className="mtm-split mtm-split--off" aria-hidden="true">
          <i style={{ width: share(s.unusedDevices) }} />
        </span>,
      )}
      {card("active", <IconBolt />, n(s.activeNow), t("activeSub"), "live")}
      {card("minutes", <IconClock />, minutes(s.totalForegroundMinutes), t("minutesSub", { n: fmtNum(s.totalForegroundMinutes, locale, Number.isInteger(s.totalForegroundMinutes) ? 0 : 1) }), "brand")}
      {card("sessions", <IconLayers />, n(s.sessions), t("sessionsSub"), "brand")}
    </div>
  );
}

// used / unused / all, as one handmade radio group.
function Segmented({ value, onChange }: { value: MtmUsageFilter; onChange: (v: MtmUsageFilter) => void }) {
  const t = useTranslations("admin.mtm.filter");
  const order: MtmUsageFilter[] = ["all", "used", "unused"];
  const move = (group: HTMLElement, dir: number) => {
    const i = (order.indexOf(value) + dir + order.length) % order.length;
    onChange(order[i]);
    group.querySelectorAll<HTMLButtonElement>("button")[i]?.focus();
  };
  return (
    <div
      className="mtm-seg"
      role="radiogroup"
      aria-label={t("label")}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(e.currentTarget, 1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(e.currentTarget, -1);
        }
      }}
    >
      {order.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          tabIndex={value === k ? 0 : -1}
          className="mtm-seg__b"
          onClick={() => onChange(k)}
        >
          {t(k)}
        </button>
      ))}
    </div>
  );
}

function DeviceTable({ items, hrefOf, onOpen }: { items: MtmInstallation[]; hrefOf: (it: MtmInstallation) => string; onOpen: (it: MtmInstallation) => void }) {
  const t = useTranslations("admin.mtm");
  const locale = useLocale();
  const minutes = useMinutes();
  const L = useLabels();
  const tester = (it: MtmInstallation) => (
    <span className="mtm-who">
      <Link href={hrefOf(it)} className="mtm-who__n" onClick={(e) => e.stopPropagation()}>
        {it.tester?.name || t("noTester")}
      </Link>
      {it.tester?.lexgoId ? <small>{it.tester.lexgoId}</small> : null}
    </span>
  );
  const statusDot = (it: MtmInstallation) => (
    <span className="mtm-dot" data-tone={it.status === "active" ? "ok" : "off"} title={L.installStatus(it.status)}>
      <span className="sr-only">{L.installStatus(it.status)}</span>
    </span>
  );
  const usageCell = (it: MtmInstallation) => (
    <span className="mtm-min">
      <b>{minutes(it.usage?.foregroundMinutes ?? 0)}</b>
      {it.usage?.used ? null : <UsageBadge used={false} />}
    </span>
  );
  return (
    <>
      <div className="mtm-tablewrap">
        <table className="mtm-table mtm-table--dev" data-testid="mtm-devices">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">{t("col.status")}</span>
              </th>
              <th scope="col">{t("col.tester")}</th>
              <th scope="col">{t("col.model")}</th>
              <th scope="col">{t("col.os")}</th>
              <th scope="col">{t("col.app")}</th>
              <th scope="col">{t("col.track")}</th>
              <th scope="col">{t("col.minutes")}</th>
              <th scope="col">{t("col.sessions")}</th>
              <th scope="col">{t("col.first")}</th>
              <th scope="col">{t("col.last")}</th>
              <th scope="col">{t("col.contact")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} data-used={it.usage?.used ? "1" : "0"} onClick={() => onOpen(it)}>
                <td>{statusDot(it)}</td>
                <td>{tester(it)}</td>
                <td>{L.device(it.manufacturer, it.model)}</td>
                <td>{it.osVersion ? t("osValue", { v: it.osVersion }) : t("none")}</td>
                <td>{it.appVersion || t("none")}</td>
                <td>{L.track(it.track)}</td>
                <td>{usageCell(it)}</td>
                <td className="mtm-num">{fmtNum(it.usage?.sessionCount ?? 0, locale)}</td>
                <td>
                  <TashTime iso={it.usage?.firstActivityAt ?? ""} date={false} />
                </td>
                <td>
                  <TashTime iso={it.usage?.lastActivityAt ?? ""} date={false} />
                </td>
                <td>
                  <TashTime iso={it.lastSeenAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mtm-cardlist" data-testid="mtm-devices-cards">
        {items.map((it) => (
          <li key={it.id} className="mtm-dcard" data-used={it.usage?.used ? "1" : "0"}>
            <div className="mtm-dcard__top">
              {statusDot(it)}
              {tester(it)}
              <span className="mtm-dcard__min">{usageCell(it)}</span>
            </div>
            <p className="mtm-dcard__dev">
              <IconSmartphone aria-hidden="true" />
              {L.device(it.manufacturer, it.model)}
              {it.osVersion ? ` · ${t("osValue", { v: it.osVersion })}` : ""}
              {it.appVersion ? ` · ${t("appValue", { v: it.appVersion })}` : ""}
            </p>
            <dl className="mtm-dcard__dl">
              <div>
                <dt>{t("col.track")}</dt>
                <dd>{L.track(it.track)}</dd>
              </div>
              <div>
                <dt>{t("col.sessions")}</dt>
                <dd>{fmtNum(it.usage?.sessionCount ?? 0, locale)}</dd>
              </div>
              <div>
                <dt>{t("col.first")}</dt>
                <dd>
                  <TashTime iso={it.usage?.firstActivityAt ?? ""} date={false} />
                </dd>
              </div>
              <div>
                <dt>{t("col.last")}</dt>
                <dd>
                  <TashTime iso={it.usage?.lastActivityAt ?? ""} date={false} />
                </dd>
              </div>
              <div className="mtm-dcard__wide">
                <dt>{t("col.contact")}</dt>
                <dd>
                  <TashTime iso={it.lastSeenAt} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
