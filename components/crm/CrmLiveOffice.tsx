"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconEye, IconPhone, IconRefresh, IconShieldCheck, IconSparkle } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { isAborted, logApiError } from "@/lib/http";
import { aiCardsOf, getLiveCall, listLiveCalls, type LiveCall } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Avatar, Empty, StatusPill, useCrmError } from "./bits";
import { pathKey, textOf } from "./CopilotPanel";
import { Transcript } from "./LeadCalls";

// Live Office (contract 13cb257 §14, crm.live_calls.view): the calls in
// progress right now, read-only — transcript, lead and customer context,
// and the live AI suggestions. Viewing is audited by the backend, and the
// screen says so. Nothing here can change a call or a lead.
const LIST_POLL = 15_000;
const CALL_POLL = 5_000;
export default function CrmLiveOffice(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame section="live" title={t("liveOffice.title")}>
      {() => <Office />}
    </CrmFrame>
  );
}

function Office(): ReactElement {
  const t = useTranslations("crm.liveOffice");
  const crmErr = useCrmError();
  const now = useNow(1000);
  const [items, setItems] = useState<LiveCall[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState("");
  const [call, setCall] = useState<LiveCall | null>(null);
  const [callErr, setCallErr] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await listLiveCalls(signal);
        setItems(r.items);
        setErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.live", e);
        setErr(crmErr(e));
      }
    },
    [crmErr],
  );
  const loadCall = useCallback(
    async (id: string, signal?: AbortSignal) => {
      try {
        setCall(await getLiveCall(id, signal));
        setCallErr("");
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("crm.live.call", e);
        setCallErr(crmErr(e));
      }
    },
    [crmErr],
  );
  // The list follows events and a slow poll (the backend's live channel
  // carries the rest); the open call refreshes faster.
  useEffect(() => {
    const ctl = new AbortController();
    const first = window.setTimeout(() => void load(ctl.signal), 0);
    const id = window.setInterval(() => void load(), LIST_POLL);
    return () => {
      ctl.abort();
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const first = window.setTimeout(() => void loadCall(open, ctl.signal), 0);
    const id = window.setInterval(() => void loadCall(open), CALL_POLL);
    return () => {
      ctl.abort();
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [open, loadCall]);
  useCrmEvents((ev) => {
    if (ev.invalidate.includes("all") || ev.invalidate.includes("live")) {
      void load();
      if (open && (!ev.callId || ev.callId === open)) void loadCall(open);
    }
  });
  const since = (iso: string) => {
    const ms = now && iso ? now - Date.parse(iso) : NaN;
    if (!Number.isFinite(ms) || ms < 0) return "";
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <>
      <p className="crm-note crm-note--info" role="note">
        <IconShieldCheck aria-hidden="true" />
        {t("audited")}
      </p>
      {err && !items ? (
        <div className="crm-card">
          <Empty
            icon={<IconAlert />}
            title={t("failed")}
            text={err}
            action={
              <button type="button" className="crm-btn" onClick={() => void load()}>
                <IconRefresh aria-hidden="true" />
                {t("retry")}
              </button>
            }
          />
        </div>
      ) : !items ? (
        <span className="crm-sk crm-sk--block" style={{ height: 220 }} />
      ) : !items.length ? (
        <div className="crm-card">
          <Empty icon={<IconPhone />} title={t("none")} text={t("noneText")} />
        </div>
      ) : (
        <div className="crm-lo">
          <ul className="crm-lo__list" aria-label={t("list")}>
            {items.map((c) => (
              <li key={c.id}>
                <button type="button" aria-pressed={open === c.id} onClick={() => setOpen(c.id)}>
                  <Avatar name={c.operator?.name ?? ""} />
                  <span>
                    <b>{c.operator?.name || t("operator")}</b>
                    <small>{[c.customerName || c.lead?.customer?.name, c.lead?.workId].filter(Boolean).join(" · ")}</small>
                  </span>
                  <em className="crm-lo__time">
                    <span className="crm-livedot" aria-hidden="true" />
                    {since(c.startedAt)}
                  </em>
                </button>
              </li>
            ))}
          </ul>
          <section className="crm-card crm-lo__detail" aria-live="polite" aria-label={t("detail")}>
            {!open ? (
              <Empty icon={<IconEye />} title={t("pick")} text={t("pickText")} />
            ) : callErr && !call ? (
              <p className="crm-err">{callErr}</p>
            ) : !call || call.id !== open ? (
              <span className="crm-sk crm-sk--block" style={{ height: 200 }} />
            ) : (
              <LiveDetail call={call} />
            )}
          </section>
        </div>
      )}
    </>
  );
}

function LiveDetail({ call }: { call: LiveCall }): ReactElement {
  const t = useTranslations("crm.liveOffice");
  const ta = useTranslations("crm.ai");
  const locale = useLocale();
  const cards = aiCardsOf(call.suggestions);
  const l = call.lead;
  return (
    <div className="crm-lo__grid">
      <div className="crm-lo__main">
        <h3 className="crm-card__h">
          <span className="crm-livedot" aria-hidden="true" />
          {t("transcript")}
          <small>{call.startedAt ? shortDateTime(call.startedAt, locale) : ""}</small>
        </h3>
        {call.transcript.length ? <Transcript segments={call.transcript} /> : <p className="crm-sub">{t("noTranscript")}</p>}
      </div>
      <aside className="crm-lo__side">
        {l ? (
          <div className="crm-lo__ctx">
            <small>{t("lead")}</small>
            <b>{l.title || l.workId}</b>
            <span className="crm-lo__row">
              <span className="crm-code">{l.workId}</span>
              <StatusPill status={l.status} />
            </span>
            <small>{[call.customerName || l.customer?.name, l.region].filter(Boolean).join(" · ")}</small>
            <Link className="crm-btn crm-btn--sm" href={`/admin/crm/leads/${encodeURIComponent(l.id)}`}>
              {t("openLead")}
            </Link>
          </div>
        ) : null}
        <div className="crm-lo__ai">
          <b>
            <IconSparkle aria-hidden="true" />
            {t("ai")}
          </b>
          {cards.length ? (
            <ul className="crm-assist">
              {cards.map((c) => (
                <li key={c.path}>
                  <small>{ta.has(pathKey(c.path)) ? ta(pathKey(c.path)) : t("suggestion")}</small>
                  <span>{textOf(c.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-sub">{t("noAi")}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
