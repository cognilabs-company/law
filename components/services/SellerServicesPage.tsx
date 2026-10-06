"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import type { ServiceScope } from "@/lib/services/sellerServices";
import { IconClock } from "@/components/icons";
import ServiceManager from "./ServiceManager";
import LegacyServicePicker from "./LegacyServicePicker";

const ME: ServiceScope = { kind: "me" };

function PendingLock({ role }: { role: "lawyer" | "advocate" }) {
  const t = useTranslations("sellerServices.pending");
  return (
    <div className="svm">
      <div className="svm__blocked is-wait" role="note">
        <span className="svm__bic" aria-hidden="true">
          <IconClock />
        </span>
        <b>{t("title")}</b>
        <p>{t("text")}</p>
        <Link href={`/portal/${role}/profile`} className="btn btn--line btn--sm">
          {t("action")}
        </Link>
      </div>
    </div>
  );
}

export default function SellerServicesPage({ role }: { role: "lawyer" | "advocate" }) {
  const { session } = useAuth();
  const fallback = role === "lawyer" ? <LegacyServicePicker /> : <PendingLock role={role} />;
  if (session?.accountStatus === "pending") return fallback;
  return <ServiceManager scope={ME} role={role} renderBlocked={(e) => (e.kind === "pendingAccount" ? fallback : null)} />;
}
