"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getServicePassport, type ServicePassport as Passport } from "@/lib/services/backend";
import { fmtUzs } from "@/lib/money";
import { Skeleton } from "./DataState";
import { IconDocLines, IconChevronRight } from "@/components/icons";

// T1-07 service passport (GET /services/{id}/passport), in separate blocks:
// identity, duration, pricing, SLA and refund, required documents. Only
// client-facing fields: the commission split (seller income / platform fee)
// stays hidden (S-27).
type Row = [label: string, value: string];

// Catalog values arrive as keys ("yurist_advokat", "online", "standard") or,
// for rows imported from the Excel catalog, in Cyrillic ("Юрист", "Онлайн").
const VALUE_KEYS: Record<string, string> = {
  yurist: "lawyer", lawyer: "lawyer", "юрист": "lawyer",
  advokat: "advocate", advocate: "advocate", "адвокат": "advocate",
  yurist_advokat: "any", lawyer_advocate: "any", any: "any", "юрист/адвокат": "any", "юрист ёки адвокат": "any", "юрист/advokat": "any",
  online: "online", "онлайн": "online", offline: "offline", "офлайн": "offline", hybrid: "hybrid", "аралаш": "hybrid", "онлайн/офлайн": "hybrid",
  basic: "basic", "базавий": "basic", standard: "standard", "стандарт": "standard", premium: "premium", "премиум": "premium",
};

function Block({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <section className="spass__blk">
      <h4 className="spass__bh">{title}</h4>
      <div className="pkv">
        {shown.map(([k, v]) => (
          <div className="pkv__i" key={k}>
            <label>{k}</label>
            <b>{v}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PassportView({ passport: p }: { passport: Passport }) {
  const t = useTranslations("portal.passport");
  // Catalog durations are day counts as text: "10" or a range like "3-5".
  // Some rows already carry the unit ("3 kun", "1-2 иш куни"): show those as is.
  const days = (text: string, n: number) => {
    const v = text || (n > 0 ? String(n) : "");
    if (!v || v === "0") return "";
    return /[^\d\s.,–-]/.test(v) ? v : t("daysText", { value: v });
  };
  const val = (group: string, raw?: string) => {
    if (!raw) return "";
    const k = VALUE_KEYS[raw.trim().toLowerCase()];
    return k && t.has(`${group}.${k}`) ? t(`${group}.${k}`) : raw;
  };
  const group = p.group && p.group !== p.family ? `${p.family} · ${p.group}` : p.family;
  return (
    <div className="spass">
      <Block
        title={t("blockIdentity")}
        rows={[
          [t("code"), p.catalogCode],
          [t("family"), group],
          [t("subcategory"), p.subcategory && p.subcategory !== p.family ? p.subcategory : ""],
          [t("executor"), val("executorValues", p.executorType)],
          [t("advokat"), p.advokatRequired ? t("advokatYes") : ""],
          [t("format"), val("formatValues", p.format)],
        ]}
      />
      <Block
        title={t("blockDuration")}
        rows={[
          [t("standardTerm"), days(p.standardDuration, p.standardDays)],
          [t("urgentTerm"), days(p.urgentDuration, p.urgentDays)],
        ]}
      />
      <Block
        title={t("blockPricing")}
        rows={[
          [t("price"), p.standardPrice ? `${fmtUzs(p.standardPrice)} ${t("som")}` : ""],
          [t("pricingTier"), val("tierValues", p.pricingTier)],
        ]}
      />
      <Block
        title={t("blockSla")}
        rows={[
          [t("sla"), p.slaCode],
          [t("refund"), p.refundCode],
        ]}
      />
      <section className="spass__blk spass__docs">
        <h4 className="spass__bh">{t("documents")}</h4>
        {p.requiredDocuments.length ? (
          <ul>
            {p.requiredDocuments.map((d, i) => (
              <li key={i}><IconDocLines />{d}</li>
            ))}
          </ul>
        ) : (
          <p className="advmuted">{t("noDocuments")}</p>
        )}
      </section>
      {p.version ? <small className="spass__ver">{t("versionShort", { v: p.version })}</small> : null}
    </div>
  );
}

// Collapsible passport for a catalog service, loaded when first opened.
export default function ServicePassport({ serviceId, defaultOpen = false }: { serviceId: string; defaultOpen?: boolean }) {
  const t = useTranslations("portal.passport");
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const [state, setState] = useState<{ id: string; passport: Passport | null; failed: boolean } | null>(null);
  const loaded = state?.id === serviceId ? state : null;

  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    getServicePassport(serviceId, locale)
      .then((r) => alive && setState({ id: serviceId, passport: r.passport, failed: false }))
      .catch(() => alive && setState({ id: serviceId, passport: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [open, loaded, serviceId, locale]);

  return (
    <div className={`spass__wrap${open ? " on" : ""}`}>
      <button type="button" className="spass__tg" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{t("title")}</span>
        <IconChevronRight />
      </button>
      {open ? (
        !loaded ? (
          <Skeleton rows={2} />
        ) : loaded.passport ? (
          <PassportView passport={loaded.passport} />
        ) : (
          <p className="advmuted">{t("loadError")}</p>
        )
      ) : null}
    </div>
  );
}
