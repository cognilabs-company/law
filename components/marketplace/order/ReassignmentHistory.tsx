"use client";

import "./reassign.css";
import type { ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shortDateTime } from "@/lib/date";
import type { MarketOrder, OrderReassignment } from "@/lib/services/marketplace";
import { glyph, ArrowRightLeftIcon, HistoryIcon } from "./icons";
import type { OrderView } from "./types";

// Every specialist change on this order (contract 2026-10-26 §10): when,
// who decided it, the client-visible reason, the replacement's acceptance
// deadline and when it was accepted. The new specialist's name appears only
// once the backend exposes it (after acceptance); internal operator notes
// never reach this response.

const TONE: Record<string, "ok" | "wait" | "bad"> = {
  accepted: "ok",
  completed: "ok",
  waiting_seller_response: "wait",
  pending: "wait",
  started: "wait",
  sent_to_seller: "wait",
  declined: "bad",
  rejected: "bad",
  expired: "bad",
  cancelled: "bad",
};

function Row({ r, view }: { r: OrderReassignment; view: OrderView }): ReactElement {
  const t = useTranslations("marketplace.orderDetail.reassignment");
  const locale = useLocale();
  const tone = TONE[r.status] ?? "wait";
  const operator = r.operator?.name || t("callCenter");
  const when = r.reassignedAt ? shortDateTime(r.reassignedAt, locale) : "";
  return (
    <li className="mrh__row" data-tone={tone}>
      <span className="mrh__dot" aria-hidden="true">
        {glyph(ArrowRightLeftIcon, { size: 14 })}
      </span>
      <div className="mrh__body">
        <p className="mrh__line">
          {when ? <time dateTime={r.reassignedAt}>{when}</time> : null}
          <b>{t("changedBy", { who: operator })}</b>
        </p>
        {r.reason ? <p className="mrh__reason">{t("reason", { text: r.reason })}</p> : null}
        <p className="mrh__people">
          {r.previousSeller?.name ? <span>{t("from", { name: r.previousSeller.name })}</span> : null}
          {r.newSeller?.name ? <span>{t("to", { name: r.newSeller.name })}</span> : view === "client" && tone === "wait" ? <span>{t("toHidden")}</span> : null}
        </p>
        <p className="mrh__meta">
          <span className="mrh__chip" data-tone={tone}>
            {t.has(`status.${r.status}`) ? t(`status.${r.status}`) : t("status.other")}
          </span>
          {r.acceptedAt ? <span>{t("acceptedAt", { date: shortDateTime(r.acceptedAt, locale) })}</span> : r.deadlineAt && tone === "wait" ? <span>{t("deadline", { date: shortDateTime(r.deadlineAt, locale) })}</span> : null}
        </p>
      </div>
    </li>
  );
}

export default function ReassignmentHistory({ o, view, aiBase }: { o: MarketOrder; view: OrderView; aiBase: string }): ReactElement | null {
  const t = useTranslations("marketplace.orderDetail.reassignment");
  if (!o.reassignments.length) return null;
  const rows = [...o.reassignments].sort((a, b) => (Date.parse(b.reassignedAt) || 0) - (Date.parse(a.reassignedAt) || 0));
  return (
    <section className="mrh" aria-labelledby="mrh-title" data-ai-id={`${aiBase}.reassignment-history`} data-ai-type="section">
      <h2 id="mrh-title" className="mrh__title">
        {glyph(HistoryIcon, { size: 16 })}
        <span>{t("title")}</span>
        <span className="mrh__count sx-num">{rows.length}</span>
      </h2>
      <ol className="mrh__list">
        {rows.map((r, i) => (
          <Row key={r.id || `${r.reassignedAt}-${i}`} r={r} view={view} />
        ))}
      </ol>
    </section>
  );
}
