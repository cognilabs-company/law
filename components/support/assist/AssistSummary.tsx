"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, shortDateTime } from "@/lib/date";
import { humanize } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { formatUzPhone, isValidUzPhone } from "@/lib/phone";
import type { BackendPlan } from "@/lib/services/backend";
import type { SupportTicket } from "@/lib/services/support";
import { docPayPhase, isAssistPeriod, resolveAssistPlanNames, type AssistAiHistory, type AssistContext } from "@/lib/services/supportAssist";
import { IconAiAnswer, IconChevronRight, IconPhone, IconUser, IconVideo } from "@/components/icons";
import { StatusChip, sumText } from "./bits";

type Kind = "subs" | "pending" | "docs" | "orders";
const KINDS: Kind[] = ["subs", "pending", "docs", "orders"];
const PREVIEW = 3;
const AI_PREVIEW = 3;

export function AssistClientCard({
  ctx,
  ticket,
  onCall,
  calling = "",
}: {
  ctx: AssistContext;
  ticket: SupportTicket;
  onCall?: (type: "audio" | "video") => void;
  calling?: "audio" | "video" | "";
}) {
  const t = useTranslations("support.assist");
  const ts = useTranslations("support");
  const client = ctx.client;
  const name = client?.name || ticket.clientName;
  const lexgoId = client?.lexgoId || ticket.clientLexgoId;
  const rawPhone = client?.phone ?? "";
  const phone = rawPhone && isValidUzPhone(rawPhone) ? formatUzPhone(rawPhone) : rawPhone;
  const role = client?.role || "client";
  const tk = ctx.ticket;
  const status = ticket.status || tk?.status;
  const workId = tk?.workId || ticket.workId;
  const category = tk?.category || ticket.category;
  const subject = tk?.subject || ticket.title || ticket.description;
  const account = client?.accountStatus && client.accountStatus !== "active" ? client.accountStatus : "";
  return (
    <div className="sasst__card" data-ai-private>
      <div className="sasst__who">
        <span className="sasst__av" aria-hidden="true">
          {name ? initials(name) : <IconUser />}
        </span>
        <div className="sasst__name">
          <b>{name || t("client.noName")}</b>
          <span className="sasst__meta">
            {lexgoId ? <span>{t("client.lexgoId", { id: lexgoId })}</span> : null}
            {phone ? <a href={`tel:${phone.replace(/\s+/g, "")}`}>{phone}</a> : null}
            <span className="sasst__tag">{ts.has(`roles.${role}`) ? ts(`roles.${role}`) : humanize(role)}</span>
            {account ? <span className="sasst__tag sasst__tag--warn">{t("client.account", { status: humanize(account) })}</span> : null}
          </span>
        </div>
      </div>
      <div className="sasst__tkt">
        <span className="sasst__meta">
          <span className="sasst__lbl">{t("client.ticket")}</span>
          {workId ? <span className="sasst__wid">{workId}</span> : null}
          {status ? (
            <span className={`spill spill--${status}`}>
              <i aria-hidden="true" />
              {ts.has(`status.${status}`) ? ts(`status.${status}`) : humanize(status)}
            </span>
          ) : null}
          {category ? <span>{ts.has(`categories.${category}`) ? ts(`categories.${category}`) : humanize(category)}</span> : null}
        </span>
        {subject ? <p>{subject}</p> : null}
      </div>
      {onCall && ctx.capabilities.supportCall ? (
        <div className="sasst__calls">
          <span>{t("client.callLabel")}</span>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => onCall("audio")}
            disabled={Boolean(calling)}
            aria-busy={calling === "audio" || undefined}
            aria-label={t("client.callAudio")}
            title={t("client.callAudio")}
          >
            <IconPhone />
            {calling === "audio" ? ts("call.starting") : t("client.audio")}
          </button>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => onCall("video")}
            disabled={Boolean(calling)}
            aria-busy={calling === "video" || undefined}
            aria-label={t("client.callVideo")}
            title={t("client.callVideo")}
          >
            <IconVideo />
            {calling === "video" ? ts("call.starting") : t("client.video")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ title, children, via }: { title: string; children: ReactNode; via?: boolean }) {
  const t = useTranslations("support.assist");
  return (
    <li className="sasst__row">
      <b>{title}</b>
      <small>
        {children}
        {via ? <span className="sasst__tag">{t("overview.viaOperator")}</span> : null}
      </small>
    </li>
  );
}

export function AssistOverview({ ctx, plans, plansReady }: { ctx: AssistContext; plans: BackendPlan[]; plansReady: boolean }) {
  const t = useTranslations("support.assist");
  const locale = useLocale();
  const uid = useId();
  const [open, setOpen] = useState<Kind | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<Kind | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of plans) {
      const n = (p.name || p.title).trim();
      if (p.id && n) m[p.id] = n;
      if (p.slug && n) m[p.slug] = n;
    }
    return m;
  }, [plans]);

  const missingKey = plansReady
    ? Array.from(new Set(ctx.activeSubscriptions.map((s) => s.planId).filter((id) => id && !names[id])))
        .sort()
        .join(",")
    : "";

  useEffect(() => {
    if (!missingKey) return;
    let alive = true;
    resolveAssistPlanNames(missingKey.split(","), locale)
      .then((found) => {
        if (alive && Object.keys(found).length) setExtra((cur) => ({ ...cur, ...found }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [missingKey, locale]);

  const planName = (id: string, fallback = "") => names[id] || extra[id] || fallback || t("overview.unknownPlan");
  const periodText = (p: string, months = 0) => (isAssistPeriod(p) ? t(`period.${p}`) : months > 0 ? t("months", { n: months }) : p ? humanize(p) : "");

  const counts: Record<Kind, number> = {
    subs: ctx.activeSubscriptions.length,
    pending: ctx.pendingRequests.length,
    docs: ctx.recentDocuments.length,
    orders: ctx.recentOrders.length,
  };
  const auto: Kind | null = counts.pending ? "pending" : counts.subs ? "subs" : null;
  const shown = open === undefined ? auto : open;
  const full = expanded === shown;
  const cut = <T,>(items: T[]) => (full ? items : items.slice(0, PREVIEW));

  let body: ReactNode = null;
  if (shown === "subs") {
    body = ctx.activeSubscriptions.length ? (
      <ul className="sasst__list">
        {cut(ctx.activeSubscriptions).map((s) => (
          <Row key={s.id || s.planId} title={planName(s.planId)}>
            {s.billingPeriod ? <span>{periodText(s.billingPeriod)}</span> : null}
            {s.endsAt ? <span>{t("overview.until", { date: dateOnly(s.endsAt, locale) })}</span> : null}
            <StatusChip status={s.status} />
          </Row>
        ))}
      </ul>
    ) : (
      <p className="sasst__empty">{t("overview.subsEmpty")}</p>
    );
  } else if (shown === "pending") {
    body = ctx.pendingRequests.length ? (
      <ul className="sasst__list">
        {cut(ctx.pendingRequests).map((r) => (
          <Row key={r.id} title={r.planTitle || planName(r.planId, r.planSlug)} via={r.viaOperator}>
            {r.workId ? <span className="sasst__wid">{r.workId}</span> : null}
            {r.billingPeriod || r.months ? <span>{periodText(r.billingPeriod, r.months)}</span> : null}
            {r.amount > 0 ? <span>{sumText(t, r.amount, r.currency)}</span> : null}
            <StatusChip status={r.status} />
            {r.createdAt ? <span>{shortDateTime(r.createdAt, locale)}</span> : null}
          </Row>
        ))}
      </ul>
    ) : (
      <p className="sasst__empty">{t("overview.pendingEmpty")}</p>
    );
  } else if (shown === "docs") {
    body = ctx.recentDocuments.length ? (
      <ul className="sasst__list">
        {cut(ctx.recentDocuments).map((d) => (
          <Row key={d.id} title={d.title || d.workId} via={d.viaOperator}>
            {d.workId ? <span className="sasst__wid">{d.workId}</span> : null}
            {docPayPhase(d) === "pending" ? <span className="sasst__st sasst__st--warn">{t("pay.pendingShort")}</span> : <StatusChip status={d.status} prefer="docStatus" />}
            {d.requestedType ? <span>{d.requestedType}</span> : null}
            {d.createdAt ? <span>{shortDateTime(d.createdAt, locale)}</span> : null}
          </Row>
        ))}
      </ul>
    ) : (
      <p className="sasst__empty">{t("overview.docsEmpty")}</p>
    );
  } else if (shown === "orders") {
    body = ctx.recentOrders.length ? (
      <ul className="sasst__list">
        {cut(ctx.recentOrders).map((o) => (
          <Row key={o.id} title={o.title || o.workId} via={o.viaOperator}>
            {o.workId ? <span className="sasst__wid">{o.workId}</span> : null}
            {o.lawyerName ? <span>{o.lawyerName}</span> : null}
            {o.price > 0 ? <span>{sumText(t, o.price, o.currency)}</span> : null}
            <StatusChip status={o.status} prefer="orderStatus" />
          </Row>
        ))}
      </ul>
    ) : (
      <p className="sasst__empty">{t("overview.ordersEmpty")}</p>
    );
  }

  const total = shown ? counts[shown] : 0;

  return (
    <div className="sasst__card" data-ai-private>
      <h4 className="sasst__h4">{t("overview.heading")}</h4>
      <div className="sasst__stats">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`sasst__stat${k === "pending" && counts.pending ? " sasst__stat--warn" : ""}`}
            aria-expanded={shown === k}
            aria-controls={shown === k ? `${uid}-${k}` : undefined}
            onClick={() => setOpen(shown === k ? null : k)}
          >
            <b>{counts[k]}</b>
            <span>{t(`overview.${k}`)}</span>
          </button>
        ))}
      </div>
      {shown ? (
        <div id={`${uid}-${shown}`} className="sasst__drawer">
          {body}
          {total > PREVIEW ? (
            <button type="button" className="sasst__more" onClick={() => setExpanded(full ? null : shown)}>
              {full ? t("overview.showLess") : t("overview.showAll", { n: total })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AssistAiHistory({ history }: { history: AssistAiHistory }) {
  const t = useTranslations("support.assist");
  const locale = useLocale();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const turns = history.turns;
  if (!turns.length) return null;
  const shown = all ? turns : turns.slice(-AI_PREVIEW);
  const start = turns.length - shown.length;
  return (
    <div className="sasst__card sasst__ai" data-ai-private>
      <button type="button" className="sasst__aih" aria-expanded={open} aria-controls={open ? `${uid}-ai` : undefined} onClick={() => setOpen((v) => !v)}>
        <span className="sasst__aiic" aria-hidden="true">
          <IconAiAnswer />
        </span>
        <span className="sasst__ait">
          <b>{t("aiHistory.title")}</b>
          <small>{t("aiHistory.lead", { n: turns.length })}</small>
        </span>
        <IconChevronRight className="sasst__aichev" aria-hidden="true" />
      </button>
      {open ? (
        <div id={`${uid}-ai`} className="sasst__aibody">
          {turns.length > AI_PREVIEW ? (
            <button type="button" className="sasst__more" onClick={() => setAll((v) => !v)}>
              {all ? t("overview.showLess") : t("aiHistory.earlier", { n: start })}
            </button>
          ) : null}
          <ol className="sasst__aiq">
            {shown.map((x, i) => (
              <li key={start + i}>
                {x.q ? (
                  <div className="sasst__aiqq">
                    <span>
                      {t("aiHistory.client")}
                      {x.at ? <time dateTime={x.at}>{shortDateTime(x.at, locale)}</time> : null}
                    </span>
                    <p>{x.q}</p>
                  </div>
                ) : null}
                {x.a ? (
                  <div className="sasst__aiqa">
                    <span>{t("aiHistory.ai")}</span>
                    <p>{x.a}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          {history.sessionId ? <p className="sasst__aisid">{t("aiHistory.session", { id: history.sessionId })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
