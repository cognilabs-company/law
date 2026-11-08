"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  hiddenReasons,
  isZeroBand,
  priceBandFor,
  type ManagedService,
  type PendingPromo,
  type PriceBand,
  type ServiceSellerProfile,
  type ServiceStatus,
} from "@/lib/services/sellerServices";
import { priceCapOf } from "@/lib/services/marketRuntime";
import { IconAlert, IconClock, IconCoins, IconEdit, IconEye, IconEyeOff, IconLayers, IconLock, IconMegaphone, IconTrash } from "@/components/icons";
import { StatusPill, StatusSwitch, som } from "./bits";
import { PriceModifiers, bandRecommended } from "./PriceField";
import { useRuntimeConfig } from "./useRuntimeConfig";
import "./config.css";

type BandLoad = { key: string; band: PriceBand | null };

export default function ServiceCard({
  item,
  profile,
  sellerId,
  pending,
  busy,
  first,
  index,
  onStatus,
  onEdit,
  onPromote,
  onRemove,
  aiId,
  enableLock,
  statusError,
  showNegotiation,
  readOnly,
  noPromote,
}: {
  aiId?: string;
  // The account may not change this service (a 403 on a change): status,
  // edit, promote and remove are not rendered — the card only reads.
  readOnly?: boolean;
  // Promotion was refused (403): the promote button is not rendered.
  noPromote?: boolean;
  enableLock?: { reason: string; onOpen: () => void } | null;
  statusError?: string;
  showNegotiation?: boolean;
  item: ManagedService;
  profile: ServiceSellerProfile;
  sellerId: string;
  pending: PendingPromo | null;
  busy: boolean;
  first: boolean;
  index: number;
  onStatus: (s: ServiceStatus) => void;
  onEdit: () => void;
  onPromote: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("sellerServices");
  const uid = useId();
  const lockId = `${uid}-lock`;
  const errId = `${uid}-err`;
  const runtime = useRuntimeConfig(item.id);
  const runtimeFailed = runtime.state === "failed";
  const region = profile.region;
  const bandKey = `${item.id}|${sellerId}|${region}`;
  const [bandLoad, setBandLoad] = useState<BandLoad | null>(null);
  const hasLimits = Boolean(item.limits);

  useEffect(() => {
    if (hasLimits || !runtimeFailed) return;
    let alive = true;
    priceBandFor(item.id, sellerId, region)
      .then((band) => {
        if (alive) setBandLoad({ key: bandKey, band });
      })
      .catch(() => {
        if (alive) setBandLoad({ key: bandKey, band: null });
      });
    return () => {
      alive = false;
    };
  }, [item.id, sellerId, region, bandKey, hasLimits, runtimeFailed]);

  const loaded = bandLoad && bandLoad.key === bandKey ? bandLoad : null;
  const band = item.limits ?? loaded?.band ?? null;
  const known = hasLimits || Boolean(loaded);
  const pricing = runtime.config?.pricing ?? null;
  const runtimeRec = pricing && pricing.recommendedPrice > 0 ? pricing.recommendedPrice : 0;
  const legacyRec = band && !isZeroBand(band) ? bandRecommended(band) : 0;
  const rec = runtimeRec || legacyRec;
  const cap = pricing ? priceCapOf(pricing) : null;
  const off = cap !== null && item.selectedPrice > cap;
  const bandText =
    runtime.state === "loading" || runtime.state === "idle"
      ? t("config.cardLoading")
      : isZeroBand(band) && !runtimeRec
        ? t("card.bandNone")
        : off && cap
          ? t("config.cardAboveMax", { max: som(cap) })
          : runtime.state === "ready" && rec > 0
            ? cap
              ? t("config.cardRecMax", { rec: som(rec), max: som(cap) })
              : t("config.cardRec", { rec: som(rec) })
            : rec > 0
              ? t("config.cardRec", { rec: som(rec) })
              : runtimeFailed && !known
                ? t("card.bandLoading")
                : t("card.bandUnknown");
  const negotiation = Boolean(showNegotiation) && item.negotiationAllowed === true;
  const describedBy = [enableLock && !readOnly ? lockId : "", statusError ? errId : ""].filter(Boolean).join(" ");
  const own = item.ownPromotion;
  const editable = item.service.isActive;
  const reasons = hiddenReasons(item, profile)
    .map((r) => t(`reasons.${r}`))
    .join(", ");
  const canPromote = item.status === "active" && item.service.isActive && !own && !pending;
  const category = item.service.categoryTitle || item.service.subcategory || t("card.service");
  const sub = (s: string) => (aiId ? `${aiId}.${s}` : undefined);

  return (
    <article
      className={`msv msv--${item.status}${own ? " msv--promo" : ""}`}
      style={{ ["--msv-i" as string]: String(Math.min(index, 10)) }}
      data-ai-target={first ? "services:card" : undefined}
      aria-label={item.service.name}
      data-ai-id={aiId}
      data-ai-type={aiId ? "card" : undefined}
      data-ai-entity-type={aiId ? "service" : undefined}
      data-ai-entity-id={aiId ? item.id : undefined}
    >
      <div className="msv__top">
        <span className="msv__cat" title={category}>
          <IconLayers aria-hidden="true" />
          <span>{category}</span>
        </span>
        <StatusPill status={item.status} />
      </div>

      {own ? (
        <span className="msv__rib" title={t("card.promotedHint", { days: own.daysLeft })}>
          <IconMegaphone aria-hidden="true" />
          {t("card.promoted", { days: own.daysLeft })}
        </span>
      ) : pending ? (
        <span className="msv__rib msv__rib--wait" title={t("card.pendingHint")}>
          <IconClock aria-hidden="true" />
          {t("card.pending")}
        </span>
      ) : null}

      <h3 className="msv__t">{item.service.name}</h3>

      <div className="msv__price">
        <span className="msv__amount">
          <b>{som(item.effectivePrice)}</b>
          <small>{t("card.som")}</small>
        </span>
        {!item.selectedPrice ? <span className="msv__tag">{t("card.catalogPrice")}</span> : null}
        {item.priceCapped ? <span className="msv__tag msv__tag--cap" title={t("card.cappedHint", { price: som(item.selectedPrice) })}>{t("card.capped")}</span> : null}
        {negotiation ? <span className="msv__tag svcfg-neg">{t("config.negotiationChip")}</span> : null}
      </div>
      <p className={`msv__band${off ? " is-off" : ""}`}>
        <IconCoins aria-hidden="true" />
        <span>{bandText}</span>
      </p>
      {band?.modifiers?.length ? <PriceModifiers modifiers={band.modifiers} variant="chips" /> : null}

      {item.experienceNote ? (
        <p className="msv__note">{item.experienceNote}</p>
      ) : editable && !readOnly ? (
        <button type="button" className="msv__addnote" onClick={onEdit}>
          <IconEdit aria-hidden="true" />
          {t("card.noteEmpty")}
        </button>
      ) : null}

      <p className={`msv__vis${item.visible ? " is-on" : ""}`}>
        {item.visible ? <IconEye aria-hidden="true" /> : <IconEyeOff aria-hidden="true" />}
        <span>{item.visible ? t("card.visible") : t("card.hidden", { reasons })}</span>
      </p>

      {enableLock && !readOnly ? (
        <p id={lockId} className="svcfg-lock">
          <IconLock aria-hidden="true" />
          <span>{enableLock.reason}</span>
          <button type="button" className="svcfg-lock__btn" onClick={enableLock.onOpen}>
            {t("rules.lockAction")}
          </button>
        </p>
      ) : null}
      {statusError ? (
        <p id={errId} className="svcfg-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{statusError}</span>
        </p>
      ) : null}

      {readOnly ? null : (
        <div className="msv__foot">
          <StatusSwitch
            value={item.status}
            busy={busy}
            onChange={onStatus}
            label={t("statusLabel")}
            aiTarget={first ? "services:status" : undefined}
            aiId={sub("status")}
            lockActive={enableLock ? enableLock.reason : undefined}
            describedBy={describedBy || undefined}
          />
          <div className="msv__acts">
            {/* A catalog service the admins switched off cannot be edited,
                and only an active, not-yet-promoted service can be promoted
                (the ribbon above already tells a live or waiting promotion):
                a locked action is not rendered at all. */}
            {editable ? (
              <button type="button" className="btn btn--line btn--sm msv__edit" onClick={onEdit} data-ai-id={sub("edit")}>
                <IconEdit aria-hidden="true" />
                {t("card.edit")}
              </button>
            ) : null}
            {canPromote && !noPromote ? (
              <button
                type="button"
                className="btn btn--sm msv__promo"
                onClick={onPromote}
                data-ai-target={first ? "button:promote-service" : undefined}
                data-ai-id={sub("promote")}
              >
                <IconMegaphone aria-hidden="true" />
                {t("card.promote")}
              </button>
            ) : null}
            <button type="button" className="msv__del" onClick={onRemove} aria-label={t("card.remove")} title={t("card.remove")}>
              <IconTrash aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
