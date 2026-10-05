"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { usePaged } from "@/lib/usePaged";
import { isConflict, isRouteMissing } from "@/lib/http";
import { errorText } from "@/lib/errorText";
import { toast } from "@/lib/toast";
import { usePoll, useSupportEvents } from "@/lib/useSupportEvents";
import { searchUsers, type UserSearchResult } from "@/lib/services/backend";
import {
  claimSupportTicket,
  closeSupportTicket,
  getSupportTicket,
  listSupportQueue,
  transferSupportTicket,
  type SupportTicket,
} from "@/lib/services/support";
import { shortDateTime } from "@/lib/date";
import Modal from "@/components/admin/Modal";
import { IconChevronLeft, IconHeadset, IconRefresh, IconSearch } from "@/components/icons";
import SupportChat from "./SupportChat";
import { SupportStatus, TicketCard } from "./bits";

type Tab = "new" | "mine" | "transferred" | "closed";
const TABS: Tab[] = ["new", "mine", "transferred", "closed"];
const QUERY: Record<Tab, { status?: string; assignedToMe?: boolean }> = {
  new: { status: "waiting_operator" },
  mine: { assignedToMe: true },
  transferred: { status: "transferred" },
  closed: { status: "closed" },
};

export default function SupportQueue({ ticketId }: { ticketId?: string }) {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { session } = useAuth();
  const meId = session?.id ?? "";
  const [tab, setTab] = useState<Tab>(ticketId ? "mine" : "new");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [selectedId, setSelectedId] = useState(ticketId ?? "");
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<{ q: string; results: UserSearchResult[]; pick: UserSearchResult | null; reason: string; err: string } | null>(null);
  const [closing, setClosing] = useState<{ resolution: string; err: string } | null>(null);
  const searchSeq = useRef(0);

  const fetcher = useCallback((o: number, l: number, s: AbortSignal) => listSupportQueue({ ...QUERY[tab], offset: o, limit: l }, s), [tab]);
  const list = usePaged(fetcher, tab, 50, (x) => x.id);
  const setItems = list.setItems;
  const missing = list.status === "error" && isRouteMissing(list.error);
  const current = useMemo(() => list.items.find((x) => x.id === selectedId) ?? (selected && selected.id === selectedId ? selected : null), [list.items, selected, selectedId]);

  useEffect(() => {
    if (!selectedId || list.status !== "ready" || list.items.some((x) => x.id === selectedId)) return;
    const c = new AbortController();
    getSupportTicket(selectedId, c.signal)
      .then((tk) => {
        if (tk && !c.signal.aborted) setSelected(tk);
      })
      .catch(() => {});
    return () => c.abort();
  }, [selectedId, list.status, list.items]);

  const patch = useCallback(
    (tk: SupportTicket) => {
      setItems((cur) => cur.map((x) => (x.id === tk.id ? { ...x, ...tk } : x)));
      setSelected((s) => (s && s.id === tk.id ? { ...s, ...tk } : s));
    },
    [setItems],
  );

  useSupportEvents((e) => {
    if (e.kind === "message" && e.message) {
      const m = e.message;
      list.setItems((cur) => cur.map((x) => (x.id === e.ticketId ? { ...x, lastMessage: m.content || x.lastMessage, updatedAt: m.createdAt || x.updatedAt } : x)));
      return;
    }
    if (e.ticket) patch(e.ticket);
    if (e.kind === "transferred" && e.ticketId === selectedId && e.ticket && e.ticket.operatorUserId !== meId) toast(t("transferredAway"));
    list.refresh();
  }, list.refresh);
  usePoll(list.refresh, 30000, list.status === "ready");

  const open = (tk: SupportTicket) => {
    setSelected(tk);
    setSelectedId(tk.id);
    router.replace(`/admin/call-center/support/${encodeURIComponent(tk.id)}` as Parameters<typeof router.replace>[0], { scroll: false });
  };
  const back = () => {
    setSelectedId("");
    router.replace("/admin/call-center/support" as Parameters<typeof router.replace>[0], { scroll: false });
  };

  const claim = async (tk: SupportTicket) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await claimSupportTicket(tk.id);
      patch({ ...next, operatorUserId: next.operatorUserId || meId, status: next.status || "claimed" });
      toast(t("claimedOk"), { tone: "ok" });
      list.refresh();
    } catch (e) {
      if (isConflict(e)) {
        toast(t("claimTaken"), { tone: "err" });
        list.refresh();
      } else toast(errorText(e, tc), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const transferQ = transfer?.q ?? "";
  useEffect(() => {
    if (transferQ.trim().length < 2) return;
    const my = ++searchSeq.current;
    const id = window.setTimeout(() => {
      searchUsers(transferQ, { role: "call_center", limit: 10 })
        .then((results) => {
          if (my === searchSeq.current) setTransfer((x) => (x ? { ...x, results: results.filter((r) => r.id && r.id !== meId) } : x));
        })
        .catch(() => {});
    }, 450);
    return () => window.clearTimeout(id);
  }, [transferQ, meId]);

  const doTransfer = async () => {
    if (!current || !transfer?.pick || busy) return;
    if (!transfer.reason.trim()) {
      setTransfer({ ...transfer, err: t("reasonRequired") });
      return;
    }
    setBusy(true);
    try {
      const next = await transferSupportTicket(current.id, transfer.pick.id, transfer.reason.trim());
      patch({ ...next, status: next.status || "transferred" });
      setTransfer(null);
      toast(t("transferOk", { name: transfer.pick.name || transfer.pick.phone }), { tone: "ok" });
      list.refresh();
    } catch (e) {
      setTransfer((x) => (x ? { ...x, err: errorText(e, tc) } : x));
      if (isConflict(e)) list.refresh();
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
    setBusy(true);
    try {
      const next = await closeSupportTicket(current.id, closing.resolution.trim());
      patch({ ...next, status: next.status || "closed", resolution: next.resolution || closing.resolution.trim() });
      setClosing(null);
      toast(t("closedOk"), { tone: "ok" });
      list.refresh();
    } catch (e) {
      setClosing((x) => (x ? { ...x, err: errorText(e, tc) } : x));
      if (isConflict(e)) list.refresh();
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

  const mine = Boolean(current && current.operatorUserId && current.operatorUserId === meId);
  const open_ = Boolean(current && current.status !== "closed");
  const claimable = Boolean(current && open_ && !mine && (!current.operatorUserId || current.status === "waiting_operator" || current.status === "reopened"));

  return (
    <div className={`sup sup--queue${selectedId ? " sup--chat" : ""}`}>
      <section className="sup__side">
        <div className="sup__head">
          <div>
            <h2>{t("queueTitle")}</h2>
            <p>{t("queueLead")}</p>
          </div>
          <button type="button" className="btn btn--line btn--sm" onClick={list.refresh} aria-label={tc("retry")}>
            <IconRefresh />
          </button>
        </div>
        <div className="suptabs" role="tablist">
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className="suptab" onClick={() => setTab(k)}>
              {t(`tabs.${k}`)}
            </button>
          ))}
        </div>
        <div className="sup__list" data-ai-target="support:ticket-list">
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
            <div className="sup__empty">
              <IconHeadset />
              <p>{t("queueEmpty")}</p>
            </div>
          ) : (
            list.items.map((tk) => (
              <TicketCard
                key={tk.id}
                ticket={tk}
                active={tk.id === selectedId}
                showClient
                onOpen={() => open(tk)}
                extra={
                  tab === "new" && tk.status !== "closed" ? (
                    <button type="button" className="btn btn--pri btn--sm supcard__claim" disabled={busy} onClick={() => void claim(tk)}>
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
      </section>

      <section className="sup__main">
        {current ? (
          <>
            <button type="button" className="sup__back" onClick={back}>
              <IconChevronLeft />
              {t("back")}
            </button>
            <div className="supop">
              <dl className="supop__facts">
                <div>
                  <dt>{t("client")}</dt>
                  <dd>{current.clientName || "—"}</dd>
                </div>
                <div>
                  <dt>{t("priority")}</dt>
                  <dd>{t.has(`priorities.${current.priority}`) ? t(`priorities.${current.priority}`) : current.priority}</dd>
                </div>
                <div>
                  <dt>{t("createdAt")}</dt>
                  <dd>{current.createdAt ? shortDateTime(current.createdAt, locale) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("statusLabel")}</dt>
                  <dd>
                    <SupportStatus status={current.status} />
                  </dd>
                </div>
              </dl>
              <div className="supop__acts">
                {claimable ? (
                  <button type="button" className="btn btn--pri btn--sm" disabled={busy} onClick={() => void claim(current)}>
                    {t("claim")}
                  </button>
                ) : null}
                {mine && open_ ? (
                  <>
                    <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => setTransfer({ q: "", results: [], pick: null, reason: "", err: "" })}>
                      {t("transfer")}
                    </button>
                    <button type="button" className="btn btn--line btn--sm supop__close" disabled={busy} onClick={() => setClosing({ resolution: "", err: "" })}>
                      {t("close")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <SupportChat key={current.id} ticket={current} meId={meId} mode="operator" canWrite={mine && open_} readOnlyNote={t("readOnly")} onTicket={patch} />
          </>
        ) : (
          <div className="sup__pick">
            <IconHeadset />
            <p>{t("pickTicket")}</p>
          </div>
        )}
      </section>

      <Modal open={!!transfer} onClose={() => setTransfer(null)} title={t("transfer")}>
        {transfer ? (
          <div className="supmodal">
            <label className="supmodal__search">
              <IconSearch />
              <input value={transfer.q} onChange={(e) => setTransfer({ ...transfer, q: e.target.value, err: "" })} placeholder={t("operatorSearch")} aria-label={t("operatorSearch")} autoFocus />
            </label>
            <ul className="supmodal__list" role="listbox" aria-label={t("operator")}>
              {transfer.results.map((u) => (
                <li key={u.id}>
                  <button type="button" role="option" aria-selected={transfer.pick?.id === u.id} className={transfer.pick?.id === u.id ? "is-on" : undefined} onClick={() => setTransfer({ ...transfer, pick: u, err: "" })}>
                    <b>{u.name || u.phone}</b>
                    <small>{[u.lexgoId, u.phone].filter(Boolean).join(" · ")}</small>
                  </button>
                </li>
              ))}
              {transfer.q.trim().length >= 2 && !transfer.results.length ? <li className="supmodal__none">{t("operatorNone")}</li> : null}
            </ul>
            <label className="supmodal__field">
              <span>{t("reason")}</span>
              <textarea value={transfer.reason} onChange={(e) => setTransfer({ ...transfer, reason: e.target.value, err: "" })} rows={3} placeholder={t("reasonPh")} />
            </label>
            {transfer.err ? <p className="supchat__err" role="alert">{transfer.err}</p> : null}
            <div className="supmodal__acts">
              <button type="button" className="btn btn--line" onClick={() => setTransfer(null)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn btn--pri" disabled={!transfer.pick || busy} onClick={() => void doTransfer()}>
                {t("transferDo")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!closing} onClose={() => setClosing(null)} title={t("close")}>
        {closing ? (
          <div className="supmodal">
            <p className="supmodal__note">{t("closeNote")}</p>
            <label className="supmodal__field">
              <span>{t("resolution")}</span>
              <textarea value={closing.resolution} onChange={(e) => setClosing({ resolution: e.target.value, err: "" })} rows={3} placeholder={t("resolutionPh")} autoFocus />
            </label>
            {closing.err ? <p className="supchat__err" role="alert">{closing.err}</p> : null}
            <div className="supmodal__acts">
              <button type="button" className="btn btn--line" onClick={() => setClosing(null)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn btn--pri" disabled={busy || !closing.resolution.trim()} onClick={() => void doClose()}>
                {t("closeDo")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
