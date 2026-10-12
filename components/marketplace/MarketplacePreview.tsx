"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getMarketplaceSeller, getMarketplaceSellerServices, type MarketSellerDetail, type MarketService } from "@/lib/services/marketplace";
import { mutePromoTracking } from "@/lib/services/promoEvents";
import {
  PH_SERVICE_ID,
  PREVIEW_DRAFT,
  PREVIEW_META,
  PREVIEW_READY,
  adSurface,
  mergeSeller,
  seedSeller,
  type DirectoryPreview,
  type PreviewMessage,
  type ProfilePreview,
} from "@/lib/marketPreview";
import MarketDirectory from "./MarketDirectory";
import SellerProfile from "./SellerProfile";

type Base = { id: string; seller: MarketSellerDetail | null; services: MarketService[] };
type Target = { sel: string; label: string; block: ScrollLogicalPosition };
type Mark = { key: string; label: string; x: number; y: number; w: number; h: number };

const BLOCKED = ["click", "dblclick", "mousedown", "pointerdown", "submit", "keydown", "contextmenu", "dragstart"];

function shown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden";
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  return a.length === b.length && a.every((m, i) => m.key === b[i].key && m.x === b[i].x && m.y === b[i].y && m.w === b[i].w && m.h === b[i].h);
}

export default function MarketplacePreview() {
  const t = useTranslations("sellerServices.preview");
  const [msg, setMsg] = useState<PreviewMessage | null>(null);
  const [base, setBase] = useState<Base | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    mutePromoTracking();
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    for (const type of BLOCKED) document.addEventListener(type, stop, true);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const data = e.data as PreviewMessage | null;
      if (data?.type === PREVIEW_DRAFT) setMsg(data);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);
    return () => {
      for (const type of BLOCKED) document.removeEventListener(type, stop, true);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  const sellerId = msg?.draft.sellerId ?? "";
  useEffect(() => {
    if (!sellerId) return;
    let alive = true;
    void Promise.all([getMarketplaceSeller(sellerId).catch(() => null), getMarketplaceSellerServices(sellerId).catch(() => [] as MarketService[])]).then(([seller, services]) => {
      if (alive) setBase({ id: sellerId, seller, services: services.length ? services : (seller?.services ?? []) });
    });
    return () => {
      alive = false;
    };
  }, [sellerId]);
  const loaded = base && base.id === sellerId ? base : null;

  useEffect(() => {
    if (loaded) window.parent.postMessage({ type: PREVIEW_META, listed: Boolean(loaded.seller) }, window.location.origin);
  }, [loaded]);

  const merged = useMemo(() => {
    if (!msg || !loaded) return null;
    const d = msg.draft;
    const from = loaded.seller ?? seedSeller(d.sellerId, d.seed);
    const m = mergeSeller(from, loaded.services, d);
    return { ...m, detail: { ...m.seller, reviews: loaded.seller?.reviews ?? [] } };
  }, [msg, loaded]);

  const placement = msg?.draft.kind === "ad" ? (msg.draft.ad?.placement ?? "") : "";
  const phService = t("phService");

  const directory = useMemo<DirectoryPreview | null>(() => {
    if (!msg || !merged) return null;
    return {
      seller: merged.seller,
      first: placement === "profile_boost",
      banner: placement === "banner" ? adSurface(merged.seller, msg.draft, phService) : null,
      tile: placement === "service_boost" ? adSurface(merged.seller, msg.draft, phService) : null,
      phService: placement === "service_boost" && !msg.draft.service ? phService : "",
    };
  }, [msg, merged, placement, phService]);

  const profile = useMemo<ProfilePreview | null>(() => {
    if (!merged) return null;
    return {
      seller: merged.detail,
      services: merged.services,
      picked: merged.serviceId,
      top: placement === "profile_boost" || placement === "banner",
      topServiceId: placement === "service_boost" ? merged.serviceId : "",
      ph: merged.serviceId === PH_SERVICE_ID ? { title: phService, category: t("phCategory"), price: t("phPrice") } : null,
    };
  }, [merged, placement, phService, t]);

  const targets = useMemo<Target[]>(() => {
    if (!msg) return [];
    const card = `.mk-grid > [data-ai-entity-id="${CSS.escape(msg.draft.sellerId)}"]`;
    const ad = t("mineAd");
    if (msg.view === "profile") {
      if (msg.draft.kind === "service" || placement === "service_boost") return [{ sel: ".mk-svcs .mk-svc.is-on", label: msg.draft.kind === "ad" ? ad : t("mineService"), block: "center" }];
      return [{ sel: ".mk-prof__hero", label: msg.draft.kind === "ad" ? ad : t("mineProfile"), block: "start" }];
    }
    if (placement === "banner") {
      return [
        { sel: `.mk-show__card.is-on[data-ai-entity-id="${CSS.escape(msg.draft.sellerId)}"]`, label: ad, block: "center" },
        { sel: ".mk-adslot .mk-promo-banner", label: ad, block: "center" },
      ];
    }
    if (placement === "profile_boost") return [{ sel: card, label: ad, block: "center" }];
    if (placement === "service_boost") return [{ sel: ".mk-promo-sponsored .mk-promo-tile", label: ad, block: "center" }, { sel: card, label: t("mineCard"), block: "center" }];
    return [{ sel: card, label: t("mineCard"), block: "center" }];
  }, [msg, placement, t]);

  useEffect(() => {
    if (!targets.length || !merged) return;
    let scrolled = false;
    const tick = () => {
      const found: Mark[] = [];
      for (const tg of targets) {
        const el = Array.from(document.querySelectorAll(tg.sel)).find(shown);
        if (!el) continue;
        if (!scrolled) {
          el.scrollIntoView({ block: tg.block });
          if (tg.block === "start") window.scrollBy(0, -56);
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        found.push({ key: tg.sel, label: tg.label, x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
      }
      setMarks((cur) => (sameMarks(cur, found) ? cur : found));
    };
    const onResize = () => {
      scrolled = false;
    };
    const id = window.setInterval(tick, 300);
    tick();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", onResize);
    };
  }, [targets, merged]);

  if (!msg || !directory || !profile) return <div className="mkpv mkpv--wait" aria-busy="true" />;
  return (
    <div className="mkpv">
      <section className="sec mk-sec">
        <div className="wrap">{msg.view === "profile" ? <SellerProfile userId={msg.draft.sellerId} variant="public" preview={profile} /> : <MarketDirectory variant="public" preview={directory} />}</div>
      </section>
      {marks.map((m) => (
        <div key={m.key} className="mkpv__mark" style={{ left: m.x, top: m.y, width: m.w, height: m.h }} aria-hidden="true">
          <span>{m.label}</span>
        </div>
      ))}
    </div>
  );
}
