"use client";

import "../panel/panel.css";
import "./support.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { usePaged, type Page } from "@/lib/usePaged";
import { isConflict, isForbidden, isRouteMissing } from "@/lib/http";
import { notify } from "@/lib/toast";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { useAiReveal } from "@/lib/guide/targets";
import { aiId, aiSeg } from "@/lib/ai/ids";
import { useAiField, useAiModal, useAiSelection } from "@/lib/ai/registry";
import {
  claimSupportTicket,
  closeSupportTicket,
  isActiveTicket,
  isSupportSupervisor,
  isWaitingTicket,
  listSupportQueue,
  normSupportTicket,
  transferSupportTicket,
  type SupportEventKind,
  type SupportOperator,
  type SupportTicket,
} from "@/lib/services/support";
import { getAssistContext, type AssistCapabilities, type AssistContext } from "@/lib/services/supportAssist";
import { useMinuteNow } from "@/components/support/bits";
import { IcRefresh, IcSearch, IcSupport, IcUser } from "../icons";
import { IcLock } from "./icons";
import Desk, { type Side } from "./Desk";
import TicketList from "./TicketList";
import { CloseSheet, TransferSheet } from "./Sheets";
import { useTabCounts } from "./useTabCounts";
import { EMPTY_PAGE, MINE_TABS, NEW_STATUSES, TABS, aiNorm, asTab, belongs, matches, nextCaps, oldest, pastLoaded, queryOf, sortTickets, type Caps, type Order, type Tab } from "./model";

const ASSIST_RELOAD = new Set<SupportEventKind>(["assist", "transferred", "closed", "reopened"]);
const ASSIST_PREVIEW = "support.assist_subscription_preview_created";
const OWN_ACT_MS = 5000;
const NARROW = "(max-width: 960px)";
const SIDE_NARROW = "(max-width: 1319px)";

type SheetKind = "" | "transfer" | "close";

function Gate({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <section className="opx-sx-gate" role="status">
      <span className="opx-sx-gate__ic" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

export default function CcxSupport() {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const tn = useTranslations("common.notify");
  const tx = useTranslations("admin.ccx.support");
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const now = useMinuteNow();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const urlTicket = params.get("ticket") ?? "";
  const [tab, setTab] = useState<Tab>(urlTicket ? "mine" : "new");
  const [onlyMine, setOnlyMine] = useState(false);
  const [query, setQuery] = useState("");
  const [orderPick, setOrderPick] = useState<{ tab: Tab; order: Order } | null>(null);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [selectedId, setSelectedId] = useState(urlTicket);
  const [seenUrl, setSeenUrl] = useState(urlTicket);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>("");
  const [side, setSide] = useState<Side>("details");
  const [assistFor, setAssistFor] = useState("");
  const [info, setInfo] = useState(false);
  const [assistKey, setAssistKey] = useState(0);
  const [missingId, setMissingId] = useState("");
  const [caps, setCaps] = useState<Caps | null>(null);
  const [ctxLoad, setCtxLoad] = useState<{ ticketId: string; ctx: AssistContext } | null>(null);
  const [countKey, setCountKey] = useState(0);
  const counted = useRef(new Set<string>());
  const acted = useRef({ ticketId: "", at: 0 });
  const claiming = useRef("");
  const again = useRef<(tk: SupportTicket) => void>(() => undefined);
  const tabsBox = useRef<HTMLDivElement>(null);

  if (seenUrl !== urlTicket) {
    setSeenUrl(urlTicket);
    if (urlTicket !== selectedId) {
      setSelectedId(urlTicket);
      setSide("details");
      setInfo(false);
    }
  }

  const mineFilter = onlyMine && MINE_TABS.includes(tab);
  const fetcher = useCallback(
    async (o: number, l: number, s: AbortSignal): Promise<Page<SupportTicket>> => {
      if (tab !== "new") return listSupportQueue({ ...queryOf(tab, mineFilter), offset: o, limit: l }, s);
      const pages = await Promise.all(
        NEW_STATUSES.map((status, i) =>
          i === 0 ? listSupportQueue({ status, offset: o, limit: l }, s) : listSupportQueue({ status, offset: o, limit: l }, s).catch(() => EMPTY_PAGE),
        ),
      );
      const seen = new Set<string>();
      const items = pages
        .flatMap((p) => p.items)
        .filter((x) => {
          if (seen.has(x.id)) return false;
          seen.add(x.id);
          return true;
        })
        .sort(oldest);
      return { items, total: pages.reduce((n, p) => n + p.total, 0), hasMore: pages.some((p) => p.hasMore) };
    },
    [tab, mineFilter],
  );
  const list = usePaged(fetcher, `${tab}|${mineFilter ? 1 : 0}`, 50, (x) => x.id, 100);
  const { setItems, refresh, hasMore } = list;
  const gateMissing = list.status === "error" && isRouteMissing(list.error);
  const gateForbidden = list.status === "error" && isForbidden(list.error);
  const counts = useTabCounts(!gateMissing && !gateForbidden, countKey);
  const placeholder = useMemo(() => (selectedId ? normSupportTicket({ id: selectedId, status: "" }) : null), [selectedId]);
  const current = list.items.find((x) => x.id === selectedId) ?? (selected && selected.id === selectedId ? selected : placeholder);

  const order: Order = orderPick && orderPick.tab === tab ? orderPick.order : tab === "new" ? "old" : "new";
  const searching = Boolean(query.trim());
  const shown = sortTickets(
    tab,
    list.items.filter((x) => matches(x, query)),
    order,
  );

  const curId = current?.id ?? "";
  const known = Boolean(current?.status);
  const mine = Boolean(current && current.operatorUserId && current.operatorUserId === meId);
  const isOpen = Boolean(current && known && isActiveTicket(current));
  const watching = !mine && isOpen && Boolean(current?.operatorUserId) && isSupportSupervisor(session?.backendRole);
  const claimable = Boolean(current && isOpen && !mine && (!current.operatorUserId || isWaitingTicket(current)));
  const ctxOn = Boolean(curId) && isOpen && (mine || watching) && Boolean(current?.operatorUserId) && missingId !== curId;
  const ctx = ctxLoad && ctxLoad.ticketId === curId ? ctxLoad.ctx : null;
  const ticketCaps = caps && curId && caps.id === curId ? caps : null;
  const transferOff = !ticketCaps?.transfer;
  const callOff = !ticketCaps?.call;

  useEffect(() => {
    if (!ctxOn) return;
    const c = new AbortController();
    getAssistContext(curId, c.signal)
      .then((next) => {
        if (c.signal.aborted) return;
        setCtxLoad({ ticketId: curId, ctx: next });
        setCaps((cur) => nextCaps(cur, curId, next.capabilities));
      })
      .catch(() => undefined);
    return () => c.abort();
  }, [ctxOn, curId, assistKey]);

  useEffect(() => {
    const box = tabsBox.current;
    const el = box?.querySelector<HTMLElement>(".opx-sx-tab.is-on");
    if (!box || !el || box.scrollWidth <= box.clientWidth + 1) return;
    const shift = el.getBoundingClientRect().left - box.getBoundingClientRect().left;
    box.scrollLeft += shift - (box.clientWidth - el.offsetWidth) / 2;
  }, [tab, selectedId]);

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
        if (!belongs(tab, next, meId, mineFilter)) return old ? rest : cur;
        if (tab === "new" && !old && hasMore && pastLoaded(next, cur)) return cur;
        return tab === "new" ? [...rest, next].sort(oldest) : [next, ...rest];
      });
      setSelected((s) => {
        if (s && s.id === tk.id) return { ...s, ...tk, unreadCount: fromEvent ? s.unreadCount : tk.unreadCount };
        return !s && tk.id === selectedId ? tk : s;
      });
    },
    [setItems, tab, meId, mineFilter, selectedId, hasMore],
  );

  const resync = () => {
    refresh();
    setCountKey((n) => n + 1);
  };

  const { online } = useSupportEvents((e) => {
    if (e.kind === "claimed" && e.ticketId === claiming.current && e.ticket?.operatorUserId === meId) return;
    const ownAct = e.kind === "assist" && Boolean(meId) && e.operatorUserId === meId && acted.current.ticketId === e.ticketId && Date.now() - acted.current.at < OWN_ACT_MS;
    if (e.ticketId === selectedId && ASSIST_RELOAD.has(e.kind) && e.name !== ASSIST_PREVIEW && !ownAct) setAssistKey((n) => n + 1);
    if (e.kind === "call" || e.kind === "assist") return;
    if (e.kind === "message") {
      const fresh = e.messages.filter((m) => m.id && m.senderUserId && m.senderUserId !== meId && !counted.current.has(m.id));
      for (const m of fresh) counted.current.add(m.id);
      const last = e.messages[e.messages.length - 1];
      const opened = e.ticketId === selectedId;
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
          unreadCount: opened ? 0 : old.unreadCount + fresh.length,
        };
        if (tab === "new") return cur.map((x) => (x.id === e.ticketId ? next : x));
        return [next, ...cur.filter((x) => x.id !== e.ticketId)];
      });
      if (ticket && opened) setSelected((s) => (s && s.id === e.ticketId ? { ...s, ...ticket, unreadCount: 0 } : s));
      if (!e.messages.length && !ticket) refresh();
      return;
    }
    setCountKey((n) => n + 1);
    if (e.ticket) {
      const tk = e.ticket;
      if (e.ticketId === selectedId && current) {
        if (e.kind === "claimed" && tk.operatorUserId && tk.operatorUserId !== meId && current.operatorUserId !== tk.operatorUserId) notify.warning(t("claimTaken"), { id: `sup-claim-${tk.id}` });
        if (e.kind === "transferred" && tk.operatorUserId !== meId && current.operatorUserId === meId) notify.info(t("transferredAway"), { id: `sup-away-${tk.id}` });
      }
      place(tk, true);
      return;
    }
    refresh();
  }, resync);
  usePoll(resync, 30000, list.status === "ready" && (!online || tab === "new" || tab === "transferred"));

  const syncUrl = (id: string) => {
    const qs = new URLSearchParams(params.toString());
    if (id) qs.set("ticket", id);
    else qs.delete("ticket");
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const open = (tk: SupportTicket, sync = true) => {
    setSelected(tk.unreadCount ? { ...tk, unreadCount: 0 } : tk);
    setSelectedId(tk.id);
    setSide("details");
    setInfo(false);
    if (tk.unreadCount) setItems((cur) => cur.map((x) => (x.id === tk.id ? { ...x, unreadCount: 0 } : x)));
    if (sync) syncUrl(tk.id);
  };

  const back = (sync = true) => {
    setSelectedId("");
    setInfo(false);
    if (sync) syncUrl("");
  };

  const showSide = (k: Side) => {
    setSide(k);
    if (k === "assist" && curId) setAssistFor(curId);
  };

  const revealAssist = (id: string) => {
    setSide("assist");
    if (id) setAssistFor(id);
    if (window.matchMedia(SIDE_NARROW).matches) setInfo(true);
  };

  const pickTab = (k: Tab) => {
    setTab(k);
  };

  const markActed = (id: string) => {
    acted.current = { ticketId: id, at: Date.now() };
  };

  const onCaps = (id: string, c: AssistCapabilities) => setCaps((cur) => nextCaps(cur, id, c));

  const ticketBySeg = (seg: string) => list.items.find((x) => aiSeg(x.id) === seg) ?? (current && aiSeg(current.id) === seg ? current : null);
  const focusTicket = (seg: string) => {
    const tk = seg ? ticketBySeg(seg) : (current ?? shown[0] ?? null);
    if (tk && tk.id !== selectedId) open(tk, false);
    return tk;
  };
  const segOf = (id: string) => id.split(".")[3] ?? "";

  useAiReveal("support:ticket-list", () => {
    if (selectedId && window.matchMedia(NARROW).matches) back(false);
  });
  useAiReveal(/^support:(chat|message-input)$/, () => {
    const first = shown[0];
    if (!selectedId && first) open(first, false);
  });
  useAiReveal("support:assist", () => {
    const tk = selectedId ? current : (shown[0] ?? null);
    if (!selectedId && tk) open(tk, false);
    revealAssist(tk?.id ?? "");
  });
  useAiReveal(/^call_center\.support\.(queue|queue\.tabs|queue\.tab\.[a-z]+|ticket\.[^.]+)$/, (id) => {
    const k = /^call_center\.support\.queue\.tab\.([a-z]+)$/.exec(id)?.[1];
    const next = k ? asTab(k) : null;
    if (next) setTab(next);
    if (selectedId && window.matchMedia(NARROW).matches) back(false);
  });
  useAiReveal(/^call_center\.support\.(chat|ticket\.[^.]+\.(messages|message-input|call(\.audio|\.video)?|remote_assist))$/, (id) => {
    focusTicket(id === "call_center.support.chat" ? "" : segOf(id));
    if (/\.(call|remote_assist)(\.|$)/.test(id)) {
      setSide("details");
      if (window.matchMedia(SIDE_NARROW).matches) setInfo(true);
    }
  });
  useAiReveal(/^call_center\.support\.ticket\.[^.]+\.(claim|transfer|close)$/, (id) => {
    focusTicket(segOf(id));
  });
  useAiReveal(/^call_center\.support\.ticket\.[^.]+\.assist(\..+)?$/, (id) => {
    const tk = focusTicket(segOf(id));
    revealAssist(tk?.id ?? "");
  });

  const aiTicket = curId;
  const ownOpen = (tk: SupportTicket | null) => Boolean(tk && tk.status && tk.operatorUserId && tk.operatorUserId === meId && isActiveTicket(tk));
  useAiModal(aiTicket ? aiId("call_center.support.ticket", aiTicket, "transfer-modal") : "", () => {
    if (busy || transferOff || !ownOpen(current)) return;
    setSheet("transfer");
  });
  useAiModal(aiTicket ? aiId("call_center.support.ticket", aiTicket, "close-modal") : "", () => {
    if (busy || !ownOpen(current)) return;
    setSheet("close");
  });
  useAiSelection("support_queue_tab", tab);
  const tabOpts = TABS.map((k) => ({ value: k, label: t(`tabs.${k}`) }));
  useAiField("call_center.support.queue.tabs", {
    get: () => tab,
    set: (raw) => {
      const w = aiNorm(raw);
      const hit = tabOpts.find((o) => o.value === w || aiNorm(o.label) === w) ?? tabOpts.find((o) => w.length >= 3 && aiNorm(o.label).includes(w));
      const next = hit ? asTab(hit.value) : null;
      if (next) pickTab(next);
    },
  });

  const claim = async (tk: SupportTicket) => {
    if (busy) return;
    setBusy(true);
    claiming.current = tk.id;
    try {
      const next = await claimSupportTicket(tk.id);
      const base = next.id ? next : tk;
      const own = { ...base, operatorUserId: next.operatorUserId || meId, status: next.status || "claimed" };
      place(own, false);
      setTab("mine");
      open(own);
      setCountKey((n) => n + 1);
      notify.success(t("claimedOk"), { id: `sup-claim-${tk.id}` });
    } catch (e) {
      if (isConflict(e)) {
        notify.error(t("claimTaken"), { id: `sup-claim-${tk.id}` });
        refresh();
      } else notify.error(t("claimFailed"), { id: `sup-claim-${tk.id}`, error: e, action: { label: tn("retry"), onClick: () => again.current(tk) } });
    } finally {
      claiming.current = "";
      setBusy(false);
    }
  };

  useEffect(() => {
    again.current = (tk) => void claim(tk);
  });

  const doTransfer = async (pick: SupportOperator, reason: string) => {
    if (!current || busy) return;
    const tk = current;
    setBusy(true);
    try {
      const next = await transferSupportTicket(tk.id, pick.id, reason);
      const base = next.id ? next : tk;
      place({ ...base, status: next.status || "transferred", operatorUserId: next.operatorUserId || pick.id, operatorName: next.operatorName || pick.name }, false);
      setSheet("");
      setCountKey((n) => n + 1);
      notify.success(t("transferOk", { name: pick.name || pick.lexgoId }), { id: `sup-transfer-${tk.id}` });
    } catch (e) {
      notify.error(t("transferFailed"), { id: `sup-transfer-${tk.id}`, error: e });
      if (isConflict(e)) refresh();
    } finally {
      setBusy(false);
    }
  };

  const doClose = async (resolution: string) => {
    if (!current || busy) return;
    const tk = current;
    setBusy(true);
    try {
      const next = await closeSupportTicket(tk.id, resolution);
      const base = next.id ? next : tk;
      place({ ...base, status: next.status || "closed", resolution: next.resolution || resolution }, false);
      setSheet("");
      setCountKey((n) => n + 1);
      notify.success(t("closedOk"), { id: `sup-close-${tk.id}` });
    } catch (e) {
      notify.error(t("closeFailed"), { id: `sup-close-${tk.id}`, error: e });
      if (isConflict(e)) refresh();
    } finally {
      setBusy(false);
    }
  };

  if (gateMissing) return <Gate icon={<IcSupport size={30} />} title={tx("title")} text={tc("featureSoon")} />;
  if (gateForbidden) return <Gate icon={<IcLock size={30} />} title={tx("noAccessTitle")} text={tx("noAccessText")} />;

  const total = list.hasMore ? Math.max(list.total, list.items.length) : list.items.length;
  const tabCount = (k: Tab) => (k === tab && list.status === "ready" ? total : counts[k]);
  const closeSheet = () => {
    if (!busy) setSheet("");
  };

  return (
    <div className="opx-sx" data-pane={selectedId ? "conv" : "list"} data-ai-target="callcenter:support">
      <header className="opx-sx-head">
        <h2>{tx("title")}</h2>
        <div className="opx-sx-tabs" ref={tabsBox} role="group" aria-label={t("queue.filter")} data-ai-id="call_center.support.queue.tabs">
          {TABS.map((k) => {
            const n = tabCount(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={tab === k}
                className={`opx-sx-tab${tab === k ? " is-on" : ""}`}
                onClick={() => pickTab(k)}
                data-ai-id={`call_center.support.queue.tab.${k}`}
                data-ai-type="tab"
              >
                <span>{t(`tabs.${k}`)}</span>
                {n ? <b className="opx-num">{n > 99 ? "99+" : n}</b> : null}
              </button>
            );
          })}
        </div>
        <label className="opx-sx-search">
          <IcSearch size={17} />
          <span className="opx-sr">{tx("searchPh")}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx("searchPh")} autoComplete="off" />
        </label>
        {MINE_TABS.includes(tab) ? (
          <button type="button" className={`opx-sx-mine${onlyMine ? " is-on" : ""}`} aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
            <IcUser size={16} />
            {tx("onlyMine")}
          </button>
        ) : null}
        <button type="button" className="opx-sx-sync" onClick={resync} aria-label={t("queue.refresh")} title={t("queue.refresh")}>
          <IcRefresh size={17} />
        </button>
      </header>

      <div className="opx-sx-grid">
        <TicketList
          items={shown}
          status={list.status}
          error={list.error}
          count={searching ? shown.length : total}
          order={order}
          claimTab={tab === "new"}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          searching={searching}
          selectedId={selectedId}
          meId={meId}
          now={now}
          busy={busy}
          onOrder={(o) => setOrderPick({ tab, order: o })}
          onRetry={list.reload}
          onMore={() => void list.loadMore()}
          onOpen={(tk) => open(tk)}
          onClaim={(tk) => void claim(tk)}
        />
        {current ? (
          <Desk
            key={current.id}
            ticket={current}
            meId={meId}
            now={now}
            busy={busy}
            mine={mine}
            isOpen={isOpen}
            claimable={claimable}
            watching={watching}
            transferOff={transferOff}
            callOff={callOff}
            ctx={ctx}
            missing={missingId === current.id}
            assistKey={assistKey}
            side={side}
            assistOn={assistFor === current.id}
            info={info}
            onSide={showSide}
            onInfo={setInfo}
            onClaim={() => void claim(current)}
            onTransfer={() => setSheet("transfer")}
            onClose={() => setSheet("close")}
            onBack={() => back()}
            onTicket={patch}
            onMissing={setMissingId}
            onActed={markActed}
            onCaps={onCaps}
          />
        ) : (
          <section className="opx-sx-col opx-sx-pick">
            <span className="opx-sx-pick__ic" aria-hidden="true">
              <IcSupport size={34} />
            </span>
            {list.status === "ready" && shown.length ? (
              <button type="button" className="opx-pbtn opx-pbtn--main opx-sx-do" onClick={() => open(shown[0])}>
                {tx("openFirst")}
              </button>
            ) : (
              <p>{list.status === "error" ? tx("pickError") : list.status === "ready" ? tx("pickNone") : tx("pick")}</p>
            )}
          </section>
        )}
      </div>

      {sheet === "transfer" && current ? <TransferSheet ticket={current} meId={meId} busy={busy} onCancel={closeSheet} onSubmit={(pick, reason) => void doTransfer(pick, reason)} /> : null}
      {sheet === "close" && current ? <CloseSheet ticket={current} busy={busy} onCancel={closeSheet} onSubmit={(resolution) => void doClose(resolution)} /> : null}
    </div>
  );
}
