"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ChartGanttIcon } from "lucide-react";
import { aiId } from "@/lib/ai/ids";
import { enterStyle } from "../hooks";
import { ActivityIcon, CheckIcon, SaveIcon, TimerIcon, glyph } from "../icons";
import { useStudioLabels } from "../useStudioLabels";
import { Avatar, useMonFormat } from "./bits";
import { hm, type MonAxis, type MonPerson } from "./model";

const AI = "admin.studio.monitoring.users";

export type LanesProps = {
  axis: MonAxis | null;
  people: readonly MonPerson[];
  selected: string;
  onSelect: (id: string) => void;
  showShort: boolean;
  now: number;
  loading: boolean;
};

export function Lanes({ axis, people, selected, onSelect, showShort, now, loading }: LanesProps): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const fmt = useMonFormat();
  const unknown = t("monitoring.unknownUser");
  const span = axis ? axis.to - axis.from : 1;
  const pos = (ms: number) => (axis ? Math.min(100, Math.max(0, ((ms - axis.from) / span) * 100)) : 0);
  const labelEvery = axis && axis.ticks.length > 5 ? 2 : 1;
  const nowAt = axis && now >= axis.from && now <= axis.to ? pos(now) : null;

  return (
    <section className="sx-mon-card sx-mon-lanes" data-ai-id={AI} data-ai-type="section" data-ai-label={t("sx.mon.lanes.title")}>
      <header className="sx-mon-card__head">
        <span className="sx-mon-sq" data-hue="violet" aria-hidden="true">
          {glyph(ChartGanttIcon, { size: 18 })}
        </span>
        <div className="sx-mon-card__titles">
          <h2 className="sx-mon-card__title">{t("sx.mon.lanes.title")}</h2>
          <p className="sx-mon-card__lead">{t("sx.mon.lanes.lead")}</p>
        </div>
      </header>
      {loading ? (
        <div className="sx-mon-lanes__sk" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="sx-sk" />
          ))}
        </div>
      ) : !people.length ? (
        <p className="sx-mon-muted">{t("sx.mon.lanes.none")}</p>
      ) : (
        <div className="sx-mon-lanes__body">
          {axis ? (
            <div className="sx-mon-lanes__axis" aria-hidden="true">
              <span />
              <span className="sx-mon-lanes__ticks">
                {axis.ticks.map((k, i) =>
                  i % labelEvery && i !== axis.ticks.length - 1 ? null : (
                    <i key={k.at} style={{ left: `${pos(k.at)}%` }} data-edge={i === 0 ? "start" : i === axis.ticks.length - 1 ? "end" : undefined}>
                      {k.label}
                    </i>
                  ),
                )}
              </span>
              <span />
            </div>
          ) : null}
          <ul className="sx-mon-lanes__list">
            {people.map((p, i) => {
              const name = p.name || unknown;
              const on = selected === p.id;
              const segs = p.list.filter((s) => showShort || !s.short);
              return (
                <li key={p.id} className="sx-enter" style={enterStyle(Math.min(i, 12))}>
                  <button
                    type="button"
                    className="sx-mon-lane"
                    data-sel={on ? "" : undefined}
                    data-dim={selected && !on ? "" : undefined}
                    aria-pressed={on}
                    onClick={() => onSelect(on ? "" : p.id)}
                    title={on ? t("sx.mon.lanes.clear") : t("sx.mon.lanes.pick", { name })}
                    data-ai-id={aiId(AI, "row", p.id)}
                    data-ai-type="button"
                    data-ai-label={name}
                  >
                    <span className="sx-mon-lane__who">
                      <Avatar name={name} seed={p.id} live={p.live} />
                      <span className="sx-mon-lane__name">
                        <b>{name}</b>
                        <small data-live={p.live ? "" : undefined}>{p.live ? t("monitoring.online") : p.lastSeen ? fmt.ago(p.lastSeen, now) : t("monitoring.offline")}</small>
                      </span>
                      {on ? <span className="sx-mon-lane__check">{glyph(CheckIcon, { size: 14 })}</span> : null}
                    </span>
                    <span className="sx-mon-lane__track" aria-hidden="true">
                      {axis?.ticks.map((k) => <i key={k.at} className="sx-mon-lane__grid" style={{ left: `${pos(k.at)}%` }} />)}
                      {nowAt !== null ? <i className="sx-mon-lane__now" style={{ left: `${nowAt}%` }} /> : null}
                      {axis
                        ? segs.map((s) => {
                            if (!Number.isFinite(s.start)) return null;
                            const l = pos(s.start);
                            const w = Math.max(0.5, pos(Number.isFinite(s.end) ? s.end : s.start) - l);
                            return (
                              <b
                                key={s.key}
                                className="sx-mon-lane__seg"
                                data-live={s.live ? "" : undefined}
                                data-short={s.short ? "" : undefined}
                                style={{ left: `${l}%`, width: `${w}%` }}
                                title={`${hm(s.start)}–${s.live ? t("monitoring.now") : hm(s.end)} · ${s.a.constructorCode ? labels.ctorName(s.a.constructorCode) : t("sx.mon.studio")}${s.a.objectName ? ` · ${s.a.objectName}` : ""}`}
                              />
                            );
                          })
                        : null}
                    </span>
                    <span className="sx-mon-lane__stats">
                      <span title={t("monitoring.col.time")}>
                        {glyph(TimerIcon, { size: 14 })}
                        <b className="sx-num">{fmt.dur(p.sec)}</b>
                      </span>
                      <span title={t("monitoring.col.sessions")}>
                        {glyph(ActivityIcon, { size: 14 })}
                        <b className="sx-num">{labels.num(p.sessions)}</b>
                      </span>
                      <span title={t("monitoring.col.saves")}>
                        {glyph(SaveIcon, { size: 14 })}
                        <b className="sx-num">{labels.num(p.saves)}</b>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
