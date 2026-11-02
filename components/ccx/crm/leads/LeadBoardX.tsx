"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { useCrmEvents, useNow } from "@/lib/crm/useCrm";
import { changeLeadStatus, crmNextStatuses, getCrmKanban, isVersionConflict, KANBAN_PAGE, leadCan, moreKanbanLeads, positionIn, reorderCrmLead, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import type { BoardColumn } from "@/components/crm/leadQuery";
import { IcRefresh } from "../../icons";
import { leadHref } from "../nav";
import { LeadCard } from "./LeadCard";
import RejectSheet from "./RejectSheet";
import { cardBelow, idleOf, moveLocal, stageStyle, useCrmErr, useStageLabel } from "./util";

const RELOAD_DEBOUNCE = 350;

type Over = { col: string; before: string | null };

type Props = { meta: CrmMeta; mineOnly: boolean; q: string; focus: string; onClaim: (l: CrmLead) => void; claiming: Record<string, string>; refreshKey: number };

export default function LeadBoardX({ meta, mineOnly, q, focus, onClaim, claiming, refreshKey }: Props) {
  const t = useTranslations("crm.board");
  const tx = useTranslations("admin.ccx.crmLeads");
  const label = useStageLabel(meta);
  const router = useRouter();
  const crmErr = useCrmErr();
  const now = useNow();
  const [cols, setCols] = useState<BoardColumn[] | null>(null);
  const [failed, setFailed] = useState("");
  const [drag, setDragState] = useState<CrmLead | null>(null);
  const [over, setOverState] = useState<Over | null>(null);
  const overRef = useRef<Over | null>(null);
  const [moving, setMoving] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState("");
  const [reject, setReject] = useState<CrmLead | null>(null);
  const [menuFor, setMenuFor] = useState("");
  const seq = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CrmLead | null>(null);
  const timer = useRef(0);
  const focused = useRef(false);

  const setOver = useCallback((o: Over | null) => {
    overRef.current = o;
    setOverState((cur) => (cur?.col === o?.col && cur?.before === o?.before ? cur : o));
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal, loud = false) => {
      const n = ++seq.current;
      try {
        const k = await getCrmKanban({ q, mineOnly, columnLimit: KANBAN_PAGE }, signal);
        if (n !== seq.current) return;
        setCols((cur) =>
          k.columns.map((c) => {
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

  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== firstKey.current) schedule();
  }, [refreshKey, schedule]);

  useEffect(() => {
    if (!cols || !focus || focused.current) return;
    focused.current = true;
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-col="${CSS.escape(focus)}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [cols, focus]);

  useCrmEvents((ev) => {
    if (ev.leadId && ev.toStatus && !moving[ev.leadId]) setCols((cur) => (cur ? moveLocal(cur, ev.leadId, ev.toStatus, ev.position) : cur));
    if (ev.invalidate.some((k) => k === "all" || k === "lists" || k === "queue" || k === "lead" || k === "counts" || k === "meta")) schedule();
  });

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

  const changeStatus = useCallback(
    async (lead: CrmLead, to: string, reason = "", nextActionAt: string | null = null) => {
      if (moving[lead.id]) return false;
      setMoving((m) => ({ ...m, [lead.id]: to }));
      seq.current++;
      try {
        const saved = await changeLeadStatus(lead, to, reason, nextActionAt);
        setCols((cur) => (cur ? moveLocal(cur, saved.id, saved.status, 0, saved) : cur));
        toast(t("moved", { to: label(saved.status) }), { tone: "ok" });
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
    [moving, say, schedule, t, label],
  );

  const reorder = useCallback(
    async (lead: CrmLead, before: string | null, after: string | null) => {
      const col = cols?.find((c) => c.status === lead.status);
      if (!col) return;
      const position = positionIn(
        col.items.map((x) => x.id),
        lead.id,
        before,
        after,
      );
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

  const allowed = (lead: CrmLead | null, to: string) => !!lead && lead.status !== to && leadCan(lead, "change_status") && crmNextStatuses(meta, lead.status).includes(to);

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
  const open = useCallback((l: CrmLead) => router.push(leadHref(l.id)), [router]);
  const onMenu = useCallback((id: string) => setMenuFor((m) => (id && m === id ? "" : id)), []);
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

  const idleText = (m: number) => (m >= 1440 ? t("idleD", { n: Math.floor(m / 1440) }) : m >= 60 ? t("idleH", { n: Math.floor(m / 60) }) : t("idleM", { n: m }));

  if (!cols) {
    if (failed) {
      return (
        <p className="opx-ld-warn" role="alert">
          {failed}
          <button type="button" onClick={() => void load(undefined, true)}>
            <IcRefresh size={15} />
            {t("retry")}
          </button>
        </p>
      );
    }
    return (
      <div className="opx-ld-board" aria-busy="true" aria-label={t("label")}>
        {meta.statuses.map((s) => (
          <div key={s} className="opx-ld-col is-sk" style={stageStyle(s)}>
            <i className="opx-shim opx-ld-sk-h" />
            <i className="opx-shim opx-ld-sk-c" />
            <i className="opx-shim opx-ld-sk-c" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div
        ref={boardRef}
        className="opx-ld-board"
        role="list"
        aria-label={t("label")}
        data-dragging={drag ? "" : undefined}
        onDragOver={(e) => {
          const el = boardRef.current;
          if (!dragRef.current || !el) return;
          const r = el.getBoundingClientRect();
          const edge = 80;
          if (e.clientX > r.right - edge) el.scrollBy({ left: 24 });
          else if (e.clientX < r.left + edge) el.scrollBy({ left: -24 });
        }}
      >
        {cols.map((c, ci) => {
          const ok = drag ? allowed(drag, c.status) : false;
          const name = label(c.status);
          const idle = idleOf(c, now);
          return (
            <section
              key={c.status}
              role="listitem"
              className="opx-ld-col"
              style={{ ...stageStyle(c.status), animationDelay: `${ci * 45}ms` }}
              data-col={c.status}
              data-focus={focus === c.status || undefined}
              data-drop={drag ? (ok || drag.status === c.status ? "ok" : "no") : undefined}
              data-over={over?.col === c.status || undefined}
              aria-label={`${name}: ${c.total}`}
              onDragOver={(e) => {
                if (!dragRef.current) return;
                e.preventDefault();
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
                  if (!allowed(lead, c.status)) toast(t("notAllowed", { from: label(lead.status), to: name }), { tone: "info" });
                  else goTo(lead, c.status);
                  return;
                }
                const rest = c.items.filter((x) => x.id !== lead.id);
                const bi = at.before ? rest.findIndex((x) => x.id === at.before) : rest.length;
                const after = rest[bi - 1]?.id ?? null;
                const i = c.items.findIndex((x) => x.id === lead.id);
                if (c.items[i + 1]?.id === (at.before ?? undefined) || (!at.before && i === c.items.length - 1)) return;
                void reorder(lead, at.before, after);
              }}
            >
              <header className="opx-ld-col__head">
                <span className="opx-ld-col__name">
                  <b>{name}</b>
                  <em className="opx-num">{c.total}</em>
                </span>
                {tx.has(`stage.${c.status}`) ? <small>{tx(`stage.${c.status}`)}</small> : null}
                {idle ? (
                  <span className="opx-ld-col__idle opx-num" title={t("idleTitle")} data-tone={idle >= 2880 ? "hot" : idle >= 480 ? "warn" : undefined}>
                    {idleText(idle)}
                  </span>
                ) : null}
              </header>
              <div className="opx-ld-col__body">
                {c.items.length ? (
                  c.items.map((l) => (
                    <div key={l.id} className="opx-ld-slot">
                      {over?.col === c.status && over.before === l.id ? <span className="opx-ld-drop" aria-hidden="true" /> : null}
                      <LeadCard
                        lead={l}
                        meta={meta}
                        now={now}
                        stageLabel={label}
                        dragging={drag?.id === l.id}
                        movingTo={moving[l.id] ? label(moving[l.id]) : ""}
                        menuOpen={menuFor === l.id}
                        claimState={claiming[l.id] ?? ""}
                        onDragStart={onCardDragStart}
                        onDragEnd={onCardDragEnd}
                        onOpen={open}
                        onMenu={onMenu}
                        onPick={pick}
                        onNudge={nudge}
                        onClaim={onClaim}
                      />
                    </div>
                  ))
                ) : (
                  <p className="opx-ld-col__empty">{t("empty")}</p>
                )}
                {over?.col === c.status && over.before === null && c.items.length ? <span className="opx-ld-drop" aria-hidden="true" /> : null}
                {c.hasMore ? (
                  <button type="button" className="opx-ld-col__more" onClick={() => void more(c.status)} disabled={!!loadingMore} aria-busy={loadingMore === c.status || undefined}>
                    {t("loadMore", { n: Math.max(0, c.total - c.items.length) })}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
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
