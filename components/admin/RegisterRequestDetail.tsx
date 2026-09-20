"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getRegisterRequestDetail, getProofDocumentBlob, type RegisterRequestDetail as Detail, type ProofDocument } from "@/lib/services/backend";
import Modal from "@/components/admin/Modal";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import { IconEye, IconClose, IconFileText } from "@/components/icons";

const fmt = (v?: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
};

// Inline preview of an uploaded proof document — fetched as a blob (the file
// needs the admin's bearer token) and shown in this same modal, never a new
// browser tab. Fetched lazily, only once the admin expands this row.
function ProofDocPreview({ doc }: { doc: ProofDocument }) {
  const t = useTranslations("admin.registerRequests");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [mime, setMime] = useState("");
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (url || loading) return;
    setLoading(true);
    setErr(false);
    getProofDocumentBlob(doc.id)
      .then((blob) => {
        setUrl(URL.createObjectURL(blob));
        setMime(blob.type);
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <div className="dkv__doc">
      <button type="button" className="dkv__doc-h" onClick={toggle}>
        <IconFileText />
        <span>{doc.kind ? (t.has(`docKind.${doc.kind}`) ? t(`docKind.${doc.kind}`) : doc.kind) : t("detail.document")}</span>
        {open ? <IconClose /> : <IconEye />}
      </button>
      {open ? (
        loading ? (
          <Skeleton rows={1} />
        ) : err ? (
          <Notice ok={false} msg={t("detail.fileError")} />
        ) : url ? (
          mime.startsWith("image/") ? (
            <img src={url} alt="" className="dkv__doc-img" />
          ) : (
            <iframe src={url} title={doc.kind || "proof"} className="dkv__doc-frame" />
          )
        ) : null
      ) : null}
    </div>
  );
}

// GET /admin/register-requests/{id}: what the applicant typed at sign-up
// (name parts, region, phone, OTP attempts / block), the linked user and
// lawyer profile once approved, and the last activity entries.
export default function RegisterRequestDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations("admin.registerRequests");
  const locale = useLocale();
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
          {d.verificationItems.length ? (
            <div className="dkv__sect">
              <b>{t("detail.verificationItems")}</b>
              <ul className="dkv__list">
                {d.verificationItems.map((v) => (
                  <li key={v.key}><b>{v.label}</b><span>{[statusLabel(v.status), v.note].filter(Boolean).join(" · ")}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.proofDocuments.length ? (
            <div className="dkv__sect">
              <b>{t("detail.documents")}</b>
              {d.proofDocuments.map((doc) => (
                <ProofDocPreview key={doc.id} doc={doc} />
              ))}
            </div>
          ) : null}
          <div className="dkv__sect">
            <b>{t("detail.activity")}</b>
            {d.activity.length ? (
              <ul className="dkv__list">
                {d.activity.slice(0, 12).map((a) => (
                  <li key={a.id}><b>{(locale === "uz" && a.titleUz) || a.action}</b><span>{[(locale === "uz" && a.descriptionUz) || a.detail, fmt(a.createdAt)].filter(Boolean).join(" · ")}</span></li>
                ))}
              </ul>
            ) : <p className="advmuted">{t("detail.noActivity")}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
