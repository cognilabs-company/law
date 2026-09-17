"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getRegisterRequestDetail, type RegisterRequestDetail as Detail } from "@/lib/services/backend";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";

const fmt = (v?: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
};

// GET /admin/register-requests/{id}: what the applicant typed at sign-up
// (name parts, region, phone, OTP attempts / block), the linked user and
// lawyer profile once approved, and the last activity entries.
export default function RegisterRequestDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.registerRequests");
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const h = setTimeout(() => { setD(null); setErr(false); }, 0);
    getRegisterRequestDetail(id).then((x) => { if (alive) { setD(x); setNow(Date.now()); } }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; clearTimeout(h); };
  }, [id]);
  const roleLabel = (r: string) => (r ? (t.has(`role.${r}`) ? t(`role.${r}`) : r) : "—");
  const statusLabel = (s: string) => (s ? (t.has(`status.${s}`) ? t(`status.${s}`) : s) : "—");
  const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? null : (
    <div className="dkv__row" key={k}><span>{k}</span><b>{String(v)}</b></div>
  ));
  const p = d?.pending;
  const blocked = !!p?.blockedUntil && new Date(p.blockedUntil).getTime() > now;

  return (
    <Modal open={!!id} onClose={onClose} title={d?.request.name || d?.pending?.name || t("detailTitle")}>
      {err ? <Notice ok={false} msg={t("detailError")} /> : !d ? <Skeleton rows={3} /> : (
        <div className="dkv">
          <div className="dkv__sect">
            <b>{t("detail.request")}</b>
            {row(t("detail.status"), statusLabel(d.request.status))}
            {row(t("detail.role"), roleLabel(d.request.role))}
            {row(t("detail.phone"), d.request.phone)}
            {row(t("detail.created"), fmt(d.request.createdAt))}
          </div>
          {p ? (
            <div className="dkv__sect">
              <b>{t("detail.pending")}</b>
              {row(t("detail.fio"), [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ") || p.name)}
              {row(t("detail.region"), p.region)}
              {row(t("detail.phone"), p.phone)}
              {row(t("detail.status"), statusLabel(p.status))}
              {row(t("detail.attempts"), p.attempts)}
              {blocked ? <div className="dkv__row"><span>{t("detail.blocked")}</span><b className="tprio tprio--high">{fmt(p.blockedUntil)}</b></div> : null}
              {row(t("detail.expires"), fmt(p.expiresAt))}
            </div>
          ) : null}
          {d.user ? (
            <div className="dkv__sect">
              <b>{t("detail.user")}</b>
              {row("LexGo ID", d.user.lexgoId)}
              {row(t("detail.fio"), d.user.name)}
              {row(t("detail.role"), roleLabel(d.user.role))}
              {row(t("detail.account"), d.user.accountStatus)}
              {row(t("detail.created"), fmt(d.user.createdAt))}
            </div>
          ) : null}
          {d.lawyerProfile ? (
            <div className="dkv__sect">
              <b>{t("detail.profile")}</b>
              {row(t("detail.region"), d.lawyerProfile.region)}
              {row(t("detail.specializations"), d.lawyerProfile.specializations.join(", "))}
              {row(t("detail.experience"), d.lawyerProfile.experienceYears)}
              {row(t("detail.verified"), d.lawyerProfile.verified ? "✓" : "—")}
            </div>
          ) : null}
          <div className="dkv__sect">
            <b>{t("detail.activity")}</b>
            {d.activity.length ? (
              <ul className="dkv__list">
                {d.activity.slice(0, 12).map((a) => (
                  <li key={a.id}><b>{a.titleUz || a.action}</b><span>{[a.descriptionUz || a.detail, fmt(a.createdAt)].filter(Boolean).join(" · ")}</span></li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("detail.noActivity")}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
