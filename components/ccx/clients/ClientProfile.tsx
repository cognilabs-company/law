"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import CcCallForm from "@/components/admin/CcCallForm";
import PersonName from "@/components/ui/PersonName";
import { getCcClientCard, listCcCalls, type CcClient, type CcClientCard } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { dateOnly } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { labelOf } from "@/lib/labels";
import { initials } from "@/lib/lawyers";
import { CopyButton } from "../now/NowFocus";
import { prettyPhone } from "../now/feed";
import { IcClock, IcCoins, IcDoc, IcFlag, IcInbox, IcLayers, IcPhone, IcRefresh, IcShield, IcStore, IcUser } from "../icons";
import CallTimeline, { type CallsState } from "./CallTimeline";
import ProfileData from "./ProfileData";
import { IcWallet, Pill, digits, toneOf } from "./parts";

type CardState = { status: "ready"; data: CcClientCard } | { status: "denied" | "error"; data: null } | null;

export default function ClientProfile({ client, onLogged }: { client: CcClient; onLogged: (phone: string) => void }) {
  const t = useTranslations("admin.ccx.clients");
  const tcard = useTranslations("admin.callCenter.card");
  const tc = useTranslations("admin.callCenter");
  const tsom = useTranslations("portal.payment");
  const tn = useTranslations("common.notify");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const [card, setCard] = useState<CardState>(null);
  const [attempt, setAttempt] = useState(0);
  const [calls, setCalls] = useState<CallsState>(null);
  const [callsAttempt, setCallsAttempt] = useState(0);
  const [freshId, setFreshId] = useState("");
  const [logging, setLogging] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [logDirty, setLogDirty] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    getCcClientCard(client.id).then(
      (data) => {
        if (live) setCard({ status: "ready", data });
      },
      (e: unknown) => {
        if (live) setCard({ status: isForbidden(e) ? "denied" : "error", data: null });
      },
    );
    return () => {
      live = false;
    };
  }, [client.id, attempt]);

  useEffect(() => {
    let live = true;
    listCcCalls(client.id).then(
      (list) => {
        if (live) setCalls({ status: "ready", list });
      },
      () => {
        if (live) setCalls({ status: "error", list: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [client.id, callsAttempt]);

  useEffect(() => {
    if (!freshId) return;
    document.getElementById(`opx-cl-call-${freshId}`)?.scrollIntoView({ block: "nearest" });
  }, [freshId]);

  const retryCard = () => {
    setCard(null);
    setAttempt((n) => n + 1);
  };

  const retryCalls = () => {
    setCalls(null);
    setCallsAttempt((n) => n + 1);
  };

  const afterLog = (phone: string) => {
    const known = new Set(calls?.status === "ready" ? calls.list.map((c) => c.id) : []);
    void listCcCalls(client.id).then(
      (list) => {
        setCalls({ status: "ready", list });
        const added = list.filter((c) => !known.has(c.id));
        const hit = added.find((c) => digits(c.phone) === digits(phone)) ?? added[0];
        if (hit) setFreshId(hit.id);
      },
      () => undefined,
    );
  };

  const d = card?.status === "ready" ? card.data : null;
  const info = d?.client;
  const name = info?.name || client.name;
  const phone = info?.phone || client.phone;
  const lexgoId = info?.lexgoId || client.lexgoId;
  const status = info?.status || client.status;
  const referral = info?.referralCode ?? "";
  const dial = phone.replace(/[^+\d]/g, "");
  const subs = d ? d.subscriptions.filter((s) => s.status === "active").length : 0;

  const kpis = d
    ? [
        { k: "orders", icon: <IcStore size={20} />, label: tcard("sumOrders"), value: String(d.summary.orders) },
        { k: "cases", icon: <IcLayers size={20} />, label: t("cases"), value: String(d.summary.cases) },
        { k: "payments", icon: <IcCoins size={20} />, label: tcard("tabs.payments"), value: String(d.summary.payments) },
        { k: "spent", icon: <IcWallet size={20} />, label: tcard("sumSpent"), value: `${fmtUzs(d.summary.totalSpent)} ${tsom("som")}` },
        { k: "leads", icon: <IcInbox size={20} />, label: t("leads"), value: String(d.summary.leads) },
        { k: "complaints", icon: <IcFlag size={20} />, label: tcard("sumComplaints"), value: String(d.summary.complaints) },
      ]
    : [];

  return (
    <div className="opx-cl-profile">
      <section className="opx-cl-card" aria-labelledby="opx-cl-name">
        <header className="opx-cl-head">
          <span className="opx-cl-av opx-cl-av--xl" aria-hidden="true">
            {name ? initials(name) : <IcUser size={30} />}
          </span>
          <div className="opx-cl-head__who">
            <div className="opx-cl-head__name">
              <h3 id="opx-cl-name">{name || (phone ? prettyPhone(phone) : <PersonName id={client.id} fallback={tcard("role")} />)}</h3>
              {status ? (
                <Pill tone={toneOf(status)} dot>
                  {labelOf(tc, "status", status)}
                </Pill>
              ) : null}
              {subs ? <Pill tone="info">{tcard("subActive")}</Pill> : null}
            </div>
            {phone ? (
              <span className="opx-cl-line">
                <IcPhone size={16} />
                <span className="opx-num">{prettyPhone(phone)}</span>
                <CopyButton value={phone} label={prettyPhone(phone)} />
              </span>
            ) : null}
            {lexgoId ? (
              <span className="opx-cl-line">
                <small>{t("lexgoId")}</small>
                <span className="opx-num">{lexgoId}</span>
                <CopyButton value={lexgoId} label={t("lexgoId")} />
              </span>
            ) : null}
          </div>
          <dl className="opx-cl-head__facts">
            <div>
              <span className="opx-cl-head__fic" aria-hidden="true">
                <IcClock size={18} />
              </span>
              <span>
                <dt>{tcard("sumSince")}</dt>
                <dd className="opx-num">{info?.createdAt ? dateOnly(info.createdAt, locale) : card === null ? <i className="opx-shim opx-cl-shim-line" /> : none}</dd>
              </span>
            </div>
            <div>
              <span className="opx-cl-head__fic" aria-hidden="true">
                <IcUser size={18} />
              </span>
              <span>
                <dt>{t("referral")}</dt>
                <dd className="opx-num">
                  {referral ? (
                    <>
                      {referral}
                      <CopyButton value={referral} label={t("referral")} />
                    </>
                  ) : card === null ? (
                    <i className="opx-shim opx-cl-shim-line" />
                  ) : (
                    none
                  )}
                </dd>
              </span>
            </div>
          </dl>
          <div className="opx-cl-head__acts">
            {dial ? (
              <a className="opx-cl-btn opx-cl-btn--call" href={`tel:${dial}`}>
                <IcPhone size={18} />
                {tcard("call")}
              </a>
            ) : null}
            <button type="button" className="opx-cl-btn opx-cl-btn--log" onClick={() => setLogging(true)}>
              <IcDoc size={18} />
              {tc("logCall")}
            </button>
          </div>
        </header>

        {card === null ? (
          <div className="opx-cl-kpis" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} className="opx-shim opx-cl-kpi-shim" />
            ))}
          </div>
        ) : card.status === "denied" ? (
          <p className="opx-cl-note" data-tone="warn" role="status">
            <IcShield size={18} />
            <span>{tcard("noAccess")}</span>
          </p>
        ) : card.status === "error" ? (
          <div className="opx-cl-note" data-tone="bad" role="alert">
            <span>{tcard("loadError")}</span>
            <button type="button" className="opx-cl-mini" onClick={retryCard}>
              <IcRefresh size={15} />
              {tn("retry")}
            </button>
          </div>
        ) : (
          <dl className="opx-cl-kpis">
            {kpis.map((k) => (
              <div key={k.k} className="opx-cl-kpi" data-k={k.k}>
                <span className="opx-cl-kpi__ic" aria-hidden="true">
                  {k.icon}
                </span>
                <dt>{k.label}</dt>
                <dd className="opx-num" title={k.value}>
                  {k.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className={`opx-cl-body${card && card.status !== "ready" ? " is-solo" : ""}`}>
        {card === null ? (
          <div className="opx-cl-data opx-cl-data--wait" aria-busy="true">
            <i className="opx-shim opx-cl-shim-tabs" />
            <i className="opx-shim opx-cl-shim-rows" />
          </div>
        ) : d ? (
          <ProfileData card={d} />
        ) : null}
        <CallTimeline calls={calls} freshId={freshId} onRetry={retryCalls} />
      </div>

      {logging ? (
        <Modal
          open
          onClose={() => setLogging(false)}
          title={tc("logCall")}
          description={[name, prettyPhone(phone)].filter(Boolean).join(" · ")}
          busy={logBusy}
          dirty={logDirty}
          footer={<div className="ccslot" ref={setSlot} />}
        >
          <CcCallForm
            phone={phone}
            clientUserId={client.id}
            footSlot={slot}
            onDirtyChange={setLogDirty}
            onBusyChange={setLogBusy}
            onCancel={() => setLogging(false)}
            onDone={(call) => {
              setLogging(false);
              onLogged(call.phone);
              afterLog(call.phone);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
