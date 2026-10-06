"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isAborted, isForbidden, isRouteMissing } from "@/lib/http";
import { fmtRating } from "@/lib/date";
import { getOwnerDashboard, type OrgMemberRow } from "@/lib/services/orgOwner";
import type { ManagedServices, ServiceScope } from "@/lib/services/sellerServices";
import { IconBolt, IconBriefcase, IconChevronLeft, IconClipboardList, IconShieldCheck, IconStarRate, IconTag } from "@/components/icons";
import ServiceManager from "@/components/services/ServiceManager";
import { aiId } from "@/lib/ai/ids";
import OwnerWorkload from "./OwnerWorkload";
import { OrgBlocked } from "./bits";

type Tab = "services" | "workload";
type Head = { key: string; member: OrgMemberRow | null; orgName: string; error: unknown };
type Svc = { key: string; data: ManagedServices };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export default function OrgMemberPage({ orgId, memberId, tab }: { orgId: string; memberId: string; tab: Tab }) {
  const t = useTranslations("orgOwner");
  const ts = useTranslations("sellerServices");
  const locale = useLocale();
  const [head, setHead] = useState<Head | null>(null);
  const [svcLoad, setSvcLoad] = useState<Svc | null>(null);
  const headKey = `${orgId}|${memberId}`;
  const svc = svcLoad && svcLoad.key === headKey ? svcLoad.data : null;
  const scope = useMemo<ServiceScope>(() => ({ kind: "org", orgId, memberId }), [orgId, memberId]);
  const base = `/portal/advocate/organization/${encodeURIComponent(orgId)}`;
  const mbase = `${base}/members/${encodeURIComponent(memberId)}`;

  useEffect(() => {
    const c = new AbortController();
    getOwnerDashboard(orgId, c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setHead({ key: headKey, member: d.members.find((m) => m.userId === memberId) ?? null, orgName: d.organization.name, error: null });
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setHead({ key: headKey, member: null, orgName: "", error: e });
      });
    return () => c.abort();
  }, [orgId, memberId, headKey]);

  const h = head && head.key === headKey ? head : null;
  if (h?.error && isForbidden(h.error)) return <OrgBlocked kind="forbidden" />;
  if (h?.error && isRouteMissing(h.error)) return <OrgBlocked kind="soon" />;

  const m = h?.member ?? null;
  const name = m?.name || svc?.seller.name || svc?.profile.name || "";
  const sellerType = m?.sellerType || svc?.profile.sellerType || "";
  const verification = m?.verificationStatus || svc?.profile.verificationStatus || "";
  const verified = verification === "verified" || verification === "approved";
  const kpis = m
    ? [
        { k: "orders", Icon: IconTag, v: m.workload.activeOrders },
        { k: "cases", Icon: IconBriefcase, v: m.workload.activeCases },
        { k: "urgent", Icon: IconBolt, v: m.workload.urgentRequests },
      ]
    : [];
  const tabs: { k: Tab; Icon: typeof IconBriefcase; href: string }[] = [
    { k: "services", Icon: IconBriefcase, href: `${mbase}/services` },
    { k: "workload", Icon: IconClipboardList, href: `${mbase}/workload` },
  ];
  const ai = aiId("organization.member", memberId);

  return (
    <div className="omem">
      <Link href={base} className="sup__back oown__back">
        <IconChevronLeft />
        {h?.orgName || t("backDashboard")}
      </Link>

      <section
        className="omem__card"
        data-ai-target="org-member:header"
        data-ai-id={ai}
        data-ai-type="section"
        data-ai-entity-type="seller"
        data-ai-entity-id={memberId || undefined}
        data-ai-label={t("member.kicker")}
        data-ai-private
      >
        <span className="omem__av" aria-hidden="true">
          {name ? initials(name) : "…"}
        </span>
        <div className="omem__who">
          <span className="omem__kick">{t("member.kicker")}</span>
          <h2 className="omem__name">{name || "…"}</h2>
          <div className="omem__tags">
            {sellerType ? <span className="omem__tag">{t.has(`sellerTypes.${sellerType}`) ? t(`sellerTypes.${sellerType}`) : sellerType}</span> : null}
            {verification ? (
              <span className={`omem__tag${verified ? " omem__tag--ok" : " omem__tag--warn"}`}>
                <IconShieldCheck aria-hidden="true" />
                {t.has(`verification.${verification}`) ? t(`verification.${verification}`) : verification}
              </span>
            ) : null}
            {m && m.reviewsCount > 0 && m.rating > 0 ? (
              <span className="omem__tag omem__tag--rate">
                <IconStarRate aria-hidden="true" />
                {fmtRating(m.rating, locale)} · {m.reviewsCount}
              </span>
            ) : null}
            {m?.title ? <span className="omem__tag omem__tag--muted">{m.title}</span> : null}
          </div>
        </div>
        {kpis.length ? (
          <ul className="omem__kpis">
            {kpis.map(({ k, Icon, v }) => (
              <li key={k}>
                <Icon aria-hidden="true" />
                <b>{v}</b>
                <span>{t(`col.${k}`)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <nav className="suptabs omem__tabs" aria-label={t("member.tabs")} data-ai-target="org-member:tabs" data-ai-id={`${ai}.tabs`}>
        {tabs.map(({ k, Icon, href }) => (
          <Link key={k} href={href} className={`suptab omem__tab${tab === k ? " is-on" : ""}`} aria-current={tab === k ? "page" : undefined} data-ai-id={`${ai}.${k}`} data-ai-type="tab">
            <Icon aria-hidden="true" />
            {t(`member.tab.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "services" ? (
        <ServiceManager
          scope={scope}
          role="advocate"
          owner
          title={name ? ts("titleOwner", { name }) : ts("title")}
          onData={(d) => setSvcLoad({ key: headKey, data: d })}
        />
      ) : (
        <OwnerWorkload orgId={orgId} memberId={memberId} />
      )}
    </div>
  );
}
