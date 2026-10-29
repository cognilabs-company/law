"use client";

import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Modal from "@/components/admin/Modal";
import { IconAlert, IconArrowDown, IconArrowUp, IconCircleX, IconColumns, IconPhone, IconSend, IconSliders } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { changeLeadStatus, crmCan, crmNextStatuses, getCrmKanban, isVersionConflict, leadCan, moreKanbanLeads, positionIn, reorderCrmLead, KANBAN_PAGE, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { fromLocalInput } from "./LeadSheets";
import { minutesUntil, useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { Avatar, ScoreChip, WhenChip, statusVar, useCrmError, useStatusLabel } from "./bits";
import { CrmDateTime } from "./fields";
import { KanbanColumns } from "./KanbanColumns";
import { StageMenu } from "./StageMenu";
import type { BoardColumn } from "./leadQuery";

// How long the stage's most forgotten lead has sat still (minutes).
function idleOf(c: BoardColumn, now: number): number | null {
  let worst: number | null = null;
  for (const l of c.items) {
    const m = minutesUntil(l.updatedAt || l.createdAt, now);
    if (m === null) continue;
    const idle = -m;
    if (idle > 0 && (worst === null || idle > worst)) worst = idle;
  }
  return worst;
}
function idleText(mins: number, t: (k: string, v?: Record<string, number>) => string): string {
  if (mins >= 1440) return t("idleD", { n: Math.floor(mins / 1440) });
  if (mins >= 60) return t("idleH", { n: Math.floor(mins / 60) });
  return t("idleM", { n: mins });
}

// Realtime events come in bursts (status_changed + assigned + metrics…):
// one board reload per quiet spell, not one per event.
const RELOAD_DEBOUNCE = 350;
// The leads as a board (contract 13cb257 §6): GET /crm/kanban gives the six
// fixed columns with their first cards in the backend's rank order, a
// count and has_more ("load more" pages that one column). Moving a card to
// another column is a status change (POST …/status with its lock_version):
// the card waits in place, marked as moving, and goes over only when the
// backend agrees — a refusal (won without a paid order, a stale version…)
// leaves it where it was and says why. Rejected first asks for a reason.
// Inside a column the order changes at once and is confirmed by the
// backend. Phones use the "move to…" menu instead of dragging.
export function LeadBoard({ meta, mineOnly, q, onClaim, claiming, refreshKey }: { meta: CrmMeta; mineOnly: boolean; q: string; onClaim: (l: CrmLead) => void; claiming: Record<string, string>; refreshKey: number }): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useStatusLabel();
  const router = useRouter();
  const crmErr = useCrmError();
  const now = useNow();
  const [cols, setCols] = useState<BoardColumn[] | null>(null);
  const [failed, setFailed] = useState("");
  const [drag, setDragState] = useState<CrmLead | null>(null);
  // Where the dragged card would land: the column, and the card it would go before (null = the end).
  const [over, setOverState] = useState<{ col: string; before: string | null } | null>(null);
  const overRef = useRef<{ col: string; before: string | null } | null>(null);
  const setOver = useCallback((o: { col: string; before: string | null } | null) => {
    overRef.current = o;
    setOverState((cur) => (cur?.col === o?.col && cur?.before === o?.before ? cur : o));
  }, []);
  const [managing, setManaging] = useState(false);
  // Cards whose status change is waiting for the backend.
  const [moving, setMoving] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState("");
  const [reject, setReject] = useState<CrmLead | null>(null);
  const [stageFor, setStageFor] = useState("");
  const canManage = crmCan(meta, "crm.automation.manage");
  // The same moves without dragging (touch screens have no HTML5 drag).
  const [menuFor, setMenuFor] = useState("");
  const seq = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  // The handlers read the ref: the first dragover can come before React has
  // re-rendered with the state, and a missed preventDefault loses the drop.
  const dragRef = useRef<CrmLead | null>(null);
  const timer = useRef(0);

  // `loud` only for the first paint; a failed background refresh keeps the
  // board as it is (never cleared) instead of toasting on every event.
  const load = useCallback(
    async (signal?: AbortSignal, loud = false) => {
      const n = ++seq.current;
      try {
        const k = await getCrmKanban({ q, mineOnly, columnLimit: KANBAN_PAGE }, signal);
        if (n !== seq.current) return;
        setCols((cur) =>
          k.columns.map((c) => {
            // Keep the extra pages an operator already opened.
            const had = cur?.find((x) => x.status === c.key);
            const extra = had ? had.items.slice(c.items.length).filter((x) => !c.items.some((y) => y.id === x.id) && x.status === c.key) : [];
            return { status: c.key, items: [...c.items, ...extra], total: c.count, hasMore: c.hasMore && c.items.length + extra.length < c.count };
          }),
        );
        setFailed("");
      } catch (e) {
        if (isAborted(e) || n !== seq.current) return;
        logApiError("crm.board", e);
        if (loud) setFailed(crmErr(e));
      }
    },
    [q, mineOnly, crmErr],
  );
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Coalesced refresh; never while a card is in the air (swapping its node
  // mid-drag would cancel the drag), it waits for the drop instead.
  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(function tick() {
      if (dragRef.current) {
        timer.current = window.setTimeout(tick, RELOAD_DEBOUNCE);
        return;
      }
      void loadRef.current();
    }, RELOAD_DEBOUNCE);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal, true), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  // A claim made from a card (the parent owns claiming) refreshes the board.
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== firstKey.current) schedule();
  }, [refreshKey, schedule]);
  // §21: a card another user moved goes to its new column at once; the
  // board is then read again to reconcile with the backend.
  useCrmEvents((ev) => {
    if (ev.leadId && ev.toStatus && !moving[ev.leadId]) setCols((cur) => (cur ? moveLocal(cur, ev.leadId, ev.toStatus, ev.position) : cur));
    if (ev.invalidate.some((k) => k === "all" || k === "lists" || k === "queue" || k === "lead" || k === "counts" || k === "meta")) schedule();
  });

  // The move menu closes on Escape or a press anywhere outside its card.
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && (e.target as Element | null)?.closest?.(`[data-menu-for="${CSS.escape(menuFor)}"]`)) return;
      setMenuFor("");
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menuFor]);

  const say = useCallback((e: unknown) => toast(isVersionConflict(e) ? t("conflict") : crmErr(e), { tone: isVersionConflict(e) ? "info" : "err" }), [crmErr, t]);

  // Another column: a status change, confirmed before the card moves.
  const changeStatus = useCallback(
    async (lead: CrmLead, to: string, reason = "", nextActionAt: string | null = null) => {
      if (moving[lead.id]) return false;
      setMoving((m) => ({ ...m, [lead.id]: to }));
      seq.current++; // a reload in flight must not undo the confirmed move
      try {
        const saved = await changeLeadStatus(lead, to, reason, nextActionAt);
        setCols((cur) => (cur ? moveLocal(cur, saved.id, saved.status, 0, saved) : cur));
        toast(t("moved", { to: ts(saved.status) }), { tone: "ok" });
        return true;
      } catch (e) {
        say(e);
        return false;
      } finally {
        setMoving((m) => {
          const next = { ...m };
          delete next[lead.id];
          return next;
        });
        schedule();
      }
    },
    [moving, say, schedule, t, ts],
  );
  // The same column: a new place, shown at once and confirmed.
  const reorder = useCallback(
    async (lead: CrmLead, before: string | null, after: string | null) => {
      const col = cols?.find((c) => c.status === lead.status);
      if (!col) return;
      const position = positionIn(col.items.map((x) => x.id), lead.id, before, after);
      seq.current++;
      setCols((cur) => (cur ? moveLocal(cur, lead.id, lead.status, position) : cur));
      try {
        const saved = await reorderCrmLead(lead, position);
        setCols((cur) => (cur ? cur.map((c) => ({ ...c, items: c.items.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)) })) : cur));
      } catch (e) {
        say(e);
      } finally {
        schedule();
      }
    },
    [cols, say, schedule],
  );
  const goTo = useCallback(
    (lead: CrmLead, to: string) => {
      if (to === "rejected") setReject(lead);
      else void changeStatus(lead, to);
    },
    [changeStatus],
  );

  const allowed = useCallback((lead: CrmLead | null, to: string) => !!lead && lead.status !== to && leadCan(lead, "change_status") && crmNextStatuses(meta, lead.status).includes(to), [meta]);

  const setDrag = useCallback((l: CrmLead | null) => {
    dragRef.current = l;
    setDragState(l);
  }, []);
  const onCardDragStart = useCallback(
    (l: CrmLead, e: DragEvent) => {
      setMenuFor("");
      setDrag(l);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", l.id);
    },
    [setDrag],
  );
  const onCardDragEnd = useCallback(() => {
    setDrag(null);
    setOver(null);
  }, [setDrag, setOver]);
  const open = useCallback((l: CrmLead) => router.push(`/admin/crm/leads/${encodeURIComponent(l.id)}`), [router]);
  const toggleMenu = useCallback((id: string) => setMenuFor((m) => (m === id ? "" : id)), []);
  // The menu (touch, keyboard): to another column, or one place up / down.
  const pick = useCallback(
    (l: CrmLead, to: string) => {
      setMenuFor("");
      goTo(l, to);
    },
    [goTo],
  );
  const nudge = useCallback(
    (l: CrmLead, dir: -1 | 1) => {
      setMenuFor("");
      const items = cols?.find((c) => c.status === l.status)?.items ?? [];
      const i = items.findIndex((x) => x.id === l.id);
      const rest = items.filter((x) => x.id !== l.id);
      const j = Math.max(0, Math.min(rest.length, i + dir));
      void reorder(l, rest[j]?.id ?? null, rest[j - 1]?.id ?? null);
    },
    [cols, reorder],
  );
  const more = async (status: string) => {
    const col = cols?.find((c) => c.status === status);
    if (!col || loadingMore) return;
    setLoadingMore(status);
    try {
      const page = await moreKanbanLeads(status, col.items.length, { q, mineOnly });
      setCols((cur) =>
        cur
          ? cur.map((c) => {
              if (c.status !== status) return c;
              const items = [...c.items, ...page.items.filter((x) => !c.items.some((y) => y.id === x.id))];
              return { ...c, items, total: page.total || c.total, hasMore: items.length < (page.total || c.total) && page.items.length > 0 };
            })
          : cur,
      );
    } catch (e) {
      if (!isAborted(e)) toast(crmErr(e), { tone: "err" });
    } finally {
      setLoadingMore("");
    }
  };

  if (!cols) {
    if (failed)
      return (
        <div className="crm-card crm-err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{failed}</span>
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => void load(undefined, true)}>
            {t("retry")}
          </button>
        </div>
      );
    return (
      <div className="crm-board" aria-busy="true">
        {meta.statuses.map((s) => (
          <div key={s} className="crm-col" style={statusVar(s)}>
            <span className="crm-sk" style={{ height: 22 }} />
            <span className="crm-sk crm-sk--block" style={{ height: 90 }} />
            <span className="crm-sk crm-sk--block" style={{ height: 90 }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="crm-boardbar">
        <p className="crm-hint">{t("hint")}</p>
        {canManage ? (
          <button type="button" className="crm-btn crm-btn--sm" onClick={() => setManaging(true)}>
            <IconColumns aria-hidden="true" />
            {t("manage")}
          </button>
        ) : null}
      </div>
      <div
        ref={boardRef}
        className="crm-board"
        role="list"
        aria-label={t("label")}
        onDragOver={(e) => {
          // Near an edge while dragging: scroll the board toward the hidden columns.
          const el = boardRef.current;
          if (!dragRef.current || !el) return;
          const r = el.getBoundingClientRect();
          const edge = 80;
          if (e.clientX > r.right - edge) el.scrollBy({ left: 24 });
          else if (e.clientX < r.left + edge) el.scrollBy({ left: -24 });
        }}
      >
        {cols.map((c) => {
          const ok = drag ? allowed(drag, c.status) : false;
          const label = ts(c.status);
          return (
            <section
              key={c.status}
              role="listitem"
              className="crm-col"
              style={statusVar(c.status)}
              data-drop={drag ? (ok || drag.status === c.status ? "ok" : "no") : undefined}
              data-over={over?.col === c.status || undefined}
              aria-label={`${label}: ${c.total}`}
              onDragOver={(e) => {
                if (!dragRef.current) return;
                e.preventDefault();
                // Every column takes the drop so a refused move can say why;
                // the dimmed column already shows it is not on the map.
                e.dataTransfer.dropEffect = "move";
                setOver({ col: c.status, before: cardBelow(e.currentTarget, e.clientY, dragRef.current.id) });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null) && overRef.current?.col === c.status) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const lead = dragRef.current;
                const at = overRef.current;
                setDrag(null);
                setOver(null);
                if (!lead || !at) return;
                if (lead.status !== c.status) {
                  if (!allowed(lead, c.status)) toast(t("notAllowed", { from: ts(lead.status), to: label }), { tone: "info" });
                  else goTo(lead, c.status);
                  return;
                }
                const rest = c.items.filter((x) => x.id !== lead.id);
                const bi = at.before ? rest.findIndex((x) => x.id === at.before) : rest.length;
                const after = rest[bi - 1]?.id ?? null;
                // Dropped where it already was: nothing to do.
                const i = c.items.findIndex((x) => x.id === lead.id);
                if (c.items[i + 1]?.id === (at.before ?? undefined) || (!at.before && i === c.items.length - 1)) return;
                void reorder(lead, at.before, after);
              }}
            >
              <header className="crm-col__h">
                <i aria-hidden="true" />
                <b>{label}</b>
                <em>{c.total}</em>
                {idleOf(c, now) ? (
                  <span className="crm-col__idle" title={t("idleTitle")} data-tone={idleOf(c, now)! >= 2880 ? "hot" : idleOf(c, now)! >= 480 ? "warn" : undefined}>
                    {idleText(idleOf(c, now)!, t)}
                  </span>
                ) : null}
                {canManage ? (
                  <button type="button" className="crm-col__cog" aria-label={t("stageSettings")} aria-expanded={stageFor === c.status} onClick={() => setStageFor(stageFor === c.status ? "" : c.status)}>
                    <IconSliders aria-hidden="true" />
                  </button>
                ) : null}
                {stageFor && stageFor === c.status ? <StageMenu meta={meta} status={c.status} onClose={() => setStageFor("")} /> : null}
              </header>
              <div className="crm-col__body">
                {c.items.length ? (
                  c.items.map((l) => (
                    <BoardSlot key={l.id} line={over?.col === c.status && over.before === l.id}>
                      <BoardCard
                        key={l.id}
                        lead={l}
                        meta={meta}
                        now={now}
                        dragging={drag?.id === l.id}
                        movingTo={moving[l.id] ? ts(moving[l.id]) : ""}
                        menuOpen={menuFor === l.id}
                        claimState={claiming[l.id] ?? ""}
                        onDragStart={onCardDragStart}
                        onDragEnd={onCardDragEnd}
                        onOpen={open}
                        onToggleMenu={toggleMenu}
                        onPick={pick}
                        onNudge={nudge}
                        onClaim={onClaim}
                      />
                    </BoardSlot>
                  ))
                ) : (
                  <p className="crm-col__empty">{t("empty")}</p>
                )}
                {over?.col === c.status && over.before === null && c.items.length ? <span className="crm-dropline" aria-hidden="true" /> : null}
                {c.hasMore ? (
                  <button type="button" className="crm-btn crm-btn--sm crm-col__more" onClick={() => void more(c.status)} disabled={!!loadingMore} aria-busy={loadingMore === c.status || undefined}>
                    {t("loadMore", { n: Math.max(0, c.total - c.items.length) })}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {managing ? <KanbanColumns meta={meta} counts={Object.fromEntries(cols.map((c) => [c.status, c.total]))} onClose={() => setManaging(false)} /> : null}
      {reject ? (
        <RejectSheet
          lead={reject}
          onClose={() => setReject(null)}
          onSend={async (reason, next) => {
            const ok = await changeStatus(reject, "rejected", reason, next);
            if (ok) setReject(null);
          }}
        />
      ) : null}
    </>
  );
}

// Rejected needs a reason (§6); the next step is optional.
function RejectSheet({ lead, onClose, onSend }: { lead: CrmLead; onClose: () => void; onSend: (reason: string, next: string | null) => Promise<void> }): ReactElement {
  const t = useTranslations("crm.board");
  const [reason, setReason] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const bad = reason.trim().length < 3;
  const send = async () => {
    setTried(true);
    if (bad || busy) return;
    setBusy(true);
    try {
      await onSend(reason.trim(), next ? fromLocalInput(next) : null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("rejectTitle", { lead: lead.title || lead.workId })}
      description={t("rejectLead")}
      icon={<IconCircleX />}
      busy={busy}
      dirty={!!reason}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--danger" onClick={() => void send()} disabled={busy} aria-busy={busy || undefined}>
            <IconCircleX aria-hidden="true" />
            {t("rejectOk")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <label className="crm-field" data-bad={tried && bad ? "" : undefined}>
          <span>{t("rejectReason")}</span>
          <textarea className="crm-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} aria-invalid={tried && bad ? true : undefined} />
          {tried && bad ? <small className="crm-bad">{t("rejectNeed")}</small> : null}
        </label>
        <div className="crm-field">
          <span>{t("rejectNext")}</span>
          <CrmDateTime value={next} onChange={setNext} label={t("rejectNext")} />
        </div>
      </div>
    </Modal>
  );
}

// One card. Memoized: a drag or a menu re-renders the board, and only the
// cards whose props changed should repaint (up to 30 a column).
const BoardCard = memo(function BoardCard({
  lead: l,
  meta,
  now,
  dragging,
  movingTo,
  menuOpen,
  claimState,
  onDragStart,
  onDragEnd,
  onOpen,
  onToggleMenu,
  onPick,
  onNudge,
  onClaim,
}: {
  lead: CrmLead;
  meta: CrmMeta;
  now: number;
  dragging: boolean;
  movingTo: string;
  menuOpen: boolean;
  claimState: string;
  onDragStart: (l: CrmLead, e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: (l: CrmLead) => void;
  onToggleMenu: (id: string) => void;
  onPick: (l: CrmLead, to: string) => void;
  onNudge: (l: CrmLead, dir: -1 | 1) => void;
  onClaim: (l: CrmLead) => void;
}): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useStatusLabel();
  const tl = useTranslations("crm.leads");
  const movable = leadCan(l, "change_status") || leadCan(l, "move");
  const nextOnes = movable ? crmNextStatuses(meta, l.status) : [];
  const canMove = movable && !movingTo;
  return (
    <article
      className="crm-kcard"
      data-urgency={l.urgency || "normal"}
      data-dragging={dragging || undefined}
      data-moving={movingTo ? "" : undefined}
      aria-busy={movingTo ? true : undefined}
      data-menu-for={l.id}
      data-card-id={l.id}
      draggable={canMove}
      onDragStart={(e) => onDragStart(l, e)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(l)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(l);
      }}
      tabIndex={0}
      aria-label={`${l.title || l.workId} · ${l.customer?.name ?? ""}`}
    >
      <span className="crm-kcard__top">
        <span className="crm-code">{l.workId}</span>
        <ScoreChip score={l.score} />
      </span>
      <b>{l.title || l.workId}</b>
      <small>{[l.customer?.name, l.region].filter(Boolean).join(" · ")}</small>
      {movingTo ? (
        <span className="crm-kcard__moving" role="status">
          {t("movingTo", { to: movingTo })}
        </span>
      ) : null}
      <span className="crm-kcard__foot">
        {l.nextActionAt ? (
          <WhenChip at={l.nextActionAt} now={now} />
        ) : l.customer?.phone || l.customer?.telegram ? (
          // No next action yet: how to reach the customer instead of a dash.
          <a
            className="crm-kcard__reach"
            href={l.customer.phone ? `tel:${l.customer.phone.replace(/[^\d+]/g, "")}` : `https://t.me/${l.customer.telegram.replace(/^@/, "")}`}
            target={l.customer.phone ? undefined : "_blank"}
            rel={l.customer.phone ? undefined : "noopener noreferrer"}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            draggable={false}
          >
            {l.customer.phone ? <IconPhone aria-hidden="true" /> : <IconSend aria-hidden="true" />}
            <span dir="ltr">{l.customer.phone || l.customer.telegram}</span>
          </a>
        ) : (
          <span className="crm-muted">—</span>
        )}
        {l.operator ? (
          <Avatar name={l.operator.name} title={l.operator.name} />
        ) : leadCan(l, "claim") ? (
          <button
            type="button"
            className="crm-btn crm-btn--pri crm-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onClaim(l);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            disabled={!!claimState}
            aria-busy={claimState === "hold" || undefined}
          >
            {claimState === "done" ? tl("claimDone") : tl("claim")}
          </button>
        ) : (
          <Avatar name="" title={tl("unassigned")} />
        )}
      </span>
      {canMove ? (
        <span className="crm-kcard__move">
          <button
            type="button"
            className="crm-link"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(l.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {t("moveTo")}
          </button>
          {menuOpen ? (
            <span className="crm-kcard__menu" role="group" aria-label={t("moveTo")}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNudge(l, -1);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <IconArrowUp aria-hidden="true" />
                {t("up")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNudge(l, 1);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <IconArrowDown aria-hidden="true" />
                {t("down")}
              </button>
              {nextOnes.map((s) => (
                <button
                  key={s}
                  type="button"
                  style={statusVar(s)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPick(l, s);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <i aria-hidden="true" />
                  {ts(s)}
                </button>
              ))}
            </span>
          ) : null}
        </span>
      ) : null}
      {l.duplicateStatus === "needs_review" ? (
        <span className="crm-kcard__dup" title={t("dup")}>
          <IconAlert aria-hidden="true" />
          {t("dup")}
        </span>
      ) : null}
    </article>
  );
});

// The card the pointer is above (the dragged card itself skipped): the drop
// goes before it; past the last card it goes to the end (null).
function cardBelow(col: HTMLElement, y: number, dragId: string): string | null {
  for (const el of col.querySelectorAll<HTMLElement>("[data-card-id]")) {
    if (el.dataset.cardId === dragId) continue;
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) return el.dataset.cardId ?? null;
  }
  return null;
}

// A card to `col` at `position` (0 = the top), out of every other column;
// `saved` replaces it with the backend's copy. Totals follow.
export function moveLocal(cols: BoardColumn[], leadId: string, col: string, position: number, saved?: CrmLead): BoardColumn[] {
  const lead = saved ?? cols.flatMap((c) => c.items).find((x) => x.id === leadId);
  if (!lead || !cols.some((c) => c.status === col)) return cols;
  const moved = { ...lead, status: col };
  return cols.map((c) => {
    const had = c.items.some((x) => x.id === leadId);
    const items = c.items.filter((x) => x.id !== leadId);
    if (c.status !== col) return had ? { ...c, items, total: Math.max(0, c.total - 1) } : c;
    items.splice(Math.max(0, Math.min(items.length, position)), 0, moved);
    return { ...c, items, total: c.total + (had ? 0 : 1) };
  });
}

// A slot around a card: the drop line shows above it while hovering there.
function BoardSlot({ line, children }: { line: boolean; children: ReactElement }): ReactElement {
  return (
    <>
      {line ? <span className="crm-dropline" aria-hidden="true" /> : null}
      {children}
    </>
  );
}
