"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { isAborted, logApiError } from "@/lib/http";
import { crmCan, listCrmCustomers, type CrmCustomer } from "@/lib/services/crm";
import { useCrmEvents } from "@/lib/crm/useCrm";
import { prettyPhone } from "../../now/feed";
import { IcArrowLeft, IcArrowRight, IcSearch } from "../../icons";
import { IcFilter } from "../leads/icons";
import { customerHref, type CrmSectionProps } from "../nav";
import { useCrmErr } from "../leads/util";
import { NewCustomerSheet } from "../detail/customerSheets";
import { IcPin, IcPlus, IcUsers } from "../detail/glyphs";
import { Avatar, Empty, Failed, Pill, Seg, Shim } from "../detail/kit";

const LIMIT = 48;
const STATUSES = ["active", "archived", ""] as const;
type Status = (typeof STATUSES)[number];

export default function CrmCustomersX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.customers");
  const tl = useTranslations("crm.leads");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tn = useTranslations("crm.newCustomer");
  const crmErr = useCrmErr();
  const router = useRouter();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<CrmCustomer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);
  const canManage = crmCan(meta, "crm.customers.manage");

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
    <div className="opx-cd opx-cd--list">
      <section className="opx-cd-bar" aria-label={t("title")}>
        <div className="opx-cd-bar__title">
          <span className="opx-cd-card__ic" aria-hidden="true">
            <IcUsers size={18} />
          </span>
          <h2>{t("title")}</h2>
          {rows ? <Pill tone="mute">{t("count", { n: total })}</Pill> : null}
        </div>
        <label className="opx-cd-search opx-cd-search--grow">
          <IcSearch size={16} />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} type="search" />
        </label>
        <button type="button" className="opx-pbtn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          <IcFilter size={16} />
          {tl("filter")}
        </button>
        {canManage ? (
          <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => setCreating(true)}>
            <IcPlus size={16} />
            {tn("title")}
          </button>
        ) : null}
      </section>

      {filtersOpen ? <section className="opx-cd-bar">
        <label className="opx-cd-search opx-cd-search--region">
          <IcPin size={16} />
          <input
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setOffset(0);
            }}
            placeholder={t("region")}
            aria-label={t("region")}
          />
        </label>
        <Seg
          label={t("status")}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
          options={STATUSES.map((s) => ({ value: s, label: t(`st.${s || "all"}`) }))}
        />
      </section> : null}

      {err ? <Failed text={err} retry={t("retry")} onRetry={() => void load()} /> : null}

      {rows === null ? (
        <div className="opx-jr-rows" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Shim key={i} h={150} />
          ))}
        </div>
      ) : !rows.length ? (
        <Empty icon={<IcUsers size={22} />} title={q ? t("noMatch") : t("empty")} />
      ) : (
        <div className="opx-jr-rows">
          {rows.map((c) => {
            const contact = c.phone || c.telegram || c.email;
            const kind = c.phone ? "phone" : c.telegram ? "telegram" : "email";
            return (
              <Link key={c.id} href={customerHref(c.id)} className="opx-jr-row">
                <Avatar name={c.name} size="lg" />
                <span className="opx-jr-row__txt">
                  <b>{c.name || c.publicId}</b>
                  {contact ? (
                    <span className="opx-num" dir="ltr">
                      {kind === "phone" ? prettyPhone(contact) : contact}
                    </span>
                  ) : null}
                </span>
                {c.activeLeadCount ? <Pill tone="warn">{t("active", { n: c.activeLeadCount })}</Pill> : null}
                <span className="opx-jr-row__go" aria-hidden="true">
                  <IcArrowRight size={18} />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {rows && total > LIMIT ? (
        <nav className="opx-cd-pager" aria-label={t("title")}>
          <span className="opx-num">{t("range", { from: offset + 1, to: Math.min(total, offset + LIMIT), total })}</span>
          <span className="opx-cd-pager__btns">
            <button type="button" className="opx-pbtn opx-cd-btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
              <IcArrowLeft size={15} />
              {t("prev")}
            </button>
            <button type="button" className="opx-pbtn opx-cd-btn-sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
              {t("next")}
              <IcArrowRight size={15} />
            </button>
          </span>
        </nav>
      ) : null}

      {creating ? (
        <NewCustomerSheet
          meta={meta}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            router.push(customerHref(c.id));
          }}
        />
      ) : null}
    </div>
  );
}
