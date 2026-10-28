"use client";

import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { IconAlert } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { crmNextStatuses, getCrmLead, isClaimRace, isVersionConflict, leadCan, listCrmLeads, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { Avatar, ScoreChip, WhenChip, statusVar, useCrmError } from "./bits";
import { StatusSheet } from "./LeadSheets";
import type { LeadWrite } from "./CrmLeadPage";
import { placeLead, queryOf, type BoardColumn, type Filters, type Tab } from "./leadQuery";

const PER_COLUMN = 30;
// Realtime events come in bursts (status_changed + assigned + metrics…):
// one board reload per quiet spell, not one per event.
const RELOAD_DEBOUNCE = 350;
// The same leads as a board, one column per status, each column its own
// backend page (status filter + the tab and filters above). A card moves
// only along the backend's transition map and only when the lead allows
// change_status; the move opens the usual reason / next-action sheet,
// which sends the card's lock_version like every other write.
export function LeadBoard({ meta, tab, filters, onClaim, claiming, refreshKey, onShowAll }: { meta: CrmMeta; tab: Tab; filters: Filters; onClaim: (l: CrmLead) => void; claiming: Record<string, string>; refreshKey: number; onShowAll: (status: string) => void }): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useTranslations("crm.status");
  const router = useRouter();
  const crmErr = useCrmError();
  const now = useNow();
  const [cols, setCols] = useState<BoardColumn[] | null>(null);
  const [drag, setDragState] = useState<CrmLead | null>(null);
  const [over, setOver] = useState("");
  const [move, setMove] = useState<{ lead: CrmLead; to: string } | null>(null);
  // The same moves without dragging (touch screens have no HTML5 drag).
  const [menuFor, setMenuFor] = useState("");
  const seq = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  // The handlers read the ref: the first dragover can come before React has
  // re-rendered with the state, and a missed preventDefault loses the drop.
  const dragRef = useRef<CrmLead | null>(null);
  const timer = useRef(0);
  const statuses = meta.statuses.length ? meta.statuses : Object.keys(meta.transitions);
  const statusKey = statuses.join(",");

  // `loud` only for the first paint; a failed background refresh keeps the
  // board as it is instead of toasting on every realtime event.
  const load = useCallback(
    async (signal?: AbortSignal, loud = false) => {
      const n = ++seq.current;
      const list = statusKey.split(",");
      try {
        const pages = await Promise.all(list.map((s) => listCrmLeads({ ...queryOf(tab, { ...filters, status: s }, 0, Date.now()), limit: PER_COLUMN }, signal)));
        if (n !== seq.current) return;
        setCols(list.map((s, i) => ({ status: s, items: pages[i].items, total: pages[i].total })));
      } catch (e) {
        if (isAborted(e) || n !== seq.current) return;
        logApiError("crm.board", e);
        if (loud) toast(crmErr(e), { tone: "err" });
        setCols((cur) => cur ?? list.map((s) => ({ status: s, items: [], total: 0 })));
      }
    },
    [tab, filters, crmErr, statusKey],
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
  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "lists" || k === "queue" || k === "lead" || k === "counts")) schedule();
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

  // The sheet's write: the moving card's own lock version. Success puts the
  // server's copy in its new column at once (so a second move right away
  // carries the new lock); a conflict loads the fresh lead into the open
  // sheet; a lost race refreshes the board.
  const write: LeadWrite = async (run, okText) => {
    if (!move) return false;
    try {
      const saved = await run(move.lead);
      seq.current++; // a reload already in flight would put the card back
      if (saved && typeof saved === "object") setCols((cur) => (cur ? placeLead(cur, saved) : cur));
      if (okText) toast(okText, { tone: "ok" });
      schedule();
      return true;
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      if (isVersionConflict(e)) {
        const fresh = await getCrmLead(move.lead.id).catch(() => null);
        if (fresh) {
          setCols((cur) => (cur ? placeLead(cur, fresh) : cur));
          // Moved elsewhere meanwhile: this move may no longer be on the map.
          if (fresh.status === move.to || !leadCan(fresh, "change_status") || !crmNextStatuses(meta, fresh.status).includes(move.to)) setMove(null);
          else setMove((m) => (m ? { ...m, lead: fresh } : m));
        }
        schedule();
      } else if (isClaimRace(e)) schedule();
      return false;
    }
  };

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
    setOver("");
  }, [setDrag]);
  const open = useCallback((l: CrmLead) => router.push(`/admin/crm/leads/${encodeURIComponent(l.id)}`), [router]);
  const toggleMenu = useCallback((id: string) => setMenuFor((m) => (m === id ? "" : id)), []);
  const pick = useCallback((l: CrmLead, to: string) => {
    setMenuFor("");
    setMove({ lead: l, to });
  }, []);

  if (!cols) {
    return (
      <div className="crm-board" aria-busy="true">
        {statuses.map((s) => (
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
      <p className="crm-hint">{t("hint")}</p>
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
          const label = ts.has(c.status) ? ts(c.status) : c.status;
          return (
            <section
              key={c.status}
              role="listitem"
              className="crm-col"
              style={statusVar(c.status)}
              data-drop={drag ? (ok ? "ok" : drag.status === c.status ? "self" : "no") : undefined}
              data-over={over === c.status || undefined}
              aria-label={`${label}: ${c.total}`}
              onDragOver={(e) => {
                if (!dragRef.current) return;
                e.preventDefault();
                // Every column takes the drop so a refused move can say why;
                // the dimmed column already shows it is not on the map.
                e.dataTransfer.dropEffect = "move";
                if (over !== c.status) setOver(c.status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === c.status ? "" : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const lead = dragRef.current;
                setDrag(null);
                setOver("");
                if (!lead || lead.status === c.status) return;
                if (!allowed(lead, c.status)) {
                  toast(t("notAllowed", { from: ts.has(lead.status) ? ts(lead.status) : lead.status, to: label }), { tone: "info" });
                  return;
                }
                setMove({ lead, to: c.status });
              }}
            >
              <header className="crm-col__h">
                <i aria-hidden="true" />
                <b>{label}</b>
                <em>{c.total}</em>
              </header>
              <div className="crm-col__body">
                {c.items.length ? (
                  c.items.map((l) => (
                    <BoardCard
                      key={l.id}
                      lead={l}
                      meta={meta}
                      now={now}
                      dragging={drag?.id === l.id}
                      menuOpen={menuFor === l.id}
                      claimState={claiming[l.id] ?? ""}
                      onDragStart={onCardDragStart}
                      onDragEnd={onCardDragEnd}
                      onOpen={open}
                      onToggleMenu={toggleMenu}
                      onPick={pick}
                      onClaim={onClaim}
                    />
                  ))
                ) : (
                  <p className="crm-col__empty">{t("empty")}</p>
                )}
                {c.total > c.items.length ? (
                  <button type="button" className="crm-link crm-col__more" onClick={() => onShowAll(c.status)}>
                    {t("more", { n: c.total - c.items.length })}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {move ? <StatusSheet key={`${move.lead.id}:${move.to}`} lead={move.lead} to={move.to} write={write} onClose={() => setMove(null)} /> : null}
    </>
  );
}

// One card. Memoized: a drag or a menu re-renders the board, and only the
// cards whose props changed should repaint (up to 30 a column).
const BoardCard = memo(function BoardCard({
  lead: l,
  meta,
  now,
  dragging,
  menuOpen,
  claimState,
  onDragStart,
  onDragEnd,
  onOpen,
  onToggleMenu,
  onPick,
  onClaim,
}: {
  lead: CrmLead;
  meta: CrmMeta;
  now: number;
  dragging: boolean;
  menuOpen: boolean;
  claimState: string;
  onDragStart: (l: CrmLead, e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: (l: CrmLead) => void;
  onToggleMenu: (id: string) => void;
  onPick: (l: CrmLead, to: string) => void;
  onClaim: (l: CrmLead) => void;
}): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useTranslations("crm.status");
  const tl = useTranslations("crm.leads");
  const nextOnes = leadCan(l, "change_status") ? crmNextStatuses(meta, l.status) : [];
  const canMove = nextOnes.length > 0;
  return (
    <article
      className="crm-kcard"
      data-urgency={l.urgency || "normal"}
      data-dragging={dragging || undefined}
      data-menu-for={l.id}
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
      <span className="crm-kcard__foot">
        {l.nextActionAt ? <WhenChip at={l.nextActionAt} now={now} /> : <span className="crm-muted">—</span>}
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
                  {ts.has(s) ? ts(s) : s}
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
