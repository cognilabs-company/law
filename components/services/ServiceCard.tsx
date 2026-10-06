"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  hiddenReasons,
  priceBandFor,
  type ManagedService,
  type PendingPromo,
  type PriceBand,
  type ServiceSellerProfile,
  type ServiceStatus,
} from "@/lib/services/sellerServices";
import { IconClock, IconCoins, IconEdit, IconEye, IconEyeOff, IconLayers, IconMegaphone, IconTrash } from "@/components/icons";
import { StatusPill, StatusSwitch, som } from "./bits";
import { priceOutOfBand } from "./PriceField";

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
}: {
  aiId?: string;
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
  const region = profile.region;
  const bandKey = `${item.id}|${sellerId}|${region}`;
  const [bandLoad, setBandLoad] = useState<BandLoad | null>(null);
  const hasLimits = Boolean(item.limits);

  useEffect(() => {
    if (hasLimits) return;
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
  }, [item.id, sellerId, region, bandKey, hasLimits]);

  const loaded = bandLoad && bandLoad.key === bandKey ? bandLoad : null;
  const band = item.limits ?? loaded?.band ?? null;
  const known = hasLimits || Boolean(loaded);
  const off = priceOutOfBand(item.selectedPrice, band);
  const own = item.ownPromotion;
  const editable = item.service.isActive;
  const reasons = hiddenReasons(item, profile)
    .map((r) => t(`reasons.${r}`))
    .join(", ");
  const canPromote = item.status === "active" && item.service.isActive && !own && !pending;
  const promoteTitle = own
    ? t("card.promotedHint", { days: own.daysLeft })
    : pending
      ? t("card.pendingHint")
      : item.status !== "active" || !item.service.isActive
        ? t("card.promoteInactive")
        : undefined;
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
      </div>
      <p className={`msv__band${off ? " is-off" : ""}`}>
        <IconCoins aria-hidden="true" />
        <span>
          {!known
            ? t("card.bandLoading")
            : band
              ? off
                ? t("card.bandOff", { min: som(band.min), max: som(band.max) })
                : t("card.band", { min: som(band.min), max: som(band.max) })
              : t("card.bandUnknown")}
        </span>
      </p>

      {item.experienceNote ? (
        <p className="msv__note">{item.experienceNote}</p>
      ) : editable ? (
        <button type="button" className="msv__addnote" onClick={onEdit}>
          <IconEdit aria-hidden="true" />
          {t("card.noteEmpty")}
        </button>
      ) : null}

      <p className={`msv__vis${item.visible ? " is-on" : ""}`}>
        {item.visible ? <IconEye aria-hidden="true" /> : <IconEyeOff aria-hidden="true" />}
        <span>{item.visible ? t("card.visible") : t("card.hidden", { reasons })}</span>
      </p>

      <div className="msv__foot">
        <StatusSwitch value={item.status} busy={busy} onChange={onStatus} label={t("statusLabel")} aiTarget={first ? "services:status" : undefined} aiId={sub("status")} />
        <div className="msv__acts">
          <button
            type="button"
            className="btn btn--line btn--sm msv__edit"
            onClick={onEdit}
            disabled={!editable}
            title={editable ? undefined : t("card.editLocked")}
            data-ai-id={sub("edit")}
          >
            <IconEdit aria-hidden="true" />
            {t("card.edit")}
          </button>
          <button
            type="button"
            className={`btn btn--sm msv__promo${own ? " is-live" : ""}`}
            onClick={onPromote}
            disabled={!canPromote}
            title={promoteTitle}
            data-ai-target={first ? "button:promote-service" : undefined}
            data-ai-id={sub("promote")}
          >
            {pending && !own ? <IconClock aria-hidden="true" /> : <IconMegaphone aria-hidden="true" />}
            {own ? t("card.promotedShort") : pending ? t("card.pending") : t("card.promote")}
          </button>
          <button type="button" className="msv__del" onClick={onRemove} aria-label={t("card.remove")} title={t("card.remove")}>
            <IconTrash aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
