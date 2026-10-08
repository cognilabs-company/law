"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FilterBar from "@/components/filters/FilterBar";
import { logApiError } from "@/lib/http";
import { listStudioApprovals, useStudioAccess, useStudioRegistry, type StudioDetail } from "@/lib/services/studio";
import { ctorOrder } from "@/lib/studio/constructors";
import StudioShell from "./StudioShell";
import { StudioEmpty, StudioErrorNote, StudioLoading, studioEventObjectId, useNow, useStudioLive, useStudioText } from "./bits";
import ApprovalCard from "./approvals/ApprovalCard";
import ApprovalDrawer from "./approvals/ApprovalDrawer";
import { DETAIL_EVENTS, LIST_EVENTS, QUEUE_STATUSES, canPublishItem, isMine, submittedOf, versionLabelOf, waitingSince } from "./approvals/helpers";
import { IconCircleCheck, IconGrid, IconSearch, IconShieldCheck, IconUser } from "@/components/icons";

export default function ApprovalQueue() {
  const { t } = useStudioText();
  return (
    <StudioShell title={t("approvals.title")} lead={t("approvals.lead")} need="review" icon={<IconShieldCheck aria-hidden />}>
      <QueueBody />
    </StudioShell>
  );
}

type Loaded = { key: string; items: StudioDetail[]; error: unknown; ok: boolean };

function QueueBody() {
  const { t, status: statusLabel, ctorName } = useStudioText();
  const access = useStudioAccess();
  const registry = useStudioRegistry();
  const now = useNow();
  const [ctor, setCtor] = useState("");
  const [status, setStatus] = useState("");
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState("");
  const [openBase, setOpenBase] = useState<StudioDetail | null>(null);
  const [pulse, setPulse] = useState(0);
  const seq = useRef(0);
  const key = `${ctor}|${status}`;

  const fetchList = useCallback(async (c: string, s: string) => {
    const my = ++seq.current;
    const k = `${c}|${s}`;
    try {
      const res = await listStudioApprovals({ constructorCode: c || undefined, status: s || undefined });
      if (my !== seq.current) return;
      setLoaded({ key: k, items: res.items, error: null, ok: true });
    } catch (e) {
      if (my !== seq.current) return;
      logApiError("studio.approvals.list", e);
      setLoaded((cur) => (cur && cur.ok && cur.key === k ? { ...cur, error: e } : { key: k, items: [], error: e, ok: false }));
    }
  }, []);

  useEffect(() => {
    void fetchList(ctor, status);
  }, [fetchList, ctor, status]);

  useStudioLive((e) => {
    if (LIST_EVENTS.has(e.event)) void fetchList(ctor, status);
    if (!openId || !DETAIL_EVENTS.has(e.event)) return;
    const id = studioEventObjectId(e);
    if (!id || id === openId) setPulse((n) => n + 1);
  });

  async function retry() {
    setBusy(true);
    await fetchList(ctor, status);
    setBusy(false);
  }

  const ctorOf = (code: string) => registry.items.find((c) => c.code === code) ?? null;
  const all = loaded?.items ?? [];
  const current = loaded && loaded.key === key ? loaded : null;
  const switching = Boolean(loaded) && !current;

  const codes = [...new Set([...registry.items.filter((c) => c.approvalRequired).map((c) => c.code), ...all.map((i) => i.code).filter(Boolean)])];
  if (ctor && !codes.includes(ctor)) codes.push(ctor);
  codes.sort((a, b) => ctorOrder(a) - ctorOrder(b) || a.localeCompare(b));

  const ctorOpts = [{ value: "", label: t("common.all") }, ...codes.map((c) => ({ value: c, label: `${ctorName(c, ctorOf(c)?.title)} · ${c}` }))];
  const stOpts = [{ value: "", label: t("common.all") }, ...QUEUE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))];
  const whoOpts = [
    { value: "", label: t("approvals.filter.everyone") },
    { value: "mine", label: t("approvals.filter.mine") },
  ];

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all
    .filter((d) => {
      if (ctor && d.code && d.code !== ctor) return false;
      if (status && d.status !== status) return false;
      if (who === "mine" && !isMine(d, access, ctorOf(d.code))) return false;
      if (!terms.length) return true;
      const sub = submittedOf(d);
      const hay = [d.title, d.code, ctorName(d.code), sub.by, versionLabelOf(d), d.id].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    })
    .sort((a, b) => waitingSince(a) - waitingSince(b));
  const mineCount = all.filter((d) => isMine(d, access, ctorOf(d.code))).length;
  const filtered = Boolean(ctor || status || who || terms.length);

  const open = (d: StudioDetail) => {
    setOpenId(d.id);
    setOpenBase(d);
  };
  const close = () => {
    setOpenId("");
    setOpenBase(null);
  };
  const drawerBase = openId ? (all.find((d) => d.id === openId) ?? openBase) : null;

  let list;
  if (!loaded || (switching && !all.length)) list = <StudioLoading rows={4} label={t("approvals.loading")} />;
  else if (current && !current.ok) list = <StudioErrorNote error={current.error} onRetry={retry} busy={busy} />;
  else if (!all.length && !switching)
    list = filtered ? (
      <StudioEmpty icon={IconSearch} title={t("approvals.empty.filteredTitle")} text={t("approvals.empty.filteredText")} />
    ) : (
      <StudioEmpty icon={IconCircleCheck} tone="brand" title={t("approvals.empty.title")} text={t("approvals.empty.text")} />
    );
  else if (!shown.length) list = <StudioEmpty icon={IconSearch} title={t("approvals.empty.filteredTitle")} text={t("approvals.empty.filteredText")} />;
  else
    list = (
      <ul className={`stu-apl${switching ? " is-busy" : ""}`} aria-busy={switching || undefined} data-ai-id="admin.studio.approvals.list" data-ai-type="list" data-ai-label={t("approvals.title")}>
        {shown.map((d) => {
          const c = ctorOf(d.code);
          return <ApprovalCard key={d.id} item={d} now={now} mine={isMine(d, access, c)} publishable={canPublishItem(d, access, c)} active={d.id === openId} onOpen={open} />;
        })}
      </ul>
    );

  return (
    <>
      <FilterBar
        className="uf--tray stu-apf"
        fields={[
          { key: "ctor", label: t("approvals.filter.ctor"), icon: IconGrid, value: ctor, empty: "", onChange: setCtor, options: ctorOpts, aiId: "admin.studio.approvals.filters.constructor" },
          { key: "status", label: t("approvals.filter.status"), icon: IconCircleCheck, value: status, empty: "", onChange: setStatus, options: stOpts, aiId: "admin.studio.approvals.filters.status" },
          { key: "who", label: t("approvals.filter.who"), icon: IconUser, value: who, empty: "", onChange: setWho, options: whoOpts, aiId: "admin.studio.approvals.filters.who" },
        ]}
        search={{ value: q, onChange: setQ, placeholder: t("approvals.filter.searchPh"), label: t("common.search"), aiId: "admin.studio.approvals.search.input" }}
        count={current?.ok ? shown.length : undefined}
        onReset={() => {
          setCtor("");
          setStatus("");
          setWho("");
          setQ("");
        }}
        aiId="admin.studio.approvals.filters"
        aiLabel={t("approvals.filter.title")}
      />
      {current?.ok && mineCount > 0 && who !== "mine" ? (
        <button type="button" className="stu-apnote" onClick={() => setWho("mine")} data-ai-id="admin.studio.approvals.mine" data-ai-type="button" data-ai-label={t("approvals.mineNote", { n: mineCount })}>
          <span className="stu-apnote__n" aria-hidden>
            <IconUser />
          </span>
          {t("approvals.mineNote", { n: mineCount })}
        </button>
      ) : null}
      {current?.ok && current.error ? <StudioErrorNote error={current.error} onRetry={retry} busy={busy} compact /> : null}
      {list}
      <ApprovalDrawer base={drawerBase} ctor={drawerBase ? ctorOf(drawerBase.code) : null} access={access} pulse={pulse} onClose={close} onChanged={() => void fetchList(ctor, status)} />
    </>
  );
}
