"use client";

import { useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { BackendOrder, SellerActions, SellerCabinet } from "@/lib/services/backend";
import { Skeleton, EmptyState } from "./DataState";
import OrderActions from "./OrderActions";
import RespondTimer from "./RespondTimer";
import OnboardingProgress from "./OnboardingProgress";
import SellerMetrics from "./SellerMetrics";
import SellerPayouts from "./SellerPayouts";
import ReferralProgress from "./ReferralProgress";
import { useSellerCabinet, isDemoId } from "./SellerCabinet";
import StatTile from "@/components/admin/StatTile";
import StatDrillModal, { type Drill, type DrillRow } from "@/components/admin/StatDrillModal";
import DashFilterBar, { useDashFilter } from "@/components/admin/DashFilterBar";
import { inRange, isFiltered, type SellerCabinetFull } from "@/lib/services/dash";
import { fmtDate } from "@/lib/date";
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
  IconInfo,
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

// `compact`: used on the redesigned advocate/lawyer dashboard, which already
// has its own hero, stat row and profile-completeness card — this hides the
// older onboarding banner, region/date filter and "Bugun"/"Moliyaviy holat"
// tiles (and the demo-data notice that comes with them) and keeps only the
// pieces that dashboard doesn't already cover: metrics, payouts, referral
// progress and the new-case-offer list.
export default function SellerDashboard({ role, compact = false }: { role: Role; compact?: boolean }) {
  const t = useTranslations("portal.sellerDash");
  const tc = useTranslations("portal.common");
  const locale = useLocale();
  const { session } = useAuth();
  // Stats + new orders come from the cabinet bootstrap loaded by the shell.
  const cabinet = useSellerCabinet();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const td = useTranslations("admin.dash");
  const { filter, setFilter, demoForced, setDemoForced } = useDashFilter();
  const [drill, setDrill] = useState<Drill | null>(null);
  const demo = cabinet.demo;

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
    const fmtTile = (m: Tile) => {
      const n = m.money ? uzs(s[m.from], m.key) : num(s[m.from] as Record<string, unknown>, m.key);
      return m.money ? `${som(n)} ${cur}` : String(n);
    };
    return (
      <div className="amet">
        {list.map((m) => (
          <StatTile key={m.key} variant="amet" icon={<m.Icon />} value={fmtTile(m)} label={t(m.label)} demo={demo} onClick={() => openDrill(cabinet.data as SellerCabinetFull, m, list, fmtTile)} />
        ))}
      </div>
    );
  }

  // Drill-down for a seller tile: the whole group's numbers plus the list the
  // number is made of (new orders / active cases / secure chats).
  function openDrill(c: SellerCabinetFull, m: Tile, list: Tile[], fmtTile: (x: Tile) => string) {
    const group: DrillRow[] = list.map((x) => ({ label: t(x.label), value: fmtTile(x) }));
    const sections: Drill["sections"] = [{ kind: "kv", title: td(m.from === "finance" ? "drill.finance" : "drill.workload"), rows: group }];
    let link: Drill["link"];
    const base = role === "advocate" ? "/portal/advocate" : "/portal/lawyer";
    if (m.key === "active_cases" || m.key === "courts_today" || m.key === "deadlines_today") {
      sections.push({ kind: "list", title: td("drill.activeCasesList"), rows: c.activeCases.map((k) => ({ label: `${k.caseNumber ? k.caseNumber + " · " : ""}${k.title}`, value: k.deadlineAt ? fmtDate(k.deadlineAt, locale) : "", sub: [k.stage, k.nextAction].filter(Boolean).join(" · ") })) });
      link = { href: `${base}/cases`, label: td("drill.goCases") };
    } else if (m.key === "unread_messages") {
      sections.push({ kind: "list", title: td("drill.chats"), rows: c.secureChats.map((r) => ({ label: r.caseId || r.orderId || r.id, value: r.updatedAt ? fmtDate(r.updatedAt, locale) : "", sub: r.status })) });
    } else if (m.from === "finance") {
      link = { href: `${base}/payouts`, label: td("drill.goPayouts") };
    } else {
      sections.push({ kind: "list", title: td("drill.newOrders"), rows: c.newOrders.map((o) => ({ label: o.serviceName || o.title, value: o.budget || "", sub: o.region || "" })) });
      link = { href: role === "advocate" ? "/portal/advocate/opportunities" : "/portal/lawyer/marketplace", label: td("drill.goOrders") };
    }
    setDrill({ title: t(m.label), value: fmtTile(m), demo, sections, link });
  }

  // Region / date filter reaches the new-orders list (the counters are cabinet-wide).
  const openCases = (cabinet.data?.newOrders ?? []).filter((o) => !dismissed.has(o.id))
    .filter((o) => !filter.region || (o.region || "").toLowerCase() === filter.region.toLowerCase())
    .filter((o) => !(filter.from || filter.to) || !o.createdAt || inRange(o.createdAt.slice(0, 10), filter));

  return (
    <>
      {compact ? null : cabinet.status === "loading" ? null : <OnboardingProgress role={role} limited={false} />}
      {compact ? null : (
        <>
          <DashFilterBar value={filter} onChange={setFilter} demoForced={demoForced} onDemoForced={setDemoForced} note={isFiltered(filter) ? td("filter.sellerNote") : undefined} compact />
          {demo ? <p className="bhnote" role="status"><IconInfo />{demoForced ? td("demo.forced") : td("demo.sellerBanner")}</p> : null}
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
        </>
      )}

      {cabinet.data ? <SellerMetrics stats={cabinet.data.stats} userId={session?.id || ""} demo={demo} /> : null}
      {cabinet.data ? <SellerPayouts /> : null}
      <ReferralProgress side="seller" href={role === "advocate" ? "/portal/advocate/referrals" : "/portal/lawyer/referrals"} />

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
      <StatDrillModal drill={drill} onClose={() => setDrill(null)} />
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
  const td = useTranslations("admin.dash");
  const [open, setOpen] = useState(false);
  const isDemo = isDemoId(o.id);
  const listHref = role === "advocate" ? "/portal/advocate/opportunities" : "/portal/lawyer/marketplace";
  const meta = [o.region, o.budget].filter(Boolean).join(" · ");
  return (
    <div className="pcase">
      <div className="pcase__h">
        <span className="pcase__id">{o.serviceName || t("newCases")}</span>
        {o.status === "new" || o.status === "offered" || !o.status ? <RespondTimer deadline={o.confirmationDeadlineAt} /> : null}
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
        {isDemo ? <span className="chip" title={td("demo.noAction")}><IconLock />{td("demo.badge")}</span> : <OrderActions orderId={o.id} onDone={onDone} />}
      </div>
    </div>
  );
}
