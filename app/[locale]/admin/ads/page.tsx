"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listAds } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { AdminItem } from "@/components/admin/AdminBits";
import { IconInfo, IconRocket } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "—");

export default function AdminAds() {
  const t = useTranslations("admin");
  const ads = useResource(listAds, []);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("ads.title")}</b>
        <span className="ahdr">
          <span className="advmuted">{ads.data.length}</span>
        </span>
      </div>
      <div
        className="ads-ro"
        role="note"
        aria-labelledby="ads-ro-title"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 12,
          padding: "12px 14px",
          marginBottom: 12,
          border: "1px solid var(--dk-bd-blue, var(--b200))",
          background: "var(--dk-tint-blue, var(--b50))",
          borderRadius: 12,
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex", flex: "none", marginTop: 2, color: "var(--dk-acc, var(--b600))" }}>
          <IconInfo />
        </span>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <b id="ads-ro-title">{t("ads.readOnlyTitle")}</b>
          <p className="advmuted" style={{ margin: "4px 0 0" }}>
            {t("ads.readOnlyText")}
          </p>
        </div>
        <Link href="/admin/studio/c/K12-PROMO" className="btn btn--pri btn--sm" data-ai-target="button:new-ad" style={{ alignSelf: "center" }}>
          {t("ads.openStudio")}
        </Link>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>
        {t("ads.lead")}
      </p>

      <div data-ai-target="ads:list">
        {ads.status === "loading" ? (
          <Skeleton rows={3} />
        ) : ads.status === "error" ? (
          <ErrorState error={ads.error} onRetry={ads.refresh} />
        ) : !ads.data.length ? (
          <EmptyState icon={<IconRocket />} title={t("ads.empty")} text={t("ads.emptyReadOnly")} />
        ) : (
          <div className="alist">
            {ads.data.map((a, i) => (
              <AdminItem
                key={a.id}
                index={i + 1}
                title={a.title}
                meta={a.recordType ? (t.has(`ads.recordType.${a.recordType}`) ? t(`ads.recordType.${a.recordType}`) : a.recordType) : undefined}
                right={som(a.price)}
                tags={a.status ? [{ label: t.has(`ads.status.${a.status}`) ? t(`ads.status.${a.status}`) : a.status }] : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
