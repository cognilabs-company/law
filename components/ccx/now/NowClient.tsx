"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import PersonName from "@/components/ui/PersonName";
import { fmtDuration, shortDate, shortDateTime } from "@/lib/date";
import { labelOf } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { CopyButton } from "./NowFocus";
import { prettyPhone } from "./feed";
import type { ClientInfo, Who } from "./useNow";
import { IcArrowRight, IcDoc, IcFlag, IcPhone, IcUser } from "../icons";

const CALL_STATUS = new Set(["completed", "missed", "no_answer", "busy"]);

function Block({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="opx-c360__blk">
      <h3>
        {title}
        <b className="opx-num">{count}</b>
      </h3>
      {children}
    </section>
  );
}

export default function NowClient({ who, client, notes = "", seller = false }: { who: Who; client: ClientInfo | null; notes?: string; seller?: boolean }) {
  const t = useTranslations("admin.ccx.now.c360");
  const tn = useTranslations("admin.ccx.now");
  const tq = useTranslations("admin.callCenter.queue");
  const locale = useLocale();
  const card = client?.card;
  const loading = Boolean(who.userId) && !client;
  const query = who.phone || who.lexgoId;
  const calls = (client?.calls ?? []).slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const name = who.name || card?.client.name || "";

  if (seller && !who.userId) {
    return (
      <aside className="opx-c360" aria-labelledby="opx-c360-h" data-ai-target="callcenter:now:client">
        <header className="opx-c360__head">
          <h2 id="opx-c360-h">{t("title")}</h2>
        </header>
        <p className="opx-c360__note">{t("sellerJob")}</p>
      </aside>
    );
  }

  return (
    <aside className="opx-c360" aria-labelledby="opx-c360-h" data-ai-target="callcenter:now:client">
      <header className="opx-c360__head">
        <h2 id="opx-c360-h">{t("title")}</h2>
        {query ? (
          <Link className="opx-c360__full" href={`/admin/call-center?view=clients&q=${encodeURIComponent(query)}`}>
            {t("full")}
            <IcArrowRight size={15} />
          </Link>
        ) : null}
      </header>

      <div className="opx-c360__id">
        <span className="opx-av opx-av--lg" aria-hidden="true">
          {name ? initials(name) : <IcUser size={24} />}
        </span>
        <div className="opx-c360__who">
          <b>{name || (who.userId ? <PersonName id={who.userId} fallback={tn("unknownClient")} /> : tn("unknownClient"))}</b>
          {who.phone ? (
            <span>
              <IcPhone size={15} />
              <span className="opx-num">{prettyPhone(who.phone)}</span>
              <CopyButton value={who.phone} label={tn("phone")} />
            </span>
          ) : null}
          {who.lexgoId ? (
            <span>
              <small>{tn("lexgoId")}</small>
              <span className="opx-num">{who.lexgoId}</span>
              <CopyButton value={who.lexgoId} label={tn("lexgoId")} />
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="opx-c360__wait" aria-busy="true">
          <i className="opx-shim opx-shim--tiles" />
          <i className="opx-shim opx-shim--block" />
          <i className="opx-shim opx-shim--block" />
        </div>
      ) : !who.userId ? (
        <p className="opx-c360__note">{t("guest")}</p>
      ) : client?.denied ? (
        <p className="opx-c360__note">{t("denied")}</p>
      ) : client?.failed ? (
        <p className="opx-c360__note opx-c360__note--bad">{t("failed")}</p>
      ) : null}

      {card ? (
        <dl className="opx-tiles">
          {(
            [
              ["orders", card.summary.orders],
              ["leads", card.summary.leads],
              ["cases", card.summary.cases],
              ["complaints", card.summary.complaints],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="opx-tile">
              <dt>{t(k)}</dt>
              <dd className="opx-num">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {client?.calls ? (
        <Block title={t("calls")} count={calls.length}>
          {calls.length ? (
            <ul className="opx-rows">
              {calls.slice(0, 3).map((c) => (
                <li key={c.id} data-dir={c.direction === "outgoing" ? "out" : "in"} data-st={c.status}>
                  <span className="opx-rows__ic" aria-hidden="true">
                    <IcPhone size={16} />
                  </span>
                  <span className="opx-rows__main">
                    <b className="opx-num">{shortDateTime(c.createdAt, locale)}</b>
                    <small>{[c.direction === "outgoing" ? t("out") : t("in"), c.topic].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span className="opx-rows__end opx-num">{c.durationSec ? fmtDuration(c.durationSec, locale) : CALL_STATUS.has(c.status) ? t(`call.${c.status}`) : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="opx-c360__none">{t("noCalls")}</p>
          )}
        </Block>
      ) : null}

      {card ? (
        <Block title={t("related")} count={card.orders.length}>
          {card.orders.length ? (
            <ul className="opx-rows">
              {card.orders.slice(0, 3).map((o) => (
                <li key={o.id}>
                  <span className="opx-rows__ic" aria-hidden="true">
                    <IcDoc size={16} />
                  </span>
                  <span className="opx-rows__main">
                    <b className="opx-num">{o.workId || `#${o.id.slice(0, 8).toUpperCase()}`}</b>
                    <small>{o.serviceName || o.title}</small>
                  </span>
                  <span className="opx-rows__end">
                    <i className="opx-c360__pill">{labelOf(tq, "status", o.status)}</i>
                    <small className="opx-num">{shortDate(o.createdAt, locale)}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="opx-c360__none">{t("noOrders")}</p>
          )}
        </Block>
      ) : null}

      {card && card.complaints.length ? (
        <Block title={t("complaintList")} count={card.complaints.length}>
          <ul className="opx-rows">
            {card.complaints.slice(0, 2).map((c) => (
              <li key={c.id}>
                <span className="opx-rows__ic opx-rows__ic--warn" aria-hidden="true">
                  <IcFlag size={16} />
                </span>
                <span className="opx-rows__main">
                  <b>{c.title}</b>
                  <small className="opx-num">{shortDate(c.createdAt, locale)}</small>
                </span>
                <span className="opx-rows__end">
                  <i className="opx-c360__pill">{labelOf(tq, "status", c.status)}</i>
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {notes.trim() ? (
        <Block title={t("notes")} count={1}>
          <p className="opx-c360__notes">{notes.trim()}</p>
        </Block>
      ) : null}
    </aside>
  );
}
