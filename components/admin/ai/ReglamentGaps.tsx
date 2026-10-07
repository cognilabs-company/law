"use client";

import FilterBar from "@/components/filters/FilterBar";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { aiId } from "@/lib/ai/ids";
import { isForbidden, parseServerTime } from "@/lib/http";
import { isOpenGap, type GapFilter, type ReglamentGap } from "@/lib/services/aiReglaments";
import { LoadFailed, MissingState, useRgl } from "./bits";
import type { Phase } from "./ReglamentList";
import { IconChat, IconCircleCheck, IconClock, IconFlag, IconHelpCircle, IconInbox, IconLightbulb, IconPlus, IconSearch, IconUser } from "@/components/icons";

const shortId = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);

export default function ReglamentGaps({
  phase,
  items,
  error,
  busy,
  filter,
  onFilter,
  q,
  onQ,
  added,
  canAdd,
  onAdd,
  onRetry,
}: {
  phase: Phase;
  items: ReglamentGap[];
  error: unknown;
  busy: boolean;
  filter: GapFilter;
  onFilter: (v: GapFilter) => void;
  q: string;
  onQ: (v: string) => void;
  added: string[];
  canAdd: boolean;
  onAdd: (g: ReglamentGap) => void;
  onRetry: () => void;
}) {
  const { t, role, gapStatus, when } = useRgl();

  if (phase === "loading") return <Skeleton rows={4} />;
  if (phase === "missing") return <MissingState onRecheck={onRetry} busy={busy} />;
  if (phase === "error") return <LoadFailed forbidden={isForbidden(error)} onRetry={onRetry} busy={busy} />;

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items
    .filter((g) => {
      if (!terms.length) return true;
      const hay = [g.question, g.userName, g.userPhone, g.sessionId, g.reason, ...g.missing].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.count - a.count || (parseServerTime(b.lastAskedAt) || 0) - (parseServerTime(a.lastAskedAt) || 0));

  const bar = (
    <FilterBar
      className="uf--tray rglf"
      fields={[
        {
          key: "status",
          label: t("filter.status"),
          icon: IconFlag,
          value: filter,
          empty: "open",
          onChange: (v) => onFilter(v === "all" ? "all" : "open"),
          options: [
            { value: "open", label: t("filter.open") },
            { value: "all", label: t("filter.all") },
          ],
          aiId: "admin.ai-reglaments.gaps.filters.status",
        },
      ]}
      search={{ value: q, onChange: onQ, placeholder: t("filter.gapsPh"), label: t("filter.search"), aiId: "admin.ai-reglaments.gaps.search.input", aiTarget: "ai-reglaments:gaps-search" }}
      count={shown.length}
      aiId="admin.ai-reglaments.gaps.filters"
      aiTarget="ai-reglaments:gaps-filters"
      aiLabel={t("filter.title")}
    />
  );

  if (!items.length) {
    return (
      <>
        {bar}
        <EmptyState icon={filter === "open" ? <IconCircleCheck /> : <IconInbox />} title={filter === "open" ? t("empty.gaps") : t("empty.gapsAll")} text={t("empty.gapsText")} />
      </>
    );
  }

  return (
    <>
      {bar}
      {!shown.length ? (
        <EmptyState icon={<IconSearch />} title={t("empty.gapsNoResults")} text={t("empty.noResultsText")} />
      ) : (
        <>
          <p className="rgl-sorted">
            <IconLightbulb aria-hidden />
            {t("gaps.sorted")}
          </p>
          <ul className="rgl-gaps" data-ai-id="admin.ai-reglaments.gaps.list" data-ai-type="list" data-ai-target="ai-reglaments:gaps" data-ai-label={t("gaps.title")}>
            {shown.map((g) => {
              const done = added.includes(g.key);
              const open = isOpenGap(g);
              const who = [g.role ? role(g.role) : "", g.userName].filter(Boolean).join(" · ");
              const why = [g.reason, ...g.missing].filter(Boolean).join("; ");
              return (
                <li
                  key={g.key}
                  className={`rgl-gap${done ? " is-done" : ""}${open ? "" : " is-closed"}`}
                  data-ai-id={aiId("admin.ai-reglaments.gaps.item", g.id || g.key)}
                  data-ai-type="list_item"
                  data-ai-entity-type="ai_support_reglament_gap"
                  data-ai-entity-id={g.id || undefined}
                  data-ai-label={g.question.slice(0, 80)}
                >
                  <span className="rgl-gap__ico" aria-hidden>
                    {done || !open ? <IconCircleCheck /> : <IconHelpCircle />}
                  </span>
                  <div className="rgl-gap__body">
                    <p className="rgl-gap__q">{g.question}</p>
                    <div className="rgl-gap__meta">
                      <span className="rgl-gap__count">
                        <IconFlag aria-hidden />
                        {t("gaps.asked", { n: g.count })}
                      </span>
                      {g.lastAskedAt ? (
                        <span>
                          <IconClock aria-hidden />
                          {t("gaps.last", { date: when(g.lastAskedAt) })}
                        </span>
                      ) : null}
                      {who ? (
                        <span>
                          <IconUser aria-hidden />
                          {who}
                        </span>
                      ) : null}
                      {g.sessionId ? (
                        <span title={g.sessionId}>
                          <IconChat aria-hidden />
                          {t("gaps.session", { id: shortId(g.sessionId) })}
                        </span>
                      ) : null}
                      {!open ? <span className="rgl-st rgl-st--archived">{gapStatus(g.status)}</span> : null}
                      {done ? (
                        <span className="rgl-st rgl-st--active">
                          <IconCircleCheck aria-hidden />
                          {t("gaps.added")}
                        </span>
                      ) : null}
                    </div>
                    {why ? (
                      <p className="rgl-gap__why">
                        <b>{t("gaps.why")}</b> {why}
                      </p>
                    ) : null}
                  </div>
                  {canAdd ? (
                    <div className="rgl-gap__act">
                      <button
                        type="button"
                        className={`btn btn--sm ${done ? "btn--line" : "btn--soft"}`}
                        onClick={() => onAdd(g)}
                        data-ai-id={aiId("admin.ai-reglaments.gaps.item", g.id || g.key, "add")}
                      >
                        <IconPlus aria-hidden />
                        {done ? t("gaps.addMore") : t("gaps.add")}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
