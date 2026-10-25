"use client";

import "./profileServices.css";
import { useCallback, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyState, Skeleton } from "@/components/portal/DataState";
import { IconAlert, IconArrowRight, IconBriefcase, IconEye, IconEyeOff, IconGavel, IconMegaphone } from "@/components/icons";
import { fmtUzs } from "@/lib/money";
import { useResource } from "@/lib/useResource";
import { listManagedServices, type ManagedService } from "@/lib/services/sellerServices";
import { uzLabel } from "@/lib/uzScript";

// The seller's services on their profile, as something to act on: each with
// its price, whether clients can see it and whether it is advertised, a
// warning when some are not reaching clients, and the way to manage them.

const priceOf = (m: ManagedService) => m.effectivePrice || m.selectedPrice || m.service.price || 0;
const reaching = (m: ManagedService) => m.status === "active" && m.visible && priceOf(m) > 0;

export default function ProfileServices({ role }: { role: "advocate" | "lawyer" }): ReactElement {
  const t = useTranslations("portal.advocate.profile.svc");
  const locale = useLocale();
  const load = useCallback(() => listManagedServices({ kind: "me" }, locale).then((r) => r.items), [locale]);
  const res = useResource(load, [load]);
  const href = `/portal/${role}/services`;
  const items = res.data;
  const hidden = items.filter((m) => !reaching(m)).length;

  return (
    <section className="ppanel psv" data-ai-target="profile:services" aria-labelledby="psv-title">
      <div className="ppanel__h psv__h">
        <b className="ppanel__t" id="psv-title">
          <span className="pico">
            <IconGavel />
          </span>
          {t("title")}
          {res.status === "ready" ? <span className="psv__n">{items.length}</span> : null}
        </b>
        <Link href={href} className="btn btn--line btn--sm">
          {t("manage")}
          <IconArrowRight aria-hidden="true" />
        </Link>
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={2} />
      ) : !items.length ? (
        <EmptyState icon={<IconBriefcase />} title={t("emptyTitle")} text={t("emptyText")} action={{ label: t("add"), href }} />
      ) : (
        <>
          {hidden ? (
            <p className="psv__warn" role="status">
              <IconAlert aria-hidden="true" />
              <span>{t("notReaching", { n: hidden })}</span>
              <Link href={href}>{t("fix")}</Link>
            </p>
          ) : (
            <p className="psv__ok">{t("allReaching")}</p>
          )}
          <ul className="psv__list">
            {items.map((m) => {
              const price = priceOf(m);
              const live = reaching(m);
              return (
                <li key={m.id} className="psv__item" data-live={live || undefined}>
                  <div className="psv__main">
                    <b>{uzLabel(m.service.name, locale)}</b>
                    {m.service.categoryTitle ? <small>{uzLabel(m.service.categoryTitle, locale)}</small> : null}
                  </div>
                  <div className="psv__side">
                    <span className="psv__price sx-num">{price ? `${fmtUzs(price)} ${t("som")}` : t("noPrice")}</span>
                    <span className="psv__chips">
                      <span className="psv__chip" data-tone={live ? "ok" : "off"}>
                        {live ? <IconEye aria-hidden="true" /> : <IconEyeOff aria-hidden="true" />}
                        {live ? t("visible") : m.status !== "active" ? t(`status.${m.status}`) : !price ? t("noPriceShort") : t("hidden")}
                      </span>
                      {m.ownPromotion ? (
                        <span className="psv__chip" data-tone="promo">
                          <IconMegaphone aria-hidden="true" />
                          {t("promoted")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
