"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listB2bClients, createB2bClient } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { useReload, AdminForm } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconBuilding, IconPlus } from "@/components/icons";

const som = (n: number) => fmtUzs(n);

export default function AdminB2b() {
  const t = useTranslations("admin.b2b");
  const [key, reload] = useReload();
  const res = useResource(() => listB2bClients(), [key]);
  const [open, setOpen] = useState(false);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="ahdr">
          <span className="advmuted">{res.data.length}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}><IconPlus />{t("add")}</button>
        </span>
      </div>
      <p className="ppanel__note">{t("lead")}</p>
      <Modal open={open} onClose={() => setOpen(false)} title={t("add")}>
        <AdminForm
          fields={[
            { name: "name", label: t("cName"), required: true },
            { name: "industry", label: t("cIndustry") },
            { name: "contact", label: t("cContact"), placeholder: "+998 __ ___ __ __" },
          ]}
          onSubmit={async (v) => void (await createB2bClient({ name: String(v.name), industry: String(v.industry), contact: String(v.contact) }))}
          submitLabel={t("save")}
          busyLabel={t("saving")}
          okMsg={t("created")}
          errMsg={t("error")}
          onDone={() => { reload(); setOpen(false); }}
        />
      </Modal>
      {res.status === "loading" ? (
        <Skeleton rows={4} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconBuilding />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {res.data.map((c) => (
            <div className="aitem" key={c.id}>
              <span className="aitem__n"><IconBuilding /></span>
              <div className="aitem__m">
                <b>{c.name || "—"}</b>
                <span className="aitem__meta">{[c.industry, c.contact].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="aitem__r" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {c.value ? <b className="b2b__val">{som(c.value)}</b> : null}
                <span className="creq__badge">{t.has(`stage.${c.stage}`) ? t(`stage.${c.stage}`) : c.stage}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
