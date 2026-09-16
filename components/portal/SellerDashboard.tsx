"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { BackendOrder, SellerActions, SellerCabinet } from "@/lib/services/backend";
import { Skeleton, EmptyState } from "./DataState";
import OrderActions from "./OrderActions";
import OnboardingProgress from "./OnboardingProgress";
import { useSellerCabinet } from "./SellerCabinet";
import { useAuth, type Role } from "@/lib/auth";
import { uzs, fmtUzs } from "@/lib/money";
import {
  IconBriefcase,
  IconScale,
  IconClock,
  IconChat,
  IconDocLines,
  IconCard,
  IconTrendingUp,
  IconEye,
  IconMapPin,
  IconLock,
} from "@/components/icons";

type SvgC = (p: { className?: string }) => ReactNode;
type Tile = { key: string; from: "workload" | "finance"; label: string; Icon: SvgC; money?: boolean };

// «Bugun» — counts pulled from the workload block. unread_messages is the
// real secure-chat unread count (LEXGO_FRONTEND_CIMS_BACKEND_UPDATE); missing
// keys fall back to 0.
const TODAY: Tile[] = [
  { key: "active_cases", from: "workload", label: "activeCases", Icon: IconBriefcase },
  { key: "courts_today", from: "workload", label: "courtsToday", Icon: IconScale },
  { key: "deadlines_today", from: "workload", label: "deadlines", Icon: IconClock },
  { key: "unread_messages", from: "workload", label: "newMessages", Icon: IconChat },
  { key: "documents_to_review", from: "workload", label: "docsToReview", Icon: IconDocLines },
];
// «Moliyaviy holat» — sums from the finance block (missing keys fall back to 0).
const FINANCE: Tile[] = [
  { key: "earnings_today", from: "finance", label: "incomeToday", Icon: IconCard, money: true },
  { key: "earnings_month", from: "finance", label: "incomeMonth", Icon: IconTrendingUp, money: true },
  { key: "pending_payout", from: "finance", label: "expected", Icon: IconClock, money: true },
  { key: "earnings_via_lexgo", from: "finance", label: "viaLexgo", Icon: IconBriefcase, money: true },
  { key: "payable", from: "finance", label: "payable", Icon: IconCard, money: true },
];

const num = (o: Record<string, unknown> | undefined, k: string): number => {
  const x = o?.[k];
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};
const som = (n: number) => fmtUzs(n);

export default function SellerDashboard({ role }: { role: Role }) {
  const t = useTranslations("portal.sellerDash");
  const tc = useTranslations("portal.common");
  // Stats + new orders come from the cabinet bootstrap loaded by the shell.
  const cabinet = useSellerCabinet();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Pending/unverified seller: profile + verification state instead of empty
  // stats and orders they can't act on.
  if (cabinet.data?.limitedAccess) {
    return (
      <>
        <OnboardingProgress role={role} limited />
        <CabinetStatus cabinet={cabinet.data} role={role} />
      </>
    );
  }

  function tiles(list: Tile[]) {
    if (cabinet.status === "loading") return <Skeleton rows={2} />;
    if (cabinet.status === "error" || !cabinet.data) {
      return <EmptyState icon={<IconTrendingUp />} title={tc("loadError")} text={tc("loadErrorText")} />;
    }
    const s = cabinet.data.stats;
    const cur = String((s.finance?.currency as string) || "UZS");
    return (
      <div className="amet">
        {list.map((m) => {
          const n = m.money ? uzs(s[m.from], m.key) : num(s[m.from] as Record<string, unknown>, m.key);
          return (
            <div className="amet__c" key={m.key}>
              <span className="amet__i"><m.Icon /></span>
              <b>{m.money ? `${som(n)} ${cur}` : String(n)}</b>
              <span className="amet__l">{t(m.label)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const openCases = (cabinet.data?.newOrders ?? []).filter((o) => !dismissed.has(o.id));

  return (
    <>
      {cabinet.status === "loading" ? null : <OnboardingProgress role={role} limited={false} />}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("today")}</b>
          <span className="advmuted">{t("todaySub")}</span>
        </div>
        {tiles(TODAY)}
      </div>

      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("finance")}</b>
        </div>
        {tiles(FINANCE)}
      </div>

      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("newCases")}</b>
          <span className="advmuted">{t("newCasesSub", { n: openCases.length })}</span>
        </div>
        {cabinet.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !openCases.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("casesEmpty")} text={t("casesEmptyText")} />
        ) : (
          <div className="pcards">
            {openCases.map((o) => (
              <NewCase key={o.id} order={o} role={role} onDone={() => setDismissed((d) => new Set(d).add(o.id))} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CabinetStatus({ cabinet: c, role }: { cabinet: SellerCabinet; role: Role }) {
  const t = useTranslations("portal.cabinet");
  const tc = useTranslations("portal.common");
  const te = useTranslations("enums");
  const { session } = useAuth();
  const statusKey = c.verification.verified ? "approved" : c.verification.status || c.accountStatus || "pending";
  const blocked = (Object.keys(c.actions) as (keyof SellerActions)[]).filter((k) => !c.actions[k]);
  const region = c.profile.region;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="creq__badge">{t.has(`status.${statusKey}`) ? t(`status.${statusKey}`) : statusKey}</span>
      </div>
      <div className="pkv">
        <div className="pkv__i"><label>{t("name")}</label><b>{c.profile.name || session?.name || "—"}</b></div>
        <div className="pkv__i"><label>{t("type")}</label><b>{tc(role === "advocate" ? "roleAdvocate" : "roleLawyer")}</b></div>
        {region ? (
          <div className="pkv__i"><label>{t("region")}</label><b>{te.has(`regions.${region}`) ? te(`regions.${region}`) : region}</b></div>
        ) : null}
        {c.profile.licenseNumber ? (
          <div className="pkv__i"><label>{t("license")}</label><b>{c.profile.licenseNumber}</b></div>
        ) : null}
      </div>
      {blocked.length ? (
        <>
          <p className="ppanel__note" style={{ marginTop: 16 }}>{t("blockedLead")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {blocked.map((k) => (
              <span className="chip" key={k}><IconLock />{t(`actions.${k}`)}</span>
            ))}
          </div>
        </>
      ) : null}
      <Link
        href={role === "advocate" ? "/portal/advocate/profile" : "/portal/lawyer/services"}
        className="btn btn--pri btn--sm"
        style={{ marginTop: 16 }}
      >
        {t(role === "advocate" ? "completeProfile" : "chooseServices")}
      </Link>
    </div>
  );
}

function NewCase({ order: o, role, onDone }: { order: BackendOrder; role: Role; onDone: () => void }) {
  const t = useTranslations("portal.sellerDash");
  const [open, setOpen] = useState(false);
  const listHref = role === "advocate" ? "/portal/advocate/opportunities" : "/portal/lawyer/marketplace";
  const meta = [o.region, o.budget].filter(Boolean).join(" · ");
  return (
    <div className="pcase">
      <div className="pcase__h">
        <span className="pcase__id">{o.serviceName || t("newCases")}</span>
        {o.createdAt ? <span className="advmuted"><IconClock style={{ width: 13, height: 13 }} /> {o.createdAt}</span> : null}
      </div>
      {o.title ? <p className={`pcase__q${open ? " on" : ""}`}>{o.title}</p> : null}
      {meta ? <small><IconMapPin />{meta}</small> : null}
      <div className="pcase__row">
        {o.title ? (
          <button type="button" className="btn btn--soft btn--sm" onClick={() => setOpen((v) => !v)}>
            <IconEye />
            {t("review")}
          </button>
        ) : (
          <Link href={listHref} className="btn btn--soft btn--sm">
            <IconEye />
            {t("review")}
          </Link>
        )}
        <OrderActions orderId={o.id} onDone={onDone} />
      </div>
    </div>
  );
}
