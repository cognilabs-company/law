"use client";

import RatingBreakdown from "@/components/marketplace/RatingBreakdown";
import RatingPolicyCard from "@/components/admin/RatingPolicyCard";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listAdminReviews, moderateReview, getAdminReviewDetail, recalculateMarketplaceRatings, type AdminReviewDetail } from "@/lib/services/backend";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import { useResource } from "@/lib/useResource";
import { useReload } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import FilterBar from "@/components/filters/FilterBar";
import { useAiSelection } from "@/lib/ai/registry";
import { IconStar, IconCheck, IconClose, IconEye, IconScale, IconRefresh } from "@/components/icons";

function Stars({ n }: { n: number }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`stars__s${i <= n ? " on" : ""}`}><IconStar /></span>
      ))}
    </span>
  );
}

const transient = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || (e.status >= 500 && e.status !== 501);

type SellerTab = "all" | "advokat" | "yurist";
const SELLER_TABS: SellerTab[] = ["all", "advokat", "yurist"];

function ReviewDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.reviews");
  const [d, setD] = useState<AdminReviewDetail | null>(null);
  const [err, setErr] = useState<{ error: unknown } | null>(null);
  const [tick, retry] = useReload();
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(null); }, 0);
    getAdminReviewDetail(id)
      .then((x) => alive && setD(x))
      .catch((error: unknown) => alive && setErr({ error }));
    return () => { alive = false; clearTimeout(h); };
  }, [id, tick]);
  const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? null : (
    <div className="dkv__row" key={k}><span>{k}</span><b>{String(v)}</b></div>
  ));

  return (
    <Modal open={!!id} onClose={onClose} title={t("detailTitle")}>
      {err ? <ErrorState title={t("detailError")} error={err.error} onRetry={retry} /> : !d ? <Skeleton rows={3} /> : (
        <div className="dkv">
          <div className="dkv__sect">
            <b>{t("detail.review")}</b>
            <div className="dkv__row"><span>{t("detail.rating")}</span><Stars n={d.review.rating} /></div>
            {row(t("detail.status"), !d.review.status ? "" : t.has(`status.${d.review.status}`) ? t(`status.${d.review.status}`) : t("statusOther"))}
            {row(t("detail.comment"), d.review.comment)}
            {row(t("detail.note"), d.review.note)}
          </div>
          {d.seller ? (
            <div className="dkv__sect">
              <b>{t("detail.seller")}</b>
              {row(t("detail.name"), d.seller.name)}
              {row(t("detail.phone"), d.seller.phone)}
              {row(t("detail.sellerType"), !d.review.sellerType ? "" : t.has(`sellerKind.${d.review.sellerType}`) ? t(`sellerKind.${d.review.sellerType}`) : t("sellerKindOther"))}
              {d.sellerProfile ? row(t("detail.region"), d.sellerProfile.region) : null}
              {/* TSK-332221: how this seller's rating is made up, factor by factor. */}
              {d.seller.id ? (
                <div className="dkv__rating">
                  <span>{t("detail.ratingBreakdown")}</span>
                  <RatingBreakdown sellerId={d.seller.id} compact />
                </div>
              ) : null}
            </div>
          ) : null}
          {d.client ? (
            <div className="dkv__sect">
              <b>{t("detail.client")}</b>
              {row(t("detail.name"), d.client.name)}
              {row(t("detail.phone"), d.client.phone)}
            </div>
          ) : null}
          {d.caseTitle || d.orderId ? (
            <div className="dkv__sect">
              <b>{t("detail.context")}</b>
              {row(t("detail.case"), d.caseTitle)}
              {row(t("detail.order"), d.orderId)}
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export default function AdminReviews() {
  const t = useTranslations("admin.reviews");
  const tn = useTranslations("common.notify");
  const [key, reload] = useReload();
  const [tab, setTab] = useState<SellerTab>("all");
  const res = useResource(() => listAdminReviews({ sellerType: tab === "all" ? undefined : tab }), [key, tab]);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  // Ratings are recomputed by the backend's own policy; this only asks.
  const [recalc, setRecalc] = useState<"" | "ask" | "running">("");
  const once = useSameTickGuard();
  useAiSelection("admin_reviews_seller_type", tab === "all" ? "" : tab);

  async function recalculate() {
    if (recalc === "running" || !once()) return;
    setRecalc("running");
    try {
      const n = await recalculateMarketplaceRatings();
      notify.success(t("recalc.done"), { id: "ratings-recalc", body: n === null ? undefined : t("recalc.count", { n }) });
      reload();
    } catch (e) {
      notify.error(t("recalc.failed"), { id: "ratings-recalc", error: e });
    } finally {
      setRecalc("");
    }
  }

  async function moderate(id: string, status: "approved" | "rejected", name?: string) {
    setBusy(id);
    const ok = status === "approved";
    try {
      await moderateReview(id, status);
      notify.success(ok ? t("notify.approved") : t("notify.rejected"), { id: `review-${id}`, body: name || undefined });
      reload();
    } catch (e) {
      notify.error(ok ? t("notify.approveFailed") : t("notify.rejectFailed"), {
        id: `review-${id}`,
        error: e,
        action: transient(e) ? { label: tn("retry"), onClick: () => void moderate(id, status, name) } : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
    <RatingPolicyCard refreshKey={key} />
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="ahdr">
          <span className="advmuted">{res.data.length}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setRecalc("ask")} disabled={recalc === "running"} data-ai-id="admin.reviews.recalculate">
            <IconRefresh />
            {recalc === "running" ? t("recalc.running") : t("recalc.button")}
          </button>
        </span>
      </div>
      <Modal open={recalc === "ask"} onClose={() => setRecalc("")} title={t("recalc.title")}>
        <p className="advmuted" style={{ marginTop: 0 }}>{t("recalc.text")}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn--ghost" onClick={() => setRecalc("")}>
            {t("recalc.cancel")}
          </button>
          <button type="button" className="btn btn--pri" onClick={() => void recalculate()}>
            {t("recalc.confirm")}
          </button>
        </div>
      </Modal>
      <p className="ppanel__note">{t("lead")}</p>

      <FilterBar
        className="uf--tray uf--solo"
        fields={[
          {
            key: "seller",
            label: t("sellerTypeTabs"),
            icon: IconScale,
            value: tab,
            empty: "all",
            onChange: (v) => setTab(v as SellerTab),
            options: SELLER_TABS.map((s) => ({ value: s, label: s === "all" ? t("allSellers") : t(`sellerType.${s}`) })),
            chip: null,
            aiTarget: "reviews:seller-tabs",
          },
        ]}
      />

      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState error={res.error} onRetry={res.refresh} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconStar />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist" data-ai-target="reviews:list">
          {res.data.map((r) => (
            <div className="rvw" key={r.id}>
              <div className="rvw__top">
                <button type="button" className="rvw__name" onClick={() => setDetail(r.id)} title={t("detailTitle")}>
                  <b>{r.lawyerName || "—"}</b>
                </button>
                {/* sellerType.* is the tab wording ("Advokatlar"); a row tag wants
                    the singular. */}
                {r.sellerType ? <span className="atag atag--muted">{t.has(`sellerKind.${r.sellerType}`) ? t(`sellerKind.${r.sellerType}`) : t("sellerKindOther")}</span> : null}
                <Stars n={r.rating} />
                <span className={`creq__badge rvw__st rvw__st--${r.status}`}>{t.has(`status.${r.status}`) ? t(`status.${r.status}`) : t("statusOther")}</span>
                <button className="aitem__act" type="button" aria-label={t("detailTitle")} title={t("detailTitle")} onClick={() => setDetail(r.id)}><IconEye /></button>
              </div>
              {r.comment ? <p className="rvw__c">{r.comment}</p> : null}
              {r.status === "pending" ? (
                <div className="rvw__acts" data-ai-target="reviews:moderation">
                  <button className="btn btn--pri btn--sm" type="button" disabled={busy === r.id} onClick={() => moderate(r.id, "approved", r.lawyerName)}><IconCheck />{t("approve")}</button>
                  <button className="btn btn--line btn--sm" type="button" disabled={busy === r.id} onClick={() => moderate(r.id, "rejected", r.lawyerName)}><IconClose />{t("reject")}</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <ReviewDetail id={detail} onClose={() => setDetail(null)} />
    </div>
    </>
  );
}
