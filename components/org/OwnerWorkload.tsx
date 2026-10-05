"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { usePaged } from "@/lib/usePaged";
import { isForbidden, isRouteMissing, isAborted } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { getOwnerDashboard, listOwnerWorkload, type OrgMemberRow, type OrgWorkItem } from "@/lib/services/orgOwner";
import Select from "@/components/Select";
import { IconChevronLeft, IconRefresh } from "@/components/icons";
import { OrgBlocked, WorkDetail, WorkRow, statusLabel } from "./bits";

const STATUSES = ["", "pending", "in_progress", "paid", "completed", "cancelled"];

export default function OwnerWorkload({ orgId }: { orgId: string }) {
  const t = useTranslations("orgOwner");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const router = useRouter();
  const [member, setMember] = useState(params.get("member") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [orgName, setOrgName] = useState("");
  const [detail, setDetail] = useState<OrgWorkItem | null>(null);
  const base = `/portal/advocate/organization/${encodeURIComponent(orgId)}`;

  useEffect(() => {
    const c = new AbortController();
    getOwnerDashboard(orgId, c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setMembers(d.members);
        setOrgName(d.organization.name);
      })
      .catch((e: unknown) => {
        if (isAborted(e)) return;
      });
    return () => c.abort();
  }, [orgId]);

  const fetcher = useCallback((o: number, l: number, s: AbortSignal) => listOwnerWorkload(orgId, { memberUserId: member, status, offset: o, limit: l }, s), [orgId, member, status]);
  const list = usePaged(fetcher, `${orgId}|${member}|${status}`, 50, (x) => `${x.kind}-${x.id}`);

  const apply = (next: { member?: string; status?: string }) => {
    const m = next.member ?? member;
    const st = next.status ?? status;
    setMember(m);
    setStatus(st);
    const qs = new URLSearchParams();
    if (m) qs.set("member", m);
    if (st) qs.set("status", st);
    router.replace(`${base}/workload${qs.size ? `?${qs.toString()}` : ""}` as Parameters<typeof router.replace>[0], { scroll: false });
  };

  if (list.status === "error" && isForbidden(list.error)) return <OrgBlocked kind="forbidden" />;
  if (list.status === "error" && isRouteMissing(list.error)) return <OrgBlocked kind="soon" />;

  return (
    <div className="oown">
      <div className="oown__head">
        <Link href={base} className="sup__back oown__back">
          <IconChevronLeft />
          {t("backDashboard")}
        </Link>
        <div className="oown__title">
          <span>{t("workloadTitle")}</span>
          <h2>{orgName || "…"}</h2>
        </div>
        <span className="advmuted">{t("total", { n: list.total })}</span>
      </div>

      <div className="ofilter" data-ai-target="organization:workload-filter">
        <label>
          <span>{t("filterMember")}</span>
          <Select value={member} onChange={(v) => apply({ member: v })} ariaLabel={t("filterMember")} options={[{ value: "", label: t("allMembers") }, ...members.filter((m) => m.userId).map((m) => ({ value: m.userId, label: m.name || m.userId }))]} />
        </label>
        <label>
          <span>{t("filterStatus")}</span>
          <Select value={status} onChange={(v) => apply({ status: v })} ariaLabel={t("filterStatus")} options={STATUSES.map((s) => ({ value: s, label: s ? statusLabel(t, t.has, s) : t("allStatuses") }))} />
        </label>
      </div>

      <section className="opanel">
        {list.status === "loading" ? (
          [0, 1, 2].map((i) => <div key={i} className="supcard supcard--ghost" aria-hidden="true" />)
        ) : list.status === "error" ? (
          <div className="sup__empty">
            <p>{errorText(list.error, tc)}</p>
            <button type="button" className="btn btn--line btn--sm" onClick={list.reload}>
              <IconRefresh />
              {tc("retry")}
            </button>
          </div>
        ) : !list.items.length ? (
          <p className="advmuted">{t("noWorks")}</p>
        ) : (
          <div className="oworks">
            {list.items.map((w) => (
              <WorkRow key={`${w.kind}-${w.id}`} item={w} onOpen={() => setDetail(w)} />
            ))}
          </div>
        )}
        {list.hasMore ? (
          <button type="button" className="btn btn--line btn--sm sup__more" onClick={() => void list.loadMore()} disabled={list.loadingMore}>
            {tc("loadMore")}
          </button>
        ) : null}
      </section>

      <WorkDetail item={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
