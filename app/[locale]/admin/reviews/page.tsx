"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listAdminReviews, moderateReview, getAdminReviewDetail, type AdminReviewDetail } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useReload, Notice } from "@/components/admin/AdminBits";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import { errDetail } from "@/lib/http";
import { IconStar, IconCheck, IconClose, IconEye } from "@/components/icons";

function Stars({ n }: { n: number }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`stars__s${i <= n ? " on" : ""}`}><IconStar /></span>
      ))}
    </span>
  );
}

type SellerTab = "all" | "advokat" | "yurist";
const SELLER_TABS: SellerTab[] = ["all", "advokat", "yurist"];

function ReviewDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.reviews");
  const [d, setD] = useState<AdminReviewDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(false); }, 0);
    getAdminReviewDetail(id)
      .then((x) => alive && setD(x))
      .catch(() => alive && setErr(true));
    return () => { alive = false; clearTimeout(h); };
  }, [id]);
  const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? null : (
    <div className="dkv__row" key={k}><span>{k}</span><b>{String(v)}</b></div>
  ));

  return (
    <Modal open={!!id} onClose={onClose} title={t("detailTitle")}>
      {err ? <Notice ok={false} msg={t("detailError")} /> : !d ? <Skeleton rows={3} /> : (
        <div className="dkv">
          <div className="dkv__sect">
            <b>{t("detail.review")}</b>
            <div className="dkv__row"><span>{t("detail.rating")}</span><Stars n={d.review.rating} /></div>
            {row(t("detail.status"), t.has(`status.${d.review.status}`) ? t(`status.${d.review.status}`) : d.review.status)}
            {row(t("detail.comment"), d.review.comment)}
            {row(t("detail.note"), d.review.note)}
          </div>
          {d.seller ? (
            <div className="dkv__sect">
              <b>{t("detail.seller")}</b>
              {row(t("detail.name"), d.seller.name)}
              {row(t("detail.phone"), d.seller.phone)}
              {row(t("detail.sellerType"), t.has(`sellerKind.${d.review.sellerType}`) ? t(`sellerKind.${d.review.sellerType}`) : d.review.sellerType)}
              {d.sellerProfile ? row(t("detail.region"), d.sellerProfile.region) : null}
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
  const [key, reload] = useReload();
  const [tab, setTab] = useState<SellerTab>("all");
  const res = useResource(() => listAdminReviews({ sellerType: tab === "all" ? undefined : tab }), [key, tab]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  async function moderate(id: string, status: string) {
    setBusy(id);
    setErr(null);
    try {
      await moderateReview(id, status);
      reload();
    } catch (e) {
      setErr(errDetail(e) || t("error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h"><b>{t("title")}</b><span className="advmuted">{res.data.length}</span></div>
      <p className="ppanel__note">{t("lead")}</p>

      <div className="segs segs--sm" role="tablist" aria-label={t("sellerTypeTabs")} style={{ marginBottom: 14 }}>
        {SELLER_TABS.map((s) => (
          <button key={s} type="button" role="tab" className="seg" aria-selected={tab === s} onClick={() => setTab(s)}>
            {s === "all" ? t("allSellers") : t(`sellerType.${s}`)}
          </button>
        ))}
      </div>

      {err ? <Notice ok={false} msg={err} /> : null}
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconStar />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {res.data.map((r) => (
            <div className="rvw" key={r.id}>
              <div className="rvw__top">
                <button type="button" className="rvw__name" onClick={() => setDetail(r.id)} title={t("detailTitle")}>
                  <b>{r.lawyerName || "—"}</b>
                </button>
                {/* sellerType.* is the tab wording ("Advokatlar"); a row tag wants
                    the singular. */}
                {r.sellerType ? <span className="atag atag--muted">{t.has(`sellerKind.${r.sellerType}`) ? t(`sellerKind.${r.sellerType}`) : r.sellerType}</span> : null}
                <Stars n={r.rating} />
                <span className={`creq__badge rvw__st rvw__st--${r.status}`}>{t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status}</span>
                <button className="aitem__act" type="button" aria-label={t("detailTitle")} title={t("detailTitle")} onClick={() => setDetail(r.id)}><IconEye /></button>
              </div>
              {r.comment ? <p className="rvw__c">{r.comment}</p> : null}
              {r.status === "pending" ? (
                <div className="rvw__acts">
                  <button className="btn btn--pri btn--sm" type="button" disabled={busy === r.id} onClick={() => moderate(r.id, "approved")}><IconCheck />{t("approve")}</button>
                  <button className="btn btn--line btn--sm" type="button" disabled={busy === r.id} onClick={() => moderate(r.id, "rejected")}><IconClose />{t("reject")}</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <ReviewDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
