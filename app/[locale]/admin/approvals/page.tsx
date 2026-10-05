"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listApprovals, adminApprove, managerApprove } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { useReload } from "@/components/admin/AdminBits";
import { IconShieldCheck, IconCheck } from "@/components/icons";

export default function AdminApprovals() {
  const t = useTranslations("admin");
  const [key, reload] = useReload();
  const res = useResource(listApprovals, [key]);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    if (busy) return;
    setBusy(id);
    try {
      await fn(id);
      reload();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ppanel" data-ai-target="approvals:queue">
      <div className="ppanel__h">
        <b>{t("approvals.title")}</b>
        <span className="advmuted">{res.data.length}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("approvals.lead")}</p>
      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("approvals.empty")} text={t("approvals.emptyText")} />
      ) : (
        <div className="alist">
          {res.data.map((a, i) => (
            <div className="aitem" key={a.id}>
              <span className="aitem__n">{i + 1}</span>
              <div className="aitem__m">
                <b>{a.type ? (t.has(`approvals.type.${a.type}`) ? t(`approvals.type.${a.type}`) : a.type) : t("approvals.item")}</b>
                <div className="aitem__tags">
                  {/* LEXGO_PUBLIC_WORK_IDS_FRONTEND.md: APR-JFQDL. */}
                  {a.workId ? <em className="wid">{a.workId}</em> : null}
                  <em className={`atag${a.adminApproved ? " atag--ok" : " atag--muted"}`}>
                    {t("approvals.admin")}{a.adminApproved ? " ✓" : ""}
                  </em>
                  <em className={`atag${a.managerApproved ? " atag--ok" : " atag--muted"}`}>
                    {t("approvals.manager")}{a.managerApproved ? " ✓" : ""}
                  </em>
                  <em className="atag">{a.status ? (t.has(`approvals.status.${a.status}`) ? t(`approvals.status.${a.status}`) : a.status) : ""}</em>
                </div>
              </div>
              <div className="aitem__r" style={{ display: "flex", gap: 8 }} data-ai-target="approvals:actions">
                <button
                  className="btn btn--soft btn--sm"
                  type="button"
                  disabled={a.adminApproved || busy === a.id}
                  onClick={() => act(a.id, adminApprove)}
                >
                  <IconCheck />
                  {t("approvals.adminApprove")}
                </button>
                <button
                  className="btn btn--line btn--sm"
                  type="button"
                  disabled={a.managerApproved || busy === a.id}
                  onClick={() => act(a.id, managerApprove)}
                >
                  <IconCheck />
                  {t("approvals.managerApprove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
