"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
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
import { queryOf, type Filters, type Tab } from "./leadQuery";

const PER_COLUMN = 30;
type Column = { status: string; items: CrmLead[]; total: number };

// The same leads as a board, one column per status, each column its own
// backend page (status filter + the tab and filters above). A card moves
// only along the backend's transition map and only when the lead allows
// change_status; dropping it opens the usual reason / next-action sheet,
// which sends the card's lock_version like every other write.
export function LeadBoard({ meta, tab, filters, onClaim, claiming }: { meta: CrmMeta; tab: Tab; filters: Filters; onClaim: (l: CrmLead) => void; claiming: Record<string, string> }): ReactElement {
  const t = useTranslations("crm.board");
  const ts = useTranslations("crm.status");
  const tl = useTranslations("crm.leads");
  const router = useRouter();
  const crmErr = useCrmError();
  const now = useNow();
  const [cols, setCols] = useState<Column[] | null>(null);
  const [drag, setDragState] = useState<CrmLead | null>(null);
  // The handlers read the ref: the first dragover can come before React has
  // re-rendered with the state, and a missed preventDefault loses the drop.
  const dragRef = useRef<CrmLead | null>(null);
  const setDrag = (l: CrmLead | null) => {
    dragRef.current = l;
    setDragState(l);
  };
  const [over, setOver] = useState("");
  const [move, setMove] = useState<{ lead: CrmLead; to: string } | null>(null);
  // The same moves without dragging (touch screens have no HTML5 drag).
  const [menuFor, setMenuFor] = useState("");
  const seq = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const statuses = meta.statuses.length ? meta.statuses : Object.keys(meta.transitions);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const n = ++seq.current;
      try {
        const pages = await Promise.all(statuses.map((s) => listCrmLeads({ ...queryOf(tab, { ...filters, status: s }, 0, Date.now()), limit: PER_COLUMN }, signal)));
        if (n !== seq.current) return;
        setCols(statuses.map((s, i) => ({ status: s, items: pages[i].items, total: pages[i].total })));
      } catch (e) {
        if (isAborted(e) || n !== seq.current) return;
        logApiError("crm.board", e);
        toast(crmErr(e), { tone: "err" });
        setCols((cur) => cur ?? statuses.map((s) => ({ status: s, items: [], total: 0 })));
      }
    },
    // statuses is derived from meta, which is stable for the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, filters, crmErr, meta],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  useCrmEvents((ev) => {
    if (ev.invalidate.some((k) => k === "all" || k === "lists" || k === "queue" || k === "lead" || k === "counts")) void load();
  });

  // The sheet's write: the dragged card's own lock version; a conflict or a
  // lost race refetches the board instead of guessing.
  const write: LeadWrite = async (run, okText) => {
    if (!move) return false;
    try {
      await run(move.lead);
      if (okText) toast(okText, { tone: "ok" });
      void load();
      return true;
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
      if (isVersionConflict(e)) {
        // Retry against the fresh lead (its new lock_version), sheet kept open.
        const fresh = await getCrmLead(move.lead.id).catch(() => null);
        if (fresh) setMove((m) => (m ? { ...m, lead: fresh } : m));
        void load();
      } else if (isClaimRace(e)) void load();
      return false;
    }
  };

  const allowed = (lead: CrmLead | null, to: string) => !!lead && lead.status !== to && leadCan(lead, "change_status") && crmNextStatuses(meta, lead.status).includes(to);

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
          return (
            <section
              key={c.status}
              role="listitem"
              className="crm-col"
              style={statusVar(c.status)}
              data-drop={drag ? (ok ? "ok" : drag.status === c.status ? "self" : "no") : undefined}
              data-over={over === c.status || undefined}
              aria-label={`${ts.has(c.status) ? ts(c.status) : c.status}: ${c.total}`}
              onDragOver={(e) => {
                if (!dragRef.current) return;
                e.preventDefault();
                // Every column takes the drop so a refused move can say why;
                // the dimmed column already shows it is not on the map.
                e.dataTransfer.dropEffect = "move";
                setOver(c.status);
              }}
              onDragLeave={() => setOver((o) => (o === c.status ? "" : o))}
              onDrop={(e) => {
                e.preventDefault();
                const lead = dragRef.current;
                setDrag(null);
                setOver("");
                if (!lead || lead.status === c.status) return;
                if (!allowed(lead, c.status)) {
                  toast(t("notAllowed", { from: ts.has(lead.status) ? ts(lead.status) : lead.status, to: ts.has(c.status) ? ts(c.status) : c.status }), { tone: "info" });
                  return;
                }
                setMove({ lead, to: c.status });
              }}
            >
              <header className="crm-col__h">
                <i aria-hidden="true" />
                <b>{ts.has(c.status) ? ts(c.status) : c.status}</b>
                <em>{c.total}</em>
              </header>
              <div className="crm-col__body">
                {c.items.length ? (
                  c.items.map((l) => {
                    const nextOnes = leadCan(l, "change_status") ? crmNextStatuses(meta, l.status) : [];
                    const canMove = nextOnes.length > 0;
                    return (
                      <article
                        key={l.id}
                        className="crm-kcard"
                        data-urgency={l.urgency || "normal"}
                        data-dragging={drag?.id === l.id || undefined}
                        draggable={canMove}
                        onDragStart={(e) => {
                          setDrag(l);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", l.id);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver("");
                        }}
                        onClick={() => router.push(`/admin/crm/leads/${encodeURIComponent(l.id)}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") router.push(`/admin/crm/leads/${encodeURIComponent(l.id)}`);
                        }}
                        tabIndex={0}
                        aria-label={`${l.title || l.workId} · ${l.customer?.name ?? ""}`}
                      >
                        <span className="crm-kcard__top">
                          <span className="crm-code">{l.workId}</span>
                          <ScoreChip score={l.score} />
                        </span>
                        <b>{l.title || l.workId}</b>
                        <small>{[l.customer?.name, l.category].filter(Boolean).join(" · ")}</small>
                        <span className="crm-kcard__foot">
                          {l.nextActionAt ? <WhenChip at={l.nextActionAt} now={now} /> : <span className="crm-muted">—</span>}
                          {l.operator ? <Avatar name={l.operator.name} title={l.operator.name} /> : leadCan(l, "claim") ? (
                            <button
                              type="button"
                              className="crm-btn crm-btn--pri crm-btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClaim(l);
                              }}
                              disabled={!!claiming[l.id]}
                              aria-busy={claiming[l.id] === "hold" || undefined}
                            >
                              {tl("claim")}
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
                              aria-expanded={menuFor === l.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuFor((m) => (m === l.id ? "" : l.id));
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              {t("moveTo")}
                            </button>
                            {menuFor === l.id ? (
                              <span className="crm-kcard__menu" role="group" aria-label={t("moveTo")}>
                                {nextOnes.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    style={statusVar(s)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuFor("");
                                      setMove({ lead: l, to: s });
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
                  })
                ) : (
                  <p className="crm-col__empty">{t("empty")}</p>
                )}
                {c.total > c.items.length ? (
                  <button type="button" className="crm-link crm-col__more" onClick={() => router.push(`/admin/crm/leads?tab=${tab}&status=${c.status}&view=table`)}>
                    {t("more", { n: c.total - c.items.length })}
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {move ? <StatusSheet lead={move.lead} to={move.to} write={write} onClose={() => setMove(null)} /> : null}
    </>
  );
}
