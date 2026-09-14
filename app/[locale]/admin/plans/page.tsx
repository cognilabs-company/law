"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSubscriptionPlans } from "@/lib/services/backend";
import { createSubscriptionPlan } from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { IconStar, IconPlus } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "—");
const toList = (v: string | boolean) =>
  String(v || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
const num = (v: string | boolean) => parseInt(String(v || "0"), 10) || 0;

export default function AdminPlans() {
  const t = useTranslations("admin");
  const [key, reload] = useReload();
  const plans = useResource(getSubscriptionPlans, [key]);
  const [open, setOpen] = useState(false);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("plans.listTitle")}</b>
        <span className="ahdr">
          <span className="advmuted">{plans.data.length}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}>
            <IconPlus />
            {t("form.add")}
          </button>
        </span>
      </div>
      {plans.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !plans.data.length ? (
        <EmptyState icon={<IconStar />} title={t("plans.empty")} />
      ) : (
        <div className="alist">
          {plans.data.map((p, i) => (
            <AdminItem
              key={p.id}
              index={i + 1}
              title={p.name}
              meta={p.slug}
              right={som(p.price)}
              tags={[
                ...(p.isGiftable ? [{ label: t("plans.giftable") }] : []),
                { label: p.isActive ? t("form.active") : t("form.inactive"), tone: (p.isActive ? "ok" : "muted") as "ok" | "muted" },
              ]}
            />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("plans.create")}>
        <AdminForm
          fields={[
            { name: "title", label: t("form.title"), required: true },
            { name: "slug", label: t("form.slug"), required: true, placeholder: "premium" },
            { name: "description", label: t("form.description"), type: "textarea" },
            { name: "monthly_price", label: t("form.monthlyPrice"), type: "number", placeholder: "149000" },
            { name: "benefits", label: t("plans.benefits"), type: "textarea", placeholder: t("plans.benefitsPh") },
            { name: "is_giftable", label: t("plans.giftable"), type: "checkbox" },
            { name: "is_active", label: t("form.active"), type: "checkbox" },
          ]}
          onSubmit={async (v) =>
            void (await createSubscriptionPlan({
              slug: String(v.slug),
              title: String(v.title),
              description: String(v.description),
              monthly_price: num(v.monthly_price),
              benefits: toList(v.benefits),
              is_giftable: v.is_giftable as boolean,
              is_active: v.is_active as boolean,
            }))
          }
          submitLabel={t("form.save")}
          busyLabel={t("form.saving")}
          okMsg={t("form.created")}
          errMsg={t("form.error")}
          onDone={() => {
            reload();
            setOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
