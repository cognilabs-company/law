"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isAborted, isForbidden, isRouteMissing } from "@/lib/http";
import { fmtRating, shortDateTime } from "@/lib/date";
import { fmtUzs } from "@/lib/money";
import { usePaged } from "@/lib/usePaged";
import { getOwnerDashboard, listOwnerWorkload, type OrgMemberRow, type OrgWorkItem, type OwnerDashboard } from "@/lib/services/orgOwner";
import type { ServiceScope } from "@/lib/services/sellerServices";
import { IconAlert, IconArrowRight, IconBolt, IconBriefcase, IconBuilding, IconChartBar, IconClipboardList, IconList, IconLock, IconRefresh, IconShieldCheck, IconStarRate, IconTag, IconUsers } from "@/components/icons";
import { App, Avatar, Btn, Empty, Loading, Select, Sidebar, Table, Tag, Tool, Toolbar, useOs, type Col, type NavSection, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { ServicesBoard } from "../ServicesApp";
import "./owner.css";

// The organization owner's side of the Organization program: the dashboard
// (the numbers, the members and their load, the work going on), the whole
// workload with its filters, and one member — their services, managed as
// the owner, and their work. Everything opens in the same window.

type Kind = "orders" | "cases" | "urgent";
const KINDS: Kind[] = ["orders", "cases", "urgent"];
const KIND_ICON: Record<Kind, ReactNode> = { orders: <IconTag />, cases: <IconBriefcase />, urgent: <IconBolt /> };
const STATUSES = ["", "pending", "in_progress", "paid", "completed", "cancelled"];
const statusTone = (s: string): Tone => (/complet|paid/.test(s) ? "ok" : /cancel|reject/.test(s) ? "neutral" : /pending|open/.test(s) ? "warn" : "accent");
// Where a piece of work lives on this desktop.
const appOf = (kind: string) => {
  const k = kind.toLowerCase();
  return k.includes("urgent") ? "urgentAssigned" : k.includes("case") ? "cases" : k.includes("document") ? "documentRequests" : "marketplaceOrders";
};

export type OrgRoute = { orgId: string; memberId: string; view: string };
export function orgRouteOf(route: string): OrgRoute | null {
  const m = /\/organization\/([^/?#]+)(?:\/(workload)|\/members\/([^/?#]+)(?:\/(services|workload))?)?/.exec(route);
  if (!m) return null;
  const dec = (s?: string) => (s ? decodeURIComponent(s) : "");
  return { orgId: dec(m[1]), memberId: dec(m[3]), view: m[2] || m[4] || "" };
}

function useDashboard(orgId: string, tick: number) {
  const [state, setState] = useState<{ key: string; data: OwnerDashboard | null; error: unknown }>({ key: "", data: null, error: null });
  const key = `${orgId}|${tick}`;
  useEffect(() => {
    const c = new AbortController();
    getOwnerDashboard(orgId, c.signal)
      .then((d) => !c.signal.aborted && setState({ key, data: d, error: null }))
      .catch((e: unknown) => !isAborted(e) && !c.signal.aborted && setState((s) => ({ key, data: s.data, error: e })));
    return () => c.abort();
  }, [orgId, key]);
  return state.key === key || state.data ? state : { key, data: null, error: null };
}

function Blocked({ error, onBack, backLabel }: { error: unknown; onBack: () => void; backLabel: string }) {
  const t = useTranslations("orgOwner");
  const tc = useTranslations("common");
  return (
    <App name="org-owner">
      <Toolbar title={t("title")} back={{ label: backLabel, onClick: onBack }} />
      <Empty icon={isForbidden(error) ? <IconLock /> : <IconBuilding />} title={t("title")} text={isForbidden(error) ? tc("forbidden") : tc("featureSoon")} action={<Btn onClick={onBack}>{t("allOrgs")}</Btn>} />
    </App>
  );
}

// ── the dashboard ─────────────────────────────────────────────────────────
export function OrgDashboard({ orgId, start, base, openApp }: { orgId: string; start: string } & Pick<NativeProps, "base" | "openApp">) {
  const t = useTranslations("orgOwner");
  const tc = useTranslations("common");
  const d = useTranslations("portal.desk.org");
  const os = useOs();
  const [view, setView] = useState(start === "workload" ? "workload" : "overview");
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<OrgWorkItem | null>(null);
  const { data, error } = useDashboard(orgId, tick);
  const orgs = () => openApp("organization", `${base}/organization`);
  const member = (id: string) => openApp("organization", `${base}/organization/${encodeURIComponent(orgId)}/members/${encodeURIComponent(id)}`);
  if (error && (isForbidden(error) || isRouteMissing(error))) return <Blocked error={error} onBack={orgs} backLabel={t("allOrgs")} />;

  const worksOf = (k: Kind) => (data ? (k === "orders" ? data.activeOrders : k === "cases" ? data.activeCases : data.urgentRequests) : []);
  const s = data?.summary;
  const sections: NavSection[] = [
    {
      id: "o",
      title: os === "mac" ? data?.organization.name || t("title") : undefined,
      items: [
        { id: "overview", label: d("overview"), icon: <IconChartBar /> },
        { id: "members", label: t("summary.members"), icon: <IconUsers />, count: data?.members.length || undefined },
      ],
    },
    { id: "w", title: t("activeTitle"), items: KINDS.map((k) => ({ id: k, label: t(`tabs.${k}`), icon: KIND_ICON[k], count: worksOf(k).length || undefined })) },
    { id: "l", title: os === "mac" ? t("workloadTitle") : undefined, items: [{ id: "workload", label: t("workloadTitle"), icon: <IconList /> }] },
  ];
  const pick = (id: string) => {
    setView(id);
    setSel(null);
  };
  const back = { label: t("allOrgs"), onClick: orgs };
  const name = data?.organization.name || "…";

  let body: ReactNode;
  if (view === "workload") body = <Workload orgId={orgId} members={data?.members ?? []} back={back} title={name} onSelect={setSel} selected={sel} />;
  else
    body = (
      <>
        <Toolbar
          title={view === "overview" ? name : view === "members" ? t("summary.members") : t(`tabs.${view}`)}
          subtitle={view === "overview" ? t("title") : name}
          back={back}
        >
          <Tool icon={<IconList />} label={t("workloadLink")} onClick={() => pick("workload")} />
          <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
        </Toolbar>
        {!data ? (
          error ? (
            <Empty icon={<IconAlert />} title={t("title")} action={<Btn onClick={() => setTick((n) => n + 1)}>{tc("retry")}</Btn>} />
          ) : (
            <Loading label={d("loading")} />
          )
        ) : view === "overview" ? (
          <div className="dxo dx-scroll">
            <div className="dxo-kpis">
              {[
                { k: "members", icon: <IconUsers />, v: s?.members, go: "members" },
                { k: "verified", icon: <IconShieldCheck />, v: s?.verifiedMembers, go: "members" },
                { k: "orders", icon: <IconTag />, v: s?.activeOrders, go: "orders" },
                { k: "cases", icon: <IconBriefcase />, v: s?.activeCases, go: "cases" },
                { k: "urgent", icon: <IconBolt />, v: s?.urgentRequests, go: "urgent" },
              ].map((c) => (
                <button key={c.k} type="button" className={`dxo-kpi is-${c.k}`} onClick={() => pick(c.go)}>
                  <span className="dxo-kpi__ic">{c.icon}</span>
                  <b>{c.v ?? 0}</b>
                  <small>{t(`summary.${c.k}`)}</small>
                </button>
              ))}
            </div>
            <section className="dxo-box">
              <h3>
                <IconUsers aria-hidden />
                {t("membersTitle")}
              </h3>
              <Members rows={data.members} onOpen={member} />
            </section>
          </div>
        ) : view === "members" ? (
          <div className="dxo-table">
            <Members rows={data.members} onOpen={member} />
          </div>
        ) : (
          <div className="dxo-table">
            <Works rows={worksOf(view as Kind)} selected={sel} onSelect={setSel} />
          </div>
        )}
      </>
    );

  return (
    <App name="org-owner" sidebar={<Sidebar label={t("title")} sections={sections} value={view} onChange={pick} />} inspector={sel ? <WorkInfo item={sel} onClose={() => setSel(null)} openApp={openApp} /> : undefined}>
      {body}
    </App>
  );
}

function Members({ rows, onOpen }: { rows: OrgMemberRow[]; onOpen: (userId: string) => void }) {
  const t = useTranslations("orgOwner");
  const te = useTranslations("enums");
  const locale = useLocale();
  const [sel, setSel] = useState("");
  const typeOf = (m: OrgMemberRow) => (t.has(`sellerTypes.${m.sellerType}`) ? t(`sellerTypes.${m.sellerType}`) : m.sellerType || "—");
  const cols: Col<OrgMemberRow>[] = [
    {
      id: "name",
      label: t("col.name"),
      width: "minmax(200px,2fr)",
      sort: (a, b) => a.name.localeCompare(b.name),
      cell: (m) => (
        <span className="dxo-who">
          <Avatar name={m.name || "?"} size={28} />
          <span>
            <b>{m.name || "—"}</b>
            <small>{[m.title || m.role, typeOf(m)].filter(Boolean).join(" · ")}</small>
          </span>
        </span>
      ),
    },
    { id: "region", label: t("col.region"), cell: (m) => (m.region ? (te.has(`regions.${m.region}`) ? te(`regions.${m.region}`) : m.region) : "—") },
    {
      id: "ver",
      label: t("col.verification"),
      cell: (m) => <Tag tone={/verified|approved/.test(m.verificationStatus) ? "ok" : m.verificationStatus === "rejected" ? "err" : "warn"}>{t.has(`verification.${m.verificationStatus}`) ? t(`verification.${m.verificationStatus}`) : m.verificationStatus || "—"}</Tag>,
    },
    {
      id: "rating",
      label: t("col.rating"),
      sort: (a, b) => a.rating - b.rating,
      cell: (m) =>
        m.reviewsCount > 0 && m.rating > 0 ? (
          <span className="dxo-rate">
            <IconStarRate aria-hidden />
            {fmtRating(m.rating, locale)} <small>· {m.reviewsCount}</small>
          </span>
        ) : (
          <small className="dxo-muted">{t("unrated")}</small>
        ),
    },
    { id: "orders", label: t("col.orders"), width: "72px", align: "end", sort: (a, b) => a.workload.activeOrders - b.workload.activeOrders, cell: (m) => m.workload.activeOrders },
    { id: "cases", label: t("col.cases"), width: "72px", align: "end", sort: (a, b) => a.workload.activeCases - b.workload.activeCases, cell: (m) => m.workload.activeCases },
    { id: "urgent", label: t("col.urgent"), width: "72px", align: "end", sort: (a, b) => a.workload.urgentRequests - b.workload.urgentRequests, cell: (m) => m.workload.urgentRequests },
  ];
  return (
    <Table
      label={t("membersTitle")}
      cols={cols}
      rows={rows}
      rowKey={(m) => m.userId || m.name}
      selected={sel}
      onSelect={(m) => setSel(m.userId || m.name)}
      onOpen={(m) => m.userId && onOpen(m.userId)}
      empty={<Empty icon={<IconUsers />} title={t("noMembers")} />}
    />
  );
}

function Works({ rows, selected, onSelect }: { rows: OrgWorkItem[]; selected: OrgWorkItem | null; onSelect: (w: OrgWorkItem) => void }) {
  const t = useTranslations("orgOwner");
  const locale = useLocale();
  const status = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s || "—");
  const cols: Col<OrgWorkItem>[] = [
    {
      id: "title",
      label: t("col.kind"),
      width: "minmax(220px,2fr)",
      cell: (w) => (
        <span className="dxo-work">
          <b>{w.title || t("untitled")}</b>
          <small>
            <code>{w.workId || w.id.slice(0, 8)}</code>
            {t.has(`kinds.${w.kind}`) ? t(`kinds.${w.kind}`) : w.kind}
          </small>
        </span>
      ),
    },
    { id: "who", label: t("col.member"), width: "minmax(140px,1fr)", cell: (w) => <span className="dxo-flow">{[w.memberName, w.clientName].filter(Boolean).join(" → ") || "—"}</span> },
    { id: "status", label: t("col.status"), width: "120px", cell: (w) => <Tag tone={statusTone(w.status)}>{status(w.status)}</Tag> },
    { id: "updated", label: t("col.updated"), width: "118px", sort: (a, b) => a.updatedAt.localeCompare(b.updatedAt), cell: (w) => (w.updatedAt ? shortDateTime(w.updatedAt, locale) : "—") },
  ];
  return (
    <Table
      label={t("activeTitle")}
      cols={cols}
      rows={rows}
      rowKey={(w) => `${w.kind}-${w.id}`}
      selected={selected ? `${selected.kind}-${selected.id}` : undefined}
      onSelect={onSelect}
      onOpen={onSelect}
      empty={<Empty icon={<IconClipboardList />} title={t("noWorks")} />}
    />
  );
}

// One piece of work in the inspector, with the way to its own app.
function WorkInfo({ item, onClose, openApp }: { item: OrgWorkItem; onClose: () => void; openApp: NativeProps["openApp"] }) {
  const t = useTranslations("orgOwner");
  const d = useTranslations("portal.desk.org");
  const locale = useLocale();
  const rows: [string, string][] = [
    [t("col.workId"), item.workId || item.id],
    [t("col.kind"), t.has(`kinds.${item.kind}`) ? t(`kinds.${item.kind}`) : item.kind || "—"],
    [t("col.member"), item.memberName || "—"],
    [t("col.client"), item.clientName || "—"],
    [t("col.amount"), item.amount ? fmtUzs(item.amount) : "—"],
    [t("col.created"), item.createdAt ? shortDateTime(item.createdAt, locale) : "—"],
    [t("col.updated"), item.updatedAt ? shortDateTime(item.updatedAt, locale) : "—"],
  ];
  return (
    <aside className="dxo-insp" aria-label={item.title || t("untitled")}>
      <header>
        <Tag tone={statusTone(item.status)}>{t.has(`statuses.${item.status}`) ? t(`statuses.${item.status}`) : item.status || "—"}</Tag>
        <h2>{item.title || t("untitled")}</h2>
      </header>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="dxo-insp__acts">
        <Btn kind="primary" icon={<IconArrowRight />} onClick={() => openApp(appOf(item.kind))}>
          {t("openSection")}
        </Btn>
        <Btn onClick={onClose}>{d("cancel")}</Btn>
      </div>
    </aside>
  );
}

// The whole workload (or one member's), filtered by member and status.
function Workload({ orgId, memberId = "", members, back, title, selected, onSelect }: { orgId: string; memberId?: string; members: OrgMemberRow[]; back: { label: string; onClick: () => void }; title: string; selected: OrgWorkItem | null; onSelect: (w: OrgWorkItem) => void }) {
  const t = useTranslations("orgOwner");
  const tc = useTranslations("common");
  const d = useTranslations("portal.desk.org");
  const locked = !!memberId;
  const [member, setMember] = useState(memberId);
  const [status, setStatus] = useState("");
  const fetcher = useCallback((o: number, l: number, s: AbortSignal) => listOwnerWorkload(orgId, { memberUserId: member, status, offset: o, limit: l }, s), [orgId, member, status]);
  const list = usePaged(fetcher, `${orgId}|${member}|${status}`, 50, (x) => `${x.kind}-${x.id}`);
  const memberOpts = useMemo(() => [{ value: "", label: t("allMembers") }, ...members.filter((m) => m.userId).map((m) => ({ value: m.userId, label: m.name || m.userId }))], [members, t]);
  return (
    <>
      <Toolbar title={t("workloadTitle")} subtitle={list.status === "ready" ? `${title} · ${t("total", { n: list.total })}` : title} back={back}>
        {locked ? null : <Select value={member} onChange={setMember} options={memberOpts} ariaLabel={t("filterMember")} />}
        <Select value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s ? (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s) : t("allStatuses") }))} ariaLabel={t("filterStatus")} />
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={list.reload} />
      </Toolbar>
      <div className="dxo-table">
        {list.status === "loading" ? (
          <Loading label={d("loading")} />
        ) : list.status === "error" ? (
          isForbidden(list.error) || isRouteMissing(list.error) ? (
            <Empty icon={<IconLock />} title={isForbidden(list.error) ? tc("forbidden") : tc("featureSoon")} />
          ) : (
            <Empty icon={<IconAlert />} title={t("workloadTitle")} action={<Btn onClick={list.reload}>{tc("retry")}</Btn>} />
          )
        ) : (
          <>
            <Works rows={list.items} selected={selected} onSelect={onSelect} />
            {list.hasMore ? (
              <div className="dxo-more">
                <Btn small busy={list.loadingMore} onClick={() => void list.loadMore()}>
                  {tc("loadMore")}
                </Btn>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// ── one member ────────────────────────────────────────────────────────────
export function OrgMember({ orgId, memberId, start, base, openApp }: { orgId: string; memberId: string; start: string } & Pick<NativeProps, "base" | "openApp">) {
  const t = useTranslations("orgOwner");
  const ts = useTranslations("sellerServices");
  const locale = useLocale();
  const os = useOs();
  const { data, error } = useDashboard(orgId, 0);
  const [sel, setSel] = useState<OrgWorkItem | null>(null);
  const scope = useMemo<ServiceScope>(() => ({ kind: "org", orgId, memberId }), [orgId, memberId]);
  const dash = () => openApp("organization", `${base}/organization/${encodeURIComponent(orgId)}`);
  if (error && (isForbidden(error) || isRouteMissing(error))) return <Blocked error={error} onBack={dash} backLabel={t("backDashboard")} />;
  const m = data?.members.find((x) => x.userId === memberId) ?? null;
  const back = { label: data?.organization.name || t("backDashboard"), onClick: dash };
  const verified = !!m && /verified|approved/.test(m.verificationStatus);
  const head = (
    <div className="dxo-member">
      <Avatar name={m?.name || "?"} size={os === "mac" ? 52 : 48} />
      <b>{m?.name || "…"}</b>
      <small>{t("member.kicker")}</small>
      {m ? (
        <span className="dxo-member__tags">
          {m.sellerType ? <Tag>{t.has(`sellerTypes.${m.sellerType}`) ? t(`sellerTypes.${m.sellerType}`) : m.sellerType}</Tag> : null}
          {m.verificationStatus ? <Tag tone={verified ? "ok" : "warn"}>{t.has(`verification.${m.verificationStatus}`) ? t(`verification.${m.verificationStatus}`) : m.verificationStatus}</Tag> : null}
          {m.reviewsCount > 0 && m.rating > 0 ? (
            <Tag tone="accent">
              ★ {fmtRating(m.rating, locale)} · {m.reviewsCount}
            </Tag>
          ) : null}
        </span>
      ) : null}
      {m ? (
        <span className="dxo-member__kpis">
          {(["orders", "cases", "urgent"] as Kind[]).map((k) => (
            <span key={k}>
              <b>{k === "orders" ? m.workload.activeOrders : k === "cases" ? m.workload.activeCases : m.workload.urgentRequests}</b>
              <small>{t(`col.${k}`)}</small>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
  return (
    <>
      <ServicesBoard
        scope={scope}
        owner
        title={m?.name ? ts("titleOwner", { name: m.name }) : undefined}
        head={head}
        back={back}
        start={start === "workload" ? "workload" : "all"}
        extra={{
          section: { id: "work", title: os === "mac" ? t("member.tab.workload") : undefined, items: [{ id: "workload", label: t("member.tab.workload"), icon: <IconClipboardList /> }] },
          render: () => (
            <div className="dxo-split">
              <div className="dxo-split__main">
                <Workload orgId={orgId} memberId={memberId} members={data?.members ?? []} back={back} title={m?.name || ""} selected={sel} onSelect={setSel} />
              </div>
              {sel ? <WorkInfo item={sel} onClose={() => setSel(null)} openApp={openApp} /> : null}
            </div>
          ),
        }}
      />
    </>
  );
}
