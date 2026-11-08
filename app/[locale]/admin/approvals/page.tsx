"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listApprovals, adminApprove, managerApprove } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { useReload } from "@/components/admin/AdminBits";
import { IconShieldCheck, IconCheck } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { isForbidden } from "@/lib/http";
import { notify } from "@/lib/toast";

type Stamp = "admin" | "manager";

export default function AdminApprovals() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [key, reload] = useReload();
  const res = useResource(listApprovals, [key]);
  const [busy, setBusy] = useState<string | null>(null);
  // Which stamp the backend refused this session (403): that button leaves
  // every row. Nothing tells ahead of time which of the two stamps this
  // account may give (backend gap, see the permissions questions file).
  const [denied, setDenied] = useState<Partial<Record<Stamp, boolean>>>({});

  async function act(id: string, stamp: Stamp) {
    if (busy) return;
    setBusy(id);
    try {
      await (stamp === "admin" ? adminApprove : managerApprove)(id);
      reload();
    } catch (e) {
      if (isForbidden(e)) {
        notify.error(tc("forbidden"), { id: `approval-${stamp}` });
        setDenied((d) => ({ ...d, [stamp]: true }));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ppanel" data-ai-target="approvals:queue" data-ai-id="admin.approvals.queue" data-ai-type="list" data-ai-label={t("approvals.title")}>
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
            <div
              className="aitem"
              key={a.id}
              data-ai-id={a.id ? aiId("admin.approvals.item", a.id) : undefined}
              data-ai-type="list_item"
              data-ai-entity-type="approval"
              data-ai-entity-id={a.id || undefined}
            >
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
              {/* Only an open request (pending / partial) takes stamps. A stamp
                  already given shows as ✓ in the tags; only the missing ones
                  are offered, and only those the backend hasn't refused. */}
              {(!a.status || a.status === "pending" || a.status === "partial") && ((!a.adminApproved && !denied.admin) || (!a.managerApproved && !denied.manager)) ? (
                <div className="aitem__r" style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-ai-target="approvals:actions">
                  {!a.adminApproved && !denied.admin ? (
                    <button
                      className="btn btn--soft btn--sm"
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => act(a.id, "admin")}
                      data-ai-id={a.id ? aiId("admin.approvals.item", a.id, "admin-approve") : undefined}
                    >
                      <IconCheck />
                      {t("approvals.adminApprove")}
                    </button>
                  ) : null}
                  {!a.managerApproved && !denied.manager ? (
                    <button
                      className="btn btn--line btn--sm"
                      type="button"
                      disabled={busy === a.id}
                      onClick={() => act(a.id, "manager")}
                      data-ai-id={a.id ? aiId("admin.approvals.item", a.id, "manager-approve") : undefined}
                    >
                      <IconCheck />
                      {t("approvals.managerApprove")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
