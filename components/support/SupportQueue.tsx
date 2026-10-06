"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { usePaged, type Page } from "@/lib/usePaged";
import { isAborted, isConflict, isRouteMissing } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { useAiReveal } from "@/lib/guide/targets";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiModal, useAiSelection } from "@/lib/ai/registry";
import {
  claimSupportTicket,
  closeSupportTicket,
  isActiveTicket,
  isSupportSupervisor,
  isUrgentPriority,
  isWaitingTicket,
  listSupportOperators,
  listSupportQueue,
  normSupportTicket,
  timeOf,
  transferSupportTicket,
  type SupportEventKind,
  type SupportOperator,
  type SupportTicket,
} from "@/lib/services/support";
import { shortDateTime } from "@/lib/date";
import Modal from "@/components/admin/Modal";
import { IconChat, IconChevronLeft, IconClock, IconHeadset, IconRefresh, IconSearch } from "@/components/icons";
import SupportChat from "./SupportChat";
import AssistPanel from "./assist/AssistPanel";
import { SupportStatus, TicketCard, useMinuteNow, useSupportCall, useSupportLabels, waitText } from "./bits";

type Tab = "new" | "mine" | "transferred" | "closed";
type View = "chat" | "assist";
type Transfer = { q: string; results: SupportOperator[]; loading: boolean; pick: SupportOperator | null; reason: string; err: string };

const TABS: Tab[] = ["new", "mine", "transferred", "closed"];
const VIEWS: View[] = ["chat", "assist"];
const WIDE = "(min-width: 1440px)";
const ASSIST_RELOAD = new Set<SupportEventKind>(["assist", "transferred", "closed", "reopened"]);
const ASSIST_PREVIEW = "support.assist_subscription_preview_created";
const OWN_ACT_MS = 5000;
const QUERY: Record<Tab, { status?: string; assignedToMe?: boolean }> = {
  new: { status: "waiting_operator" },
  mine: { status: "active", assignedToMe: true },
  transferred: { status: "transferred" },
  closed: { status: "closed" },
};
const NARROW = "(max-width: 980px)";
const QUEUE_PATH = /\/admin\/call-center\/support(?:\/[^/]+)?\/?$/;

const oldest = (a: SupportTicket, b: SupportTicket) => timeOf(a.createdAt) - timeOf(b.createdAt);

function pastLoaded(tk: SupportTicket, loaded: SupportTicket[]): boolean {
  const last = loaded[loaded.length - 1];
  return !last || timeOf(tk.createdAt) >= timeOf(last.createdAt);
}

function shape(tab: Tab, p: Page<SupportTicket>): Page<SupportTicket> {
  return tab === "new" ? { ...p, items: [...p.items].sort(oldest) } : p;
}

function belongs(tab: Tab, tk: SupportTicket, meId: string): boolean {
  if (tab === "new") return tk.status === "waiting_operator";
  if (tab === "mine") return Boolean(meId) && tk.operatorUserId === meId && isActiveTicket(tk);
  if (tab === "transferred") return tk.status === "transferred";
  return tk.status === "closed";
}

export default function SupportQueue({ ticketId }: { ticketId?: string }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const now = useMinuteNow();
  const labels = useSupportLabels();
  const [tab, setTab] = useState<Tab>(ticketId ? "mine" : "new");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [selectedId, setSelectedId] = useState(ticketId ?? "");
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [closing, setClosing] = useState<{ resolution: string; err: string } | null>(null);
  const [view, setView] = useState<View>("chat");
  const [assistKey, setAssistKey] = useState(0);
  const [ping, setPing] = useState(0);
  const [missingId, setMissingId] = useState("");
  const counted = useRef(new Set<string>());
  const acted = useRef({ ticketId: "", at: 0 });
  const claiming = useRef("");
  const uid = useId();

  const fetcher = useCallback(
    (o: number, l: number, s: AbortSignal) => listSupportQueue({ ...QUERY[tab], offset: o, limit: l }, s).then((p) => shape(tab, p)),
    [tab],
  );
  const list = usePaged(fetcher, tab, 50, (x) => x.id, 100);
  const { setItems, refresh, hasMore } = list;
  const missing = list.status === "error" && isRouteMissing(list.error);
  const placeholder = useMemo(() => (selectedId ? normSupportTicket({ id: selectedId, status: "" }) : null), [selectedId]);
  const current = list.items.find((x) => x.id === selectedId) ?? (selected && selected.id === selectedId ? selected : placeholder);
  const call = useSupportCall(current?.id ?? "", current?.workId ?? "");

  const patch = useCallback(
    (tk: SupportTicket) => {
      if (tk.id && tk.id === claiming.current) return;
      setItems((cur) => cur.map((x) => (x.id === tk.id ? { ...x, ...tk } : x)));
      setSelected((s) => (s && s.id === tk.id ? { ...s, ...tk } : s && s.id !== tk.id ? s : tk));
    },
    [setItems],
  );

  const place = useCallback(
    (tk: SupportTicket, fromEvent: boolean) => {
      if (!tk.id) return;
      setItems((cur) => {
        const old = cur.find((x) => x.id === tk.id);
        const next = old ? { ...old, ...tk, unreadCount: fromEvent ? old.unreadCount : tk.unreadCount } : tk;
        const rest = old ? cur.filter((x) => x.id !== tk.id) : cur;
        if (!belongs(tab, next, meId)) return old ? rest : cur;
        if (tab === "new" && !old && hasMore && pastLoaded(next, cur)) return cur;
        return tab === "new" ? [...rest, next].sort(oldest) : [next, ...rest];
      });
      setSelected((s) => {
        if (s && s.id === tk.id) return { ...s, ...tk, unreadCount: fromEvent ? s.unreadCount : tk.unreadCount };
        return !s && tk.id === selectedId ? tk : s;
      });
    },
    [setItems, tab, meId, selectedId, hasMore],
  );

  const { online } = useSupportEvents((e) => {
    if (e.kind === "claimed" && e.ticketId === claiming.current && e.ticket?.operatorUserId === meId) return;
    const ownAct = e.kind === "assist" && Boolean(meId) && e.operatorUserId === meId && acted.current.ticketId === e.ticketId && Date.now() - acted.current.at < OWN_ACT_MS;
    if (e.ticketId === selectedId && ASSIST_RELOAD.has(e.kind) && e.name !== ASSIST_PREVIEW && !ownAct) setAssistKey((n) => n + 1);
    if (e.kind === "call" || e.kind === "assist") return;
    if (e.kind === "message") {
      const fresh = e.messages.filter((m) => m.id && m.senderUserId && m.senderUserId !== meId && !counted.current.has(m.id));
      for (const m of fresh) counted.current.add(m.id);
      const last = e.messages[e.messages.length - 1];
      const open = e.ticketId === selectedId;
      if (open && fresh.length && view === "assist" && !window.matchMedia(WIDE).matches) setPing((n) => n + fresh.length);
      const ticket = e.ticket;
      setItems((cur) => {
        const old = cur.find((x) => x.id === e.ticketId);
        if (!old) return cur;
        const at = last?.createdAt || ticket?.lastMessageAt || old.lastMessageAt;
        const next: SupportTicket = {
          ...old,
          ...(ticket ?? {}),
          lastMessage: last?.content || ticket?.lastMessage || old.lastMessage,
          lastMessageAt: at,
          updatedAt: ticket?.updatedAt || at || old.updatedAt,
          unreadCount: open ? 0 : old.unreadCount + fresh.length,
        };
        if (tab === "new") return cur.map((x) => (x.id === e.ticketId ? next : x));
        return [next, ...cur.filter((x) => x.id !== e.ticketId)];
      });
      if (ticket && open) setSelected((s) => (s && s.id === e.ticketId ? { ...s, ...ticket, unreadCount: 0 } : s));
      if (!e.messages.length && !ticket) refresh();
      return;
    }
    if (e.ticket) {
      const tk = e.ticket;
      if (e.ticketId === selectedId && current) {
        if (e.kind === "claimed" && tk.operatorUserId && tk.operatorUserId !== meId && current.operatorUserId !== tk.operatorUserId) toast(t("claimTaken"));
        if (e.kind === "transferred" && tk.operatorUserId !== meId && current.operatorUserId === meId) toast(t("transferredAway"));
      }
      place(tk, true);
      return;
    }
    refresh();
  }, refresh);
  usePoll(refresh, 30000, list.status === "ready" && (!online || tab === "new" || tab === "transferred"));

  const syncUrl = (id: string) => {
    const path = window.location.pathname;
    const m = QUEUE_PATH.exec(path);
    if (!m) return;
    const next = `${path.slice(0, m.index)}/admin/call-center/support${id ? `/${encodeURIComponent(id)}` : ""}`;
    if (next !== path) window.history.replaceState(null, "", next);
  };
  const open = (tk: SupportTicket, sync = true) => {
    setSelected(tk.unreadCount ? { ...tk, unreadCount: 0 } : tk);
    setSelectedId(tk.id);
    setView("chat");
    setPing(0);
    if (tk.unreadCount) setItems((cur) => cur.map((x) => (x.id === tk.id ? { ...x, unreadCount: 0 } : x)));
    if (sync) syncUrl(tk.id);
  };
  const back = (sync = true) => {
    setSelectedId("");
    setPing(0);
    if (sync) syncUrl("");
  };
  const showView = (k: View) => {
    setView(k);
    if (k === "chat") setPing(0);
  };
  const onViewKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = VIEWS.indexOf(view);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % VIEWS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + VIEWS.length) % VIEWS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = VIEWS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    showView(VIEWS[next]);
    document.getElementById(`${uid}-view-${VIEWS[next]}`)?.focus();
  };

  useAiReveal("support:ticket-list", () => {
    if (selectedId && window.matchMedia(NARROW).matches) back(false);
  });
  useAiReveal(/^support:(chat|message-input)$/, () => {
    const first = list.items[0];
    if (!selectedId && first) open(first, false);
    showView("chat");
  });
  useAiReveal("support:assist", () => {
    const first = list.items[0];
    if (!selectedId && first) open(first, false);
    setView("assist");
  });

  const ticketBySeg = (seg: string) => list.items.find((x) => aiSeg(x.id) === seg) ?? (current && aiSeg(current.id) === seg ? current : null);
  const focusTicket = (seg: string) => {
    const tk = seg ? ticketBySeg(seg) : (current ?? list.items[0] ?? null);
    if (tk && tk.id !== selectedId) open(tk, false);
  };
  const segOf = (id: string) => id.split(".")[3] ?? "";

  useAiReveal(/^call_center\.support\.(queue|queue\.tabs|queue\.tab\.[a-z]+|ticket\.[^.]+)$/, () => {
    if (selectedId && window.matchMedia(NARROW).matches) back(false);
  });
  useAiReveal(/^call_center\.support\.(chat|ticket\.[^.]+\.(messages|message-input|call(\.audio|\.video)?))$/, (id) => {
    focusTicket(id === "call_center.support.chat" ? "" : segOf(id));
    showView("chat");
  });
  useAiReveal(/^call_center\.support\.ticket\.[^.]+\.(claim|transfer|close)$/, (id) => {
    focusTicket(segOf(id));
  });
  useAiReveal(/^call_center\.support\.ticket\.[^.]+\.assist(\..+)?$/, (id) => {
    focusTicket(segOf(id));
    setView("assist");
  });

  const aiTicket = current?.id ?? "";
  const ownOpen = (tk: SupportTicket | null) => Boolean(tk && tk.status && tk.operatorUserId && tk.operatorUserId === meId && isActiveTicket(tk));
  useAiModal(aiTicket ? aiId("call_center.support.ticket", aiTicket, "transfer-modal") : "", () => {
    if (busy || !ownOpen(current)) return;
    setTransfer({ q: "", results: [], loading: true, pick: null, reason: "", err: "" });
  });
  useAiModal(aiTicket ? aiId("call_center.support.ticket", aiTicket, "close-modal") : "", () => {
    if (busy || !ownOpen(current)) return;
    setClosing({ resolution: "", err: "" });
  });
  useAiSelection("support_queue_tab", tab);

  const claim = async (tk: SupportTicket) => {
    if (busy) return;
    setBusy(true);
    claiming.current = tk.id;
    try {
      const next = await claimSupportTicket(tk.id);
      const base = next.id ? next : tk;
      place({ ...base, operatorUserId: next.operatorUserId || meId, status: next.status || "claimed" }, false);
      toast(t("claimedOk"), { tone: "ok" });
    } catch (e) {
      if (isConflict(e)) {
        toast(t("claimTaken"), { tone: "err" });
        refresh();
      } else toast(errorText(e, tc), { tone: "err" });
    } finally {
      claiming.current = "";
      setBusy(false);
    }
  };

  const markActed = (id: string) => {
    acted.current = { ticketId: id, at: Date.now() };
  };

  const transferOpen = transfer !== null;
  const transferQ = transfer?.q ?? "";
  useEffect(() => {
    if (!transferOpen) return;
    const c = new AbortController();
    const id = window.setTimeout(
      () => {
        listSupportOperators(transferQ, 30, c.signal)
          .then((items) => {
            if (c.signal.aborted) return;
            const results = items.filter((o) => o.id !== meId);
            setTransfer((x) => (x ? { ...x, results, loading: false } : x));
          })
          .catch((e: unknown) => {
            if (isAborted(e) || c.signal.aborted) return;
            setTransfer((x) => (x ? { ...x, results: [], loading: false } : x));
          });
      },
      transferQ.trim() ? 300 : 0,
    );
    return () => {
      window.clearTimeout(id);
      c.abort();
    };
  }, [transferOpen, transferQ, meId]);

  const doTransfer = async () => {
    if (!current || !transfer?.pick || busy) return;
    if (!transfer.reason.trim()) {
      setTransfer({ ...transfer, err: t("reasonRequired") });
      return;
    }
    const pick = transfer.pick;
    setBusy(true);
    try {
      const next = await transferSupportTicket(current.id, pick.id, transfer.reason.trim());
      const base = next.id ? next : current;
      place({ ...base, status: next.status || "transferred", operatorUserId: next.operatorUserId || pick.id, operatorName: next.operatorName || pick.name }, false);
      setTransfer(null);
      toast(t("transferOk", { name: pick.name || pick.lexgoId }), { tone: "ok" });
    } catch (e) {
      setTransfer((x) => (x ? { ...x, err: errorText(e, tc) } : x));
      if (isConflict(e)) refresh();
    } finally {
      setBusy(false);
    }
  };

  const doClose = async () => {
    if (!current || !closing || busy) return;
    if (!closing.resolution.trim()) {
      setClosing({ ...closing, err: t("resolutionRequired") });
      return;
    }
    const resolution = closing.resolution.trim();
    setBusy(true);
    try {
      const next = await closeSupportTicket(current.id, resolution);
      const base = next.id ? next : current;
      place({ ...base, status: next.status || "closed", resolution: next.resolution || resolution }, false);
      setClosing(null);
      toast(t("closedOk"), { tone: "ok" });
    } catch (e) {
      setClosing((x) => (x ? { ...x, err: errorText(e, tc) } : x));
      if (isConflict(e)) refresh();
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="sup sup--soon">
        <div className="supsoon">
          <span className="supsoon__ic">
            <IconHeadset />
          </span>
          <b>{t("queueTitle")}</b>
          <p>{tc("featureSoon")}</p>
        </div>
      </div>
    );
  }

  const known = Boolean(current?.status);
  const mine = Boolean(current && current.operatorUserId && current.operatorUserId === meId);
  const isOpen = Boolean(current && known && isActiveTicket(current));
  const watching = !mine && isOpen && Boolean(current?.operatorUserId) && isSupportSupervisor(session?.backendRole);
  const claimable = Boolean(current && isOpen && !mine && (!current.operatorUserId || isWaitingTicket(current)));
  const roleName = (r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : r);
  const count = list.hasMore ? Math.max(list.total, list.items.length) : list.items.length;
  const reasonNote =
    current && known
      ? current.status === "reopened" && current.reopenReason
        ? { label: t("queue.reopenReason"), text: current.reopenReason }
        : current.status === "transferred" && current.transferReason
          ? { label: t("queue.transferReason"), text: current.transferReason }
          : null
      : null;

  return (
    <div className={`sup sup--queue${selectedId ? " sup--open" : ""}`}>
      <div className="supq">
        <p className="supq__lead">{t("queueLead")}</p>
        {list.status === "ready" ? <span className="supq__count">{t("queue.count", { n: count })}</span> : null}
        <button type="button" className="btn btn--line btn--sm" onClick={refresh} aria-label={t("queue.refresh")} title={t("queue.refresh")}>
          <IconRefresh />
        </button>
      </div>

      <div className="supwork">
        <aside className="supwork__side" aria-label={t("queueTitle")}>
          <div className="suptabs" role="tablist" aria-label={t("queueTitle")} data-ai-id="call_center.support.queue.tabs">
            {TABS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="suptab" onClick={() => setTab(k)} data-ai-id={`call_center.support.queue.tab.${k}`}>
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>
          {tab === "new" && list.status === "ready" && list.items.length > 1 ? <p className="supq__hint">{t("queue.oldestFirst")}</p> : null}
          <div className="supwork__list" data-ai-target="support:ticket-list" data-ai-id="call_center.support.queue" data-ai-type="list" data-ai-label={t("queueTitle")}>
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
              <div className="supempty supempty--sm">
                <span className="supempty__ic" aria-hidden="true">
                  <IconHeadset />
                </span>
                <p>{t("queueEmpty")}</p>
              </div>
            ) : (
              list.items.map((tk) => (
                <TicketCard
                  key={tk.id}
                  ticket={tk}
                  view="operator"
                  now={now}
                  active={tk.id === selectedId}
                  unread={tk.id !== selectedId && tk.operatorUserId === meId && isActiveTicket(tk) ? tk.unreadCount : 0}
                  onOpen={() => open(tk)}
                  extra={
                    tab === "new" && isWaitingTicket(tk) ? (
                      <button
                        type="button"
                        className="btn btn--pri btn--sm supitem__claim"
                        disabled={busy}
                        onClick={() => void claim(tk)}
                        data-ai-id={aiId("call_center.support.ticket", tk.id, "claim")}
                        data-ai-label={t("claim")}
                      >
                        {t("claim")}
                      </button>
                    ) : null
                  }
                />
              ))
            )}
            {list.hasMore ? (
              <button type="button" className="btn btn--line btn--sm sup__more" onClick={() => void list.loadMore()} disabled={list.loadingMore}>
                {tc("loadMore")}
              </button>
            ) : null}
          </div>
        </aside>

        <section className="supwork__main">
          {current ? (
            <>
              <div className="supwork__bar">
                <button type="button" className="supbar__back supwork__back" onClick={() => back()}>
                  <IconChevronLeft />
                  {t("back")}
                </button>
                <div className="suptabs supview" role="tablist" aria-label={t("queue.views")} onKeyDown={onViewKey}>
                  {VIEWS.map((k) => (
                    <button
                      key={k}
                      id={`${uid}-view-${k}`}
                      type="button"
                      role="tab"
                      aria-selected={view === k}
                      aria-controls={`${uid}-pane-${k}`}
                      tabIndex={view === k ? 0 : -1}
                      className="suptab"
                      onClick={() => showView(k)}
                      data-ai-id={`call_center.support.view.${k}`}
                    >
                      {k === "chat" ? <IconChat aria-hidden="true" /> : <IconHeadset aria-hidden="true" />}
                      {k === "chat" ? t("queue.viewChat") : t("assist.title")}
                      {k === "chat" && ping ? (
                        <span className="supview__new">
                          <span aria-hidden="true">{ping > 99 ? "99+" : ping}</span>
                          <span className="sr-only">{t("unreadAria", { n: ping })}</span>
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="supop">
                <dl className="supop__facts">
                  <div>
                    <dt>{t("statusLabel")}</dt>
                    <dd>{known ? <SupportStatus status={current.status} /> : "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("priority")}</dt>
                    <dd>
                      {labels.priority(current.priority) || "—"}
                      {isUrgentPriority(current.priority) ? <span className="supitem__urgent">{t("urgent")}</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("queue.topic")}</dt>
                    <dd>{labels.category(current.category) || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("createdAt")}</dt>
                    <dd>{current.createdAt ? shortDateTime(current.createdAt, locale) : "—"}</dd>
                  </div>
                  {known && isWaitingTicket(current) && current.createdAt ? (
                    <div>
                      <dt>{t("queue.waiting")}</dt>
                      <dd className="supop__wait">
                        <IconClock />
                        {waitText(t, current.createdAt, now)}
                      </dd>
                    </div>
                  ) : null}
                  {current.operatorName ? (
                    <div>
                      <dt>{t("operator")}</dt>
                      <dd>{current.operatorName}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="supop__acts">
                  {claimable ? (
                    <button type="button" className="btn btn--pri btn--sm" disabled={busy} onClick={() => void claim(current)} data-ai-id={aiId("call_center.support.ticket", current.id, "claim")}>
                      {t("claim")}
                    </button>
                  ) : null}
                  {mine && isOpen ? (
                    <>
                      <button
                        type="button"
                        className="btn btn--line btn--sm"
                        disabled={busy}
                        onClick={() => setTransfer({ q: "", results: [], loading: true, pick: null, reason: "", err: "" })}
                        data-ai-id={aiId("call_center.support.ticket", current.id, "transfer")}
                      >
                        {t("transfer")}
                      </button>
                      <button
                        type="button"
                        className="btn btn--line btn--sm supop__close"
                        disabled={busy}
                        onClick={() => setClosing({ resolution: "", err: "" })}
                        data-ai-id={aiId("call_center.support.ticket", current.id, "close")}
                      >
                        {t("close")}
                      </button>
                    </>
                  ) : null}
                </div>
                {reasonNote ? (
                  <p className="supop__note">
                    <b>{reasonNote.label}:</b> {reasonNote.text}
                  </p>
                ) : null}
              </div>
              <div className={`supdesk${view === "assist" ? " is-assist" : ""}`}>
                <div id={`${uid}-pane-chat`} role="tabpanel" aria-labelledby={`${uid}-view-chat`} className="supdesk__chat">
                  <SupportChat
                    key={current.id}
                    ticket={current}
                    meId={meId}
                    mode="operator"
                    canWrite={mine && isOpen}
                    canCall={mine && isOpen}
                    call={call}
                    readOnlyNote={t("readOnly")}
                    onTicket={patch}
                    onMissing={setMissingId}
                    onBack={() => back()}
                  />
                </div>
                <div id={`${uid}-pane-assist`} role="tabpanel" aria-labelledby={`${uid}-view-assist`} className="supdesk__assist">
                  <AssistPanel
                    ticket={current}
                    mine={mine && isOpen}
                    readOnly={watching}
                    missing={missingId === current.id}
                    refreshKey={assistKey}
                    onCall={(k) => void call.start(k)}
                    calling={call.calling}
                    onActed={markActed}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="supwork__pick">
              <span className="supempty__art" aria-hidden="true" />
              <p>{t("pickTicket")}</p>
            </div>
          )}
        </section>
      </div>

      <Modal open={!!transfer} onClose={() => setTransfer(null)} title={t("transfer")}>
        {transfer ? (
          <div className="supmodal" data-ai-id={aiId("call_center.support.ticket", aiTicket, "transfer-modal")} data-ai-type="modal" data-ai-label={t("transfer")} data-ai-private>
            <label className="supmodal__search">
              <IconSearch />
              <input
                value={transfer.q}
                onChange={(e) => setTransfer({ ...transfer, q: e.target.value, loading: true, err: "" })}
                placeholder={t("operatorSearch")}
                aria-label={t("operatorSearch")}
                autoFocus
                data-ai-id={aiId("call_center.support.ticket", aiTicket, "transfer-modal", "search")}
              />
            </label>
            <ul
              className="supmodal__list"
              role="listbox"
              aria-label={t("operator")}
              aria-busy={transfer.loading}
              data-ai-id={aiId("call_center.support.ticket", aiTicket, "transfer-modal", "operators")}
              data-ai-type="list"
              data-ai-label={t("operator")}
            >
              {transfer.results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={transfer.pick?.id === u.id}
                    className={transfer.pick?.id === u.id ? "is-on" : undefined}
                    onClick={() => setTransfer({ ...transfer, pick: u, err: "" })}
                  >
                    <b>{u.name || u.lexgoId}</b>
                    <small>{[roleName(u.role), u.lexgoId].filter(Boolean).join(" · ")}</small>
                  </button>
                </li>
              ))}
              {transfer.loading && !transfer.results.length ? <li className="supmodal__none">{t("operatorsLoading")}</li> : null}
              {!transfer.loading && !transfer.results.length ? <li className="supmodal__none">{t("operatorNone")}</li> : null}
            </ul>
            <label className="supmodal__field">
              <span>{t("reason")}</span>
              <textarea
                value={transfer.reason}
                onChange={(e) => setTransfer({ ...transfer, reason: e.target.value, err: "" })}
                rows={3}
                placeholder={t("reasonPh")}
                data-ai-id={aiId("call_center.support.ticket", aiTicket, "transfer-modal", "reason")}
                data-ai-label={t("reason")}
              />
            </label>
            {transfer.err ? <p className="supchat__err" role="alert">{transfer.err}</p> : null}
            <div className="supmodal__acts">
              <button type="button" className="btn btn--line" onClick={() => setTransfer(null)}>
                {t("cancel")}
              </button>
              <button
                type="button"
                className="btn btn--pri"
                disabled={!transfer.pick || busy}
                onClick={() => void doTransfer()}
                data-ai-id={aiId("call_center.support.ticket", aiTicket, "transfer-modal", "confirm")}
                data-ai-label={t("transferDo")}
              >
                {t("transferDo")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!closing} onClose={() => setClosing(null)} title={t("close")}>
        {closing ? (
          <div className="supmodal" data-ai-id={aiId("call_center.support.ticket", aiTicket, "close-modal")} data-ai-type="modal" data-ai-label={t("close")} data-ai-private>
            <p className="supmodal__note">{t("closeNote")}</p>
            <label className="supmodal__field">
              <span>{t("resolution")}</span>
              <textarea
                value={closing.resolution}
                onChange={(e) => setClosing({ resolution: e.target.value, err: "" })}
                rows={3}
                placeholder={t("resolutionPh")}
                autoFocus
                data-ai-id={aiId("call_center.support.ticket", aiTicket, "close-modal", "resolution")}
                data-ai-label={t("resolution")}
              />
            </label>
            {closing.err ? <p className="supchat__err" role="alert">{closing.err}</p> : null}
            <div className="supmodal__acts">
              <button type="button" className="btn btn--line" onClick={() => setClosing(null)}>
                {t("cancel")}
              </button>
              <button
                type="button"
                className="btn btn--pri"
                disabled={busy || !closing.resolution.trim()}
                onClick={() => void doClose()}
                data-ai-id={aiId("call_center.support.ticket", aiTicket, "close-modal", "confirm")}
                data-ai-label={t("closeDo")}
              >
                {t("closeDo")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
