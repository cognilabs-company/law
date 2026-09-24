"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLawyerClientDetail, type LawyerClientDetail } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { shortDateTime, fmtInt } from "@/lib/date";
import { useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { IconBriefcase, IconFileText, IconChat, IconCard, IconClock } from "@/components/icons";
import { statusLabel, regionLabel } from "@/lib/labels";

const fmtNum = (n: number, locale: string) => fmtInt(n, locale);

// GET /lawyers/me/clients/{id}: one client's shared work with this seller —
// cases, orders, private chats, payments, documents and a timeline. A manual
// (own-base) client shows only its card and notes.
export default function ClientDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("portal.clientDetail");
  const tc = useTranslations("portal.common");
  const te = useTranslations("enums");
  const locale = useLocale();
  const router = useRouter();
  const [d, setD] = useState<LawyerClientDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"timeline" | "cases" | "orders" | "payments" | "documents">("timeline");
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(null); setTab("timeline"); }, 0);
    getLawyerClientDetail(id)
      .then((x) => { if (alive) setD(x); })
      .catch((e) => { if (alive) setErr(e instanceof ApiError && e.status === 404 ? t("notFound") : t("error")); });
    return () => { alive = false; clearTimeout(h); };
  }, [id, t]);
  const fmt = (v?: string) => (v ? shortDateTime(v, locale) : "");
  const tabs = d ? ([
    ["timeline", d.timeline.length],
    ["cases", d.cases.length],
    ["orders", d.orders.length],
    ["payments", d.payments.length],
    ["documents", d.documents.length],
  ] as const) : [];

  return (
    <Modal open={!!id} onClose={onClose} title={d?.client.name || t("title")}>
      {err ? <Notice ok={false} msg={err} /> : !d ? <Skeleton rows={3} /> : (
        <div className="cdet">
          <div className="cdet__head">
            <span className="pclient__av">{(d.client.name || "?").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase()}</span>
            <div className="cdet__m">
              <b>{d.client.name || "—"}</b>
              <span>{[d.client.phone, regionLabel(te, d.client.region), d.client.company, d.type === "manual" ? t("manual") : null].filter(Boolean).join(" · ")}</span>
              {d.client.createdAt ? <small>{t("since", { date: fmt(d.client.createdAt) })}</small> : null}
            </div>
          </div>
          {d.client.notes ? <p className="cdet__notes">{d.client.notes}</p> : null}
          <div className="cdet__stats">
            <span><IconBriefcase />{t("cases", { n: d.cases.length })}</span>
            <span><IconFileText />{t("orders", { n: d.orders.length })}</span>
            <span><IconChat />{t("chats", { n: d.chats.length })}</span>
            <span><IconCard />{t("payments", { n: d.payments.length })}</span>
          </div>
          {d.chats.length ? (
            <div className="cdet__chats">
              {d.chats.slice(0, 3).map((c) => (
                <button key={c.id} type="button" className="btn btn--soft btn--sm" onClick={() => { onClose(); router.push(`/portal/chat/${c.id}`); }}>
                  <IconChat />{t("openChat")}{c.status && c.status !== "active" ? ` · ${statusLabel(tc, c.status)}` : ""}
                </button>
              ))}
            </div>
          ) : null}
          <div className="segs segs--sm" role="tablist">
            {tabs.map(([k, n]) => (
              <button key={k} type="button" role="tab" className="seg" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`tabs.${k}`)}{n ? ` (${n})` : ""}</button>
            ))}
          </div>
          {tab === "timeline" ? (
            d.timeline.length ? (
              <ul className="dkv__list">
                {d.timeline.map((x) => (
                  <li key={`${x.type}-${x.id}`}>
                    <b>{t.has(`types.${x.type}`) ? t(`types.${x.type}`) : x.type}: {x.title || "—"}</b>
                    <span>{[x.status, fmt(x.updatedAt || x.createdAt)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("empty")}</p>
          ) : tab === "cases" ? (
            d.cases.length ? (
              <ul className="dkv__list">
                {d.cases.map((c) => (
                  <li key={c.id}>
                    <b>{c.title || c.caseNumber || "—"}</b>
                    <span>{[c.caseNumber, statusLabel(tc, c.stage), statusLabel(tc, c.status), c.deadlineAt ? `${t("deadline")}: ${fmt(c.deadlineAt)}` : ""].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("empty")}</p>
          ) : tab === "orders" ? (
            d.orders.length ? (
              <ul className="dkv__list">
                {d.orders.map((o) => (
                  <li key={o.id}>
                    <b>{o.title || o.serviceName || "—"}</b>
                    <span>{[statusLabel(tc, o.status), statusLabel(tc, o.paymentStatus), o.budget, fmt(o.createdAt)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("empty")}</p>
          ) : tab === "payments" ? (
            d.payments.length ? (
              <ul className="dkv__list">
                {d.payments.map((p) => (
                  <li key={p.id}>
                    <b>{fmtNum(p.amount, locale)} {t("som")}</b>
                    <span>{[statusLabel(tc, p.status), p.method, p.description, fmt(p.createdAt)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("empty")}</p>
          ) : (
            d.documents.length ? (
              <ul className="dkv__list">
                {d.documents.map((x) => (
                  <li key={x.id}>
                    <b>{x.title || x.documentType || "—"}</b>
                    <span><IconClock />{[statusLabel(tc, x.status), fmt(x.createdAt)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("empty")}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
