"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSellerOnboardingProgress, submitOnboarding, uploadOnboardingDocument, type OnboardingProgress as Progress } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { useResourceOne } from "@/lib/useResource";
import type { Role } from "@/lib/auth";
import IdentityVerify from "./IdentityVerify";
import { IconCheck, IconArrowRight } from "@/components/icons";

// Where each onboarding step is completed.
function hrefFor(key: string, role: Role): string | null {
  const advocate = role === "advocate";
  const profile = `/portal/${role}/profile`;
  if (key === "services") return advocate ? `${profile}?tab=professional` : "/portal/lawyer/services";
  if (key === "pricing") return advocate ? `${profile}?tab=work` : "/portal/lawyer/services";
  if (key === "profile") return profile;
  if (key === "documents") return advocate ? `${profile}?tab=professional` : null;
  return null;
}

// T1A-02 seller onboarding checklist (GET /seller-onboarding/progress):
// profile, identity, documents, services, pricing. Hidden once everything is
// done and the cabinet is fully open.
export default function OnboardingProgress({ role, limited }: { role: Role; limited: boolean }) {
  const t = useTranslations("portal.onboarding");
  const tn = useTranslations("common.notify");
  const [reloadKey, setReloadKey] = useState(0);
  const res = useResourceOne<Progress>(getSellerOnboardingProgress, [reloadKey]);
  const [idOpen, setIdOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "upload" | "submit">("");
  const uploadRef = useRef<(file: File | null) => Promise<void>>(async () => {});

  // PDF/JPG/PNG up to 15 MB (license, diploma, other proof).
  async function upload(file: File | null) {
    if (!file || busy) return;
    if (file.size > 15 * 1024 * 1024) { notify.error(t("docTooBig"), { id: "onb-doc", body: t("docType") }); return; }
    setBusy("upload");
    try {
      await uploadOnboardingDocument(file, role === "advocate" ? "license" : "diploma");
      notify.success(t("docUploaded"), { id: "onb-doc" });
      setReloadKey((k) => k + 1);
    } catch (e) {
      const badFile = e instanceof ApiError && (e.status === 413 || e.status === 415);
      notify.error(t("docError"), {
        id: "onb-doc",
        error: e,
        map: { 413: t("docType"), 415: t("docType") },
        action: badFile ? undefined : { label: tn("retry"), onClick: () => void uploadRef.current(file) },
      });
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    uploadRef.current = upload;
  });
  async function submit() {
    if (busy) return;
    setBusy("submit");
    try {
      await submitOnboarding();
      notify.success(t("submitted"), { id: "onb-submit" });
    } catch (e) {
      notify.error(t("submitError"), { id: "onb-submit", error: e, map: { 422: t("submitIncomplete") } });
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
    <div className="ppanel onbp" data-ai-target="seller-dashboard:completeness">
      <div className="ppanel__h">
        <b>{t("strength", { pct })}</b>
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
      {done ? (
        <button type="button" className="btn btn--pri btn--sm" style={{ marginTop: 12 }} disabled={!!busy} onClick={submit}>
          {busy === "submit" ? t("submitting") : t("submit")}
        </button>
      ) : null}
      {idOpen ? <IdentityVerify /> : null}
    </div>
  );
}
