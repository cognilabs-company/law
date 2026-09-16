"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSellerOnboardingProgress, submitOnboarding, uploadOnboardingDocument, type OnboardingProgress as Progress } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { Notice } from "@/components/admin/AdminBits";
import { useResourceOne } from "@/lib/useResource";
import type { Role } from "@/lib/auth";
import IdentityVerify from "./IdentityVerify";
import { IconCheck, IconArrowRight } from "@/components/icons";

// Where each onboarding step is completed. Lawyers have no profile page yet,
// so their profile/documents steps have no link.
function hrefFor(key: string, role: Role): string | null {
  const advocate = role === "advocate";
  if (key === "services" || key === "pricing") return advocate ? "/portal/advocate/profile" : "/portal/lawyer/services";
  if (key === "profile" || key === "documents") return advocate ? "/portal/advocate/profile" : null;
  return null;
}

// T1A-02 seller onboarding checklist (GET /seller-onboarding/progress):
// profile, identity, documents, services, pricing. Hidden once everything is
// done and the cabinet is fully open.
export default function OnboardingProgress({ role, limited }: { role: Role; limited: boolean }) {
  const t = useTranslations("portal.onboarding");
  const [reloadKey, setReloadKey] = useState(0);
  const res = useResourceOne<Progress>(getSellerOnboardingProgress, [reloadKey]);
  const [idOpen, setIdOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "upload" | "submit">("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // PDF/JPG/PNG up to 15 MB (license, diploma, other proof).
  async function upload(file: File | null) {
    if (!file || busy) return;
    setNote(null);
    if (file.size > 15 * 1024 * 1024) { setNote({ ok: false, msg: t("docTooBig") }); return; }
    setBusy("upload");
    try {
      await uploadOnboardingDocument(file, role === "advocate" ? "license" : "diploma");
      setNote({ ok: true, msg: t("docUploaded") });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setNote({ ok: false, msg: e instanceof ApiError && (e.status === 413 || e.status === 415) ? t("docType") : t("docError") });
    } finally {
      setBusy("");
    }
  }
  async function submit() {
    if (busy) return;
    setBusy("submit");
    setNote(null);
    try {
      await submitOnboarding();
      setNote({ ok: true, msg: t("submitted") });
    } catch (e) {
      setNote({ ok: false, msg: e instanceof ApiError && e.status === 422 ? t("submitIncomplete") : t("submitError") });
    } finally {
      setBusy("");
    }
  }
  const p = res.data;
  if (!p || !p.steps.length) return null;

  const done = p.totalCount > 0 && p.completedCount >= p.totalCount;
  if (done && !limited) return null;
  const pct = p.totalCount ? Math.round((p.completedCount / p.totalCount) * 100) : 0;

  return (
    <div className="ppanel onbp">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className={`creq__badge${done ? " creq__badge--ok" : ""}`}>{t("count", { done: p.completedCount, total: p.totalCount })}</span>
      </div>
      <p className="ppanel__note">{done ? t("doneLead") : t("lead")}</p>
      <div className="onbp__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol className="onbp__steps">
        {p.steps.map((s, i) => {
          const href = s.completed ? null : hrefFor(s.key, role);
          return (
            <li key={s.key || i} className={`onbp__s${s.completed ? " on" : ""}`}>
              <span className="onbp__n">{s.completed ? <IconCheck /> : i + 1}</span>
              <span className="onbp__t">
                <b>{t.has(`steps.${s.key}`) ? t(`steps.${s.key}`) : s.title || s.key}</b>
                <small>{s.completed ? t("stepDone") : s.required ? t("stepRequired") : t("stepOptional")}</small>
              </span>
              {s.completed ? null : s.key === "documents" ? (
                <label className="btn btn--line btn--sm">
                  {busy === "upload" ? t("docUploading") : t("docUpload")}
                  <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={!!busy} onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                </label>
              ) : s.key === "identity" ? (
                <button type="button" className="btn btn--line btn--sm" aria-expanded={idOpen} onClick={() => setIdOpen((v) => !v)}>
                  {t("verify")}
                </button>
              ) : href ? (
                <Link href={href} className="btn btn--line btn--sm">
                  {t("fill")}
                  <IconArrowRight />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {done ? (
        <button type="button" className="btn btn--pri btn--sm" style={{ marginTop: 12 }} disabled={!!busy} onClick={submit}>
          {busy === "submit" ? t("submitting") : t("submit")}
        </button>
      ) : null}
      {idOpen ? <IdentityVerify /> : null}
    </div>
  );
}
