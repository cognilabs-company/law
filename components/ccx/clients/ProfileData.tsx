"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CcClientCard } from "@/lib/services/backend";
import { dateOnly, shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { leadCategoryLabel, leadSourceLabel } from "@/lib/leadLabels";
import { humanize, labelOf, regionLabel } from "@/lib/labels";
import { useOrderStatusLabel } from "@/lib/orderStatus";
import { CopyButton } from "../now/NowFocus";
import { prettyPhone } from "../now/feed";
import { IcAward, IcCoins, IcDoc, IcFlag, IcInbox, IcTimeline, IcUser } from "../icons";
import { Pill, activityDetail, activityLabel, toneOf } from "./parts";

type Tab = "orders" | "payments" | "leads" | "complaints" | "activity" | "family" | "subs";

const TABS: Tab[] = ["orders", "payments", "leads", "complaints", "activity", "family", "subs"];
const ACTIVITY_SHOWN = 15;
const PLAIN_SUM = /^\d[\d\s.,]*$/;

function Row({ icon, title, meta, end }: { icon: ReactNode; title: ReactNode; meta?: string; end?: ReactNode }) {
  return (
    <li className="opx-cl-item">
      <span className="opx-cl-item__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-cl-item__main">
        <b>{title}</b>
        {meta ? <small>{meta}</small> : null}
      </span>
      {end ? <span className="opx-cl-item__end">{end}</span> : null}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="opx-cl-none opx-cl-none--box">{text}</p>;
}

export default function ProfileData({ card }: { card: CcClientCard }) {
  const t = useTranslations("admin.ccx.clients");
  const tcard = useTranslations("admin.callCenter.card");
  const tc = useTranslations("admin.callCenter");
  const tp = useTranslations("admin.pipeline");
  const te = useTranslations("enums");
  const tpay = useTranslations("portal.client.payments");
  const tsom = useTranslations("portal.payment");
  const tcm = useTranslations("portal.common");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const orderStatus = useOrderStatusLabel();
  const uid = useId();
  const [tab, setTab] = useState<Tab>("orders");
  const when = (v: string) => shortDateTime(v, locale);
  const som = tsom("som");

  const counts: Record<Tab, number> = {
    orders: card.orders.length,
    payments: card.payments.length,
    leads: card.leads.length,
    complaints: card.complaints.length,
    activity: Math.min(ACTIVITY_SHOWN, card.activities.length),
    family: card.familyMembers.length,
    subs: card.subscriptions.length,
  };
  const label = (k: Tab) =>
    k === "orders" ? tcard("tabs.orders") : k === "payments" ? tcard("tabs.payments") : k === "leads" ? t("leads") : k === "complaints" ? tcard("sumComplaints") : k === "activity" ? tcard("tabs.activity") : k === "family" ? t("family") : t("subs");

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, k: Tab) => {
    const at = TABS.indexOf(k);
    const to =
      e.key === "ArrowRight"
        ? TABS[(at + 1) % TABS.length]
        : e.key === "ArrowLeft"
          ? TABS[(at - 1 + TABS.length) % TABS.length]
          : e.key === "Home"
            ? TABS[0]
            : e.key === "End"
              ? TABS[TABS.length - 1]
              : null;
    if (!to) return;
    e.preventDefault();
    setTab(to);
    document.getElementById(`${uid}-tab-${to}`)?.focus();
  };

  const orderLabel = (s: string) => {
    const k = s.trim().toLowerCase();
    if (!k) return "";
    if (tcm.has(`orderStatus.${k}`)) return orderStatus(k);
    if (tc.has(`queue.status.${k}`)) return tc(`queue.status.${k}`);
    if (tpay.has(`statuses.${k}`)) return tpay(`statuses.${k}`);
    return orderStatus(k);
  };
  const sum = (budget: string) => (!budget ? none : PLAIN_SUM.test(budget.trim()) ? `${budget} ${som}` : budget);

  let panel: ReactNode;
  if (tab === "orders") {
    panel = card.orders.length ? (
      <div className="opx-cl-tablewrap">
        <table className="opx-cl-table">
          <thead>
            <tr>
              <th scope="col">{tpay("id")}</th>
              <th scope="col">{tpay("what")}</th>
              <th scope="col">{tpay("statusCol")}</th>
              <th scope="col" className="is-num">
                {tpay("amount")}
              </th>
              <th scope="col">{tpay("date")}</th>
              <th scope="col">{t("lawyer")}</th>
            </tr>
          </thead>
          <tbody>
            {card.orders.map((o) => (
              <tr key={o.id}>
                <td data-label={tpay("id")}>
                  <span className="opx-cl-code opx-num">
                    <IcDoc size={16} />
                    {o.workId || `#${o.id.slice(0, 8).toUpperCase()}`}
                  </span>
                </td>
                <td data-label={tpay("what")} className="is-main">
                  {o.serviceName || o.title || none}
                </td>
                <td data-label={tpay("statusCol")}>
                  <Pill tone={toneOf(o.status)}>{orderLabel(o.status) || none}</Pill>
                </td>
                <td data-label={tpay("amount")} className="is-num">
                  {sum(o.budget)}
                </td>
                <td data-label={tpay("date")} className="opx-num">
                  {o.createdAt ? dateOnly(o.createdAt, locale) : none}
                </td>
                <td data-label={t("lawyer")}>{o.lawyerName || none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty text={tcard("noOrders")} />
    );
  } else if (tab === "payments") {
    panel = card.payments.length ? (
      <div className="opx-cl-tablewrap">
        <table className="opx-cl-table">
          <thead>
            <tr>
              <th scope="col">{tpay("date")}</th>
              <th scope="col">{tpay("what")}</th>
              <th scope="col" className="is-num">
                {tpay("amount")}
              </th>
              <th scope="col">{tpay("statusCol")}</th>
            </tr>
          </thead>
          <tbody>
            {card.payments.map((p) => (
              <tr key={p.id}>
                <td data-label={tpay("date")} className="opx-num">
                  {p.createdAt ? when(p.createdAt) : none}
                </td>
                <td data-label={tpay("what")} className="is-main">
                  {tpay.has(`kinds.${p.kind}`) ? tpay(`kinds.${p.kind}`) : p.description || humanize(p.kind) || none}
                </td>
                <td data-label={tpay("amount")} className="is-num">
                  {fmtUzs(p.amount)} {som}
                </td>
                <td data-label={tpay("statusCol")}>
                  <Pill tone={toneOf(p.status)}>{labelOf(tpay, "statuses", p.status) || none}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty text={tcard("noPayments")} />
    );
  } else if (tab === "leads") {
    panel = card.leads.length ? (
      <ul className="opx-cl-items">
        {card.leads.map((l) => (
          <Row
            key={l.id}
            icon={<IcInbox size={17} />}
            title={leadCategoryLabel(tp, l.category) || tp("untitledLead")}
            meta={[l.source ? leadSourceLabel(te, l.source) : "", l.region ? regionLabel(te, l.region) : "", when(l.createdAt)].filter(Boolean).join(" · ")}
            end={l.status ? <Pill tone={toneOf(l.status)}>{labelOf(tc, "queue.stages", l.status)}</Pill> : null}
          />
        ))}
      </ul>
    ) : (
      <Empty text={t("noLeads")} />
    );
  } else if (tab === "complaints") {
    panel = card.complaints.length ? (
      <ul className="opx-cl-items">
        {card.complaints.map((c) => (
          <Row
            key={c.id}
            icon={<IcFlag size={17} />}
            title={c.title || none}
            meta={when(c.createdAt)}
            end={c.status ? <Pill tone={toneOf(c.status)}>{labelOf(tc, "queue.status", c.status)}</Pill> : null}
          />
        ))}
      </ul>
    ) : (
      <Empty text={t("noComplaints")} />
    );
  } else if (tab === "activity") {
    panel = card.activities.length ? (
      <ul className="opx-cl-items">
        {card.activities.slice(0, ACTIVITY_SHOWN).map((a) => (
          <Row key={a.id} icon={<IcTimeline size={17} />} title={activityLabel(tcard, a.action) || none} meta={[activityDetail(a.detail), when(a.createdAt)].filter(Boolean).join(" · ")} />
        ))}
      </ul>
    ) : (
      <Empty text={tcard("noActivity")} />
    );
  } else if (tab === "family") {
    panel = card.familyMembers.length ? (
      <ul className="opx-cl-items">
        {card.familyMembers.map((f) => (
          <Row
            key={f.id}
            icon={<IcUser size={17} />}
            title={f.name || none}
            meta={f.relation}
            end={
              f.phone ? (
                <span className="opx-cl-phone opx-num">
                  {prettyPhone(f.phone)}
                  <CopyButton value={f.phone} label={f.name || f.phone} />
                </span>
              ) : null
            }
          />
        ))}
      </ul>
    ) : (
      <Empty text={t("noFamily")} />
    );
  } else {
    panel = card.subscriptions.length ? (
      <ul className="opx-cl-items">
        {card.subscriptions.map((s) => (
          <Row
            key={s.id}
            icon={s.status === "active" ? <IcAward size={17} /> : <IcCoins size={17} />}
            title={humanize(s.planId) || none}
            meta={[s.startsAt ? dateOnly(s.startsAt, locale) : "", s.endsAt ? dateOnly(s.endsAt, locale) : ""].filter(Boolean).join(" – ")}
            end={s.status ? <Pill tone={toneOf(s.status)}>{labelOf(tc, "status", s.status)}</Pill> : null}
          />
        ))}
      </ul>
    ) : (
      <Empty text={t("noSubs")} />
    );
  }

  return (
    <section className="opx-cl-data" aria-label={tcard("tabsAria")}>
      <div className="opx-cl-tabbar" role="tablist" aria-label={tcard("tabsAria")}>
        {TABS.map((k) => (
          <button
            key={k}
            id={`${uid}-tab-${k}`}
            type="button"
            role="tab"
            className={`opx-cl-tab${tab === k ? " is-on" : ""}`}
            aria-selected={tab === k}
            aria-controls={`${uid}-panel`}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}
            onKeyDown={(e) => onKey(e, k)}
          >
            {label(k)}
            <b className="opx-num">{counts[k]}</b>
          </button>
        ))}
      </div>
      <div id={`${uid}-panel`} className="opx-cl-panel" role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={0} key={tab}>
        {panel}
      </div>
    </section>
  );
}
