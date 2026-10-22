"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconLogo, IconLogout, IconMenu } from "@/components/icons";
import { ADVOCATE_NAV, CLIENT_NAV, LAWYER_NAV } from "@/components/portal/portalNav";
import SellerProfile from "@/components/marketplace/SellerProfile";
import { OrderDetailView } from "@/components/marketplace/order/OrderDetailPage";
import type { OrderDetail } from "@/components/marketplace/order/useOrderDetail";
import { initials } from "@/lib/lawyers";
import { withServices } from "@/lib/marketPreview";
import { marketPhaseOf, normMarketOrder, normMarketSeller, type MarketService } from "@/lib/services/marketplace";
import { normOrderChecklist } from "@/lib/services/marketRuntime";
import type { SxValues } from "../contract";
import { draftRuntime, type Reader } from "./ReaderPage";

// A service draft on the site's own pages: the cabinet around it is the real
// sidebar and header, and the page inside is the real component the client
// or the lawyer opens — the lawyer's profile with the service picked, and the
// order page while the work is under way — fed with the draft instead of a
// saved record. Everything is inert: a preview never clicks through.

export type PortalRole = "client" | "lawyer" | "advocate";
export type DraftPage = "service" | "order";

const SELLER_ID = "studio-draft-seller";
const SERVICE_ID = "studio-draft-service";
const ORDER_ID = "studio-draft-order";
const CLIENT_NAME = "Aziz Karimov";
const SELLER_NAME = "Dilnoza Rahimova";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(str(v)) || 0);
const rows = (v: unknown): Dict[] => (Array.isArray(v) ? v.filter(isDict) : []);
const noop = () => {};

// Which cabinet the performer works in: an advocate's, when the service is
// one an advocate carries out, else a lawyer's.
export function performerRole(p: SxValues): PortalRole {
  const kinds = Array.isArray(p.executor_types) ? p.executor_types.map(str) : [str(p.executor_type)];
  return p.advokat_required === true || (kinds.some((k) => k.includes("advokat")) && !kinds.some((k) => k.includes("yurist"))) ? "advocate" : "lawyer";
}

export function PortalFrame({ role, active, name, children }: { role: PortalRole; active: string; name: string; children: ReactNode }): ReactElement {
  const t = useTranslations("portal");
  const nav = role === "advocate" ? ADVOCATE_NAV : role === "lawyer" ? LAWYER_NAV : CLIENT_NAV;
  const roleKey = role === "advocate" ? "Advocate" : role === "lawyer" ? "Lawyer" : "Client";
  return (
    <div className="portal sx-dev-portal" inert>
      <aside className="psb">
        <div className="psb__brand">
          <div className="psb__logo">
            <span className="logo__m">
              <IconLogo />
            </span>
            <span className="psb__label">LexGo</span>
          </div>
          <span className="psb__role">{t(`common.role${roleKey}`)}</span>
        </div>
        <nav className="psb__nav">
          {nav.map(({ href, key, Icon }) => (
            <span key={href} className={`psb__link${key === active ? " on" : ""}`}>
              <Icon />
              <span className="psb__label">{t(`sidebar.${role}.${key}`)}</span>
            </span>
          ))}
        </nav>
        <div className="psb__foot">
          <span className="psb__link">
            <IconLogout />
            <span className="psb__label">{t("common.logout")}</span>
          </span>
        </div>
      </aside>
      <div className="pmain">
        <header className="ptop">
          <span className="ptop__burger">
            <IconMenu />
          </span>
          <h1>{t(`sidebar.${role}.${active}`)}</h1>
          <div className="ptop__sp">
            <span className="ptop__user">
              <span className="ptop__av">{initials(name)}</span>
              <span>{name}</span>
            </span>
          </div>
        </header>
        <div className="pbody">
          <div className="pbody__in">{children}</div>
        </div>
      </div>
    </div>
  );
}

function draftService(p: SxValues, title: string): MarketService {
  const price = num(p.base_price);
  return {
    id: SERVICE_ID,
    title,
    categoryId: str(p.category_id),
    categoryTitle: "",
    basePrice: price,
    selectedPrice: price,
    price,
    currency: "UZS",
    deliveryMinutes: 0,
    experienceNote: "",
    advokatRequired: p.advokat_required === true,
    isSponsored: false,
  };
}

// The client's view of a lawyer offering the draft: the real profile page,
// the draft picked, its facts drawn from the draft's own runtime config.
function ServicePage({ p, title }: { p: SxValues; title: string }): ReactElement {
  const svc = draftService(p, title);
  const advocate = performerRole(p) === "advocate";
  const seller = normMarketSeller({
    user_id: SELLER_ID,
    lawyer_name: SELLER_NAME,
    seller_type: advocate ? "advokat" : "yurist",
    region: "tashkent",
    is_verified: true,
    rating: 4.9,
    reviews_count: 37,
    experience_years: 9,
    completed_orders: 128,
    success_rate: 94,
    languages: ["uz", "ru"],
  });
  return (
    <PortalFrame role="client" active="lawyers" name={CLIENT_NAME}>
      <SellerProfile
        userId={SELLER_ID}
        variant="portal"
        preview={{ seller: { ...withServices(seller, [svc]), reviews: [] }, services: [svc], picked: SERVICE_ID, top: false, topServiceId: "", ph: null, facts: draftRuntime(p, "client"), signedIn: true }}
      />
    </PortalFrame>
  );
}

// The order page while the work is under way, as one side sees it.
function OrderPage({ p, title, reader }: { p: SxValues; title: string; reader: Reader }): ReactElement {
  // A fixed moment per preview: the order started an hour before it opened.
  const [now] = useState(() => Date.now());
  const runtime = draftRuntime(p, reader);
  const d = runtime.duration;
  const days = d.value > 0 ? (/hour/.test(d.unit) ? d.value / 24 : /week/.test(d.unit) ? d.value * 7 : /month/.test(d.unit) ? d.value * 30 : d.value) : 0;
  const order = normMarketOrder({
    id: ORDER_ID,
    status: "in_progress",
    payment_status: "paid",
    service_id: SERVICE_ID,
    service_title: title,
    price: num(p.base_price),
    currency: "UZS",
    client_name: CLIENT_NAME,
    client_user_id: "studio-draft-client",
    lawyer_name: SELLER_NAME,
    lawyer_user_id: SELLER_ID,
    created_at: new Date(now - 7_200_000).toISOString(),
    started_at: new Date(now - 3_600_000).toISOString(),
    expected_completed_at: days > 0 ? new Date(now - 3_600_000 + days * 86_400_000).toISOString() : "",
    duration: d.value > 0 ? { value: d.value, unit: d.unit, calendar: d.calendar } : null,
  });
  const checklist = normOrderChecklist({ items: rows(p.completion_checklist).map((c, i) => ({ ...c, id: str(c.id) || `c${i}`, status: "pending" })) }, ORDER_ID);
  const detail: OrderDetail = {
    status: "ready",
    order,
    phase: marketPhaseOf(order),
    checklist,
    checklistState: "ready",
    opinion: null,
    opinionState: "none",
    runtime,
    refreshing: false,
    lastSignal: null,
    changed: 0,
    fresh: true,
    refresh: noop,
    patchOrder: noop,
    setChecklist: noop,
  };
  const role: PortalRole = reader === "client" ? "client" : performerRole(p);
  return (
    <PortalFrame role={role} active="marketplaceOrders" name={reader === "client" ? CLIENT_NAME : SELLER_NAME}>
      <OrderDetailView orderId={ORDER_ID} view={reader === "client" ? "client" : "seller"} listHref={`/portal/${role}/marketplace-orders`} d={detail} preview />
    </PortalFrame>
  );
}

export function DraftServicePage({ page, reader, payload, title }: { page: DraftPage; reader: Reader; payload: SxValues; title: string }): ReactElement {
  const t = useTranslations("studio");
  const name = title || t("sx.dev.page.untitled");
  return page === "service" && reader === "client" ? <ServicePage p={payload} title={name} /> : <OrderPage p={payload} title={name} reader={reader} />;
}
