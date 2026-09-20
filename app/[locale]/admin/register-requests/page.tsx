"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  getSellerRequests,
  acceptRegisterRequest,
  rejectRegisterRequest,
  type RegisterRequest,
} from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminItem, useReload } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import { IconUser, IconCheck, IconClose, IconEye } from "@/components/icons";
import RegisterRequestDetail from "@/components/admin/RegisterRequestDetail";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtDate = (v: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("ru-RU");
};

type RoleTab = "all" | "advokat" | "yurist" | "advokat_tashkiloti";
const ROLE_TABS: RoleTab[] = ["all", "advokat", "yurist", "advokat_tashkiloti"];

function Actions({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTranslations("admin.registerRequests");
  const [busy, setBusy] = useState<null | "accept" | "reject">(null);
  const [done, setDone] = useState<null | "accept" | "reject">(null);
  async function run(kind: "accept" | "reject") {
    if (busy || done) return;
    setBusy(kind);
    try {
      if (kind === "accept") await acceptRegisterRequest(id);
      else await rejectRegisterRequest(id);
      setDone(kind);
      onDone();
    } catch {
      setBusy(null);
    }
  }
  if (done) {
    return (
      <span className={`pcase__done pcase__done--${done === "accept" ? "accept" : "decline"}`}>
        {done === "accept" ? <IconCheck /> : <IconClose />}
        {done === "accept" ? t("accepted") : t("rejected")}
      </span>
    );
  }
  return (
    <div className="pcase__act">
      <button className="btn btn--pri btn--sm" type="button" disabled={!!busy} onClick={() => run("accept")}>
        <IconCheck />
        {busy === "accept" ? t("accepting") : t("accept")}
      </button>
      <button className="btn btn--line btn--sm" type="button" disabled={!!busy} onClick={() => run("reject")}>
        {busy === "reject" ? t("rejecting") : t("reject")}
      </button>
    </div>
  );
}

export default function AdminRegisterRequests() {
  const t = useTranslations("admin.registerRequests");
  const [key, reload] = useReload();
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const res = useResourceOne(
    () => getSellerRequests({ status: "pending", role: roleTab === "all" ? undefined : roleTab, from: from || undefined, to: to || undefined }),
    [key, roleTab, from, to],
  );
  const [detail, setDetail] = useState<string | null>(null);
  const stats = res.data?.stats;
  const items: RegisterRequest[] = res.data?.items ?? [];

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{items.length}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("lead")}</p>

      {stats ? (
        <div className="amet" style={{ marginBottom: 16 }}>
          <div className="amet__c"><b>{stats.total}</b><span className="amet__l">{t("stats.total")}</span></div>
          <div className="amet__c"><b>{stats.advokat}</b><span className="amet__l">{t("role.advokat")}</span></div>
          <div className="amet__c"><b>{stats.yurist}</b><span className="amet__l">{t("role.yurist")}</span></div>
          <div className="amet__c"><b>{stats.advokatTashkiloti}</b><span className="amet__l">{t("role.organization")}</span></div>
          <div className="amet__c"><b>{stats.pending}</b><span className="amet__l">{t("stats.pending")}</span></div>
          <div className="amet__c"><b>{stats.approved}</b><span className="amet__l">{t("stats.approved")}</span></div>
          <div className="amet__c"><b>{stats.rejected}</b><span className="amet__l">{t("stats.rejected")}</span></div>
        </div>
      ) : null}

      <div className="segs segs--sm" role="tablist" aria-label={t("stats.roleTabs")} style={{ marginBottom: 12 }}>
        {ROLE_TABS.map((r) => (
          <button key={r} type="button" role="tab" className="seg" aria-selected={roleTab === r} onClick={() => setRoleTab(r)}>
            {r === "all" ? t("stats.allRoles") : t(`role.${r}`)}
          </button>
        ))}
      </div>
      <div className="lfilters" style={{ marginBottom: 16 }}>
        <DatePicker value={from} onChange={setFrom} placeholder={t("stats.from")} ariaLabel={t("stats.from")} max={to || undefined} clearLabel={t("stats.clearDates")} />
        <DatePicker value={to} onChange={setTo} placeholder={t("stats.to")} ariaLabel={t("stats.to")} min={from || undefined} clearLabel={t("stats.clearDates")} />
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState icon={<IconUser />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist">
          {items.map((r: RegisterRequest, i) => (
            <AdminItem
              key={r.id || i}
              index={i + 1}
              title={r.name || "—"}
              meta={[
                r.role ? (t.has(`role.${r.role}`) ? t(`role.${r.role}`) : cap(r.role.replace(/_/g, " "))) : "",
                r.phone,
                fmtDate(r.createdAt),
              ].filter(Boolean).join(" · ")}
              tags={[{ label: r.status ? (t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status) : t("status.pending"), tone: "muted" }]}
              right={<Actions id={r.id} onDone={reload} />}
              actions={<button type="button" className="aitem__act" aria-label={t("detailTitle")} title={t("detailTitle")} onClick={() => setDetail(r.id)}><IconEye /></button>}
            />
          ))}
        </div>
      )}
      <RegisterRequestDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
