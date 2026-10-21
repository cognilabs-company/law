"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconAlert, IconArrowRight, IconBriefcase, IconCheck, IconClock, IconGem, IconMapPin, IconPackage, IconRefresh, IconShieldCheck, IconStar } from "@/components/icons";
import { isAborted } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { getPackageEligibleSellers, type BackendPackage, type PackageSeller } from "@/lib/services/backend";
import { useMarketError } from "./useMarketError";

const PAGE = 30;
const TIER_ICON = { BASIC: IconPackage, STANDARD: IconStar, PREMIUM: IconGem } as const;

type ListState = {
  key: string;
  status: "loading" | "ready" | "error";
  items: PackageSeller[];
  hasMore: boolean;
  total: number;
  unresolved: string[];
  error: unknown;
  offset: number;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "•";

export default function PackageSellersDialog({
  pkg,
  title,
  reload,
  onClose,
  onPick,
}: {
  pkg: BackendPackage | null;
  title: string;
  reload: number;
  onClose: () => void;
  onPick: (seller: PackageSeller) => void;
}) {
  const t = useTranslations("marketplace.packageSellers");
  const tp = useTranslations("portal.client.packages");
  const tr = useTranslations("portal.client.services.packageErrors");
  const reasonText = (r: string) => (tr.has(r) ? tr(r) : r.replace(/_/g, " "));
  const marketErr = useMarketError();
  const key = pkg ? `${pkg.id}:${reload}` : "";
  const [list, setList] = useState<ListState>({ key: "", status: "loading", items: [], hasMore: false, total: 0, unresolved: [], error: null, offset: -1 });
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setOffset(0);
  }

  useEffect(() => {
    if (!pkg) return;
    const c = new AbortController();
    getPackageEligibleSellers(pkg.id, { limit: PAGE, offset })
      .then((r) => {
        if (c.signal.aborted) return;
        setList((cur) => {
          const prev = cur.key === key && offset > 0 ? cur.items : [];
          const seen = new Set(prev.map((s) => s.userId));
          return {
            key,
            status: "ready",
            items: [...prev, ...r.items.filter((s) => !seen.has(s.userId))],
            hasMore: r.hasMore,
            total: r.total,
            unresolved: r.unresolvedServiceCodes,
            error: null,
            offset,
          };
        });
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setList((cur) => ({ ...cur, key, status: offset > 0 && cur.key === key ? "ready" : "error", error: e, offset }));
      });
    return () => c.abort();
  }, [pkg, key, offset, retry]);

  if (!pkg) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const mine = list.key === key;
  const loading = !mine || (list.status === "loading" && !list.items.length);
  const tariff = pkg.tariff;
  const TierIcon = TIER_ICON[tariff as keyof typeof TIER_ICON] ?? IconPackage;
  const tierLabel = tp.has(`tiers.${tariff}`) ? tp(`tiers.${tariff}`) : tariff;
  const premium = tariff === "PREMIUM";
  const altLabel = tp.has("tiers.STANDARD") ? tp("tiers.STANDARD") : "STANDARD";
  const pagingMore = mine && offset > 0 && list.offset !== offset;

  return (
    <Modal open onClose={onClose} title={t("title")} size="lg" aiId="marketplace.package-sellers">
      <div className="pks" data-ai-id="marketplace.package-sellers" data-ai-type="section" data-ai-label={t("title")} data-ai-entity-type="marketplace_package" data-ai-entity-id={pkg.id}>
        <div className={`pks__pkg pks__pkg--${tariff.toLowerCase()}`}>
          <span className="pks__ti" aria-hidden>
            <TierIcon />
          </span>
          <div className="pks__pkgt">
            <small>{tierLabel}</small>
            <b>{title}</b>
            {pkg.duration ? (
              <span className="pks__dur">
                <IconClock aria-hidden />
                {pkg.duration}
              </span>
            ) : null}
          </div>
          <div className="pks__price">
            <b>{fmtUzs(pkg.price)}</b>
            <small>{tp("som")}</small>
          </div>
        </div>

        <ol className="mk-steps pks__steps" aria-label={t("stepsLabel")}>
          <li className="is-done">
            <span>
              <IconCheck aria-hidden />
            </span>
            {t("stepTier")}
          </li>
          <li className="is-now" aria-current="step">
            <span>2</span>
            {t("stepSeller")}
          </li>
          <li>
            <span>3</span>
            {t("stepOptions")}
          </li>
        </ol>

        <p className={`pks__policy${premium ? " is-premium" : ""}`}>
          <IconShieldCheck aria-hidden />
          <span>{t(`policy.${premium ? "PREMIUM" : tariff === "STANDARD" ? "STANDARD" : "BASIC"}`, { tier: tierLabel })}</span>
        </p>

        {loading ? (
          <div className="pks__sk" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        ) : list.status === "error" ? (
          <div className="pks__state">
            <IconAlert aria-hidden />
            <b>{t("errorTitle")}</b>
            <p>{marketErr(list.error, t("errorText"))}</p>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setRetry((n) => n + 1)}>
              <IconRefresh aria-hidden />
              {t("retry")}
            </button>
          </div>
        ) : list.unresolved.length ? (
          <Notice ok={false} msg={tp("misconfigured", { codes: list.unresolved.join(", ") })} />
        ) : !list.items.length ? (
          <div className="pks__state">
            <IconBriefcase aria-hidden />
            <b>{t("emptyTitle")}</b>
            <p>{premium ? t("emptyPremium", { tier: tierLabel, alt: altLabel }) : t("emptyText")}</p>
          </div>
        ) : (
          <>
            <p className="pks__count">
              {t("count", { n: list.total || list.items.length })}
              <span>{t("orderNote")}</span>
            </p>
            <ul className="pks__list">
              {list.items.map((s, i) => {
                const blocked = !s.eligibility.eligible;
                return (
                  <li key={s.userId} className={`pks__card${blocked ? " is-off" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <span className="pks__av" aria-hidden>
                      {initials(s.name)}
                      {s.onlineNow ? <i className="pks__on" /> : null}
                    </span>
                    <div className="pks__body">
                      <b className="pks__name">
                        {s.name || t("noName")}
                        {s.verified ? <IconShieldCheck className="pks__vf" aria-label={t("verified")} /> : null}
                      </b>
                      <div className="pks__meta">
                        <span>
                          <IconStar aria-hidden />
                          {s.rated ? t("rating", { r: s.ratingLabel || s.rating.toFixed(1), n: s.reviews }) : t("newSeller")}
                        </span>
                        {s.completedOrders ? <span>{t("completed", { n: s.completedOrders })}</span> : null}
                        {s.experienceYears ? <span>{t("experience", { n: s.experienceYears })}</span> : null}
                        {s.region || s.district ? (
                          <span>
                            <IconMapPin aria-hidden />
                            {[s.district, s.region].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </div>
                      <div className="pks__tags">
                        {s.eligibility.extendedVerified ? (
                          <em className="pks__tag is-ext">
                            <IconGem aria-hidden />
                            {t("extended")}
                          </em>
                        ) : null}
                        {s.sellerType ? <em className="pks__tag">{t.has(`types.${s.sellerType}`) ? t(`types.${s.sellerType}`) : s.sellerType}</em> : null}
                        {s.onlineNow ? <em className="pks__tag is-on">{t("online")}</em> : null}
                      </div>
                      {blocked && s.eligibility.reasons.length ? <small className="pks__why">{s.eligibility.reasons.map(reasonText).join(" · ")}</small> : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn--grad btn--sm pks__pick"
                      disabled={blocked}
                      onClick={() => onPick(s)}
                      data-ai-id={`marketplace.package-sellers.pick.${s.userId}`}
                      data-ai-label={s.name}
                    >
                      {t("pick")}
                      <IconArrowRight aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            {list.error ? <Notice ok={false} msg={marketErr(list.error, t("errorText"))} /> : null}
            {list.hasMore ? (
              <button type="button" className="btn btn--line btn--full pks__more" disabled={pagingMore} onClick={() => {
                  setOffset(list.items.length);
                  setRetry((n) => n + 1);
                }}>
                {pagingMore ? t("loading") : t("more")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
