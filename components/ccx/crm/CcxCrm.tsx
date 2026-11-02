"use client";

import "./crm.css";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { sectionOk, type CrmSectionKey } from "@/components/crm/sections";
import { loadCrmMeta, useCrmMeta } from "@/lib/crm/useCrm";
import { CcxEmblem, IcRefresh } from "../icons";
import { Loading } from "../panel/bits";
import { CRM_VIEWS, crmHref, type CrmSectionProps, type CrmView } from "./nav";
import CrmLive from "./CrmLive";
import { lazyView } from "../lazyView";
import type { ComponentType } from "react";

const wait = () => <Loading label="" />;

const OVERVIEW = lazyView(() => import("./sections/CrmOverviewX"), wait);
const LEADS = lazyView(() => import("./sections/CrmLeadsX"), wait);
const CUSTOMERS = lazyView(() => import("./sections/CrmCustomersX"), wait);
const CALLS = lazyView(() => import("./sections/CrmCallsX"), wait);
const PERFORMANCE = lazyView(() => import("./sections/CrmPerformanceX"), wait);
const TEMPLATES = lazyView(() => import("./sections/CrmTemplatesX"), wait);
const SMS = lazyView(() => import("./sections/CrmSmsX"), wait);
const LEAD = lazyView(() => import("./sections/CrmLeadX"), wait);
const CUSTOMER = lazyView(() => import("./sections/CrmCustomerX"), wait);

const SECTIONS: Record<CrmView, ComponentType<CrmSectionProps>> = {
  overview: OVERVIEW.View,
  leads: LEADS.View,
  customers: CUSTOMERS.View,
  calls: CALLS.View,
  performance: PERFORMANCE.View,
  templates: TEMPLATES.View,
  sms: SMS.View,
};

const LeadPage = LEAD.View;
const CustomerPage = CUSTOMER.View;

const PRELOAD = [OVERVIEW, LEADS, CUSTOMERS, CALLS, PERFORMANCE, TEMPLATES, SMS, LEAD, CUSTOMER];

const KEY: Record<CrmView, CrmSectionKey> = { overview: "overview", leads: "leads", customers: "customers", calls: "calls", performance: "performance", templates: "templates", sms: "sms" };

export default function CcxCrm() {
  const t = useTranslations("crm");
  const tx = useTranslations("admin.ccx.crm");
  const params = useSearchParams();
  const { meta, error } = useCrmMeta();
  const asked = (params.get("s") ?? (params.get("tab") === "leads" ? "leads" : null)) as CrmView | null;
  const lead = params.get("lead") ?? "";
  const customer = params.get("customer") ?? "";

  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const v of PRELOAD) v.preload().catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(id);
  }, []);

  if (!meta) {
    if (error) {
      return (
        <section className="opx-crm-msg" role="alert">
          <CcxEmblem size={56} />
          <h2>{t("metaFailed")}</h2>
          <button type="button" className="opx-pbtn opx-pbtn--main" onClick={() => void loadCrmMeta(true)}>
            <IcRefresh size={16} />
            {t("retry")}
          </button>
        </section>
      );
    }
    return <Loading label={tx("loading")} />;
  }

  const visible = CRM_VIEWS.filter((v) => sectionOk(KEY[v], meta));
  const view: CrmView = asked && visible.includes(asked) ? asked : (visible[0] ?? "overview");
  const Section = SECTIONS[view];

  return (
    <div className="opx-crm" data-ai-target="callcenter:crm">
      <CrmLive />
      <header className="opx-crm__head">
        <h2>{t("title")}</h2>
        <nav className="opx-crm__nav" aria-label={tx("navAria")}>
          {visible.map((v) => (
            <Link key={v} href={crmHref(v)} className={`opx-crm__tab${v === view && !lead && !customer ? " is-on" : v === view ? " is-parent" : ""}`} aria-current={v === view ? "page" : undefined}>
              {t(`nav.${KEY[v]}`)}
            </Link>
          ))}
        </nav>
      </header>
      {view === "leads" && lead ? <LeadPage meta={meta} /> : view === "customers" && customer ? <CustomerPage meta={meta} /> : sectionOk(KEY[view], meta) ? <Section meta={meta} /> : <p className="opx-crm-denied">{t("sectionDenied")}</p>}
    </div>
  );
}
