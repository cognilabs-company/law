"use client";

import { useTranslations } from "next-intl";
import { getTestOtps } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminItem } from "@/components/admin/AdminBits";
import { IconShieldCheck } from "@/components/icons";

// Staging-only viewer for OTP codes (no longer returned in auth responses).
// In production the endpoint 404s → say it is staging-only rather than "empty".
export default function AdminTestOtps() {
  const t = useTranslations("admin.testOtps");
  const res = useResource(getTestOtps, []);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{res.data.length}</span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : res.status === "error" ? (
        <EmptyState icon={<IconShieldCheck />} title={t("stagingOnly")} text={t("stagingOnlyText")} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("empty")} text={t("lead")} />
      ) : (
        <div className="alist">
          {res.data.map((o, i) => (
            <AdminItem
              key={o.id}
              index={i + 1}
              title={o.phone}
              meta={o.purpose}
              right={<span style={{ fontFamily: "var(--fd)", fontWeight: 800, letterSpacing: "3px", fontSize: "1.05rem" }}>{o.code}</span>}
            />
          ))}
        </div>
      )}
    </div>
  );
}
