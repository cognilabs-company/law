"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { leadCategoryLabel } from "@/lib/leadLabels";
import { getCallCenterKanban, moveCallCenterLead, type KanbanColumn } from "@/lib/services/backend";
import { ApiError } from "@/lib/http";
import Select from "@/components/Select";
import { Skeleton } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import { IconRefresh, IconPhone } from "@/components/icons";

type State = { status: "loading" | "ready" | "error" | "forbidden"; columns: KanbanColumn[] };

// T1A-05 call-center lead board (GET /call-center/leads/kanban, PATCH …/move).
// Compact columns with counts; each card moves through a select, which also
// works on phones where drag and drop doesn't. Hidden on 403.
export default function CallCenterBoard() {
  const t = useTranslations("admin.callCenter.board");
  const tq = useTranslations("admin.callCenter.queue");
  const te = useTranslations("enums");
  const tp = useTranslations("admin.pipeline");
  const [state, setState] = useState<State>({ status: "loading", columns: [] });
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(
    () =>
      getCallCenterKanban()
        .then((columns) => setState({ status: "ready", columns }))
        .catch((e) => {
          const forbidden = e instanceof ApiError && (e.status === 403 || e.status === 401);
          setState((s) => ({ status: forbidden ? "forbidden" : "error", columns: s.columns }));
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "forbidden") return null;

  const colTitle = (c: KanbanColumn) => (tq.has(`stages.${c.key}`) ? tq(`stages.${c.key}`) : c.title || c.key);

  // Optimistic: the card moves at once; the board is refetched in the
  // background (the fetch takes seconds) and a rejected move is reverted.
  async function move(leadId: string, key: string) {
    if (busyId || !key) return;
    const before = state.columns;
    const from = before.find((c) => c.cards.some((x) => x.lead.id === leadId));
    const card = from?.cards.find((x) => x.lead.id === leadId);
    if (!from || !card || from.key === key) return;
    setBusyId(leadId);
    setNote(null);
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => {
        if (c.key === from.key) return { ...c, count: Math.max(0, c.count - 1), cards: c.cards.filter((x) => x.lead.id !== leadId) };
        if (c.key === key) return { ...c, count: c.count + 1, cards: [card, ...c.cards] };
        return c;
      }),
    }));
    try {
      await moveCallCenterLead(leadId, key, 0);
      void load();
    } catch (e) {
      setState((s) => ({ ...s, columns: before }));
      setNote({ ok: false, msg: e instanceof ApiError && e.status === 403 ? tq("noPermission") : tq("actionError") });
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <button type="button" className="btn btn--line btn--sm" onClick={() => void load()} aria-label={tq("refresh")}>
          <IconRefresh />
        </button>
      </div>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {state.status === "loading" ? (
        <Skeleton rows={3} />
      ) : state.status === "error" ? (
        <p className="advmuted">{tq("loadError")}</p>
      ) : !state.columns.length ? (
        <p className="advmuted">{t("empty")}</p>
      ) : (
        <div className="ccb">
          {state.columns.map((c) => (
            <div className="ccb__col" key={c.key}>
              <div className="ccb__h">
                <span className="ccb__dot" style={{ background: c.color || "#94a3b8" }} />
                <b>{colTitle(c)}</b>
                <span className="advmuted">{c.count || c.cards.length}</span>
              </div>
              {c.cards.length ? (
                c.cards.map(({ lead }) => (
                  <div className="ccb__card" key={lead.id}>
                    <b>{lead.name || lead.phone || leadCategoryLabel(tp, lead.category) || tp("untitledLead")}</b>
                    <span className="ccb__meta">
                      {[
                        leadCategoryLabel(tp, lead.category),
                        lead.region ? (te.has(`regions.${lead.region}`) ? te(`regions.${lead.region}`) : lead.region) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {lead.phone ? (
                      <a className="ccb__tel" href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>
                        <IconPhone />
                        {lead.phone}
                      </a>
                    ) : null}
                    <Select
                      value=""
                      onChange={(v) => move(lead.id, v)}
                      options={state.columns.filter((o) => o.key !== c.key).map((o) => ({ value: o.key, label: colTitle(o) }))}
                      ariaLabel={tq("moveTo")}
                      placeholder={busyId === lead.id ? tq("working") : tq("moveTo")}
                    />
                  </div>
                ))
              ) : (
                <p className="ccb__none">{t("noneHere")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
