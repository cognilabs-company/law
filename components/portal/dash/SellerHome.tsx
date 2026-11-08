"use client";

import "./dash1920.css";
import "./seller1920.css";
import { createElement, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  Files,
  Folder,
  Hourglass,
  Inbox,
  MapPin,
  MessageSquareText,
  Plus,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/useResource";
import {
  listCalendarEvents,
  listMyTasks,
  listNotifications,
  listOpenOrders,
  type BackendOrder,
  type CalendarEvent,
  type Notification,
} from "@/lib/services/backend";
import { getMarketplaceSeller, listMarketplaceOrders, type MarketOrder } from "@/lib/services/marketplace";
import { getMySellerRating, type SellerRating } from "@/lib/services/sellerRating";
import { useRulesGate } from "@/lib/services/rulesGate";
import { fmtUzs, uzs } from "@/lib/money";
import { fmtDuration, monthTitle, shortDateTime, timeOnly, weekdays } from "@/lib/date";
import { regionLabel } from "@/lib/labels";
import { LEGAL_AREAS, inArea } from "@/lib/legalAreas";
import { useRoleNav } from "../../RoleNavHost";
import { useSellerCabinet } from "../SellerCabinet";
import SellerDashboard from "../SellerDashboard";
import OrderActions from "../OrderActions";
import LicenseNudge from "../LicenseNudge";
import { useLxHeader } from "../shell/lxHeader";

// The advocate's and the lawyer's dashboard (reference/design-lexgo-1920/
// 2a_advokat_boshqaruv.png, 2b_yurist_boshqaruv.png): the same layout for
// both roles, only the route prefix and one shortcut differ. Every figure
// comes from the seller cabinet and the endpoints it already uses.

const num = (o: Record<string, unknown> | undefined, k: string): number => {
  const x = o?.[k];
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const localKey = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d);
};
const PAID = new Set(["paid", "succeeded", "success", "completed", "captured"]);
const DONE = new Set(["done", "completed", "cancelled", "canceled", "archived"]);

function areaIcon(texts: string[]): LucideIcon {
  const a = LEGAL_AREAS.find((x) => inArea(x, texts));
  return a ? (a.Icon as LucideIcon) : FileText;
}

export default function SellerHome({ role }: { role: "advocate" | "lawyer" }) {
  const t = useTranslations("lxSeller");
  const te = useTranslations("enums");
  const locale = useLocale();
  const { session } = useAuth();
  const cabinet = useSellerCabinet();
  const { hides } = useRoleNav();
  const base = `/portal/${role}`;
  const first = (session?.name ?? "").trim().split(/\s+/)[0] ?? "";
  useLxHeader(t("welcome", { name: first }));

  const live = !!cabinet.data && !cabinet.data.limitedAccess;
  const acceptOrders = cabinet.data ? cabinet.data.actions.acceptOrders : true;
  const orders = useResource(() => (live ? listOpenOrders() : Promise.resolve([] as BackendOrder[])), [live]);
  const ledger = useResource(() => (live ? listMarketplaceOrders("seller") : Promise.resolve([] as MarketOrder[])), [live]);
  const notes = useResource(() => (live ? listNotifications() : Promise.resolve([] as Notification[])), [live]);
  const tasks = useResource(() => (live ? listMyTasks() : Promise.resolve([])), [live]);
  const rating = useResource<SellerRating>(async () => {
    if (!live) return [];
    const r = await getMySellerRating();
    return r ? [r] : [];
  }, [live]);
  const reviews = useResource(async () => (live && session?.id ? (await getMarketplaceSeller(session.id)).reviews : []), [live, session?.id]);

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const events = useResource<CalendarEvent>(() => {
    if (!live) return Promise.resolve([]);
    const from = new Date(month.y, month.m, 1);
    const to = new Date(month.y, month.m + 2, 0, 23, 59);
    return listCalendarEvents({ from: from.toISOString(), to: to.toISOString() });
  }, [live, month.y, month.m]);

  const gate = useRulesGate(session?.id ?? "");
  const workload = cabinet.data?.stats.workload;
  const finance = cabinet.data?.stats.finance;
  const performance = cabinet.data?.stats.performance;

  const waiting = useMemo(
    () => orders.data.slice().sort((a, b) => (a.confirmationDeadlineAt || "9").localeCompare(b.confirmationDeadlineAt || "9")),
    [orders.data],
  );
  const todayKey = dayKey(now);
  const evToday = useMemo(() => events.data.filter((e) => localKey(e.startsAt) === todayKey && !DONE.has(e.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [events.data, todayKey]);
  const evNext = useMemo(() => events.data.filter((e) => localKey(e.startsAt) > todayKey && !DONE.has(e.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [events.data, todayKey]);
  const evDone = useMemo(() => events.data.filter((e) => DONE.has(e.status) || (localKey(e.startsAt) < todayKey && localKey(e.startsAt) >= dayKey(new Date(now.getFullYear(), now.getMonth(), 1)))), [events.data, todayKey, now]);
  const [dueTab, setDueTab] = useState<"today" | "upcoming" | "done">("today");
  const dueList = dueTab === "today" ? evToday : dueTab === "upcoming" ? evNext : evDone;
  const nearestToday = evToday.find((e) => new Date(e.startsAt).getTime() >= now.getTime()) ?? evToday[0];

  if (cabinet.data?.limitedAccess) return <SellerDashboard role={role} />;

  const deadlinesToday = Math.max(num(workload, "deadlines_today"), evToday.length);
  const activeCases = num(workload, "active_cases");
  const income = uzs(finance ?? {}, "earnings_month");
  const pendingPayout = uzs(finance ?? {}, "pending_payout");
  const payable = uzs(finance ?? {}, "payable");
  const firstWait = waiting[0];
  const firstLeft = firstWait?.confirmationDeadlineAt ? new Date(firstWait.confirmationDeadlineAt).getTime() - now.getTime() : null;

  const show = (href: string) => !hides(href);

  const newOrdersCard = (
    <>
      <span className="lxs-kpi__top">
        <span className="lxs-kpi__ic"><Inbox /></span>
        {acceptOrders ? <span className="lxs-kpi__go"><ArrowUpRight /></span> : null}
      </span>
      <span className="lxs-kpi__l">{t("kpi.newOrders")}</span>
      <b className="lxs-kpi__v">{orders.status === "loading" ? "…" : waiting.length}</b>
      {firstLeft !== null && firstLeft > 0 ? (
        <span className="lxs-kpi__chip"><Hourglass />{t("kpi.nearest")} <b>{t("kpi.left", { time: fmtDuration(firstLeft / 1000, locale) })}</b></span>
      ) : (
        <span className="lxs-kpi__note">{waiting.length ? "" : t("kpi.noneWaiting")}</span>
      )}
    </>
  );

  return (
    <div className="lxs">
      {/* Shown only while the advocate's license still needs to be sent. */}
      {role === "advocate" ? <LicenseNudge /> : null}
      {/* KPI row */}
      <div className="lxs-kpis">
        {/* No right to answer orders (cabinet available_actions.accept_orders
            false): the count stays readable, the way into the orders page
            (hidden from the menu too) does not. */}
        {acceptOrders ? (
          <Link href={role === "advocate" ? `${base}/opportunities` : `${base}/marketplace`} className="lxs-kpi lxs-kpi--pri">
            {newOrdersCard}
          </Link>
        ) : (
          <div className="lxs-kpi lxs-kpi--pri">{newOrdersCard}</div>
        )}
        <Link href={`${base}/calendar`} className="lxs-kpi">
          <span className="lxs-kpi__top">
            <span className="lxs-kpi__ic"><CalendarClock /></span>
            <span className="lxs-kpi__go"><ArrowUpRight /></span>
          </span>
          <span className="lxs-kpi__l">{t("kpi.deadlines")}</span>
          <b className="lxs-kpi__v">{deadlinesToday}</b>
          <span className="lxs-kpi__note"><Clock3 />{nearestToday ? t("kpi.nearestAt", { time: timeOnly(nearestToday.startsAt, locale) }) : t("kpi.noDeadlines")}</span>
        </Link>
        <Link href={`${base}/cases`} className="lxs-kpi">
          <span className="lxs-kpi__top">
            <span className="lxs-kpi__ic"><BriefcaseBusiness /></span>
            <span className="lxs-kpi__go"><ArrowUpRight /></span>
          </span>
          <span className="lxs-kpi__l">{t("kpi.active")}</span>
          <b className="lxs-kpi__v">{activeCases}</b>
          <span className="lxs-kpi__note"><ArrowRight />{t("kpi.seeCases")}</span>
        </Link>
        <Link href={`${base}/marketplace-orders`} className="lxs-kpi">
          <span className="lxs-kpi__top">
            <span className="lxs-kpi__ic"><TrendingUp /></span>
            <span className="lxs-kpi__go"><ArrowUpRight /></span>
          </span>
          <span className="lxs-kpi__l">{t("kpi.income")}</span>
          <b className="lxs-kpi__v">{fmtUzs(income)} <small>{t("money.som")}</small></b>
          <span className="lxs-kpi__note"><Hourglass />{t("kpi.pending", { sum: `${fmtUzs(pendingPayout)} ${t("money.som")}` })}</span>
        </Link>
      </div>

      <div className="lxs-grid">
        {/* Waiting for you */}
        <section className="lx-card lxs-wait" aria-labelledby="lxs-wait-h">
          <div className="lxs-h">
            <span className="lxs-h__ic"><Hourglass /></span>
            <div className="lxs-h__t">
              <h2 id="lxs-wait-h">{t("wait.title")}</h2>
              <small>{t("wait.sub")}</small>
            </div>
            <Link href={`${base}/marketplace-orders`} className="btn btn--soft btn--sm btn--pill">{t("wait.all")}<ArrowRight /></Link>
          </div>
          {orders.status === "loading" ? (
            <div className="lxs-list"><div className="cx-skel cx-skel--tall" /><div className="cx-skel cx-skel--tall" /></div>
          ) : orders.status === "error" ? (
            <div className="cx-empty"><b>{t("wait.error")}</b><button type="button" className="btn btn--line btn--sm" onClick={() => void orders.refresh()}>{t("wait.retry")}</button></div>
          ) : !waiting.length ? (
            <div className="cx-empty"><span className="cx-empty__ic"><Inbox /></span><b>{t("wait.empty")}</b><p>{t("wait.emptyText")}</p></div>
          ) : (
            <div className="lxs-list">
              {waiting.slice(0, 3).map((o, i) => (
                <WaitCard key={o.id} o={o} first={i === 0} base={base} now={now.getTime()} regionText={o.region ? regionLabel(te, o.region) : ""} onDone={() => void orders.refresh()} />
              ))}
            </div>
          )}
        </section>

        <div className="lxs-col">
          {/* Calendar */}
          <section className="lx-card lxs-cal" aria-labelledby="lxs-cal-h">
            <div className="lxs-cal__h">
              <h2 id="lxs-cal-h" className="lxs-h3">{t("cal.title")}</h2>
              <div className="lxs-cal__nav">
                <button type="button" aria-label={t("cal.prev")} onClick={() => setMonth((v) => (v.m ? { y: v.y, m: v.m - 1 } : { y: v.y - 1, m: 11 }))}><ChevronLeft /></button>
                <b>{monthTitle(month.y, month.m, locale)}</b>
                <button type="button" aria-label={t("cal.next")} onClick={() => setMonth((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}><ChevronRight /></button>
              </div>
            </div>
            <MonthGrid y={month.y} m={month.m} today={todayKey} events={events.data} locale={locale} base={base} />
          </section>

          {/* Deadlines */}
          <section className="lx-card lxs-due" aria-labelledby="lxs-due-h">
            <h2 id="lxs-due-h" className="lxs-h3">{t("due.title")}</h2>
            <div className="lxs-seg" role="tablist">
              {(["today", "upcoming", "done"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={dueTab === k} className={dueTab === k ? "on" : ""} onClick={() => setDueTab(k)}>
                  {t(`due.${k}`, { n: k === "today" ? evToday.length : k === "upcoming" ? evNext.length : evDone.length })}
                </button>
              ))}
            </div>
            {dueList.length ? (
              <ul className="lxs-due__list">
                {dueList.slice(0, 5).map((e) => {
                  const ms = new Date(e.startsAt).getTime() - now.getTime();
                  return (
                    <li key={e.id}>
                      <Link href={`${base}/calendar`} className="lxs-due__it">
                        <span className={`lxs-due__time${dueTab === "today" && ms > 0 && ms < 3 * 3600_000 ? " is-hot" : ""}`}>
                          <b>{timeOnly(e.startsAt, locale)}</b>
                          <small>{dueTab === "today" ? t("due.todayTag") : shortDateTime(e.startsAt, locale).split(",")[0]}</small>
                        </span>
                        <span className="lxs-due__b">
                          <b>{e.title}</b>
                          <small>
                            {e.type === "meeting" ? <Video /> : <Clock3 />}
                            {dueTab === "today" && ms > 0 ? t("due.left", { time: fmtDuration(ms / 1000, locale) }) : t(`due.${["meeting", "court", "task"].includes(e.type) ? e.type : "deadline"}`)}
                            {e.location ? ` · ${e.location}` : ""}
                          </small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="lxs-muted">{t("due.empty")}</p>
            )}
          </section>
        </div>
      </div>

      <div className="lxs-grid lxs-grid--money">
        <MoneyCard orders={ledger.data} status={ledger.status} income={income} pending={pendingPayout} payable={payable} base={base} now={now} />
        <RatingCard href={`${base}/profile?tab=work#rating`} rating={rating.data[0] ?? null} reviews={reviews.data} performance={performance} workload={workload} profileCases={cabinet.data?.profile.totalCases ?? 0} />
      </div>

      <div className="lxs-trio">
        {/* Notifications */}
        <section className="lx-card lxs-notes" aria-labelledby="lxs-n-h">
          <div className="lxs-row-h">
            <h2 id="lxs-n-h" className="lxs-h3">{t("notif.title")}</h2>
            <Link href={`${base}/notifications`} className="btn btn--soft btn--sm btn--pill">{t("notif.all")}</Link>
          </div>
          {notes.data.length ? (
            <ul className="lxs-notes__list">
              {notes.data.slice(0, 5).map((n) => (
                <li key={n.id} className={n.read ? "" : "is-new"}>
                  <span className="lxs-notes__ic">{noteIcon(n)}</span>
                  <span className="lxs-notes__b">
                    <b>{n.title || n.body}</b>
                    <small>{shortDateTime(n.createdAt, locale)}</small>
                  </span>
                  {n.read ? null : <span className="lxs-new">{t("notif.new")}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="lxs-muted">{notes.status === "loading" ? "…" : t("notif.empty")}</p>
          )}
        </section>

        {/* Today's tasks */}
        <section className="lx-card lxs-tasks" aria-labelledby="lxs-t-h">
          <div className="lxs-row-h">
            <h2 id="lxs-t-h" className="lxs-h3">{t("tasks.title")}</h2>
            <span className="lxs-count">{t("tasks.count", { n: todayTodos().length })}</span>
          </div>
          <ul className="lxs-tasks__list">
            {todayTodos().length ? (
              todayTodos().map((x) => (
                <li key={x.key}>
                  {x.href ? (
                    <Link href={x.href} className="lxs-todo">
                      <span className="lxs-todo__ic"><x.Icon /></span>
                      <span className="lxs-todo__b"><b>{x.title}</b><small>{x.sub}</small></span>
                      <span className="lxs-todo__go"><ArrowRight /></span>
                    </Link>
                  ) : null}
                </li>
              ))
            ) : (
              <li className="lxs-muted">{t("tasks.empty")}</li>
            )}
          </ul>
          {role === "advocate" ? (
            show(`${base}/organization`) ? (
              <Link href={`${base}/organization`} className="lxs-dashed"><Building2 />{t("tasks.org")}<ChevronRight /></Link>
            ) : null
          ) : show(`${base}/documents`) ? (
            <Link href={`${base}/documents`} className="lxs-dashed"><Files />{t("tasks.templates")}<ChevronRight /></Link>
          ) : null}
        </section>

        {/* Quick actions */}
        <section className="lx-card lxs-quick" aria-labelledby="lxs-q-h">
          <h2 id="lxs-q-h" className="lxs-h3">{t("quick.title")}</h2>
          <div className="lxs-quick__grid">
            {[
              { k: "clients", href: `${base}/clients`, Icon: Users },
              { k: "files", href: `${base}/files`, Icon: Folder },
              { k: "calendar", href: `${base}/calendar`, Icon: CalendarDays },
              { k: "ai", href: `${base}/assistant`, Icon: Sparkles, pri: true },
            ]
              .filter((q) => show(q.href))
              .map((q) => (
                <Link key={q.k} href={q.href} className={`lxs-quick__it${q.pri ? " is-pri" : ""}`}>
                  <span className="lxs-quick__ic"><q.Icon /></span>
                  <b>{t(`quick.${q.k}`)}</b>
                </Link>
              ))}
          </div>
        </section>
      </div>

      {/* Services promo */}
      {show(`${base}/services`) ? (
        <section className="lx-card lxs-promo">
          <span className="lxs-promo__ic"><Store /></span>
          <div className="lxs-promo__b">
            <b>{t("promo.title")}</b>
            <p>{t("promo.text")}</p>
          </div>
          <Link href={`${base}/services?new=1`} className="btn btn--dark"><Plus />{t("promo.cta")}</Link>
        </section>
      ) : null}
    </div>
  );

  function todayTodos(): { key: string; title: string; sub: string; href: string; Icon: LucideIcon }[] {
    const out: { key: string; title: string; sub: string; href: string; Icon: LucideIcon }[] = [];
    if (deadlinesToday) out.push({ key: "dl", title: t("tasks.deadlines", { n: deadlinesToday }), sub: nearestToday ? t("tasks.deadlinesSub", { time: timeOnly(nearestToday.startsAt, locale) }) : "", href: `${base}/calendar`, Icon: CalendarClock });
    if (gate.closed && gate.missing.length) out.push({ key: "rules", title: t("tasks.rules"), sub: t("tasks.rulesSub", { n: gate.missing.length }), href: `${base}/services`, Icon: ScrollText });
    if (session && session.twoFactorEnabled === false) out.push({ key: "2fa", title: t("tasks.twofa"), sub: t("tasks.twofaSub"), href: `${base}/profile`, Icon: ShieldCheck });
    for (const x of tasks.data) {
      if (out.length >= 4) break;
      if (DONE.has((x.status || "").toLowerCase())) continue;
      if (x.dueDate && x.dueDate.slice(0, 10) > todayKey) continue;
      out.push({ key: `t-${x.id}`, title: x.title, sub: x.caseTitle || t("tasks.task"), href: `${base}/tasks`, Icon: CircleCheck });
    }
    return out.slice(0, 4);
  }
}

function noteIcon(n: Notification) {
  const k = `${n.kind} ${n.title}`.toLowerCase();
  if (/order|buyurtma|заказ/.test(k)) return <Inbox />;
  if (/message|xabar|chat|сообщ/.test(k)) return <MessageSquareText />;
  if (/pay|to'lov|оплат|payout/.test(k)) return <Wallet />;
  if (/meet|uchrash|встреч|calendar/.test(k)) return <CalendarClock />;
  if (/rule|qoida|правил/.test(k)) return <ScrollText />;
  return <ReceiptText />;
}

function WaitCard({ o, first, base, now, regionText, onDone }: { o: BackendOrder; first: boolean; base: string; now: number; regionText: string; onDone: () => void }) {
  const t = useTranslations("lxSeller");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const title = o.serviceName || o.title;
  const question = o.title && o.title !== o.serviceName ? o.title : "";
  const end = o.confirmationDeadlineAt ? new Date(o.confirmationDeadlineAt).getTime() : NaN;
  const start = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
  const left = Number.isFinite(end) ? end - now : null;
  const span = Number.isFinite(end) && Number.isFinite(start) && end > start ? end - start : 30 * 60_000;
  const pct = left === null ? 0 : Math.max(0, Math.min(100, (left / span) * 100));
  const urgent = left !== null && left < 10 * 60_000;
  const paid = PAID.has((o.paymentStatus || "").toLowerCase());
  return (
    <article className={`lxs-order${first && urgent ? " is-urgent" : ""}`}>
      <span className="lxs-order__bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      <div className="lxs-order__h">
        <span className="lxs-order__ic">{createElement(areaIcon([o.serviceName, o.title, o.areaKey]))}</span>
        <div className="lxs-order__t">
          <b>{title}</b>
          <span className="lxs-order__meta">
            {o.workId ? <code>{o.workId}</code> : null}
            {regionText ? <span><MapPin />{regionText}</span> : null}
          </span>
        </div>
        {left !== null ? (
          <span className={`lxs-left${urgent ? " is-hot" : ""}`}><Clock3 />{left > 0 ? t("kpi.left", { time: fmtDuration(left / 1000, locale) }) : t("wait.over")}</span>
        ) : null}
      </div>
      <div className={`lxs-q${open ? " is-open" : ""}`}>
        <span className="lxs-q__l"><MessageSquareText />{t("wait.question")}</span>
        <p>{question || t("wait.noQuestion")}</p>
        {question.length > 140 ? (
          <button type="button" className="cx-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t("wait.less") : t("wait.more")}
            <ChevronDown />
          </button>
        ) : (
          <Link href={`${base}/marketplace-orders/${o.id}`} className="cx-link">{t("wait.more")}<ChevronDown /></Link>
        )}
      </div>
      <div className="lxs-order__foot">
        <b className="lxs-order__price">{o.budget ? `${o.budget} ${t("money.som")}` : ""}</b>
        <span className={`lxs-pay${paid ? "" : " is-wait"}`}>{paid ? <BadgeCheck /> : <Hourglass />}{paid ? t("wait.paid") : t("wait.unpaid")}</span>
        <span className="lxs-order__acts">
          <Link href={`${base}/marketplace-orders/${o.id}`} className="btn btn--link btn--sm">{t("wait.details")}</Link>
          <OrderActions orderId={o.id} onDone={onDone} aiBase={`dashboard.orders.${o.id}`} />
        </span>
      </div>
    </article>
  );
}

function MonthGrid({ y, m, today, events, locale, base }: { y: number; m: number; today: string; events: CalendarEvent[]; locale: string; base: string }) {
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const marks = new Set(events.map((e) => localKey(e.startsAt)));
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="lxs-month">
      {weekdays(locale).map((w) => <span key={w} className="lxs-month__w">{w}</span>)}
      {cells.map((d, i) => {
        if (!d) return <span key={`e${i}`} />;
        const key = dayKey(new Date(y, m, d));
        const isToday = key === today;
        const has = marks.has(key);
        return (
          <Link key={key} href={`${base}/calendar`} className={`lxs-month__d${isToday ? " is-today" : ""}${has ? " has-ev" : ""}`} aria-current={isToday ? "date" : undefined}>
            {d}
            {has ? <i aria-hidden="true" /> : null}
          </Link>
        );
      })}
    </div>
  );
}

function MoneyCard({ orders, status, income, pending, payable, base, now }: { orders: MarketOrder[]; status: string; income: number; pending: number; payable: number; base: string; now: Date }) {
  const t = useTranslations("lxSeller");
  const locale = useLocale();
  const [all, setAll] = useState(false);
  const rows = useMemo(() => orders.filter((o) => o.price > 0).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [orders]);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <section className="lx-card lxs-money" aria-labelledby="lxs-m-h">
      <div className="lxs-row-h">
        <div className="lxs-h lxs-h--flat">
          <span className="lxs-h__ic"><Wallet /></span>
          <h2 id="lxs-m-h" className="lxs-h3">{t("money.title")}</h2>
        </div>
        <small className="lxs-muted">{t("money.period", { month: monthTitle(now.getFullYear(), now.getMonth(), locale) })}</small>
      </div>
      <div className="lxs-money__tiles">
        <div><span><TrendingUp />{t("money.month")}</span><b>{fmtUzs(income)} <small>{t("money.som")}</small></b></div>
        <div><span><Hourglass />{t("money.pending")}</span><b>{fmtUzs(pending)} <small>{t("money.som")}</small></b></div>
        <div><span><Wallet />{t("money.payable")}</span><b>{fmtUzs(payable)} <small>{t("money.som")}</small></b></div>
      </div>
      <div className="lxs-table" role="table">
        <div className="lxs-table__h" role="row">
          <span role="columnheader">{t("money.date")}</span>
          <span role="columnheader">{t("money.work")}</span>
          <span role="columnheader" className="r">{t("money.sum")}</span>
          <span role="columnheader" className="r">{t("money.status")}</span>
        </div>
        {shown.length ? (
          shown.map((o) => {
            const paid = PAID.has((o.paymentStatus || "").toLowerCase());
            return (
              <Link key={o.id} href={`${base}/marketplace-orders/${o.id}`} className="lxs-table__r" role="row">
                <span role="cell" className="lxs-muted">{shortDateTime(o.createdAt, locale).split(",")[0]}</span>
                <span role="cell"><b>{o.workId || o.serviceTitle}</b></span>
                <span role="cell" className="r"><b>{fmtUzs(o.price)} {t("money.som")}</b></span>
                <span role="cell" className="r"><span className={`lxs-pay${paid ? "" : " is-wait"}`}>{paid ? <BadgeCheck /> : <Hourglass />}{paid ? t("money.paid") : t("money.waiting")}</span></span>
              </Link>
            );
          })
        ) : (
          <p className="lxs-muted lxs-table__empty">{status === "loading" ? "…" : t("money.empty")}</p>
        )}
        {rows.length > 5 ? (
          <button type="button" className="lxs-table__more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? t("money.less") : t("money.more", { n: rows.length - 5 })}
            <ChevronDown />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RatingCard({ href, rating, reviews, performance, workload, profileCases }: { href: string; rating: SellerRating | null; reviews: { rating: number }[]; performance?: Record<string, unknown>; workload?: Record<string, unknown>; profileCases: number }) {
  const t = useTranslations("lxSeller");
  const locale = useLocale();
  // An unrated seller reads as such, never as the formula's placeholder score.
  const score = rating && rating.rated ? rating.publicRating : null;
  const count = rating?.reviews ?? reviews.length;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: reviews.filter((r) => Math.round(r.rating) === s).length }));
  const max = Math.max(1, ...dist.map((d) => d.n));
  const avgMin = num(performance, "avg_response_minutes") || (rating?.responseSeconds ? rating.responseSeconds / 60 : 0);
  const done = rating?.completed || num(workload, "completed_cases") || profileCases;
  return (
    <section className="lxs-rate" aria-labelledby="lxs-r-h">
      <div className="lxs-rate__h">
        <h2 id="lxs-r-h">{t("rate.title")}</h2>
        <Link href={href} className="lxs-rate__more">{t("rate.more")}<ArrowRight /></Link>
      </div>
      <div className="lxs-rate__score">
        <b>{score !== null ? score.toFixed(1).replace(".", locale === "en" ? "." : ",") : "—"}</b>
        <span>
          <span className="lxs-stars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={score !== null && i <= Math.round(score) ? "on" : ""} />)}
          </span>
          <small>{score !== null ? t("rate.based", { n: count }) : rating?.unratedText || t("rate.notRated")}</small>
        </span>
      </div>
      <ul className="lxs-rate__bars">
        {dist.map((d) => (
          <li key={d.s}>
            <span>{d.s}</span>
            <i><em style={{ width: `${(d.n / max) * 100}%` }} /></i>
            <span>{d.n}</span>
          </li>
        ))}
      </ul>
      <div className="lxs-rate__tiles">
        <div>
          <span><Clock3 />{t("rate.response")}</span>
          <b>{avgMin ? t("rate.min", { n: Math.round(avgMin) }) : "—"}</b>
          <small>{t("rate.avg")}</small>
        </div>
        <div>
          <span><CircleCheck />{t("rate.done")}</span>
          <b>{done}</b>
          <small>{t("rate.total")}</small>
        </div>
      </div>
    </section>
  );
}

