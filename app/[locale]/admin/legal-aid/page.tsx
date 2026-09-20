"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listLegalAid, getLegalAidRequestDetail, type LegalAidDetail } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { IconScale, IconPhone, IconEye } from "@/components/icons";

const s = (v: unknown) => (v == null ? "" : String(v));
const fmtDate = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("ru-RU");
};

// GET /legal-aid/requests/{id} (2026-09-19 backend) — the list had no working
// "open" before this; source/event/creator tell an admin what triggered it.
function LegalAidDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.legalAid");
  const [d, setD] = useState<LegalAidDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(false); }, 0);
    getLegalAidRequestDetail(id).then((x) => alive && setD(x)).catch(() => alive && setErr(true));
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
            <b>{t("detail.request")}</b>
            {row(t("detail.name"), s(d.request.payload.name))}
            {row(t("detail.phone"), s(d.request.payload.phone))}
            {row(t("detail.details"), s(d.request.payload.details) || d.request.title)}
            {row(t("detail.status"), t.has(`status.${d.request.status}`) ? t(`status.${d.request.status}`) : d.request.status)}
            {row(t("detail.created"), fmtDate(d.request.createdAt))}
          </div>
          <div className="dkv__sect">
            <b>{t("detail.origin")}</b>
            {row(t("detail.source"), d.source)}
            {row(t("detail.event"), d.event)}
            {row(t("detail.createdBy"), d.createdByName || d.createdByUserId)}
          </div>
          {d.explanation ? (
            <div className="dkv__sect">
              <b>{t("detail.explanation")}</b>
              <p style={{ margin: 0, fontSize: ".86rem" }}>{d.explanation}</p>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export default function AdminLegalAid() {
  const t = useTranslations("admin.legalAid");
  const res = useResource(listLegalAid, []);
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{res.data.length}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("lead")}</p>

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconScale />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="laist">
          {res.data.map((r, i) => {
            const name = s(r.payload.name) || t("anon");
            const phone = s(r.payload.phone);
            const details = s(r.payload.details) || r.title;
            return (
              <div className="laitem" key={r.id || i}>
                <div className="laitem__h">
                  <b>{name}</b>
                  <span className={`aitem__st aitem__st--${(r.status || "new").toLowerCase()}`}>
                    {r.status ? (t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status) : t("new")}
                  </span>
                  <button type="button" className="aitem__act" aria-label={t("detailTitle")} title={t("detailTitle")} onClick={() => setDetail(r.id)}>
                    <IconEye />
                  </button>
                </div>
                {phone ? (
                  <a className="laitem__phone" href={`tel:${phone}`}>
                    <IconPhone />
                    {phone}
                  </a>
                ) : null}
                {details ? <p className="laitem__details">{details}</p> : null}
                <span className="laitem__date">{fmtDate(r.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
      <LegalAidDetailModal id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
