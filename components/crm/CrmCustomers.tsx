"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconAlert, IconCheck, IconLayers, IconMapPin, IconPhone, IconPlus, IconRefresh, IconSearch, IconUsers } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { crmCan, listCrmCustomers, type CrmCustomer, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import CrmFrame from "./CrmFrame";
import { Avatar, Empty, useCrmError } from "./bits";

const LIMIT = 48;

export default function CrmCustomers(): ReactElement {
  const t = useTranslations("crm");
  return (
    <CrmFrame
      title={t("customers.title")}
      tools={(api) =>
        crmCan(api.meta, "crm.customers.manage") ? (
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => api.open("customer")}>
            <IconPlus aria-hidden="true" />
            {t("newCustomer.title")}
          </button>
        ) : null
      }
    >
      {(api) => <CustomerGrid meta={api.meta} />}
    </CrmFrame>
  );
}

function CustomerGrid({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.customers");
  const crmErr = useCrmError();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState("active");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CrmCustomer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(qInput.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [qInput]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const n = ++seq.current;
      try {
        const p = await listCrmCustomers({ q, region, status, limit: LIMIT, offset }, signal);
        if (n !== seq.current) return;
        setRows(p.items);
        setTotal(p.total);
        setErr("");
      } catch (e) {
        if (isAborted(e) || n !== seq.current) return;
        logApiError("crm.customers", e);
        setErr(crmErr(e));
        setRows((cur) => cur ?? []);
      }
    },
    [q, region, status, offset, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "customer")) void load();
  });
  return (
    <>
      <div className="crm-filters">
        <label className="crm-search">
          <IconSearch aria-hidden="true" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        <input className="crm-input" style={{ width: 160 }} value={region} onChange={(e) => (setRegion(e.target.value), setOffset(0))} placeholder={t("region")} aria-label={t("region")} />
        <div className="crm-seg" role="group" aria-label={t("status")}>
          {["active", "archived", ""].map((s) => (
            <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => (setStatus(s), setOffset(0))}>
              {t(`st.${s || "all"}`)}
            </button>
          ))}
        </div>
        <span className="crm-hint" style={{ marginLeft: "auto" }}>
          {rows ? t("count", { n: total }) : ""}
        </span>
      </div>
      {err ? (
        <div className="crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{err}</span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void load()}>
            <IconRefresh aria-hidden="true" />
            {t("retry")}
          </button>
        </div>
      ) : null}
      {rows === null ? (
        <div className="crm-clist">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="crm-sk crm-sk--block" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="crm-card">
          <Empty icon={<IconUsers />} title={q ? t("noMatch") : t("empty")} text={t("emptyText")} />
        </div>
      ) : (
        <div className="crm-clist crm-rise">
          {rows.map((c) => (
            <Link key={c.id} href={`/admin/crm/customers/${encodeURIComponent(c.id)}`} className="crm-ccard">
              <span className="crm-ccard__top">
                <Avatar name={c.name} />
                <span>
                  <b>{c.name || c.publicId}</b>
                  <span className="crm-code">{c.publicId}</span>
                </span>
                {c.userId ? (
                  <span className="crm-badge" style={{ marginLeft: "auto" }} title={t("linked")}>
                    <IconCheck aria-hidden="true" />
                    LexGo
                  </span>
                ) : null}
              </span>
              <span className="crm-ccard__meta">
                {c.phone || c.telegram || c.email ? (
                  <span>
                    <IconPhone aria-hidden="true" />
                    {c.phone || c.telegram || c.email}
                  </span>
                ) : null}
                {c.region ? (
                  <span>
                    <IconMapPin aria-hidden="true" />
                    {c.region}
                  </span>
                ) : null}
              </span>
              <span className="crm-ccard__meta">
                <span className="crm-pill" style={{ ["--sc" as string]: "var(--crm-acc)" }}>
                  <IconLayers aria-hidden="true" style={{ width: 12, height: 12 }} />
                  {t("leads", { n: c.leadCount })}
                </span>
                {c.activeLeadCount ? (
                  <span className="crm-pill" style={{ ["--sc" as string]: "var(--crm-ok)" }}>
                    <i aria-hidden="true" />
                    {t("active", { n: c.activeLeadCount })}
                  </span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      )}
      {rows && total > LIMIT ? (
        <div className="crm-pager">
          <span>{t("range", { from: offset + 1, to: Math.min(total, offset + LIMIT), total })}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" className="crm-btn crm-btn--sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              {t("prev")}
            </button>
            <button type="button" className="crm-btn crm-btn--sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
              {t("next")}
            </button>
          </span>
        </div>
      ) : null}
      <span hidden>{meta.scope}</span>
    </>
  );
}
