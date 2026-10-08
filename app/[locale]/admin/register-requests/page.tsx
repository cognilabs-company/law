"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  getSellerRequests,
  getRegisterRequestDetail,
  registerRequestFourStepsComplete,
  acceptRegisterRequest,
  rejectRegisterRequest,
  type RegisterRequest,
} from "@/lib/services/backend";
import { useResourceOne } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminItem, useReload } from "@/components/admin/AdminBits";
import DatePicker from "@/components/DatePicker";
import FilterBar from "@/components/filters/FilterBar";
import { IconUser, IconCheck, IconClose, IconEye, IconUserPlus, IconCalendar } from "@/components/icons";
import RegisterRequestDetail from "@/components/admin/RegisterRequestDetail";
import { dateOnly, shortDate } from "@/lib/date";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiSelection } from "@/lib/ai/registry";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const fmtDate = (v: string, locale: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : dateOnly(v, locale);
};

type RoleTab = "all" | "advokat" | "yurist" | "advokat_tashkiloti";
const ROLE_TABS: RoleTab[] = ["all", "advokat", "yurist", "advokat_tashkiloti"];

const aiNorm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[ʻʼ'‘’`]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const aiStem = (v: string) => v.replace(/(lari|lar)\b/g, "");

function pickRole(opts: { value: string; label: string }[], raw: string): RoleTab | null {
  const w = aiNorm(raw);
  if (!w) return "all";
  const exact = opts.find((o) => aiNorm(o.value) === w || aiNorm(o.label) === w);
  if (exact) return exact.value as RoleTab;
  const s = aiStem(w);
  const near = opts
    .filter((o) => {
      const l = aiNorm(o.label);
      return l.includes(s) || (s.length >= 4 && s.includes(aiStem(l)));
    })
    .sort((a, b) => b.label.length - a.label.length);
  return near.length ? (near[0].value as RoleTab) : null;
}

function Actions({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTranslations("admin.registerRequests");
  const [busy, setBusy] = useState<null | "accept" | "reject">(null);
  const [done, setDone] = useState<null | "accept" | "reject">(null);
  const [error, setError] = useState(false);
  async function run(kind: "accept" | "reject") {
    if (busy || done) return;
    setBusy(kind);
    setError(false);
    try {
      if (kind === "accept") {
        const detail = await getRegisterRequestDetail(id);
        if (!registerRequestFourStepsComplete(detail)) {
          setError(true);
          setBusy(null);
          return;
        }
        await acceptRegisterRequest(id);
      }
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
    <div className="pcase__act" data-ai-target="register-requests:decision" data-ai-id={id ? aiId("admin.register-requests.item", id, "decision") : undefined} data-ai-label={`${t("accept")} · ${t("reject")}`}>
      {error ? <span className="advmuted" role="alert">{t("detail.fourStepLead")}</span> : null}
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
  const locale = useLocale();
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
  useAiSelection("register_requests_role", roleTab);
  const roleLabel = (role: string) => (role ? (t.has(`role.${role}`) ? t(`role.${role}`) : cap(role.replace(/_/g, " "))) : "");
  const roleOpts = ROLE_TABS.map((r) => ({ value: r, label: r === "all" ? t("stats.allRoles") : t(`role.${r}`) }));
  useAiField("admin.register-requests.role-tabs", {
    get: () => roleTab,
    set: (v) => {
      const next = pickRole(roleOpts, v);
      if (next) setRoleTab(next);
    },
  });
  const day = (iso: string) => (iso ? shortDate(iso, locale) : "…");
  const dateChip = from || to ? (from && from === to ? day(from) : `${day(from)} – ${day(to)}`) : null;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{items.length}</span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("lead")}</p>

      {stats ? (
        <div className="amet" style={{ marginBottom: 16 }} data-ai-target="register-requests:stats" data-ai-id="admin.register-requests.stats" data-ai-type="section" data-ai-label={t("stats.total")}>
          <div className="amet__c"><b>{stats.total}</b><span className="amet__l">{t("stats.total")}</span></div>
          <div className="amet__c"><b>{stats.advokat}</b><span className="amet__l">{t("role.advokat")}</span></div>
          <div className="amet__c"><b>{stats.yurist}</b><span className="amet__l">{t("role.yurist")}</span></div>
          <div className="amet__c"><b>{stats.advokatTashkiloti}</b><span className="amet__l">{t("role.organization")}</span></div>
          <div className="amet__c"><b>{stats.pending}</b><span className="amet__l">{t("stats.pending")}</span></div>
          <div className="amet__c"><b>{stats.approved}</b><span className="amet__l">{t("stats.approved")}</span></div>
          <div className="amet__c"><b>{stats.rejected}</b><span className="amet__l">{t("stats.rejected")}</span></div>
        </div>
      ) : null}

      <FilterBar
        className="uf--tray"
        fields={[
          {
            key: "role",
            label: t("roleLabel"),
            icon: IconUserPlus,
            value: roleTab,
            empty: "all",
            onChange: (v) => setRoleTab(v as RoleTab),
            options: roleOpts,
            aiId: "admin.register-requests.role-tabs",
            aiTarget: "register-requests:role-tabs",
            aiLabel: t("stats.roleTabs"),
          },
          {
            key: "from",
            label: t("stats.from"),
            icon: IconCalendar,
            active: Boolean(from || to),
            chip: dateChip,
            clear: () => {
              setFrom("");
              setTo("");
            },
            node: <DatePicker value={from} onChange={setFrom} placeholder={t("stats.from")} ariaLabel={t("stats.from")} max={to || undefined} clearLabel={t("stats.clearDates")} />,
          },
          {
            key: "to",
            label: t("stats.to"),
            icon: IconCalendar,
            chip: null,
            node: <DatePicker value={to} onChange={setTo} placeholder={t("stats.to")} ariaLabel={t("stats.to")} min={from || undefined} clearLabel={t("stats.clearDates")} />,
          },
        ]}
        count={res.status === "ready" ? items.length : undefined}
      />

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !items.length ? (
        <EmptyState icon={<IconUser />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist" data-ai-target="register-requests:list" data-ai-label={t("title")} data-ai-id="admin.register-requests.list" data-ai-type="list">
          {items.map((r: RegisterRequest, i) => (
            <div
              key={r.id || i}
              data-ai-id={r.id ? aiId("admin.register-requests.item", r.id) : undefined}
              data-ai-type="list_item"
              data-ai-entity-type="register_request"
              data-ai-entity-id={r.id || undefined}
              data-ai-label={[roleLabel(r.role), fmtDate(r.createdAt, locale)].filter(Boolean).join(" · ") || t("title")}
              data-ai-private
            >
              <AdminItem
                index={i + 1}
                title={r.name || "—"}
                meta={[
                  roleLabel(r.role),
                  r.phone,
                  fmtDate(r.createdAt, locale),
                ].filter(Boolean).join(" · ")}
                tags={[{ label: r.status ? (t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status) : t("status.pending"), tone: "muted" }]}
                right={<Actions id={r.id} onDone={reload} />}
                actions={<button type="button" className="aitem__act" aria-label={t("detailTitle")} title={t("detailTitle")} onClick={() => setDetail(r.id)} data-ai-target="button:register-request-detail" data-ai-id={r.id ? aiId("admin.register-requests.item", r.id, "detail") : undefined}><IconEye /></button>}
              />
            </div>
          ))}
        </div>
      )}
      <RegisterRequestDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
