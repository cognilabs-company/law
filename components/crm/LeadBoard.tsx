"use client";

import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type ReactElement } from "react";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { IconAlert, IconArrowDown, IconArrowUp, IconColumns, IconPhone, IconSend, IconSliders } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { columnOrder, crmNextStatuses, isVersionConflict, leadCan, listCrmLeads, moveCrmLead, positionIn, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { minutesUntil, useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { Avatar, ScoreChip, WhenChip, statusVar, useCrmError, useStatusLabel } from "./bits";
import { KanbanColumns } from "./KanbanColumns";
import { StageMenu } from "./StageMenu";
import { queryOf, type BoardColumn, type Filters, type Tab } from "./leadQuery";

const PER_COLUMN = 30;

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
// The same leads as a board (dynamic kanban contract 2026-10-28): the
// columns, their order and colours are the backend's; each column is its
// own backend page in Kanban order (status filter + the tab and filters
// above). A card can be dropped at an exact place in the same or another
// column — PATCH …/move sets column and position at once with the card's
// lock_version; a version conflict puts it back and reloads.
export function LeadBoard({ meta, tab, filters, onClaim, claiming, refreshKey, onShowAll }: { meta: CrmMeta; tab: Tab; filters: Filters; onClaim: (l: CrmLead) => void; claiming: Record<string, string>; refreshKey: number; onShowAll: (status: string) => void }): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useStatusLabel();
  const router = useRouter();
  const crmErr = useCrmError();
  const now = useNow();
  const [cols, setCols] = useState<BoardColumn[] | null>(null);
  const [drag, setDragState] = useState<CrmLead | null>(null);
  // Where the dragged card would land: the column, and the card it would go before (null = the end).
  const [over, setOverState] = useState<{ col: string; before: string | null } | null>(null);
  const overRef = useRef<{ col: string; before: string | null } | null>(null);
  const setOver = useCallback((o: { col: string; before: string | null } | null) => {
    overRef.current = o;
    setOverState((cur) => (cur?.col === o?.col && cur?.before === o?.before ? cur : o));
  }, []);
  const [managing, setManaging] = useState(false);
  const [stageFor, setStageFor] = useState("");
  const { session } = useAuth();
  // Column management needs leads.manage (the backend still has the last word).
  const perms = session?.permissions ?? [];
  const canManage = session?.backendRole === "superadmin" || perms.includes("*") || perms.includes("leads.manage");
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

  // A move: the card goes to its new place at once, the backend confirms
  // with its copy and position; a conflict or failure reloads the board.
  const moveTo = useCallback(
    async (lead: CrmLead, col: string, before: string | null, after: string | null) => {
      seq.current++; // a reload in flight would put the card back
      setCols((cur) => (cur ? placeAt(cur, lead, col, before) : cur));
      try {
        const order = await columnOrder(col);
        const { lead: saved } = await moveCrmLead(lead, col, positionIn(order, lead.id, before, after));
        setCols((cur) => (cur ? cur.map((c) => ({ ...c, items: c.items.map((x) => (x.id === saved.id ? { ...x, ...saved } : x)) })) : cur));
      } catch (e) {
        toast(isVersionConflict(e) ? t("conflict") : crmErr(e), { tone: isVersionConflict(e) ? "info" : "err" });
      }
      schedule();
    },
    [crmErr, schedule, t],
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
  // The menu (touch, keyboard): to the top of another column, or one place up / down.
  const pick = useCallback(
    (l: CrmLead, to: string) => {
      setMenuFor("");
      const col = cols?.find((c) => c.status === to);
      void moveTo(l, to, col?.items.find((x) => x.id !== l.id)?.id ?? null, null);
    },
    [cols, moveTo],
  );
  const nudge = useCallback(
    (l: CrmLead, dir: -1 | 1) => {
      setMenuFor("");
      const items = cols?.find((c) => c.status === l.status)?.items ?? [];
      const i = items.findIndex((x) => x.id === l.id);
      const rest = items.filter((x) => x.id !== l.id);
      const j = Math.max(0, Math.min(rest.length, i + dir));
      void moveTo(l, l.status, rest[j]?.id ?? null, rest[j - 1]?.id ?? null);
    },
    [cols, moveTo],
  );

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
                if (lead.status !== c.status && !allowed(lead, c.status)) {
                  toast(t("notAllowed", { from: ts(lead.status), to: label }), { tone: "info" });
                  return;
                }
                const rest = c.items.filter((x) => x.id !== lead.id);
                const bi = at.before ? rest.findIndex((x) => x.id === at.before) : rest.length;
                const after = rest[bi - 1]?.id ?? null;
                // Dropped where it already was: nothing to do.
                if (lead.status === c.status) {
                  const i = c.items.findIndex((x) => x.id === lead.id);
                  if (c.items[i + 1]?.id === (at.before ?? undefined) || (!at.before && i === c.items.length - 1)) return;
                }
                void moveTo(lead, c.status, at.before, after);
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
                {stageFor && stageFor === c.status ? (
                  <StageMenu meta={meta} status={c.status} counts={Object.fromEntries(cols.map((x) => [x.status, x.total]))} onClose={() => setStageFor("")} />
                ) : null}
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
      {managing ? <KanbanColumns meta={meta} counts={Object.fromEntries(cols.map((c) => [c.status, c.total]))} onClose={() => setManaging(false)} /> : null}
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
  onNudge,
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
  onNudge: (l: CrmLead, dir: -1 | 1) => void;
  onClaim: (l: CrmLead) => void;
}): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useStatusLabel();
  const tl = useTranslations("crm.leads");
  const movable = leadCan(l, "change_status") || leadCan(l, "move");
  const nextOnes = movable ? crmNextStatuses(meta, l.status) : [];
  const canMove = movable;
  return (
    <article
      className="crm-kcard"
      data-urgency={l.urgency || "normal"}
      data-dragging={dragging || undefined}
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

// The card in its new column right away, before `before` (or at the end).
function placeAt(cols: BoardColumn[], lead: CrmLead, col: string, before: string | null): BoardColumn[] {
  const moved = { ...lead, status: col };
  return cols.map((c) => {
    const had = c.items.some((x) => x.id === lead.id);
    const items = c.items.filter((x) => x.id !== lead.id);
    if (c.status !== col) return had ? { ...c, items, total: Math.max(0, c.total - 1) } : c;
    const i = before ? items.findIndex((x) => x.id === before) : -1;
    items.splice(i < 0 ? items.length : i, 0, moved);
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
