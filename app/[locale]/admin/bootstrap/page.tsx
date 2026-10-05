"use client";

import { useTranslations } from "next-intl";
import { bootstrapSuperadmin } from "@/lib/services/admin";
import { AdminForm } from "@/components/admin/AdminBits";
import { IconBolt } from "@/components/icons";

export default function AdminBootstrap() {
  const t = useTranslations("admin");

  return (
    <div className="ppanel" style={{ maxWidth: 560 }} data-ai-target="bootstrap:form">
      <div className="ppanel__h">
        <b>
          <IconBolt style={{ width: 18, height: 18, verticalAlign: "-3px", marginRight: 6 }} />
          {t("bootstrap.title")}
        </b>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("bootstrap.lead")}</p>
      <AdminForm
        fields={[
          { name: "phone", label: t("bootstrap.phone"), required: true, placeholder: "+998901234567" },
          { name: "bootstrap_key", label: t("bootstrap.key"), required: true, placeholder: t("bootstrap.keyPh") },
        ]}
        onSubmit={async (v) =>
          void (await bootstrapSuperadmin(String(v.phone), String(v.bootstrap_key)))
        }
        submitLabel={t("bootstrap.submit")}
        busyLabel={t("form.saving")}
        okMsg={t("bootstrap.done")}
        errMsg={t("form.error")}
      />
      <p className="advmuted" style={{ marginTop: 14 }}>{t("bootstrap.note")}</p>
    </div>
  );
}
