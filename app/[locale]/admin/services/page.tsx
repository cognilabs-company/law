"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getServiceCategories, getServices } from "@/lib/services/backend";
import { createServiceCategory, createService } from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { IconBriefcase, IconPlus } from "@/components/icons";

function num(v: string | boolean): number {
  const n = parseInt(String(v || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
const som = (n?: number) => (n ? fmtUzs(n) : "—");

export default function AdminServices() {
  const t = useTranslations("admin");
  const [catKey, reloadCats] = useReload();
  const [svcKey, reloadSvcs] = useReload();
  const cats = useResource(getServiceCategories, [catKey]);
  const svcs = useResource(getServices, [svcKey]);
  const [catOpen, setCatOpen] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);

  return (
    <div className="agrid">
      {/* Categories */}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("services.catTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{cats.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCatOpen(true)}>
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>
        {cats.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !cats.data.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.catEmpty")} />
        ) : (
          <div className="alist">
            {cats.data.map((c, i) => (
              <AdminItem key={c.id} index={i + 1} title={c.name} meta={c.slug} />
            ))}
          </div>
        )}
      </div>

      {/* Services */}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("services.svcTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{svcs.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setSvcOpen(true)}>
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>
        {svcs.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !svcs.data.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.svcEmpty")} />
        ) : (
          <div className="alist">
            {svcs.data.map((s, i) => (
              <AdminItem
                key={s.id}
                index={i + 1}
                title={s.name}
                meta={[s.categoryTitle, s.slug].filter(Boolean).join(" · ")}
                right={som(s.price)}
                tags={[{ label: s.isActive ? t("form.active") : t("form.inactive"), tone: s.isActive ? "ok" : "muted" }]}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={catOpen} onClose={() => setCatOpen(false)} title={t("services.catCreate")}>
        <AdminForm
          fields={[
            { name: "title", label: t("form.title"), required: true },
            { name: "slug", label: t("form.slug"), required: true, placeholder: "criminal" },
            { name: "description", label: t("form.description"), type: "textarea" },
          ]}
          onSubmit={async (v) =>
            void (await createServiceCategory({ slug: String(v.slug), title: String(v.title), description: String(v.description) }))
          }
          submitLabel={t("form.save")}
          busyLabel={t("form.saving")}
          okMsg={t("form.created")}
          errMsg={t("form.error")}
          onDone={() => {
            reloadCats();
            setCatOpen(false);
          }}
        />
      </Modal>

      <Modal open={svcOpen} onClose={() => setSvcOpen(false)} title={t("services.svcCreate")}>
        <AdminForm
          fields={[
            {
              name: "category_id",
              label: t("form.category"),
              type: "select",
              required: true,
              placeholder: t("form.selectCategory"),
              options: cats.data.map((c) => ({ value: c.id, label: c.name })),
            },
            { name: "title", label: t("form.title"), required: true },
            { name: "slug", label: t("form.slug"), required: true },
            { name: "description", label: t("form.description"), type: "textarea" },
            { name: "base_price", label: t("form.basePrice"), type: "number", placeholder: "150000" },
            { name: "delivery_minutes", label: t("form.deliveryMinutes"), type: "number", placeholder: "60" },
            { name: "is_active", label: t("form.active"), type: "checkbox" },
          ]}
          onSubmit={async (v) =>
            void (await createService({
              category_id: String(v.category_id),
              slug: String(v.slug),
              title: String(v.title),
              description: String(v.description),
              base_price: num(v.base_price),
              currency: "UZS",
              delivery_minutes: num(v.delivery_minutes),
              is_active: v.is_active as boolean,
            }))
          }
          submitLabel={t("form.save")}
          busyLabel={t("form.saving")}
          okMsg={t("form.created")}
          errMsg={t("form.error")}
          onDone={() => {
            reloadSvcs();
            setSvcOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
