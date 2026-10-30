"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconArrowRight, IconShieldCheck } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { getMyPractice, type VerificationStatus } from "@/lib/services/advocatePractice";

// The advocate's first job after signing up: the certificate, which the
// system reads for the tenure (sign-up cannot take the file). Shown until a
// certificate is submitted, and again when one was turned back; silent when
// the practice cannot be read (another role, offline).
const ASK: readonly VerificationStatus[] = ["not_submitted", "rejected", "changes_requested"];
export default function LicenseNudge(): ReactElement | null {
  const t = useTranslations("portal.practice.nudge");
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    getMyPractice(ctl.signal).then(
      (p) => setStatus(p.verification),
      (e) => {
        if (!isAborted(e)) logApiError("practice.nudge", e);
      },
    );
    return () => ctl.abort();
  }, []);
  if (!status || !ASK.includes(status)) return null;
  const again = status !== "not_submitted";
  return (
    <div className="ppanel lnudge" role="note" data-ai-target="seller-dashboard:license">
      <span className="lnudge__ic" aria-hidden="true">
        <IconShieldCheck />
      </span>
      <div className="lnudge__m">
        <b>{again ? t("againTitle") : t("title")}</b>
        <span>{again ? t("againText") : t("text")}</span>
      </div>
      <Link href="/portal/advocate/profile?tab=professional" className="btn btn--pri btn--sm">
        {again ? t("againCta") : t("cta")}
        <IconArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}
